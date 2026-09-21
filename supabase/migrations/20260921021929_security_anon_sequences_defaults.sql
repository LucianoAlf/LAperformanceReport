-- Fecha USAGE, SELECT e UPDATE anonimo em sequencias existentes e futuras.
-- As ACLs anon/PUBLIC anteriores entram no mesmo backup privado usado pelo
-- roteiro versionado de rollback da auditoria de acesso anonimo.

alter table private.security_anon_hardening_20260920_acl_backup
  drop constraint if exists security_anon_hardening_20260920_acl_backup_object_kind_check;

alter table private.security_anon_hardening_20260920_acl_backup
  add constraint security_anon_hardening_20260920_acl_backup_object_kind_check
  check (object_kind in ('table', 'sequence', 'function'));

insert into private.security_anon_hardening_20260920_acl_backup
  (object_kind, object_identity, grantee, privilege_type, is_grantable)
select
  'sequence',
  format('public.%I', c.relname),
  case when a.grantee = 0 then 'PUBLIC' else role.rolname end,
  a.privilege_type,
  a.is_grantable
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(coalesce(c.relacl, acldefault('S', c.relowner))) a
left join pg_roles role on role.oid = a.grantee
where n.nspname = 'public'
  and c.relkind = 'S'
  and (a.grantee = 0 or role.rolname = 'anon')
on conflict do nothing;

revoke all privileges on all sequences in schema public from anon, public;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, public;

notify pgrst, 'reload schema';