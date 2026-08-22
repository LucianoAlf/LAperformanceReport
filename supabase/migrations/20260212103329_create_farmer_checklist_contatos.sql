-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Tabela de carteira de contatos/alunos por checklist (depende de farmer_checklists)
CREATE TABLE IF NOT EXISTS farmer_checklist_contatos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  checklist_id UUID NOT NULL REFERENCES farmer_checklists(id) ON DELETE CASCADE,
  aluno_id INTEGER NOT NULL REFERENCES alunos(id),
  farmer_id INTEGER NOT NULL REFERENCES colaboradores(id),
  status VARCHAR DEFAULT 'pendente', -- 'pendente' | 'respondeu' | 'visualizou' | 'sem_resposta' | 'nao_recebeu'
  canal_contato VARCHAR, -- 'WhatsApp' | 'Telefone' | 'Email'
  observacoes TEXT,
  contatado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_checklist_contatos_checklist ON farmer_checklist_contatos(checklist_id);
CREATE INDEX IF NOT EXISTS idx_checklist_contatos_aluno ON farmer_checklist_contatos(aluno_id);
CREATE INDEX IF NOT EXISTS idx_checklist_contatos_farmer ON farmer_checklist_contatos(farmer_id);
CREATE INDEX IF NOT EXISTS idx_checklist_contatos_status ON farmer_checklist_contatos(checklist_id, status);

-- Constraint: um aluno só pode estar uma vez por checklist
ALTER TABLE farmer_checklist_contatos ADD CONSTRAINT unique_checklist_aluno UNIQUE (checklist_id, aluno_id);

-- RLS
ALTER TABLE farmer_checklist_contatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farmer_checklist_contatos_select" ON farmer_checklist_contatos
  FOR SELECT USING (true);

CREATE POLICY "farmer_checklist_contatos_insert" ON farmer_checklist_contatos
  FOR INSERT WITH CHECK (true);

CREATE POLICY "farmer_checklist_contatos_update" ON farmer_checklist_contatos
  FOR UPDATE USING (true);

CREATE POLICY "farmer_checklist_contatos_delete" ON farmer_checklist_contatos
  FOR DELETE USING (true);

COMMENT ON TABLE farmer_checklist_contatos IS 'Carteira de alunos/contatos vinculados a cada checklist, com status de contato';
