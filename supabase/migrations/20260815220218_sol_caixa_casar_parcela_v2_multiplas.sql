-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.


create or replace function public.sol_caixa_casar_parcela(
  p_unidade_id uuid,
  p_aluno text,
  p_valor numeric default null,
  p_competencia text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
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

  select f.id, f.descricao, f.data_vencimento, f.competencia, f.valor_original, f.status
    into v_fat
  from emusys_faturas f
  where f.emusys_student_id = v_alu.emusys_student_id::bigint
    and f.status = 'aberta'
  order by
    (v_mm is not null and extract(month from f.competencia)::int = v_mm
       and (v_yyyy is null or extract(year from f.competencia)::int = v_yyyy)) desc,
    (case when p_valor is not null then abs(f.valor_original - p_valor) else null end) asc nulls last,
    f.data_vencimento asc
  limit 1;

  if v_fat.id is null then
    return jsonb_build_object('ok', true, 'aluno_id', v_alu.id, 'aluno_nome', v_alu.nome,
      'confianca_nome', round(v_sim,2), 'ambiguo', v_ambiguo,
      'parcelas_abertas', v_abertas, 'parcela', null, 'motivo', 'sem_parcela_aberta');
  end if;

  -- quantas outras parcelas abertas na MESMA competencia escolhida (2 cursos etc.)
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
      'valor', v_fat.valor_original,
      'status', v_fat.status,
      'valor_bate', (p_valor is not null and abs(v_fat.valor_original - p_valor) < 0.005),
      'multiplas_no_mes', (v_abertas_mesmo_mes > 1)
    )
  );
end;
$$;

revoke all on function public.sol_caixa_casar_parcela(uuid,text,numeric,text) from public, anon, authenticated;
grant execute on function public.sol_caixa_casar_parcela(uuid,text,numeric,text) to service_role;
