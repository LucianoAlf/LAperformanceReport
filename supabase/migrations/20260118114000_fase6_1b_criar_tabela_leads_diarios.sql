-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- =====================================================
-- TABELA: leads_diarios
-- Dados agregados do comercial (Hunters)
-- Ex: "Hoje vieram 5 leads do Instagram interessados em Violão"
-- =====================================================

CREATE TABLE leads_diarios (
  id SERIAL PRIMARY KEY,
  unidade_id UUID REFERENCES unidades(id) NOT NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo VARCHAR(50) NOT NULL CHECK (tipo IN (
    'lead',
    'experimental_agendada',
    'experimental_realizada',
    'experimental_faltou',
    'visita_escola',
    'matricula'
  )),
  canal_origem_id INTEGER REFERENCES canais_origem(id),
  curso_id INTEGER REFERENCES cursos(id),
  quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  observacoes TEXT,
  -- Campos extras para matrícula (preenchidos quando tipo = 'matricula')
  aluno_nome VARCHAR(255),
  aluno_idade INTEGER,
  professor_experimental_id INTEGER REFERENCES professores(id),
  professor_fixo_id INTEGER REFERENCES professores(id),
  agente_comercial VARCHAR(255),
  valor_passaporte NUMERIC(10,2),
  valor_parcela NUMERIC(10,2),
  forma_pagamento_id INTEGER REFERENCES formas_pagamento(id),
  tipo_matricula VARCHAR(20) CHECK (tipo_matricula IN ('EMLA', 'LAMK')),
  aluno_novo_retorno VARCHAR(20) CHECK (aluno_novo_retorno IN ('novo', 'retorno')),
  -- Metadados
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by INTEGER REFERENCES usuarios(id)
);

-- Comentário da tabela
COMMENT ON TABLE leads_diarios IS 'Dados agregados do comercial (Hunters). Leads, experimentais e visitas são agregados por quantidade. Matrículas são individuais com dados completos.';

-- Índices para performance
CREATE INDEX idx_leads_diarios_unidade ON leads_diarios(unidade_id);
CREATE INDEX idx_leads_diarios_data ON leads_diarios(data);
CREATE INDEX idx_leads_diarios_tipo ON leads_diarios(tipo);
CREATE INDEX idx_leads_diarios_canal ON leads_diarios(canal_origem_id);
CREATE INDEX idx_leads_diarios_curso ON leads_diarios(curso_id);
CREATE INDEX idx_leads_diarios_unidade_data ON leads_diarios(unidade_id, data);

-- RLS (Row Level Security)
ALTER TABLE leads_diarios ENABLE ROW LEVEL SECURITY;

-- Políticas usando auth_user_id
CREATE POLICY "leads_diarios_select" ON leads_diarios
FOR SELECT USING (
  EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin')
  OR
  unidade_id IN (SELECT unidade_id FROM usuarios WHERE auth_user_id = auth.uid())
);

CREATE POLICY "leads_diarios_insert" ON leads_diarios
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin')
  OR
  unidade_id IN (SELECT unidade_id FROM usuarios WHERE auth_user_id = auth.uid())
);

CREATE POLICY "leads_diarios_update" ON leads_diarios
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin')
  OR
  unidade_id IN (SELECT unidade_id FROM usuarios WHERE auth_user_id = auth.uid())
);

CREATE POLICY "leads_diarios_delete" ON leads_diarios
FOR DELETE USING (
  EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin')
);

-- Trigger para updated_at
CREATE TRIGGER set_updated_at_leads_diarios
  BEFORE UPDATE ON leads_diarios
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
