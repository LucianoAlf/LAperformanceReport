-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- View que calcula performance de professores em tempo real
CREATE OR REPLACE VIEW vw_professores_performance_atual AS
WITH alunos_por_professor AS (
  SELECT 
    p.id as professor_id,
    p.nome as professor,
    u.nome as unidade,
    u.id as unidade_id,
    COUNT(a.id) as total_alunos,
    COALESCE(AVG(a.valor_parcela), 0) as ticket_medio,
    COALESCE(SUM(a.valor_parcela), 0) as mrr,
    COALESCE(AVG(a.tempo_permanencia_meses), 0) as tempo_medio,
    COALESCE(AVG(a.percentual_presenca), 0) as presenca_media
  FROM professores p
  JOIN professores_unidades pu ON pu.professor_id = p.id
  JOIN unidades u ON u.id = pu.unidade_id
  LEFT JOIN alunos a ON a.professor_atual_id = p.id 
    AND a.unidade_id = u.id 
    AND a.status = 'ativo'
  WHERE p.ativo = true
  GROUP BY p.id, p.nome, u.nome, u.id
),
experimentais_ano AS (
  SELECT 
    professor_id,
    unidade_id,
    SUM(experimentais) as total_experimentais
  FROM experimentais_professor_mensal
  WHERE ano = EXTRACT(YEAR FROM CURRENT_DATE)
  GROUP BY professor_id, unidade_id
),
matriculas_ano AS (
  SELECT 
    professor_fixo_id as professor_id,
    unidade_id,
    SUM(quantidade) as total_matriculas
  FROM leads_diarios
  WHERE tipo = 'matricula' 
    AND professor_fixo_id IS NOT NULL
    AND EXTRACT(YEAR FROM data) = EXTRACT(YEAR FROM CURRENT_DATE)
  GROUP BY professor_fixo_id, unidade_id
),
evasoes_ano AS (
  SELECT 
    p.id as professor_id,
    u.id as unidade_id,
    COUNT(*) as total_evasoes
  FROM evasoes e
  JOIN professores p ON p.nome = e.professor
  JOIN unidades u ON u.nome = e.unidade
  WHERE EXTRACT(YEAR FROM e.competencia) = EXTRACT(YEAR FROM CURRENT_DATE)
  GROUP BY p.id, u.id
)
SELECT 
  ap.professor_id,
  ap.professor,
  ap.unidade,
  EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER as ano,
  ap.total_alunos,
  ap.ticket_medio::NUMERIC(10,2),
  ap.mrr::NUMERIC(12,2),
  ap.tempo_medio::NUMERIC(5,1) as tempo_permanencia_medio,
  ap.presenca_media::NUMERIC(5,1),
  COALESCE(ea.total_experimentais, 0)::INTEGER as experimentais,
  COALESCE(ma.total_matriculas, 0)::INTEGER as matriculas,
  CASE WHEN COALESCE(ea.total_experimentais, 0) > 0 
    THEN ROUND((COALESCE(ma.total_matriculas, 0)::NUMERIC / ea.total_experimentais) * 100, 1)
    ELSE 0 
  END as taxa_conversao,
  COALESCE(ev.total_evasoes, 0)::INTEGER as evasoes
FROM alunos_por_professor ap
LEFT JOIN experimentais_ano ea ON ea.professor_id = ap.professor_id AND ea.unidade_id = ap.unidade_id
LEFT JOIN matriculas_ano ma ON ma.professor_id = ap.professor_id AND ma.unidade_id = ap.unidade_id
LEFT JOIN evasoes_ano ev ON ev.professor_id = ap.professor_id AND ev.unidade_id = ap.unidade_id
ORDER BY ap.total_alunos DESC;

COMMENT ON VIEW vw_professores_performance_atual IS 
'View que calcula performance de professores em tempo real. Substitui professores_performance para dados do ano atual.';
