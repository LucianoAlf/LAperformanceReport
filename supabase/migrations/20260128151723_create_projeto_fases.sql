-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Tabela de Fases do Projeto (instanciadas a partir do template)
CREATE TABLE IF NOT EXISTS projeto_fases (
    id SERIAL PRIMARY KEY,
    projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    ordem INTEGER NOT NULL DEFAULT 1,
    
    -- Datas da fase (opcionais, podem ser definidas depois)
    data_inicio DATE,
    data_fim DATE,
    
    -- Status da fase
    status VARCHAR(20) NOT NULL DEFAULT 'pendente' 
        CHECK (status IN ('pendente', 'em_andamento', 'concluida', 'cancelada')),
    
    -- Auditoria
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Constraint de datas
    CONSTRAINT projeto_fases_datas_validas CHECK (data_fim IS NULL OR data_inicio IS NULL OR data_fim >= data_inicio)
);

-- Comentário da tabela
COMMENT ON TABLE projeto_fases IS 'Fases de cada projeto (Planejamento, Divulgação, Preparação, etc.)';

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_projeto_fases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_projeto_fases_updated_at
    BEFORE UPDATE ON projeto_fases
    FOR EACH ROW
    EXECUTE FUNCTION update_projeto_fases_updated_at();

-- Índices para performance
CREATE INDEX idx_projeto_fases_projeto ON projeto_fases(projeto_id);
CREATE INDEX idx_projeto_fases_status ON projeto_fases(status);
CREATE INDEX idx_projeto_fases_ordem ON projeto_fases(projeto_id, ordem);

-- Habilitar RLS
ALTER TABLE projeto_fases ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "projeto_fases_select_policy" ON projeto_fases
    FOR SELECT USING (true);

CREATE POLICY "projeto_fases_insert_policy" ON projeto_fases
    FOR INSERT WITH CHECK (true);

CREATE POLICY "projeto_fases_update_policy" ON projeto_fases
    FOR UPDATE USING (true);

CREATE POLICY "projeto_fases_delete_policy" ON projeto_fases
    FOR DELETE USING (true);
