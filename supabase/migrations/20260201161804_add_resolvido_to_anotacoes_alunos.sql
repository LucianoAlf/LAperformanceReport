-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Adicionar campo resolvido na tabela anotacoes_alunos
ALTER TABLE anotacoes_alunos 
ADD COLUMN IF NOT EXISTS resolvido BOOLEAN DEFAULT FALSE;

-- Criar índice para filtrar anotações resolvidas/pendentes
CREATE INDEX IF NOT EXISTS idx_anotacoes_alunos_resolvido ON anotacoes_alunos(resolvido);
