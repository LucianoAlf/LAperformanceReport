-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


CREATE OR REPLACE FUNCTION get_checklists_farmer(
  p_colaborador_id INTEGER DEFAULT NULL,
  p_unidade_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT 'ativo'
)
RETURNS TABLE(
  id UUID,
  titulo VARCHAR,
  descricao TEXT,
  tipo VARCHAR,
  periodicidade VARCHAR,
  departamento VARCHAR,
  tipo_vinculo VARCHAR,
  filtro_vinculo JSONB,
  data_inicio DATE,
  data_prazo DATE,
  prioridade VARCHAR,
  status VARCHAR,
  lembrete_whatsapp BOOLEAN,
  alerta_dias_antes INTEGER,
  alerta_hora TIME,
  total_items INTEGER,
  items_concluidos INTEGER,
  percentual_progresso NUMERIC,
  total_contatos INTEGER,
  contatos_responderam INTEGER,
  taxa_sucesso NUMERIC,
  created_at TIMESTAMPTZ,
  colaborador_nome VARCHAR,
  colaborador_apelido VARCHAR
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.titulo,
    c.descricao,
    c.tipo,
    c.periodicidade,
    c.departamento,
    c.tipo_vinculo,
    c.filtro_vinculo,
    c.data_inicio,
    c.data_prazo,
    c.prioridade,
    c.status,
    c.lembrete_whatsapp,
    c.alerta_dias_antes,
    c.alerta_hora,
    COUNT(DISTINCT ci.id)::INTEGER as total_items,
    COUNT(DISTINCT ci.id) FILTER (WHERE ci.concluida = true)::INTEGER as items_concluidos,
    CASE 
      WHEN COUNT(DISTINCT ci.id) > 0 
      THEN ROUND((COUNT(DISTINCT ci.id) FILTER (WHERE ci.concluida = true)::NUMERIC / COUNT(DISTINCT ci.id)) * 100, 0)
      ELSE 0 
    END as percentual_progresso,
    COUNT(DISTINCT cc.id)::INTEGER as total_contatos,
    COUNT(DISTINCT cc.id) FILTER (WHERE cc.status = 'respondeu')::INTEGER as contatos_responderam,
    CASE 
      WHEN COUNT(DISTINCT cc.id) > 0 
      THEN ROUND((COUNT(DISTINCT cc.id) FILTER (WHERE cc.status = 'respondeu')::NUMERIC / COUNT(DISTINCT cc.id)) * 100, 0)
      ELSE 0 
    END as taxa_sucesso,
    c.created_at,
    col.nome as colaborador_nome,
    col.apelido as colaborador_apelido
  FROM farmer_checklists c
  LEFT JOIN farmer_checklist_items ci ON ci.checklist_id = c.id
  LEFT JOIN farmer_checklist_contatos cc ON cc.checklist_id = c.id
  LEFT JOIN colaboradores col ON col.id = c.colaborador_id
  WHERE c.ativo = true
    AND (p_status = 'todos' OR c.status = p_status)
    AND (
      p_unidade_id IS NULL 
      OR p_unidade_id::TEXT = 'todos'
      OR c.unidade_id = p_unidade_id
    )
    AND (
      p_colaborador_id IS NULL 
      OR c.colaborador_id = p_colaborador_id
    )
  GROUP BY c.id, c.titulo, c.descricao, c.tipo, c.periodicidade, c.departamento,
           c.tipo_vinculo, c.filtro_vinculo, c.data_inicio, c.data_prazo, 
           c.prioridade, c.status, c.lembrete_whatsapp, c.alerta_dias_antes, c.alerta_hora,
           c.created_at, col.nome, col.apelido
  ORDER BY 
    CASE c.status WHEN 'ativo' THEN 0 WHEN 'concluido' THEN 1 ELSE 2 END,
    CASE c.prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END,
    c.data_prazo ASC NULLS LAST,
    c.created_at DESC;
END;
$$;
