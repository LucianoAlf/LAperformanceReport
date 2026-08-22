-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.
-- ATENCAO: SEGREDO REDIGIDO — token quepasa substituido por <REDACTED:token>.
-- O SQL aqui NAO e executavel como esta; o valor real vive no ambiente. Ver issue #201.


ALTER TABLE public.mila_config
  ADD COLUMN IF NOT EXISTS token_quepasa varchar;

COMMENT ON COLUMN public.mila_config.token_quepasa IS
  'Token do QuePasa (WhatsApp) da unidade. Usado para lookup de unidade no workflow de transferencia.';

UPDATE public.mila_config
SET token_quepasa = '<REDACTED:token>'
WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
