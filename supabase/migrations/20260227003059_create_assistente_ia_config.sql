-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


CREATE TABLE public.assistente_ia_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  openai_api_key text NOT NULL DEFAULT '',
  openai_model text NOT NULL DEFAULT 'gpt-4o-mini',
  updated_at timestamptz DEFAULT now()
);

INSERT INTO assistente_ia_config (openai_api_key, openai_model) VALUES ('', 'gpt-4o-mini');

ALTER TABLE assistente_ia_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read config"
  ON assistente_ia_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can update config"
  ON assistente_ia_config FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM usuarios u WHERE u.auth_user_id = auth.uid() AND u.perfil = 'admin')
  );
