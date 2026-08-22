-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- SEED: CANAIS DE ORIGEM (9 registros)
INSERT INTO canais_origem (nome) VALUES
('Instagram'),
('Facebook'),
('Google'),
('Site'),
('Ligação'),
('Visita/Placa'),
('Indicação'),
('Ex-aluno'),
('Convênios')
ON CONFLICT (nome_normalizado) DO NOTHING;

-- SEED: MOTIVOS DE SAÍDA (12 registros)
INSERT INTO motivos_saida (nome, categoria) VALUES
('Dificuldade financeira', 'financeiro'),
('Falta de tempo', 'tempo'),
('Mudança de endereço', 'mudanca'),
('Problemas de saúde', 'saude'),
('Desistência', 'desistencia'),
('Priorizar estudos regulares', 'estudos'),
('Inadimplência', 'inadimplencia'),
('Incompatibilidade de horário', 'tempo'),
('Problemas familiares', 'outro'),
('Encontrou escola mais acessível', 'financeiro'),
('Sem retorno após contato', 'outro'),
('Outro', 'outro')
ON CONFLICT (nome_normalizado) DO NOTHING;
