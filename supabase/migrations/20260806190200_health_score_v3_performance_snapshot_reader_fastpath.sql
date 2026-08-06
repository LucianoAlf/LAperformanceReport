begin;

-- O V2 reprocessa a compatibilidade de `papel` para toda leitura. Nos
-- retratos recentes o campo ja foi materializado, portanto o V1 e identico e
-- mais barato. O fallback V2 permanece exclusivamente para legado sem papel.
create or replace function public.get_health_score_professor_v3_performance_snapshot_v3(
  p_competencia date,
  p_unidade_id uuid,
  p_periodicidade text
)
returns table (
  professor_id integer, unidade_id uuid, escopo text, competencia date,
  trimestre_inicio date, periodicidade text, periodo_inicio date, periodo_fim date,
  ciclo_codigo text, estado_publicacao text, score_exibivel boolean,
  ranking_habilitado boolean, config_versao integer, revisao integer, score numeric,
  cobertura numeric, classificacao text, estado text, snapshot_publicavel boolean,
  publicado boolean, motivo_bloqueio text, regra_versao_snapshot text,
  metrica text, valor_bruto numeric, numerador numeric, denominador numeric,
  nota numeric, peso numeric, peso_disponivel boolean, peso_efetivo numeric,
  contribuicao numeric, meta numeric, amostra integer, estado_base text,
  metrica_publicavel boolean, confianca text, fonte text,
  regra_versao_metrica text, motivo_sem_base text, codigo_evidencia text,
  papel text, detalhes jsonb,
  score_observado numeric, score_comparavel numeric,
  pilares_validos integer, pilares_esperados integer,
  comparabilidade_estado text, comparabilidade_motivo text,
  competencia_referencia date, score_referencia numeric,
  classificacao_referencia text,
  data_corte date, config_id uuid, regra_fingerprint text,
  peso_pontuavel_total numeric, peso_disponivel_total numeric,
  cobertura_normalizada numeric, cobertura_minima_aplicada numeric,
  comparabilidade_motivos jsonb,
  retrato_calculado_em timestamptz, retrato_execucao_id uuid,
  retrato_estado text, retrato_defasagem_minutos numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with v1 as materialized (
    select *
    from public.get_health_score_professor_v3_performance_snapshot_v1(
      p_competencia,
      p_unidade_id,
      p_periodicidade
    )
  ), estado as materialized (
    select coalesce(bool_or(papel is null), false) as tem_papel_ausente
    from v1
  )
  select v.*
  from v1 v
  cross join estado e
  where not e.tem_papel_ausente

  union all

  select legado.*
  from estado e
  cross join lateral public.get_health_score_professor_v3_performance_snapshot_v2(
    p_competencia,
    p_unidade_id,
    p_periodicidade
  ) legado
  where e.tem_papel_ausente;
$function$;

revoke all on function public.get_health_score_professor_v3_performance_snapshot_v3(
  date, uuid, text
) from public, anon;
grant execute on function public.get_health_score_professor_v3_performance_snapshot_v3(
  date, uuid, text
) to authenticated, service_role;

comment on function public.get_health_score_professor_v3_performance_snapshot_v3(
  date, uuid, text
) is 'Leitor V3 de retrato: fast path V1 para dados atuais e compatibilidade V2 apenas para legado sem papel.';

commit;
