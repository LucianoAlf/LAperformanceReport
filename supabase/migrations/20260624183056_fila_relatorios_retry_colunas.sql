-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

ALTER TABLE public.fila_relatorios_whatsapp
  ADD COLUMN IF NOT EXISTS tentativas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultima_tentativa_em timestamptz;

COMMENT ON COLUMN public.fila_relatorios_whatsapp.tentativas IS 'Nº de tentativas de envio. Retry para na constante RELATORIO_MAX_TENTATIVAS.';
COMMENT ON COLUMN public.fila_relatorios_whatsapp.ultima_tentativa_em IS 'Timestamp da última tentativa. Usado para destravar itens presos em status enviando.';
