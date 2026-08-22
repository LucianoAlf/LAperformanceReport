-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- View completa de KPIs por Professor com Rankings
CREATE OR REPLACE VIEW vw_kpis_professor_completo AS
WITH carteira AS (
  SELECT 
    professor_atual_id, 
    unidade_id,
    COUNT(*) as qtd_alunos, 
    AVG(valor_parcela) as ticket_medio,
    AVG(percentual_presenca) as media_presenca
  FROM alunos 
  WHERE status = 'ativo' AND professor_atual_id IS NOT NULL
  GROUP BY professor_atual_id, unidade_id
),
experimentais AS (
  SELECT 
    professor_experimental_id, 
    SUM(quantidade) as total
  FROM leads_diarios 
  WHERE tipo = 'experimental_realizada' AND professor_experimental_id IS NOT NULL
  GROUP BY professor_experimental_id
),
matriculas AS (
  SELECT 
    professor_experimental_id, 
    COUNT(*) as total
  FROM leads_diarios 
  WHERE tipo = 'matricula' AND professor_experimental_id IS NOT NULL
  GROUP BY professor_experimental_id
),
evasoes AS (
  SELECT 
    professor_id, 
    COUNT(*) as total, 
    COALESCE(SUM(valor_parcela), 0) as mrr_perdido
  FROM evasoes_v2 
  WHERE professor_id IS NOT NULL
  GROUP BY professor_id
),
renovacoes_data AS (
  SELECT 
    professor_id, 
    COUNT(*) FILTER (WHERE status = 'realizada') as realizadas,
    COUNT(*) FILTER (WHERE status = 'nao_renovada') as nao_renovadas
  FROM renovacoes 
  WHERE professor_id IS NOT NULL
  GROUP BY professor_id
)
SELECT 
  p.id,
  p.nome,
  c.unidade_id,
  u.nome as unidade_nome,
  COALESCE(c.qtd_alunos, 0) as carteira_alunos,
  COALESCE(ROUND(c.ticket_medio::numeric, 2), 0) as ticket_medio,
  COALESCE(ROUND(c.media_presenca::numeric, 1), 0) as media_presenca,
  COALESCE(100 - ROUND(c.media_presenca::numeric, 1), 100) as taxa_faltas,
  COALESCE(e.total, 0) as experimentais,
  COALESCE(m.total, 0) as matriculas,
  CASE 
    WHEN COALESCE(e.total, 0) > 0 
    THEN ROUND((COALESCE(m.total, 0)::decimal / e.total) * 100, 2) 
    ELSE 0 
  END as taxa_conversao,
  COALESCE(ev.total, 0) as evasoes,
  COALESCE(ROUND(ev.mrr_perdido::numeric, 2), 0) as mrr_perdido,
  COALESCE(rd.realizadas, 0) as renovacoes,
  COALESCE(rd.nao_renovadas, 0) as nao_renovacoes,
  CASE 
    WHEN COALESCE(rd.realizadas, 0) + COALESCE(rd.nao_renovadas, 0) > 0 
    THEN ROUND((COALESCE(rd.realizadas, 0)::decimal / (COALESCE(rd.realizadas, 0) + COALESCE(rd.nao_renovadas, 0))) * 100, 2) 
    ELSE 0 
  END as taxa_renovacao,
  CASE 
    WHEN COALESCE(rd.realizadas, 0) + COALESCE(rd.nao_renovadas, 0) > 0 
    THEN ROUND((COALESCE(rd.nao_renovadas, 0)::decimal / (COALESCE(rd.realizadas, 0) + COALESCE(rd.nao_renovadas, 0))) * 100, 2) 
    ELSE 0 
  END as taxa_nao_renovacao,
  CASE 
    WHEN COALESCE(c.qtd_alunos, 0) > 0 
    THEN ROUND((COALESCE(ev.total, 0)::decimal / c.qtd_alunos) * 100, 2) 
    ELSE 0 
  END as taxa_cancelamento,
  RANK() OVER (
    ORDER BY CASE WHEN COALESCE(e.total, 0) > 0 THEN (COALESCE(m.total, 0)::decimal / e.total) ELSE 0 END DESC
  ) as ranking_matriculador,
  RANK() OVER (
    ORDER BY CASE WHEN COALESCE(rd.realizadas, 0) + COALESCE(rd.nao_renovadas, 0) > 0 
      THEN (COALESCE(rd.realizadas, 0)::decimal / (COALESCE(rd.realizadas, 0) + COALESCE(rd.nao_renovadas, 0))) 
      ELSE 0 END DESC
  ) as ranking_renovador,
  RANK() OVER (
    ORDER BY COALESCE(ev.total, 0) ASC
  ) as ranking_churn,
  p.nps_medio,
  p.media_alunos_turma
FROM professores p
LEFT JOIN carteira c ON p.id = c.professor_atual_id
LEFT JOIN unidades u ON c.unidade_id = u.id
LEFT JOIN experimentais e ON p.id = e.professor_experimental_id
LEFT JOIN matriculas m ON p.id = m.professor_experimental_id
LEFT JOIN evasoes ev ON p.id = ev.professor_id
LEFT JOIN renovacoes_data rd ON p.id = rd.professor_id
WHERE p.ativo = true;

COMMENT ON VIEW vw_kpis_professor_completo IS 'KPIs completos por professor com rankings de matriculador, renovador e churn';
