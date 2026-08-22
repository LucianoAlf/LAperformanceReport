-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Tabela de histórico para cálculo de LTV
CREATE TABLE IF NOT EXISTS alunos_historico (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    tempo_permanencia_meses INTEGER NOT NULL,
    categoria_saida VARCHAR(100),
    mes_saida VARCHAR(50),
    unidade_id UUID REFERENCES unidades(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger para updated_at
CREATE TRIGGER update_alunos_historico_updated_at
    BEFORE UPDATE ON alunos_historico
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Índices
CREATE INDEX idx_alunos_historico_unidade ON alunos_historico(unidade_id);
CREATE INDEX idx_alunos_historico_categoria ON alunos_historico(categoria_saida);
CREATE INDEX idx_alunos_historico_tempo ON alunos_historico(tempo_permanencia_meses);

-- Comentário
COMMENT ON TABLE alunos_historico IS 'Histórico de ex-alunos para cálculo de LTV (Tempo Médio de Permanência). Só inclui alunos com 4+ meses.';
