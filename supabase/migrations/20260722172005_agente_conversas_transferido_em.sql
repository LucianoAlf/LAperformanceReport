-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

ALTER TABLE agente_conversas ADD COLUMN transferido_em timestamptz;
COMMENT ON COLUMN agente_conversas.transferido_em IS 'Momento da transferencia p/ consultor. Janela de reengajamento: apos N dias o bot volta a triar o lead.';
-- Backfill: transferencias antigas usam a ultima atividade como referencia da janela
UPDATE agente_conversas SET transferido_em = ultima_mensagem_em
WHERE status = 'transferred' AND transferido_em IS NULL;
