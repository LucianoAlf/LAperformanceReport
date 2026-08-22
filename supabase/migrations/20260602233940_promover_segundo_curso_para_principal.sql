-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Promover 2º curso para principal quando o 1º não está ativo
-- Casos identificados na auditoria do dia 02/06/2026

UPDATE alunos
SET is_segundo_curso = false,
    tipo_matricula_id = 1  -- Promover para Pagante (curso principal)
WHERE id IN (1725, 1585, 1500);

-- Verificar resultado
SELECT 
  a.id,
  a.nome,
  a.status,
  c.nome AS curso,
  a.is_segundo_curso,
  a.tipo_matricula_id,
  a.valor_parcela
FROM alunos a
LEFT JOIN cursos c ON c.id = a.curso_id
WHERE a.id IN (1725, 1585, 1500)
ORDER BY a.id;
