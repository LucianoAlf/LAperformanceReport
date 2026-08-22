-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- 2026-08-11 — Correcao: get_agenda_dia perdeu GRANT EXECUTE apos drop+create.
-- A migration 20260811130100 fez drop+create sem re-grantar EXECUTE,
-- causando 403 Forbidden para authenticated em todas as chamadas da Agenda.

revoke all on function public.get_agenda_dia(date, uuid) from public;
revoke all on function public.get_agenda_dia(date, uuid) from anon;
grant execute on function public.get_agenda_dia(date, uuid) to authenticated;
grant execute on function public.get_agenda_dia(date, uuid) to service_role;
