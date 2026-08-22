-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- =====================================================
-- TABELA: evasoes_v2
-- Evasões com estrutura correta (FKs em vez de texto)
-- =====================================================

CREATE TABLE evasoes_v2 (
  id SERIAL PRIMARY KEY,
  aluno_id INTEGER REFERENCES alunos(id),
  unidade_id UUID REFERENCES unidades(id) NOT NULL,
  data_evasao DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo_saida_id INTEGER REFERENCES tipos_saida(id) NOT NULL,
  motivo_saida_id INTEGER REFERENCES motivos_saida(id),
  professor_id INTEGER REFERENCES professores(id),
  valor_parcela NUMERIC(10,2),
  situacao_pagamento VARCHAR(20) DEFAULT 'em_dia' CHECK (situacao_pagamento IN ('em_dia', 'inadimplente')),
  data_prevista_saida DATE, -- Para avisos prévios (mês que vai sair)
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by INTEGER REFERENCES usuarios(id)
);

-- Comentário da tabela
COMMENT ON TABLE evasoes_v2 IS 'Evasões 2026+ com estrutura correta (FKs). Tabela evasoes original mantida como histórico 2025.';

-- Índices para performance
CREATE INDEX idx_evasoes_v2_unidade ON evasoes_v2(unidade_id);
CREATE INDEX idx_evasoes_v2_data ON evasoes_v2(data_evasao);
CREATE INDEX idx_evasoes_v2_tipo ON evasoes_v2(tipo_saida_id);
CREATE INDEX idx_evasoes_v2_aluno ON evasoes_v2(aluno_id);
CREATE INDEX idx_evasoes_v2_professor ON evasoes_v2(professor_id);

-- RLS (Row Level Security)
ALTER TABLE evasoes_v2 ENABLE ROW LEVEL SECURITY;

-- Política corrigida usando auth_user_id
CREATE POLICY "evasoes_v2_select" ON evasoes_v2
FOR SELECT USING (
  EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin')
  OR
  unidade_id IN (SELECT unidade_id FROM usuarios WHERE auth_user_id = auth.uid())
);

CREATE POLICY "evasoes_v2_insert" ON evasoes_v2
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin')
  OR
  unidade_id IN (SELECT unidade_id FROM usuarios WHERE auth_user_id = auth.uid())
);

CREATE POLICY "evasoes_v2_update" ON evasoes_v2
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin')
  OR
  unidade_id IN (SELECT unidade_id FROM usuarios WHERE auth_user_id = auth.uid())
);

CREATE POLICY "evasoes_v2_delete" ON evasoes_v2
FOR DELETE USING (
  EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin')
);

-- Trigger para updated_at
CREATE TRIGGER set_updated_at_evasoes_v2
  BEFORE UPDATE ON evasoes_v2
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
