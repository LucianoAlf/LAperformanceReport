-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- CORREÇÃO 1: Remover evasões órfãs (aluno_id = NULL)
-- Essas são registros corrompidos que não podem ser recuperados
DELETE FROM evasoes_v2 WHERE aluno_id IS NULL;

-- CORREÇÃO 2: Remover duplicata do Mateus Bernardes Galvão
-- Manter apenas o registro mais antigo (ID 10 - Interrompido em 12/02)
-- Remover o ID 17 (Não Renovou em 02/02, criado depois)
DELETE FROM evasoes_v2 WHERE id = 17;

-- CORREÇÃO 3: Remover duplicata da Anna Lívia
-- Manter apenas o registro mais antigo (ID 16 - data_evasao 2025-11-19)
-- Remover o ID 40 (data_evasao 2026-01-14, criado depois)
DELETE FROM evasoes_v2 WHERE id = 40;

-- CORREÇÃO 4: Adicionar constraint para evitar evasões sem aluno
ALTER TABLE evasoes_v2 
ALTER COLUMN aluno_id SET NOT NULL;

-- CORREÇÃO 5: Adicionar constraint UNIQUE para evitar duplicatas
-- Um aluno só pode ter uma evasão por curso
ALTER TABLE evasoes_v2 
ADD CONSTRAINT evasoes_v2_aluno_curso_unique 
UNIQUE (aluno_id, curso_id);
