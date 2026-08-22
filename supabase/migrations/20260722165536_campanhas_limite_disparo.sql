-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

ALTER TABLE campanhas ADD COLUMN limite_disparo integer;
ALTER TABLE campanhas ADD COLUMN meta_disparo integer;
COMMENT ON COLUMN campanhas.limite_disparo IS 'Quantos contatos enviar por disparo (drip). NULL = envia todos de uma vez.';
COMMENT ON COLUMN campanhas.meta_disparo IS 'Alvo absoluto de enviados do run atual (=enviados+limite_disparo no iniciar/retomar). enviar-campanha pausa ao atingir.';
