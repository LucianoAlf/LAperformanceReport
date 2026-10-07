-- sol_caixa_casar_parcela: passo 0 — fatura JA QUITADA no Emusys vence a proxima aberta.
--
-- Bug (24/09/2026): a funcao so buscava status='aberta'. Quando a parcela do mes
-- ja tinha sido baixada no Emusys (pela Rose/FX), ela sumia do universo da Sol e a
-- funcao devolvia a parcela SEGUINTE aberta — mesmo valor, mesmo aluno, mes errado.
-- Medido: 8 entradas do caixa linkadas a fatura aberta do mes seguinte enquanto o
-- Pix quitou a do mes corrente (corrigidas em 20260923210000 e 20260924120000).
--
-- Fix: antes do ranking de abertas, procurar fatura 'paga' do aluno com
-- data_pagamento nos ultimos 4 dias e valor_pago == valor informado. Se houver,
-- devolve ELA com ja_quitada=true — e' a fatura que o dinheiro quitou de verdade.
-- Se a competencia declarada divergir da competencia da fatura quitada, devolve
-- a quitada mesmo assim mas sinaliza competencia_declarada_diverge=true p/ a
-- Sol avisar em vez de vincular calada.

create or replace function public.sol_caixa_casar_parcela(p_unidade_id uuid, p_aluno text, p_valor numeric DEFAULT NULL::numeric, p_competencia text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_in text := unaccent(lower(coalesce(p_aluno,'')));
  v_alu record;
  v_sim numeric;
  v_sim2 numeric;
  v_ambiguo boolean := false;
  v_fat record;
  v_fatq record;
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
    -- RAIZ (29/08): word_similarity mede palavras compartilhadas, nao identidade.
    -- "soraia da silveira duarte" x "laura sobreira da silveira" = 0.50 e passava.
    -- O primeiro nome tem de bater.
    and public.sol_nome_mesma_pessoa_v1(v_in, a.nome_normalizado)
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

  -- PASSO 0 (24/09): fatura JA QUITADA no Emusys nos ultimos dias com esse valor
  -- e' a que o Pix pagou. Sem este passo ela era invisivel (filtro 'aberta') e a
  -- funcao escolhia a parcela seguinte — o bug dos links para o mes errado.
  -- Janela de 4 dias cobre Pix de sexta/feriado lancado na segunda.
  select f.id, f.descricao, f.data_vencimento, f.competencia, f.valor_original, f.status,
         f.valor_pago, f.data_pagamento
    into v_fatq
  from emusys_faturas f
  where f.emusys_student_id = v_alu.emusys_student_id::bigint
    and f.status = 'paga'
    and f.data_pagamento is not null
    and f.data_pagamento between v_hoje - 4 and v_hoje
    and p_valor is not null
    and abs(coalesce(f.valor_pago, 0) - p_valor) < 0.005
  order by f.data_pagamento desc, f.competencia desc
  limit 1;

  if v_fatq.id is not null then
    return jsonb_build_object(
      'ok', true,
      'aluno_id', v_alu.id,
      'aluno_nome', v_alu.nome,
      'confianca_nome', round(v_sim,2),
      'ambiguo', v_ambiguo,
      'parcelas_abertas', v_abertas,
      'parcela', jsonb_build_object(
        'aluno_id', public.sol_caixa_aluno_da_fatura_v1(p_unidade_id, v_fatq.id),
        'fatura_id', v_fatq.id,
        'descricao', v_fatq.descricao,
        'vencimento', to_char(v_fatq.data_vencimento,'DD/MM'),
        'competencia', to_char(v_fatq.competencia,'MM/YYYY'),
        'valor', v_fatq.valor_pago,
        'valor_tabela', v_fatq.valor_original,
        'valor_apos_vencimento', v_fatq.valor_pago,
        'atrasada', false,
        'dias_atraso', 0,
        'status', v_fatq.status,
        'valor_bate', true,
        'valor_bate_como', 'ja_quitada',
        'ja_quitada', true,
        'pago_em', to_char(v_fatq.data_pagamento,'DD/MM/YYYY'),
        'competencia_declarada_diverge', (v_mm is not null and
          (extract(month from v_fatq.competencia)::int <> v_mm
           or (v_yyyy is not null and extract(year from v_fatq.competencia)::int <> v_yyyy))),
        'multiplas_no_mes', false
      )
    );
  end if;

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
      'aluno_id', public.sol_caixa_aluno_da_fatura_v1(p_unidade_id, v_fat.id),
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
      'ja_quitada', false,
      'multiplas_no_mes', (v_abertas_mesmo_mes > 1)
    )
  );
end;
$function$;
