-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Templates de Fases para Recital
INSERT INTO projeto_tipo_fases_template (tipo_id, nome, descricao, ordem, duracao_sugerida_dias)
SELECT id, 'Planejamento', 'Definição de repertório, alunos participantes e local', 1, 21
FROM projeto_tipos WHERE nome = 'Recital';

INSERT INTO projeto_tipo_fases_template (tipo_id, nome, descricao, ordem, duracao_sugerida_dias)
SELECT id, 'Divulgação', 'Convites, artes e comunicação com famílias', 2, 14
FROM projeto_tipos WHERE nome = 'Recital';

INSERT INTO projeto_tipo_fases_template (tipo_id, nome, descricao, ordem, duracao_sugerida_dias)
SELECT id, 'Ensaios', 'Ensaios individuais e coletivos', 3, 30
FROM projeto_tipos WHERE nome = 'Recital';

INSERT INTO projeto_tipo_fases_template (tipo_id, nome, descricao, ordem, duracao_sugerida_dias)
SELECT id, 'Passagem de Som', 'Teste de som e ensaio geral', 4, 1
FROM projeto_tipos WHERE nome = 'Recital';

INSERT INTO projeto_tipo_fases_template (tipo_id, nome, descricao, ordem, duracao_sugerida_dias)
SELECT id, 'Evento', 'Dia do recital', 5, 1
FROM projeto_tipos WHERE nome = 'Recital';

INSERT INTO projeto_tipo_fases_template (tipo_id, nome, descricao, ordem, duracao_sugerida_dias)
SELECT id, 'Pós-Evento', 'Fotos, vídeos, agradecimentos e avaliação', 6, 7
FROM projeto_tipos WHERE nome = 'Recital';
