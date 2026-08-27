-- A porta do professor materializa a intencao sobre o roster operacional no banco.

create or replace function public.fn_registrar_presencas_core(
  p_aula_ancora_id integer,
  p_professor_id integer,
  p_alunos_ausentes integer[] default '{}'::integer[],
  p_respondido_por text default 'professor_la_teacher'::text,
  p_estrito boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_aula public.aulas_emusys%rowtype;
  v_roster_total integer;
  v_sem_vinculo integer;
  v_inseridos integer;
  v_promovidos integer;
  v_gemeos integer;
begin
  if p_respondido_por not in ('professor_la_teacher','fabio_audio','professor_whatsapp') then
    raise exception 'respondido_por_invalido';
  end if;
  select * into v_aula from public.aulas_emusys where id=p_aula_ancora_id;
  if not found then
    if p_estrito then raise exception 'aula_nao_encontrada'; end if;
    return jsonb_build_object('aula_id',p_aula_ancora_id,'aplicado',false,'motivo','aula_nao_encontrada');
  end if;
  if coalesce(v_aula.cancelada,false) then
    if p_estrito then raise exception 'aula_cancelada'; end if;
    return jsonb_build_object('aula_id',v_aula.id,'aplicado',false,'motivo','aula_cancelada');
  end if;
  if v_aula.professor_id is distinct from p_professor_id then
    if p_estrito then raise exception 'aula_nao_pertence_ao_professor' using errcode='42501'; end if;
    return jsonb_build_object('aula_id',v_aula.id,'aplicado',false,'motivo','professor_divergente');
  end if;
  if p_estrito then
    if v_aula.data_hora_inicio > now()+interval '15 minutes' then raise exception 'chamada_ainda_nao_disponivel'; end if;
    if coalesce(v_aula.data_hora_fim,v_aula.data_hora_inicio) < now()-(public.fn_janela_registro_dias()||' days')::interval then
      raise exception 'janela_de_chamada_encerrada';
    end if;
  end if;
  if not exists(
    select 1 from public.aula_roster_sync_estado e
    where e.aula_id=v_aula.id and e.estado='completo'
  ) then raise exception 'roster_nao_confirmado'; end if;

  select count(*), count(*) filter(where aluno_id is null)
    into v_roster_total,v_sem_vinculo
    from public.aula_alunos_emusys
   where aula_emusys_id=v_aula.id and ativo_operacional;
  if v_roster_total=0 then raise exception 'roster_nao_sincronizado'; end if;
  if v_sem_vinculo>0 then raise exception 'roster_incompleto'; end if;
  if exists(
    select 1 from unnest(coalesce(p_alunos_ausentes,'{}'::integer[])) a(aluno_id)
     where not exists(
       select 1 from public.aula_alunos_emusys r
        where r.aula_emusys_id=v_aula.id and r.aluno_id=a.aluno_id and r.ativo_operacional
     )
  ) then raise exception 'aluno_ausente_fora_do_roster'; end if;

  with up as (
    insert into public.aluno_presenca(
      aluno_id,aula_emusys_id,professor_id,unidade_id,data_aula,horario_aula,
      status,status_presenca,curso_nome,turma_nome,sala_nome,respondido_por,respondido_em
    )
    select distinct r.aluno_id,v_aula.id,p_professor_id,v_aula.unidade_id,v_aula.data_aula,
      (v_aula.data_hora_inicio at time zone 'America/Sao_Paulo')::time,
      case when r.aluno_id=any(coalesce(p_alunos_ausentes,'{}'::integer[])) then 'ausente' else 'presente' end,
      case when r.aluno_id=any(coalesce(p_alunos_ausentes,'{}'::integer[])) then 'falta' else 'presente' end,
      v_aula.curso_nome,v_aula.turma_nome,v_aula.sala_nome,p_respondido_por,now()
    from public.aula_alunos_emusys r
    where r.aula_emusys_id=v_aula.id and r.aluno_id is not null and r.ativo_operacional
    on conflict(aluno_id,aula_emusys_id) do update set
      status=excluded.status,status_presenca=excluded.status_presenca,
      respondido_por=excluded.respondido_por,respondido_em=excluded.respondido_em
    where not public.fn_presenca_e_forte(aluno_presenca.respondido_por)
    returning (xmax=0) as inserido
  )
  select count(*) filter(where inserido),count(*) filter(where not inserido)
    into v_inseridos,v_promovidos from up;

  v_gemeos := public.fn_sincronizar_gemeos_presenca(v_aula.id);
  return jsonb_build_object(
    'aula_id',v_aula.id,'total_roster',v_roster_total,
    'inseridos',coalesce(v_inseridos,0),'promovidos',coalesce(v_promovidos,0),
    'ja_havia_forte',v_roster_total-coalesce(v_inseridos,0)-coalesce(v_promovidos,0),
    'gemeos_sincronizados',coalesce(v_gemeos,0),'aplicado',true
  );
end
$function$;

create or replace function public.app_criar_comando_chamada_professor_v1(
  p_request_id uuid,
  p_aula_emusys_id integer,
  p_alunos_ausentes integer[] default '{}'::integer[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_itens jsonb;
begin
  if not exists(select 1 from public.aula_roster_sync_estado where aula_id=p_aula_emusys_id and estado='completo') then
    raise exception 'roster_nao_confirmado';
  end if;
  select jsonb_agg(jsonb_build_object(
    'aula_emusys_id',r.aula_emusys_id,
    'aluno_id',r.aluno_id,
    'status',case when r.aluno_id=any(coalesce(p_alunos_ausentes,'{}'::integer[])) then 'falta' else 'presente' end
  ) order by r.aluno_id)
  into v_itens
  from public.aula_alunos_emusys r
  where r.aula_emusys_id=p_aula_emusys_id and r.ativo_operacional and r.aluno_id is not null;

  if v_itens is null then raise exception 'roster_nao_sincronizado'; end if;
  if exists(
    select 1 from unnest(coalesce(p_alunos_ausentes,'{}'::integer[])) x(aluno_id)
    where not exists(
      select 1 from public.aula_alunos_emusys r
      where r.aula_emusys_id=p_aula_emusys_id and r.aluno_id=x.aluno_id and r.ativo_operacional
    )
  ) then raise exception 'aluno_ausente_fora_do_roster'; end if;

  return public.app_criar_comando_presenca_v1(
    p_request_id,'la_teacher_aula',null,p_aula_emusys_id,v_itens
  );
end
$function$;

create or replace function public.fabio_criar_comando_chamada_v1(
  p_request_id uuid,
  p_professor_id integer,
  p_aula_emusys_id integer,
  p_alunos_ausentes integer[] default '{}'::integer[],
  p_fonte text default 'professor_whatsapp'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_itens jsonb;
begin
  perform set_config('app.presenca_fabio_trusted','on',true);
  if not exists(select 1 from public.aula_roster_sync_estado where aula_id=p_aula_emusys_id and estado='completo') then
    raise exception 'roster_nao_confirmado';
  end if;
  if not exists(select 1 from public.aulas_emusys where id=p_aula_emusys_id and professor_id=p_professor_id) then
    raise exception 'aula_nao_pertence_ao_professor' using errcode='42501';
  end if;
  if p_fonte not in ('professor_whatsapp','fabio_audio','professor_la_teacher') then
    raise exception 'fonte_fabio_invalida' using errcode='22023';
  end if;
  select jsonb_agg(jsonb_build_object(
    'aula_emusys_id',r.aula_emusys_id,'aluno_id',r.aluno_id,
    'status',case when r.aluno_id=any(coalesce(p_alunos_ausentes,'{}'::integer[])) then 'falta' else 'presente' end
  ) order by r.aluno_id) into v_itens
  from public.aula_alunos_emusys r
  where r.aula_emusys_id=p_aula_emusys_id and r.ativo_operacional and r.aluno_id is not null;
  if v_itens is null then raise exception 'roster_nao_sincronizado'; end if;
  return public.app_criar_comando_presenca_v1(
    p_request_id,
    case p_fonte when 'fabio_audio' then 'fabio_audio_aula'
      when 'professor_la_teacher' then 'fabio_manual_aula' else 'fabio_aula' end,
    null,p_aula_emusys_id,v_itens
  );
end
$function$;

revoke all on function public.app_criar_comando_chamada_professor_v1(uuid,integer,integer[]) from public,anon;
grant execute on function public.app_criar_comando_chamada_professor_v1(uuid,integer,integer[]) to authenticated;
revoke all on function public.fabio_criar_comando_chamada_v1(uuid,integer,integer,integer[],text) from public,anon,authenticated;
grant execute on function public.fabio_criar_comando_chamada_v1(uuid,integer,integer,integer[],text) to service_role;
