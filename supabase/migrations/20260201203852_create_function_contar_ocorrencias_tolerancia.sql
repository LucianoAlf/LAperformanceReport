-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Função para contar ocorrências do mês por professor/unidade/critério
-- Retorna quantas ocorrências já foram registradas no mês atual
CREATE OR REPLACE FUNCTION get_ocorrencias_mes(
  p_professor_id INTEGER,
  p_unidade_id UUID,
  p_criterio_id INTEGER,
  p_competencia VARCHAR DEFAULT NULL
)
RETURNS TABLE (
  total_ocorrencias INTEGER,
  tolerancia INTEGER,
  dentro_tolerancia BOOLEAN,
  ocorrencias_restantes INTEGER
) AS $$
DECLARE
  v_competencia VARCHAR;
  v_total INTEGER;
  v_tolerancia INTEGER;
BEGIN
  -- Se não passou competência, usa o mês atual
  IF p_competencia IS NULL THEN
    v_competencia := TO_CHAR(CURRENT_DATE, 'YYYY-MM');
  ELSE
    v_competencia := p_competencia;
  END IF;
  
  -- Buscar tolerância do critério
  SELECT COALESCE(c.tolerancia, 0) INTO v_tolerancia
  FROM professor_360_criterios c
  WHERE c.id = p_criterio_id;
  
  -- Contar ocorrências do mês para este professor/unidade/critério
  SELECT COUNT(*)::INTEGER INTO v_total
  FROM professor_360_ocorrencias o
  WHERE o.professor_id = p_professor_id
    AND o.unidade_id = p_unidade_id
    AND o.criterio_id = p_criterio_id
    AND o.competencia = v_competencia;
  
  -- Retornar resultado
  RETURN QUERY SELECT 
    v_total AS total_ocorrencias,
    v_tolerancia AS tolerancia,
    (v_total < v_tolerancia) AS dentro_tolerancia,
    GREATEST(0, v_tolerancia - v_total) AS ocorrencias_restantes;
END;
$$ LANGUAGE plpgsql;

-- Função para calcular pontos perdidos considerando tolerância
-- Só desconta pontos após esgotar a tolerância
CREATE OR REPLACE FUNCTION calcular_pontos_perdidos_com_tolerancia(
  p_professor_id INTEGER,
  p_unidade_id UUID,
  p_criterio_id INTEGER,
  p_competencia VARCHAR
)
RETURNS INTEGER AS $$
DECLARE
  v_total_ocorrencias INTEGER;
  v_tolerancia INTEGER;
  v_pontos_perda INTEGER;
  v_ocorrencias_alem_tolerancia INTEGER;
BEGIN
  -- Buscar dados do critério
  SELECT COALESCE(c.tolerancia, 0), COALESCE(c.pontos_perda, 0)
  INTO v_tolerancia, v_pontos_perda
  FROM professor_360_criterios c
  WHERE c.id = p_criterio_id;
  
  -- Contar ocorrências do mês
  SELECT COUNT(*)::INTEGER INTO v_total_ocorrencias
  FROM professor_360_ocorrencias o
  WHERE o.professor_id = p_professor_id
    AND o.unidade_id = p_unidade_id
    AND o.criterio_id = p_criterio_id
    AND o.competencia = p_competencia;
  
  -- Calcular quantas ocorrências estão além da tolerância
  v_ocorrencias_alem_tolerancia := GREATEST(0, v_total_ocorrencias - v_tolerancia);
  
  -- Retornar pontos perdidos (só desconta após tolerância)
  RETURN v_ocorrencias_alem_tolerancia * v_pontos_perda;
END;
$$ LANGUAGE plpgsql;
