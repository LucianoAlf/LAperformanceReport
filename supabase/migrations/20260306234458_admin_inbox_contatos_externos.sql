-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- 1. Tornar aluno_id nullable em admin_conversas
ALTER TABLE admin_conversas ALTER COLUMN aluno_id DROP NOT NULL;

-- 2. Tornar aluno_id nullable em admin_mensagens
ALTER TABLE admin_mensagens ALTER COLUMN aluno_id DROP NOT NULL;

-- 3. Campos para contato externo
ALTER TABLE admin_conversas ADD COLUMN telefone_externo VARCHAR(20);
ALTER TABLE admin_conversas ADD COLUMN nome_externo VARCHAR(255);

-- 4. Trocar unique constraint por partial indexes
ALTER TABLE admin_conversas DROP CONSTRAINT admin_conversas_aluno_id_unidade_id_key;
CREATE UNIQUE INDEX idx_admin_conversas_aluno_unidade
  ON admin_conversas (aluno_id, unidade_id) WHERE aluno_id IS NOT NULL;
CREATE UNIQUE INDEX idx_admin_conversas_externo_unidade
  ON admin_conversas (telefone_externo, unidade_id) WHERE aluno_id IS NULL;

-- 5. CHECK: conversa precisa ter aluno_id ou telefone_externo
ALTER TABLE admin_conversas ADD CONSTRAINT chk_conversa_contato
  CHECK (aluno_id IS NOT NULL OR telefone_externo IS NOT NULL);

-- 6. Remetente 'externo' para msgs de contatos nao cadastrados
ALTER TABLE admin_mensagens DROP CONSTRAINT IF EXISTS admin_mensagens_remetente_check;
ALTER TABLE admin_mensagens ADD CONSTRAINT admin_mensagens_remetente_check
  CHECK (remetente IN ('aluno', 'admin', 'sistema', 'externo'));

-- 7. Index para lookup por telefone externo
CREATE INDEX idx_admin_conversas_telefone_externo
  ON admin_conversas (telefone_externo) WHERE telefone_externo IS NOT NULL;
