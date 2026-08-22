-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Habilitar RLS na tabela salas
ALTER TABLE salas ENABLE ROW LEVEL SECURITY;

-- Política de SELECT: usuários autenticados podem ver salas da sua unidade ou admins veem todas
CREATE POLICY "salas_select" ON salas
FOR SELECT
TO authenticated
USING (
  is_admin() OR unidade_id = get_user_unidade_id()
);

-- Política de INSERT: usuários autenticados podem criar salas na sua unidade ou admins em qualquer
CREATE POLICY "salas_insert" ON salas
FOR INSERT
TO authenticated
WITH CHECK (
  is_admin() OR unidade_id = get_user_unidade_id()
);

-- Política de UPDATE: usuários autenticados podem atualizar salas da sua unidade ou admins qualquer
CREATE POLICY "salas_update" ON salas
FOR UPDATE
TO authenticated
USING (
  is_admin() OR unidade_id = get_user_unidade_id()
)
WITH CHECK (
  is_admin() OR unidade_id = get_user_unidade_id()
);

-- Política de DELETE: usuários autenticados podem excluir salas da sua unidade ou admins qualquer
CREATE POLICY "salas_delete" ON salas
FOR DELETE
TO authenticated
USING (
  is_admin() OR unidade_id = get_user_unidade_id()
);
