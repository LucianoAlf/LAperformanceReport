-- Conciliação: separa a origem da divergência e guarda a análise textual da Sol.
-- fonte='sync' (edge determinística, default) | 'sol' (auditora IA, futuro).
-- analise_sol = explicação em linguagem natural escrita pela Sol no caso ambíguo.

ALTER TABLE public.matriculas_divergencias
  ADD COLUMN IF NOT EXISTS fonte text NOT NULL DEFAULT 'sync',
  ADD COLUMN IF NOT EXISTS analise_sol text;

COMMENT ON COLUMN public.matriculas_divergencias.fonte IS
  'Origem da divergência: sync (edge determinística) ou sol (auditora IA).';
COMMENT ON COLUMN public.matriculas_divergencias.analise_sol IS
  'Análise/recomendação em linguagem natural escrita pela Sol (auditora). Read-only para o humano decidir.';
