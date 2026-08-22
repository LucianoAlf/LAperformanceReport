-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

ALTER TABLE whatsapp_caixas DROP CONSTRAINT whatsapp_caixas_funcao_check;
ALTER TABLE whatsapp_caixas ADD CONSTRAINT whatsapp_caixas_funcao_check
  CHECK (funcao = ANY (ARRAY['agente', 'sistema', 'ambos', 'administrativo']));
