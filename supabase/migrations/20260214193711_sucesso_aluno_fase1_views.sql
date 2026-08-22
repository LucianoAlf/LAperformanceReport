-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- =====================================================
-- 10. VIEW: vw_aluno_sucesso_lista
-- Lista completa de alunos para a tabela de Sucesso do Cliente
-- =====================================================
CREATE OR REPLACE VIEW vw_aluno_sucesso_lista AS
SELECT 
  a.id,
  a.nome,
  a.unidade_id,
  u.codigo AS unidade_codigo,
  u.nome AS unidade_nome,
  a.professor_atual_id,
  p.nome AS professor_nome,
  a.curso_id,
  c.nome AS curso_nome,
  a.tempo_permanencia_meses,
  a.status_pagamento,
  a.valor_parcela,
  a.percentual_presenca,
  a.data_matricula,
  a.dia_aula,
  a.horario_aula,
  a.modalidade,
  a.status,
  
  -- Fase da Jornada (calculada)
  CASE 
    WHEN a.tempo_permanencia_meses IS NULL THEN 'onboarding'
    WHEN a.tempo_permanencia_meses < 3 THEN 'onboarding'
    WHEN a.tempo_permanencia_meses < 6 THEN 'consolidacao'
    WHEN a.tempo_permanencia_meses < 9 THEN 'encantamento'
    ELSE 'renovacao'
  END AS fase_jornada,
  
  -- Health Score
  a.health_score_numerico,
  a.health_score AS health_status,
  a.health_score_updated_at,
  
  -- Último feedback do professor
  fb.feedback AS ultimo_feedback,
  fb.observacao AS ultimo_feedback_obs,
  fb.respondido_em AS ultimo_feedback_data,
  fb.professor_id AS ultimo_feedback_professor_id,
  
  -- Contadores
  COALESCE(ac.total_acoes, 0)::INTEGER AS total_acoes,
  COALESCE(mt.metas_ativas, 0)::INTEGER AS metas_ativas,
  
  -- Dados do responsável (para menores)
  a.responsavel_nome,
  a.responsavel_telefone,
  a.whatsapp

FROM alunos a
LEFT JOIN unidades u ON a.unidade_id = u.id
LEFT JOIN professores p ON a.professor_atual_id = p.id
LEFT JOIN cursos c ON a.curso_id = c.id
LEFT JOIN LATERAL (
  SELECT feedback, observacao, respondido_em, professor_id
  FROM aluno_feedback_professor
  WHERE aluno_id = a.id
  ORDER BY competencia DESC, respondido_em DESC
  LIMIT 1
) fb ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*)::INTEGER AS total_acoes
  FROM aluno_acoes
  WHERE aluno_id = a.id
) ac ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*)::INTEGER AS metas_ativas
  FROM aluno_metas
  WHERE aluno_id = a.id AND status = 'ativa'
) mt ON true

WHERE a.status IN ('ativo', 'trancado')
  AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false);

COMMENT ON VIEW vw_aluno_sucesso_lista IS 'View completa de alunos para a feature Sucesso do Cliente';

-- =====================================================
-- 11. VIEW: vw_aluno_sucesso_resumo
-- KPIs resumidos por unidade para o dashboard
-- =====================================================
CREATE OR REPLACE VIEW vw_aluno_sucesso_resumo AS
SELECT 
  unidade_id,
  unidade_codigo,
  unidade_nome,
  COUNT(*)::INTEGER AS total_alunos,
  
  -- Por Health Score
  COUNT(*) FILTER (WHERE health_status = 'saudavel')::INTEGER AS saudaveis,
  COUNT(*) FILTER (WHERE health_status = 'atencao')::INTEGER AS atencao,
  COUNT(*) FILTER (WHERE health_status = 'critico')::INTEGER AS criticos,
  COUNT(*) FILTER (WHERE health_status IS NULL)::INTEGER AS sem_score,
  
  -- Por Fase da Jornada
  COUNT(*) FILTER (WHERE fase_jornada = 'onboarding')::INTEGER AS onboarding,
  COUNT(*) FILTER (WHERE fase_jornada = 'consolidacao')::INTEGER AS consolidacao,
  COUNT(*) FILTER (WHERE fase_jornada = 'encantamento')::INTEGER AS encantamento,
  COUNT(*) FILTER (WHERE fase_jornada = 'renovacao')::INTEGER AS renovacao,
  
  -- Por Status de Pagamento
  COUNT(*) FILTER (WHERE status_pagamento = 'em_dia')::INTEGER AS pagamento_em_dia,
  COUNT(*) FILTER (WHERE status_pagamento = 'atrasado')::INTEGER AS pagamento_atrasado,
  COUNT(*) FILTER (WHERE status_pagamento = 'inadimplente')::INTEGER AS pagamento_inadimplente,
  
  -- Por Feedback
  COUNT(*) FILTER (WHERE ultimo_feedback = 'verde')::INTEGER AS feedback_verde,
  COUNT(*) FILTER (WHERE ultimo_feedback = 'amarelo')::INTEGER AS feedback_amarelo,
  COUNT(*) FILTER (WHERE ultimo_feedback = 'vermelho')::INTEGER AS feedback_vermelho,
  COUNT(*) FILTER (WHERE ultimo_feedback IS NULL)::INTEGER AS sem_feedback,
  
  -- Médias
  ROUND(AVG(tempo_permanencia_meses)::NUMERIC, 1) AS media_tempo_permanencia,
  ROUND(AVG(valor_parcela)::NUMERIC, 2) AS ticket_medio,
  ROUND(AVG(health_score_numerico)::NUMERIC, 1) AS health_score_medio,
  ROUND(AVG(percentual_presenca)::NUMERIC, 1) AS presenca_media

FROM vw_aluno_sucesso_lista
GROUP BY unidade_id, unidade_codigo, unidade_nome;

COMMENT ON VIEW vw_aluno_sucesso_resumo IS 'KPIs resumidos de Sucesso do Cliente por unidade';
