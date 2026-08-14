begin;

-- A exigencia de fidelizacao e um criterio versionado da configuracao.
-- Mantemos o overload legado (que continua exigindo fidelizacao) para nao
-- alterar consumidores antigos; o leitor canonico usa este overload explicito.
create or replace function public.avaliar_health_score_professor_v3_comparabilidade(
  p_score_observado numeric,
  p_cobertura numeric,
  p_pilares_validos integer,
  p_tem_fidelizacao boolean,
  p_cobertura_minima numeric,
  p_pilares_minimos integer,
  p_exige_pilar_fidelizacao boolean,
  p_fonte_canonica_disponivel boolean
)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $function$
declare
  v_estado text;
  v_motivo text;
  v_comparavel boolean := false;
  v_motivos jsonb := '[]'::jsonb;
begin
  if coalesce(p_pilares_validos, 0) = 0 then
    v_motivos := v_motivos || '"sem_pilares_validos"'::jsonb;
  elsif p_pilares_validos < coalesce(p_pilares_minimos, 3) then
    v_motivos := v_motivos || '"pilares_insuficientes"'::jsonb;
  end if;

  if p_score_observado is null then
    v_motivos := v_motivos || '"score_observado_indisponivel"'::jsonb;
  end if;
  if coalesce(p_cobertura, 0) < coalesce(p_cobertura_minima, 60) then
    v_motivos := v_motivos || '"cobertura_insuficiente"'::jsonb;
  end if;
  if coalesce(p_exige_pilar_fidelizacao, true)
     and not coalesce(p_tem_fidelizacao, false) then
    v_motivos := v_motivos || '"sem_pilar_fidelizacao"'::jsonb;
  end if;
  if not coalesce(p_fonte_canonica_disponivel, false) then
    v_motivos := v_motivos || '"fonte_canonica_indisponivel"'::jsonb;
  end if;

  if coalesce(p_pilares_validos, 0) = 0 then
    v_estado := 'sem_base_operacional';
    v_motivo := 'sem_pilares_validos';
  elsif not coalesce(p_fonte_canonica_disponivel, false) then
    v_estado := 'em_maturacao';
    v_motivo := 'fonte_em_auditoria';
  elsif p_score_observado is null then
    v_estado := 'em_maturacao';
    v_motivo := 'score_observado_indisponivel';
  elsif p_pilares_validos < coalesce(p_pilares_minimos, 3) then
    v_estado := 'em_maturacao';
    v_motivo := 'pilares_insuficientes';
  elsif coalesce(p_cobertura, 0) < coalesce(p_cobertura_minima, 60) then
    v_estado := 'em_maturacao';
    v_motivo := 'cobertura_insuficiente';
  elsif coalesce(p_exige_pilar_fidelizacao, true)
        and not coalesce(p_tem_fidelizacao, false) then
    v_estado := 'em_maturacao';
    v_motivo := 'sem_pilar_fidelizacao';
  else
    v_estado := 'comparavel';
    v_motivo := 'criterios_atendidos';
    v_comparavel := true;
    v_motivos := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'estado', v_estado,
    'motivo', v_motivo,
    'motivos', v_motivos,
    'comparavel', v_comparavel,
    'score_comparavel', case when v_comparavel then p_score_observado else null end,
    'pilares_minimos_aplicado', coalesce(p_pilares_minimos, 3),
    'cobertura_minima_aplicada', coalesce(p_cobertura_minima, 60),
    'exige_pilar_fidelizacao_aplicado', coalesce(p_exige_pilar_fidelizacao, true)
  );
end;
$function$;

