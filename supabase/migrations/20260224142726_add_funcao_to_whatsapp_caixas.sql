-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

ALTER TABLE whatsapp_caixas
  ADD COLUMN funcao TEXT NOT NULL DEFAULT 'agente'
    CHECK (funcao IN ('agente', 'sistema', 'ambos'));

COMMENT ON COLUMN whatsapp_caixas.funcao IS
  'agente = CRM inbox/outbox (Mila + chat); sistema = notifications/reports/alerts; ambos = single-box setup';

UPDATE whatsapp_caixas SET funcao = 'ambos' WHERE id = 1;
