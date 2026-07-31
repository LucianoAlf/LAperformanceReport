-- Os IDs de aula do Emusys pertencem ao namespace de cada unidade.
-- A unicidade global impedia duas escolas de persistirem o mesmo ID externo.
DROP INDEX IF EXISTS public.uq_lead_exp_aula;

CREATE UNIQUE INDEX uq_lead_exp_aula
  ON public.lead_experimentais (unidade_id, emusys_aula_id)
  WHERE emusys_aula_id IS NOT NULL;

COMMENT ON INDEX public.uq_lead_exp_aula IS
  'Impede aula duplicada dentro da unidade sem conflitar IDs locais de outras unidades.';
