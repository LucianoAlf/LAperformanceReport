-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Periodos abertos usam a mesma carteira viva e canonica da aba Carteira.
-- Periodos historicos continuam na implementacao anterior, preservando os
-- fechamentos auditados. Numero de alunos permanece diagnostico e fora da nota.

alter function public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
  date, uuid, uuid, text
) rename to get_hs_prof_v3_segmentadas_agregadas_base_20260803;

create or replace function public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
  p_competencia date,
  p_config_id uuid,
  p_unidade_id uuid default null,
  p_periodicidade text default 'mensal'
)
returns table (
  metrica text,
  professor_id integer,
  professor_nome text,
  unidade_id uuid,
  competencia date,
  valor_bruto numeric,
  numerador numeric,
  denominador numeric,
  amostra integer,
  estado_base text,
  publicavel boolean,
  confianca text,
  fonte text,
  regra_versao text,
  motivo_sem_base text,
  detalhes jsonb,
  nota numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_competencia_atual date := date_trunc(
    'month', now() at time zone 'America/Sao_Paulo'
  )::date;
begin
  if v_competencia <> v_competencia_atual then
    return query
    select b.*
    from public.get_hs_prof_v3_segmentadas_agregadas_base_20260803(
      p_competencia,
      p_config_id,
      p_unidade_id,
      p_periodicidade
    ) b;
    return;
  end if;

  return query
  with base as materialized (
    select b.*
    from public.hs_v3_segmentos_agregado_base_canonica(
      p_competencia,
      p_config_id,
      p_unidade_id,
      p_periodicidade
    ) b
  ),
  carteira_viva as materialized (
    select c.*
    from public.get_carteira_professores(p_unidade_id) c
  ),
  escopos_base as materialized (
    select distinct b.professor_id
    from base b
  )
  select
    b.metrica,
    b.professor_id,
    b.professor_nome,
    p_unidade_id,
    v_competencia,
    case
      when b.metrica = 'numero_alunos'
        then coalesce(c.total_alunos::numeric, b.valor_bruto)
      else b.valor_bruto
    end,
    b.numerador,
    b.denominador,
    b.amostra,
    b.estado_base,
    b.publicavel,
    b.confianca,
    case
      when b.metrica = 'numero_alunos'
        then b.fonte || '+get_carteira_professores'
      else b.fonte
    end,
    'health-score-professor-v3-periodo-aberto-carteira-1'::text,
    b.motivo_sem_base,
    coalesce(b.detalhes, '{}'::jsonb) || case
      when b.metrica = 'numero_alunos' then jsonb_build_object(
        'pessoas_unicas_total', coalesce(c.total_alunos::numeric, b.valor_bruto),
        'total_visual_fonte', 'get_carteira_professores',
        'carteira_periodo_aberto', true,
        'papel', 'diagnostico',
        'fora_da_nota', true
      )
      else jsonb_build_object(
        'carteira_periodo_aberto', true
      )
    end,
    b.nota
  from base b
  left join carteira_viva c on c.professor_id = b.professor_id

  union all

  select
    m.metrica,
    c.professor_id,
    c.professor_nome,
    p_unidade_id,
    v_competencia,
    case when m.metrica = 'numero_alunos'
      then c.total_alunos::numeric end,
    null::numeric,
    null::numeric,
    case when m.metrica = 'numero_alunos'
      then c.total_alunos else 0 end::integer,
    case when m.metrica = 'numero_alunos'
      then 'projeto_sem_segmento_pontuavel'
      else 'sem_base_sem_turmas' end::text,
    false,
    'sem_base'::text,
    'get_carteira_professores+projeto_sem_segmento_pontuavel'::text,
    'health-score-professor-v3-periodo-aberto-carteira-1'::text,
    case when m.metrica = 'numero_alunos'
      then 'carteira visivel sem segmento pontuavel; permanece fora da nota'
      else 'professor sem turma regular elegivel no periodo' end::text,
    jsonb_build_object(
      'nome_exibicao', case when m.metrica = 'numero_alunos'
        then 'Carteira por curso' else 'Media de alunos por turma' end,
      'periodicidade', p_periodicidade,
      'config_id', p_config_id,
      'pessoas_unicas_total', c.total_alunos,
      'total_visual_fonte', 'get_carteira_professores',
      'carteira_periodo_aberto', true,
      'projeto_sem_segmento_pontuavel', true,
      'papel', case when m.metrica = 'numero_alunos'
        then 'diagnostico' else 'nota' end,
      'fora_da_nota', m.metrica = 'numero_alunos',
      'apta_oficial', false
    ),
    null::numeric
  from carteira_viva c
  cross join (
    values ('media_turma'::text), ('numero_alunos'::text)
  ) m(metrica)
  where not exists (
    select 1
    from escopos_base eb
    where eb.professor_id = c.professor_id
  );
end;
$function$;

revoke all on function
  public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
    date, uuid, uuid, text
  ) from public, anon, authenticated;

grant execute on function
  public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
    date, uuid, uuid, text
  ) to service_role;

comment on function
  public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
    date, uuid, uuid, text
  ) is
  'Metricas segmentadas: no periodo aberto usa a carteira viva canonica da aba Carteira; no historico preserva os fechamentos auditados. Carteira e diagnostico fora da nota.';
