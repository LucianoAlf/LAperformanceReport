-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

ALTER TABLE public.admin_mensagens DROP CONSTRAINT admin_mensagens_tipo_check;
ALTER TABLE public.admin_mensagens ADD CONSTRAINT admin_mensagens_tipo_check
  CHECK ((tipo)::text = ANY ((ARRAY['texto','imagem','audio','video','documento','sticker','sistema','interativo','contato','localizacao'])::text[]));
