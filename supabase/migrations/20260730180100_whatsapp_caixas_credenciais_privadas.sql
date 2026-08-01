-- Hardening independente das caixas de WhatsApp.
--
-- O navegador deixa de ler a tabela bruta, que contém credenciais UAZAPI e
-- WAHA. Leituras operacionais usam uma projeção mínima; administradores usam
-- uma projeção sem segredos e mutações write-only. Edge Functions com
-- service_role continuam resolvendo as credenciais diretamente.

create table if not exists public.whatsapp_caixas_credenciais_auditoria (
  id bigint generated always as identity primary key,
  caixa_id integer not null
    references public.whatsapp_caixas(id) on delete cascade,
  auth_user_id uuid not null,
  credencial text not null
    check (credencial in ('uazapi_token', 'waha_api_key')),
  rotacionada_em timestamptz not null default now()
);

comment on table public.whatsapp_caixas_credenciais_auditoria is
  'Auditoria sem valor secreto para rotações write-only de credenciais WhatsApp.';

alter table public.whatsapp_caixas_credenciais_auditoria
  enable row level security;

revoke all on table public.whatsapp_caixas_credenciais_auditoria
  from public, anon, authenticated, mila_acesso_restrito,
       sol_acesso_restrito, fabio_agent, lia_acesso_restrito;
grant all on table public.whatsapp_caixas_credenciais_auditoria
  to service_role;

revoke all on sequence
  public.whatsapp_caixas_credenciais_auditoria_id_seq
  from public, anon, authenticated, mila_acesso_restrito,
       sol_acesso_restrito, fabio_agent, lia_acesso_restrito;
grant usage, select on sequence
  public.whatsapp_caixas_credenciais_auditoria_id_seq
  to service_role;

