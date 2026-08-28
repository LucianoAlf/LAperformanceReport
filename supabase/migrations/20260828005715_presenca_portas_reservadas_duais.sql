-- Portas publicas v2 em paralelo. O roster e materializado a partir da view
-- publicada somente depois dos mesmos locks de roster/slot usados pelos cores.
-- Nenhuma funcao v1 ou assinatura direta do LA Teacher e redefinida aqui.

begin;

create or replace function public.app_criar_comando_chamada_professor_v2(
  p_request_id uuid,
  p_aula_emusys_id integer,
  p_alunos_ausentes integer[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_aula public.aulas_emusys%rowtype;
  v_professor_id integer;
  v_ausentes integer[] := coalesce(p_alunos_ausentes, '{}'::integer[]);
  v_slot_key bigint;
  v_slot_key_atual bigint;
  v_itens jsonb;
  v_existente public.presenca_comandos%rowtype;
  v_ausentes_existentes integer[];
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    raise exception 'authenticated_obrigatorio' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'request_id_obrigatorio' using errcode = '22023';
  end if;
  if p_aula_emusys_id is null then
    raise exception 'aula_obrigatoria' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_ausentes) ausente(aluno_id)
     where ausente.aluno_id is null
  ) or cardinality(v_ausentes) <> (
    select count(distinct ausente.aluno_id)::integer
      from unnest(v_ausentes) ausente(aluno_id)
  ) then
    raise exception 'alunos_ausentes_invalidos' using errcode = '22023';
  end if;

  v_professor_id := public.fn_professor_do_usuario();
  if v_professor_id is null then
    raise exception 'sem_professor_vinculado' using errcode = '42501';
  end if;

  select coalesce(array_agg(a.aluno_id order by a.aluno_id), '{}'::integer[])
    into v_ausentes
    from unnest(v_ausentes) a(aluno_id);

  select * into v_existente
    from public.presenca_comandos c
   where c.request_id = p_request_id;
  if found then
    select coalesce(
      array_agg(i.aluno_id order by i.aluno_id)
        filter (where i.status_solicitado = 'falta'),
      '{}'::integer[]
    )
      into v_ausentes_existentes
      from public.presenca_comando_itens i
     where i.request_id = p_request_id;
    if v_existente.tipo is distinct from 'la_teacher_aula'
       or v_existente.fonte is distinct from 'professor_la_teacher'
       or v_existente.auth_user_id is distinct from auth.uid()
       or v_existente.aula_id is distinct from p_aula_emusys_id
       or v_existente.professor_id is distinct from v_professor_id
       or v_ausentes_existentes is distinct from v_ausentes then
      raise exception 'request_id_reutilizado' using errcode = '23505';
    end if;
    return public.app_status_comando_presenca_v1(p_request_id);
  end if;

  select * into v_aula
    from public.aulas_emusys a
   where a.id = p_aula_emusys_id;
  if not found then
    raise exception 'aula_nao_encontrada' using errcode = '23503';
  end if;
  if v_aula.professor_id is distinct from v_professor_id then
    raise exception 'aula_nao_pertence_ao_professor' using errcode = '42501';
  end if;

  v_slot_key := public.fn_presenca_bloquear_slot_rosters_v2(v_aula.id);

  select * into v_aula
    from public.aulas_emusys a
   where a.id = p_aula_emusys_id;
  if not found then
    raise exception 'aula_removida_durante_criacao' using errcode = '40001';
  end if;
  v_slot_key_atual := public.fn_presenca_slot_lock_key_v2(
    v_aula.unidade_id,
    v_aula.professor_id,
    v_aula.data_hora_inicio,
    v_aula.data_hora_fim,
    v_aula.curso_nome
  );
  if v_slot_key_atual is distinct from v_slot_key then
    raise exception 'slot_alterado_durante_criacao' using errcode = '40001';
  end if;
  if v_aula.professor_id is distinct from v_professor_id then
    raise exception 'aula_nao_pertence_ao_professor' using errcode = '42501';
  end if;

  if exists (
    select 1
      from unnest(v_ausentes) ausente(aluno_id)
     where not exists (
       select 1
         from public.vw_aula_roster_operacional_v2 roster
        where roster.aula_emusys_id = v_aula.id
          and roster.aluno_id = ausente.aluno_id
     )
  ) then
    raise exception 'aluno_ausente_fora_do_roster' using errcode = '22023';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'aula_emusys_id', roster.aula_emusys_id,
      'aluno_id', roster.aluno_id,
      'status', case
        when roster.aluno_id = any(v_ausentes) then 'falta'
        else 'presente'
      end
    ) order by roster.aluno_id
  ) into v_itens
    from public.vw_aula_roster_operacional_v2 roster
   where roster.aula_emusys_id = v_aula.id;

  if v_itens is null then
    raise exception 'roster_nao_confirmado' using errcode = '23514';
  end if;

  return public.fn_criar_comando_presenca_core_v2(
    p_request_id,
    'la_teacher_aula',
    v_aula.unidade_id,
    v_aula.id,
    v_itens
  );
