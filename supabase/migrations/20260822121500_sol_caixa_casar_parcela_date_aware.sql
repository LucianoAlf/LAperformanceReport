-- `sol_caixa_casar_parcela` passa a comparar o comprovante com o valor CERTO PARA A DATA,
-- não com o valor de tabela. Regra confirmada pelo Alf, 2026-08-22.
--
-- O BUG (visto ao vivo nos grupos do financeiro em 21/08): o card da Sol dizia
-- "Valor: R$ 377,00" e na linha seguinte "⚠️ O comprovante (R$ 377,00) difere do valor da
-- parcela" — contradição no mesmo card. Causa: `valor_bate` comparava contra
-- `valor_original`, que é valor de TABELA (todo CG = 447; REGRAS já avisam que só o
-- líquido reflete o contratado). Medido: 722 de 1.040 faturas abertas (69%) têm desconto
-- condicional — CG 96,6%, Recreio 87,7%, Barra 0%.
--
-- A REGRA (do Alf): o desconto condicional é de PONTUALIDADE. Até o vencimento, a pessoa
-- paga o líquido (valor_original − desconto_fixo − desconto_condicional). Passou da data,
-- perde o condicional (o fixo é do contrato e fica) e entra multa/mora. Por isso NÃO dá
-- para comparar só com o líquido: não pegaria os atrasados pagando a menos.
--
-- O QUE MUDA:
--   - `valor` passa a ser o LÍQUIDO (o "valor da parcela" na linguagem do negócio; o de
--     tabela segue disponível em `valor_tabela`);
--   - `valor_apos_vencimento` = valor_original − desconto_fixo (sem multa/mora — a conta
--     de multa é da canônica de inadimplência, não é duplicada aqui);
--   - `atrasada` + `dias_atraso` (hoje BRT × data_vencimento);
--   - `valor_bate` date-aware: casa com o líquido OU com o pós-vencimento, e
--     `valor_bate_como` diz qual foi ('ate_vencimento' | 'apos_vencimento');
--   - a ESCOLHA da fatura candidata também ordena por proximidade ao líquido — antes,
--     um aluno de 2 cursos pagando R$ 348 podia casar com a fatura errada porque a
--     distância era medida contra os R$ 447 de tabela.
--
-- ⚠️ Deliberadamente NÃO recusa lançamento: atrasado pagando o valor de até o vencimento
-- (caso Amaia, 21/08 — a equipe autorizou) vira sinalização, decisão é humana.
-- ⚠️ A conta líquido = original − descontos é a regra documentada (REGRAS §3.6 /
-- CLAUDE.md "valor_original é valor de TABELA"), não regra nova.

