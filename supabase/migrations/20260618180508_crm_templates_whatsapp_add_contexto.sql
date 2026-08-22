-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

ALTER TABLE crm_templates_whatsapp
  ADD COLUMN IF NOT EXISTS contexto text NOT NULL DEFAULT 'pre_atendimento';

-- Slug deixa de ser único globalmente; passa a ser único por contexto
ALTER TABLE crm_templates_whatsapp
  DROP CONSTRAINT IF EXISTS crm_templates_whatsapp_slug_key;

ALTER TABLE crm_templates_whatsapp
  ADD CONSTRAINT crm_templates_whatsapp_contexto_slug_key UNIQUE (contexto, slug);
