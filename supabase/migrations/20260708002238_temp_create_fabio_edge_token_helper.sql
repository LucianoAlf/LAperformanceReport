-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.alfredo_temp_create_fabio_edge_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  return vault.create_secret(
    p_token,
    'fabio_edge_token',
    'Token service_role para o trigger autenticar a chamada a Edge do Fabio'
  );
end;
$$;

revoke all on function public.alfredo_temp_create_fabio_edge_token(text) from public;
grant execute on function public.alfredo_temp_create_fabio_edge_token(text) to service_role;
