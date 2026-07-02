-- Task 12 (aposentar renovacoes): get_programa_fideliza_dados passa a calcular renovacao/reajuste
-- de movimentacoes_admin (a CTE renovacoes_trim lia a tabela legada renovacoes). O front ja
-- sobrescreve com o canonico (aplicarMetricasFidelizaCanonicas), entao a tela NAO muda; isto e
-- higiene para a tabela renovacoes ficar 100% legada.
-- Reescreve APENAS a CTE renovacoes_trim, preservando o resto da funcao via regexp sobre a def real.
DO $$
DECLARE
  v_def text;
  v_new text;
  v_cte text := $cte$renovacoes_trim AS (
    SELECT m.unidade_id,
      COUNT(*) FILTER (WHERE m.tipo = 'renovacao' AND m.renovacao_status IN ('confirmada','antecipada_confirmada')) AS renovados,
      COUNT(*) FILTER (WHERE m.tipo IN ('renovacao','nao_renovacao')) AS total_contratos,
      COALESCE(AVG(CASE WHEN m.valor_parcela_anterior > 0 THEN round((m.valor_parcela_novo / m.valor_parcela_anterior - 1) * 100, 2) END) FILTER (WHERE m.tipo = 'renovacao' AND m.renovacao_status IN ('confirmada','antecipada_confirmada')), 0) AS reajuste_medio
    FROM movimentacoes_admin m
    WHERE EXTRACT(YEAR FROM m.data) = p_ano
      AND EXTRACT(MONTH FROM m.data) BETWEEN ((v_trim_atual - 1) * 3 + 1) AND (v_trim_atual * 3)
      AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
    GROUP BY m.unidade_id
  )$cte$;
BEGIN
  SELECT pg_get_functiondef('public.get_programa_fideliza_dados(integer,integer,uuid)'::regprocedure) INTO v_def;
  v_new := regexp_replace(v_def, 'renovacoes_trim AS \(.*?GROUP BY r\.unidade_id\s*\)', v_cte);
  IF v_new = v_def THEN
    RAISE EXCEPTION 'CTE renovacoes_trim nao encontrada - replace falhou, nada aplicado';
  END IF;
  EXECUTE v_new;
END $$;
