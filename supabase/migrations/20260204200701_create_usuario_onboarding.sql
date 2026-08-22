-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Tabela para tracking do onboarding de usuários
CREATE TABLE usuario_onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  
  -- Checklist inicial (obrigatório)
  senha_alterada BOOLEAN DEFAULT false,
  foto_uploaded BOOLEAN DEFAULT false,
  perfil_completo BOOLEAN DEFAULT false,
  checklist_completo BOOLEAN DEFAULT false,
  
  -- Tours por página (automático)
  tour_dashboard BOOLEAN DEFAULT false,
  tour_alunos BOOLEAN DEFAULT false,
  tour_comercial BOOLEAN DEFAULT false,
  tour_professores BOOLEAN DEFAULT false,
  tour_salas BOOLEAN DEFAULT false,
  tour_metas BOOLEAN DEFAULT false,
  tour_projetos BOOLEAN DEFAULT false,
  tour_administrativo BOOLEAN DEFAULT false,
  tour_config BOOLEAN DEFAULT false,
  
  -- Metadados
  primeiro_acesso_em TIMESTAMP DEFAULT now(),
  ultimo_tour_em TIMESTAMP,
  tours_completados INT DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  UNIQUE(usuario_id)
);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_onboarding_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_usuario_onboarding_updated_at
  BEFORE UPDATE ON usuario_onboarding
  FOR EACH ROW
  EXECUTE FUNCTION update_onboarding_updated_at();

-- RLS
ALTER TABLE usuario_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver seu próprio onboarding"
  ON usuario_onboarding
  FOR SELECT
  USING (usuario_id IN (
    SELECT id FROM usuarios WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Usuários podem atualizar seu próprio onboarding"
  ON usuario_onboarding
  FOR UPDATE
  USING (usuario_id IN (
    SELECT id FROM usuarios WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Sistema pode inserir onboarding"
  ON usuario_onboarding
  FOR INSERT
  WITH CHECK (usuario_id IN (
    SELECT id FROM usuarios WHERE auth_user_id = auth.uid()
  ));

-- Índice para performance
CREATE INDEX idx_usuario_onboarding_usuario_id ON usuario_onboarding(usuario_id);

-- Comentários
COMMENT ON TABLE usuario_onboarding IS 'Tracking do progresso de onboarding de cada usuário';
COMMENT ON COLUMN usuario_onboarding.checklist_completo IS 'True quando todas as tarefas obrigatórias do primeiro acesso foram concluídas';
