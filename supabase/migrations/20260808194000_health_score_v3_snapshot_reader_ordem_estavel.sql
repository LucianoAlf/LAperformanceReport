begin;

-- A ordem de UNION ALL nao e um contrato SQL. A aba normaliza as seis linhas
-- de cada professor; portanto a leitura precisa ser estavel em todo recarregamento,
-- sobretudo no Consolidado. Isto nao altera o retrato nem a formula do V3.
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
  ), leitura as materialized (
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
    where e.tem_papel_ausente
  )
  select * from leitura
  order by professor_id, metrica;
$function$;

revoke all on function public.get_health_score_professor_v3_performance_snapshot_v3(
  date, uuid, text
) from public, anon;
grant execute on function public.get_health_score_professor_v3_performance_snapshot_v3(
  date, uuid, text
) to authenticated, service_role;

comment on function public.get_health_score_professor_v3_performance_snapshot_v3(
  date, uuid, text
) is 'Leitor V3 do retrato: fast path V1, compatibilidade V2 para legado sem papel e ordem deterministica por professor e pilar.';

commit;
