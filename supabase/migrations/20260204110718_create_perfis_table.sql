-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =====================================================
-- FASE 1.1: Tabela de Perfis
-- Armazena os tipos de perfil (Admin, Gerente, Farmer, etc.)
-- =====================================================

CREATE TABLE IF NOT EXISTS perfis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(50) NOT NULL UNIQUE,
  descricao TEXT,
  nivel INTEGER NOT NULL DEFAULT 10,
  icone VARCHAR(10) DEFAULT '👤',
  cor VARCHAR(20) DEFAULT '#3b82f6',
  sistema BOOLEAN DEFAULT FALSE,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comentário da tabela
COMMENT ON TABLE perfis IS 'Perfis de acesso do sistema (Admin, Gerente, Farmer, Hunter, etc.)';
COMMENT ON COLUMN perfis.nivel IS 'Nível hierárquico: 100=Admin, 50=Gerente, 30=Operacional, 20=Professor, 10=Visualizador';
COMMENT ON COLUMN perfis.sistema IS 'Perfis de sistema não podem ser excluídos';

-- Índice para busca por nome
CREATE INDEX IF NOT EXISTS idx_perfis_nome ON perfis(nome);
CREATE INDEX IF NOT EXISTS idx_perfis_ativo ON perfis(ativo) WHERE ativo = true;
