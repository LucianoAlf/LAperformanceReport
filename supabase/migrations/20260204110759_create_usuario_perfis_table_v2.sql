-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =====================================================
-- FASE 1.4: Tabela de Relacionamento Usuário-Perfis
-- Liga usuários aos seus perfis (com escopo de unidade opcional)
-- NOTA: usuarios.id é INTEGER, não UUID
-- =====================================================

CREATE TABLE IF NOT EXISTS usuario_perfis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  perfil_id UUID NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
  unidade_id UUID REFERENCES unidades(id) ON DELETE CASCADE,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comentários
COMMENT ON TABLE usuario_perfis IS 'Relacionamento N:N entre usuários e perfis, com escopo opcional de unidade';
COMMENT ON COLUMN usuario_perfis.unidade_id IS 'Se NULL, o perfil vale para todas as unidades';

-- Índices únicos para evitar duplicatas (tratando NULL corretamente)
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuario_perfis_unique_with_unidade 
ON usuario_perfis(usuario_id, perfil_id, unidade_id) 
WHERE unidade_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuario_perfis_unique_without_unidade 
ON usuario_perfis(usuario_id, perfil_id) 
WHERE unidade_id IS NULL;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_usuario_perfis_usuario ON usuario_perfis(usuario_id);
CREATE INDEX IF NOT EXISTS idx_usuario_perfis_perfil ON usuario_perfis(perfil_id);
CREATE INDEX IF NOT EXISTS idx_usuario_perfis_unidade ON usuario_perfis(unidade_id);
