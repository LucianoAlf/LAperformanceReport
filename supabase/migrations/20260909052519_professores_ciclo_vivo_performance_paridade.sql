begin;

-- O materializador diario e os leitores governados consomem esta fronteira,
-- nao a projecao viva diretamente. Preservamos toda a composicao vigente e
-- fazemos o primeiro mes do ciclo reutilizar exatamente a saida mensal.
alter function public.get_health_score_professor_v3_performance(date, uuid, text)
  rename to get_hs_prof_v3_performance_before_ciclo_parity_20260909;

revoke all on function public.get_hs_prof_v3_performance_before_ciclo_parity_20260909(
  date, uuid, text
) from public, anon, authenticated;
grant execute on function public.get_hs_prof_v3_performance_before_ciclo_parity_20260909(
  date, uuid, text
) to service_role;

create or replace function public.get_health_score_professor_v3_performance(
  p_competencia date,
  p_unidade_id uuid,
  p_periodicidade text
)
returns table (
  professor_id integer,
  unidade_id uuid,
  escopo text,
  competencia date,
  trimestre_inicio date,
  periodicidade text,
  periodo_inicio date,
  periodo_fim date,
  ciclo_codigo text,
  estado_publicacao text,
  score_exibivel boolean,
  ranking_habilitado boolean,
  config_versao integer,
  revisao integer,
  score numeric,
  cobertura numeric,
  classificacao text,
  estado text,
  snapshot_publicavel boolean,
  publicado boolean,
  motivo_bloqueio text,
  regra_versao_snapshot text,
  metrica text,
  valor_bruto numeric,
  numerador numeric,
  denominador numeric,
  nota numeric,
  peso numeric,
  peso_disponivel boolean,
  peso_efetivo numeric,
  contribuicao numeric,
  meta numeric,
  amostra integer,
  estado_base text,
  metrica_publicavel boolean,
  confianca text,
  fonte text,
  regra_versao_metrica text,
  motivo_sem_base text,
  codigo_evidencia text,
  papel text,
  detalhes jsonb,
  score_observado numeric,
  score_comparavel numeric,
  pilares_validos integer,
  pilares_esperados integer,
  comparabilidade_estado text,
  comparabilidade_motivo text,
  competencia_referencia date,
  score_referencia numeric,
  classificacao_referencia text,
  data_corte date,
  config_id uuid,
  regra_fingerprint text,
  peso_pontuavel_total numeric,
  peso_disponivel_total numeric,
  cobertura_normalizada numeric,
  cobertura_minima_aplicada numeric,
  comparabilidade_motivos jsonb
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_competencia_efetiva date;
  v_periodo_inicio date;
  v_periodo_fim date;
  v_ciclo_codigo text;
begin
  if p_competencia is null or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_PERIODICIDADE_INVALIDA: use mensal ou ciclo'
      using errcode = '22023';
  end if;

  if p_periodicidade = 'mensal' then
    return query
    select b.*
    from public.get_hs_prof_v3_performance_before_ciclo_parity_20260909(
      v_competencia,
      p_unidade_id,
      'mensal'
    ) b;
    return;
  end if;

  select p.periodo_inicio, p.periodo_fim, p.ciclo_codigo
    into v_periodo_inicio, v_periodo_fim, v_ciclo_codigo
  from public.fn_health_score_v3_periodo(v_competencia, 'ciclo') p;

  v_competencia_efetiva :=
    public.fn_health_score_professor_v3_competencia_ciclo_vivo(
      v_competencia,
      current_date
    );

  if current_date between v_periodo_inicio and v_periodo_fim
     and v_competencia_efetiva = v_periodo_inicio then
    return query
    select
      b.professor_id,
      b.unidade_id,
      b.escopo,
      v_competencia_efetiva,
      v_periodo_inicio,
      'ciclo'::text,
      v_periodo_inicio,
      v_periodo_fim,
      v_ciclo_codigo,
      'ciclo_em_acompanhamento'::text,
      b.score_exibivel,
      false,
      b.config_versao,
      0,
      b.score,
      b.cobertura,
      b.classificacao,
      b.estado,
      false,
      false,
      'ciclo_em_acompanhamento'::text,
      'health-score-professor-v3-ciclo-primeiro-mes-paridade-2'::text,
      b.metrica,
      b.valor_bruto,
      b.numerador,
      b.denominador,
      b.nota,
      b.peso,
      b.peso_disponivel,
      b.peso_efetivo,
      b.contribuicao,
      b.meta,
      b.amostra,
      b.estado_base,
      b.metrica_publicavel,
      b.confianca,
      b.fonte,
      b.regra_versao_metrica,
      b.motivo_sem_base,
      b.codigo_evidencia,
      b.papel,
      coalesce(b.detalhes, '{}'::jsonb) || jsonb_build_object(
        'periodicidade', 'ciclo',
        'periodo_inicio', v_periodo_inicio,
        'periodo_fim', v_periodo_fim,
        'data_corte', current_date,
        'competencia_fonte', v_competencia_efetiva,
        'primeiro_mes_igual_ao_mensal', true
      ),
      b.score_observado,
      b.score_comparavel,
      b.pilares_validos,
      b.pilares_esperados,
      b.comparabilidade_estado,
      b.comparabilidade_motivo,
      b.competencia_referencia,
      b.score_referencia,
      b.classificacao_referencia,
      least(current_date, v_periodo_fim),
      b.config_id,
      b.regra_fingerprint,
      b.peso_pontuavel_total,
      b.peso_disponivel_total,
      b.cobertura_normalizada,
      b.cobertura_minima_aplicada,
      b.comparabilidade_motivos
    from public.get_hs_prof_v3_performance_before_ciclo_parity_20260909(
      v_competencia_efetiva,
      p_unidade_id,
      'mensal'
    ) b;
    return;
  end if;

  return query
  select b.*
  from public.get_hs_prof_v3_performance_before_ciclo_parity_20260909(
    v_competencia_efetiva,
    p_unidade_id,
    'ciclo'
  ) b;
end;
$function$;

revoke all on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) from public, anon;
grant execute on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) to authenticated, service_role;

comment on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) is 'Performance governada: primeiro mes do ciclo espelha o mensal; meses seguintes acumulam ate a competencia corrente.';

commit;
