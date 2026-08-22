-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Corte de least-privilege: Lia so pode ler o que os 4 crons de jornada realmente usam.
-- Antes: SELECT amplo em 282 tabelas do public. Depois: so 5 objetos (4 tabelas + 1 view).

revoke select on all tables in schema public from lia_acesso_restrito;

grant select on public.alunos           to lia_acesso_restrito;
grant select on public.unidades         to lia_acesso_restrito;
grant select on public.cursos           to lia_acesso_restrito;
grant select on public.aluno_presenca   to lia_acesso_restrito;
grant select on public.vw_alertas_inteligentes to lia_acesso_restrito;
