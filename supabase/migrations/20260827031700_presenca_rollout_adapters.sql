-- Adaptadores de cutover. As implementações canônicas ficam privadas e as
-- portas públicas escolhem legado/sombra/canônico por unidade e superfície.

do $clonar_canonicas$
declare
  v_item record;
  v_def text;
  v_nova_def text;
begin
  for v_item in
    select * from (values
      ('get_agenda_dia_v2', 'p_data date, p_unidade_id uuid', 'get_agenda_dia_canonica_v2'),
      ('app_minha_agenda_sessao', 'p_data date', 'app_minha_agenda_sessao_canonica_v2'),
      ('get_presenca_contexto_agente_v1', 'p_unidade_id uuid, p_data date, p_escopo text, p_professor_id integer', 'get_presenca_contexto_agente_canonico_v1'),
      ('fn_texto_relatorio_presenca', 'p_unidade_id uuid, p_data date', 'fn_texto_relatorio_presenca_canonica_v2')
    ) as x(nome_origem, argumentos, nome_destino)
  loop
    select pg_get_functiondef(p.oid) into strict v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = v_item.nome_origem
      and pg_get_function_identity_arguments(p.oid) = v_item.argumentos;

    v_nova_def := regexp_replace(
      v_def,
      'FUNCTION public\.' || v_item.nome_origem || '\(',
      'FUNCTION public.' || v_item.nome_destino || '(',
      'i'
    );
    if v_item.nome_origem = 'fn_texto_relatorio_presenca' then
      v_nova_def := replace(
        v_nova_def,
        'public.get_presenca_contexto_agente_v1(',
        'public.get_presenca_contexto_agente_canonico_v1('
      );
    end if;
    if v_nova_def = v_def then
      raise exception 'assinatura de % nao encontrada', v_item.nome_origem;
    end if;
    execute v_nova_def;
  end loop;
end
$clonar_canonicas$;

