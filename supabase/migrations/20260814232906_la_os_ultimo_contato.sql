-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function monitoramento.ultimo_contato()
returns table (host text, ultimo_contato timestamptz, ha_segundos int)
language sql
security definer
set search_path = monitoramento, pg_catalog
as $$
  select c.host,
         c.ultimo_contato,
         extract(epoch from (now() - c.ultimo_contato))::int
    from monitoramento.contatos c
   order by c.host;
$$;

create or replace function public.la_os_ultimo_contato()
returns table (host text, ultimo_contato timestamptz, ha_segundos int)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select * from monitoramento.ultimo_contato();
$$;

revoke execute on function monitoramento.ultimo_contato()
  from public, anon, authenticated, service_role;

revoke all on function public.la_os_ultimo_contato()
  from public, anon, authenticated, service_role;

grant execute on function public.la_os_ultimo_contato() to la_os_leitor;
