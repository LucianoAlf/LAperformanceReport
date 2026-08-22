-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'la_os_leitor') then
    create role la_os_leitor nologin;
  end if;
end
$$;

grant execute on function public.la_os_estado_atual()                to la_os_leitor;
grant execute on function public.la_os_historico(text, timestamptz)  to la_os_leitor;
grant execute on function public.la_os_desde_quando(text)            to la_os_leitor;

grant la_os_leitor to service_role;