revoke all on function public.get_agenda_dia_canonica_v2(date, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.app_minha_agenda_sessao_canonica_v2(date)
  from public, anon, authenticated, service_role;
revoke all on function public.get_presenca_contexto_agente_canonico_v1(uuid, date, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.fn_texto_relatorio_presenca_canonica_v2(uuid, date)
  from public, anon, authenticated, service_role;

create or replace function public.fn_presenca_rollout_modo_escopo_interno_v1(
  p_unidade_id uuid,
  p_superficie text
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_modo text;
begin
  if p_unidade_id is not null then
    return public.fn_presenca_rollout_modo_interno_v1(p_unidade_id, p_superficie);
  end if;

  select case
    when count(*) > 0 and bool_and(c.modo = 'canonico_v2') then 'canonico_v2'
    when count(*) > 0 and bool_and(c.modo = 'legado') then 'legado'
    else 'sombra'
  end
  into v_modo
  from public.presenca_rollout_config c
  where c.superficie = p_superficie;
  return coalesce(v_modo, 'sombra');
end;
$$;

revoke all on function public.fn_presenca_rollout_modo_escopo_interno_v1(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.fn_agenda_dia_legado_envelope_v1(
  p_data date,
  p_unidade_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_aulas jsonb;
  v_ocorrencias jsonb;
  v_professores jsonb;
  v_pendencias jsonb;
  v_conflitos jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb)
    into v_aulas
  from public.get_agenda_dia(p_data, p_unidade_id) g;

  select coalesce(jsonb_agg(jsonb_build_object(
    'slot_key', coalesce(aula ->> 'chave', 'legado:' || (aluno ->> 'aula_emusys_id')),
    'aluno_id', (aluno ->> 'aluno_id')::integer,
    'ids_aulas_emusys', jsonb_build_array((aluno ->> 'aula_emusys_id')::integer),
    'resultado_canonico', case lower(coalesce(aluno ->> 'status_presenca', ''))
      when 'presente' then 'presente'
      when 'falta' then 'falta'
      when 'ausente' then 'falta'
      when 'falta_justificada' then 'falta_justificada'
      when 'justificada' then 'falta_justificada'
      else 'indeterminado'
    end,
    'fonte_decisao', coalesce(nullif(aluno ->> 'respondido_por', ''), 'legado'),
    'decidido_em', null,
    'possui_conflito', false,
    'request_id', null,
    'recibo_status', null
  )), '[]'::jsonb)
  into v_ocorrencias
  from jsonb_array_elements(v_aulas) aula
  cross join lateral jsonb_array_elements(coalesce(aula -> 'alunos', '[]'::jsonb)) aluno
  where nullif(aluno ->> 'aluno_id', '') is not null
    and nullif(aluno ->> 'aula_emusys_id', '') is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'aula_emusys_id', aula_id.value::integer,
    'professor_id', (aula ->> 'professor_id')::integer,
    'estado', case lower(coalesce(aula ->> 'professor_presenca', ''))
      when 'presente' then 'presente'
      when 'ausente' then 'ausente'
      else 'indeterminado'
    end,
    'fonte', 'legado',
    'decidido_em', null,
    'request_id', null,
    'recibo_status', null
  )), '[]'::jsonb)
  into v_professores
  from jsonb_array_elements(v_aulas) aula
  cross join lateral jsonb_array_elements_text(coalesce(aula -> 'aula_ids', '[]'::jsonb)) aula_id
  where nullif(aula ->> 'professor_id', '') is not null;

  select
    coalesce(jsonb_agg(to_jsonb(p)) filter (where p.motivo = 'sem_resposta'), '[]'::jsonb),
    coalesce(jsonb_agg(to_jsonb(p)) filter (where p.motivo = 'divergencia'), '[]'::jsonb)
  into v_pendencias, v_conflitos
  from public.fn_presenca_pendencias_do_dia(p_unidade_id, p_data) p;

  return jsonb_build_object(
    'dados_status', 'atualizados',
    'sincronizado_em', null,
    'regra_versao', 'presenca-legado-v1',
    'fonte', 'agenda-legado',
    'pendencias', v_pendencias,
    'conflitos', v_conflitos,
    'revisoes_estruturais', '[]'::jsonb,
    'ocorrencias', v_ocorrencias,
    'professores_ocorrencias', v_professores,
    'aulas', v_aulas
  );
end;
$$;

revoke all on function public.fn_agenda_dia_legado_envelope_v1(date, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.get_agenda_dia_v2(
  p_data date,
  p_unidade_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_modo text := public.fn_presenca_rollout_modo_escopo_interno_v1(p_unidade_id, 'agenda');
  v_resultado jsonb;
begin
  if v_modo = 'canonico_v2' then
    return public.get_agenda_dia_canonica_v2(p_data, p_unidade_id)
      || jsonb_build_object('rollout_modo', v_modo);
  end if;

  if v_modo = 'sombra' then
    begin
      perform public.get_agenda_dia_canonica_v2(p_data, p_unidade_id);
    exception when others then
      null;
    end;
  end if;
  v_resultado := public.fn_agenda_dia_legado_envelope_v1(p_data, p_unidade_id);
  return v_resultado || jsonb_build_object('rollout_modo', v_modo);
end;
$$;

revoke all on function public.get_agenda_dia_v2(date, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_agenda_dia_v2(date, uuid)
  to authenticated, service_role;

create or replace function public.app_minha_agenda_sessao(p_data date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_professor_id integer := public.fn_professor_do_usuario();
  v_modo text;
  v_legado jsonb;
begin
  if v_professor_id is null then
    return jsonb_build_object('erro', 'sem_professor_vinculado');
  end if;

  select case
    when count(*) > 0 and bool_and(c.modo = 'canonico_v2') then 'canonico_v2'
    when count(*) > 0 and bool_and(c.modo = 'legado') then 'legado'
    else 'sombra'
  end
  into v_modo
  from public.presenca_rollout_config c
  where c.superficie = 'la_teacher'
    and c.unidade_id in (
      select distinct ae.unidade_id
      from public.aulas_emusys ae
      where ae.professor_id = v_professor_id
        and ae.data_aula = p_data
    );
  v_modo := coalesce(v_modo, 'sombra');

  if v_modo = 'canonico_v2' then
    return public.app_minha_agenda_sessao_canonica_v2(p_data)
      || jsonb_build_object('rollout_modo', v_modo);
  end if;
  if v_modo = 'sombra' then
    begin
      perform public.app_minha_agenda_sessao_canonica_v2(p_data);
    exception when others then
      null;
    end;
  end if;
  v_legado := public.app_minha_agenda_sessao_base_v1(p_data);
  return v_legado;
end;
$$;

revoke all on function public.app_minha_agenda_sessao(date)
  from public, anon, authenticated, service_role;
grant execute on function public.app_minha_agenda_sessao(date)
  to authenticated;

create or replace function public.get_presenca_contexto_agente_v1(
  p_unidade_id uuid,
  p_data date,
  p_escopo text,
  p_professor_id integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_escopo text := lower(btrim(coalesce(p_escopo, '')));
  v_superficie text;
  v_modo text;
begin
  v_superficie := case v_escopo
    when 'sol' then 'sol'
    when 'lia' then 'lia'
    when 'mila' then 'mila'
    when 'fabio' then 'la_teacher'
    when 'bi' then 'relatorios'
    else null
  end;
  if v_superficie is null then
    raise exception 'ESCOPO_PRESENCA_INVALIDO' using errcode = '22023';
  end if;
  v_modo := public.fn_presenca_rollout_modo_interno_v1(p_unidade_id, v_superficie);

  if v_modo = 'canonico_v2' then
    return public.get_presenca_contexto_agente_canonico_v1(
      p_unidade_id, p_data, p_escopo, p_professor_id
    ) || jsonb_build_object('rollout_modo', v_modo);
  end if;
  if v_modo = 'sombra' then
    begin
      perform public.get_presenca_contexto_agente_canonico_v1(
        p_unidade_id, p_data, p_escopo, p_professor_id
      );
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'dados_status', 'legado_sem_contexto_canonico',
    'sincronizado_em', null,
    'regra_versao', 'presenca-legado-v1',
    'periodo', jsonb_build_object('inicio', p_data, 'fim', p_data),
    'universo_eventos', null,
    'presentes', null,
    'faltas_confirmadas', null,
    'indeterminados', null,
    'conflitos', 0,
    'revisoes_estruturais', 0,
    'estado_publicacao', 'legado',
    'fonte', 'rollout_legado_sem_inferencia',
    'rollout_modo', v_modo,
    'pendencias', '[]'::jsonb,
    'conflitos_detalhes', '[]'::jsonb,
    'revisoes_estruturais_detalhes', '[]'::jsonb,
    'ocorrencias', '[]'::jsonb
  );
end;
$$;

revoke all on function public.get_presenca_contexto_agente_v1(uuid, date, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_presenca_contexto_agente_v1(uuid, date, text, integer)
  to service_role;

do $grants_agentes$
begin
  if exists (select 1 from pg_roles where rolname = 'sol_acesso_restrito') then
    grant execute on function public.get_presenca_contexto_agente_v1(uuid, date, text, integer) to sol_acesso_restrito;
  end if;
  if exists (select 1 from pg_roles where rolname = 'lia_acesso_restrito') then
    grant execute on function public.get_presenca_contexto_agente_v1(uuid, date, text, integer) to lia_acesso_restrito;
  end if;
  if exists (select 1 from pg_roles where rolname = 'mila_acesso_restrito') then
    grant execute on function public.get_presenca_contexto_agente_v1(uuid, date, text, integer) to mila_acesso_restrito;
  end if;
end
$grants_agentes$;

create or replace function public.fn_texto_relatorio_presenca(
  p_unidade_id uuid,
  p_data date
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_modo text := public.fn_presenca_rollout_modo_interno_v1(p_unidade_id, 'sol');
begin
  if v_modo = 'canonico_v2' then
    return public.fn_texto_relatorio_presenca_canonica_v2(p_unidade_id, p_data);
  end if;
  if v_modo = 'sombra' then
    begin
      perform public.fn_texto_relatorio_presenca_canonica_v2(p_unidade_id, p_data);
    exception when others then
      null;
    end;
  end if;
  return public.fn_texto_relatorio_presenca_legado_v1(p_unidade_id, p_data);
end;
$$;

revoke all on function public.fn_texto_relatorio_presenca(uuid, date)
  from public, anon, authenticated, service_role;
grant execute on function public.fn_texto_relatorio_presenca(uuid, date)
  to authenticated, service_role;

comment on function public.get_agenda_dia_v2(date, uuid) is
  'Porta governada: sombra calcula v2 e devolve legado; canonico_v2 publica v2; legado reverte sem DDL.';
comment on function public.app_minha_agenda_sessao(date) is
  'Porta governada do LA Teacher; array legado permanece aceito pelo app durante sombra e rollback.';
comment on function public.get_presenca_contexto_agente_v1(uuid, date, text, integer) is
  'Porta governada dos agentes; fora do canônico falha fechada sem inferir presença bruta.';
