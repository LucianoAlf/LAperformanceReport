-- A 20260919224000 revogou public/anon de recalcular_projecao e deveria
-- ter devolvido authenticated + service_role. No banco ficou so
-- postgres + service_role. Recoloca authenticated (contrato original
-- da 20260812000500). hermes_patch permanece so service_role.

grant execute on function public.recalcular_projecao(integer, bigint, text, jsonb)
  to authenticated;

do $$
begin
  if not has_function_privilege(
       'authenticated',
       'public.recalcular_projecao(integer, bigint, text, jsonb)',
       'execute'
     ) then
    raise exception 'AUTHENTICATED_SEM_EXECUTE recalcular_projecao';
  end if;
  if has_function_privilege(
       'anon',
       'public.recalcular_projecao(integer, bigint, text, jsonb)',
       'execute'
     ) then
    raise exception 'ANON_VOLTOU_EM recalcular_projecao';
  end if;
end $$;
