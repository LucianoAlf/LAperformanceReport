-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Template de Tarefas Padrão por Fase
CREATE TABLE IF NOT EXISTS projeto_tipo_tarefas_template (
    id SERIAL PRIMARY KEY,
    fase_template_id INTEGER NOT NULL REFERENCES projeto_tipo_fases_template(id) ON DELETE CASCADE,
    titulo VARCHAR(200) NOT NULL,
    ordem INTEGER NOT NULL DEFAULT 1,
    descricao TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comentário da tabela
COMMENT ON TABLE projeto_tipo_tarefas_template IS 'Tarefas padrão de cada fase do template';

-- Índices
CREATE INDEX idx_projeto_tipo_tarefas_template_fase ON projeto_tipo_tarefas_template(fase_template_id);
CREATE INDEX idx_projeto_tipo_tarefas_template_ordem ON projeto_tipo_tarefas_template(fase_template_id, ordem);

-- Habilitar RLS
ALTER TABLE projeto_tipo_tarefas_template ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "projeto_tipo_tarefas_template_select_policy" ON projeto_tipo_tarefas_template
    FOR SELECT USING (true);

CREATE POLICY "projeto_tipo_tarefas_template_insert_policy" ON projeto_tipo_tarefas_template
    FOR INSERT WITH CHECK (true);

CREATE POLICY "projeto_tipo_tarefas_template_update_policy" ON projeto_tipo_tarefas_template
    FOR UPDATE USING (true);

CREATE POLICY "projeto_tipo_tarefas_template_delete_policy" ON projeto_tipo_tarefas_template
    FOR DELETE USING (true);
