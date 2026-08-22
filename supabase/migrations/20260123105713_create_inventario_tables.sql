-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Tabela principal de inventário
CREATE TABLE inventario (
  id SERIAL PRIMARY KEY,
  codigo_patrimonio VARCHAR(50) UNIQUE,  -- Código único de patrimônio (ex: LA-BAR-001)
  sala_id INTEGER REFERENCES salas(id),
  unidade_id UUID REFERENCES unidades(id),
  
  -- Identificação do Item
  nome VARCHAR(255) NOT NULL,
  categoria VARCHAR(100),
  marca VARCHAR(100),
  modelo VARCHAR(100),
  numero_serie VARCHAR(100),
  
  -- Financeiro
  valor_compra DECIMAL(10,2),
  data_compra DATE,
  nota_fiscal VARCHAR(100),
  fornecedor VARCHAR(255),
  
  -- Depreciação e Vida Útil
  vida_util_meses INTEGER DEFAULT 60,
  valor_residual DECIMAL(10,2),
  
  -- Status e Condição
  status VARCHAR(50) DEFAULT 'ativo',
  condicao VARCHAR(50) DEFAULT 'bom',
  
  -- Controle
  quantidade INTEGER DEFAULT 1,
  observacoes TEXT,
  foto_url VARCHAR(500),
  
  -- Alertas
  proxima_revisao DATE,
  alerta_revisao_dias INTEGER DEFAULT 30,
  
  -- Auditoria
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  ativo BOOLEAN DEFAULT true
);

-- Tabela de manutenções
CREATE TABLE inventario_manutencoes (
  id SERIAL PRIMARY KEY,
  item_id INTEGER REFERENCES inventario(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL,  -- preventiva, corretiva, limpeza
  descricao TEXT,
  custo DECIMAL(10,2),
  data_manutencao DATE NOT NULL,
  data_proxima_revisao DATE,
  responsavel VARCHAR(255),
  fornecedor_servico VARCHAR(255),
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Tabela de movimentações (histórico)
CREATE TABLE inventario_movimentacoes (
  id SERIAL PRIMARY KEY,
  item_id INTEGER REFERENCES inventario(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL,  -- entrada, saida, transferencia, baixa
  sala_origem_id INTEGER REFERENCES salas(id),
  sala_destino_id INTEGER REFERENCES salas(id),
  motivo TEXT,
  data_movimentacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  usuario_id UUID REFERENCES auth.users(id)
);

-- Índices para performance
CREATE INDEX idx_inventario_sala ON inventario(sala_id);
CREATE INDEX idx_inventario_unidade ON inventario(unidade_id);
CREATE INDEX idx_inventario_categoria ON inventario(categoria);
CREATE INDEX idx_inventario_status ON inventario(status);
CREATE INDEX idx_inventario_proxima_revisao ON inventario(proxima_revisao);
CREATE INDEX idx_manutencoes_item ON inventario_manutencoes(item_id);
CREATE INDEX idx_movimentacoes_item ON inventario_movimentacoes(item_id);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_inventario_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_inventario_updated_at
  BEFORE UPDATE ON inventario
  FOR EACH ROW
  EXECUTE FUNCTION update_inventario_updated_at();
