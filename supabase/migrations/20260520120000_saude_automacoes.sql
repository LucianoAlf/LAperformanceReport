-- Saúde das Automações — Task 1
-- Estende automacao_log + cria automacao_invariantes + RLS permissivo de SELECT.
-- Frontend já lê automacao_log via client anon em 4 arquivos: política precisa ser permissiva.

-- 1. Estender automacao_log
ALTER TABLE public.automacao_log
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS lead_id BIGINT,
  ADD COLUMN IF NOT EXISTS payload_bruto JSONB,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'automacao_log_status_check'
      AND conrelid = 'public.automacao_log'::regclass
  ) THEN
    ALTER TABLE public.automacao_log
      ADD CONSTRAINT automacao_log_status_check
      CHECK (status IN ('ok', 'warn', 'erro'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS automacao_log_idempotency_key_uq
  ON public.automacao_log (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS automacao_log_aluno_id_created_at_idx
  ON public.automacao_log (aluno_id, created_at DESC);

CREATE INDEX IF NOT EXISTS automacao_log_lead_id_created_at_idx
  ON public.automacao_log (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS automacao_log_status_created_at_idx
  ON public.automacao_log (status, created_at DESC);

-- 2. Nova tabela automacao_invariantes
CREATE TABLE IF NOT EXISTS public.automacao_invariantes (
  id           BIGSERIAL PRIMARY KEY,
  log_id       BIGINT NOT NULL REFERENCES public.automacao_log(id) ON DELETE CASCADE,
  regra        TEXT NOT NULL,
  severidade   TEXT NOT NULL CHECK (severidade IN ('critico', 'aviso')),
  mensagem     TEXT NOT NULL,
  visto_em     TIMESTAMPTZ,
  visto_por    UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS automacao_invariantes_visto_idx
  ON public.automacao_invariantes (visto_em) WHERE visto_em IS NULL;

CREATE INDEX IF NOT EXISTS automacao_invariantes_severidade_created_at_idx
  ON public.automacao_invariantes (severidade, created_at DESC);

CREATE INDEX IF NOT EXISTS automacao_invariantes_regra_created_at_idx
  ON public.automacao_invariantes (regra, created_at DESC);

CREATE INDEX IF NOT EXISTS automacao_invariantes_log_id_idx
  ON public.automacao_invariantes (log_id);

-- 3. RLS — política permissiva para SELECT (frontend já lê com anon/authenticated)
ALTER TABLE public.automacao_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automacao_invariantes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "automacao_log_select_authenticated" ON public.automacao_log;
CREATE POLICY "automacao_log_select_authenticated"
  ON public.automacao_log FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "automacao_invariantes_select_authenticated" ON public.automacao_invariantes;
CREATE POLICY "automacao_invariantes_select_authenticated"
  ON public.automacao_invariantes FOR SELECT
  TO authenticated
  USING (true);

-- UPDATE (marcar como visto) restrito a admin via usuarios.perfil = 'admin'
DROP POLICY IF EXISTS "automacao_invariantes_update_admin" ON public.automacao_invariantes;
CREATE POLICY "automacao_invariantes_update_admin"
  ON public.automacao_invariantes FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid()
        AND u.perfil = 'admin'
    )
  );

COMMENT ON TABLE public.automacao_invariantes IS
'Registra violações de invariantes de negócio detectadas nos webhooks Emusys (matrícula em tempo real) ou via cron auditor (lead/experimental/alunos).';

COMMENT ON COLUMN public.automacao_log.status IS
'Resultado do processamento: ok=sem violações, warn=violou só avisos, erro=violou pelo menos 1 critico.';
COMMENT ON COLUMN public.automacao_log.payload_bruto IS
'Payload original do webhook (matrícula) ou snapshot do registro no banco (auditor).';
COMMENT ON COLUMN public.automacao_log.idempotency_key IS
'Hash estável que evita reprocessamento duplicado. Para auditor: audit:<regra>:<record_id>.';
