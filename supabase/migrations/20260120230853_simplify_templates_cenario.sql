-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Criar tabela para alunos objetivo por template e unidade
CREATE TABLE IF NOT EXISTS templates_cenario_unidade (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id TEXT NOT NULL REFERENCES templates_cenario(id) ON DELETE CASCADE,
  unidade_id UUID NOT NULL,
  alunos_objetivo INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(template_id, unidade_id)
);

-- RLS
ALTER TABLE templates_cenario_unidade ENABLE ROW LEVEL SECURITY;

-- Todos podem ler
CREATE POLICY "Authenticated users can read template unidade" ON templates_cenario_unidade
  FOR SELECT TO authenticated USING (true);

-- Apenas admins podem modificar
CREATE POLICY "Authenticated users can update template unidade" ON templates_cenario_unidade
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert template unidade" ON templates_cenario_unidade
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can delete template unidade" ON templates_cenario_unidade
  FOR DELETE TO authenticated USING (true);
