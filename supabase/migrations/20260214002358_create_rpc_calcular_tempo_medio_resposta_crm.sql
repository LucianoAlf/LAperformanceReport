-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


CREATE OR REPLACE FUNCTION calcular_tempo_medio_resposta_crm(
  p_inicio TEXT,
  p_fim TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  resultado NUMERIC;
BEGIN
  -- Calcula o tempo médio de resposta em minutos
  -- Para cada mensagem de entrada, encontra a próxima mensagem de saída na mesma conversa
  SELECT AVG(diff_minutos) INTO resultado
  FROM (
    SELECT 
      EXTRACT(EPOCH FROM (
        (SELECT MIN(m2.created_at) 
         FROM crm_mensagens m2 
         WHERE m2.conversa_id = m1.conversa_id 
           AND m2.direcao = 'saida' 
           AND m2.created_at > m1.created_at
           AND m2.created_at < m1.created_at + INTERVAL '24 hours'
        ) - m1.created_at
      )) / 60.0 AS diff_minutos
    FROM crm_mensagens m1
    WHERE m1.direcao = 'entrada'
      AND m1.created_at >= p_inicio::TIMESTAMPTZ
      AND m1.created_at < p_fim::TIMESTAMPTZ
  ) sub
  WHERE diff_minutos IS NOT NULL AND diff_minutos > 0;

  RETURN COALESCE(resultado, 0);
END;
$$;
