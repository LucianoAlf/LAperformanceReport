-- Tabela de caixas WhatsApp (credenciais UAZAPI dinâmicas)
CREATE TABLE IF NOT EXISTS whatsapp_caixas (
  id serial PRIMARY KEY,
  nome varchar(100) NOT NULL,
  numero varchar(20),
  uazapi_url varchar(255) NOT NULL,
  uazapi_token varchar(255) NOT NULL,
  unidade_id uuid REFERENCES unidades(id),
  ativo boolean DEFAULT true,
  webhook_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_whatsapp_caixas_unidade ON whatsapp_caixas(unidade_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_caixas_ativo ON whatsapp_caixas(ativo);

-- Adicionar caixa_id na tabela crm_conversas
ALTER TABLE crm_conversas ADD COLUMN IF NOT EXISTS caixa_id integer REFERENCES whatsapp_caixas(id);

-- RLS
ALTER TABLE whatsapp_caixas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_caixas_select_all" ON whatsapp_caixas
  FOR SELECT USING (true);

CREATE POLICY "whatsapp_caixas_insert_auth" ON whatsapp_caixas
  FOR INSERT WITH CHECK (true);

CREATE POLICY "whatsapp_caixas_update_auth" ON whatsapp_caixas
  FOR UPDATE USING (true);

CREATE POLICY "whatsapp_caixas_delete_auth" ON whatsapp_caixas
  FOR DELETE USING (true);
