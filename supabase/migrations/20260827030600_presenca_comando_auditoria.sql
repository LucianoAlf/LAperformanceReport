-- Checkpoint 4: recibo duravel e idempotencia para toda escrita humana de presenca.

create table if not exists public.presenca_comandos (
  request_id uuid primary key,
  tipo text not null check (tipo in (
    'agenda_chamada', 'la_teacher_aula', 'fabio_aula', 'fabio_audio_aula', 'fabio_manual_aula',
    'professor_aula', 'professor_dia', 'professor_dia_remover'
  )),
  fonte text not null check (fonte in (
    'agenda_secretaria', 'professor_la_teacher', 'professor_whatsapp', 'fabio_audio'
  )),
  auth_user_id uuid,
  usuario_id integer,
  unidade_id uuid,
  aula_id integer,
  professor_id integer,
  data_referencia date,
  status text not null default 'recebido' check (status in (
    'recebido', 'processando', 'concluido', 'parcial', 'falhou'
  )),
  payload_hash text not null,
  itens_total integer not null default 0 check (itens_total >= 0),
  itens_aplicados integer not null default 0 check (itens_aplicados >= 0),
  itens_rejeitados integer not null default 0 check (itens_rejeitados >= 0),
  criado_em timestamptz not null default clock_timestamp(),
  iniciado_em timestamptz,
  concluido_em timestamptz,
  atualizado_em timestamptz not null default clock_timestamp()
);

create table if not exists public.presenca_comando_itens (
  request_id uuid not null references public.presenca_comandos(request_id),
  sequencia integer not null check (sequencia > 0),
  aula_id integer,
  aluno_id integer,
  professor_id integer,
  data_referencia date,
  status_solicitado text not null check (status_solicitado in (
    'presente', 'falta', 'falta_justificada', 'indeterminado', 'ausente'
  )),
  motivo_codigo text,
  evidencia_path text,
  primary key (request_id, sequencia)
);

create table if not exists public.presenca_acao_eventos (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.presenca_comandos(request_id),
  sequencia integer not null,
  tipo text not null check (tipo in (
    'recebido', 'item_aplicado', 'item_rejeitado', 'concluido', 'falhou'
  )),
  fonte text not null,
  auth_user_id uuid,
  usuario_id integer,
  unidade_id uuid,
  aula_id integer,
  aluno_id integer,
  professor_id integer,
  status_anterior text,
  status_novo text,
  erro_codigo text,
  criado_em timestamptz not null default clock_timestamp(),
  unique (request_id, sequencia)
);

create index if not exists idx_presenca_comandos_status_criado
  on public.presenca_comandos(status, criado_em);
create index if not exists idx_presenca_acao_eventos_request
  on public.presenca_acao_eventos(request_id, sequencia);

alter table public.presenca_comandos enable row level security;
alter table public.presenca_comando_itens enable row level security;
alter table public.presenca_acao_eventos enable row level security;

revoke all on table public.presenca_comandos from public, anon, authenticated;
revoke all on table public.presenca_comando_itens from public, anon, authenticated;
revoke all on table public.presenca_acao_eventos from public, anon, authenticated;
grant select on table public.presenca_comandos, public.presenca_comando_itens,
  public.presenca_acao_eventos to service_role;

create or replace function public.fn_presenca_comando_eventos_append_only()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  raise exception 'presenca_acao_eventos_append_only' using errcode = '55000';
end
$function$;

drop trigger if exists trg_presenca_acao_eventos_append_only on public.presenca_acao_eventos;
create trigger trg_presenca_acao_eventos_append_only
before update or delete on public.presenca_acao_eventos
for each row execute function public.fn_presenca_comando_eventos_append_only();

revoke all on function public.fn_presenca_comando_eventos_append_only()
  from public, anon, authenticated;

