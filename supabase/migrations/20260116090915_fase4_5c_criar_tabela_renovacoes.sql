-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================
-- FASE 4.5C: CRIAR TABELA RENOVACOES
-- Histórico detalhado de renovações
-- ============================================

CREATE TABLE IF NOT EXISTS renovacoes (
    id SERIAL PRIMARY KEY,
    
    -- Relacionamentos
    aluno_id INTEGER REFERENCES alunos(id) NOT NULL,
    unidade_id UUID REFERENCES unidades(id) NOT NULL,
    
    -- Datas
    data_renovacao DATE NOT NULL DEFAULT CURRENT_DATE,
    data_fim_contrato_anterior DATE,
    data_inicio_novo_contrato DATE,
    data_fim_novo_contrato DATE,
    
    -- Valores
    valor_parcela_anterior NUMERIC(10,2),
    valor_parcela_novo NUMERIC(10,2),
    percentual_reajuste NUMERIC(5,2),
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'renovado' 
        CHECK (status IN ('renovado', 'nao_renovou', 'pendente', 'negociando')),
    
    -- Se não renovou
    motivo_nao_renovacao_id INTEGER REFERENCES motivos_saida(id),
    
    -- Responsável
    agente VARCHAR(100),
    
    -- Observações
    observacoes TEXT,
    
    -- Auditoria
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by INTEGER REFERENCES usuarios(id)
);

-- Trigger para updated_at
CREATE TRIGGER update_renovacoes_updated_at
    BEFORE UPDATE ON renovacoes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger para calcular percentual de reajuste automaticamente
CREATE OR REPLACE FUNCTION calcular_reajuste_renovacao()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.valor_parcela_anterior IS NOT NULL AND NEW.valor_parcela_anterior > 0 THEN
        NEW.percentual_reajuste := ROUND(
            ((NEW.valor_parcela_novo - NEW.valor_parcela_anterior) / NEW.valor_parcela_anterior) * 100, 
            2
        );
    ELSE
        NEW.percentual_reajuste := 0;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calcular_reajuste
    BEFORE INSERT OR UPDATE ON renovacoes
    FOR EACH ROW
    EXECUTE FUNCTION calcular_reajuste_renovacao();

-- Índices
CREATE INDEX idx_renovacoes_aluno ON renovacoes(aluno_id);
CREATE INDEX idx_renovacoes_unidade ON renovacoes(unidade_id);
CREATE INDEX idx_renovacoes_data ON renovacoes(data_renovacao);
CREATE INDEX idx_renovacoes_status ON renovacoes(status);
CREATE INDEX idx_renovacoes_mes ON renovacoes(EXTRACT(YEAR FROM data_renovacao), EXTRACT(MONTH FROM data_renovacao));

-- Comentário
COMMENT ON TABLE renovacoes IS 'Histórico de renovações de contrato com valores e reajustes';
