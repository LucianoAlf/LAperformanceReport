-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Tabela de Equipe do Projeto (pessoas envolvidas)
CREATE TABLE IF NOT EXISTS projeto_equipe (
    id SERIAL PRIMARY KEY,
    projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
    
    -- Pessoa (pode ser usuario ou professor)
    pessoa_tipo VARCHAR(20) NOT NULL CHECK (pessoa_tipo IN ('usuario', 'professor')),
    pessoa_id INTEGER NOT NULL,
    
    -- Papel no projeto
    papel VARCHAR(50),
    
    -- Auditoria
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Evitar duplicatas
    CONSTRAINT projeto_equipe_unique UNIQUE (projeto_id, pessoa_tipo, pessoa_id)
);

-- Comentário da tabela
COMMENT ON TABLE projeto_equipe IS 'Pessoas envolvidas em cada projeto (coordenadores, assistentes, professores)';

-- Índices
CREATE INDEX idx_projeto_equipe_projeto ON projeto_equipe(projeto_id);
CREATE INDEX idx_projeto_equipe_pessoa ON projeto_equipe(pessoa_tipo, pessoa_id);

-- Habilitar RLS
ALTER TABLE projeto_equipe ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "projeto_equipe_select_policy" ON projeto_equipe
    FOR SELECT USING (true);

CREATE POLICY "projeto_equipe_insert_policy" ON projeto_equipe
    FOR INSERT WITH CHECK (true);

CREATE POLICY "projeto_equipe_update_policy" ON projeto_equipe
    FOR UPDATE USING (true);

CREATE POLICY "projeto_equipe_delete_policy" ON projeto_equipe
    FOR DELETE USING (true);
