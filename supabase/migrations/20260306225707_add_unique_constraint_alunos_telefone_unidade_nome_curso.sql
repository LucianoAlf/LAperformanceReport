-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

ALTER TABLE alunos ADD CONSTRAINT idx_alunos_telefone_unidade_nome_curso_unique
  UNIQUE (telefone, unidade_id, nome, curso_id);
