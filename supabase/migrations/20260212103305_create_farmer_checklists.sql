-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Tabela principal de checklists (depende de farmer_checklist_templates)
CREATE TABLE IF NOT EXISTS farmer_checklists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id),
  titulo VARCHAR NOT NULL,
  descricao TEXT,
  tipo VARCHAR NOT NULL DEFAULT 'manual', -- 'manual' | 'template' | 'recorrente'
  template_id UUID REFERENCES farmer_checklist_templates(id),
  data_inicio DATE,
  data_prazo DATE,
  prioridade VARCHAR DEFAULT 'media', -- 'alta' | 'media' | 'baixa'
  alerta_dias_antes INTEGER DEFAULT 1,
  alerta_hora TIME DEFAULT '09:00',
  lembrete_whatsapp BOOLEAN DEFAULT false,
  status VARCHAR DEFAULT 'ativo', -- 'ativo' | 'concluido' | 'arquivado'
  concluido_em TIMESTAMPTZ,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_checklists_colaborador ON farmer_checklists(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_checklists_unidade ON farmer_checklists(unidade_id);
CREATE INDEX IF NOT EXISTS idx_checklists_status ON farmer_checklists(status);
CREATE INDEX IF NOT EXISTS idx_checklists_prazo ON farmer_checklists(data_prazo) WHERE status = 'ativo';

-- RLS
ALTER TABLE farmer_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farmer_checklists_select" ON farmer_checklists
  FOR SELECT USING (true);

CREATE POLICY "farmer_checklists_insert" ON farmer_checklists
  FOR INSERT WITH CHECK (true);

CREATE POLICY "farmer_checklists_update" ON farmer_checklists
  FOR UPDATE USING (true);

CREATE POLICY "farmer_checklists_delete" ON farmer_checklists
  FOR DELETE USING (true);

COMMENT ON TABLE farmer_checklists IS 'Checklists do Painel Farmer - listas de tarefas agrupadas com prazo e alertas';
