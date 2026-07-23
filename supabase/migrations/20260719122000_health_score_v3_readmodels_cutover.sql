-- Health Score Professor V3 - read models por periodicidade e fechamento oficial.
-- Parcial e visivel; ranking e premiacao existem somente no ciclo oficial.

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
  contribuicao numeric,
  meta numeric,
  amostra integer,
  estado_base text,
  metrica_publicavel boolean,
  confianca text,
  fonte text,
  regra_versao_metrica text,
  motivo_sem_base text,
  detalhes jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_health_score_professor_v3_ator_gerenciador();
  if p_competencia is null or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_PERFORMANCE_INVALIDO: competencia e periodicidade obrigatorias'
      using errcode = '22023';
  end if;

  return query
  with candidatos as (
    select s.*,
      row_number() over (
        partition by s.professor_id
        order by
          (s.estado_publicacao = 'oficial') desc,
          s.revisao desc,
          s.criado_em desc,
          s.id desc
      ) as rn
    from public.health_score_professor_v3_snapshots s
    where s.competencia = date_trunc('month', p_competencia)::date
      and s.unidade_id is not distinct from p_unidade_id
      and s.periodicidade = p_periodicidade
      and s.estado in ('provisorio', 'em_maturacao', 'fechado')
  ), snapshots as (
    select c.* from candidatos c where c.rn = 1
  )
  select
    s.professor_id, s.unidade_id, s.escopo, s.competencia,
    s.trimestre_inicio, s.periodicidade, s.periodo_inicio, s.periodo_fim,
    s.ciclo_codigo, s.estado_publicacao, s.score_exibivel,
    s.ranking_habilitado, s.config_versao, s.revisao, s.score,
    s.cobertura, s.classificacao, s.estado,
    s.publicavel as snapshot_publicavel, s.publicado, s.motivo_bloqueio,
    s.regra_versao as regra_versao_snapshot,
    m.metrica, m.valor_bruto, m.numerador, m.denominador, m.nota,
    m.peso, m.peso_disponivel, m.contribuicao,
    m.meta_aplicada as meta, m.amostra, m.estado_base,
    m.publicavel as metrica_publicavel, m.confianca, m.fonte,
    m.regra_versao as regra_versao_metrica, m.motivo_sem_base,
    coalesce(m.detalhes, '{}'::jsonb)
  from snapshots s
  join public.health_score_professor_v3_snapshot_metricas m
    on m.snapshot_id = s.id
  order by s.professor_id, case m.metrica
    when 'retencao' then 1 when 'permanencia' then 2
    when 'conversao' then 3 when 'media_turma' then 4
    when 'numero_alunos' then 5 when 'presenca' then 6 else 99 end;
end;
$$;

