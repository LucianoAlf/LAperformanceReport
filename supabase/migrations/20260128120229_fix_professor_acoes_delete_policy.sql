-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Remover política antiga de DELETE
DROP POLICY IF EXISTS professor_acoes_delete ON professor_acoes;

-- Criar nova política de DELETE que permite:
-- 1. Admins podem excluir tudo
-- 2. Usuários podem excluir ações da sua unidade
-- 3. Usuários podem excluir ações sem unidade (NULL)
CREATE POLICY professor_acoes_delete ON professor_acoes
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM usuarios u
    WHERE u.auth_user_id = auth.uid()
    AND (
      u.perfil::text = 'admin'::text
      OR u.unidade_id = professor_acoes.unidade_id
      OR professor_acoes.unidade_id IS NULL
    )
  )
);
