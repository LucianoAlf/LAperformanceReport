-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Tabela de Tipos de Projeto (cadastráveis)
CREATE TABLE IF NOT EXISTS projeto_tipos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    icone VARCHAR(10) NOT NULL DEFAULT '📁',
    cor VARCHAR(20) NOT NULL DEFAULT '#8b5cf6',
    descricao TEXT,
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comentário da tabela
COMMENT ON TABLE projeto_tipos IS 'Tipos de projeto cadastráveis (Semana Temática, Recital, Show de Banda, etc.)';

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_projeto_tipos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_projeto_tipos_updated_at
    BEFORE UPDATE ON projeto_tipos
    FOR EACH ROW
    EXECUTE FUNCTION update_projeto_tipos_updated_at();

-- Inserir tipos iniciais conforme briefing
INSERT INTO projeto_tipos (nome, icone, cor, descricao) VALUES
    ('Semana Temática', '🎉', '#8b5cf6', 'Eventos temáticos semanais com apresentações e atividades especiais'),
    ('Recital', '🎵', '#06b6d4', 'Apresentações musicais dos alunos para familiares e convidados'),
    ('Show de Banda', '🎸', '#ec4899', 'Apresentações de bandas formadas por alunos'),
    ('Material Didático', '📚', '#10b981', 'Produção e revisão de materiais de ensino'),
    ('Produção de Conteúdo', '📱', '#f59e0b', 'Criação de conteúdo para redes sociais e marketing'),
    ('Vídeo Aulas', '🎬', '#3b82f6', 'Gravação e edição de aulas em vídeo');

-- Habilitar RLS
ALTER TABLE projeto_tipos ENABLE ROW LEVEL SECURITY;

-- Política de leitura para todos os usuários autenticados
CREATE POLICY "projeto_tipos_select_policy" ON projeto_tipos
    FOR SELECT USING (true);

-- Política de escrita apenas para admins (via auth.users)
CREATE POLICY "projeto_tipos_insert_policy" ON projeto_tipos
    FOR INSERT WITH CHECK (true);

CREATE POLICY "projeto_tipos_update_policy" ON projeto_tipos
    FOR UPDATE USING (true);

CREATE POLICY "projeto_tipos_delete_policy" ON projeto_tipos
    FOR DELETE USING (true);