create or replace function public.get_health_score_professor_v3_snapshot_modal(
  p_competencia date,
  p_unidade_id uuid,
  p_professor_id integer,
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
  contribuicao numeric,
  meta numeric,
  amostra integer,
  estado_base text,
  metrica_publicavel boolean,
  confianca text,
  fonte text,
  regra_versao_metrica text,
  motivo_sem_base text,
  detalhes jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_health_score_professor_v3_ator_gerenciador();
  if p_competencia is null
     or p_professor_id is null
     or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_MODAL_INVALIDO: competencia, professor e periodicidade obrigatorios'
      using errcode = '22023';
  end if;

  return query
  with snapshot as (
    select s.*
    from public.health_score_professor_v3_snapshots s
    where s.competencia = date_trunc('month', p_competencia)::date
      and s.professor_id = p_professor_id
      and s.unidade_id is not distinct from p_unidade_id
      and s.periodicidade = p_periodicidade
      and s.estado in ('provisorio', 'em_maturacao', 'fechado')
    order by (s.estado_publicacao = 'oficial') desc, s.revisao desc
    limit 1
  )
  select
    s.professor_id, s.unidade_id, s.escopo, s.competencia,
    s.trimestre_inicio, s.periodicidade, s.periodo_inicio, s.periodo_fim,
    s.ciclo_codigo, s.estado_publicacao, s.score_exibivel,
    s.ranking_habilitado, s.config_versao, s.revisao, s.score,
    s.cobertura, s.classificacao, s.estado,
    s.publicavel as snapshot_publicavel, s.publicado, s.motivo_bloqueio,
    s.regra_versao as regra_versao_snapshot,
    m.metrica, m.valor_bruto, m.numerador, m.denominador, m.nota,
    m.peso, m.peso_disponivel, m.contribuicao,
    m.meta_aplicada as meta, m.amostra, m.estado_base,
    m.publicavel as metrica_publicavel, m.confianca, m.fonte,
    m.regra_versao as regra_versao_metrica, m.motivo_sem_base,
    coalesce(m.detalhes, '{}'::jsonb)
  from snapshot s
  join public.health_score_professor_v3_snapshot_metricas m
    on m.snapshot_id = s.id
  order by case m.metrica
    when 'retencao' then 1 when 'permanencia' then 2
    when 'conversao' then 3 when 'media_turma' then 4
    when 'numero_alunos' then 5 when 'presenca' then 6 else 99 end;
end;
$$;

create or replace function public.fechar_health_score_professor_v3_ciclo(
  p_ciclo_codigo text,
  p_justificativa text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_usuario_id integer;
  v_ciclo public.health_score_professor_v3_ciclos%rowtype;
  v_origem record;
  v_novo_id uuid;
  v_revisao integer;
  v_count integer := 0;
  v_ids jsonb := '[]'::jsonb;
begin
  v_usuario_id := public.fn_health_score_professor_v3_ator_gerenciador();
  if nullif(btrim(p_justificativa), '') is null then
    raise exception 'HEALTH_SCORE_V3_FECHAMENTO_INVALIDO: justificativa obrigatoria';
  end if;

  select * into v_ciclo
  from public.health_score_professor_v3_ciclos c
  where c.codigo = p_ciclo_codigo
  for update;
  if not found then
    raise exception 'HEALTH_SCORE_V3_FECHAMENTO_INVALIDO: ciclo inexistente';
  end if;
  if current_date < v_ciclo.data_fim then
    raise exception 'HEALTH_SCORE_V3_FECHAMENTO_BLOQUEADO: ciclo ainda aberto';
  end if;
  if v_ciclo.publicacao_oficial then
    raise exception 'HEALTH_SCORE_V3_FECHAMENTO_BLOQUEADO: ciclo ja oficial';
  end if;

  for v_origem in
    with candidatos as (
      select s.*,
        row_number() over (
          partition by s.professor_id, s.unidade_id
          order by s.competencia desc, s.revisao desc
        ) as rn
      from public.health_score_professor_v3_snapshots s
      where s.periodicidade = 'ciclo'
        and s.ciclo_codigo = p_ciclo_codigo
        and s.estado_publicacao = 'parcial'
        and s.score_exibivel
        and s.score is not null
    )
    select c.* from candidatos c
    where c.rn = 1
      and not exists (
        select 1
        from public.health_score_professor_v3_snapshot_metricas m
        where m.snapshot_id = c.id
          and m.nota is not null
          and coalesce((m.detalhes->>'apta_oficial')::boolean, false) is not true
      )
  loop
    select coalesce(max(s.revisao), 0) + 1 into v_revisao
    from public.health_score_professor_v3_snapshots s
    where s.professor_id = v_origem.professor_id
      and s.unidade_id is not distinct from v_origem.unidade_id
      and s.competencia = v_origem.competencia
      and s.periodicidade = 'ciclo';

    insert into public.health_score_professor_v3_snapshots (
      professor_id, escopo, unidade_id, competencia, trimestre_inicio,
      revisao, estado, config_id, config_versao, score, cobertura,
      classificacao, publicavel, publicado, motivo_bloqueio, regra_versao,
      snapshot_anterior_id, justificativa_retificacao, criado_por, fechado_em,
      periodicidade, periodo_inicio, periodo_fim, ciclo_codigo,
      estado_publicacao, score_exibivel, ranking_habilitado
    ) values (
      v_origem.professor_id, v_origem.escopo, v_origem.unidade_id,
      v_origem.competencia, v_origem.trimestre_inicio, v_revisao, 'fechado',
      v_origem.config_id, v_origem.config_versao, v_origem.score,
      v_origem.cobertura, v_origem.classificacao, true, true, null,
      'health-score-professor-v3-fechamento-ciclo-1', v_origem.id,
      btrim(p_justificativa), v_usuario_id, now(), 'ciclo',
      v_origem.periodo_inicio, v_origem.periodo_fim, v_origem.ciclo_codigo,
      'oficial', true, true
    ) returning id into v_novo_id;

    insert into public.health_score_professor_v3_snapshot_metricas (
      snapshot_id, metrica, valor_bruto, numerador, denominador, amostra,
      estado_base, publicavel, confianca, fonte, regra_versao,
      motivo_sem_base, detalhes, nota, peso, peso_disponivel,
      contribuicao, meta_aplicada
    )
    select v_novo_id, m.metrica, m.valor_bruto, m.numerador, m.denominador,
      m.amostra, m.estado_base, m.publicavel, m.confianca, m.fonte,
      m.regra_versao, m.motivo_sem_base,
      m.detalhes || jsonb_build_object('fechado_oficialmente_em', now()),
      m.nota, m.peso, m.peso_disponivel, m.contribuicao, m.meta_aplicada
    from public.health_score_professor_v3_snapshot_metricas m
    where m.snapshot_id = v_origem.id;

    v_count := v_count + 1;
    v_ids := v_ids || jsonb_build_array(v_novo_id);
  end loop;

  if v_count = 0 then
    raise exception 'HEALTH_SCORE_V3_FECHAMENTO_BLOQUEADO: nenhum snapshot apto ao oficial';
  end if;

  update public.health_score_professor_v3_ciclos
  set estado = 'fechado', publicacao_oficial = true,
      ranking_habilitado = true, fechado_em = now(),
      fechado_por = v_usuario_id, justificativa_fechamento = btrim(p_justificativa)
  where id = v_ciclo.id;

  return jsonb_build_object(
    'ciclo_codigo', p_ciclo_codigo,
    'estado_publicacao', 'oficial',
    'ranking_habilitado', true,
    'snapshots_fechados', v_count,
    'snapshot_ids', v_ids
  );
end;
$$;

create or replace function public.get_health_score_professor_v3_consumidor_pedagogico(
  p_competencia date,
  p_unidade_id uuid,
  p_professor_id integer,
  p_periodicidade text default 'mensal'
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'professor_id', r.professor_id,
    'unidade_id', r.unidade_id,
    'periodicidade', r.periodicidade,
    'periodo_inicio', r.periodo_inicio,
    'periodo_fim', r.periodo_fim,
    'ciclo_codigo', r.ciclo_codigo,
    'estado_publicacao', r.estado_publicacao,
    'score_exibivel', r.score_exibivel,
    'ranking_habilitado', r.ranking_habilitado,
    'score', r.score,
    'cobertura', r.cobertura,
    'classificacao', r.classificacao,
    'metrica', r.metrica,
    'valor_bruto', r.valor_bruto,
    'numerador', r.numerador,
    'denominador', r.denominador,
    'nota', r.nota,
    'meta', r.meta,
    'amostra', r.amostra,
    'estado_base', r.estado_base,
    'confianca', r.confianca,
    'detalhes', r.detalhes
  ) order by r.metrica), '[]'::jsonb)
  from public.get_health_score_professor_v3_snapshot_modal(
    p_competencia, p_unidade_id, p_professor_id, p_periodicidade
  ) r;
