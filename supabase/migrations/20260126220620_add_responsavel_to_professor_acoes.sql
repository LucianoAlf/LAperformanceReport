-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Adicionar campo responsavel para identificar qual coordenador é responsável pela ação
-- Valores possíveis: 'juliana', 'quintela', null (para ações sem coordenador específico)

ALTER TABLE professor_acoes 
ADD COLUMN responsavel VARCHAR(50) NULL;

-- Criar índice para filtrar por responsável
CREATE INDEX idx_professor_acoes_responsavel ON professor_acoes(responsavel);
