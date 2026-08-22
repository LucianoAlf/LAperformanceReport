-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Tabela para salvar insights gerados pela IA (comercial, administrativo, professores)
CREATE TABLE IF NOT EXISTS insights_salvos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL, -- 'comercial', 'administrativo', 'professor', 'turma', 'equipe', 'retencao'
  unidade_id UUID REFERENCES unidades(id) ON DELETE SET NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  dados JSONB NOT NULL, -- O JSON completo dos insights
  titulo VARCHAR(255), -- Título opcional para identificar
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_insights_salvos_user ON insights_salvos(user_id);
CREATE INDEX IF NOT EXISTS idx_insights_salvos_tipo ON insights_salvos(tipo);
CREATE INDEX IF NOT EXISTS idx_insights_salvos_unidade ON insights_salvos(unidade_id);
CREATE INDEX IF NOT EXISTS idx_insights_salvos_competencia ON insights_salvos(ano, mes);
CREATE INDEX IF NOT EXISTS idx_insights_salvos_created ON insights_salvos(created_at DESC);

-- RLS
ALTER TABLE insights_salvos ENABLE ROW LEVEL SECURITY;

-- Políticas - usuário só vê seus próprios insights
DROP POLICY IF EXISTS "Usuários veem seus insights" ON insights_salvos;
CREATE POLICY "Usuários veem seus insights"
  ON insights_salvos FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Usuários criam seus insights" ON insights_salvos;
CREATE POLICY "Usuários criam seus insights"
  ON insights_salvos FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Usuários atualizam seus insights" ON insights_salvos;
CREATE POLICY "Usuários atualizam seus insights"
  ON insights_salvos FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Usuários deletam seus insights" ON insights_salvos;
CREATE POLICY "Usuários deletam seus insights"
  ON insights_salvos FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Trigger para atualizar timestamp
CREATE OR REPLACE FUNCTION update_insights_salvos_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_insights_salvos_timestamp ON insights_salvos;
CREATE TRIGGER trigger_update_insights_salvos_timestamp
  BEFORE UPDATE ON insights_salvos
  FOR EACH ROW
  EXECUTE FUNCTION update_insights_salvos_timestamp();
