-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================
-- FASE 4.2: CRIAR NOVA TABELA METAS
-- Renomear índices antigos e criar nova tabela
-- ============================================

-- Renomear índices existentes para evitar conflito
ALTER INDEX idx_metas_unidade_ano RENAME TO idx_metas_legado_unidade_ano;
ALTER INDEX idx_metas_ano RENAME TO idx_metas_legado_ano;

-- Criar nova tabela metas
CREATE TABLE metas (
    id SERIAL PRIMARY KEY,
    
    -- Escopo
    unidade_id UUID REFERENCES unidades(id), -- NULL = meta da rede (consolidado)
    ano INTEGER NOT NULL CHECK (ano >= 2020 AND ano <= 2035),
    mes INTEGER CHECK (mes >= 1 AND mes <= 12), -- NULL = meta anual ou trimestral
    trimestre INTEGER CHECK (trimestre >= 1 AND trimestre <= 4), -- NULL = meta mensal ou anual
    
    -- Tipo de período
    tipo_periodo VARCHAR(20) NOT NULL DEFAULT 'mensal' 
        CHECK (tipo_periodo IN ('mensal', 'trimestral', 'anual')),
    
    -- METAS COMERCIAIS
    meta_leads INTEGER,
    meta_experimentais INTEGER,
    meta_matriculas INTEGER,
    meta_taxa_conversao_experimental NUMERIC(5,2),
    meta_taxa_conversao_lead NUMERIC(5,2),
    meta_faturamento_passaportes NUMERIC(12,2),
    
    -- METAS DE RETENÇÃO
    meta_renovacoes INTEGER,
    meta_taxa_renovacao NUMERIC(5,2),
    meta_churn_maximo NUMERIC(5,2),
    meta_evasoes_maximo INTEGER,
    meta_ltv_meses NUMERIC(5,1),
    
    -- METAS FINANCEIRAS
    meta_faturamento_parcelas NUMERIC(12,2),
    meta_ticket_medio NUMERIC(10,2),
    meta_inadimplencia_maxima NUMERIC(5,2),
    
    -- METAS DE ALUNOS
    meta_alunos_ativos INTEGER,
    meta_alunos_pagantes INTEGER,
    
    -- Status
    ativo BOOLEAN DEFAULT TRUE,
    
    -- Auditoria
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by INTEGER
);

-- Trigger para updated_at
CREATE TRIGGER update_metas_updated_at
    BEFORE UPDATE ON metas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Índices para performance
CREATE INDEX idx_metas_unidade ON metas(unidade_id);
CREATE INDEX idx_metas_ano ON metas(ano);
CREATE INDEX idx_metas_periodo ON metas(ano, mes, trimestre);
CREATE INDEX idx_metas_tipo_periodo ON metas(tipo_periodo);
CREATE UNIQUE INDEX idx_metas_unique ON metas(unidade_id, ano, COALESCE(mes, 0), COALESCE(trimestre, 0), tipo_periodo);

-- Comentários
COMMENT ON TABLE metas IS 'Metas e OKRs unificados por unidade - mensais, trimestrais e anuais.';
COMMENT ON COLUMN metas.unidade_id IS 'NULL = meta consolidada da rede';
COMMENT ON COLUMN metas.mes IS 'NULL para metas trimestrais ou anuais';
COMMENT ON COLUMN metas.trimestre IS 'NULL para metas mensais ou anuais';
