-- Serializacao transacional do roster/slot e nucleos privados da escrita v2.
-- Esta migration e aditiva: nenhuma porta publica ou funcao v1 e redefinida.

begin;

create or replace function public.fn_presenca_roster_lock_key_v2(
  p_aula_emusys_id integer
)
returns bigint
language sql
immutable
parallel safe
set search_path = pg_catalog, public
as $function$
  select hashtextextended(
    'presenca_roster_aula:' || coalesce(p_aula_emusys_id::text, '<null>'),
    20260828005709
  )
$function$;

create or replace function public.fn_presenca_slot_lock_key_v2(
  p_unidade_id uuid,
  p_professor_id integer,
  p_data_hora_inicio timestamptz,
  p_data_hora_fim timestamptz,
  p_curso_nome text
)
returns bigint
language sql
immutable
parallel safe
set search_path = pg_catalog, public
as $function$
  select hashtextextended(
    'presenca_slot:'
      || coalesce(p_unidade_id::text, '<null>') || '|'
      || coalesce(p_professor_id::text, '<null>') || '|'
      || coalesce(extract(epoch from p_data_hora_inicio)::text, '<null>') || '|'
      || coalesce(extract(epoch from p_data_hora_fim)::text, '<null>') || '|'
      || lower(btrim(coalesce(p_curso_nome, ''))),
    20260828005709
  )
$function$;

create or replace function public.fn_presenca_roster_lock_trigger_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_old_roster_key bigint;
  v_new_roster_key bigint;
  v_old_slot_key bigint;
  v_new_slot_key bigint;
  v_key bigint;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old_roster_key := public.fn_presenca_roster_lock_key_v2(old.aula_emusys_id);
    select public.fn_presenca_slot_lock_key_v2(
      a.unidade_id, a.professor_id, a.data_hora_inicio,
      a.data_hora_fim, a.curso_nome
    ) into v_old_slot_key
      from public.aulas_emusys a
     where a.id = old.aula_emusys_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new_roster_key := public.fn_presenca_roster_lock_key_v2(new.aula_emusys_id);
    select public.fn_presenca_slot_lock_key_v2(
      a.unidade_id, a.professor_id, a.data_hora_inicio,
      a.data_hora_fim, a.curso_nome
    ) into v_new_slot_key
      from public.aulas_emusys a
     where a.id = new.aula_emusys_id;
  end if;

  for v_key in
    select distinct chave.valor
      from unnest(array[
        v_old_roster_key, v_old_slot_key, v_new_roster_key, v_new_slot_key
      ]::bigint[]) chave(valor)
     where chave.valor is not null
     order by chave.valor
  loop
    perform pg_advisory_xact_lock(v_key);
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$function$;

create or replace function public.fn_presenca_slot_lock_trigger_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_old_roster_key bigint;
  v_new_roster_key bigint;
  v_old_slot_key bigint;
  v_new_slot_key bigint;
  v_key bigint;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old_roster_key := public.fn_presenca_roster_lock_key_v2(old.id);
    v_old_slot_key := public.fn_presenca_slot_lock_key_v2(
      old.unidade_id, old.professor_id, old.data_hora_inicio,
      old.data_hora_fim, old.curso_nome
    );
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new_roster_key := public.fn_presenca_roster_lock_key_v2(new.id);
    v_new_slot_key := public.fn_presenca_slot_lock_key_v2(
      new.unidade_id, new.professor_id, new.data_hora_inicio,
      new.data_hora_fim, new.curso_nome
    );
  end if;

  for v_key in
    select distinct chave.valor
      from unnest(array[
        v_old_roster_key, v_old_slot_key, v_new_roster_key, v_new_slot_key
      ]::bigint[]) chave(valor)
     where chave.valor is not null
     order by chave.valor
  loop
    perform pg_advisory_xact_lock(v_key);
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$function$;

drop trigger if exists trg_presenca_roster_lock_v2
  on public.aula_alunos_emusys;
create trigger trg_presenca_roster_lock_v2
before insert or update or delete on public.aula_alunos_emusys
for each row execute function public.fn_presenca_roster_lock_trigger_v2();

drop trigger if exists trg_presenca_slot_lock_v2
  on public.aulas_emusys;
create trigger trg_presenca_slot_lock_v2
before insert or update or delete on public.aulas_emusys
for each row execute function public.fn_presenca_slot_lock_trigger_v2();

