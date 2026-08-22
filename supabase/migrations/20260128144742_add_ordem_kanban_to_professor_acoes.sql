-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Adicionar campo ordem_kanban na tabela professor_acoes
ALTER TABLE professor_acoes 
ADD COLUMN IF NOT EXISTS ordem_kanban INTEGER DEFAULT 0;

-- Criar índice para performance na ordenação
CREATE INDEX IF NOT EXISTS idx_professor_acoes_ordem_kanban ON professor_acoes(status, ordem_kanban);

-- Inicializar ordem baseada na data_agendada (mais antigo = menor ordem)
UPDATE professor_acoes 
SET ordem_kanban = subquery.row_num
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY status ORDER BY data_agendada) as row_num
  FROM professor_acoes
) as subquery
WHERE professor_acoes.id = subquery.id;
