-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

CREATE OR REPLACE FUNCTION public.buscar_produto_fuzzy(
  p_termo      TEXT,
  p_unidade_id UUID DEFAULT NULL
) RETURNS TABLE (
  id INT, nome VARCHAR, sku VARCHAR, preco NUMERIC,
  estoque INT, score REAL
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    p.id, p.nome, p.sku, p.preco,
    COALESCE(
      (SELECT quantidade FROM loja_estoque e
        WHERE e.produto_id = p.id
          AND (p_unidade_id IS NULL OR e.unidade_id = p_unidade_id)
        LIMIT 1),
      0
    )::INT AS estoque,
    similarity(p.nome, p_termo) AS score
  FROM loja_produtos p
  WHERE p.ativo = TRUE
    AND (p.nome ILIKE '%' || p_termo || '%' OR similarity(p.nome, p_termo) > 0.2)
  ORDER BY score DESC, p.nome ASC
  LIMIT 5;
$$;
