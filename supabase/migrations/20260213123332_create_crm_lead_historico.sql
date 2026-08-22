-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Timeline de ações/eventos do lead
CREATE TABLE crm_lead_historico (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL,
  -- Tipos: whatsapp_enviado, whatsapp_recebido, ligacao, 
  --        tentativa_sem_resposta, nota, mudanca_etapa, 
  --        agendamento, cancelamento, desmarcacao,
  --        passagem_mila, experimental_realizada, 
  --        visita_realizada, matricula, follow_up, arquivamento
  descricao TEXT,
  dados JSONB DEFAULT '{}',
  -- Exemplos de dados:
  -- mudanca_etapa: {"etapa_anterior": "em_contato", "etapa_nova": "experimental_agendada"}
  -- whatsapp_enviado: {"template_slug": "confirmacao_experimental"}
  -- agendamento: {"data": "2026-02-15", "horario": "14:00", "professor_id": 5}
  created_by INTEGER REFERENCES colaboradores(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_crm_lead_historico_lead ON crm_lead_historico(lead_id, created_at DESC);
CREATE INDEX idx_crm_lead_historico_tipo ON crm_lead_historico(tipo);
