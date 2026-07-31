-- Preserva o preview humano escopado e restaura o contrato servidor-servidor
-- usado pelo cron administrativo da Sol/Hermes.

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

  if auth.role() = 'service_role'
     or session_user in ('postgres', 'supabase_admin') then
    return true;
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
