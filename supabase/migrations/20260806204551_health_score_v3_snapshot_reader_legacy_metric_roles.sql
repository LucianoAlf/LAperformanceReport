-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

begin;

-- Os snapshots anteriores a agosto/2026 foram gravados antes da coluna
-- `papel` ser preenchida. O dado do pilar e o score ja existem; esta leitura
-- apenas recupera o papel historico para nao confundir retrato parcial com
-- ausencia de base. Nenhum score ou metrica e recalculado aqui.
create or replace function public.get_health_score_professor_v3_performance_snapshot_v2(
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
  with origem as materialized (
    select r.*,
      s.score as score_snapshot,
      s.cobertura as cobertura_snapshot,
      s.classificacao as classificacao_snapshot,
      coalesce(
        r.papel,
        case r.metrica when 'numero_alunos' then 'diagnostico' else 'nota' end
      ) as papel_snapshot
    from public.get_health_score_professor_v3_performance_snapshot_v1(
      p_competencia,
      p_unidade_id,
      p_periodicidade
    ) r
    join public.health_score_professor_v3_snapshots s
      on s.id = r.retrato_execucao_id
  ), resumo as (
    select
      o.retrato_execucao_id as snapshot_id,
      o.config_id,
      count(distinct o.metrica) filter (
        where o.papel_snapshot = 'nota'
          and o.peso_disponivel
          and o.nota is not null
      )::integer as pilares_validos,
      count(distinct o.metrica) filter (
        where o.papel_snapshot = 'nota' and o.peso > 0
      )::integer as pilares_esperados,
      coalesce(sum(o.peso) filter (
        where o.papel_snapshot = 'nota' and o.peso > 0
      ), 0)::numeric as peso_pontuavel_total,
      coalesce(sum(o.peso) filter (
        where o.papel_snapshot = 'nota'
          and o.peso_disponivel
          and o.nota is not null
      ), 0)::numeric as peso_disponivel_total,
      coalesce(bool_or(
        o.metrica in ('retencao', 'permanencia')
          and o.peso_disponivel
          and o.nota is not null
      ), false) as tem_fidelizacao,
      not coalesce(bool_or(
        coalesce(o.codigo_evidencia, '') = 'fonte_canonica_indisponivel'
          and nullif(o.detalhes ->> 'motivo_auditoria', '') is not null
      ), false) as fonte_canonica_disponivel
    from origem o
    group by o.retrato_execucao_id, o.config_id
  ), avaliados as (
    select
      r.*,
      c.cobertura_minima,
      c.pilares_minimos,
      public.fn_health_score_professor_v3_config_fingerprint_comparabilidade(c.id)
        as fingerprint_atual,
      public.avaliar_health_score_professor_v3_comparabilidade(
        o.score_snapshot,
        o.cobertura_snapshot,
        r.pilares_validos,
        r.tem_fidelizacao,
        coalesce(c.cobertura_minima, 60),
        coalesce(c.pilares_minimos, 3),
        r.fonte_canonica_disponivel
      ) as avaliacao
    from resumo r
    join origem o on o.retrato_execucao_id = r.snapshot_id
    join public.health_score_professor_v3_config_versoes c on c.id = r.config_id
    group by r.snapshot_id, r.config_id, r.pilares_validos, r.pilares_esperados,
      r.peso_pontuavel_total, r.peso_disponivel_total, r.tem_fidelizacao,
      r.fonte_canonica_disponivel, c.id, c.cobertura_minima, c.pilares_minimos,
      o.score_snapshot, o.cobertura_snapshot
  )
  select
    o.professor_id, o.unidade_id, o.escopo, o.competencia,
    o.trimestre_inicio, o.periodicidade, o.periodo_inicio, o.periodo_fim,
    o.ciclo_codigo, o.estado_publicacao, o.score_exibivel,
    o.ranking_habilitado, o.config_versao, o.revisao, o.score_snapshot,
    o.cobertura_snapshot, o.classificacao_snapshot, o.estado,
    o.snapshot_publicavel, o.publicado, o.motivo_bloqueio,
    o.regra_versao_snapshot,
    o.metrica, o.valor_bruto, o.numerador, o.denominador,
    o.nota, o.peso, o.peso_disponivel, o.peso_efetivo,
    o.contribuicao, o.meta, o.amostra, o.estado_base,
    o.metrica_publicavel, o.confianca, o.fonte,
    o.regra_versao_metrica, o.motivo_sem_base, o.codigo_evidencia,
    o.papel_snapshot, o.detalhes,
    o.score_snapshot,
    case when (a.avaliacao ->> 'estado') = 'comparavel'
      then o.score_snapshot else null::numeric end,
    a.pilares_validos, a.pilares_esperados,
    a.avaliacao ->> 'estado', a.avaliacao ->> 'motivo',
    o.competencia_referencia, o.score_referencia, o.classificacao_referencia,
    o.data_corte, o.config_id, a.fingerprint_atual,
    a.peso_pontuavel_total, a.peso_disponivel_total,
    o.cobertura_snapshot, coalesce(a.cobertura_minima, 60),
    a.avaliacao -> 'motivos',
    o.retrato_calculado_em, o.retrato_execucao_id,
    o.retrato_estado, o.retrato_defasagem_minutos
  from origem o
  join avaliados a on a.snapshot_id = o.retrato_execucao_id
  order by o.professor_id,
    case o.metrica when 'retencao' then 1 when 'permanencia' then 2
      when 'conversao' then 3 when 'media_turma' then 4
      when 'numero_alunos' then 5 when 'presenca' then 6 else 99 end;
$function$;

revoke all on function public.get_health_score_professor_v3_performance_snapshot_v2(
  date, uuid, text
) from public, anon;
grant execute on function public.get_health_score_professor_v3_performance_snapshot_v2(
  date, uuid, text
) to authenticated, service_role;

comment on function public.get_health_score_professor_v3_performance_snapshot_v2(
  date, uuid, text
) is 'Leitor direto V3 que recupera papel dos snapshots legados sem recalcular score.';

commit;