$$;

revoke all on function public.get_health_score_professor_v3_performance(date, uuid, text)
  from public, anon;
revoke all on function public.get_health_score_professor_v3_snapshot_modal(date, uuid, integer, text)
  from public, anon;
revoke all on function public.fechar_health_score_professor_v3_ciclo(text, text)
  from public, anon, authenticated;
revoke all on function public.get_health_score_professor_v3_consumidor_pedagogico(date, uuid, integer, text)
  from public, anon, authenticated;

grant execute on function public.get_health_score_professor_v3_performance(date, uuid, text)
  to authenticated, service_role;
grant execute on function public.get_health_score_professor_v3_snapshot_modal(date, uuid, integer, text)
  to authenticated, service_role;
grant execute on function public.fechar_health_score_professor_v3_ciclo(text, text)
  to authenticated, service_role;
grant execute on function public.get_health_score_professor_v3_consumidor_pedagogico(date, uuid, integer, text)
  to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'fabio_agent') then
    execute 'grant execute on function public.get_health_score_professor_v3_consumidor_pedagogico(date, uuid, integer, text) to fabio_agent';
  end if;
end;
$$;

comment on function public.get_health_score_professor_v3_performance(date, uuid, text) is
  'Performance V3 mensal/ciclo: parcial visivel; ranking somente quando estado_publicacao=oficial e ranking_habilitado=true.';
comment on function public.get_health_score_professor_v3_consumidor_pedagogico(date, uuid, integer, text) is
  'Payload pedagogico V3 sem informacoes financeiras para consumidores autorizados.';
