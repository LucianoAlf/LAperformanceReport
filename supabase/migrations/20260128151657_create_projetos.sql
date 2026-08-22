-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Tabela principal de Projetos
CREATE TABLE IF NOT EXISTS projetos (
    id SERIAL PRIMARY KEY,
    tipo_id INTEGER NOT NULL REFERENCES projeto_tipos(id) ON DELETE RESTRICT,
    nome VARCHAR(200) NOT NULL,
    descricao TEXT,
    
    -- Responsável principal (pode ser usuario ou professor)
    responsavel_tipo VARCHAR(20) NOT NULL CHECK (responsavel_tipo IN ('usuario', 'professor')),
    responsavel_id INTEGER NOT NULL,
    
    -- Unidade (NULL = todas as unidades)
    unidade_id UUID REFERENCES unidades(id) ON DELETE SET NULL,
    
    -- Datas
    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,
    
    -- Status e prioridade
    status VARCHAR(20) NOT NULL DEFAULT 'planejamento' 
        CHECK (status IN ('planejamento', 'em_andamento', 'revisao', 'concluido', 'pausado', 'cancelado')),
    prioridade VARCHAR(10) NOT NULL DEFAULT 'normal' 
        CHECK (prioridade IN ('normal', 'alta', 'urgente')),
    
    -- Orçamento (opcional)
    orcamento DECIMAL(12,2),
    
    -- Controle de arquivamento
    arquivado BOOLEAN NOT NULL DEFAULT false,
    
    -- Auditoria
    created_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Constraint de datas
    CONSTRAINT projetos_datas_validas CHECK (data_fim >= data_inicio)
);

-- Comentário da tabela
COMMENT ON TABLE projetos IS 'Projetos pedagógicos da escola (Semanas Temáticas, Recitais, Shows, etc.)';

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_projetos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_projetos_updated_at
    BEFORE UPDATE ON projetos
    FOR EACH ROW
    EXECUTE FUNCTION update_projetos_updated_at();

-- Índices para performance
CREATE INDEX idx_projetos_status ON projetos(status);
CREATE INDEX idx_projetos_responsavel ON projetos(responsavel_tipo, responsavel_id);
CREATE INDEX idx_projetos_tipo ON projetos(tipo_id);
CREATE INDEX idx_projetos_unidade ON projetos(unidade_id);
CREATE INDEX idx_projetos_data_fim ON projetos(data_fim);
CREATE INDEX idx_projetos_arquivado ON projetos(arquivado);

-- Habilitar RLS
ALTER TABLE projetos ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "projetos_select_policy" ON projetos
    FOR SELECT USING (true);

CREATE POLICY "projetos_insert_policy" ON projetos
    FOR INSERT WITH CHECK (true);

CREATE POLICY "projetos_update_policy" ON projetos
    FOR UPDATE USING (true);

CREATE POLICY "projetos_delete_policy" ON projetos
    FOR DELETE USING (true);