create or replace function public.fn_criar_comando_presenca_core_v2(
  p_request_id uuid,
  p_tipo text,
  p_unidade_id uuid,
  p_aula_id integer,
  p_itens jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_usuario_id integer;
  v_professor_id integer;
  v_unidade_id uuid := p_unidade_id;
  v_fonte text;
  v_hash text;
  v_existente public.presenca_comandos%rowtype;
  v_item jsonb;
  v_seq integer := 0;
  v_aula_id integer;
  v_aluno_id integer;
  v_status text;
begin
  if p_request_id is null then
    raise exception 'request_id_obrigatorio' using errcode = '22023';
  end if;
  if p_tipo not in (
    'la_teacher_aula', 'fabio_aula', 'fabio_audio_aula', 'fabio_manual_aula'
  ) then
    raise exception 'tipo_comando_v2_invalido' using errcode = '22023';
  end if;
  if p_aula_id is null then
    raise exception 'aula_obrigatoria' using errcode = '22023';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'itens_obrigatorios' using errcode = '22023';
  end if;

  select u.id into v_usuario_id
    from public.usuarios u
   where u.auth_user_id = auth.uid() and coalesce(u.ativo, true)
   limit 1;

  if p_tipo = 'la_teacher_aula' then
    v_professor_id := public.fn_professor_do_usuario();
    if v_professor_id is null then
      raise exception 'sem_professor_vinculado' using errcode = '42501';
    end if;
    select a.unidade_id into v_unidade_id
      from public.aulas_emusys a
     where a.id = p_aula_id and a.professor_id = v_professor_id;
    if not found then
      raise exception 'aula_nao_pertence_ao_professor' using errcode = '42501';
    end if;
    v_fonte := 'professor_la_teacher';
  else
    if coalesce(auth.role(), '') <> 'service_role'
       and current_setting('app.presenca_fabio_trusted', true) is distinct from 'on' then
      raise exception 'service_role_obrigatorio' using errcode = '42501';
    end if;
    select a.unidade_id, a.professor_id
      into v_unidade_id, v_professor_id
      from public.aulas_emusys a
     where a.id = p_aula_id;
    if not found then
      raise exception 'aula_nao_encontrada' using errcode = '23503';
    end if;
    v_fonte := case p_tipo
      when 'fabio_audio_aula' then 'fabio_audio'
      when 'fabio_manual_aula' then 'professor_la_teacher'
      else 'professor_whatsapp'
    end;
  end if;

  if p_unidade_id is not null and p_unidade_id is distinct from v_unidade_id then
    raise exception 'escopo_unidade_invalido' using errcode = '22023';
  end if;

  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'tipo', p_tipo,
    'unidade_id', v_unidade_id,
    'aula_id', p_aula_id,
    'itens', p_itens
  )::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(
    hashtextextended(p_request_id::text, 20260827223000)
  );

  select * into v_existente
    from public.presenca_comandos c
   where c.request_id = p_request_id;
  if found then
    if v_existente.payload_hash is distinct from v_hash
       or v_existente.tipo is distinct from p_tipo then
      raise exception 'request_id_reutilizado' using errcode = '23505';
    end if;
    return public.app_status_comando_presenca_v1(p_request_id);
  end if;

  insert into public.presenca_comandos(
    request_id, tipo, fonte, auth_user_id, usuario_id, unidade_id,
    aula_id, professor_id, payload_hash, itens_total
  ) values (
    p_request_id, p_tipo, v_fonte, auth.uid(), v_usuario_id, v_unidade_id,
    p_aula_id, v_professor_id, v_hash, jsonb_array_length(p_itens)
  );

  for v_item in select value from jsonb_array_elements(p_itens)
  loop
    v_seq := v_seq + 1;
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item ->> 'aula_emusys_id', '') !~ '^[1-9][0-9]*$'
       or coalesce(v_item ->> 'aluno_id', '') !~ '^[1-9][0-9]*$'
       or coalesce(v_item ->> 'status', '') not in ('presente', 'falta') then
      raise exception 'item_invalido_para_tipo_%', p_tipo using errcode = '22023';
    end if;
    v_aula_id := (v_item ->> 'aula_emusys_id')::integer;
    v_aluno_id := (v_item ->> 'aluno_id')::integer;
    v_status := v_item ->> 'status';
    if v_aula_id is distinct from p_aula_id then
      raise exception 'item_fora_da_aula_reservada' using errcode = '22023';
    end if;
    insert into public.presenca_comando_itens(
      request_id, sequencia, aula_id, aluno_id, status_solicitado,
      motivo_codigo, evidencia_path
    ) values (
      p_request_id, v_seq, v_aula_id, v_aluno_id, v_status,
      nullif(btrim(v_item ->> 'motivo'), ''),
      nullif(btrim(v_item ->> 'evidencia_path'), '')
    );
  end loop;

  insert into public.presenca_acao_eventos(
    request_id, sequencia, tipo, fonte, auth_user_id, usuario_id,
    unidade_id, aula_id
  ) values (
    p_request_id, 0, 'recebido', v_fonte, auth.uid(), v_usuario_id,
    v_unidade_id, p_aula_id
  );

  return public.app_status_comando_presenca_v1(p_request_id);