create or replace function public.app_status_comando_presenca_v1(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_comando public.presenca_comandos%rowtype;
begin
  select * into v_comando
    from public.presenca_comandos
   where request_id = p_request_id;
  if not found then
    return jsonb_build_object(
      'request_id', p_request_id,
      'status', 'nao_recebido',
      'aplicados', 0,
      'rejeitados', 0,
      'erros', '[]'::jsonb
    );
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and v_comando.auth_user_id is distinct from auth.uid() then
    raise exception 'sem_permissao_comando' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'request_id', v_comando.request_id,
    'status', v_comando.status,
    'aplicados', v_comando.itens_aplicados,
    'rejeitados', v_comando.itens_rejeitados,
    'recebido_em', v_comando.criado_em,
    'concluido_em', v_comando.concluido_em,
    'erros', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'aluno_id', e.aluno_id,
        'professor_id', e.professor_id,
        'codigo', e.erro_codigo
      )) order by e.sequencia)
      from public.presenca_acao_eventos e
      where e.request_id = v_comando.request_id
        and e.tipo = 'item_rejeitado'
    ), '[]'::jsonb)
  );
end
$function$;

create or replace function public.app_criar_comando_presenca_v1(
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
  v_item_professor_id integer;
  v_status text;
  v_data date;
  v_unidades integer;
begin
  if p_request_id is null then
    raise exception 'request_id_obrigatorio' using errcode = '22023';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'itens_obrigatorios' using errcode = '22023';
  end if;

  select id into v_usuario_id from public.usuarios
   where auth_user_id = auth.uid() and coalesce(ativo, true) limit 1;

  if p_tipo = 'agenda_chamada' then
    if v_usuario_id is null then
      raise exception 'sem_permissao_chamada' using errcode = '42501';
    end if;
    select min(a.unidade_id::text)::uuid, count(distinct a.unidade_id)
      into v_unidade_id, v_unidades
      from public.aulas_emusys a
     where a.id in (
       select (x->>'aula_emusys_id')::integer from jsonb_array_elements(p_itens) x
     );
    if v_unidade_id is null or v_unidades <> 1
       or (p_unidade_id is not null and p_unidade_id is distinct from v_unidade_id) then
      raise exception 'escopo_unidade_invalido' using errcode = '22023';
    end if;
    if not public.usuario_tem_permissao(v_usuario_id, 'agenda.chamada', v_unidade_id) then
      raise exception 'sem_permissao_unidade' using errcode = '42501';
    end if;
    v_fonte := 'agenda_secretaria';
  elsif p_tipo in ('professor_aula', 'professor_dia', 'professor_dia_remover') then
    if p_tipo = 'professor_aula' then
      select unidade_id into v_unidade_id from public.aulas_emusys where id=p_aula_id;
      if v_unidade_id is null or (p_unidade_id is not null and p_unidade_id is distinct from v_unidade_id) then
        raise exception 'escopo_unidade_invalido' using errcode='22023';
      end if;
    end if;
    if v_usuario_id is null or v_unidade_id is null
       or not public.usuario_tem_permissao(v_usuario_id, 'agenda.chamada', v_unidade_id) then
      raise exception 'sem_permissao_unidade' using errcode = '42501';
    end if;
    v_fonte := 'agenda_secretaria';
  elsif p_tipo = 'la_teacher_aula' then
    v_professor_id := public.fn_professor_do_usuario();
    if v_professor_id is null then
      raise exception 'sem_professor_vinculado' using errcode = '42501';
    end if;
    select unidade_id into v_unidade_id from public.aulas_emusys
     where id = p_aula_id and professor_id = v_professor_id;
    if v_unidade_id is null then
      raise exception 'aula_nao_pertence_ao_professor' using errcode = '42501';
    end if;
    v_fonte := 'professor_la_teacher';
  elsif p_tipo in ('fabio_aula','fabio_audio_aula','fabio_manual_aula')
        and (coalesce(auth.role(), '') = 'service_role'
          or current_setting('app.presenca_fabio_trusted',true) = 'on') then
    select unidade_id, professor_id into v_unidade_id, v_professor_id
      from public.aulas_emusys where id = p_aula_id;
    if v_unidade_id is null then raise exception 'aula_nao_encontrada'; end if;
    v_fonte := case p_tipo
      when 'fabio_audio_aula' then 'fabio_audio'
      when 'fabio_manual_aula' then 'professor_la_teacher'
      else 'professor_whatsapp'
    end;
  else
    raise exception 'tipo_comando_invalido' using errcode = '22023';
  end if;

  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'tipo', p_tipo, 'unidade_id', v_unidade_id, 'aula_id', p_aula_id, 'itens', p_itens
  )::text, 'UTF8'), 'sha256'), 'hex');

  select * into v_existente from public.presenca_comandos where request_id = p_request_id;
  if found then
    if v_existente.payload_hash is distinct from v_hash or v_existente.tipo is distinct from p_tipo then
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

  for v_item in select value from jsonb_array_elements(p_itens) loop
    v_seq := v_seq + 1;
    v_aula_id := coalesce((v_item->>'aula_emusys_id')::integer, p_aula_id);
    v_aluno_id := nullif(v_item->>'aluno_id', '')::integer;
    v_item_professor_id := nullif(v_item->>'professor_id', '')::integer;
    v_status := v_item->>'status';
    v_data := nullif(v_item->>'data', '')::date;
    if (p_tipo='agenda_chamada' and (v_aluno_id is null or v_aula_id is null
        or v_status not in ('presente','falta','falta_justificada','indeterminado')))
       or (p_tipo in ('la_teacher_aula','fabio_aula','fabio_audio_aula','fabio_manual_aula')
        and (v_aluno_id is null or v_aula_id is null or v_status not in ('presente','falta')))
       or (p_tipo='professor_aula' and (v_item_professor_id is null or v_aula_id is null
        or v_status not in ('presente','ausente')))
       or (p_tipo='professor_dia' and (v_item_professor_id is null or v_data is null or v_status<>'presente'))
       or (p_tipo='professor_dia_remover' and (v_item_professor_id is null or v_data is null or v_status<>'ausente')) then
      raise exception 'item_invalido_para_tipo_%',p_tipo using errcode='22023';
    end if;
    insert into public.presenca_comando_itens(
      request_id, sequencia, aula_id, aluno_id, professor_id,
      data_referencia, status_solicitado, motivo_codigo, evidencia_path
    ) values (
      p_request_id, v_seq, v_aula_id, v_aluno_id, v_item_professor_id,
      v_data, v_status, nullif(btrim(v_item->>'motivo'), ''),
      nullif(btrim(v_item->>'evidencia_path'), '')
    );
  end loop;

  update public.presenca_comandos set
    professor_id = coalesce(professor_id, (select min(professor_id) from public.presenca_comando_itens where request_id=p_request_id)),
    data_referencia = (select min(data_referencia) from public.presenca_comando_itens where request_id=p_request_id)
  where request_id = p_request_id;

  insert into public.presenca_acao_eventos(
    request_id, sequencia, tipo, fonte, auth_user_id, usuario_id, unidade_id, aula_id
  ) values (p_request_id, 0, 'recebido', v_fonte, auth.uid(), v_usuario_id, v_unidade_id, p_aula_id);

  return public.app_status_comando_presenca_v1(p_request_id);
