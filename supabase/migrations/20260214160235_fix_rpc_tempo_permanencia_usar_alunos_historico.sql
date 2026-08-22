-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Reescrever RPC get_tempo_permanencia para usar a fonte de verdade correta:
-- 1. alunos_historico (base histórica importada — já filtrada: pagantes, ≥4 meses)
-- 2. alunos com status inativo/evadido (evasões recentes ainda na tabela)
-- Resultado esperado: Barra ~13.1m, CG ~18.2m, Recreio ~14.8m

DROP FUNCTION IF EXISTS get_tempo_permanencia(UUID, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION get_tempo_permanencia(
  p_unidade_id UUID DEFAULT NULL,
  p_ano INTEGER DEFAULT NULL,
  p_mes INTEGER DEFAULT NULL
)
RETURNS TABLE (
  unidade_id UUID,
  unidade_nome TEXT,
  tempo_permanencia_medio NUMERIC,
  total_evasoes_elegiveis INTEGER,
  soma_meses INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH 
  -- Fonte 1: base histórica (alunos que saíram e foram removidos da tabela alunos)
  -- Já filtrada na importação: apenas pagantes com ≥4 meses
  historico AS (
    SELECT ah.unidade_id AS uid, ah.tempo_permanencia_meses AS meses
    FROM alunos_historico ah
    WHERE (p_unidade_id IS NULL OR ah.unidade_id = p_unidade_id)
  ),
  -- Fonte 2: alunos que saíram recentemente (ainda na tabela alunos)
  -- Aplicar filtros: pagantes, ≥4 meses, sem bolsistas, sem 2º curso
  atuais AS (
    SELECT a.unidade_id AS uid, a.tempo_permanencia_meses AS meses
    FROM alunos a
    LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
    WHERE a.status IN ('inativo', 'evadido')
      AND a.tempo_permanencia_meses >= 4
      AND (tm.codigo IS NULL OR tm.codigo NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA'))
      AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)
      AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
  ),
  -- Combinar ambas as fontes
  todos AS (
    SELECT * FROM historico
    UNION ALL
    SELECT * FROM atuais
  ),
  -- Calcular por unidade
  calc AS (
    SELECT 
      u.id AS uid,
      COALESCE(ROUND(AVG(t.meses)::NUMERIC, 1), 0) AS tp_medio,
      COALESCE(COUNT(t.meses)::INTEGER, 0) AS total_el,
      COALESCE(SUM(t.meses)::INTEGER, 0) AS soma_m
    FROM unidades u
    LEFT JOIN todos t ON t.uid = u.id
    WHERE u.ativo = true
    GROUP BY u.id
  )
  SELECT 
    u.id AS unidade_id,
    u.nome::TEXT AS unidade_nome,
    c.tp_medio AS tempo_permanencia_medio,
    c.total_el AS total_evasoes_elegiveis,
    c.soma_m AS soma_meses
  FROM unidades u
  JOIN calc c ON c.uid = u.id
  WHERE u.ativo = true;
END;
$$;
