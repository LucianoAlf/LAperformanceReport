-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Configuração de pesos do Health Score de Professores
-- Segue o mesmo padrão de config_health_score_aluno
CREATE TABLE IF NOT EXISTS config_health_score_professor (
  id SERIAL PRIMARY KEY,
  unidade_id UUID REFERENCES unidades(id) ON DELETE CASCADE,
  -- Pesos dos fatores (total = 100%)
  peso_taxa_crescimento INTEGER DEFAULT 15,
  peso_media_turma INTEGER DEFAULT 20,
  peso_retencao INTEGER DEFAULT 25,
  peso_conversao INTEGER DEFAULT 15,
  peso_presenca INTEGER DEFAULT 15,
  peso_evasoes INTEGER DEFAULT 10,
  -- Limites de classificação
  limite_saudavel INTEGER DEFAULT 70,
  limite_atencao INTEGER DEFAULT 50,
  -- Auditoria
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT config_health_prof_unidade_unique UNIQUE(unidade_id),
  
  CONSTRAINT pesos_professor_somam_100 CHECK (
    peso_taxa_crescimento + peso_media_turma + peso_retencao + 
    peso_conversao + peso_presenca + peso_evasoes = 100
  )
);

-- Insert global default row (unidade_id = NULL)
INSERT INTO config_health_score_professor (
  unidade_id, peso_taxa_crescimento, peso_media_turma, 
  peso_retencao, peso_conversao, peso_presenca, peso_evasoes,
  limite_saudavel, limite_atencao
) VALUES (NULL, 15, 20, 25, 15, 15, 10, 70, 50)
ON CONFLICT ON CONSTRAINT config_health_prof_unidade_unique DO NOTHING;

COMMENT ON TABLE config_health_score_professor IS 
  'Configuração de pesos do Health Score de Professores - ajustável por unidade';

-- RLS
ALTER TABLE config_health_score_professor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read professor health config" 
  ON config_health_score_professor
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage professor health config" 
  ON config_health_score_professor
  FOR ALL USING (auth.role() = 'authenticated');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_config_health_score_professor_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_config_health_score_professor
  BEFORE UPDATE ON config_health_score_professor
  FOR EACH ROW
  EXECUTE FUNCTION update_config_health_score_professor_updated_at();
