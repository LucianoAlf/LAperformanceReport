-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


CREATE TABLE whatsapp_destinatarios_relatorio (
  id SERIAL PRIMARY KEY,
  tipo TEXT NOT NULL,
  nome TEXT NOT NULL,
  jid TEXT NOT NULL,
  unidade_id UUID REFERENCES unidades(id),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Migrar dados hardcoded do relatorio-admin-whatsapp
INSERT INTO whatsapp_destinatarios_relatorio (tipo, nome, jid, unidade_id) VALUES
  ('relatorio_admin', 'RELATÓRIOS DIÁRIOS CG (Campo Grande)', '5521965832009-1600979279@g.us', '2ec861f6-023f-4d7b-9927-3960ad8c2a92'),
  ('relatorio_admin', 'RELATÓRIOS DIÁRIOS BR (Barra)', '5521965832009-1625319907@g.us', '368d47f5-2d88-4475-bc14-ba084a9a348e'),
  ('relatorio_admin', 'RELATÓRIOS DIÁRIOS RC (Recreio)', '5521992426581-1581033423@g.us', '95553e96-971b-4590-a6eb-0201d013c14d');

-- Migrar dados hardcoded do relatorio-coordenacao-whatsapp
INSERT INTO whatsapp_destinatarios_relatorio (tipo, nome, jid, unidade_id) VALUES
  ('relatorio_coordenacao', 'COORDENAÇÃO PEDAGÓGICA', '120363304349910605@g.us', NULL);

-- RLS: apenas service_role acessa (Edge Functions)
ALTER TABLE whatsapp_destinatarios_relatorio ENABLE ROW LEVEL SECURITY;
