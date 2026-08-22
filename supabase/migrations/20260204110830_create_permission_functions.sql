-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =====================================================
-- FASE 1.6: Funções SQL para verificação de permissões
-- =====================================================

-- Função: Verifica se usuário tem uma permissão específica
-- Retorna TRUE se:
-- 1. Usuário é admin antigo (perfil = 'admin' na tabela usuarios)
-- 2. Usuário tem a permissão via novo sistema (usuario_perfis -> perfil_permissoes -> permissoes)
CREATE OR REPLACE FUNCTION usuario_tem_permissao(
  p_usuario_id INTEGER,
  p_codigo_permissao VARCHAR,
  p_unidade_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin_antigo BOOLEAN;
BEGIN
  -- 1. Verificar se é admin antigo (mantém compatibilidade)
  SELECT (perfil = 'admin' AND ativo = true) INTO v_is_admin_antigo
  FROM usuarios
  WHERE id = p_usuario_id;
  
  IF v_is_admin_antigo THEN
    RETURN TRUE;
  END IF;
  
  -- 2. Verificar no novo sistema de permissões
  RETURN EXISTS (
    SELECT 1
    FROM usuario_perfis up
    JOIN perfil_permissoes pp ON pp.perfil_id = up.perfil_id
    JOIN permissoes p ON p.id = pp.permissao_id
    WHERE up.usuario_id = p_usuario_id
      AND up.ativo = true
      AND p.codigo = p_codigo_permissao
      AND p.ativo = true
      AND (
        up.unidade_id IS NULL  -- Perfil global
        OR up.unidade_id = p_unidade_id  -- Perfil específico da unidade
        OR p_unidade_id IS NULL  -- Não está filtrando por unidade
      )
  );
END;
$$;

-- Função: Lista todas as permissões de um usuário
CREATE OR REPLACE FUNCTION usuario_permissoes(p_usuario_id INTEGER)
RETURNS TABLE(codigo VARCHAR, modulo VARCHAR, acao VARCHAR, descricao TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin_antigo BOOLEAN;
BEGIN
  -- Verificar se é admin antigo
  SELECT (perfil = 'admin' AND ativo = true) INTO v_is_admin_antigo
  FROM usuarios
  WHERE id = p_usuario_id;
  
  IF v_is_admin_antigo THEN
    -- Admin antigo tem TODAS as permissões
    RETURN QUERY
    SELECT p.codigo, p.modulo, p.acao, p.descricao
    FROM permissoes p
    WHERE p.ativo = true
    ORDER BY p.categoria, p.ordem;
  ELSE
    -- Buscar permissões do novo sistema
    RETURN QUERY
    SELECT DISTINCT p.codigo, p.modulo, p.acao, p.descricao
    FROM usuario_perfis up
    JOIN perfil_permissoes pp ON pp.perfil_id = up.perfil_id
    JOIN permissoes p ON p.id = pp.permissao_id
    WHERE up.usuario_id = p_usuario_id
      AND up.ativo = true
      AND p.ativo = true
    ORDER BY p.modulo, p.acao;
  END IF;
END;
$$;

-- Função: Lista todos os perfis de um usuário
CREATE OR REPLACE FUNCTION usuario_perfis_lista(p_usuario_id INTEGER)
RETURNS TABLE(
  perfil_id UUID,
  perfil_nome VARCHAR,
  perfil_nivel INTEGER,
  perfil_icone VARCHAR,
  perfil_cor VARCHAR,
  unidade_id UUID,
  unidade_nome VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pf.id,
    pf.nome,
    pf.nivel,
    pf.icone,
    pf.cor,
    up.unidade_id,
    u.nome
  FROM usuario_perfis up
  JOIN perfis pf ON pf.id = up.perfil_id
  LEFT JOIN unidades u ON u.id = up.unidade_id
  WHERE up.usuario_id = p_usuario_id
    AND up.ativo = true
    AND pf.ativo = true
  ORDER BY pf.nivel DESC, pf.nome;
END;
$$;

-- Comentários
COMMENT ON FUNCTION usuario_tem_permissao IS 'Verifica se usuário tem permissão específica (compatível com admin antigo)';
COMMENT ON FUNCTION usuario_permissoes IS 'Lista todas as permissões de um usuário';
COMMENT ON FUNCTION usuario_perfis_lista IS 'Lista todos os perfis atribuídos a um usuário';
