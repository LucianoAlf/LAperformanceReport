-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Remover constraint antiga que não inclui os status de experimental e visita
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;

-- Adicionar constraint atualizada com todos os status usados pelo frontend
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check CHECK (
  status::text = ANY (ARRAY[
    'novo',
    'em_contato',
    'agendado',
    'realizado',
    'convertido',
    'arquivado',
    'perdido',
    'experimental_agendada',
    'experimental_realizada',
    'experimental_faltou',
    'visita_escola',
    'matriculado'
  ]::text[])
);