end
$function$;

create or replace function public.fabio_criar_comando_chamada_v2(
  p_request_id uuid,
  p_professor_id integer,
  p_aula_emusys_id integer,
  p_alunos_ausentes integer[],
  p_fonte text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_aula public.aulas_emusys%rowtype;
  v_ausentes integer[] := coalesce(p_alunos_ausentes, '{}'::integer[]);
  v_slot_key bigint;
  v_slot_key_atual bigint;
  v_itens jsonb;
  v_tipo text;
  v_existente public.presenca_comandos%rowtype;
  v_ausentes_existentes integer[];
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_obrigatorio' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'request_id_obrigatorio' using errcode = '22023';
  end if;
  if p_professor_id is null or p_aula_emusys_id is null then
    raise exception 'contexto_professor_aula_obrigatorio' using errcode = '22023';
  end if;
  if p_fonte is null or p_fonte not in (
    'professor_whatsapp', 'fabio_audio', 'professor_la_teacher'
  ) then
    raise exception 'fonte_fabio_invalida' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_ausentes) ausente(aluno_id)
     where ausente.aluno_id is null
  ) or cardinality(v_ausentes) <> (
    select count(distinct ausente.aluno_id)::integer
      from unnest(v_ausentes) ausente(aluno_id)
  ) then
    raise exception 'alunos_ausentes_invalidos' using errcode = '22023';
  end if;

  select coalesce(array_agg(a.aluno_id order by a.aluno_id), '{}'::integer[])
    into v_ausentes
    from unnest(v_ausentes) a(aluno_id);

  v_tipo := case p_fonte
    when 'fabio_audio' then 'fabio_audio_aula'
    when 'professor_la_teacher' then 'fabio_manual_aula'
    else 'fabio_aula'
  end;

  select * into v_existente
    from public.presenca_comandos c
   where c.request_id = p_request_id;
  if found then
    select coalesce(
      array_agg(i.aluno_id order by i.aluno_id)
        filter (where i.status_solicitado = 'falta'),
      '{}'::integer[]
    )
      into v_ausentes_existentes
      from public.presenca_comando_itens i
     where i.request_id = p_request_id;
    if v_existente.tipo is distinct from v_tipo
       or v_existente.fonte is distinct from p_fonte
       or v_existente.aula_id is distinct from p_aula_emusys_id
       or v_existente.professor_id is distinct from p_professor_id
       or v_ausentes_existentes is distinct from v_ausentes then
      raise exception 'request_id_reutilizado' using errcode = '23505';
    end if;
    return public.app_status_comando_presenca_v1(p_request_id);
  end if;

  select * into v_aula
    from public.aulas_emusys a
   where a.id = p_aula_emusys_id;
  if not found then
    raise exception 'aula_nao_encontrada' using errcode = '23503';
  end if;
  if v_aula.professor_id is distinct from p_professor_id then
    raise exception 'aula_nao_pertence_ao_professor' using errcode = '42501';
  end if;

  v_slot_key := public.fn_presenca_bloquear_slot_rosters_v2(v_aula.id);

  select * into v_aula
    from public.aulas_emusys a
   where a.id = p_aula_emusys_id;
  if not found then
    raise exception 'aula_removida_durante_criacao' using errcode = '40001';
  end if;
  v_slot_key_atual := public.fn_presenca_slot_lock_key_v2(
    v_aula.unidade_id,
    v_aula.professor_id,
    v_aula.data_hora_inicio,
    v_aula.data_hora_fim,
    v_aula.curso_nome
  );
  if v_slot_key_atual is distinct from v_slot_key then
    raise exception 'slot_alterado_durante_criacao' using errcode = '40001';
  end if;
  if v_aula.professor_id is distinct from p_professor_id then
    raise exception 'aula_nao_pertence_ao_professor' using errcode = '42501';
  end if;

  if exists (
    select 1
      from unnest(v_ausentes) ausente(aluno_id)
     where not exists (
       select 1
         from public.vw_aula_roster_operacional_v2 roster
        where roster.aula_emusys_id = v_aula.id
          and roster.aluno_id = ausente.aluno_id
     )
  ) then
    raise exception 'aluno_ausente_fora_do_roster' using errcode = '22023';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'aula_emusys_id', roster.aula_emusys_id,
      'aluno_id', roster.aluno_id,
      'status', case
        when roster.aluno_id = any(v_ausentes) then 'falta'
        else 'presente'
      end
    ) order by roster.aluno_id
  ) into v_itens
    from public.vw_aula_roster_operacional_v2 roster
   where roster.aula_emusys_id = v_aula.id;

  if v_itens is null then
    raise exception 'roster_nao_confirmado' using errcode = '23514';
  end if;

  return public.fn_criar_comando_presenca_core_v2(
    p_request_id,
    v_tipo,
    v_aula.unidade_id,
    v_aula.id,
    v_itens
  );
end
$function$;

