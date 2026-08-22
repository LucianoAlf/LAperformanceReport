-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- 1. Criar tabela de histórico de pagamentos (snapshot mensal)
CREATE TABLE IF NOT EXISTS historico_pagamentos (
  id SERIAL PRIMARY KEY,
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes >= 1 AND mes <= 12),
  status_pagamento VARCHAR(50),
  valor_parcela NUMERIC(10, 2),
  dia_vencimento INTEGER,
  unidade_id UUID REFERENCES unidades(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(255),
  
  -- Constraint única: um registro por aluno por mês
  UNIQUE(aluno_id, ano, mes)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_historico_pagamentos_aluno ON historico_pagamentos(aluno_id);
CREATE INDEX IF NOT EXISTS idx_historico_pagamentos_ano_mes ON historico_pagamentos(ano, mes);
CREATE INDEX IF NOT EXISTS idx_historico_pagamentos_unidade ON historico_pagamentos(unidade_id);
CREATE INDEX IF NOT EXISTS idx_historico_pagamentos_status ON historico_pagamentos(status_pagamento);

-- 2. Adicionar campo dia_vencimento na tabela alunos
ALTER TABLE alunos 
ADD COLUMN IF NOT EXISTS dia_vencimento INTEGER DEFAULT 5 CHECK (dia_vencimento >= 1 AND dia_vencimento <= 31);

-- Comentários para documentação
COMMENT ON TABLE historico_pagamentos IS 'Histórico mensal de status de pagamento dos alunos (snapshot antes do reset)';
COMMENT ON COLUMN alunos.dia_vencimento IS 'Dia do mês em que vence a mensalidade do aluno (1-31)';
