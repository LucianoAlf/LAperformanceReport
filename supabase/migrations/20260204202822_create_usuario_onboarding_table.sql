-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Tabela para tracking do onboarding de usuários
CREATE TABLE IF NOT EXISTS usuario_onboarding (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  
  -- Checklist inicial
  senha_alterada BOOLEAN DEFAULT FALSE,
  foto_uploaded BOOLEAN DEFAULT FALSE,
  perfil_completo BOOLEAN DEFAULT FALSE,
  checklist_completo BOOLEAN DEFAULT FALSE,
  
  -- Tours por página
  tour_dashboard BOOLEAN DEFAULT FALSE,
  tour_alunos BOOLEAN DEFAULT FALSE,
  tour_comercial BOOLEAN DEFAULT FALSE,
  tour_professores BOOLEAN DEFAULT FALSE,
  tour_salas BOOLEAN DEFAULT FALSE,
  tour_metas BOOLEAN DEFAULT FALSE,
  tour_projetos BOOLEAN DEFAULT FALSE,
  tour_administrativo BOOLEAN DEFAULT FALSE,
  tour_config BOOLEAN DEFAULT FALSE,
  
  -- Metadados
  tours_completados INTEGER DEFAULT 0,
  ultimo_tour_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(usuario_id)
);

-- Índice para busca por usuário
CREATE INDEX IF NOT EXISTS idx_usuario_onboarding_usuario_id ON usuario_onboarding(usuario_id);

-- Habilitar RLS
ALTER TABLE usuario_onboarding ENABLE ROW LEVEL SECURITY;

-- Política para usuários verem/editarem seus próprios dados
CREATE POLICY "Usuários podem gerenciar seu próprio onboarding" ON usuario_onboarding
  FOR ALL USING (
    usuario_id IN (SELECT id FROM usuarios WHERE auth_user_id = auth.uid())
  );

-- Comentários
COMMENT ON TABLE usuario_onboarding IS 'Tracking do progresso de onboarding de cada usuário';
COMMENT ON COLUMN usuario_onboarding.senha_alterada IS 'Se o usuário já alterou a senha inicial';
COMMENT ON COLUMN usuario_onboarding.foto_uploaded IS 'Se o usuário já fez upload de foto de perfil';
COMMENT ON COLUMN usuario_onboarding.perfil_completo IS 'Se o usuário completou o perfil (nome, apelido)';
COMMENT ON COLUMN usuario_onboarding.checklist_completo IS 'Se o checklist inicial foi concluído';
COMMENT ON COLUMN usuario_onboarding.tours_completados IS 'Contador de tours completados';
