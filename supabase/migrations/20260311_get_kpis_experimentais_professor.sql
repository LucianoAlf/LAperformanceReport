-- Retorna experimentais + matriculas por professor para qualquer mês/ano
-- Mesma lógica da CTE experimentais_atual em vw_kpis_professor_mensal
CREATE OR REPLACE FUNCTION get_kpis_experimentais_professor(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid DEFAULT NULL
)
RETURNS TABLE (
  professor_id integer,
  unidade_id uuid,
  experimentais integer,
  matriculas integer,
  taxa_conversao numeric
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    l.professor_experimental_id AS professor_id,
    l.unidade_id,
    SUM(CASE
      WHEN l.status IN ('experimental_realizada', 'compareceu')
      THEN COALESCE(l.quantidade, 1) ELSE 0
    END)::integer AS experimentais,
    SUM(CASE
      WHEN l.status IN ('matriculado', 'convertido')
      THEN COALESCE(l.quantidade, 1) ELSE 0
    END)::integer AS matriculas,
    CASE
      WHEN SUM(CASE WHEN l.status IN ('experimental_realizada', 'compareceu')
                THEN COALESCE(l.quantidade, 1) ELSE 0 END) > 0
      THEN ROUND(
        SUM(CASE WHEN l.status IN ('matriculado', 'convertido')
                 THEN COALESCE(l.quantidade, 1) ELSE 0 END)::numeric
        / SUM(CASE WHEN l.status IN ('experimental_realizada', 'compareceu')
                   THEN COALESCE(l.quantidade, 1) ELSE 0 END)::numeric
        * 100, 2)
      ELSE 0
    END AS taxa_conversao
  FROM leads l
  WHERE l.professor_experimental_id IS NOT NULL
    AND EXTRACT(YEAR  FROM l.data_contato)::integer = p_ano
    AND EXTRACT(MONTH FROM l.data_contato)::integer = p_mes
    AND (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
  GROUP BY l.professor_experimental_id, l.unidade_id;
$$;
