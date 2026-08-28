-- Fecha a corrida entre uma escrita ainda não visível e a consulta de status.
-- Quem chegar primeiro ao mesmo request_id vence sob advisory lock:
--   * a escrita insere o comando e a consulta aguarda o commit;
--   * a consulta ausente grava um tombstone e uma escrita atrasada é recusada.

begin;

create table if not exists public.presenca_comando_nao_recebidos (
  request_id uuid primary key,
  auth_user_id uuid,
  criado_em timestamptz not null default clock_timestamp()
);

comment on table public.presenca_comando_nao_recebidos is
  'Tombstone durável de request_id confirmado como não recebido; impede escrita tardia após reconciliação.';

alter table public.presenca_comando_nao_recebidos enable row level security;
revoke all on table public.presenca_comando_nao_recebidos from public, anon, authenticated;
grant select on table public.presenca_comando_nao_recebidos to service_role;

create or replace function public.fn_presenca_comando_arbitrar_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if new.request_id is null then
    raise exception 'request_id_obrigatorio' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.request_id::text, 20260827223000));

  if exists (
    select 1
      from public.presenca_comando_nao_recebidos n
     where n.request_id = new.request_id
  ) then
    raise exception 'request_id_encerrado_como_nao_recebido' using errcode = '55000';
  end if;

  return new;
end
$function$;

revoke all on function public.fn_presenca_comando_arbitrar_insert()
  from public, anon, authenticated;

drop trigger if exists trg_presenca_comando_arbitrar_insert on public.presenca_comandos;
create trigger trg_presenca_comando_arbitrar_insert
before insert on public.presenca_comandos
for each row execute function public.fn_presenca_comando_arbitrar_insert();

create or replace function public.app_status_comando_presenca_v1(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_comando public.presenca_comandos%rowtype;
  v_cancelamento_auth_user_id uuid;
begin
  if p_request_id is null then
    raise exception 'request_id_obrigatorio' using errcode = '22023';
  end if;
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is null then
    raise exception 'sem_permissao_comando' using errcode = '42501';
  end if;

  select * into v_comando
    from public.presenca_comandos
   where request_id = p_request_id;

  if not found then
    -- Só o caminho ausente precisa arbitrar com um INSERT ainda não visível.
    -- Um comando já existente pode estar sob FOR UPDATE em app_aplicar; pegar
    -- o advisory nesse caso inverteria a ordem dos locks e permitiria deadlock.
    perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 20260827223000));

    select * into v_comando
      from public.presenca_comandos
     where request_id = p_request_id;

    if not found then
      insert into public.presenca_comando_nao_recebidos(request_id, auth_user_id)
      values (p_request_id, auth.uid())
      on conflict (request_id) do nothing;

      select n.auth_user_id
        into v_cancelamento_auth_user_id
        from public.presenca_comando_nao_recebidos n
       where n.request_id = p_request_id;

      if coalesce(auth.role(), '') <> 'service_role'
         and v_cancelamento_auth_user_id is distinct from auth.uid() then
        raise exception 'sem_permissao_comando' using errcode = '42501';
      end if;

      return jsonb_build_object(
        'request_id', p_request_id,
        'status', 'nao_recebido',
        'aplicados', 0,
        'rejeitados', 0,
        'erros', '[]'::jsonb
      );
    end if;
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

revoke all on function public.app_status_comando_presenca_v1(uuid) from public, anon;
grant execute on function public.app_status_comando_presenca_v1(uuid) to authenticated, service_role;

commit;
