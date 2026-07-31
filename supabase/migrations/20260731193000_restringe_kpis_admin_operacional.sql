-- Fecha leitura cruzada do KPI administrativo SECURITY DEFINER.
-- A implementacao canonica permanece imutavel e passa a ser acessada somente
-- por uma fachada que valida a unidade do usuario antes de executar a leitura.

alter function public.get_kpis_alunos_admin_operacional(uuid, integer, integer)
  rename to get_kpis_alunos_admin_operacional_impl_v2;

revoke all on function public.get_kpis_alunos_admin_operacional_impl_v2(
  uuid,
  integer,
  integer
) from public, anon, authenticated, service_role;

create or replace function public.exigir_acesso_kpis_admin_v1(
  p_unidade_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
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
set search_path = public, pg_temp
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
  'Fachada protegida do KPI administrativo v2: service_role pode consolidar; usuario autenticado exige escopo de unidade ou permissao em todas as unidades.';

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