end
$function$;

create or replace function public.app_aplicar_comando_presenca_v1(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_comando public.presenca_comandos%rowtype;
  v_item public.presenca_comando_itens%rowtype;
  v_resultado jsonb;
  v_erros jsonb;
  v_aplicados integer := 0;
  v_rejeitados integer := 0;
  v_evento_seq integer := 0;
  v_codigo text;
  v_ausentes integer[];
  v_status_efetivo text;
begin
  select * into v_comando from public.presenca_comandos
   where request_id = p_request_id for update;
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

  update public.presenca_comandos set status='processando', iniciado_em=coalesce(iniciado_em,clock_timestamp()),
    atualizado_em=clock_timestamp() where request_id=p_request_id;

  if v_comando.tipo in ('la_teacher_aula','fabio_aula','fabio_audio_aula','fabio_manual_aula') then
    select coalesce(array_agg(aluno_id order by sequencia) filter (where status_solicitado='falta'), '{}'::integer[])
      into v_ausentes from public.presenca_comando_itens where request_id=p_request_id;
    begin
      v_resultado := public.fn_registrar_presencas_core(
        v_comando.aula_id, v_comando.professor_id, v_ausentes, v_comando.fonte, true
      );
      for v_item in select * from public.presenca_comando_itens where request_id=p_request_id order by sequencia loop
        v_evento_seq := v_evento_seq + 1;
        select coalesce(ap.status_presenca,case ap.status when 'presente' then 'presente' when 'ausente' then 'falta' end)
          into v_status_efetivo from public.aluno_presenca ap
         where ap.aula_emusys_id=v_item.aula_id and ap.aluno_id=v_item.aluno_id;
        if v_status_efetivo is not distinct from v_item.status_solicitado then
          insert into public.presenca_acao_eventos(request_id,sequencia,tipo,fonte,auth_user_id,usuario_id,unidade_id,aula_id,aluno_id,status_novo)
          values(p_request_id,v_evento_seq,'item_aplicado',v_comando.fonte,v_comando.auth_user_id,v_comando.usuario_id,v_comando.unidade_id,v_item.aula_id,v_item.aluno_id,v_status_efetivo);
          v_aplicados := v_aplicados + 1;
        else
          insert into public.presenca_acao_eventos(request_id,sequencia,tipo,fonte,auth_user_id,usuario_id,unidade_id,aula_id,aluno_id,status_anterior,status_novo,erro_codigo)
          values(p_request_id,v_evento_seq,'item_rejeitado',v_comando.fonte,v_comando.auth_user_id,v_comando.usuario_id,v_comando.unidade_id,v_item.aula_id,v_item.aluno_id,v_status_efetivo,v_item.status_solicitado,'DECISAO_FORTE_PRESERVADA');
          v_rejeitados := v_rejeitados + 1;
        end if;
      end loop;
    exception when others then
      v_codigo := case when sqlstate='42501' then 'SEM_PERMISSAO' else upper(left(regexp_replace(sqlerrm,'[^a-zA-Z0-9_]+','_','g'),80)) end;
      for v_item in select * from public.presenca_comando_itens where request_id=p_request_id order by sequencia loop
        v_evento_seq := v_evento_seq + 1;
        insert into public.presenca_acao_eventos(request_id,sequencia,tipo,fonte,auth_user_id,usuario_id,unidade_id,aula_id,aluno_id,erro_codigo)
        values(p_request_id,v_evento_seq,'item_rejeitado',v_comando.fonte,v_comando.auth_user_id,v_comando.usuario_id,v_comando.unidade_id,v_item.aula_id,v_item.aluno_id,v_codigo);
        v_rejeitados := v_rejeitados + 1;
      end loop;
    end;
  else
    for v_item in select * from public.presenca_comando_itens where request_id=p_request_id order by sequencia loop
      v_evento_seq := v_evento_seq + 1;
      begin
        if v_comando.tipo = 'agenda_chamada' then
          v_resultado := public.app_registrar_chamada_agenda(jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
            'aula_emusys_id', v_item.aula_id, 'aluno_id', v_item.aluno_id,
            'status', v_item.status_solicitado, 'motivo', v_item.motivo_codigo,
            'evidencia_path', v_item.evidencia_path
          ))));
          v_erros := coalesce(v_resultado->'erros', '[]'::jsonb);
          if jsonb_array_length(v_erros) > 0 then
            v_codigo := upper(coalesce(v_erros->0->>'erro', 'ITEM_REJEITADO'));
            raise exception using message = v_codigo, errcode = 'P0001';
          end if;
        elsif v_comando.tipo = 'professor_aula' then
          v_resultado := public.app_marcar_presenca_professor_aula(v_item.aula_id, v_item.status_solicitado='presente');
        elsif v_comando.tipo = 'professor_dia' then
          v_resultado := public.app_registrar_presenca_professor_dia(v_item.professor_id, v_item.data_referencia, v_comando.unidade_id, null, null);
          if coalesce((v_resultado->>'aulas_atualizadas')::integer,0)=0 then raise exception 'sem_aulas_alvo'; end if;
        elsif v_comando.tipo = 'professor_dia_remover' then
          v_resultado := public.app_remover_presenca_professor_dia(v_item.professor_id, v_item.data_referencia, v_comando.unidade_id);
          if coalesce((v_resultado->>'aulas_afetadas')::integer,0)=0 then raise exception 'sem_aulas_alvo'; end if;
        end if;
        insert into public.presenca_acao_eventos(request_id,sequencia,tipo,fonte,auth_user_id,usuario_id,unidade_id,aula_id,aluno_id,professor_id,status_novo)
        values(p_request_id,v_evento_seq,'item_aplicado',v_comando.fonte,v_comando.auth_user_id,v_comando.usuario_id,v_comando.unidade_id,v_item.aula_id,v_item.aluno_id,v_item.professor_id,v_item.status_solicitado);
        v_aplicados := v_aplicados + 1;
      exception when others then
        v_codigo := case when sqlstate='42501' then 'SEM_PERMISSAO' else upper(left(regexp_replace(sqlerrm,'[^a-zA-Z0-9_]+','_','g'),80)) end;
        insert into public.presenca_acao_eventos(request_id,sequencia,tipo,fonte,auth_user_id,usuario_id,unidade_id,aula_id,aluno_id,professor_id,erro_codigo)
        values(p_request_id,v_evento_seq,'item_rejeitado',v_comando.fonte,v_comando.auth_user_id,v_comando.usuario_id,v_comando.unidade_id,v_item.aula_id,v_item.aluno_id,v_item.professor_id,v_codigo);
        v_rejeitados := v_rejeitados + 1;
      end;
    end loop;
  end if;

  update public.presenca_comandos set
    status = case when v_rejeitados=0 then 'concluido' when v_aplicados=0 then 'falhou' else 'parcial' end,
    itens_aplicados=v_aplicados, itens_rejeitados=v_rejeitados,
    concluido_em=clock_timestamp(), atualizado_em=clock_timestamp()
  where request_id=p_request_id;

  v_evento_seq := v_evento_seq + 1;
  insert into public.presenca_acao_eventos(request_id,sequencia,tipo,fonte,auth_user_id,usuario_id,unidade_id,aula_id,erro_codigo)
  values(p_request_id,v_evento_seq,
    case when v_aplicados=0 and v_rejeitados>0 then 'falhou' else 'concluido' end,
    v_comando.fonte,v_comando.auth_user_id,v_comando.usuario_id,v_comando.unidade_id,v_comando.aula_id,
    case when v_rejeitados>0 then 'ITENS_REJEITADOS' end);

  return public.app_status_comando_presenca_v1(p_request_id);
end
$function$;

revoke all on function public.app_status_comando_presenca_v1(uuid) from public, anon;
revoke all on function public.app_criar_comando_presenca_v1(uuid,text,uuid,integer,jsonb) from public, anon;
revoke all on function public.app_aplicar_comando_presenca_v1(uuid) from public, anon;
grant execute on function public.app_status_comando_presenca_v1(uuid) to authenticated, service_role;
grant execute on function public.app_criar_comando_presenca_v1(uuid,text,uuid,integer,jsonb) to authenticated, service_role;
grant execute on function public.app_aplicar_comando_presenca_v1(uuid) to authenticated, service_role;

comment on table public.presenca_comandos is
  'Intencao duravel e idempotente de escrita humana de presenca; sem nomes ou payload bruto.';
comment on table public.presenca_acao_eventos is
  'Recibo append-only por request_id: recebido, resultado por item e conclusao.';
