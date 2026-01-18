-- ============================================
-- FASE 5.5a: AJUSTAR TABELA USUARIOS
-- Sistema de Controle de Acesso por Unidade
-- ============================================

-- Verificar e ajustar a estrutura da tabela usuarios
-- Perfis: 'admin' (vê tudo) ou 'unidade' (vê apenas sua unidade)

-- Remover coluna perfil antiga se existir com valores diferentes
ALTER TABLE usuarios DROP COLUMN IF EXISTS perfil CASCADE;

-- Adicionar coluna perfil com os novos valores
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perfil VARCHAR(20) DEFAULT 'unidade';

-- Adicionar constraint para validar perfis
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_perfil_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_perfil_check 
  CHECK (perfil IN ('admin', 'unidade'));

-- Garantir que unidade_id existe e é nullable (null = admin)
ALTER TABLE usuarios ALTER COLUMN unidade_id DROP NOT NULL;

-- Adicionar índices para performance
CREATE INDEX IF NOT EXISTS idx_usuarios_perfil ON usuarios(perfil);
CREATE INDEX IF NOT EXISTS idx_usuarios_unidade_id ON usuarios(unidade_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);

-- Comentários para documentação
COMMENT ON COLUMN usuarios.perfil IS 'Perfil do usuário: admin (acesso total) ou unidade (acesso restrito)';
COMMENT ON COLUMN usuarios.unidade_id IS 'Unidade do usuário. NULL para admin, preenchido para usuários de unidade';

-- ============================================
-- VERIFICAR ESTRUTURA FINAL
-- ============================================
-- A tabela usuarios deve ter:
-- id: uuid (PK, referencia auth.users)
-- email: string (unique)
-- nome: string
-- perfil: 'admin' | 'unidade'
-- unidade_id: uuid (FK unidades) | null
-- ativo: boolean
-- created_at, updated_at: timestamps
