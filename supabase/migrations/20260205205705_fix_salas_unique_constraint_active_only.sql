-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Remover a constraint unique atual que bloqueia salas inativas
ALTER TABLE salas DROP CONSTRAINT IF EXISTS salas_unidade_id_nome_key;

-- Criar partial unique index que só considera registros ativos
CREATE UNIQUE INDEX salas_unidade_id_nome_ativo_key ON salas (unidade_id, nome) WHERE ativo = true;
