-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Metas mensais da Andreza por unidade
CREATE TABLE crm_metas_andreza (
  id SERIAL PRIMARY KEY,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  meta_show_up_rate NUMERIC DEFAULT 30.0,
  taxa_compromisso_valor NUMERIC, -- R$70 CG, R$100 REC/BAR
  bonus_valor NUMERIC DEFAULT 150.0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ano, mes, unidade_id)
);

-- Seed: metas fev/2026 para as 3 unidades
INSERT INTO crm_metas_andreza (ano, mes, unidade_id, meta_show_up_rate, taxa_compromisso_valor, bonus_valor) VALUES
  (2026, 2, '2ec861f6-023f-4d7b-9927-3960ad8c2a92', 30.0, 70.0,  150.0),  -- Campo Grande
  (2026, 2, '95553e96-971b-4590-a6eb-0201d013c14d', 30.0, 100.0, 150.0),  -- Recreio
  (2026, 2, '368d47f5-2d88-4475-bc14-ba084a9a348e', 30.0, 100.0, 150.0);  -- Barra

CREATE INDEX idx_crm_metas_andreza_periodo ON crm_metas_andreza(ano, mes);