create or replace function public.listar_whatsapp_caixas_seguras(
  p_unidade_id uuid default null,
  p_incluir_globais boolean default false
)
returns table (
  id integer,
  nome text,
  numero_mascarado text,
  unidade_id uuid,
  ativo boolean,
  funcao text,
  departamento text,
  provedor text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_perfil text;
  v_unidade_id uuid;
  v_unidade_efetiva uuid;
begin
  select u.perfil, u.unidade_id
    into v_perfil, v_unidade_id
  from public.usuarios u
  where u.auth_user_id = auth.uid()
    and u.ativo = true;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Usuário autenticado ativo não encontrado';
  end if;

  if v_perfil = 'admin' then
    v_unidade_efetiva := p_unidade_id;
  else
    if v_unidade_id is null then
      raise exception using
        errcode = '42501',
        message = 'Usuário sem unidade operacional';
    end if;

    if p_unidade_id is not null and p_unidade_id <> v_unidade_id then
      raise exception using
        errcode = '42501',
        message = 'Unidade fora do escopo do usuário';
    end if;

    v_unidade_efetiva := v_unidade_id;
  end if;

  return query
  select
    wc.id,
    wc.nome::text,
    case
      when nullif(regexp_replace(coalesce(wc.numero, ''), '\D', '', 'g'), '')
        is null then null
      else '••••' || right(
        regexp_replace(wc.numero, '\D', '', 'g'),
        4
      )
    end as numero_mascarado,
    wc.unidade_id,
    coalesce(wc.ativo, false) as ativo,
    wc.funcao,
    wc.departamento,
    wc.provedor
  from public.whatsapp_caixas wc
  where wc.ativo is true
    and (
      (v_perfil = 'admin' and v_unidade_efetiva is null)
      or wc.unidade_id = v_unidade_efetiva
      or (p_incluir_globais and wc.unidade_id is null)
    )
  order by wc.nome, wc.id;
end;
$function$;

create or replace function public.listar_whatsapp_caixas_administracao()
returns table (
  id integer,
  nome text,
  numero text,
  uazapi_url text,
  unidade_id uuid,
  webhook_url text,
  ativo boolean,
  funcao text,
  departamento text,
  provedor text,
  waha_url text,
  waha_session text,
  created_at timestamptz,
  updated_at timestamptz,
  uazapi_token_configurado boolean,
  waha_api_key_configurada boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.ativo = true
      and u.perfil = 'admin'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Operação restrita a administrador';
  end if;

  return query
  select
    wc.id,
    wc.nome::text,
    wc.numero::text,
    wc.uazapi_url::text,
    wc.unidade_id,
    wc.webhook_url,
    coalesce(wc.ativo, false),
    wc.funcao,
    wc.departamento,
    wc.provedor,
    wc.waha_url,
    wc.waha_session,
    wc.created_at,
    wc.updated_at,
    nullif(btrim(wc.uazapi_token), '') is not null,
    nullif(btrim(wc.waha_api_key), '') is not null
  from public.whatsapp_caixas wc
  order by wc.id;
end;
$function$;

create or replace function public.salvar_whatsapp_caixa_admin(
  p_id integer,
  p_nome text,
  p_numero text,
  p_uazapi_url text,
  p_uazapi_token text,
  p_unidade_id uuid,
  p_webhook_url text,
  p_ativo boolean,
  p_funcao text,
  p_departamento text,
  p_provedor text,
  p_waha_url text,
  p_waha_session text,
  p_waha_api_key text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_caixa_id integer;
  v_token_atual text;
  v_waha_api_key_atual text;
begin
  if not exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = v_auth_user_id
      and u.ativo = true
      and u.perfil = 'admin'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Operação restrita a administrador';
  end if;

  if nullif(btrim(p_nome), '') is null then
    raise exception using errcode = '22023', message = 'Nome é obrigatório';
  end if;
  if p_provedor not in ('uazapi', 'waha') then
    raise exception using errcode = '22023', message = 'Provedor inválido';
  end if;
  if p_funcao not in ('agente', 'sistema', 'ambos', 'administrativo') then
    raise exception using errcode = '22023', message = 'Função inválida';
  end if;
  if p_departamento not in ('administrativo', 'sucesso_aluno') then
    raise exception using errcode = '22023', message = 'Departamento inválido';
  end if;
  if p_funcao in ('agente', 'administrativo') and p_unidade_id is null then
    raise exception using
      errcode = '22023',
      message = 'A função escolhida exige unidade';
  end if;

  if p_id is not null then
    select wc.uazapi_token, wc.waha_api_key
      into v_token_atual, v_waha_api_key_atual
    from public.whatsapp_caixas wc
    where wc.id = p_id
    for update;

    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'Caixa não encontrada';
    end if;
  end if;

  if p_provedor = 'uazapi' then
    if nullif(btrim(p_uazapi_url), '') is null then
      raise exception using
        errcode = '22023',
        message = 'URL UAZAPI é obrigatória';
    end if;
    if coalesce(
      nullif(btrim(p_uazapi_token), ''),
      nullif(btrim(v_token_atual), '')
    ) is null then
      raise exception using
        errcode = '22023',
        message = 'Token UAZAPI é obrigatório';
    end if;
  else
    if nullif(btrim(p_waha_url), '') is null
       or nullif(btrim(p_waha_session), '') is null then
      raise exception using
        errcode = '22023',
        message = 'URL e sessão WAHA são obrigatórias';
    end if;
  end if;

  if p_id is null then
    insert into public.whatsapp_caixas (
      nome,
      numero,
      uazapi_url,
      uazapi_token,
      unidade_id,
      webhook_url,
      ativo,
      funcao,
      departamento,
      provedor,
      waha_url,
      waha_session,
      waha_api_key
    )
    values (
      btrim(p_nome),
      nullif(btrim(p_numero), ''),
      coalesce(nullif(btrim(p_uazapi_url), ''), ''),
      coalesce(nullif(btrim(p_uazapi_token), ''), ''),
      p_unidade_id,
      nullif(btrim(p_webhook_url), ''),
      coalesce(p_ativo, true),
      p_funcao,
      p_departamento,
      p_provedor,
      nullif(btrim(p_waha_url), ''),
      nullif(btrim(p_waha_session), ''),
      nullif(btrim(p_waha_api_key), '')
    )
    returning id into v_caixa_id;
  else
    update public.whatsapp_caixas wc
    set
      nome = btrim(p_nome),
      numero = nullif(btrim(p_numero), ''),
      uazapi_url = coalesce(nullif(btrim(p_uazapi_url), ''), wc.uazapi_url),
      uazapi_token = coalesce(
        nullif(btrim(p_uazapi_token), ''),
        wc.uazapi_token
      ),
      unidade_id = p_unidade_id,
      webhook_url = nullif(btrim(p_webhook_url), ''),
      ativo = coalesce(p_ativo, wc.ativo, true),
      funcao = p_funcao,
      departamento = p_departamento,
      provedor = p_provedor,
      waha_url = nullif(btrim(p_waha_url), ''),
      waha_session = nullif(btrim(p_waha_session), ''),
      waha_api_key = coalesce(
        nullif(btrim(p_waha_api_key), ''),
        wc.waha_api_key
      ),
      updated_at = now()
    where wc.id = p_id
    returning wc.id into v_caixa_id;
  end if;

  if nullif(btrim(p_uazapi_token), '') is not null then
    insert into public.whatsapp_caixas_credenciais_auditoria (
      caixa_id,
      auth_user_id,
      credencial
    )
    values (v_caixa_id, v_auth_user_id, 'uazapi_token');
  end if;

  if nullif(btrim(p_waha_api_key), '') is not null then
    insert into public.whatsapp_caixas_credenciais_auditoria (
      caixa_id,
      auth_user_id,
      credencial
    )
    values (v_caixa_id, v_auth_user_id, 'waha_api_key');
  end if;

  return v_caixa_id;
end;
$function$;

create or replace function public.excluir_whatsapp_caixa_admin(
  p_caixa_id integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.ativo = true
      and u.perfil = 'admin'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Operação restrita a administrador';
  end if;

  delete from public.whatsapp_caixas wc
  where wc.id = p_caixa_id;

  return found;
end;
$function$;

-- Remove as policies legadas, inclusive os nomes usados antes do hardening de
-- junho. Sem grants de tabela para roles cliente, policies permissivas não
-- voltam a expor as credenciais por acidente.
drop policy if exists whatsapp_caixas_select_all
  on public.whatsapp_caixas;
drop policy if exists whatsapp_caixas_insert_auth
  on public.whatsapp_caixas;
drop policy if exists whatsapp_caixas_update_auth
  on public.whatsapp_caixas;
drop policy if exists whatsapp_caixas_delete_auth
  on public.whatsapp_caixas;
drop policy if exists whatsapp_caixas_select
  on public.whatsapp_caixas;
drop policy if exists whatsapp_caixas_insert
  on public.whatsapp_caixas;
drop policy if exists whatsapp_caixas_update
  on public.whatsapp_caixas;
drop policy if exists whatsapp_caixas_delete
  on public.whatsapp_caixas;

alter table public.whatsapp_caixas enable row level security;

revoke all on table public.whatsapp_caixas
  from public, anon, authenticated, mila_acesso_restrito,
       sol_acesso_restrito, fabio_agent, lia_acesso_restrito;
grant all on table public.whatsapp_caixas to service_role;

revoke all on sequence public.whatsapp_caixas_id_seq
  from public, anon, authenticated, mila_acesso_restrito,
       sol_acesso_restrito, fabio_agent, lia_acesso_restrito;
grant usage, select on sequence public.whatsapp_caixas_id_seq
  to service_role;

revoke all on function public.listar_whatsapp_caixas_seguras(uuid, boolean)
  from public, anon, authenticated, mila_acesso_restrito,
       sol_acesso_restrito, fabio_agent, lia_acesso_restrito;
grant execute on function
  public.listar_whatsapp_caixas_seguras(uuid, boolean)
  to authenticated;

revoke all on function public.listar_whatsapp_caixas_administracao()
  from public, anon, authenticated, mila_acesso_restrito,
       sol_acesso_restrito, fabio_agent, lia_acesso_restrito;
grant execute on function public.listar_whatsapp_caixas_administracao()
  to authenticated;

revoke all on function public.salvar_whatsapp_caixa_admin(
  integer, text, text, text, text, uuid, text, boolean,
  text, text, text, text, text, text
)
  from public, anon, authenticated, mila_acesso_restrito,
       sol_acesso_restrito, fabio_agent, lia_acesso_restrito;
grant execute on function public.salvar_whatsapp_caixa_admin(
  integer, text, text, text, text, uuid, text, boolean,
  text, text, text, text, text, text
)
  to authenticated;

revoke all on function public.excluir_whatsapp_caixa_admin(integer)
  from public, anon, authenticated, mila_acesso_restrito,
       sol_acesso_restrito, fabio_agent, lia_acesso_restrito;
grant execute on function public.excluir_whatsapp_caixa_admin(integer)
  to authenticated;

comment on function public.listar_whatsapp_caixas_seguras(uuid, boolean) is
  'Projeção operacional autenticada, escopada e sem credenciais.';
comment on function public.listar_whatsapp_caixas_administracao() is
  'Configuração administrativa sem valores de credenciais.';
comment on function public.salvar_whatsapp_caixa_admin(
  integer, text, text, text, text, uuid, text, boolean,
  text, text, text, text, text, text
) is
  'Muta caixa como admin; credenciais são write-only e nunca retornadas.';
