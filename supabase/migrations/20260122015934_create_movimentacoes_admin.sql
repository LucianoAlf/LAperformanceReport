-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Tabela de movimentações administrativas (renovações, avisos prévios, evasões)
CREATE TABLE IF NOT EXISTS movimentacoes_admin (
  id SERIAL PRIMARY KEY,
  unidade_id UUID REFERENCES unidades(id) NOT NULL,
  data DATE NOT NULL,
  
  -- Tipo: renovacao, nao_renovacao, aviso_previo, evasao
  tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('renovacao', 'nao_renovacao', 'aviso_previo', 'evasao')),
  
  -- Dados do aluno
  aluno_nome VARCHAR(255) NOT NULL,
  aluno_id INTEGER,
  
  -- Relacionamentos
  professor_id INTEGER,
  curso_id INTEGER,
  
  -- Valores (para renovação)
  valor_parcela_anterior DECIMAL(10,2),
  valor_parcela_novo DECIMAL(10,2),
  forma_pagamento_id INTEGER,
  
  -- Para aviso prévio
  mes_saida DATE,
  
  -- Para evasão
  tipo_evasao VARCHAR(50) CHECK (tipo_evasao IN ('interrompido', 'nao_renovou', 'interrompido_2_curso', 'interrompido_bolsista', 'interrompido_banda')),
  
  -- Comum
  motivo TEXT,
  observacoes TEXT,
  agente_comercial VARCHAR(100),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_movimentacoes_admin_unidade ON movimentacoes_admin(unidade_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_admin_data ON movimentacoes_admin(data);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_admin_tipo ON movimentacoes_admin(tipo);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_admin_mes_saida ON movimentacoes_admin(mes_saida);

-- Habilitar RLS
ALTER TABLE movimentacoes_admin ENABLE ROW LEVEL SECURITY;

-- Política de acesso (permitir tudo para usuários autenticados)
CREATE POLICY "Permitir acesso total para usuários autenticados" ON movimentacoes_admin
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Comentários
COMMENT ON TABLE movimentacoes_admin IS 'Tabela para registrar movimentações administrativas: renovações, não renovações, avisos prévios e evasões';
COMMENT ON COLUMN movimentacoes_admin.tipo IS 'Tipo da movimentação: renovacao, nao_renovacao, aviso_previo, evasao';
COMMENT ON COLUMN movimentacoes_admin.tipo_evasao IS 'Subtipo de evasão: interrompido, nao_renovou, interrompido_2_curso, interrompido_bolsista, interrompido_banda';
