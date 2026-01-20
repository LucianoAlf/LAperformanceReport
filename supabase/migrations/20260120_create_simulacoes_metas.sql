-- Migration: Criar tabela simulacoes_metas
-- Data: 2026-01-20
-- Descrição: Tabela para salvar simulações/cenários de metas
-- Atualizado: Suporte a modo MRR/Faturamento

CREATE TABLE IF NOT EXISTS simulacoes_metas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificação
  unidade_id TEXT NOT NULL,
  ano INTEGER NOT NULL,
  nome TEXT NOT NULL DEFAULT 'Cenário Principal',
  descricao TEXT,
  
  -- Tipo de objetivo (alunos ou mrr)
  tipo_objetivo TEXT DEFAULT 'alunos',
  tipo_meta_financeira TEXT DEFAULT 'mensal',
  
  -- Inputs do usuário (editáveis)
  alunos_atual INTEGER NOT NULL,
  alunos_objetivo INTEGER NOT NULL,
  mes_objetivo INTEGER DEFAULT 12,
  mrr_objetivo NUMERIC(12,2) DEFAULT 0,
  churn_projetado NUMERIC(5,2) NOT NULL,
  ticket_medio NUMERIC(10,2) NOT NULL,
  taxa_lead_exp NUMERIC(5,2) NOT NULL,
  taxa_exp_mat NUMERIC(5,2) NOT NULL,
  inadimplencia_pct NUMERIC(5,2) DEFAULT 3,
  
  -- Outputs calculados (salvos para histórico)
  evasoes_mensais INTEGER,
  matriculas_mensais INTEGER,
  experimentais_mensais INTEGER,
  leads_mensais INTEGER,
  mrr_projetado NUMERIC(12,2),
  faturamento_anual NUMERIC(14,2),
  ltv_projetado NUMERIC(10,2),
  
  -- Alertas gerados (JSON)
  alertas JSONB DEFAULT '[]',
  score_viabilidade INTEGER DEFAULT 0,
  
  -- Metadados
  criado_por UUID,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  aplicado_em TIMESTAMP WITH TIME ZONE,
  
  -- Constraint para evitar duplicatas
  UNIQUE(unidade_id, ano, nome)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_simulacoes_unidade_ano ON simulacoes_metas(unidade_id, ano);
CREATE INDEX IF NOT EXISTS idx_simulacoes_criado_em ON simulacoes_metas(criado_em DESC);

-- RLS
ALTER TABLE simulacoes_metas ENABLE ROW LEVEL SECURITY;

-- Políticas
DROP POLICY IF EXISTS "Usuários autenticados podem ver simulações" ON simulacoes_metas;
CREATE POLICY "Usuários autenticados podem ver simulações"
  ON simulacoes_metas FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Usuários autenticados podem criar simulações" ON simulacoes_metas;
CREATE POLICY "Usuários autenticados podem criar simulações"
  ON simulacoes_metas FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Usuários autenticados podem atualizar simulações" ON simulacoes_metas;
CREATE POLICY "Usuários autenticados podem atualizar simulações"
  ON simulacoes_metas FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Usuários autenticados podem deletar simulações" ON simulacoes_metas;
CREATE POLICY "Usuários autenticados podem deletar simulações"
  ON simulacoes_metas FOR DELETE TO authenticated USING (true);

-- Trigger para atualizar timestamp
CREATE OR REPLACE FUNCTION update_simulacoes_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_simulacoes_timestamp ON simulacoes_metas;
CREATE TRIGGER trigger_update_simulacoes_timestamp
  BEFORE UPDATE ON simulacoes_metas
  FOR EACH ROW
  EXECUTE FUNCTION update_simulacoes_timestamp();
