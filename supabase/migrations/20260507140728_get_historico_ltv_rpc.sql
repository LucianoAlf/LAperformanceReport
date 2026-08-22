-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- RPC: get_historico_ltv
-- Retorna passagens consolidadas para a tela "Histórico LTV".
-- Une 2 fontes:
--   (a) alunos_historico (anulado=false) — passagens já consolidadas
--   (b) alunos com saída (status inativo/evadido) agrupados por (nome, unidade_id)
--       quando a pessoa NÃO tem matrícula viva e a passagem ainda NÃO foi
--       gravada em alunos_historico (filtro via aluno_ids overlap).
-- Calcula qtd_passagens_pessoa via window function.

CREATE OR REPLACE FUNCTION get_historico_ltv(p_unidade_id uuid DEFAULT NULL)
RETURNS TABLE (
  passagem_id text,
  historico_id bigint,
  nome text,
  unidade_id uuid,
  data_entrada date,
  data_saida date,
  tempo_meses numeric,
  categoria_saida text,
  mes_saida text,
  motivo_saida text,
  aluno_ids bigint[],
  fonte text,
  anulado boolean,
  qtd_passagens_pessoa bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH ids_excluir AS (
    SELECT id FROM tipos_matricula WHERE codigo IN ('BOLSISTA_INT','BOLSISTA_PARC','BANDA')
  ),
  -- ===================================================================
  -- FONTE 1: registros consolidados em alunos_historico (anulado=false)
  -- ===================================================================
  fonte_historico AS (
    SELECT
      ('h-' || ah.id::text)::text AS passagem_id,
      ah.id AS historico_id,
      ah.nome::text,
      ah.unidade_id,
      ah.data_entrada,
      ah.data_saida,
      CASE
        WHEN ah.data_entrada IS NOT NULL AND ah.data_saida IS NOT NULL
          THEN ROUND(((ah.data_saida - ah.data_entrada)::numeric / 30.44), 2)
        ELSE ah.tempo_permanencia_meses::numeric
      END AS tempo_meses,
      ah.categoria_saida::text,
      ah.mes_saida::text,
      ah.motivo_saida::text,
      COALESCE(
        ah.aluno_ids,
        CASE WHEN ah.aluno_id IS NOT NULL THEN ARRAY[ah.aluno_id] ELSE ARRAY[]::bigint[] END
      ) AS aluno_ids,
      'historico'::text AS fonte,
      ah.anulado
    FROM alunos_historico ah
    WHERE ah.anulado = false
      AND COALESCE(ah.tempo_permanencia_meses, 0) >= 4
      AND (p_unidade_id IS NULL OR ah.unidade_id = p_unidade_id)
  ),
  -- ===================================================================
  -- FONTE 2: alunos com saída agrupados por pessoa (passagens não gravadas)
  -- ===================================================================
  pessoas_saidas AS (
    SELECT
      a.nome,
      a.unidade_id,
      MIN(a.data_matricula) AS data_entrada,
      MAX(a.data_saida) AS data_saida,
      ROUND(((MAX(a.data_saida) - MIN(a.data_matricula))::numeric / 30.44), 2) AS tempo_meses,
      CASE
        WHEN bool_or(a.status = 'evadido') THEN 'Evadido'
        ELSE 'Interrompido'
      END AS categoria_saida,
      array_agg(a.id ORDER BY a.data_matricula) AS aluno_ids,
      MAX(a.data_saida) AS data_saida_max
    FROM alunos a
    WHERE a.status IN ('inativo','evadido')
      AND a.data_saida IS NOT NULL
      AND a.data_matricula IS NOT NULL
      AND (a.tipo_matricula_id IS NULL OR a.tipo_matricula_id NOT IN (SELECT id FROM ids_excluir))
      AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
      -- Pessoa NÃO pode ter matrícula viva
      AND NOT EXISTS (
        SELECT 1 FROM alunos a2
        WHERE a2.nome = a.nome
          AND a2.unidade_id = a.unidade_id
          AND a2.status IN ('ativo','trancado')
      )
      -- Matrícula NÃO pode já ter sido consolidada em alunos_historico
      AND NOT EXISTS (
        SELECT 1 FROM alunos_historico ah
        WHERE ah.anulado = false
          AND a.id = ANY(COALESCE(ah.aluno_ids, ARRAY[ah.aluno_id]))
      )
    GROUP BY a.nome, a.unidade_id
  ),
  fonte_sistema AS (
    SELECT
      ('s-' || md5(ps.nome || '|' || ps.unidade_id::text || '|' || ps.data_saida::text))::text AS passagem_id,
      NULL::bigint AS historico_id,
      ps.nome::text,
      ps.unidade_id,
      ps.data_entrada,
      ps.data_saida,
      ps.tempo_meses,
      ps.categoria_saida::text,
      (CASE EXTRACT(MONTH FROM ps.data_saida)::int
        WHEN 1 THEN 'Janeiro' WHEN 2 THEN 'Fevereiro' WHEN 3 THEN 'Março'
        WHEN 4 THEN 'Abril' WHEN 5 THEN 'Maio' WHEN 6 THEN 'Junho'
        WHEN 7 THEN 'Julho' WHEN 8 THEN 'Agosto' WHEN 9 THEN 'Setembro'
        WHEN 10 THEN 'Outubro' WHEN 11 THEN 'Novembro' WHEN 12 THEN 'Dezembro'
      END || '/' || EXTRACT(YEAR FROM ps.data_saida)::text)::text AS mes_saida,
      NULL::text AS motivo_saida,
      ps.aluno_ids,
      'sistema'::text AS fonte,
      false AS anulado
    FROM pessoas_saidas ps
    WHERE ps.tempo_meses >= 4
  ),
  -- Combinado
  combinado AS (
    SELECT * FROM fonte_historico
    UNION ALL
    SELECT * FROM fonte_sistema
  )
  SELECT
    c.passagem_id,
    c.historico_id,
    c.nome,
    c.unidade_id,
    c.data_entrada,
    c.data_saida,
    c.tempo_meses,
    c.categoria_saida,
    c.mes_saida,
    c.motivo_saida,
    c.aluno_ids,
    c.fonte,
    c.anulado,
    COUNT(*) OVER (PARTITION BY c.nome, c.unidade_id) AS qtd_passagens_pessoa
  FROM combinado c
  ORDER BY c.data_saida DESC NULLS LAST, c.nome;
END;
$$;

GRANT EXECUTE ON FUNCTION get_historico_ltv(uuid) TO authenticated, anon;
