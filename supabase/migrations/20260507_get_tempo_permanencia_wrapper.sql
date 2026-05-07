-- Refatora get_tempo_permanencia para virar wrapper de get_historico_ltv,
-- centralizando a regra "saiu de tudo" + agrupamento por passagem na RPC nova.
-- Assinatura preservada (p_unidade_id, p_ano, p_mes) — p_ano/p_mes continuam
-- não usados, igual à versão anterior (são parâmetros legados).

CREATE OR REPLACE FUNCTION get_tempo_permanencia(
  p_unidade_id uuid DEFAULT NULL,
  p_ano integer DEFAULT NULL,
  p_mes integer DEFAULT NULL
)
RETURNS TABLE (
  unidade_id uuid,
  unidade_nome text,
  tempo_permanencia_medio numeric,
  total_evasoes_elegiveis integer,
  soma_meses integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- p_ano e p_mes são ignorados (parâmetros legados, mantidos por compatibilidade)
  RETURN QUERY
  SELECT
    u.id AS unidade_id,
    u.nome::text AS unidade_nome,
    COALESCE(ROUND(AVG(t.tempo_meses)::numeric, 1), 0)::numeric AS tempo_permanencia_medio,
    COALESCE(COUNT(t.tempo_meses), 0)::integer AS total_evasoes_elegiveis,
    COALESCE(SUM(t.tempo_meses)::integer, 0)::integer AS soma_meses
  FROM unidades u
  LEFT JOIN get_historico_ltv(p_unidade_id) t ON t.unidade_id = u.id
  WHERE u.ativo = true
  GROUP BY u.id, u.nome
  ORDER BY u.nome;
END;
$$;

COMMENT ON FUNCTION get_tempo_permanencia(uuid, integer, integer) IS 'Wrapper agregado de get_historico_ltv — retorna tempo médio de permanência por passagem (regra "saiu de tudo"), 1 linha por unidade. Parametros p_ano/p_mes são legados e ignorados.';
