-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Permitir professor_id null na tabela professor_acoes
-- Isso permite criar ações gerais (treinamentos, reuniões) sem vincular a um professor específico

ALTER TABLE professor_acoes 
ALTER COLUMN professor_id DROP NOT NULL;
