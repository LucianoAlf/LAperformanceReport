CREATE TABLE IF NOT EXISTS public.automacoes_config (
  slug        text PRIMARY KEY,
  ativo       boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.automacoes_config ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão permissivo de crm_templates_whatsapp (o gate real é a permissão na UI).
DROP POLICY IF EXISTS automacoes_config_select ON public.automacoes_config;
CREATE POLICY automacoes_config_select ON public.automacoes_config
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS automacoes_config_insert ON public.automacoes_config;
CREATE POLICY automacoes_config_insert ON public.automacoes_config
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS automacoes_config_update ON public.automacoes_config;
CREATE POLICY automacoes_config_update ON public.automacoes_config
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.automacoes_config (slug, ativo)
VALUES ('auto_pesquisa_1a_aula', false)
ON CONFLICT (slug) DO NOTHING;
