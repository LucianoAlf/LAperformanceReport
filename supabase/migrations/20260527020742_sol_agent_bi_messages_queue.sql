-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


ALTER TABLE public.bi_messages_lamusic
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'done'
  CONSTRAINT bi_messages_status_check
    CHECK (status IN ('pending', 'processing', 'done', 'error'));

ALTER TABLE public.bi_messages_lamusic
  ADD COLUMN IF NOT EXISTS error_message text;

CREATE INDEX IF NOT EXISTS idx_bi_messages_status_created
  ON public.bi_messages_lamusic (status, created_at)
  WHERE status = 'pending';

ALTER PUBLICATION supabase_realtime ADD TABLE public.bi_messages_lamusic;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bi_conversations_lamusic;
