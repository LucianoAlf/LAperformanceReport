-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- ============================================
-- PAINEL FARMER - VIEWS DE ALERTAS
-- ============================================

-- View: Aniversariantes de hoje
CREATE OR REPLACE VIEW vw_farmer_aniversariantes_hoje AS
SELECT 
  a.id as aluno_id,
  a.nome as aluno_nome,
  a.whatsapp,
  a.data_nascimento,
  a.unidade_id,
  EXTRACT(YEAR FROM AGE(a.data_nascimento))::INTEGER as idade,
  p.id as professor_id,
  p.nome as professor_nome,
  c.nome as instrumento
FROM alunos a
LEFT JOIN professores p ON a.professor_atual_id = p.id
LEFT JOIN cursos c ON a.curso_id = c.id
WHERE EXTRACT(MONTH FROM a.data_nascimento) = EXTRACT(MONTH FROM CURRENT_DATE)
  AND EXTRACT(DAY FROM a.data_nascimento) = EXTRACT(DAY FROM CURRENT_DATE)
  AND a.status = 'ativo';

-- View: Inadimplentes (alunos com status_pagamento = 'inadimplente' ou histórico pendente)
CREATE OR REPLACE VIEW vw_farmer_inadimplentes AS
SELECT 
  a.id as aluno_id,
  a.nome as aluno_nome,
  a.whatsapp,
  a.unidade_id,
  a.valor_parcela,
  a.status_pagamento,
  a.dia_vencimento,
  p.id as professor_id,
  p.nome as professor_nome,
  c.nome as instrumento,
  -- Calcular dias de atraso baseado no dia de vencimento
  CASE 
    WHEN a.dia_vencimento IS NOT NULL AND EXTRACT(DAY FROM CURRENT_DATE) > a.dia_vencimento 
    THEN (EXTRACT(DAY FROM CURRENT_DATE) - a.dia_vencimento)::INTEGER
    ELSE 0
  END as dias_atraso
FROM alunos a
LEFT JOIN professores p ON a.professor_atual_id = p.id
LEFT JOIN cursos c ON a.curso_id = c.id
WHERE a.status = 'ativo'
  AND (
    a.status_pagamento = 'inadimplente'
    OR a.status_pagamento = 'pendente'
  )
ORDER BY a.valor_parcela DESC;

-- View: Novos matriculados (últimos 7 dias)
CREATE OR REPLACE VIEW vw_farmer_novos_matriculados AS
SELECT 
  a.id as aluno_id,
  a.nome as aluno_nome,
  a.whatsapp,
  a.unidade_id,
  a.data_matricula,
  a.valor_parcela,
  p.id as professor_id,
  p.nome as professor_nome,
  c.nome as instrumento,
  a.dia_aula,
  a.horario_aula
FROM alunos a
LEFT JOIN professores p ON a.professor_atual_id = p.id
LEFT JOIN cursos c ON a.curso_id = c.id
WHERE a.status = 'ativo'
  AND a.data_matricula >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY a.data_matricula DESC;

-- View: Renovações próximas (vencendo em até 60 dias)
CREATE OR REPLACE VIEW vw_farmer_renovacoes_proximas AS
SELECT 
  a.id as aluno_id,
  a.nome as aluno_nome,
  a.whatsapp,
  a.unidade_id,
  a.data_fim_contrato as data_vencimento,
  (a.data_fim_contrato - CURRENT_DATE)::INTEGER as dias_para_vencer,
  a.valor_parcela,
  p.id as professor_id,
  p.nome as professor_nome,
  c.nome as instrumento,
  -- Classificar urgência
  CASE 
    WHEN a.data_fim_contrato < CURRENT_DATE THEN 'vencido'
    WHEN a.data_fim_contrato <= CURRENT_DATE + INTERVAL '7 days' THEN 'urgente'
    WHEN a.data_fim_contrato <= CURRENT_DATE + INTERVAL '15 days' THEN 'atencao'
    ELSE 'normal'
  END as urgencia
FROM alunos a
LEFT JOIN professores p ON a.professor_atual_id = p.id
LEFT JOIN cursos c ON a.curso_id = c.id
LEFT JOIN renovacoes r ON r.aluno_id = a.id 
  AND r.data_fim_novo_contrato > a.data_fim_contrato 
  AND r.status = 'concluida'
WHERE a.status = 'ativo'
  AND a.data_fim_contrato IS NOT NULL
  AND a.data_fim_contrato <= CURRENT_DATE + INTERVAL '60 days'
  AND r.id IS NULL -- Não tem renovação pendente
ORDER BY a.data_fim_contrato ASC;

-- View: Resumo de alertas por unidade (para dashboard)
CREATE OR REPLACE VIEW vw_farmer_resumo_alertas AS
SELECT 
  u.id as unidade_id,
  u.nome as unidade_nome,
  -- Aniversariantes
  (SELECT COUNT(*) FROM vw_farmer_aniversariantes_hoje WHERE unidade_id = u.id) as aniversariantes_hoje,
  -- Inadimplentes
  (SELECT COUNT(*) FROM vw_farmer_inadimplentes WHERE unidade_id = u.id) as inadimplentes,
  -- Novos matriculados
  (SELECT COUNT(*) FROM vw_farmer_novos_matriculados WHERE unidade_id = u.id) as novos_matriculados,
  -- Renovações
  (SELECT COUNT(*) FROM vw_farmer_renovacoes_proximas WHERE unidade_id = u.id AND urgencia = 'vencido') as renovacoes_vencidas,
  (SELECT COUNT(*) FROM vw_farmer_renovacoes_proximas WHERE unidade_id = u.id AND urgencia = 'urgente') as renovacoes_urgentes,
  (SELECT COUNT(*) FROM vw_farmer_renovacoes_proximas WHERE unidade_id = u.id AND urgencia = 'atencao') as renovacoes_atencao
FROM unidades u
WHERE u.ativo = true;

-- Comentários nas views
COMMENT ON VIEW vw_farmer_aniversariantes_hoje IS 'Alunos que fazem aniversário hoje';
COMMENT ON VIEW vw_farmer_inadimplentes IS 'Alunos com pagamento pendente ou inadimplente';
COMMENT ON VIEW vw_farmer_novos_matriculados IS 'Alunos matriculados nos últimos 7 dias';
COMMENT ON VIEW vw_farmer_renovacoes_proximas IS 'Alunos com contrato vencendo em até 60 dias';
COMMENT ON VIEW vw_farmer_resumo_alertas IS 'Resumo de alertas por unidade para dashboard';
