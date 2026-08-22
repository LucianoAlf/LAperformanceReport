-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Corrigir política de SELECT da tabela usuarios para evitar loop infinito
-- Permite que usuário veja seu próprio registro OU que admin veja todos
DROP POLICY IF EXISTS "usuarios_select_policy" ON usuarios;
CREATE POLICY "usuarios_select_policy" ON usuarios
  FOR SELECT USING (
    -- Usuário pode ver seu próprio registro
    auth_user_id = auth.uid() 
    OR
    -- Admin pode ver todos os registros (usando subquery para evitar recursão)
    EXISTS (
      SELECT 1 FROM usuarios u2
      WHERE u2.auth_user_id = auth.uid()
      AND u2.perfil = 'admin'
      AND u2.ativo = true
    )
  );
