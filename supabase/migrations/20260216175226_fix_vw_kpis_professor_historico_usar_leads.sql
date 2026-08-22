-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Corrigir view para usar tabela leads como fonte de matrículas (consistente com experimentais)
-- Matrículas = leads com status matriculado/convertido no período
-- Experimentais = leads com status experimental_realizada no período

CREATE OR REPLACE VIEW vw_kpis_professor_historico AS
WITH experimentais_prof AS (
  -- Experimentais realizadas por professor (apenas experimental_realizada)
  SELECT 
    l.professor_experimental_id AS professor_id,
    l.unidade_id,
    EXTRACT(YEAR FROM l.data_contato)::INTEGER AS ano,
    EXTRACT(MONTH FROM l.data_contato)::INTEGER AS mes,
    SUM(COALESCE(l.quantidade, 1)) AS experimentais
  FROM leads l
  WHERE l.status = 'experimental_realizada'
    AND l.professor_experimental_id IS NOT NULL
  GROUP BY l.professor_experimental_id, l.unidade_id, 
           EXTRACT(YEAR FROM l.data_contato), EXTRACT(MONTH FROM l.data_contato)
),
matriculas_prof AS (
  -- Matrículas por professor (status matriculado/convertido com professor_experimental_id)
  SELECT 
    l.professor_experimental_id AS professor_id,
    l.unidade_id,
    EXTRACT(YEAR FROM l.data_contato)::INTEGER AS ano,
    EXTRACT(MONTH FROM l.data_contato)::INTEGER AS mes,
    SUM(COALESCE(l.quantidade, 1)) AS matriculas
  FROM leads l
  WHERE l.status IN ('matriculado', 'convertido')
    AND l.professor_experimental_id IS NOT NULL
  GROUP BY l.professor_experimental_id, l.unidade_id, 
           EXTRACT(YEAR FROM l.data_contato), EXTRACT(MONTH FROM l.data_contato)
),
totais_unidade AS (
  SELECT 
    unidade_id,
    ano,
    mes,
    total_experimentais,
    total_matriculas
  FROM experimentais_mensal_unidade
),
-- Combinar experimentais e matrículas
combined AS (
  SELECT 
    COALESCE(ep.professor_id, mp.professor_id) AS professor_id,
    COALESCE(ep.unidade_id, mp.unidade_id) AS unidade_id,
    COALESCE(ep.ano, mp.ano) AS ano,
    COALESCE(ep.mes, mp.mes) AS mes,
    COALESCE(ep.experimentais, 0) AS experimentais,
    COALESCE(mp.matriculas, 0) AS matriculas
  FROM experimentais_prof ep
  FULL OUTER JOIN matriculas_prof mp 
    ON ep.professor_id = mp.professor_id 
    AND ep.unidade_id = mp.unidade_id 
    AND ep.ano = mp.ano 
    AND ep.mes = mp.mes
)
SELECT 
  p.id AS professor_id,
  p.nome AS professor_nome,
  c.unidade_id,
  c.ano,
  c.mes,
  c.matriculas::INTEGER AS matriculas,
  0::NUMERIC(10,2) AS ticket_medio,
  c.experimentais::INTEGER AS experimentais,
  COALESCE(tu.total_experimentais, 0) AS total_experimentais_unidade,
  COALESCE(tu.total_matriculas, 0) AS total_matriculas_unidade,
  CASE 
    WHEN c.experimentais > 0 THEN ROUND(c.matriculas::NUMERIC / c.experimentais * 100, 2)
    ELSE 0
  END AS taxa_conversao,
  p.nps_medio::NUMERIC(5,2) AS nps_medio,
  p.media_alunos_turma::NUMERIC(5,2) AS media_alunos_turma
FROM professores p
JOIN combined c ON c.professor_id = p.id
LEFT JOIN totais_unidade tu ON tu.unidade_id = c.unidade_id AND tu.ano = c.ano AND tu.mes = c.mes
WHERE p.ativo = true;
