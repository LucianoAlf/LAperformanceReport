-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Criar tabela de configuração do Health Score
CREATE TABLE IF NOT EXISTS config_health_score (
    id SERIAL PRIMARY KEY,
    unidade_id UUID REFERENCES unidades(id) ON DELETE CASCADE,
    
    -- Pesos dos fatores (devem somar 100)
    peso_taxa_crescimento INTEGER DEFAULT 15,
    peso_media_turma INTEGER DEFAULT 20,
    peso_retencao INTEGER DEFAULT 25,
    peso_conversao INTEGER DEFAULT 15,
    peso_presenca INTEGER DEFAULT 15,
    peso_evasoes INTEGER DEFAULT 10,
    
    -- Parâmetros
    meta_media_turma DECIMAL(3,1) DEFAULT 3.0,
    
    -- Faixas de classificação
    limite_saudavel INTEGER DEFAULT 70,
    limite_atencao INTEGER DEFAULT 50,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraint: pesos devem somar 100
    CONSTRAINT config_health_score_pesos_somam_100 CHECK (
        peso_taxa_crescimento + peso_media_turma + peso_retencao + 
        peso_conversao + peso_presenca + peso_evasoes = 100
    ),
    
    -- Unique: uma config por unidade (NULL = global)
    CONSTRAINT config_health_score_unidade_unique UNIQUE (unidade_id)
);

-- Comentário
COMMENT ON TABLE config_health_score IS 'Configuração dos pesos e limites do Health Score do Professor';

-- Inserir configuração global padrão
INSERT INTO config_health_score (unidade_id) VALUES (NULL)
ON CONFLICT (unidade_id) DO NOTHING;

-- Habilitar RLS
ALTER TABLE config_health_score ENABLE ROW LEVEL SECURITY;

-- Política de leitura para todos os usuários autenticados
CREATE POLICY "config_health_score_select_policy" ON config_health_score
    FOR SELECT TO authenticated USING (true);

-- Política de update apenas para admins (perfil = 'admin' ou 'super_admin')
CREATE POLICY "config_health_score_update_policy" ON config_health_score
    FOR UPDATE TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM usuarios u 
            WHERE u.auth_user_id = auth.uid() 
            AND u.perfil IN ('admin', 'super_admin')
        )
    );
