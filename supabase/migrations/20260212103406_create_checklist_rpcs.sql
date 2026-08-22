-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- RPC: Listar checklists do farmer com progresso calculado
CREATE OR REPLACE FUNCTION get_checklists_farmer(
  p_colaborador_id INTEGER,
  p_unidade_id UUID DEFAULT NULL,
  p_status VARCHAR DEFAULT 'ativo'
)
RETURNS TABLE(
  id UUID,
  titulo VARCHAR,
  descricao TEXT,
  tipo VARCHAR,
  data_inicio DATE,
  data_prazo DATE,
  prioridade VARCHAR,
  status VARCHAR,
  lembrete_whatsapp BOOLEAN,
  alerta_dias_antes INTEGER,
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
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.titulo,
    c.descricao,
    c.tipo,
    c.data_inicio,
    c.data_prazo,
    c.prioridade,
    c.status,
    c.lembrete_whatsapp,
    c.alerta_dias_antes,
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
      -- Se unidade_id for passado, filtra por unidade
      p_unidade_id IS NULL 
      OR p_unidade_id::TEXT = 'todos'
      OR c.unidade_id = p_unidade_id
    )
    AND (
      -- Se colaborador_id for passado, filtra por colaborador
      p_colaborador_id IS NULL 
      OR c.colaborador_id = p_colaborador_id
    )
  GROUP BY c.id, c.titulo, c.descricao, c.tipo, c.data_inicio, c.data_prazo, 
           c.prioridade, c.status, c.lembrete_whatsapp, c.alerta_dias_antes,
           c.created_at, col.nome, col.apelido
  ORDER BY 
    CASE c.status WHEN 'ativo' THEN 0 WHEN 'concluido' THEN 1 ELSE 2 END,
    CASE c.prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END,
    c.data_prazo ASC NULLS LAST,
    c.created_at DESC;
END;
$$;

-- RPC: Detalhe de um checklist com itens
CREATE OR REPLACE FUNCTION get_checklist_detail(p_checklist_id UUID)
RETURNS TABLE(
  checklist_id UUID,
  titulo VARCHAR,
  descricao TEXT,
  tipo VARCHAR,
  data_inicio DATE,
  data_prazo DATE,
  prioridade VARCHAR,
  status VARCHAR,
  lembrete_whatsapp BOOLEAN,
  alerta_dias_antes INTEGER,
  alerta_hora TIME,
  colaborador_id INTEGER,
  colaborador_nome VARCHAR,
  colaborador_apelido VARCHAR,
  unidade_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as checklist_id,
    c.titulo,
    c.descricao,
    c.tipo,
    c.data_inicio,
    c.data_prazo,
    c.prioridade,
    c.status,
    c.lembrete_whatsapp,
    c.alerta_dias_antes,
    c.alerta_hora,
    c.colaborador_id,
    col.nome as colaborador_nome,
    col.apelido as colaborador_apelido,
    c.unidade_id,
    c.created_at
  FROM farmer_checklists c
  LEFT JOIN colaboradores col ON col.id = c.colaborador_id
  WHERE c.id = p_checklist_id;
END;
$$;

-- RPC: Marcar item de checklist como concluído/pendente
CREATE OR REPLACE FUNCTION marcar_checklist_item(
  p_item_id UUID,
  p_concluida BOOLEAN DEFAULT true,
  p_colaborador_id INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_checklist_id UUID;
  v_total INTEGER;
  v_concluidos INTEGER;
BEGIN
  -- Atualizar o item
  UPDATE farmer_checklist_items
  SET 
    concluida = p_concluida,
    concluida_em = CASE WHEN p_concluida THEN NOW() ELSE NULL END,
    concluida_por = CASE WHEN p_concluida THEN p_colaborador_id ELSE NULL END
  WHERE id = p_item_id
  RETURNING checklist_id INTO v_checklist_id;

  -- Verificar se todos os itens do checklist foram concluídos
  SELECT COUNT(*), COUNT(*) FILTER (WHERE concluida = true)
  INTO v_total, v_concluidos
  FROM farmer_checklist_items
  WHERE checklist_id = v_checklist_id;

  -- Se todos concluídos, marcar checklist como concluído
  IF v_total > 0 AND v_total = v_concluidos THEN
    UPDATE farmer_checklists
    SET status = 'concluido', concluido_em = NOW(), updated_at = NOW()
    WHERE id = v_checklist_id AND status = 'ativo';
  ELSE
    -- Se reabriu um item, voltar checklist para ativo
    UPDATE farmer_checklists
    SET status = 'ativo', concluido_em = NULL, updated_at = NOW()
    WHERE id = v_checklist_id AND status = 'concluido';
  END IF;
END;
$$;

-- RPC: Criar checklist a partir de um template
CREATE OR REPLACE FUNCTION criar_checklist_from_template(
  p_template_id UUID,
  p_colaborador_id INTEGER,
  p_unidade_id UUID,
  p_titulo VARCHAR DEFAULT NULL,
  p_data_prazo DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_template RECORD;
  v_checklist_id UUID;
  v_item JSONB;
  v_parent_id UUID;
  v_sub JSONB;
BEGIN
  -- Buscar template
  SELECT * INTO v_template FROM farmer_checklist_templates WHERE id = p_template_id AND ativo = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template não encontrado ou inativo';
  END IF;

  -- Criar checklist
  INSERT INTO farmer_checklists (
    unidade_id, colaborador_id, titulo, descricao, tipo, template_id, data_prazo
  ) VALUES (
    p_unidade_id,
    p_colaborador_id,
    COALESCE(p_titulo, v_template.nome),
    v_template.descricao,
    'template',
    p_template_id,
    p_data_prazo
  ) RETURNING id INTO v_checklist_id;

  -- Criar itens a partir do JSON do template
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_template.itens)
  LOOP
    INSERT INTO farmer_checklist_items (
      checklist_id, descricao, canal, ordem
    ) VALUES (
      v_checklist_id,
      v_item->>'descricao',
      v_item->>'canal',
      COALESCE((v_item->>'ordem')::INTEGER, 0)
    ) RETURNING id INTO v_parent_id;

    -- Criar sub-itens se existirem
    IF v_item ? 'subs' AND jsonb_array_length(v_item->'subs') > 0 THEN
      FOR v_sub IN SELECT * FROM jsonb_array_elements(v_item->'subs')
      LOOP
        INSERT INTO farmer_checklist_items (
          checklist_id, descricao, canal, parent_id, ordem
        ) VALUES (
          v_checklist_id,
          v_sub->>'descricao',
          v_sub->>'canal',
          v_parent_id,
          COALESCE((v_sub->>'ordem')::INTEGER, 0)
        );
      END LOOP;
    END IF;
  END LOOP;

  RETURN v_checklist_id;
END;
$$;

COMMENT ON FUNCTION get_checklists_farmer IS 'Lista checklists do farmer com progresso e taxa de sucesso calculados';
COMMENT ON FUNCTION get_checklist_detail IS 'Retorna detalhes de um checklist específico';
COMMENT ON FUNCTION marcar_checklist_item IS 'Marca/desmarca item de checklist e auto-completa o checklist se todos itens concluídos';
COMMENT ON FUNCTION criar_checklist_from_template IS 'Cria um novo checklist a partir de um template, instanciando todos os itens';
