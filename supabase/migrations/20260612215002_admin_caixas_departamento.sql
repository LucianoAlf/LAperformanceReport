-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Departamento de atendimento nas caixas administrativas (Sucesso do Aluno vs Administrativo).
-- Permite que o mesmo aluno tenha conversas separadas por departamento.

-- 1) Coluna na caixa (qual departamento aquela caixa atende)
ALTER TABLE public.whatsapp_caixas
  ADD COLUMN IF NOT EXISTS departamento text NOT NULL DEFAULT 'administrativo';

-- 2) Coluna na conversa (desnormalizada da caixa, para os índices e filtros)
ALTER TABLE public.admin_conversas
  ADD COLUMN IF NOT EXISTS departamento text NOT NULL DEFAULT 'administrativo';

-- 3) Validação de valores conhecidos (typo-safe; expandir via ALTER quando surgir novo depto)
ALTER TABLE public.whatsapp_caixas
  DROP CONSTRAINT IF EXISTS whatsapp_caixas_departamento_check;
ALTER TABLE public.whatsapp_caixas
  ADD CONSTRAINT whatsapp_caixas_departamento_check
  CHECK (departamento IN ('administrativo', 'sucesso_aluno'));

ALTER TABLE public.admin_conversas
  DROP CONSTRAINT IF EXISTS admin_conversas_departamento_check;
ALTER TABLE public.admin_conversas
  ADD CONSTRAINT admin_conversas_departamento_check
  CHECK (departamento IN ('administrativo', 'sucesso_aluno'));

-- 4) Identidade da conversa passa a incluir o departamento.
--    NULLS NOT DISTINCT: contatos externos sem unidade (caixa "todas") não duplicam.
DROP INDEX IF EXISTS public.idx_admin_conversas_aluno_unidade;
CREATE UNIQUE INDEX idx_admin_conversas_aluno_unidade_depto
  ON public.admin_conversas (aluno_id, unidade_id, departamento)
  WHERE aluno_id IS NOT NULL;

DROP INDEX IF EXISTS public.idx_admin_conversas_externo_unidade;
CREATE UNIQUE INDEX idx_admin_conversas_externo_unidade_depto
  ON public.admin_conversas (telefone_externo, unidade_id, departamento) NULLS NOT DISTINCT
  WHERE aluno_id IS NULL;
