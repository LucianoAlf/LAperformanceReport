-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Inserir tarefas padrão para cada fase template

-- SEMANA TEMÁTICA
-- Fase 1: Planejamento (id=1)
INSERT INTO projeto_tipo_tarefas_template (fase_template_id, titulo, ordem) VALUES
    (1, 'Definir tema da semana', 1),
    (1, 'Reservar local/espaço', 2),
    (1, 'Definir orçamento', 3),
    (1, 'Montar equipe responsável', 4),
    (1, 'Criar cronograma geral', 5);

-- Fase 2: Divulgação (id=2)
INSERT INTO projeto_tipo_tarefas_template (fase_template_id, titulo, ordem) VALUES
    (2, 'Criar arte/identidade visual', 1),
    (2, 'Postar nas redes sociais', 2),
    (2, 'Enviar comunicado para alunos', 3),
    (2, 'Imprimir material físico', 4);

-- Fase 3: Preparação (id=3)
INSERT INTO projeto_tipo_tarefas_template (fase_template_id, titulo, ordem) VALUES
    (3, 'Preparar repertório', 1),
    (3, 'Ensaiar com alunos', 2),
    (3, 'Preparar decoração', 3),
    (3, 'Confirmar equipamentos', 4);

-- Fase 4: Ensaios (id=4)
INSERT INTO projeto_tipo_tarefas_template (fase_template_id, titulo, ordem) VALUES
    (4, 'Ensaio individual', 1),
    (4, 'Ensaio em grupo', 2),
    (4, 'Ensaio geral', 3);

-- Fase 5: Execução (id=5)
INSERT INTO projeto_tipo_tarefas_template (fase_template_id, titulo, ordem) VALUES
    (5, 'Montagem do espaço', 1),
    (5, 'Execução do evento', 2),
    (5, 'Desmontagem', 3);

-- Fase 6: Pós-evento (id=6)
INSERT INTO projeto_tipo_tarefas_template (fase_template_id, titulo, ordem) VALUES
    (6, 'Selecionar fotos e vídeos', 1),
    (6, 'Enviar agradecimentos', 2),
    (6, 'Elaborar relatório', 3),
    (6, 'Aplicar pesquisa de satisfação', 4);

-- RECITAL
-- Fase 7: Planejamento (id=7)
INSERT INTO projeto_tipo_tarefas_template (fase_template_id, titulo, ordem) VALUES
    (7, 'Definir data do recital', 1),
    (7, 'Reservar local', 2),
    (7, 'Definir formato (presencial/online)', 3),
    (7, 'Montar equipe', 4);

-- Fase 8: Seleção de Alunos (id=8)
INSERT INTO projeto_tipo_tarefas_template (fase_template_id, titulo, ordem) VALUES
    (8, 'Identificar alunos aptos', 1),
    (8, 'Confirmar participação', 2),
    (8, 'Definir repertório individual', 3);

-- Fase 9: Preparação (id=9)
INSERT INTO projeto_tipo_tarefas_template (fase_template_id, titulo, ordem) VALUES
    (9, 'Preparar partituras', 1),
    (9, 'Acompanhar evolução dos alunos', 2),
    (9, 'Preparar ordem de apresentação', 3);

-- Fase 10: Ensaios (id=10)
INSERT INTO projeto_tipo_tarefas_template (fase_template_id, titulo, ordem) VALUES
    (10, 'Ensaios individuais', 1),
    (10, 'Ensaios coletivos', 2);

-- Fase 11: Ensaio Geral (id=11)
INSERT INTO projeto_tipo_tarefas_template (fase_template_id, titulo, ordem) VALUES
    (11, 'Passagem completa no local', 1),
    (11, 'Ajustes finais', 2);

-- Fase 12: Evento (id=12)
INSERT INTO projeto_tipo_tarefas_template (fase_template_id, titulo, ordem) VALUES
    (12, 'Recepção do público', 1),
    (12, 'Execução do recital', 2),
    (12, 'Entrega de certificados', 3);

-- Fase 13: Pós-evento (id=13)
INSERT INTO projeto_tipo_tarefas_template (fase_template_id, titulo, ordem) VALUES
    (13, 'Editar fotos e vídeos', 1),
    (13, 'Coletar feedback', 2),
    (13, 'Elaborar relatório', 3);

-- SHOW DE BANDA
-- Fase 14: Planejamento (id=14)
INSERT INTO projeto_tipo_tarefas_template (fase_template_id, titulo, ordem) VALUES
    (14, 'Definir data e local', 1),
    (14, 'Definir formato do show', 2);

-- Fase 15: Formação (id=15)
INSERT INTO projeto_tipo_tarefas_template (fase_template_id, titulo, ordem) VALUES
    (15, 'Formar bandas', 1),
    (15, 'Definir repertório', 2),
    (15, 'Distribuir partituras', 3);

-- Fase 16: Ensaios (id=16)
INSERT INTO projeto_tipo_tarefas_template (fase_template_id, titulo, ordem) VALUES
    (16, 'Ensaios semanais', 1),
    (16, 'Acompanhar evolução', 2);

-- Fase 17: Passagem de Som (id=17)
INSERT INTO projeto_tipo_tarefas_template (fase_template_id, titulo, ordem) VALUES
    (17, 'Teste de som', 1),
    (17, 'Ajustes técnicos', 2);

-- Fase 18: Show (id=18)
INSERT INTO projeto_tipo_tarefas_template (fase_template_id, titulo, ordem) VALUES
    (18, 'Montagem', 1),
    (18, 'Execução do show', 2),
    (18, 'Desmontagem', 3);

-- Fase 19: Pós-evento (id=19)
INSERT INTO projeto_tipo_tarefas_template (fase_template_id, titulo, ordem) VALUES
    (19, 'Fotos e vídeos', 1),
    (19, 'Feedback das bandas', 2);

-- MATERIAL DIDÁTICO
-- Fase 20-24
INSERT INTO projeto_tipo_tarefas_template (fase_template_id, titulo, ordem) VALUES
    (20, 'Definir escopo do material', 1),
    (20, 'Definir público-alvo', 2),
    (21, 'Criar conteúdo', 1),
    (21, 'Criar design/layout', 2),
    (22, 'Revisão técnica', 1),
    (22, 'Revisão pedagógica', 2),
    (23, 'Apresentar para aprovação', 1),
    (23, 'Ajustes finais', 2),
    (24, 'Publicar/disponibilizar', 1);

-- PRODUÇÃO DE CONTEÚDO
-- Fase 25-29
INSERT INTO projeto_tipo_tarefas_template (fase_template_id, titulo, ordem) VALUES
    (25, 'Definir tema', 1),
    (25, 'Criar roteiro', 2),
    (26, 'Produzir conteúdo', 1),
    (27, 'Editar conteúdo', 1),
    (28, 'Enviar para aprovação', 1),
    (29, 'Publicar nas redes', 1);

-- VÍDEO AULAS
-- Fase 30-34
INSERT INTO projeto_tipo_tarefas_template (fase_template_id, titulo, ordem) VALUES
    (30, 'Elaborar roteiro', 1),
    (30, 'Preparar materiais de apoio', 2),
    (31, 'Gravar vídeo', 1),
    (32, 'Editar vídeo', 1),
    (32, 'Inserir elementos visuais', 2),
    (33, 'Revisão técnica', 1),
    (33, 'Revisão pedagógica', 2),
    (34, 'Upload e publicação', 1);
