-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Tabela para salvar cenários de simulação de média de alunos por turma
CREATE TABLE IF NOT EXISTS simulacoes_turma (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  nome VARCHAR(255) NOT NULL DEFAULT 'Cenário Principal',
  descricao TEXT,
  
  -- Dados da simulação
  media_atual NUMERIC(4,2) NOT NULL,
  media_meta NUMERIC(4,2) NOT NULL,
  
  -- Cenário de escalonamento
  valor_base NUMERIC(10,2) NOT NULL,
  incremento NUMERIC(10,2) NOT NULL,
  
  -- Resultados calculados
  percentual_folha_atual NUMERIC(5,2),
  percentual_folha_meta NUMERIC(5,2),
  margem_atual NUMERIC(5,2),
  margem_meta NUMERIC(5,2),
  economia_mensal NUMERIC(12,2),
  economia_anual NUMERIC(12,2),
  
  -- Dados auxiliares
  total_alunos INTEGER,
  ticket_medio NUMERIC(10,2),
  mrr_total NUMERIC(12,2),
  
  -- Alertas e score
  alertas JSONB DEFAULT '[]'::jsonb,
  score_viabilidade INTEGER DEFAULT 0,
  
  -- Metadados
  aplicado_em TIMESTAMPTZ,
  criado_por UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_simulacoes_turma_unidade ON simulacoes_turma(unidade_id);
CREATE INDEX IF NOT EXISTS idx_simulacoes_turma_periodo ON simulacoes_turma(ano, mes);

-- RLS
ALTER TABLE simulacoes_turma ENABLE ROW LEVEL SECURITY;

-- Política para permitir leitura e escrita para usuários autenticados
CREATE POLICY "Permitir acesso total para usuários autenticados" ON simulacoes_turma
  FOR ALL USING (true) WITH CHECK (true);

-- Tabela para metas individuais de professores (professor_id é INTEGER)
CREATE TABLE IF NOT EXISTS metas_professor_turma (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id INTEGER NOT NULL REFERENCES professores(id),
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  
  -- Metas
  media_meta NUMERIC(4,2) NOT NULL,
  
  -- Dados atuais (snapshot)
  media_atual NUMERIC(4,2),
  total_alunos INTEGER,
  total_turmas INTEGER,
  
  -- Status
  atingida BOOLEAN DEFAULT false,
  data_atingida TIMESTAMPTZ,
  
  -- Metadados
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(professor_id, ano, mes)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_metas_professor_turma_professor ON metas_professor_turma(professor_id);
CREATE INDEX IF NOT EXISTS idx_metas_professor_turma_unidade ON metas_professor_turma(unidade_id);
CREATE INDEX IF NOT EXISTS idx_metas_professor_turma_periodo ON metas_professor_turma(ano, mes);

-- RLS
ALTER TABLE metas_professor_turma ENABLE ROW LEVEL SECURITY;

-- Política para permitir leitura e escrita para usuários autenticados
CREATE POLICY "Permitir acesso total para usuários autenticados" ON metas_professor_turma
  FOR ALL USING (true) WITH CHECK (true);
