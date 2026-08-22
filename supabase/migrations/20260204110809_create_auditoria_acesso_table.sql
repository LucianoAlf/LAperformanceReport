-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =====================================================
-- FASE 1.5: Tabela de Auditoria de Acesso
-- Registra todas as ações de permissão (login, alterações, etc.)
-- =====================================================

CREATE TABLE IF NOT EXISTS auditoria_acesso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nome VARCHAR(255),
  acao VARCHAR(50) NOT NULL,
  entidade VARCHAR(50),
  entidade_id UUID,
  detalhes JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comentários
COMMENT ON TABLE auditoria_acesso IS 'Log de auditoria para ações de acesso e permissões';
COMMENT ON COLUMN auditoria_acesso.acao IS 'Tipo de ação: login, logout, criar, editar, excluir, atribuir_perfil, etc.';
COMMENT ON COLUMN auditoria_acesso.entidade IS 'Entidade afetada: usuario, perfil, permissao, etc.';

-- Índices para consultas de auditoria
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria_acesso(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_acao ON auditoria_acesso(acao);
CREATE INDEX IF NOT EXISTS idx_auditoria_created ON auditoria_acesso(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_entidade ON auditoria_acesso(entidade, entidade_id);
