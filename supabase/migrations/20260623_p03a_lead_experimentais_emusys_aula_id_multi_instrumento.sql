-- Fase 2 da régua do professor: suportar multi-instrumento via id único da aula do Emusys.
-- 1 linha por aula real (emusys_aula_id), em vez de colapsar por (lead_id, data).

ALTER TABLE public.lead_experimentais
  ADD COLUMN IF NOT EXISTS emusys_aula_id integer;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_exp_aula
  ON public.lead_experimentais (emusys_aula_id)
  WHERE emusys_aula_id IS NOT NULL;

-- constraint (não índice puro)
ALTER TABLE public.lead_experimentais
  DROP CONSTRAINT IF EXISTS lead_experimentais_lead_data_unique;
-- índice parcial puro
DROP INDEX IF EXISTS public.idx_lead_experimentais_unique;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_exp_legado
  ON public.lead_experimentais (lead_id, data_experimental, nome_aluno)
  WHERE status::text <> 'cancelada' AND emusys_aula_id IS NULL;

ALTER TABLE public.lead_experimentais
  ALTER COLUMN lead_id DROP NOT NULL;

COMMENT ON COLUMN public.lead_experimentais.emusys_aula_id IS
  'ID único da aula experimental no Emusys (webhook body.id / GET /aulas a.id). Chave de dedup que permite multi-instrumento no mesmo dia.';
