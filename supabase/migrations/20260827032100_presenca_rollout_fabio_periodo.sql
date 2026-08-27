-- Fecha o ultimo consumidor periodico do Fabio sobre a ocorrencia canonica.
-- A assinatura publica continua identica e o legado fica preservado para
-- sombra/rollback. Ausencia bruta do Emusys nunca entra em falta_provavel.

do $capture$
declare
  v_def text;
begin
  if to_regprocedure('public.fabio_professor_presencas_periodo_legado_v1(integer,date,date)') is null then
    if to_regprocedure('public.fabio_professor_presencas_periodo(integer,date,date)') is null then
      raise exception 'assinatura fabio_professor_presencas_periodo nao encontrada';
    end if;
    select pg_get_functiondef(
      'public.fabio_professor_presencas_periodo(integer,date,date)'::regprocedure
    ) into v_def;
    v_def := regexp_replace(
      v_def,
      'FUNCTION public\.fabio_professor_presencas_periodo\(',
      'FUNCTION public.fabio_professor_presencas_periodo_legado_v1(',
      'i'
    );
    execute v_def;
  end if;
end
$capture$;

revoke all on function public.fabio_professor_presencas_periodo_legado_v1(integer,date,date)
  from public, anon, authenticated, service_role;

create or replace function public.fabio_professor_presencas_periodo_canonico_v2(
  p_professor_id integer,
  p_inicio date,
  p_fim date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_frescor jsonb := '[]'::jsonb;
  v_resposta jsonb;
begin
  if p_professor_id is null or p_inicio is null or p_fim is null then
    return jsonb_build_object('ok', false, 'codigo', 'parametros_obrigatorios');
  end if;
  if p_fim < p_inicio then
    return jsonb_build_object('ok', false, 'codigo', 'periodo_invertido');
  end if;
  if p_fim - p_inicio > 92 then
    return jsonb_build_object('ok', false, 'codigo', 'janela_maior_que_92_dias');
  end if;

  with dias as (
    select distinct ae.unidade_id, ae.data_aula
      from public.aulas_emusys ae
     where ae.professor_id = p_professor_id
       and ae.data_aula between p_inicio and p_fim
       and coalesce(ae.categoria, 'normal') = 'normal'
  ), estados as (
    select d.unidade_id, d.data_aula,
           public.fn_presenca_dados_frescos_interno_v1(d.unidade_id, d.data_aula) as frescor
      from dias d
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'unidade_id', unidade_id,
      'data', data_aula,
      'status', frescor ->> 'status',
      'publicavel', coalesce((frescor ->> 'publicavel')::boolean, false)
    ) order by data_aula, unidade_id
  ), '[]'::jsonb)
  into v_frescor
  from estados;

  if exists (
    select 1 from jsonb_array_elements(v_frescor) e
     where coalesce((e ->> 'publicavel')::boolean, false) is false
  ) then
    return jsonb_build_object(
      'ok', false,
      'codigo', 'dados_nao_publicaveis',
      'dados_status', 'em_auditoria',
      'estado_publicacao', 'em_auditoria',
      'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim),
      'frescor', v_frescor,
      'fonte', 'vw_presenca_ocorrencia_canonica_v2',
      'regra_versao', 'presenca-fabio-periodo-v2'
    );
  end if;

  with base as (
    select o.*, al.nome as aluno_nome
      from public.vw_presenca_ocorrencia_canonica_v2 o
      join public.alunos al on al.id = o.aluno_id
     where o.professor_id = p_professor_id
       and o.data_aula between p_inicio and p_fim
  ), agregada as (
    select
      count(*) filter (
        where resultado_canonico = 'presente' and not possui_conflito
      )::integer as presentes,
      coalesce(jsonb_agg(jsonb_build_object(
        'aluno', aluno_nome,
        'aluno_id', aluno_id,
        'data', data_aula,
        'curso', curso_nome,
        'resultado', resultado_canonico,
        'fonte_decisao', fonte_decisao
      ) order by data_aula, aluno_nome) filter (
        where resultado_canonico in ('falta', 'falta_justificada')
          and not possui_conflito
      ), '[]'::jsonb) as faltas,
      coalesce(jsonb_agg(jsonb_build_object(
        'aluno', aluno_nome,
        'aluno_id', aluno_id,
        'data', data_aula,
        'curso', curso_nome,
        'motivo', case when possui_conflito then 'conflito' else 'indeterminado' end
      ) order by data_aula, aluno_nome) filter (
        where resultado_canonico = 'indeterminado' or possui_conflito
      ), '[]'::jsonb) as indeterminado,
      coalesce(jsonb_agg(jsonb_build_object(
        'aluno', aluno_nome,
        'aluno_id', aluno_id,
        'data', data_aula,
        'curso', curso_nome,
        'motivo', resultado_canonico
      ) order by data_aula, aluno_nome) filter (
        where resultado_canonico in ('aula_cancelada', 'aula_justificada')
      ), '[]'::jsonb) as nao_aplicavel,
      count(*) filter (where possui_conflito)::integer as conflitos
    from base
  )
  select jsonb_build_object(
    'ok', true,
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim),
    'dados_status', 'atualizados',
    'estado_publicacao', 'publicavel',
    'presentes', coalesce(presentes, 0),
    'faltas', faltas,
    'falta_provavel', '[]'::jsonb,
    'indeterminado', indeterminado,
    'nao_aplicavel', nao_aplicavel,
    'conflitos', coalesce(conflitos, 0),
    'frescor', v_frescor,
    'fonte', 'vw_presenca_ocorrencia_canonica_v2',
    'regra_versao', 'presenca-fabio-periodo-v2'
  ) into v_resposta
  from agregada;

  return v_resposta;
