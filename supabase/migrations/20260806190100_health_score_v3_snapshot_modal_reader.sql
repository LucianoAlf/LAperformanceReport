begin;

-- O detalhe individual de Performance deve consumir a mesma fotografia da
-- grade. A versao anterior de quatro argumentos delegava ao produtor vivo.
create or replace function public.get_health_score_professor_v3_snapshot_modal(
  p_competencia date,
  p_unidade_id uuid,
  p_professor_id integer,
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
  comparabilidade_motivos jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  perform public.fn_health_score_professor_v3_ator_leitura(p_unidade_id);

  if p_competencia is null or p_professor_id is null then
    raise exception 'HEALTH_SCORE_V3_MODAL_INVALIDO: competencia e professor obrigatorios'
      using errcode = '22023';
  end if;

  return query
  select
    p.professor_id, p.unidade_id, p.escopo, p.competencia,
    p.trimestre_inicio, p.periodicidade, p.periodo_inicio, p.periodo_fim,
    p.ciclo_codigo, p.estado_publicacao, p.score_exibivel,
    p.ranking_habilitado, p.config_versao, p.revisao, p.score,
    p.cobertura, p.classificacao, p.estado, p.snapshot_publicavel,
    p.publicado, p.motivo_bloqueio, p.regra_versao_snapshot,
    p.metrica, p.valor_bruto, p.numerador, p.denominador,
    p.nota, p.peso, p.peso_disponivel, p.peso_efetivo,
    p.contribuicao, p.meta, p.amostra, p.estado_base,
    p.metrica_publicavel, p.confianca, p.fonte,
    p.regra_versao_metrica, p.motivo_sem_base, p.codigo_evidencia,
    p.papel, p.detalhes,
    p.score_observado, p.score_comparavel,
    p.pilares_validos, p.pilares_esperados,
    p.comparabilidade_estado, p.comparabilidade_motivo,
    p.competencia_referencia, p.score_referencia,
    p.classificacao_referencia,
    p.data_corte, p.config_id, p.regra_fingerprint,
    p.peso_pontuavel_total, p.peso_disponivel_total,
    p.cobertura_normalizada, p.cobertura_minima_aplicada,
    p.comparabilidade_motivos
  from public.get_health_score_professor_v3_performance_snapshot_v2(
    p_competencia,
    p_unidade_id,
    p_periodicidade
  ) p
  where p.professor_id = p_professor_id;
end;
$function$;

revoke all on function public.get_health_score_professor_v3_snapshot_modal(
  date, uuid, integer, text
) from public, anon;
grant execute on function public.get_health_score_professor_v3_snapshot_modal(
  date, uuid, integer, text
) to authenticated, service_role;

comment on function public.get_health_score_professor_v3_snapshot_modal(
  date, uuid, integer, text
) is 'Modal V3 por fotografia; nunca recalcula o Health Score no request.';

commit;
