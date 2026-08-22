-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Habilitar RLS nas views de turmas
ALTER VIEW vw_turmas_completa SET (security_invoker = on);
ALTER VIEW vw_turmas_implicitas SET (security_invoker = on);

-- As views herdarão as políticas RLS das tabelas base automaticamente
-- quando security_invoker está ativado

-- Comentário explicativo:
-- Com security_invoker = on, as views executam com os privilégios do usuário
-- que as consulta, não do proprietário da view. Isso significa que as políticas
-- RLS das tabelas base (turmas, alunos, etc.) serão aplicadas automaticamente.
