-- Complemento de rollback da migration 20260921021929_security_anon_sequences_defaults.
-- Execute somente como administrador do banco, apos decisao de rollback.
-- Restaura apenas as ACLs anon/PUBLIC das sequencias capturadas antes do revoke.

do $$
declare
  r record;
begin
  for r in
    select *
    from private.security_anon_hardening_20260920_acl_backup
    where object_kind = 'sequence'
    order by object_identity, grantee, privilege_type
  loop
    execute format(
      'grant %s on sequence %s to %s%s',
      r.privilege_type,
      r.object_identity,
      case when r.grantee = 'PUBLIC' then 'PUBLIC' else quote_ident(r.grantee) end,
      case when r.is_grantable then ' with grant option' else '' end
    );
  end loop;
end
$$;