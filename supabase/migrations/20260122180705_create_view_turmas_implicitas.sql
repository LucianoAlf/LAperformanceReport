-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- View para turmas implícitas (baseadas nos dados existentes de alunos)
-- Agrupa alunos por professor + dia + horário
CREATE OR REPLACE VIEW vw_turmas_implicitas AS
SELECT 
  a.unidade_id,
  u.nome as unidade_nome,
  a.professor_atual_id as professor_id,
  p.nome as professor_nome,
  a.curso_id,
  c.nome as curso_nome,
  a.dia_aula as dia_semana,
  a.horario_aula as horario_inicio,
  COUNT(*) as total_alunos,
  ARRAY_AGG(a.nome ORDER BY a.nome) as nomes_alunos,
  ARRAY_AGG(a.id ORDER BY a.nome) as ids_alunos,
  ROUND(AVG(a.valor_parcela)::numeric, 2) as ticket_medio_turma,
  ROUND(AVG(a.tempo_permanencia_meses)::numeric, 1) as tempo_medio_turma
FROM alunos a
LEFT JOIN unidades u ON a.unidade_id = u.id
LEFT JOIN professores p ON a.professor_atual_id = p.id
LEFT JOIN cursos c ON a.curso_id = c.id
WHERE a.status = 'ativo'
  AND a.professor_atual_id IS NOT NULL
  AND a.dia_aula IS NOT NULL
  AND a.horario_aula IS NOT NULL
GROUP BY a.unidade_id, u.nome, a.professor_atual_id, p.nome, 
         a.curso_id, c.nome, a.dia_aula, a.horario_aula
ORDER BY p.nome, a.dia_aula, a.horario_aula;

-- Comentário
COMMENT ON VIEW vw_turmas_implicitas IS 'View de turmas baseada nos dados existentes de alunos (professor + dia + horário)';
