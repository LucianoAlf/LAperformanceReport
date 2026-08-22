-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =====================================================
-- FASE 1.2: Tabela de Permissões
-- Armazena todas as permissões granulares do sistema
-- =====================================================

CREATE TABLE IF NOT EXISTS permissoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(100) NOT NULL UNIQUE,
  modulo VARCHAR(50) NOT NULL,
  acao VARCHAR(50) NOT NULL,
  descricao TEXT,
  categoria VARCHAR(20) DEFAULT 'OPERACIONAL',
  ordem INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comentários
COMMENT ON TABLE permissoes IS 'Permissões granulares do sistema (ex: alunos.ver, alunos.editar)';
COMMENT ON COLUMN permissoes.codigo IS 'Código único da permissão no formato modulo.acao (ex: dashboard.ver)';
COMMENT ON COLUMN permissoes.categoria IS 'Categoria: SISTEMA, OPERACIONAL, ADMIN';

-- Índices
CREATE INDEX IF NOT EXISTS idx_permissoes_codigo ON permissoes(codigo);
CREATE INDEX IF NOT EXISTS idx_permissoes_modulo ON permissoes(modulo);
CREATE INDEX IF NOT EXISTS idx_permissoes_categoria ON permissoes(categoria);
