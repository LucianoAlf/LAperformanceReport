-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Adicionar campos de responsável na tabela alunos
-- Campos opcionais para não quebrar fluxos existentes
ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS responsavel_nome VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS responsavel_telefone VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS responsavel_parentesco VARCHAR(50) DEFAULT NULL;

-- Comentários descritivos
COMMENT ON COLUMN public.alunos.responsavel_nome IS 'Nome do responsável (pai, mãe, tutor). Opcional.';
COMMENT ON COLUMN public.alunos.responsavel_telefone IS 'Telefone/WhatsApp do responsável. Opcional.';
COMMENT ON COLUMN public.alunos.responsavel_parentesco IS 'Vínculo com o aluno: mae, pai, avo, tio, tutor, outro. Opcional.';
