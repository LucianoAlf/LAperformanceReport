-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Follow-ups da Andreza (agenda de lembretes, pendências, retentativas)
CREATE TABLE crm_followups (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL,
  -- Tipos: confirmacao_experimental, confirmacao_visita, lembrete_24h,
  --        follow_up_pos_experimental, follow_up_frio, retentativa,
  --        follow_up_manual, cobranca_taxa_compromisso
  descricao TEXT,
  data_agendada DATE NOT NULL,
  hora_agendada TIME,
  prioridade VARCHAR(10) DEFAULT 'normal', -- alta, normal, baixa
  concluido BOOLEAN DEFAULT false,
  data_conclusao TIMESTAMPTZ,
  resultado TEXT, -- o que aconteceu quando fez o follow-up
  criado_por VARCHAR(20) DEFAULT 'manual', -- manual, automatico (n8n)
  created_by INTEGER REFERENCES colaboradores(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_crm_followups_pendentes ON crm_followups(data_agendada, concluido) WHERE concluido = false;
CREATE INDEX idx_crm_followups_lead ON crm_followups(lead_id);
