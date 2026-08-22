-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================
-- FASE 3: TABELA DE MOVIMENTAÇÕES
-- ============================================

-- Tabela principal de movimentações
CREATE TABLE IF NOT EXISTS movimentacoes (
    id SERIAL PRIMARY KEY,
    
    -- Relacionamentos
    aluno_id INTEGER REFERENCES alunos(id),
    unidade_id UUID REFERENCES unidades(id) NOT NULL,
    curso_id INTEGER REFERENCES cursos(id),
    professor_id INTEGER REFERENCES professores(id),
    
    -- Tipo de movimentação com CHECK constraint
    tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('matricula', 'renovacao', 'evasao', 'transferencia', 'troca_curso', 'troca_professor')),
    
    -- Datas
    data_movimentacao DATE NOT NULL DEFAULT CURRENT_DATE,
    data_referencia DATE, -- Mês/ano de referência (ex: competência)
    
    -- Para evasões
    motivo_saida_id INTEGER REFERENCES motivos_saida(id),
    tipo_saida_id INTEGER REFERENCES tipos_saida(id),
    
    -- Para transferências e trocas
    unidade_origem_id UUID REFERENCES unidades(id),
    unidade_destino_id UUID REFERENCES unidades(id),
    curso_anterior_id INTEGER REFERENCES cursos(id),
    professor_anterior_id INTEGER REFERENCES professores(id),
    
    -- Valores
    valor_mensalidade NUMERIC(10,2),
    
    -- Canal de origem (para matrículas)
    canal_origem_id INTEGER REFERENCES canais_origem(id),
    
    -- Observações
    observacoes TEXT,
    
    -- Auditoria
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100)
);

-- Trigger para updated_at
CREATE TRIGGER update_movimentacoes_updated_at
    BEFORE UPDATE ON movimentacoes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Índices para performance
CREATE INDEX idx_movimentacoes_aluno ON movimentacoes(aluno_id);
CREATE INDEX idx_movimentacoes_unidade ON movimentacoes(unidade_id);
CREATE INDEX idx_movimentacoes_tipo ON movimentacoes(tipo);
CREATE INDEX idx_movimentacoes_data ON movimentacoes(data_movimentacao);
CREATE INDEX idx_movimentacoes_data_ref ON movimentacoes(data_referencia);
CREATE INDEX idx_movimentacoes_mes_ano ON movimentacoes(EXTRACT(YEAR FROM data_movimentacao), EXTRACT(MONTH FROM data_movimentacao));
CREATE INDEX idx_movimentacoes_unidade_data_tipo ON movimentacoes(unidade_id, data_movimentacao, tipo);

-- Comentários
COMMENT ON TABLE movimentacoes IS 'Registro de todas as movimentações de alunos: matrículas, renovações, evasões, transferências, trocas de curso/professor.';
COMMENT ON COLUMN movimentacoes.tipo IS 'Tipos válidos: matricula, renovacao, evasao, transferencia, troca_curso, troca_professor';
COMMENT ON COLUMN movimentacoes.data_referencia IS 'Mês/ano de competência da movimentação (para relatórios mensais)';