create or replace function public.sol_caixa_casar_parcela(
  p_unidade_id uuid,
  p_aluno text,
  p_valor numeric default null::numeric,
  p_competencia text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_in text := unaccent(lower(coalesce(p_aluno,'')));
  v_alu record;
  v_sim numeric;
  v_sim2 numeric;
  v_ambiguo boolean := false;
  v_fat record;
  v_comp text := unaccent(lower(coalesce(p_competencia,'')));
  v_mm int := null;
  v_yyyy int := null;
  v_abertas int := 0;
  v_abertas_mesmo_mes int := 0;
  v_liquido numeric;
  v_pos_venc numeric;
  v_atrasada boolean;
  v_bate_como text;
begin
  if length(btrim(v_in)) < 2 then
    return jsonb_build_object('ok', false, 'motivo', 'sem_nome');
  end if;

  select a.id, a.nome, a.emusys_student_id,
         word_similarity(v_in, unaccent(lower(a.nome_normalizado))) sim
    into v_alu
  from alunos a
  where a.unidade_id = p_unidade_id
    and a.emusys_student_id is not null
    and a.nome_normalizado is not null
    and (a.status ilike 'ativo%' or a.status is null)
  order by word_similarity(v_in, unaccent(lower(a.nome_normalizado))) desc,
           (a.status ilike 'ativo%') desc
  limit 1;

  if v_alu.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'aluno_nao_encontrado');
  end if;
  v_sim := v_alu.sim;

  select word_similarity(v_in, unaccent(lower(a.nome_normalizado)))
    into v_sim2
  from alunos a
  where a.unidade_id = p_unidade_id and a.emusys_student_id is not null
    and a.nome_normalizado is not null and a.id <> v_alu.id
    and (a.status ilike 'ativo%' or a.status is null)
  order by word_similarity(v_in, unaccent(lower(a.nome_normalizado))) desc
  limit 1;
  if v_sim2 is not null and (v_sim - v_sim2) < 0.10 and v_sim2 >= 0.45 then
    v_ambiguo := true;
  end if;

  if v_sim < 0.45 then
    return jsonb_build_object('ok', false, 'motivo', 'aluno_baixa_confianca',
      'confianca_nome', round(v_sim,2));
  end if;

  if v_comp <> '' then
    v_mm := nullif(substring(v_comp from '(0[1-9]|1[0-2])/20\d{2}'),'')::int;
    if v_comp ~ '/20\d{2}' then v_yyyy := substring(v_comp from '/(20\d{2})')::int; end if;
    if v_mm is null then
      v_mm := case
        when v_comp like '%janeiro%' then 1 when v_comp like '%fevereiro%' then 2
        when v_comp like '%marco%' then 3 when v_comp like '%abril%' then 4
        when v_comp like '%maio%' then 5 when v_comp like '%junho%' then 6
        when v_comp like '%julho%' then 7 when v_comp like '%agosto%' then 8
        when v_comp like '%setembro%' then 9 when v_comp like '%outubro%' then 10
        when v_comp like '%novembro%' then 11 when v_comp like '%dezembro%' then 12
        else null end;
    end if;
  end if;

  select count(*) into v_abertas
  from emusys_faturas f
  where f.emusys_student_id = v_alu.emusys_student_id::bigint and f.status='aberta';

  -- Candidata: a distância de valor é medida contra o LÍQUIDO (o que a pessoa realmente
  -- paga), não contra o valor de tabela — senão aluno de 2 cursos casa a fatura errada.
  select f.id, f.descricao, f.data_vencimento, f.competencia, f.valor_original, f.status,
         f.valor_original
           - coalesce((f.payload->>'desconto_fixo')::numeric, 0)
           - coalesce((f.payload->>'desconto_condicional')::numeric, 0) as valor_liquido,
         f.valor_original
           - coalesce((f.payload->>'desconto_fixo')::numeric, 0) as valor_pos_venc
    into v_fat
  from emusys_faturas f
  where f.emusys_student_id = v_alu.emusys_student_id::bigint
    and f.status = 'aberta'
  order by
    (v_mm is not null and extract(month from f.competencia)::int = v_mm
       and (v_yyyy is null or extract(year from f.competencia)::int = v_yyyy)) desc,
    (case when p_valor is not null then
       abs((f.valor_original
              - coalesce((f.payload->>'desconto_fixo')::numeric, 0)
              - coalesce((f.payload->>'desconto_condicional')::numeric, 0)) - p_valor)
     else null end) asc nulls last,
    f.data_vencimento asc
  limit 1;

  if v_fat.id is null then
    return jsonb_build_object('ok', true, 'aluno_id', v_alu.id, 'aluno_nome', v_alu.nome,
      'confianca_nome', round(v_sim,2), 'ambiguo', v_ambiguo,
      'parcelas_abertas', v_abertas, 'parcela', null, 'motivo', 'sem_parcela_aberta');
  end if;

  v_liquido := v_fat.valor_liquido;
  v_pos_venc := v_fat.valor_pos_venc;
  v_atrasada := v_fat.data_vencimento < v_hoje;
  v_bate_como := case
    when p_valor is null then null
    when abs(v_liquido - p_valor) < 0.005 then 'ate_vencimento'
    when abs(v_pos_venc - p_valor) < 0.005 then 'apos_vencimento'
    else null end;

  select count(*) into v_abertas_mesmo_mes
  from emusys_faturas f
  where f.emusys_student_id = v_alu.emusys_student_id::bigint and f.status='aberta'
    and to_char(f.competencia,'MM/YYYY') = to_char(v_fat.competencia,'MM/YYYY');

  return jsonb_build_object(
    'ok', true,
    'aluno_id', v_alu.id,
    'aluno_nome', v_alu.nome,
    'confianca_nome', round(v_sim,2),
    'ambiguo', v_ambiguo,
    'parcelas_abertas', v_abertas,
    'parcela', jsonb_build_object(
      'fatura_id', v_fat.id,
      'descricao', v_fat.descricao,
      'vencimento', to_char(v_fat.data_vencimento,'DD/MM'),
      'competencia', to_char(v_fat.competencia,'MM/YYYY'),
      'valor', v_liquido,
      'valor_tabela', v_fat.valor_original,
      'valor_apos_vencimento', v_pos_venc,
      'atrasada', v_atrasada,
      'dias_atraso', case when v_atrasada then (v_hoje - v_fat.data_vencimento) else 0 end,
      'status', v_fat.status,
      'valor_bate', (v_bate_como is not null),
      'valor_bate_como', v_bate_como,
      'multiplas_no_mes', (v_abertas_mesmo_mes > 1)
    )
  );
end;
$function$;
