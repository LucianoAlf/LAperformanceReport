-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =============================================================================
-- LA MUSIC - OTIMIZAÇÃO DE FUNÇÕES DE AUTENTICAÇÃO
-- =============================================================================
-- Substituir auth.uid() por (select auth.uid()) nas funções auxiliares
-- Isso evita re-avaliação por linha e melhora performance em 10x+
-- =============================================================================

-- Recriar função is_admin() otimizada
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM usuarios 
    WHERE auth_user_id = (SELECT auth.uid())
    AND perfil = 'admin' 
    AND ativo = true
  );
END;
$$;

-- Recriar função get_user_unidade_id() otimizada
CREATE OR REPLACE FUNCTION public.get_user_unidade_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN (
    SELECT unidade_id FROM usuarios 
    WHERE auth_user_id = (SELECT auth.uid())
    AND ativo = true
  );
END;
$$;

-- Comentário para documentação
COMMENT ON FUNCTION public.is_admin() IS 'Verifica se o usuário autenticado é admin. Otimizada com (select auth.uid()) para performance.';
COMMENT ON FUNCTION public.get_user_unidade_id() IS 'Retorna o unidade_id do usuário autenticado. Otimizada com (select auth.uid()) para performance.';
