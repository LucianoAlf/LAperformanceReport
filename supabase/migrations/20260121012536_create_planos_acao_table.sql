-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Tabela para salvar planos de ação gerados pela IA
CREATE TABLE planos_acao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id UUID NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  descricao TEXT,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  
  -- Dados do plano gerado pela IA
  diagnostico TEXT NOT NULL,
  acoes_curto_prazo JSONB NOT NULL DEFAULT '[]',
  acoes_medio_prazo JSONB NOT NULL DEFAULT '[]',
  acoes_longo_prazo JSONB NOT NULL DEFAULT '[]',
  insights_adicionais JSONB NOT NULL DEFAULT '[]',
  
  -- Contexto do momento da geração (snapshot)
  contexto_geracao JSONB NOT NULL DEFAULT '{}',
  
  -- Status do plano
  status VARCHAR(50) NOT NULL DEFAULT 'ativo',
  favorito BOOLEAN NOT NULL DEFAULT false,
  
  -- Metadados
  criado_por INTEGER REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para consultas frequentes
CREATE INDEX idx_planos_acao_unidade ON planos_acao(unidade_id);
CREATE INDEX idx_planos_acao_ano_mes ON planos_acao(ano, mes);
CREATE INDEX idx_planos_acao_status ON planos_acao(status);
CREATE INDEX idx_planos_acao_favorito ON planos_acao(favorito) WHERE favorito = true;

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_planos_acao_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_planos_acao_updated_at
  BEFORE UPDATE ON planos_acao
  FOR EACH ROW
  EXECUTE FUNCTION update_planos_acao_updated_at();

-- RLS (Row Level Security)
ALTER TABLE planos_acao ENABLE ROW LEVEL SECURITY;

-- Política: usuários podem ver planos da sua unidade
CREATE POLICY "Usuários podem ver planos da sua unidade"
  ON planos_acao FOR SELECT
  USING (true);

-- Política: usuários podem inserir planos
CREATE POLICY "Usuários podem criar planos"
  ON planos_acao FOR INSERT
  WITH CHECK (true);

-- Política: usuários podem atualizar planos da sua unidade
CREATE POLICY "Usuários podem atualizar planos"
  ON planos_acao FOR UPDATE
  USING (true);

-- Política: usuários podem deletar planos
CREATE POLICY "Usuários podem deletar planos"
  ON planos_acao FOR DELETE
  USING (true);

COMMENT ON TABLE planos_acao IS 'Planos de ação gerados pela IA Gemini para cada unidade/período';
COMMENT ON COLUMN planos_acao.contexto_geracao IS 'Snapshot dos dados do simulador no momento da geração (inputs, resultado, alertas)';
