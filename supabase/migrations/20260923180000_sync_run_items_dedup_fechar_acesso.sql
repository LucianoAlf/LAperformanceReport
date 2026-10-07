-- A tabela de trabalho da LAPE-43 (fase 2) nasceu com o ALTER DEFAULT PRIVILEGES do schema:
-- `authenticated=arwdDxtm` (todos os privilegios) e RLS DESLIGADA -- ou seja, qualquer login
-- lia e escrevia a copia do ledger financeiro pelo PostgREST. `LIKE ... INCLUDING ALL` copia
-- colunas, indices e defaults, mas NAO copia grants, RLS, policies nem triggers.
-- Espelha exatamente o acesso da original (`sync_run_items`): so service_role le, via policy.
revoke all on public.sync_run_items_dedup from public, anon, authenticated, service_role;
grant select on public.sync_run_items_dedup to service_role;
alter table public.sync_run_items_dedup enable row level security;
drop policy if exists sync_run_items_dedup_service_role_select on public.sync_run_items_dedup;
create policy sync_run_items_dedup_service_role_select on public.sync_run_items_dedup
  for select to service_role using (true);

do $$
declare v_acl text;
begin
  select relacl::text into v_acl from pg_class where oid = 'public.sync_run_items_dedup'::regclass;
  if v_acl like '%authenticated=%' or v_acl like '%anon=%' then
    raise exception 'acesso nao fechado: %', v_acl;
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.sync_run_items_dedup'::regclass) then
    raise exception 'RLS nao ligada';
  end if;
end $$;