create or replace function public.app_aplicar_comando_presenca_v2(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_comando public.presenca_comandos%rowtype;
  v_item public.presenca_comando_itens%rowtype;
  v_evento_seq integer;
  v_rejeitados integer := 0;
  v_sqlstate text;
  v_mensagem text;
  v_erro_codigo text;
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'service_role') then
    raise exception 'papel_nao_autorizado' using errcode = '42501';
  end if;
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
  if v_comando.tipo not in (
    'la_teacher_aula', 'fabio_aula', 'fabio_audio_aula', 'fabio_manual_aula'
  ) then
    raise exception 'comando_nao_pertence_a_porta_v2' using errcode = '22023';
  end if;
  if v_comando.status in ('concluido', 'parcial', 'falhou') then
    return public.app_status_comando_presenca_v1(p_request_id);
  end if;

  begin
    return public.fn_aplicar_comando_presenca_core_v2(p_request_id);
  exception
    when sqlstate '22023'
      or sqlstate '23503'
      or sqlstate '23505'
      or sqlstate '23514'
      or sqlstate '42501' then
      get stacked diagnostics
        v_sqlstate = returned_sqlstate,
        v_mensagem = message_text;
      v_erro_codigo := case
        when v_mensagem in (
          'roster_v2_nao_publicado',
          'roster_v2_identidade_duplicada',
          'payload_diverge_do_roster_v2',
          'item_fora_do_roster_v2'
        ) then 'ROSTER_NAO_CONFIRMADO'
        when v_mensagem = 'slot_cancelado_ou_justificado' then 'AULA_CANCELADA'
        when v_mensagem = 'chamada_ainda_nao_disponivel' then
          'CHAMADA_AINDA_NAO_DISPONIVEL'
        when v_mensagem = 'janela_de_chamada_encerrada' then
          'JANELA_DE_CHAMADA_ENCERRADA'
        else v_sqlstate
      end;

      select coalesce(max(e.sequencia), 0)::integer
        into v_evento_seq
        from public.presenca_acao_eventos e
       where e.request_id = p_request_id;

      for v_item in
        select *
          from public.presenca_comando_itens i
         where i.request_id = p_request_id
         order by i.sequencia
      loop
        v_evento_seq := v_evento_seq + 1;
        insert into public.presenca_acao_eventos(
          request_id,
          sequencia,
          tipo,
          fonte,
          auth_user_id,
          usuario_id,
          unidade_id,
          aula_id,
          aluno_id,
          erro_codigo
        ) values (
          p_request_id,
          v_evento_seq,
          'item_rejeitado',
          v_comando.fonte,
          v_comando.auth_user_id,
          v_comando.usuario_id,
          v_comando.unidade_id,
          v_item.aula_id,
          v_item.aluno_id,
          v_erro_codigo
        );
        v_rejeitados := v_rejeitados + 1;
      end loop;

      update public.presenca_comandos c
         set status = 'falhou',
             itens_aplicados = 0,
             itens_rejeitados = v_rejeitados,
             iniciado_em = coalesce(c.iniciado_em, clock_timestamp()),
             concluido_em = clock_timestamp(),
             atualizado_em = clock_timestamp()
       where c.request_id = p_request_id;

      v_evento_seq := v_evento_seq + 1;
      insert into public.presenca_acao_eventos(
        request_id,
        sequencia,
        tipo,
        fonte,
        auth_user_id,
        usuario_id,
        unidade_id,
        aula_id,
        erro_codigo
      ) values (
        p_request_id,
        v_evento_seq,
        'falhou',
        v_comando.fonte,
        v_comando.auth_user_id,
        v_comando.usuario_id,
        v_comando.unidade_id,
        v_comando.aula_id,
        v_erro_codigo
      );

      return public.app_status_comando_presenca_v1(p_request_id);
  end;
end
$function$;

revoke all on function public.app_criar_comando_chamada_professor_v2(
  uuid, integer, integer[]
) from public, anon, authenticated, service_role;
grant execute on function public.app_criar_comando_chamada_professor_v2(
  uuid, integer, integer[]
) to authenticated;

revoke all on function public.fabio_criar_comando_chamada_v2(
  uuid, integer, integer, integer[], text
) from public, anon, authenticated, service_role;
grant execute on function public.fabio_criar_comando_chamada_v2(
  uuid, integer, integer, integer[], text
) to service_role;

revoke all on function public.app_aplicar_comando_presenca_v2(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.app_aplicar_comando_presenca_v2(uuid)
  to authenticated, service_role;

comment on function public.app_criar_comando_chamada_professor_v2(
  uuid, integer, integer[]
) is
  'Porta autenticada v2: trava roster e slot, valida ownership e delega somente ao core reservado.';
comment on function public.fabio_criar_comando_chamada_v2(
  uuid, integer, integer, integer[], text
) is
  'Porta service-only v2: exige contexto Fabio coerente e delega somente ao core reservado.';
comment on function public.app_aplicar_comando_presenca_v2(uuid) is
  'Porta v2 de apply: persiste apenas rejeicoes terminais conhecidas e propaga falhas retryable.';

commit;
