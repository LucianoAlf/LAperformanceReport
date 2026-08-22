-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Expandir CHECK constraint para incluir tipo 'pre_atendimento'
ALTER TABLE colaboradores DROP CONSTRAINT colaboradores_tipo_check;
ALTER TABLE colaboradores ADD CONSTRAINT colaboradores_tipo_check 
  CHECK (tipo IN ('farmer', 'hunter', 'gerente', 'admin', 'pre_atendimento'));

-- Inserir Andreza (atende todas as unidades, por isso unidade_id = NULL)
INSERT INTO colaboradores (nome, apelido, tipo, unidade_id, ativo)
VALUES ('Andreza', 'Andreza', 'pre_atendimento', NULL, true);
