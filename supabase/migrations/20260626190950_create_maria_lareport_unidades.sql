-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.maria_lareport_unidades()
returns table (
  id uuid,
  nome text,
  codigo text,
  ativo boolean
)
language sql
security definer
set search_path = public
as $$
  select
    u.id,
    u.nome::text,
    u.codigo::text,
    u.ativo
  from public.unidades u
  where u.ativo is true
  order by u.nome;
$$;

revoke all on function public.maria_lareport_unidades() from public;
revoke all on function public.maria_lareport_unidades() from anon;
revoke all on function public.maria_lareport_unidades() from authenticated;
grant execute on function public.maria_lareport_unidades() to maria_lareport_rpc;
grant execute on function public.maria_lareport_unidades() to service_role;