create or replace function public.get_health_score_professor_v3_performance_snapshot_v1(
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
  with candidatos as (
    select s.*,
      row_number() over (
        partition by s.professor_id
        order by s.revisao desc, s.criado_em desc, s.id desc
      ) as ordem_revisao
    from public.health_score_professor_v3_snapshots s
    where p_competencia is not null
      and p_periodicidade in ('mensal', 'ciclo')
      and s.periodicidade = p_periodicidade
      and (
        (p_periodicidade = 'mensal'
          and s.competencia = date_trunc('month', p_competencia)::date)
        or (p_periodicidade = 'ciclo'
          and date_trunc('month', p_competencia)::date
            between s.periodo_inicio and s.periodo_fim)
      )
      and (
        (p_competencia = date_trunc('month', current_date)::date
          and s.estado in ('provisorio', 'em_maturacao')
          and s.estado_publicacao in ('parcial', 'em_andamento', 'ciclo_em_acompanhamento', 'sem_base'))
        or (p_competencia <> date_trunc('month', current_date)::date
          and s.estado in ('fechado', 'provisorio', 'em_maturacao')
          and s.estado_publicacao in ('oficial', 'parcial', 'sem_base'))
      )
  ), snapshots as materialized (
    select c.*
    from candidatos c
    join public.professores p on p.id = c.professor_id and p.ativo = true
    where c.ordem_revisao = 1
      and exists (
        select 1 from public.professores_unidades pu
        where pu.professor_id = c.professor_id
          and pu.emusys_ativo = true
          and coalesce(pu.validacao_status, 'validado') <> 'ignorado'
          and (p_unidade_id is null or pu.unidade_id = p_unidade_id)
      )
  ), metricas as materialized (
    select s.*,
      m.metrica, m.valor_bruto, m.numerador, m.denominador,
      m.nota, m.peso, m.peso_disponivel, m.peso_efetivo,
      m.contribuicao, m.meta_aplicada, m.amostra, m.estado_base,
      m.publicavel as metrica_publicavel, m.confianca, m.fonte,
      m.regra_versao as regra_versao_metrica, m.motivo_sem_base,
      m.codigo_evidencia,
      case
        when m.metrica = 'numero_alunos' then 'diagnostico'::text
        else coalesce(m.papel, 'nota')::text
      end as papel,
      coalesce(m.detalhes, '{}'::jsonb) as metrica_detalhes
    from snapshots s
    join public.health_score_professor_v3_snapshot_metricas m on m.snapshot_id = s.id
  ), resumo as (
    select m.professor_id, m.id as snapshot_id, m.config_id,
      count(distinct m.metrica) filter (
        where m.papel = 'nota' and m.peso_disponivel and m.nota is not null
      )::integer as pilares_validos,
      count(distinct m.metrica) filter (
        where m.papel = 'nota' and m.peso > 0
      )::integer as pilares_esperados,
      coalesce(sum(m.peso) filter (where m.papel = 'nota' and m.peso > 0), 0)::numeric
        as peso_pontuavel_total,
      coalesce(sum(m.peso) filter (
        where m.papel = 'nota' and m.peso_disponivel and m.nota is not null
      ), 0)::numeric as peso_disponivel_total,
      coalesce(bool_or(
        m.metrica in ('retencao', 'permanencia')
          and m.peso_disponivel and m.nota is not null
      ), false) as tem_fidelizacao,
      not coalesce(bool_or(
        coalesce(m.codigo_evidencia, '') = 'fonte_canonica_indisponivel'
          and nullif(m.metrica_detalhes ->> 'motivo_auditoria', '') is not null
      ), false) as fonte_canonica_disponivel
    from metricas m
    group by m.professor_id, m.id, m.config_id
  ), criterios as (
    select r.*, c.cobertura_minima, c.pilares_minimos,
      c.exige_pilar_fidelizacao,
      c.faixa_atencao_min, c.faixa_saudavel_min,
      public.calcular_health_score_professor_v3_cobertura_pilares(
        r.pilares_validos, r.pilares_esperados
      ) as cobertura_pilares,
      public.fn_health_score_professor_v3_config_fingerprint_comparabilidade(c.id)
        as fingerprint_atual
    from resumo r
    join public.health_score_professor_v3_config_versoes c on c.id = r.config_id
  ), avaliados as (
    select c.*,
      public.avaliar_health_score_professor_v3_comparabilidade(
        s.score, c.cobertura_pilares, c.pilares_validos, c.tem_fidelizacao,
        coalesce(c.cobertura_minima, 60), coalesce(c.pilares_minimos, 3),
        coalesce(c.exige_pilar_fidelizacao, true),
        c.fonte_canonica_disponivel
      ) as avaliacao
    from criterios c
    join snapshots s on s.id = c.snapshot_id
  )
  select
    m.professor_id, m.unidade_id, m.escopo, m.competencia,
    m.trimestre_inicio, m.periodicidade, m.periodo_inicio, m.periodo_fim,
    m.ciclo_codigo, m.estado_publicacao, m.score_exibivel,
    m.ranking_habilitado, m.config_versao, m.revisao, m.score,
    a.cobertura_pilares,
    case
      when (a.avaliacao ->> 'estado') <> 'comparavel' then null::text
      when m.score >= a.faixa_saudavel_min then 'saudavel'
      when m.score >= a.faixa_atencao_min then 'atencao'
      else 'critico'
    end,
    m.estado, m.publicavel, m.publicado, m.motivo_bloqueio, m.regra_versao,
    m.metrica, m.valor_bruto, m.numerador, m.denominador,
    m.nota, m.peso, m.peso_disponivel, m.peso_efetivo,
    m.contribuicao, m.meta_aplicada, m.amostra, m.estado_base,
    m.metrica_publicavel, m.confianca, m.fonte,
    m.regra_versao_metrica, m.motivo_sem_base, m.codigo_evidencia, m.papel,
    case when m.metrica in ('media_turma', 'numero_alunos') then
      (m.metrica_detalhes - 'segmentos_resumo' - 'divergencias' - 'alertas_capacidade')
      || jsonb_build_object(
        'segmentos_capacidade_excedida', m.metrica_detalhes -> 'segmentos_capacidade_excedida',
        'dados_sem_resolucao', m.metrica_detalhes -> 'dados_sem_resolucao',
        'estados_resolucao', m.metrica_detalhes -> 'estados_resolucao',
        'codigo_evidencia', coalesce(
          m.metrica_detalhes -> 'codigo_evidencia', to_jsonb(m.codigo_evidencia)
        )
      ) else m.metrica_detalhes end,
    m.score,
    case when (a.avaliacao ->> 'estado') = 'comparavel' then m.score else null::numeric end,
    a.pilares_validos, a.pilares_esperados,
    a.avaliacao ->> 'estado', a.avaliacao ->> 'motivo',
    null::date, null::numeric, null::text,
    least(current_date, m.periodo_fim), m.config_id, a.fingerprint_atual,
    a.peso_pontuavel_total, a.peso_disponivel_total,
    a.cobertura_pilares, coalesce(a.cobertura_minima, 60),
    a.avaliacao -> 'motivos',
    m.criado_em, m.id, m.estado,
    greatest(0, round(extract(epoch from (clock_timestamp() - m.criado_em)) / 60, 1))
  from metricas m
  join avaliados a on a.snapshot_id = m.id and a.professor_id = m.professor_id
  order by m.professor_id,
    case m.metrica when 'retencao' then 1 when 'permanencia' then 2
      when 'conversao' then 3 when 'media_turma' then 4
      when 'numero_alunos' then 5 when 'presenca' then 6 else 99 end;
$function$;

revoke all on function public.avaliar_health_score_professor_v3_comparabilidade(
  numeric, numeric, integer, boolean, numeric, integer, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.avaliar_health_score_professor_v3_comparabilidade(
  numeric, numeric, integer, boolean, numeric, integer, boolean, boolean
) to authenticated, service_role;

revoke all on function public.get_health_score_professor_v3_performance_snapshot_v1(
  date, uuid, text
) from public, anon;
grant execute on function public.get_health_score_professor_v3_performance_snapshot_v1(
  date, uuid, text
) to authenticated, service_role;

comment on function public.avaliar_health_score_professor_v3_comparabilidade(
  numeric, numeric, integer, boolean, numeric, integer, boolean, boolean
) is
  'Regra pura de comparabilidade V3 com fidelizacao opcional conforme configuracao versionada.';

commit;
