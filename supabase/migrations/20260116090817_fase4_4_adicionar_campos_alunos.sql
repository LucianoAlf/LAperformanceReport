-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================
-- FASE 4.4: ADICIONAR CAMPOS NA TABELA ALUNOS
-- Campos para aula experimental, renovação e NPS
-- ============================================

-- Adicionar campos faltantes na tabela alunos
ALTER TABLE alunos 
ADD COLUMN IF NOT EXISTS professor_experimental_id INTEGER REFERENCES professores(id),
ADD COLUMN IF NOT EXISTS agente_comercial VARCHAR(100),
ADD COLUMN IF NOT EXISTS is_aluno_retorno BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS data_ultima_renovacao DATE,
ADD COLUMN IF NOT EXISTS numero_renovacoes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS nps_saida INTEGER CHECK (nps_saida >= 0 AND nps_saida <= 10);

-- Comentários
COMMENT ON COLUMN alunos.professor_experimental_id IS 'Professor que deu a aula experimental (pode ser diferente do professor atual)';
COMMENT ON COLUMN alunos.agente_comercial IS 'Nome do agente comercial que fechou a matrícula';
COMMENT ON COLUMN alunos.is_aluno_retorno IS 'Se é um ex-aluno que voltou';
COMMENT ON COLUMN alunos.data_ultima_renovacao IS 'Data da última renovação de contrato';
COMMENT ON COLUMN alunos.numero_renovacoes IS 'Quantas vezes o aluno renovou o contrato';
COMMENT ON COLUMN alunos.nps_saida IS 'Nota NPS coletada na saída do aluno (0-10)';
