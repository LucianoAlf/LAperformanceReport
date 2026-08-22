-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================
-- FASE 4.5B: CRIAR TABELA LEADS
-- Funil comercial completo
-- ============================================

CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    
    -- Dados do lead
    nome VARCHAR(255),
    telefone VARCHAR(20),
    whatsapp VARCHAR(20),
    email VARCHAR(255),
    idade INTEGER,
    
    -- Relacionamentos
    unidade_id UUID REFERENCES unidades(id) NOT NULL,
    curso_interesse_id INTEGER REFERENCES cursos(id),
    canal_origem_id INTEGER REFERENCES canais_origem(id),
    
    -- Datas
    data_contato DATE NOT NULL DEFAULT CURRENT_DATE,
    data_primeiro_contato TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_ultimo_contato TIMESTAMP WITH TIME ZONE,
    
    -- Status do lead
    status VARCHAR(50) NOT NULL DEFAULT 'novo' 
        CHECK (status IN ('novo', 'em_contato', 'agendado', 'realizado', 'convertido', 'arquivado', 'perdido')),
    motivo_arquivamento VARCHAR(255),
    
    -- Experimental
    experimental_agendada BOOLEAN DEFAULT FALSE,
    data_experimental DATE,
    horario_experimental TIME,
    professor_experimental_id INTEGER REFERENCES professores(id),
    experimental_realizada BOOLEAN DEFAULT FALSE,
    faltou_experimental BOOLEAN DEFAULT FALSE,
    
    -- Conversão
    converteu BOOLEAN DEFAULT FALSE,
    data_conversao DATE,
    aluno_id INTEGER REFERENCES alunos(id),
    motivo_nao_matricula TEXT,
    
    -- Responsável
    agente_comercial VARCHAR(100),
    
    -- Observações
    observacoes TEXT,
    
    -- Auditoria
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by INTEGER REFERENCES usuarios(id)
);

-- Trigger para updated_at
CREATE TRIGGER update_leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Índices
CREATE INDEX idx_leads_unidade ON leads(unidade_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_data_contato ON leads(data_contato);
CREATE INDEX idx_leads_canal ON leads(canal_origem_id);
CREATE INDEX idx_leads_curso ON leads(curso_interesse_id);
CREATE INDEX idx_leads_converteu ON leads(converteu);
CREATE INDEX idx_leads_mes ON leads(EXTRACT(YEAR FROM data_contato), EXTRACT(MONTH FROM data_contato));

-- Comentários
COMMENT ON TABLE leads IS 'Leads comerciais - do primeiro contato até a conversão ou arquivamento';
COMMENT ON COLUMN leads.status IS 'Funil: novo → em_contato → agendado → realizado → convertido/arquivado/perdido';
