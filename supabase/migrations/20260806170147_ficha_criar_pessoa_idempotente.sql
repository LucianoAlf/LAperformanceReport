-- Histórico já aplicado em produção em 2026-08-06.
-- Identifica o chamador externo estável da Ficha Técnica.
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS origem_sistema text,
  ADD COLUMN IF NOT EXISTS origem_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_colaboradores_origem_ref
  ON public.colaboradores (origem_sistema, origem_ref)
  WHERE origem_ref IS NOT NULL;
