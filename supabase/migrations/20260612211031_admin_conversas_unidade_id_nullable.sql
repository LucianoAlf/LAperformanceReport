-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Caixa administrativa "Todas as unidades": contatos nao-cadastrados (aluno_id NULL)
-- nao pertencem a nenhuma unidade. Permite unidade_id NULL para esses casos.
-- RLS existente ja restringe linhas com unidade_id NULL a usuarios admin (NULL IN (...) = falso).
ALTER TABLE public.admin_conversas ALTER COLUMN unidade_id DROP NOT NULL;
