-- Integração LA Performance Report -> LA Studio Manager (alunos)
-- 2026-03-25

BEGIN;

-- 1) Campos mínimos para integração de alunos
ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS emusys_student_id TEXT;

ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

CREATE INDEX IF NOT EXISTS idx_alunos_emusys_student_id
  ON public.alunos (emusys_student_id)
  WHERE emusys_student_id IS NOT NULL;

-- 2) Habilitar pg_net para disparo assíncrono do sync individual
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 3) Trigger function para enfileirar sync individual no Studio Manager
CREATE OR REPLACE FUNCTION public.enqueue_sync_student_studio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload JSONB;
BEGIN
  -- INSERT sempre dispara.
  -- UPDATE só dispara quando data_nascimento/photo_url realmente muda.
  IF TG_OP = 'INSERT'
     OR (TG_OP = 'UPDATE' AND (
       NEW.data_nascimento IS DISTINCT FROM OLD.data_nascimento
       OR NEW.photo_url IS DISTINCT FROM OLD.photo_url
     ))
  THEN
    v_payload := jsonb_build_object(
      'aluno_id', NEW.id
    );

    PERFORM net.http_post(
      url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-students-studio',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-studio-key', 'la-studio-webhook-2026'
      ),
      body := v_payload
    );
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[enqueue_sync_student_studio] Falha ao enfileirar sync para aluno %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_sync_student_studio ON public.alunos;

CREATE TRIGGER trg_enqueue_sync_student_studio
  AFTER INSERT OR UPDATE OF data_nascimento, photo_url
  ON public.alunos
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_sync_student_studio();

COMMENT ON FUNCTION public.enqueue_sync_student_studio IS
  'Dispara sync individual de aluno para a Edge Function sync-students-studio em INSERT e updates de data_nascimento/photo_url.';

COMMIT;
