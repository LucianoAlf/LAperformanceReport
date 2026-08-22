-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Adicionar coluna tipo_aluno se não existir
ALTER TABLE alunos
ADD COLUMN IF NOT EXISTS tipo_aluno VARCHAR(50) DEFAULT 'pagante';

-- Criar constraint para validar valores permitidos
ALTER TABLE alunos
DROP CONSTRAINT IF EXISTS alunos_tipo_aluno_check;

ALTER TABLE alunos
ADD CONSTRAINT alunos_tipo_aluno_check 
CHECK (tipo_aluno IN ('pagante', 'pagante_2_curso', 'bolsista_integral', 'bolsista_parcial', 'nao_pagante'));

-- Atualizar valores existentes (se necessário)
UPDATE alunos 
SET tipo_aluno = 'pagante' 
WHERE tipo_aluno IS NULL;

-- Adicionar comentário explicativo
COMMENT ON COLUMN alunos.tipo_aluno IS 'Tipo de aluno: pagante, pagante_2_curso, bolsista_integral, bolsista_parcial, nao_pagante';
