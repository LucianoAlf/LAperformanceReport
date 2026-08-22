-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

update public.alunos
set curso_id = 10,
    updated_at = now()
where unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
  and id in (1770, 1773)
  and emusys_matricula_id in ('2591', '2592')
  and curso_id = 12;
