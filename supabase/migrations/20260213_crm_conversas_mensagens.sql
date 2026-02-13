-- ============================================================
-- MIGRATION 1: crm_conversas + crm_mensagens
-- Painel Conversacional WhatsApp — MVP-A
-- Data: 2026-02-13
-- ============================================================

-- ============================================================
-- TABELA: crm_conversas (1 conversa por lead)
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_conversas (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id               INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  unidade_id            UUID REFERENCES unidades(id),
  status                VARCHAR NOT NULL DEFAULT 'aberta'
                        CHECK (status IN ('aberta','pausada','encerrada','aguardando')),
  atribuido_a           VARCHAR NOT NULL DEFAULT 'mila'
                        CHECK (atribuido_a IN ('mila','andreza','nao_atribuido')),
  whatsapp_jid          VARCHAR,
  foto_perfil_url       TEXT,
  nao_lidas             INTEGER DEFAULT 0,
  ultima_mensagem_at    TIMESTAMPTZ,
  ultima_mensagem_preview TEXT,
  mila_pausada          BOOLEAN DEFAULT FALSE,
  mila_pausada_em       TIMESTAMPTZ,
  mila_pausada_por      VARCHAR,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lead_id)
);

COMMENT ON TABLE crm_conversas IS 'Conversas WhatsApp do CRM — 1 conversa por lead';
COMMENT ON COLUMN crm_conversas.unidade_id IS 'Desnormalização da unidade do lead para filtro rápido no inbox';
COMMENT ON COLUMN crm_conversas.atribuido_a IS 'Quem está atendendo: mila, andreza ou nao_atribuido';
COMMENT ON COLUMN crm_conversas.whatsapp_jid IS 'JID do WhatsApp do lead (formato 5521XXXXXXXXX@s.whatsapp.net)';
COMMENT ON COLUMN crm_conversas.foto_perfil_url IS 'Cache da foto de perfil do WhatsApp';
COMMENT ON COLUMN crm_conversas.mila_pausada IS 'Se true, Mila não envia mensagens automáticas nesta conversa';

-- ============================================================
-- TABELA: crm_mensagens (todas as mensagens trocadas)
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_mensagens (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id           UUID NOT NULL REFERENCES crm_conversas(id) ON DELETE CASCADE,
  lead_id               INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  direcao               VARCHAR NOT NULL CHECK (direcao IN ('entrada','saida')),
  tipo                  VARCHAR NOT NULL DEFAULT 'texto'
                        CHECK (tipo IN ('texto','imagem','audio','video','documento','sticker','localizacao','contato','sistema')),
  conteudo              TEXT,
  midia_url             TEXT,
  midia_mimetype        VARCHAR,
  midia_nome            VARCHAR,
  remetente             VARCHAR NOT NULL CHECK (remetente IN ('lead','mila','andreza','sistema')),
  remetente_nome        VARCHAR,
  status_entrega        VARCHAR DEFAULT 'enviando'
                        CHECK (status_entrega IN ('enviando','enviada','entregue','lida','erro')),
  is_sistema            BOOLEAN DEFAULT FALSE,
  whatsapp_message_id   VARCHAR UNIQUE,
  template_id           INTEGER REFERENCES crm_templates_whatsapp(id),
  reply_to_id           UUID REFERENCES crm_mensagens(id),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE crm_mensagens IS 'Mensagens WhatsApp do CRM — histórico completo de cada conversa';
COMMENT ON COLUMN crm_mensagens.direcao IS 'entrada = lead enviou, saida = mila/andreza enviou';
COMMENT ON COLUMN crm_mensagens.remetente IS 'Quem enviou: lead, mila, andreza ou sistema';
COMMENT ON COLUMN crm_mensagens.is_sistema IS 'Mensagens de sistema (passagem de bastão, assumir conversa, etc.)';
COMMENT ON COLUMN crm_mensagens.whatsapp_message_id IS 'ID único da mensagem no WhatsApp (para status de entrega e reações)';
COMMENT ON COLUMN crm_mensagens.reply_to_id IS 'Referência para mensagem respondida (quote/reply) — MVP-B';

-- ============================================================
-- ÍNDICES para performance
-- ============================================================
CREATE INDEX idx_crm_mensagens_conversa_data ON crm_mensagens(conversa_id, created_at DESC);
CREATE INDEX idx_crm_mensagens_lead_data ON crm_mensagens(lead_id, created_at DESC);
CREATE INDEX idx_crm_mensagens_whatsapp_id ON crm_mensagens(whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;
CREATE INDEX idx_crm_conversas_status_atribuido ON crm_conversas(status, atribuido_a);
CREATE INDEX idx_crm_conversas_ultima_msg ON crm_conversas(ultima_mensagem_at DESC NULLS LAST);
CREATE INDEX idx_crm_conversas_unidade ON crm_conversas(unidade_id);
CREATE INDEX idx_crm_conversas_nao_lidas ON crm_conversas(nao_lidas) WHERE nao_lidas > 0;

-- ============================================================
-- RLS (aberta pro MVP, apertar depois com auth)
-- ============================================================
ALTER TABLE crm_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_conversas_select" ON crm_conversas FOR SELECT USING (true);
CREATE POLICY "crm_conversas_insert" ON crm_conversas FOR INSERT WITH CHECK (true);
CREATE POLICY "crm_conversas_update" ON crm_conversas FOR UPDATE USING (true);
CREATE POLICY "crm_conversas_delete" ON crm_conversas FOR DELETE USING (true);

CREATE POLICY "crm_mensagens_select" ON crm_mensagens FOR SELECT USING (true);
CREATE POLICY "crm_mensagens_insert" ON crm_mensagens FOR INSERT WITH CHECK (true);
CREATE POLICY "crm_mensagens_update" ON crm_mensagens FOR UPDATE USING (true);
CREATE POLICY "crm_mensagens_delete" ON crm_mensagens FOR DELETE USING (true);

-- ============================================================
-- REALTIME — habilitar para atualizações em tempo real
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE crm_mensagens;
ALTER PUBLICATION supabase_realtime ADD TABLE crm_conversas;
