-- Autoriza o refresh manual de presenca somente para usuario ativo e unidade exata.
create or replace function public.pode_sincronizar_presenca_emusys_v1(
  p_unidade_id uuid,
  p_acao text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_usuario_id integer;
  v_perfil text;
  v_unidade_usuario uuid;
begin
  if p_unidade_id is null
     or p_acao is null
     or p_acao <> 'presenca'
     or not exists (
       select 1
       from public.unidades unidade
       where unidade.id = p_unidade_id
     ) then
    return false;
  end if;

  select u.id, u.perfil, u.unidade_id
    into v_usuario_id, v_perfil, v_unidade_usuario
  from public.usuarios u
  where u.auth_user_id = auth.uid()
    and u.ativo is true
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
    'alunos.ver',
    p_unidade_id
  );
end;
$function$;

revoke all on function public.pode_sincronizar_presenca_emusys_v1(uuid, text)
  from public, anon;
grant execute on function public.pode_sincronizar_presenca_emusys_v1(uuid, text)
  to authenticated;

comment on function public.pode_sincronizar_presenca_emusys_v1(uuid, text) is
  'Guard estreito do refresh manual: somente presenca, usuario ativo e unidade exata; perfil unidade usa a propria unidade e demais perfis exigem alunos.ver.';
