-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Tabela de pendências por sala (inventário)
-- Pedido do Rafinha: aba de pendências mostrando o que falta/precisa comprar/resolver
CREATE TABLE inventario_pendencias (
  id              SERIAL PRIMARY KEY,
  sala_id         INT NOT NULL REFERENCES salas(id),
  unidade_id      UUID NOT NULL REFERENCES unidades(id),
  
  -- O que precisa
  titulo          VARCHAR(200) NOT NULL,              -- "Fone abafador", "Cabo P10 3m", "Trocar espelho"
  descricao       TEXT,                                -- detalhes adicionais
  categoria       VARCHAR(50) DEFAULT 'compra',        -- 'compra', 'reposicao', 'reparo', 'melhoria'
  
  -- Prioridade (Rafinha pediu 3 níveis)
  prioridade      VARCHAR(20) NOT NULL DEFAULT 'importante'
                  CHECK (prioridade IN ('urgente', 'importante', 'futuramente')),
  
  -- Status
  status          VARCHAR(20) NOT NULL DEFAULT 'aberta'
                  CHECK (status IN ('aberta', 'em_andamento', 'concluida', 'cancelada')),
  
  -- Quem pediu e quando
  solicitante     VARCHAR(100),                        -- nome de quem reportou (via TOM/PWA)
  created_via     TEXT,                                -- "via TOM por Rafinha" / "via PWA por Quintela"
  
  -- Resolução
  resolvido_em    TIMESTAMPTZ,
  resolvido_por   VARCHAR(100),
  resolucao_obs   TEXT,                                -- "Comprei no ML, NF 12345"
  
  -- Item vinculado (opcional — quando a pendência gera um item novo no inventário)
  item_vinculado_id INT REFERENCES inventario(id),
  
  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_pendencias_sala ON inventario_pendencias (sala_id, status);
CREATE INDEX idx_pendencias_unidade ON inventario_pendencias (unidade_id, status);
CREATE INDEX idx_pendencias_prioridade ON inventario_pendencias (prioridade, status);

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION update_pendencias_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pendencias_updated_at
  BEFORE UPDATE ON inventario_pendencias
  FOR EACH ROW EXECUTE FUNCTION update_pendencias_updated_at();

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE inventario_pendencias;
