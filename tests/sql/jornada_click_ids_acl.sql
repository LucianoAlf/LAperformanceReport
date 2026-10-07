-- Assert de ACL da vw_jornada_lead_v1 — standalone e idempotente: roda depois da
-- migration 20261002050000 E depois do rollback dela. Compara com o snapshot da ACL
-- viva gravado pelo harness (service_role full + 4 restritos de leitura, SEM
-- authenticated — a view expõe nome/telefone de todos os leads).

\set QUIET on
\pset footer off

do $$
declare v_acl text;
begin
  select c.relacl::text into v_acl
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'vw_jornada_lead_v1';
  assert v_acl = (select acl from harness_acl_viva),
    'ACL da view diverge da viva: ' || coalesce(v_acl, 'null');
  assert v_acl not like '%authenticated%' and v_acl not like '%anon=%',
    'authenticated/anon não pode ter grant na view';
  raise notice 'OK ACL: %', v_acl;
end $$;
