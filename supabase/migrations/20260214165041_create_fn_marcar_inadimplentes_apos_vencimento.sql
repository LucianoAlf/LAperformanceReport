-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Função que marca alunos como inadimplentes quando o vencimento passa
-- Chamada via cron (pg_cron) ou manualmente
-- Exclui bolsistas (3,4), banda (5) e sem_parcela

CREATE OR REPLACE FUNCTION marcar_inadimplentes_apos_vencimento()
RETURNS TABLE(total_marcados INTEGER, unidade_nome TEXT, qtd INTEGER) AS $$
DECLARE
  dia_atual INTEGER := EXTRACT(day FROM CURRENT_DATE)::INTEGER;
  v_total INTEGER := 0;
BEGIN
  -- Marcar como inadimplente alunos ativos cujo vencimento já passou no mês atual
  -- e que ainda estão como 'em_dia' ou NULL
  WITH marcados AS (
    UPDATE alunos a
    SET status_pagamento = 'inadimplente',
        updated_at = NOW()
    WHERE a.status IN ('ativo', 'trancado')
      AND a.dia_vencimento <= dia_atual
      AND (a.status_pagamento IS NULL OR a.status_pagamento = 'em_dia')
      AND (a.tipo_matricula_id IS NULL OR a.tipo_matricula_id NOT IN (3, 4, 5))
      AND COALESCE(a.status_pagamento, '') != 'sem_parcela'
    RETURNING a.id, a.unidade_id
  )
  SELECT count(*)::INTEGER INTO v_total FROM marcados;

  -- Retornar resumo por unidade
  RETURN QUERY
  SELECT 
    v_total as total_marcados,
    u.nome::TEXT as unidade_nome,
    count(a.id)::INTEGER as qtd
  FROM alunos a
  JOIN unidades u ON u.id = a.unidade_id
  WHERE a.status IN ('ativo', 'trancado')
    AND a.status_pagamento = 'inadimplente'
  GROUP BY u.nome
  ORDER BY u.nome;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Também criar uma versão RPC que pode ser chamada do frontend
CREATE OR REPLACE FUNCTION rpc_marcar_inadimplentes()
RETURNS JSON AS $$
DECLARE
  resultado JSON;
  dia_atual INTEGER := EXTRACT(day FROM CURRENT_DATE)::INTEGER;
  v_total INTEGER;
BEGIN
  UPDATE alunos a
  SET status_pagamento = 'inadimplente',
      updated_at = NOW()
  WHERE a.status IN ('ativo', 'trancado')
    AND a.dia_vencimento <= dia_atual
    AND (a.status_pagamento IS NULL OR a.status_pagamento = 'em_dia')
    AND (a.tipo_matricula_id IS NULL OR a.tipo_matricula_id NOT IN (3, 4, 5))
    AND COALESCE(a.status_pagamento, '') != 'sem_parcela';

  GET DIAGNOSTICS v_total = ROW_COUNT;

  SELECT json_build_object(
    'total_marcados', v_total,
    'dia_atual', dia_atual,
    'executado_em', NOW()
  ) INTO resultado;

  RETURN resultado;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
