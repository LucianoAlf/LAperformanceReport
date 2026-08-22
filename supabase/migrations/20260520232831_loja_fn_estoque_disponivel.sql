-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

CREATE OR REPLACE FUNCTION public.estoque_disponivel(
  p_produto_id INT, p_unidade_id UUID, p_variacao_id INT DEFAULT NULL
) RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT GREATEST(0,
    COALESCE((
      SELECT quantidade FROM loja_estoque
      WHERE produto_id = p_produto_id
        AND unidade_id = p_unidade_id
        AND (variacao_id IS NOT DISTINCT FROM p_variacao_id)
    ), 0)
    - COALESCE((
      SELECT SUM(quantidade) FROM loja_reservas
      WHERE produto_id = p_produto_id
        AND unidade_id = p_unidade_id
        AND (variacao_id IS NOT DISTINCT FROM p_variacao_id)
        AND status = 'ativa'
    ), 0)
  );
$$;