end
$function$;

revoke all on function public.fabio_professor_presencas_periodo_canonico_v2(integer,date,date)
  from public, anon, authenticated, service_role;

create or replace function public.fabio_professor_presencas_periodo(
  p_professor_id integer,
  p_inicio date,
  p_fim date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_modo text;
begin
  with unidades_periodo as (
    select distinct ae.unidade_id
      from public.aulas_emusys ae
     where ae.professor_id = p_professor_id
       and ae.data_aula between p_inicio and p_fim
       and coalesce(ae.categoria, 'normal') = 'normal'
  ), modos as (
    select public.fn_presenca_rollout_modo_interno_v1(
      u.unidade_id, 'la_teacher'
    ) as modo
    from unidades_periodo u
  )
  select case
    when count(*) = 0 then 'sombra'
    when bool_and(modo = 'canonico_v2') then 'canonico_v2'
    when bool_and(modo = 'legado') then 'legado'
    else 'sombra'
  end into v_modo
  from modos;

  if v_modo = 'canonico_v2' then
    return public.fabio_professor_presencas_periodo_canonico_v2(
      p_professor_id, p_inicio, p_fim
    ) || jsonb_build_object('rollout_modo', v_modo);
  end if;

  if v_modo = 'sombra' then
    begin
      perform public.fabio_professor_presencas_periodo_canonico_v2(
        p_professor_id, p_inicio, p_fim
      );
    exception when others then
      null;
    end;
  end if;

  return public.fabio_professor_presencas_periodo_legado_v1(
    p_professor_id, p_inicio, p_fim
  );
end
$function$;

revoke all on function public.fabio_professor_presencas_periodo(integer,date,date)
  from public, anon, authenticated, service_role;
grant execute on function public.fabio_professor_presencas_periodo(integer,date,date)
  to service_role;

comment on function public.fabio_professor_presencas_periodo(integer,date,date) is
  'Adaptador reversivel do Fabio por periodo. Sombra/legado preservam v1; canonico_v2 publica somente ocorrencia v2 fresca, sem falta provavel inferida.';
