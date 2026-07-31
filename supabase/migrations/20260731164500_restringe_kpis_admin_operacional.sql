-- Sincroniza com o banco: migration aplicada remotamente em 2026-07-31 16:45:00
-- via MCP (sem arquivo local ate agora). Restringe get_kpis_alunos_admin_operacional
-- (relatorio administrativo) a quem tem acesso a unidade solicitada -- perfil
-- 'unidade' so ve a propria, perfil admin precisa da permissao
-- 'administrativo.ver'. Consolidado (p_unidade_id null) exige acesso a TODAS as
-- unidades ativas. Chamadas de service_role/postgres (crons, edge functions)
-- continuam liberadas sem checagem de auth.uid().

create or replace function public.pode_gerar_relatorio_admin_v1(p_unidade_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_usuario_id integer;
  v_perfil text;
  v_unidade_usuario uuid;
begin
  if p_unidade_id is null
     or not exists (
       select 1
       from public.unidades u
       where u.id = p_unidade_id
         and u.ativo = true
     ) then
    return false;
  end if;

  select u.id, u.perfil, u.unidade_id
    into v_usuario_id, v_perfil, v_unidade_usuario
  from public.usuarios u
  where u.auth_user_id = auth.uid()
    and coalesce(u.ativo, true)
  limit 1;

  if v_usuario_id is null then
    return false;
  end if;

  if v_perfil = 'unidade' then
    return v_unidade_usuario is not null
      and v_unidade_usuario = p_unidade_id;
  end if;

  return public.usuario_tem_permissao(
    v_usuario_id,
    'administrativo.ver',
    p_unidade_id
  );
end;
$function$;

revoke all on function public.pode_gerar_relatorio_admin_v1(uuid)
  from public, anon;
grant execute on function public.pode_gerar_relatorio_admin_v1(uuid)
  to authenticated, service_role;

create or replace function public.exigir_acesso_kpis_admin_v1(p_unidade_id uuid)
returns void
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- Chamadas internas do banco e chamadas servidor-servidor preservam o
  -- consolidado necessario aos crons e aos fechamentos administrativos.
  if auth.role() = 'service_role'
     or session_user in ('postgres', 'supabase_admin') then
    return;
  end if;

  if auth.uid() is null then
    raise exception 'ACESSO_NEGADO_RELATORIO_ADMIN'
      using errcode = '42501';
  end if;

  if p_unidade_id is null then
    -- O consolidado continua disponivel somente para quem possui acesso a
    -- todas as unidades ativas. Perfil de unidade nunca passa neste teste.
    if exists (
      select 1
      from public.unidades u
      where u.ativo = true
        and not public.pode_gerar_relatorio_admin_v1(u.id)
    ) then
      raise exception 'ACESSO_NEGADO_RELATORIO_ADMIN'
        using errcode = '42501';
    end if;

    return;
  end if;

  if not public.pode_gerar_relatorio_admin_v1(p_unidade_id) then
    raise exception 'ACESSO_NEGADO_RELATORIO_ADMIN'
      using errcode = '42501';
  end if;
end;
$function$;

revoke all on function public.exigir_acesso_kpis_admin_v1(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.get_kpis_alunos_admin_operacional(
  p_unidade_id uuid default null::uuid,
  p_ano integer default (
    extract(year from (now() at time zone 'America/Sao_Paulo'))
  )::integer,
  p_mes integer default (
    extract(month from (now() at time zone 'America/Sao_Paulo'))
  )::integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.exigir_acesso_kpis_admin_v1(p_unidade_id);

  return public.get_kpis_alunos_admin_operacional_impl_v2(
    p_unidade_id,
    p_ano,
    p_mes
  );
end;
$function$;

comment on function public.get_kpis_alunos_admin_operacional(
  uuid,
  integer,
  integer
) is
  'KPIs administrativos vivos: exige acesso a unidade (ou a todas, se consolidado) antes de delegar ao impl_v2.';

revoke all on function public.get_kpis_alunos_admin_operacional(
  uuid,
  integer,
  integer
) from public, anon;
grant execute on function public.get_kpis_alunos_admin_operacional(
  uuid,
  integer,
  integer
) to authenticated, service_role;
