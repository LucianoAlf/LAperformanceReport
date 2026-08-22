-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- 1. Tabela de Configurações do Programa Fideliza+
CREATE TABLE IF NOT EXISTS programa_fideliza_config (
  id SERIAL PRIMARY KEY,
  ano INTEGER NOT NULL DEFAULT 2026,
  
  -- Metas de Retenção (trimestrais)
  meta_churn_maximo DECIMAL(5,2) NOT NULL DEFAULT 4.0,
  meta_inadimplencia_maxima DECIMAL(5,2) NOT NULL DEFAULT 1.0,
  meta_renovacao_minima DECIMAL(5,2) NOT NULL DEFAULT 90.0,
  meta_reajuste_minimo DECIMAL(5,2) NOT NULL DEFAULT 7.0,
  
  -- Metas de Lojinha por unidade (JSON)
  metas_lojinha JSONB NOT NULL DEFAULT '{
    "2ec861f6-023f-4d7b-9927-3960ad8c2a92": 5000,
    "95553e96-971b-4590-a6eb-0201d013c14d": 3000,
    "368d47f5-2d88-4475-bc14-ba084a9a348e": 3000
  }'::jsonb,
  
  -- Sistema de pontuação
  pontos_churn INTEGER NOT NULL DEFAULT 25,
  pontos_inadimplencia INTEGER NOT NULL DEFAULT 20,
  pontos_renovacao INTEGER NOT NULL DEFAULT 25,
  pontos_reajuste INTEGER NOT NULL DEFAULT 15,
  pontos_lojinha INTEGER NOT NULL DEFAULT 15,
  
  -- Penalidades
  penalidade_nao_preencheu_sistema INTEGER NOT NULL DEFAULT 3,
  penalidade_nao_preencheu_lareport INTEGER NOT NULL DEFAULT 3,
  penalidade_reincidencia_mes INTEGER NOT NULL DEFAULT 5,
  
  -- Nota de corte
  nota_corte INTEGER NOT NULL DEFAULT 60,
  criterio_desempate VARCHAR(50) NOT NULL DEFAULT 'menor_churn',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(ano)
);
