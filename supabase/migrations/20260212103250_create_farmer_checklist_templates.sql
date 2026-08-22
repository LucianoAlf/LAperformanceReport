-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Tabela de templates de checklists (criada PRIMEIRO por ser referenciada por farmer_checklists)
CREATE TABLE IF NOT EXISTS farmer_checklist_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome VARCHAR NOT NULL,
  descricao TEXT,
  categoria VARCHAR, -- 'onboarding' | 'recesso' | 'evento' | 'comunicacao' | 'administrativo'
  itens JSONB NOT NULL DEFAULT '[]', -- array de {descricao, canal, subs:[]}
  unidade_id UUID REFERENCES unidades(id), -- NULL = global (disponível para todas as unidades)
  ativo BOOLEAN DEFAULT true,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_checklist_templates_categoria ON farmer_checklist_templates(categoria);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_unidade ON farmer_checklist_templates(unidade_id);

-- RLS
ALTER TABLE farmer_checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farmer_checklist_templates_select" ON farmer_checklist_templates
  FOR SELECT USING (true);

CREATE POLICY "farmer_checklist_templates_insert" ON farmer_checklist_templates
  FOR INSERT WITH CHECK (true);

CREATE POLICY "farmer_checklist_templates_update" ON farmer_checklist_templates
  FOR UPDATE USING (true);

COMMENT ON TABLE farmer_checklist_templates IS 'Templates reutilizáveis de checklists para o Painel Farmer';
