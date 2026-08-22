-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

CREATE TABLE leads_campanhas (
  id bigserial PRIMARY KEY,
  lead_id integer NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  agente_id uuid REFERENCES agentes(id),
  campanha_slug text NOT NULL,
  campanha_nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, campanha_slug)
);

CREATE INDEX idx_leads_campanhas_lead_id ON leads_campanhas(lead_id);
CREATE INDEX idx_leads_campanhas_slug ON leads_campanhas(campanha_slug);

ALTER TABLE leads_campanhas ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_leads_campanhas_roles_internos ON leads_campanhas FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE leads_campanhas IS 'Historico de campanhas que trouxeram cada lead (1 linha por lead+campanha). Gravado pela tool transfer do agente-webhook no momento da transferencia. Snapshot: campanha_nome congela agentes.nome da epoca.';
