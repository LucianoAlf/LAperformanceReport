-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Tabela de Tarefas do Projeto
CREATE TABLE IF NOT EXISTS projeto_tarefas (
    id SERIAL PRIMARY KEY,
    projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
    fase_id INTEGER REFERENCES projeto_fases(id) ON DELETE SET NULL,
    
    -- Subtarefas (auto-referência)
    tarefa_pai_id INTEGER REFERENCES projeto_tarefas(id) ON DELETE CASCADE,
    
    -- Dados da tarefa
    titulo VARCHAR(200) NOT NULL,
    descricao TEXT,
    
    -- Responsável (pode ser usuario ou professor)
    responsavel_tipo VARCHAR(20) CHECK (responsavel_tipo IN ('usuario', 'professor')),
    responsavel_id INTEGER,
    
    -- Prazo e status
    prazo DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'pendente' 
        CHECK (status IN ('pendente', 'em_andamento', 'concluida', 'cancelada')),
    prioridade VARCHAR(10) NOT NULL DEFAULT 'normal' 
        CHECK (prioridade IN ('normal', 'alta', 'urgente')),
    
    -- Dependência (tarefa que precisa ser concluída antes)
    dependencia_id INTEGER REFERENCES projeto_tarefas(id) ON DELETE SET NULL,
    
    -- Ordenação dentro da fase
    ordem INTEGER NOT NULL DEFAULT 1,
    
    -- Auditoria
    created_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- Comentário da tabela
COMMENT ON TABLE projeto_tarefas IS 'Tarefas e subtarefas dos projetos pedagógicos';

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_projeto_tarefas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    -- Se status mudou para concluida, registrar data de conclusão
    IF NEW.status = 'concluida' AND OLD.status != 'concluida' THEN
        NEW.completed_at = now();
    END IF;
    -- Se status saiu de concluida, limpar data de conclusão
    IF NEW.status != 'concluida' AND OLD.status = 'concluida' THEN
        NEW.completed_at = NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_projeto_tarefas_updated_at
    BEFORE UPDATE ON projeto_tarefas
    FOR EACH ROW
    EXECUTE FUNCTION update_projeto_tarefas_updated_at();

-- Índices para performance
CREATE INDEX idx_projeto_tarefas_projeto ON projeto_tarefas(projeto_id);
CREATE INDEX idx_projeto_tarefas_fase ON projeto_tarefas(fase_id);
CREATE INDEX idx_projeto_tarefas_pai ON projeto_tarefas(tarefa_pai_id);
CREATE INDEX idx_projeto_tarefas_status ON projeto_tarefas(status);
CREATE INDEX idx_projeto_tarefas_prazo ON projeto_tarefas(prazo);
CREATE INDEX idx_projeto_tarefas_responsavel ON projeto_tarefas(responsavel_tipo, responsavel_id);
CREATE INDEX idx_projeto_tarefas_dependencia ON projeto_tarefas(dependencia_id);

-- Habilitar RLS
ALTER TABLE projeto_tarefas ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "projeto_tarefas_select_policy" ON projeto_tarefas
    FOR SELECT USING (true);

CREATE POLICY "projeto_tarefas_insert_policy" ON projeto_tarefas
    FOR INSERT WITH CHECK (true);

CREATE POLICY "projeto_tarefas_update_policy" ON projeto_tarefas
    FOR UPDATE USING (true);

CREATE POLICY "projeto_tarefas_delete_policy" ON projeto_tarefas
    FOR DELETE USING (true);
