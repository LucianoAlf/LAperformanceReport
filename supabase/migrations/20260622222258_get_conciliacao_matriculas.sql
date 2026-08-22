-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

CREATE OR REPLACE FUNCTION get_conciliacao_matriculas(p_unidade_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resumo jsonb;
  v_items  jsonb;
BEGIN
  -- itens: divergências abertas (não resolvidas e sem decisão humana)
  SELECT coalesce(jsonb_agg(t ORDER BY t.severidade, t.detectado_em), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT d.id, d.aluno_id, a.nome AS aluno_nome, d.unidade_id, u.nome AS unidade_nome,
           d.tipo_divergencia, d.campo, d.valor_nosso, d.valor_api, d.sugestao,
           d.severidade, d.detectado_em, d.emusys_matricula_id,
           a.curso_id, c.nome AS curso_nome
    FROM matriculas_divergencias d
    LEFT JOIN alunos a   ON a.id = d.aluno_id
    LEFT JOIN unidades u ON u.id = d.unidade_id
    LEFT JOIN cursos c   ON c.id = a.curso_id
    LEFT JOIN matriculas_divergencias_decisoes dec ON dec.divergencia_id = d.id
    WHERE d.resolvido = false AND dec.id IS NULL
      AND (p_unidade_id IS NULL OR d.unidade_id = p_unidade_id)
  ) t;

  -- resumo: contagem por tipo de divergência
  SELECT coalesce(jsonb_object_agg(tipo, qtd), '{}'::jsonb)
  INTO v_resumo
  FROM (
    SELECT d.tipo_divergencia AS tipo, count(*) AS qtd
    FROM matriculas_divergencias d
    LEFT JOIN matriculas_divergencias_decisoes dec ON dec.divergencia_id = d.id
    WHERE d.resolvido = false AND dec.id IS NULL
      AND (p_unidade_id IS NULL OR d.unidade_id = p_unidade_id)
    GROUP BY d.tipo_divergencia
  ) s;

  RETURN jsonb_build_object('resumo', v_resumo, 'items', v_items);
END;
$$;
