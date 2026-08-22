-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- View para turmas com contagem de alunos e informações completas
CREATE OR REPLACE VIEW vw_turmas_completa AS
SELECT 
  t.id,
  t.unidade_id,
  u.nome as unidade_nome,
  t.professor_id,
  p.nome as professor_nome,
  t.sala_id,
  s.nome as sala_nome,
  t.curso_id,
  c.nome as curso_nome,
  t.dia_semana,
  t.horario_inicio,
  t.horario_fim,
  COALESCE(t.capacidade_maxima, s.capacidade_maxima, 4) as capacidade_maxima,
  t.nome as turma_nome,
  t.ativo,
  COUNT(DISTINCT at.aluno_id) FILTER (WHERE at.ativo = true) as total_alunos,
  ARRAY_AGG(DISTINCT a.nome) FILTER (WHERE at.ativo = true) as nomes_alunos,
  ARRAY_AGG(DISTINCT a.id) FILTER (WHERE at.ativo = true) as ids_alunos
FROM turmas t
LEFT JOIN unidades u ON t.unidade_id = u.id
LEFT JOIN professores p ON t.professor_id = p.id
LEFT JOIN salas s ON t.sala_id = s.id
LEFT JOIN cursos c ON t.curso_id = c.id
LEFT JOIN alunos_turmas at ON t.id = at.turma_id
LEFT JOIN alunos a ON at.aluno_id = a.id AND a.status = 'ativo'
WHERE t.ativo = true
GROUP BY t.id, t.unidade_id, u.nome, t.professor_id, p.nome, t.sala_id, s.nome, 
         t.curso_id, c.nome, t.dia_semana, t.horario_inicio, t.horario_fim, 
         t.capacidade_maxima, s.capacidade_maxima, t.nome, t.ativo;

-- Comentário
COMMENT ON VIEW vw_turmas_completa IS 'View com informações completas das turmas incluindo contagem de alunos';
