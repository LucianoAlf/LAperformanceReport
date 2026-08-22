-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Trilha de auditoria de toda gravação do Fábio na anotacoes_fabio.
-- Guarda: quem, quando, texto anterior, texto novo, origem (audio/texto), modo.
CREATE TABLE IF NOT EXISTS public.aula_registros_fabio_log (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  aula_id         integer NOT NULL REFERENCES public.aulas_emusys(id) ON DELETE CASCADE,
  professor_id    integer,
  texto_anterior  text,
  texto_novo      text,
  origem          text,         -- 'audio' | 'texto'
  modo            text,         -- 'novo' | 'substituir' | 'complementar'
  criado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fabio_log_aula     ON public.aula_registros_fabio_log (aula_id);
CREATE INDEX IF NOT EXISTS idx_fabio_log_criado   ON public.aula_registros_fabio_log (criado_em);

COMMENT ON TABLE public.aula_registros_fabio_log IS
  'Auditoria das gravações do Fábio em aulas_emusys.anotacoes_fabio. É trilha de rastreabilidade, não o lar do registro (o registro vive em anotacoes_fabio).';

-- RLS habilitado sem políticas públicas: acesso só via SECURITY DEFINER (a função) e service_role.
ALTER TABLE public.aula_registros_fabio_log ENABLE ROW LEVEL SECURITY;
