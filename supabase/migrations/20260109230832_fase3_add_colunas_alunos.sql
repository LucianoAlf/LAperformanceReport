-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================================
-- FASE 3: ADICIONAR COLUNAS FALTANTES NA TABELA ALUNOS
-- Data: 09/01/2026
-- Descrição: Adicionar colunas dia_aula, horario_aula e percentual_presenca
-- ============================================================

-- Coluna para dia da semana da aula
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS dia_aula VARCHAR(20);

-- Coluna para horário da aula
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS horario_aula TIME;

-- Coluna para percentual de presença
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS percentual_presenca INTEGER;

-- Índice para consultas de grade horária
CREATE INDEX IF NOT EXISTS idx_alunos_dia_horario ON alunos(dia_aula, horario_aula);

-- Comentários nas colunas
COMMENT ON COLUMN alunos.dia_aula IS 'Dia da semana da aula (Segunda, Terça, etc.)';
COMMENT ON COLUMN alunos.horario_aula IS 'Horário da aula';
COMMENT ON COLUMN alunos.percentual_presenca IS 'Percentual de presença do aluno (0-100)';
