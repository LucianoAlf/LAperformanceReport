-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Atualizar constraint do tipo para incluir 'trancamento'
ALTER TABLE movimentacoes_admin
DROP CONSTRAINT IF EXISTS movimentacoes_admin_tipo_check;

ALTER TABLE movimentacoes_admin
ADD CONSTRAINT movimentacoes_admin_tipo_check 
CHECK (tipo IN ('renovacao', 'nao_renovacao', 'aviso_previo', 'evasao', 'trancamento'));

-- Adicionar campos específicos para trancamento
ALTER TABLE movimentacoes_admin
ADD COLUMN IF NOT EXISTS previsao_retorno DATE;

-- Comentário explicativo
COMMENT ON COLUMN movimentacoes_admin.previsao_retorno IS 'Data prevista de retorno do aluno (usado em trancamentos)';
