-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- ────────────────────────────────────────────────────────────
-- 1. Triggers updated_at (DROP IF EXISTS → idempotente)
-- ────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_bi_messages_updated_at ON public.bi_messages_lamusic;
CREATE TRIGGER trg_bi_messages_updated_at
  BEFORE UPDATE ON public.bi_messages_lamusic
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_bi_conversations_updated_at ON public.bi_conversations_lamusic;
CREATE TRIGGER trg_bi_conversations_updated_at
  BEFORE UPDATE ON public.bi_conversations_lamusic
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 2. bi_conversations_lamusic: unidade + colaborador + tipo
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.bi_conversations_lamusic
  ADD COLUMN IF NOT EXISTS unidade_id       uuid    REFERENCES public.unidades(id),
  ADD COLUMN IF NOT EXISTS colaborador_id   integer REFERENCES public.colaboradores(id),
  ADD COLUMN IF NOT EXISTS colaborador_tipo text;

CREATE OR REPLACE FUNCTION public.fn_bi_conversation_autofill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT c.id, c.unidade_id, c.tipo
  INTO   NEW.colaborador_id, NEW.unidade_id, NEW.colaborador_tipo
  FROM   public.colaboradores c
  WHERE  c.usuario_id = auth.uid()
    AND  c.ativo = true
  ORDER BY c.created_at ASC
  LIMIT 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bi_conversation_autofill ON public.bi_conversations_lamusic;
CREATE TRIGGER trg_bi_conversation_autofill
  BEFORE INSERT ON public.bi_conversations_lamusic
  FOR EACH ROW EXECUTE FUNCTION public.fn_bi_conversation_autofill();

-- ────────────────────────────────────────────────────────────
-- 3. bi_messages_lamusic: attempt_count + locked_at
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.bi_messages_lamusic
  ADD COLUMN IF NOT EXISTS attempt_count integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_at     timestamptz;

-- ────────────────────────────────────────────────────────────
-- 4. pg_cron: unschedule defensivo + timeout 10 minutos
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reset-sol-stuck-messages') THEN
    PERFORM cron.unschedule('reset-sol-stuck-messages');
  END IF;
END;
$$;

SELECT cron.schedule(
  'reset-sol-stuck-messages',
  '*/5 * * * *',
  $$
    UPDATE public.bi_messages_lamusic
    SET   status        = 'pending',
          locked_at     = NULL,
          attempt_count = attempt_count + 1
    WHERE status      = 'processing'
      AND updated_at  < now() - interval '10 minutes'
      AND attempt_count < 3;

    UPDATE public.bi_messages_lamusic
    SET   status        = 'error',
          error_message = 'Máximo de tentativas atingido'
    WHERE status      = 'processing'
      AND updated_at  < now() - interval '10 minutes'
      AND attempt_count >= 3;
  $$
);
