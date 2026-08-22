-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Permite smoke privado sem bloquear idempotencia da anamnese real.

drop index if exists public.idx_fila_anamnese_sol_hermes_open;

create unique index idx_fila_anamnese_sol_hermes_open
  on public.fila_anamnese_sol_hermes (anamnese_id, professor_id)
  where status in ('sol_pendente', 'sol_enviando', 'enviada')
    and coalesce(metadata->>'smoke', 'false') <> 'true';
