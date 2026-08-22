-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

ALTER TABLE movimentacoes_admin
  ADD COLUMN IF NOT EXISTS telefone_snapshot VARCHAR,
  ADD COLUMN IF NOT EXISTS situacao_pagamento VARCHAR DEFAULT 'em_dia',
  ADD COLUMN IF NOT EXISTS data_prevista_saida DATE;
