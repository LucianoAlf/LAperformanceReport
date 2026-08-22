-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Migration: separar projeto/banda de segundo curso financeiro
-- Regra canônica: cursos.is_projeto_banda=true NUNCA devem ter is_segundo_curso=true
-- e devem usar tipo_matricula_id=5 (Matrícula em Banda) ou 3/4 (Bolsista)

-- Passo 1: limpar is_segundo_curso de todos os registros de projeto/banda
UPDATE alunos
SET is_segundo_curso = NULL
WHERE curso_id IN (SELECT id FROM cursos WHERE is_projeto_banda = true)
  AND COALESCE(is_segundo_curso, false) = true;

-- Passo 2: padronizar tipo_matricula_id=5 (Banda) para registros de banda
-- que estão como Regular(1) ou Segundo Curso(2)
-- NÃO sobrescreve Bolsista Integral(3) nem Bolsista Parcial(4)
UPDATE alunos
SET tipo_matricula_id = 5
WHERE curso_id IN (SELECT id FROM cursos WHERE is_projeto_banda = true)
  AND tipo_matricula_id IN (1, 2);
