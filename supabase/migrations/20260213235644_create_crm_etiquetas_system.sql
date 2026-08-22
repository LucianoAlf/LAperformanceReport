-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Catálogo de etiquetas disponíveis
CREATE TABLE crm_etiquetas (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(50) NOT NULL UNIQUE,
  cor VARCHAR(7) NOT NULL DEFAULT '#8b5cf6',
  icone VARCHAR(10),
  descricao TEXT,
  ordem INT NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Relação many-to-many: lead <-> etiqueta
CREATE TABLE crm_lead_etiquetas (
  id SERIAL PRIMARY KEY,
  lead_id INT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  etiqueta_id INT NOT NULL REFERENCES crm_etiquetas(id) ON DELETE CASCADE,
  adicionada_por VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(lead_id, etiqueta_id)
);

-- Índices
CREATE INDEX idx_crm_lead_etiquetas_lead ON crm_lead_etiquetas(lead_id);
CREATE INDEX idx_crm_lead_etiquetas_etiqueta ON crm_lead_etiquetas(etiqueta_id);

-- RLS
ALTER TABLE crm_etiquetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_lead_etiquetas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_etiquetas_select" ON crm_etiquetas FOR SELECT USING (true);
CREATE POLICY "crm_etiquetas_all" ON crm_etiquetas FOR ALL USING (true);
CREATE POLICY "crm_lead_etiquetas_select" ON crm_lead_etiquetas FOR SELECT USING (true);
CREATE POLICY "crm_lead_etiquetas_all" ON crm_lead_etiquetas FOR ALL USING (true);

-- Seed: etiquetas padrão
INSERT INTO crm_etiquetas (nome, cor, icone, descricao, ordem) VALUES
  ('Urgente', '#ef4444', '🔴', 'Lead precisa de atenção imediata', 1),
  ('Aguardando', '#f59e0b', '🟡', 'Aguardando resposta do lead', 2),
  ('Follow-up', '#3b82f6', '🔵', 'Precisa de follow-up', 3),
  ('Quente', '#f97316', '🔥', 'Lead muito interessado', 4),
  ('Agendado', '#10b981', '📅', 'Experimental/visita agendada', 5),
  ('Sem resposta', '#6b7280', '📵', 'Lead não responde', 6),
  ('VIP', '#a855f7', '⭐', 'Lead prioritário/indicação', 7),
  ('Retorno', '#06b6d4', '🔄', 'Lead retornando contato', 8);
