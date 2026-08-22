-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Corrigir fórmula do Ticket Médio na view vw_kpis_professor_mensal
-- Fórmula correta: SUM(valor_parcela de TODOS pagantes) / COUNT(alunos pagantes WHERE is_segundo_curso = false)
-- O segundo curso contribui pro MRR mas não conta como pessoa separada no denominador

CREATE OR REPLACE VIEW vw_kpis_professor_mensal AS
WITH 
-- Carteira de alunos por professor (com ticket médio CORRETO)
carteira AS (
  SELECT 
    a.professor_atual_id AS professor_id,
    a.unidade_id,
    COUNT(*) AS carteira_alunos,
    -- CORREÇÃO: Ticket médio = SUM(parcelas de todos) / COUNT(alunos únicos pagantes)
    -- Segundo curso contribui pro faturamento mas não conta como aluno separado
    CASE 
      WHEN COUNT(*) FILTER (WHERE a.valor_parcela > 0 AND (a.is_segundo_curso = false OR a.is_segundo_curso IS NULL)) > 0 
      THEN SUM(CASE WHEN a.valor_parcela > 0 THEN a.valor_parcela ELSE 0 END) / 
           COUNT(*) FILTER (WHERE a.valor_parcela > 0 AND (a.is_segundo_curso = false OR a.is_segundo_curso IS NULL))
      ELSE 0
    END AS ticket_medio,
    AVG(a.percentual_presenca) AS media_presenca,
    SUM(CASE WHEN a.valor_parcela > 0 THEN a.valor_parcela ELSE 0 END) AS mrr_carteira
  FROM alunos a
  WHERE a.status = 'ativo'
    AND a.professor_atual_id IS NOT NULL
  GROUP BY a.professor_atual_id, a.unidade_id
),

-- Turmas calculadas da view vw_turmas_implicitas
turmas_calc AS (
  SELECT 
    vt.professor_id,
    vt.unidade_id,
    COUNT(*) AS total_turmas,
    ROUND(AVG(vt.total_alunos), 2) AS media_alunos_turma
  FROM vw_turmas_implicitas vt
  GROUP BY vt.professor_id, vt.unidade_id
),

