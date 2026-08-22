-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

alter table public.lead_experimental_aulas
  drop constraint if exists lead_experimental_aulas_casado_por_check;

alter table public.lead_experimental_aulas
  add constraint lead_experimental_aulas_casado_por_check
  check (casado_por is null or casado_por = any (array[
    'chave_natural'::text,
    'manual'::text,
    'emusys_lead_id'::text
  ]));
