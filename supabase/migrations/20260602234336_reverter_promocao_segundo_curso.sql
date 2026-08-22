-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Reverter: voltar os 3 registros ao estado original
-- Motivo: evitar conflito com sincronização Emusys/Cron

UPDATE alunos
SET is_segundo_curso = CASE id
    WHEN 1725 THEN true   -- Eva: já era 2o curso
    WHEN 1585 THEN true   -- Matheus: já era 2o curso
    WHEN 1500 THEN true   -- Valdemir: já era 2o curso
  END,
  tipo_matricula_id = CASE id
    WHEN 1725 THEN 1      -- Eva: já era Pagante
    WHEN 1585 THEN 2      -- Matheus: era 2o Curso
    WHEN 1500 THEN 2      -- Valdemir: era 2o Curso
  END
WHERE id IN (1725, 1585, 1500);

-- Verificar
SELECT a.id, a.nome, a.is_segundo_curso, a.tipo_matricula_id,
       CASE a.tipo_matricula_id
         WHEN 1 THEN 'Pagante'
         WHEN 2 THEN '2o Curso'
         ELSE 'ID:' || a.tipo_matricula_id::text
       END AS tipo_label
FROM alunos a
WHERE a.id IN (1725, 1585, 1500)
ORDER BY a.id;