end
$function$;

create or replace function public.fn_validar_comando_roster_reservado_v2(
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_comando public.presenca_comandos%rowtype;
  v_aula public.aulas_emusys%rowtype;
  v_roster_key bigint;
  v_slot_key bigint;
  v_slot_key_atual bigint;
  v_roster_total integer;
  v_roster_distintos integer;
  v_itens_total integer;
  v_itens_distintos integer;
begin
  select * into v_comando
    from public.presenca_comandos c
   where c.request_id = p_request_id;
  if not found then
    raise exception 'comando_nao_encontrado' using errcode = '23503';
  end if;
  if v_comando.tipo not in (
    'la_teacher_aula', 'fabio_aula', 'fabio_audio_aula', 'fabio_manual_aula'
  ) then
    raise exception 'tipo_comando_v2_invalido' using errcode = '22023';
  end if;
  if v_comando.aula_id is null then
    raise exception 'aula_obrigatoria_no_comando_reservado' using errcode = '22023';
  end if;

  select * into v_aula
    from public.aulas_emusys a
   where a.id = v_comando.aula_id;
  if not found then
    raise exception 'aula_nao_encontrada' using errcode = '23503';
  end if;

  v_roster_key := public.fn_presenca_roster_lock_key_v2(v_aula.id);
  v_slot_key := public.fn_presenca_slot_lock_key_v2(
    v_aula.unidade_id, v_aula.professor_id, v_aula.data_hora_inicio,
    v_aula.data_hora_fim, v_aula.curso_nome
  );
  if v_roster_key = v_slot_key then
    perform pg_advisory_xact_lock(v_roster_key);
  else
    perform pg_advisory_xact_lock(least(v_roster_key, v_slot_key));
    perform pg_advisory_xact_lock(greatest(v_roster_key, v_slot_key));
  end if;

  select * into v_aula
    from public.aulas_emusys a
   where a.id = v_comando.aula_id;
  if not found then
    raise exception 'aula_removida_durante_validacao' using errcode = '40001';
  end if;
  v_slot_key_atual := public.fn_presenca_slot_lock_key_v2(
    v_aula.unidade_id, v_aula.professor_id, v_aula.data_hora_inicio,
    v_aula.data_hora_fim, v_aula.curso_nome
  );
  if v_slot_key_atual is distinct from v_slot_key then
    raise exception 'slot_alterado_durante_validacao' using errcode = '40001';
  end if;
  if v_aula.unidade_id is distinct from v_comando.unidade_id then
    raise exception 'unidade_divergente_no_comando' using errcode = '23514';
  end if;
  if v_aula.professor_id is distinct from v_comando.professor_id then
    raise exception 'professor_divergente_no_comando' using errcode = '42501';
  end if;

  if exists (
    select 1
      from public.aulas_emusys g
     where g.unidade_id is not distinct from v_aula.unidade_id
       and g.professor_id is not distinct from v_aula.professor_id
       and g.data_hora_inicio is not distinct from v_aula.data_hora_inicio
       and g.data_hora_fim is not distinct from v_aula.data_hora_fim
       and lower(btrim(coalesce(g.curso_nome, '')))
           = lower(btrim(coalesce(v_aula.curso_nome, '')))
       and (coalesce(g.cancelada, false) or coalesce(g.justificada, false))
  ) then
    raise exception 'slot_cancelado_ou_justificado' using errcode = '23514';
  end if;

  select count(*)::integer, count(distinct r.aluno_id)::integer
    into v_roster_total, v_roster_distintos
    from public.vw_aula_roster_operacional_v2 r
   where r.aula_emusys_id = v_aula.id;
  if v_roster_total = 0 then
    raise exception 'roster_v2_nao_publicado' using errcode = '23514';
  end if;
  if v_roster_total is distinct from v_roster_distintos then
    raise exception 'roster_v2_identidade_duplicada' using errcode = '23514';
  end if;

  select count(*)::integer, count(distinct i.aluno_id)::integer
    into v_itens_total, v_itens_distintos
    from public.presenca_comando_itens i
   where i.request_id = p_request_id;
  if v_itens_total is distinct from v_comando.itens_total
     or v_itens_total is distinct from v_itens_distintos
     or v_itens_total is distinct from v_roster_total then
    raise exception 'payload_diverge_do_roster_v2' using errcode = '23514';
  end if;
  if exists (
    select 1
      from public.presenca_comando_itens i
     where i.request_id = p_request_id
       and (
         i.aula_id is distinct from v_aula.id
         or i.aluno_id is null
         or i.status_solicitado not in ('presente', 'falta')
       )
  ) then
    raise exception 'item_fora_do_roster_v2' using errcode = '23514';
  end if;
  if exists (
    select 1
      from public.vw_aula_roster_operacional_v2 r
     where r.aula_emusys_id = v_aula.id
       and not exists (
         select 1 from public.presenca_comando_itens i
          where i.request_id = p_request_id and i.aluno_id = r.aluno_id
       )
  ) or exists (
    select 1
      from public.presenca_comando_itens i
     where i.request_id = p_request_id
       and not exists (
         select 1 from public.vw_aula_roster_operacional_v2 r
          where r.aula_emusys_id = v_aula.id and r.aluno_id = i.aluno_id
       )
  ) then
    raise exception 'payload_diverge_do_roster_v2' using errcode = '23514';
  end if;
end
$function$;

create or replace function public.fn_aplicar_comando_presenca_core_v2(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_comando public.presenca_comandos%rowtype;
  v_aula public.aulas_emusys%rowtype;
  v_item public.presenca_comando_itens%rowtype;
  v_aplicados integer := 0;
  v_rejeitados integer := 0;
  v_evento_seq integer := 0;
  v_status_efetivo text;
  v_gemeos integer;
  v_gravados_alunos integer[] := '{}'::integer[];
begin
  if p_request_id is null then
    raise exception 'request_id_obrigatorio' using errcode = '22023';
  end if;

  select * into v_comando
    from public.presenca_comandos c
   where c.request_id = p_request_id
   for update;
  if not found then
    return public.app_status_comando_presenca_v1(p_request_id);
  end if;
  if coalesce(auth.role(), '') <> 'service_role'
     and v_comando.auth_user_id is distinct from auth.uid() then
    raise exception 'sem_permissao_comando' using errcode = '42501';
  end if;
  if v_comando.status in ('concluido', 'parcial', 'falhou') then
    return public.app_status_comando_presenca_v1(p_request_id);
  end if;

  perform public.fn_validar_comando_roster_reservado_v2(p_request_id);

  select * into strict v_aula
    from public.aulas_emusys a
   where a.id = v_comando.aula_id;

  update public.presenca_comandos c
     set status = 'processando',
         iniciado_em = coalesce(c.iniciado_em, clock_timestamp()),
         atualizado_em = clock_timestamp()
   where c.request_id = p_request_id;

  with gravados as (
    insert into public.aluno_presenca(
      aluno_id, aula_emusys_id, professor_id, unidade_id, data_aula,
      horario_aula, status, status_presenca, curso_nome, turma_nome,
      sala_nome, respondido_por, respondido_em
    )
    select
      r.aluno_id,
      v_aula.id,
      v_comando.professor_id,
      v_aula.unidade_id,
      v_aula.data_aula,
      (v_aula.data_hora_inicio at time zone 'America/Sao_Paulo')::time,
      case when i.status_solicitado = 'falta' then 'ausente' else 'presente' end,
      i.status_solicitado,
      v_aula.curso_nome,
      v_aula.turma_nome,
      v_aula.sala_nome,
      v_comando.fonte,
      clock_timestamp()
    from public.vw_aula_roster_operacional_v2 r
    join public.presenca_comando_itens i
      on i.request_id = p_request_id
     and i.aula_id = r.aula_emusys_id
     and i.aluno_id = r.aluno_id
    where r.aula_emusys_id = v_aula.id
    on conflict (aluno_id, aula_emusys_id) do update set
      status = excluded.status,
      status_presenca = excluded.status_presenca,
      respondido_por = excluded.respondido_por,
      respondido_em = excluded.respondido_em
    where not public.fn_presenca_e_forte(aluno_presenca.respondido_por)
    returning aluno_id
  )
  select coalesce(array_agg(g.aluno_id order by g.aluno_id), '{}'::integer[])
    into v_gravados_alunos
    from gravados g;

  v_gemeos := public.fn_sincronizar_gemeos_presenca(v_aula.id);

  select coalesce(max(e.sequencia), 0)::integer
    into v_evento_seq
    from public.presenca_acao_eventos e
   where e.request_id = p_request_id;

  for v_item in
    select * from public.presenca_comando_itens i
     where i.request_id = p_request_id
     order by i.sequencia
  loop
    v_evento_seq := v_evento_seq + 1;
    select coalesce(
      ap.status_presenca,
      case ap.status when 'presente' then 'presente' when 'ausente' then 'falta' end
    ) into v_status_efetivo
      from public.aluno_presenca ap
     where ap.aula_emusys_id = v_item.aula_id
       and ap.aluno_id = v_item.aluno_id;

    if v_status_efetivo is not distinct from v_item.status_solicitado
       and v_item.aluno_id = any(v_gravados_alunos) then
      insert into public.presenca_acao_eventos(
        request_id, sequencia, tipo, fonte, auth_user_id, usuario_id,
        unidade_id, aula_id, aluno_id, status_novo
      ) values (
        p_request_id, v_evento_seq, 'item_aplicado', v_comando.fonte,
        v_comando.auth_user_id, v_comando.usuario_id, v_comando.unidade_id,
        v_item.aula_id, v_item.aluno_id, v_status_efetivo
      );
      v_aplicados := v_aplicados + 1;
    else
      insert into public.presenca_acao_eventos(
        request_id, sequencia, tipo, fonte, auth_user_id, usuario_id,
        unidade_id, aula_id, aluno_id, status_anterior, status_novo,
        erro_codigo
      ) values (
        p_request_id, v_evento_seq, 'item_rejeitado', v_comando.fonte,
        v_comando.auth_user_id, v_comando.usuario_id, v_comando.unidade_id,
        v_item.aula_id, v_item.aluno_id, v_status_efetivo,
        v_item.status_solicitado,
        case
          when v_status_efetivo is not distinct from v_item.status_solicitado
            then 'PRESENCA_JA_REGISTRADA'
          else 'DECISAO_FORTE_PRESERVADA'
        end
      );
      v_rejeitados := v_rejeitados + 1;
    end if;
  end loop;

  update public.presenca_comandos c
     set status = case
           when v_rejeitados = 0 then 'concluido'
           when v_aplicados = 0 then 'falhou'
           else 'parcial'
         end,
         itens_aplicados = v_aplicados,
         itens_rejeitados = v_rejeitados,
         concluido_em = clock_timestamp(),
         atualizado_em = clock_timestamp()
   where c.request_id = p_request_id;

  v_evento_seq := v_evento_seq + 1;
  insert into public.presenca_acao_eventos(
    request_id, sequencia, tipo, fonte, auth_user_id, usuario_id,
    unidade_id, aula_id, erro_codigo
  ) values (
    p_request_id,
    v_evento_seq,
    case when v_aplicados = 0 and v_rejeitados > 0 then 'falhou' else 'concluido' end,
    v_comando.fonte,
    v_comando.auth_user_id,
    v_comando.usuario_id,
    v_comando.unidade_id,
    v_comando.aula_id,
    case when v_rejeitados > 0 then 'ITENS_REJEITADOS' end
  );

  return public.app_status_comando_presenca_v1(p_request_id)
    || jsonb_build_object('gemeos_sincronizados', coalesce(v_gemeos, 0));
end
$function$;

revoke all on function public.fn_presenca_roster_lock_key_v2(integer)
  from public, anon, authenticated, service_role;
revoke all on function public.fn_presenca_slot_lock_key_v2(
  uuid, integer, timestamptz, timestamptz, text
) from public, anon, authenticated, service_role;
revoke all on function public.fn_presenca_roster_lock_trigger_v2()
  from public, anon, authenticated, service_role;
revoke all on function public.fn_presenca_slot_lock_trigger_v2()
  from public, anon, authenticated, service_role;
revoke all on function public.fn_criar_comando_presenca_core_v2(
  uuid, text, uuid, integer, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.fn_validar_comando_roster_reservado_v2(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.fn_aplicar_comando_presenca_core_v2(uuid)
  from public, anon, authenticated, service_role;

comment on function public.fn_validar_comando_roster_reservado_v2(uuid) is
  'Valida sob os mesmos locks que o comando representa exatamente um roster v2 publicado e um slot sem cancelamento ou justificativa.';
comment on function public.fn_aplicar_comando_presenca_core_v2(uuid) is
  'Nucleo privado fail-closed: nao captura SQLSTATE transitorio e nunca terminaliza uma tentativa retryable.';

commit;
