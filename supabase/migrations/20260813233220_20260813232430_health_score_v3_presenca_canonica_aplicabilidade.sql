-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

begin;

-- A presenca do Health Score usa o mesmo veredito pedagogico do LA Teacher,
-- mas o evento de agenda nao e a chave da ocorrencia. Uma aula pode possuir
-- linhas/gemeas Emusys para o mesmo horario. O contrato estavel e:
-- unidade + aluno + professor + data_hora_inicio.
create or replace function public.get_health_score_professor_v3_presenca_periodo_v2(
  p_competencia date,
  p_unidade_id uuid default null,
  p_periodicidade text default 'mensal'
)
returns table (
  metrica text, professor_id integer, professor_nome text, unidade_id uuid,
  competencia date, valor_bruto numeric, numerador numeric,
  denominador numeric, amostra integer, estado_base text, publicavel boolean,
  confianca text, fonte text, regra_versao text, motivo_sem_base text,
  detalhes jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
#variable_conflict use_column
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_inicio date;
  v_fim_periodo date;
  v_fim_recorte date;
  v_codigo text;
begin
  if p_competencia is null or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_PRESENCA_PERIODO_INVALIDO'
      using errcode = '22023';
  end if;

  select p.periodo_inicio, p.periodo_fim, p.ciclo_codigo
    into v_inicio, v_fim_periodo, v_codigo
  from public.fn_health_score_v3_periodo(p_competencia, p_periodicidade) p;

  v_fim_recorte := least(v_fim_periodo, current_date);

  return query
  with unidades_permitidas as (
    select up.unidade_id
    from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
  ), roster_candidatos as (
    select
      ae.professor_id,
      ae.unidade_id,
      aa.aluno_id,
      ae.data_aula,
      ae.data_hora_inicio,
      ae.data_hora_fim,
      coalesce(pol.exige_revisao_operacional, true) as exige_revisao,
      row_number() over (
        partition by ae.unidade_id, aa.aluno_id, ae.professor_id,
          ae.data_hora_inicio
        order by ae.data_hora_fim desc nulls last, ae.id desc
      ) as ordem_ocorrencia
    from public.aulas_emusys ae
    join unidades_permitidas up on up.unidade_id = ae.unidade_id
    join public.aula_alunos_emusys aa on aa.aula_emusys_id = ae.id
    left join lateral (
      select p.exige_revisao_operacional
      from public.presenca_politicas_confiabilidade p
      where p.unidade_id = ae.unidade_id
        and p.ativa
        and ae.data_aula between p.data_inicio and p.data_fim
      order by p.data_inicio desc, p.created_at desc
      limit 1
    ) pol on true
    where ae.data_aula between v_inicio and v_fim_recorte
      and ae.data_hora_inicio is not null
      and ae.data_hora_fim is not null
      and ae.data_hora_fim < clock_timestamp()
      and ae.professor_id is not null
      and aa.aluno_id is not null
      and ae.id = public.fn_aula_operacional_id(ae.id)
      and not coalesce(ae.cancelada, false)
      and lower(coalesce(ae.categoria, 'normal')) = 'normal'
      and coalesce(ae.sem_acompanhamento, false) = false
  ), roster as (
    select
      professor_id, unidade_id, aluno_id, data_aula,
      data_hora_inicio, data_hora_fim, exige_revisao
    from roster_candidatos
    where ordem_ocorrencia = 1
  ), semantica_candidata as (
    select
      s.*,
      row_number() over (
        partition by s.unidade_id, s.aluno_id, s.professor_id,
          s.data_hora_inicio
        order by
          coalesce(public.fn_presenca_e_forte(s.respondido_por), false) desc,
          s.respondido_em desc nulls last,
          s.evidencia_registrada_em desc nulls last,
          s.aluno_presenca_id desc
      ) as ordem_ocorrencia
    from public.vw_aluno_presenca_semantica_v1 s
    join unidades_permitidas up on up.unidade_id = s.unidade_id
    where s.data_aula between v_inicio and v_fim_recorte
      and s.data_hora_inicio is not null
      and s.data_hora_inicio < clock_timestamp()
      and s.professor_id is not null
      and s.aluno_id is not null
      and s.considera_frequencia_denominador
      and s.resultado_pedagogico in ('presente', 'falta_confirmada')
  ), semantica as (
    select
      unidade_id, aluno_id, professor_id, data_aula, data_hora_inicio,
      considera_presenca as presente,
      considera_falta as falta_confirmada
    from semantica_candidata
    where ordem_ocorrencia = 1
  ), eventos as (
    select
      r.professor_id,
      r.unidade_id,
      r.aluno_id,
      r.data_hora_inicio,
      r.exige_revisao,
      s.presente,
      s.falta_confirmada
    from roster r
    left join semantica s
      on s.professor_id = r.professor_id
     and s.unidade_id = r.unidade_id
     and s.aluno_id = r.aluno_id
     and s.data_aula = r.data_aula
     and s.data_hora_inicio = r.data_hora_inicio
  ), stats as (
    select
      e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
        as unidade_saida,
      count(*) filter (where not e.exige_revisao)::integer
        as esperados_confiaveis,
      count(*) filter (
        where not e.exige_revisao and (e.presente or e.falta_confirmada)
      )::integer as classificados_confiaveis,
      count(*) filter (where not e.exige_revisao and e.presente)::integer
        as presentes,
      count(*) filter (
        where not e.exige_revisao
          and e.falta_confirmada
          and not coalesce(e.presente, false)
      )::integer as faltas,
      count(*) filter (where e.exige_revisao)::integer
        as esperados_auditoria,
      count(*) filter (
        where e.exige_revisao and (e.presente or e.falta_confirmada)
      )::integer as classificados_auditoria,
      count(*) filter (where e.exige_revisao and e.presente)::integer
        as presentes_auditoria,
      count(*) filter (
        where e.exige_revisao
          and e.falta_confirmada
          and not coalesce(e.presente, false)
      )::integer as faltas_auditoria
    from eventos e
    group by e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
  ), alvo as (
    select distinct
      pu.professor_id,
      case when p_unidade_id is null then null::uuid else pu.unidade_id end
        as unidade_saida
    from public.professores_unidades pu
    join unidades_permitidas up on up.unidade_id = pu.unidade_id
    where coalesce(pu.emusys_ativo, true)
      and coalesce(pu.validacao_status, 'validado') not in ('ignorado', 'rejeitado')
    union
    select distinct
      e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
    from eventos e
  )
  select
    'presenca'::text,
    a.professor_id,
    pr.nome::text,
    a.unidade_saida,
    v_competencia,
    case when coalesce(s.classificados_confiaveis, 0) > 0 then round(
      s.presentes::numeric / s.classificados_confiaveis::numeric * 100, 2
    ) else null end,
    coalesce(s.presentes, 0)::numeric,
    coalesce(s.classificados_confiaveis, 0)::numeric,
    coalesce(s.classificados_confiaveis, 0),
    case
      when coalesce(s.esperados_confiaveis, 0) = 0
        and coalesce(s.esperados_auditoria, 0) > 0 then 'em_auditoria'
      when coalesce(s.esperados_confiaveis, 0) = 0 then 'sem_base'
      when s.classificados_confiaveis < 10 then 'sem_base_amostra'
      when s.classificados_confiaveis::numeric / s.esperados_confiaveis < 0.95
        then 'sem_base_cobertura'
      else 'ok'
    end,
    coalesce(s.classificados_confiaveis, 0) >= 10
      and s.esperados_confiaveis > 0
      and s.classificados_confiaveis::numeric / s.esperados_confiaveis >= 0.95,
    case
      when coalesce(s.esperados_confiaveis, 0) = 0
        and coalesce(s.esperados_auditoria, 0) > 0 then 'auditoria'
      when coalesce(s.esperados_confiaveis, 0) = 0 then 'sem_base'
      when s.classificados_confiaveis < 10
        or s.classificados_confiaveis::numeric / s.esperados_confiaveis < 0.95
        then 'baixa'
      else 'alta'
    end,
    'vw_aluno_presenca_semantica_v1+fn_presenca_e_forte+aula_alunos_emusys'::text,
    'health-score-professor-v3-presenca-ocorrencia-3'::text,
    case
      when coalesce(s.esperados_confiaveis, 0) = 0
        and coalesce(s.esperados_auditoria, 0) > 0
        then 'unidade em auditoria e fora do Health Score'
      when coalesce(s.esperados_confiaveis, 0) = 0
        then 'nenhum evento confiavel no periodo'
      when s.classificados_confiaveis < 10
        then 'base minima de 10 eventos nao atingida'
      when s.classificados_confiaveis::numeric / s.esperados_confiaveis < 0.95
        then 'cobertura semantica inferior a 95% do roster esperado'
      else null
    end,
    jsonb_build_object(
      'periodicidade', p_periodicidade,
      'periodo_inicio', v_inicio,
      'periodo_fim', v_fim_periodo,
      'fim_recorte', v_fim_recorte,
      'ciclo_codigo', v_codigo,
      'eventos_esperados_confiaveis', coalesce(s.esperados_confiaveis, 0),
      'eventos_classificados_confiaveis', coalesce(s.classificados_confiaveis, 0),
      'presentes', coalesce(s.presentes, 0),
      'faltas_confirmadas', coalesce(s.faltas, 0),
      'cobertura', case when coalesce(s.esperados_confiaveis, 0) > 0
        then round(s.classificados_confiaveis::numeric / s.esperados_confiaveis * 100, 2)
      end,
      'eventos_esperados_auditoria', coalesce(s.esperados_auditoria, 0),
      'eventos_classificados_auditoria', coalesce(s.classificados_auditoria, 0),
      'presentes_auditoria', coalesce(s.presentes_auditoria, 0),
      'faltas_auditoria', coalesce(s.faltas_auditoria, 0),
      'identidade_ocorrencia', 'unidade+aluno+professor+data_hora_inicio',
      'fonte_veredito', 'vw_aluno_presenca_semantica_v1',
      'aceita_lancamento_tardio', true,
      'apta_oficial', p_periodicidade = 'ciclo'
        and v_fim_periodo <= current_date
        and coalesce(s.classificados_confiaveis, 0) >= 10
        and s.esperados_confiaveis > 0
        and s.classificados_confiaveis::numeric / s.esperados_confiaveis >= 0.95
    )
  from alvo a
  join public.professores pr on pr.id = a.professor_id
  left join stats s
    on s.professor_id = a.professor_id
   and s.unidade_saida is not distinct from a.unidade_saida;
end;
$function$;

revoke all on function public.get_health_score_professor_v3_presenca_periodo_v2(
  date, uuid, text
) from public, anon;
grant execute on function public.get_health_score_professor_v3_presenca_periodo_v2(
  date, uuid, text
) to authenticated, service_role;

-- O leitor distingue pilares configurados de pilares aplicaveis. Ausencia de
-- evidencia (por exemplo, nenhuma experimental ou nenhuma aula elegivel)
-- fica fora do universo comparavel por padrao. Uma configuracao pode exigir
-- explicitamente a evidencia com parametros.comparabilidade_sem_base=
-- 'obrigatoria'. O minimo de pilares e reduzido apenas ate o universo
-- aplicavel; nunca se cria pilar artificial.
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
        (p_unidade_id is null and s.escopo = 'consolidado' and s.unidade_id is null)
        or (p_unidade_id is not null and s.escopo = 'unidade' and s.unidade_id = p_unidade_id)
      )
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
      coalesce(m.detalhes, '{}'::jsonb) as metrica_detalhes,
      coalesce(cm.parametros, '{}'::jsonb) as config_parametros,
      case
        when m.metrica = 'numero_alunos' then false
        when coalesce(m.papel, 'nota') <> 'nota' then false
        when coalesce(m.peso, 0) <= 0 then false
        when coalesce(cm.parametros ->> 'comparabilidade_sem_base', 'neutra')
          = 'obrigatoria' then true
        else coalesce(m.peso_disponivel, false) and m.nota is not null
      end as pilar_aplicavel
    from snapshots s
    join public.health_score_professor_v3_snapshot_metricas m
      on m.snapshot_id = s.id
    left join public.health_score_professor_v3_config_metricas cm
      on cm.config_id = s.config_id
     and cm.metrica = m.metrica
  ), resumo as (
    select m.professor_id, m.id as snapshot_id, m.config_id,
      count(distinct m.metrica) filter (
        where m.pilar_aplicavel and m.peso_disponivel and m.nota is not null
      )::integer as pilares_validos,
      count(distinct m.metrica) filter (
        where m.pilar_aplicavel
      )::integer as pilares_esperados,
      coalesce(sum(m.peso) filter (where m.pilar_aplicavel), 0)::numeric
        as peso_pontuavel_total,
      coalesce(sum(m.peso) filter (
        where m.pilar_aplicavel and m.peso_disponivel and m.nota is not null
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
      least(coalesce(c.pilares_minimos, 3), coalesce(r.pilares_esperados, 0))
        as pilares_minimos_aplicado,
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
        coalesce(c.cobertura_minima, 60), c.pilares_minimos_aplicado,
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

revoke all on function public.get_health_score_professor_v3_performance_snapshot_v1(
  date, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.get_health_score_professor_v3_performance_snapshot_v1(
  date, uuid, text
) to authenticated, service_role;

comment on function public.get_health_score_professor_v3_performance_snapshot_v1(
  date, uuid, text
) is
  'Leitor canonico V3: pilares sem evidencia aplicavel ficam fora do universo comparavel; escopo e revisao continuam explicitos.';

-- O materializador de periodo ja e append-only e recalcula a evidencia atual.
-- Este invocador controlado permite reprocessar somente a competencia aberta,
-- sem reabrir nem alterar snapshots historicos/fechados.
create or replace function public.reprocessar_health_score_professor_v3_competencia_aberta(
  p_competencia date,
  p_periodicidade text default 'mensal',
  p_escopo text default 'unidade',
  p_unidade_id uuid default null,
  p_professor_id integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_escopo text := lower(trim(coalesce(p_escopo, '')));
  v_unidade_id uuid;
  v_resultado jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user <> 'postgres' then
    raise exception 'HEALTH_SCORE_V3_ACESSO_NEGADO: reprocessamento interno'
      using errcode = '42501';
  end if;

  if p_competencia is null
    or v_competencia <> date_trunc('month', current_date)::date then
    raise exception 'HEALTH_SCORE_V3_COMPETENCIA_NAO_ABERTA: somente a competencia corrente'
      using errcode = '22023';
  end if;

  if p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_PERIODICIDADE_INVALIDA: use mensal ou ciclo'
      using errcode = '22023';
  end if;

  if v_escopo not in ('unidade', 'consolidado') then
    raise exception 'HEALTH_SCORE_V3_ESCOPO_INVALIDO: use unidade ou consolidado'
      using errcode = '22023';
  end if;

  if v_escopo = 'unidade' and p_unidade_id is null then
    raise exception 'HEALTH_SCORE_V3_UNIDADE_OBRIGATORIA: escopo unidade exige unidade_id'
      using errcode = '22023';
  end if;

  if v_escopo = 'consolidado' and p_unidade_id is not null then
    raise exception 'HEALTH_SCORE_V3_UNIDADE_INCOMPATIVEL: consolidado exige unidade_id nulo'
      using errcode = '22023';
  end if;

  v_unidade_id := case when v_escopo = 'unidade' then p_unidade_id else null::uuid end;
  perform pg_advisory_xact_lock(hashtextextended(
    format('health_score_professor_v3:reprocessar:%s:%s:%s',
      v_competencia, p_periodicidade, coalesce(v_unidade_id::text, 'rede')),
    0
  ));

  v_resultado := public.materializar_health_score_professor_v3_periodo(
    v_competencia, p_periodicidade, v_unidade_id, p_professor_id
  );

  return v_resultado || jsonb_build_object(
    'escopo', v_escopo,
    'unidade_id', v_unidade_id,
    'reprocessamento_append_only', true,
    'competencia_aberta', true,
    'historico_fechado_alterado', false
  );
end;
$function$;

revoke all on function public.reprocessar_health_score_professor_v3_competencia_aberta(
  date, text, text, uuid, integer
) from public, anon, authenticated, service_role;
grant execute on function public.reprocessar_health_score_professor_v3_competencia_aberta(
  date, text, text, uuid, integer
) to service_role;

comment on function public.reprocessar_health_score_professor_v3_competencia_aberta(
  date, text, text, uuid, integer
) is
  'Reprocessa apenas a competencia aberta via materializacao append-only; nunca reescreve snapshots fechados.';

commit;
