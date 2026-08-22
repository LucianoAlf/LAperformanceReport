-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Criar tabela metas_kpi com estrutura flexível (tipo + valor)
CREATE TABLE IF NOT EXISTS metas_kpi (
  id SERIAL PRIMARY KEY,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  unidade_id UUID REFERENCES unidades(id),
  tipo VARCHAR(50) NOT NULL,
  valor DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ano, mes, unidade_id, tipo)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_metas_kpi_ano ON metas_kpi(ano);
CREATE INDEX IF NOT EXISTS idx_metas_kpi_unidade ON metas_kpi(unidade_id);
CREATE INDEX IF NOT EXISTS idx_metas_kpi_tipo ON metas_kpi(tipo);
CREATE INDEX IF NOT EXISTS idx_metas_kpi_ano_mes ON metas_kpi(ano, mes);

-- Habilitar RLS
ALTER TABLE metas_kpi ENABLE ROW LEVEL SECURITY;

-- Política para leitura (todos autenticados podem ler)
CREATE POLICY "Authenticated users can read metas_kpi" ON metas_kpi
  FOR SELECT TO authenticated USING (true);

-- Política para inserção (todos autenticados podem inserir)
CREATE POLICY "Authenticated users can insert metas_kpi" ON metas_kpi
  FOR INSERT TO authenticated WITH CHECK (true);

-- Política para atualização (todos autenticados podem atualizar)
CREATE POLICY "Authenticated users can update metas_kpi" ON metas_kpi
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Política para deleção (todos autenticados podem deletar)
CREATE POLICY "Authenticated users can delete metas_kpi" ON metas_kpi
  FOR DELETE TO authenticated USING (true);
