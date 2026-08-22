-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- crm_conversas: trocar FK de NO ACTION para SET NULL
ALTER TABLE crm_conversas
  DROP CONSTRAINT IF EXISTS crm_conversas_caixa_id_fkey,
  ADD CONSTRAINT crm_conversas_caixa_id_fkey
    FOREIGN KEY (caixa_id) REFERENCES whatsapp_caixas(id) ON DELETE SET NULL;

-- admin_conversas: trocar FK de NO ACTION para SET NULL
ALTER TABLE admin_conversas
  DROP CONSTRAINT IF EXISTS admin_conversas_caixa_id_fkey,
  ADD CONSTRAINT admin_conversas_caixa_id_fkey
    FOREIGN KEY (caixa_id) REFERENCES whatsapp_caixas(id) ON DELETE SET NULL;
