-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Tabela de itens/tarefas dentro de cada checklist (depende de farmer_checklists)
CREATE TABLE IF NOT EXISTS farmer_checklist_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  checklist_id UUID NOT NULL REFERENCES farmer_checklists(id) ON DELETE CASCADE,
  descricao VARCHAR NOT NULL,
  ordem INTEGER DEFAULT 0,
  canal VARCHAR, -- 'WhatsApp' | 'Telefone' | 'Email' | 'Instagram' | 'Presencial'
  info TEXT, -- informação extra (ex: "94% receberam")
  parent_id UUID REFERENCES farmer_checklist_items(id), -- sub-itens
  concluida BOOLEAN DEFAULT false,
  concluida_em TIMESTAMPTZ,
  concluida_por INTEGER REFERENCES colaboradores(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_checklist_items_checklist ON farmer_checklist_items(checklist_id);
CREATE INDEX IF NOT EXISTS idx_checklist_items_parent ON farmer_checklist_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_checklist_items_concluida ON farmer_checklist_items(checklist_id, concluida);

-- RLS
ALTER TABLE farmer_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farmer_checklist_items_select" ON farmer_checklist_items
  FOR SELECT USING (true);

CREATE POLICY "farmer_checklist_items_insert" ON farmer_checklist_items
  FOR INSERT WITH CHECK (true);

CREATE POLICY "farmer_checklist_items_update" ON farmer_checklist_items
  FOR UPDATE USING (true);

CREATE POLICY "farmer_checklist_items_delete" ON farmer_checklist_items
  FOR DELETE USING (true);

COMMENT ON TABLE farmer_checklist_items IS 'Itens individuais de cada checklist, com suporte a sub-itens e canais de comunicação';