-- Experimentais e matrículas do mês atual (de leads)
experimentais_atual AS (
  SELECT 
    l.professor_experimental_id AS professor_id,
    l.unidade_id,
    SUM(CASE WHEN l.status IN ('experimental_realizada', 'compareceu') THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS experimentais,
    SUM(CASE WHEN l.status IN ('matriculado', 'convertido') THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS matriculas
  FROM leads l
  WHERE l.professor_experimental_id IS NOT NULL
    AND EXTRACT(YEAR FROM l.data_contato) = EXTRACT(YEAR FROM CURRENT_DATE)
    AND EXTRACT(MONTH FROM l.data_contato) = EXTRACT(MONTH FROM CURRENT_DATE)
  GROUP BY l.professor_experimental_id, l.unidade_id
),

-- Renovações do mês atual (de movimentacoes_admin - fonte de verdade)
renovacoes_atual AS (
  SELECT 
    COALESCE(m.professor_id, a.professor_atual_id) AS professor_id,
    m.unidade_id,
    COUNT(*) FILTER (WHERE m.tipo = 'renovacao') AS renovacoes,
    COUNT(*) FILTER (WHERE m.tipo = 'nao_renovacao') AS nao_renovacoes,
    COUNT(*) FILTER (WHERE m.tipo IN ('renovacao', 'nao_renovacao')) AS total_contratos
  FROM movimentacoes_admin m
  LEFT JOIN alunos a ON a.id = m.aluno_id
  WHERE COALESCE(m.professor_id, a.professor_atual_id) IS NOT NULL
    AND m.tipo IN ('renovacao', 'nao_renovacao')
    AND EXTRACT(YEAR FROM m.data) = EXTRACT(YEAR FROM CURRENT_DATE)
    AND EXTRACT(MONTH FROM m.data) = EXTRACT(MONTH FROM CURRENT_DATE)
  GROUP BY COALESCE(m.professor_id, a.professor_atual_id), m.unidade_id
),

-- Evasões do mês atual (excluindo Aviso Prévio e segundo curso)
evasoes_atual AS (
  SELECT 
    e.professor_id,
    e.unidade_id,
    COUNT(*) AS evasoes,
    SUM(CASE WHEN e.valor_parcela > 0 THEN e.valor_parcela ELSE 0 END) AS mrr_perdido
  FROM evasoes_v2 e
  LEFT JOIN alunos a ON a.id = e.aluno_id
  WHERE e.professor_id IS NOT NULL
    AND e.tipo_saida_id IN (1, 2) -- Só Cancelamento e Não Renovação (exclui Aviso Prévio)
    AND (e.valor_parcela > 0 OR e.valor_parcela IS NULL)
    AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false OR a.id IS NULL)
    AND EXTRACT(YEAR FROM e.data_evasao) = EXTRACT(YEAR FROM CURRENT_DATE)
    AND EXTRACT(MONTH FROM e.data_evasao) = EXTRACT(MONTH FROM CURRENT_DATE)
  GROUP BY e.professor_id, e.unidade_id
)

SELECT DISTINCT ON (p.id, COALESCE(c.unidade_id, ea.unidade_id, ra.unidade_id, ev.unidade_id))
  p.id AS professor_id,
  p.nome AS professor_nome,
  COALESCE(c.unidade_id, ea.unidade_id, ra.unidade_id, ev.unidade_id) AS unidade_id,
  EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER AS ano,
  EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER AS mes,
  
  -- Carteira
  COALESCE(c.carteira_alunos, 0)::INTEGER AS carteira_alunos,
  COALESCE(c.ticket_medio, 0)::NUMERIC(10,2) AS ticket_medio,
  COALESCE(c.media_presenca, 0)::NUMERIC(5,2) AS media_presenca,
  COALESCE(100 - c.media_presenca, 0)::NUMERIC(5,2) AS taxa_faltas,
  COALESCE(c.mrr_carteira, 0)::NUMERIC(12,2) AS mrr_carteira,
  COALESCE(p.nps_medio, 0)::NUMERIC(5,2) AS nps_medio,
  COALESCE(tc.media_alunos_turma, 0)::NUMERIC(5,2) AS media_alunos_turma,
  
  -- Conversão
  COALESCE(ea.experimentais, 0)::INTEGER AS experimentais,
  COALESCE(ea.matriculas, 0)::INTEGER AS matriculas,
  CASE 
    WHEN COALESCE(ea.experimentais, 0) > 0 
    THEN ROUND(COALESCE(ea.matriculas, 0)::NUMERIC / ea.experimentais * 100, 2)
    ELSE 0
  END AS taxa_conversao,
  
  -- Retenção
  COALESCE(ra.renovacoes, 0)::INTEGER AS renovacoes,
  COALESCE(ra.nao_renovacoes, 0)::INTEGER AS nao_renovacoes,
  CASE 
    WHEN COALESCE(ra.total_contratos, 0) > 0 
    THEN ROUND(ra.renovacoes::NUMERIC / ra.total_contratos * 100, 2)
    ELSE 0
  END AS taxa_renovacao,
  
  -- Evasões
  COALESCE(ev.evasoes, 0)::INTEGER AS evasoes,
  COALESCE(ev.mrr_perdido, 0)::NUMERIC(12,2) AS mrr_perdido,
  CASE 
    WHEN COALESCE(c.carteira_alunos, 0) > 0 
    THEN ROUND(COALESCE(ev.evasoes, 0)::NUMERIC / c.carteira_alunos * 100, 2)
    ELSE 0
  END AS taxa_cancelamento,
  
  -- Rankings (calculados no frontend)
  0 AS ranking_matriculador,
  0 AS ranking_renovador,
  0 AS ranking_churn

FROM professores p
LEFT JOIN carteira c ON c.professor_id = p.id
LEFT JOIN turmas_calc tc ON tc.professor_id = p.id AND tc.unidade_id = c.unidade_id
LEFT JOIN experimentais_atual ea ON ea.professor_id = p.id AND ea.unidade_id = c.unidade_id
LEFT JOIN renovacoes_atual ra ON ra.professor_id = p.id AND ra.unidade_id = c.unidade_id
LEFT JOIN evasoes_atual ev ON ev.professor_id = p.id AND ev.unidade_id = c.unidade_id
WHERE p.ativo = true
  AND COALESCE(c.unidade_id, ea.unidade_id, ra.unidade_id, ev.unidade_id) IS NOT NULL
ORDER BY p.id, COALESCE(c.unidade_id, ea.unidade_id, ra.unidade_id, ev.unidade_id), c.carteira_alunos DESC NULLS LAST;
