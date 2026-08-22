-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

drop policy if exists anamnese_convites_por_unidade on public.anamnese_convites;
create policy anamnese_convites_por_unidade on public.anamnese_convites
  for all
  to authenticated
  using (
    unidade_id in (select u.unidade_id from usuarios u where u.auth_user_id = auth.uid())
    or exists (select 1 from usuarios u where u.auth_user_id = auth.uid() and u.perfil = 'admin')
  );
