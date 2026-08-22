-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================
-- FASE 4.5D: CRIAR TABELA RELATORIOS_DIARIOS
-- Snapshot diário para histórico
-- ============================================

CREATE TABLE IF NOT EXISTS relatorios_diarios (
    id SERIAL PRIMARY KEY,
    
    -- Identificação
    unidade_id UUID REFERENCES unidades(id) NOT NULL,
    data_referencia DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- NÚMEROS GERAIS
    total_alunos_ativos INTEGER,
    total_alunos_pagantes INTEGER,
    total_bolsistas_integral INTEGER,
    total_bolsistas_parcial INTEGER,
    total_matriculas_ativas INTEGER,
    total_matriculas_banda INTEGER,
    total_matriculas_segundo_curso INTEGER,
    
    -- COMERCIAL DO DIA
    leads_novos_dia INTEGER DEFAULT 0,
    leads_acumulado_mes INTEGER,
    experimentais_agendadas_dia INTEGER DEFAULT 0,
    experimentais_realizadas_dia INTEGER DEFAULT 0,
    faltaram_experimental_dia INTEGER DEFAULT 0,
    matriculas_dia INTEGER DEFAULT 0,
    matriculas_acumulado_mes INTEGER,
    visitas_escola_dia INTEGER DEFAULT 0,
    
    -- RETENÇÃO DO DIA
    renovacoes_dia INTEGER DEFAULT 0,
    renovacoes_acumulado_mes INTEGER,
    nao_renovacoes_dia INTEGER DEFAULT 0,
    nao_renovacoes_acumulado_mes INTEGER,
    evasoes_dia INTEGER DEFAULT 0,
    evasoes_acumulado_mes INTEGER,
    avisos_previos_mes INTEGER,
    
    -- FINANCEIRO
    ticket_medio_atual NUMERIC(10,2),
    faturamento_previsto_mes NUMERIC(12,2),
    faturamento_realizado_mes NUMERIC(12,2),
    inadimplencia_valor NUMERIC(12,2),
    inadimplencia_percentual NUMERIC(5,2),
    
    -- MÉTRICAS CALCULADAS
    churn_rate_mes NUMERIC(5,2),
    taxa_renovacao_mes NUMERIC(5,2),
    taxa_conversao_experimental_mes NUMERIC(5,2),
    ltv_atual NUMERIC(5,1),
    
    -- Observações
    observacoes TEXT,
    
    -- Auditoria
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by INTEGER REFERENCES usuarios(id)
);

-- Índices
CREATE INDEX idx_relatorios_unidade ON relatorios_diarios(unidade_id);
CREATE INDEX idx_relatorios_data ON relatorios_diarios(data_referencia);
CREATE UNIQUE INDEX idx_relatorios_unique ON relatorios_diarios(unidade_id, data_referencia);

-- Comentário
COMMENT ON TABLE relatorios_diarios IS 'Snapshot diário dos números de cada unidade - histórico para análise';
