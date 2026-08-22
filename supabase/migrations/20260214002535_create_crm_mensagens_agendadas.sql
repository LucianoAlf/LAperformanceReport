-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


CREATE TABLE crm_mensagens_agendadas (
  id SERIAL PRIMARY KEY,
  conversa_id UUID NOT NULL REFERENCES crm_conversas(id) ON DELETE CASCADE,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  conteudo TEXT NOT NULL,
  tipo VARCHAR(20) NOT NULL DEFAULT 'texto',
  agendada_para TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente',
  enviada_em TIMESTAMPTZ,
  erro TEXT,
  criado_por VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_crm_msgs_agendadas_pendentes 
  ON crm_mensagens_agendadas (status, agendada_para) 
  WHERE status = 'pendente';

CREATE INDEX idx_crm_msgs_agendadas_conversa 
  ON crm_mensagens_agendadas (conversa_id);

ALTER TABLE crm_mensagens_agendadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage scheduled messages"
  ON crm_mensagens_agendadas
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE crm_mensagens_agendadas;

COMMENT ON TABLE crm_mensagens_agendadas IS 'Mensagens agendadas para envio futuro via WhatsApp';
