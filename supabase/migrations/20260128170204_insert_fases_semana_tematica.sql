-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Templates de Fases para Semana Temática
INSERT INTO projeto_tipo_fases_template (tipo_id, nome, descricao, ordem, duracao_sugerida_dias)
SELECT id, 'Planejamento', 'Definição de tema, datas, professores envolvidos e orçamento', 1, 14
FROM projeto_tipos WHERE nome = 'Semana Temática';

INSERT INTO projeto_tipo_fases_template (tipo_id, nome, descricao, ordem, duracao_sugerida_dias)
SELECT id, 'Divulgação', 'Criação de artes, posts e comunicação com alunos', 2, 7
FROM projeto_tipos WHERE nome = 'Semana Temática';

INSERT INTO projeto_tipo_fases_template (tipo_id, nome, descricao, ordem, duracao_sugerida_dias)
SELECT id, 'Preparação', 'Organização de materiais, ensaios e logística', 3, 14
FROM projeto_tipos WHERE nome = 'Semana Temática';

INSERT INTO projeto_tipo_fases_template (tipo_id, nome, descricao, ordem, duracao_sugerida_dias)
SELECT id, 'Execução', 'Realização do evento', 4, 7
FROM projeto_tipos WHERE nome = 'Semana Temática';

INSERT INTO projeto_tipo_fases_template (tipo_id, nome, descricao, ordem, duracao_sugerida_dias)
SELECT id, 'Pós-Evento', 'Avaliação, fotos, vídeos e relatório final', 5, 7
FROM projeto_tipos WHERE nome = 'Semana Temática';
