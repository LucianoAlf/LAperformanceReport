-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Tabela para configurações de envio de WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_config (
  id SERIAL PRIMARY KEY,
  hora_inicio VARCHAR(5) DEFAULT '08:00',
  hora_fim VARCHAR(5) DEFAULT '18:00',
  dias_semana TEXT[] DEFAULT ARRAY['seg', 'ter', 'qua', 'qui', 'sex'],
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir configuração padrão
INSERT INTO whatsapp_config (hora_inicio, hora_fim, dias_semana) 
VALUES ('08:00', '18:00', ARRAY['seg', 'ter', 'qua', 'qui', 'sex'])
ON CONFLICT DO NOTHING;
