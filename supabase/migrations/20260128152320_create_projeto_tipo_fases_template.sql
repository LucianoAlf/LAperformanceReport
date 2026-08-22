-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Template de Fases por Tipo de Projeto
CREATE TABLE IF NOT EXISTS projeto_tipo_fases_template (
    id SERIAL PRIMARY KEY,
    tipo_id INTEGER NOT NULL REFERENCES projeto_tipos(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    ordem INTEGER NOT NULL DEFAULT 1,
    duracao_sugerida_dias INTEGER DEFAULT 7,
    descricao TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comentário da tabela
COMMENT ON TABLE projeto_tipo_fases_template IS 'Template de fases padrão para cada tipo de projeto';

-- Índices
CREATE INDEX idx_projeto_tipo_fases_template_tipo ON projeto_tipo_fases_template(tipo_id);
CREATE INDEX idx_projeto_tipo_fases_template_ordem ON projeto_tipo_fases_template(tipo_id, ordem);

-- Habilitar RLS
ALTER TABLE projeto_tipo_fases_template ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "projeto_tipo_fases_template_select_policy" ON projeto_tipo_fases_template
    FOR SELECT USING (true);

CREATE POLICY "projeto_tipo_fases_template_insert_policy" ON projeto_tipo_fases_template
    FOR INSERT WITH CHECK (true);

CREATE POLICY "projeto_tipo_fases_template_update_policy" ON projeto_tipo_fases_template
    FOR UPDATE USING (true);

CREATE POLICY "projeto_tipo_fases_template_delete_policy" ON projeto_tipo_fases_template
    FOR DELETE USING (true);

-- Inserir templates de fases conforme briefing

-- 1. Semana Temática (tipo_id = 1)
INSERT INTO projeto_tipo_fases_template (tipo_id, nome, ordem, duracao_sugerida_dias, descricao) VALUES
    (1, 'Planejamento', 1, 14, 'Definir tema, reservar local, definir orçamento, montar equipe, criar cronograma'),
    (1, 'Divulgação', 2, 7, 'Criar arte, postar redes sociais, enviar para alunos, imprimir material'),
    (1, 'Preparação', 3, 14, 'Preparar repertório, ensaiar com alunos, preparar decoração, confirmar equipamentos'),
    (1, 'Ensaios', 4, 7, 'Ensaio individual, ensaio em grupo, ensaio geral'),
    (1, 'Execução', 5, 1, 'Montagem, execução do evento, desmontagem'),
    (1, 'Pós-evento', 6, 7, 'Fotos/vídeos, agradecimentos, relatório, pesquisa de satisfação');

-- 2. Recital (tipo_id = 2)
INSERT INTO projeto_tipo_fases_template (tipo_id, nome, ordem, duracao_sugerida_dias, descricao) VALUES
    (2, 'Planejamento', 1, 14, 'Definir data, local, formato e equipe responsável'),
    (2, 'Seleção de Alunos', 2, 7, 'Identificar alunos participantes e repertório'),
    (2, 'Preparação', 3, 21, 'Preparar repertório individual de cada aluno'),
    (2, 'Ensaios', 4, 14, 'Ensaios individuais e coletivos'),
    (2, 'Ensaio Geral', 5, 1, 'Passagem completa no local do evento'),
    (2, 'Evento', 6, 1, 'Execução do recital'),
    (2, 'Pós-evento', 7, 7, 'Fotos, vídeos, feedback e relatório');

-- 3. Show de Banda (tipo_id = 3)
INSERT INTO projeto_tipo_fases_template (tipo_id, nome, ordem, duracao_sugerida_dias, descricao) VALUES
    (3, 'Planejamento', 1, 7, 'Definir data, local e formato do show'),
    (3, 'Formação', 2, 14, 'Formar bandas e definir repertório'),
    (3, 'Ensaios', 3, 30, 'Ensaios semanais das bandas'),
    (3, 'Passagem de Som', 4, 1, 'Teste de som e ajustes técnicos'),
    (3, 'Show', 5, 1, 'Execução do show'),
    (3, 'Pós-evento', 6, 7, 'Fotos, vídeos e feedback');

-- 4. Material Didático (tipo_id = 4)
INSERT INTO projeto_tipo_fases_template (tipo_id, nome, ordem, duracao_sugerida_dias, descricao) VALUES
    (4, 'Briefing', 1, 3, 'Definir escopo, público-alvo e objetivos do material'),
    (4, 'Produção', 2, 14, 'Criação do conteúdo e design'),
    (4, 'Revisão', 3, 7, 'Revisão técnica e pedagógica'),
    (4, 'Aprovação', 4, 3, 'Aprovação final pelos coordenadores'),
    (4, 'Publicação', 5, 1, 'Disponibilização do material');

-- 5. Produção de Conteúdo (tipo_id = 5)
INSERT INTO projeto_tipo_fases_template (tipo_id, nome, ordem, duracao_sugerida_dias, descricao) VALUES
    (5, 'Pauta', 1, 2, 'Definir tema, formato e roteiro'),
    (5, 'Produção', 2, 3, 'Criação do conteúdo (texto, imagem, vídeo)'),
    (5, 'Edição', 3, 2, 'Edição e ajustes finais'),
    (5, 'Aprovação', 4, 1, 'Aprovação pelos coordenadores'),
    (5, 'Publicação', 5, 1, 'Publicação nas redes sociais');

-- 6. Vídeo Aulas (tipo_id = 6)
INSERT INTO projeto_tipo_fases_template (tipo_id, nome, ordem, duracao_sugerida_dias, descricao) VALUES
    (6, 'Roteiro', 1, 3, 'Elaboração do roteiro e materiais de apoio'),
    (6, 'Gravação', 2, 1, 'Gravação do vídeo'),
    (6, 'Edição', 3, 5, 'Edição, cortes e inserção de elementos visuais'),
    (6, 'Revisão', 4, 2, 'Revisão técnica e pedagógica'),
    (6, 'Publicação', 5, 1, 'Upload e disponibilização');
