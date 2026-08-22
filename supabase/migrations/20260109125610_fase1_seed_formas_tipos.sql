-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- SEED: FORMAS DE PAGAMENTO (5 registros)
INSERT INTO formas_pagamento (nome, sigla) VALUES
('Crédito Recorrente', 'C.R'),
('Cheque', 'CHQ'),
('Pix', 'PIX'),
('Dinheiro', 'DIN'),
('Link', 'LNK')
ON CONFLICT (nome) DO NOTHING;

-- SEED: TIPOS DE MATRÍCULA (5 registros)
INSERT INTO tipos_matricula (nome, codigo, entra_ticket_medio, conta_como_pagante, descricao) VALUES
('Regular', 'REGULAR', true, true, 'Matrícula padrão (EMLA ou LAMK calculado pela idade)'),
('Segundo Curso', 'SEGUNDO_CURSO', true, true, 'Aluno que faz dois cursos (eleva ticket médio, conta como 1 aluno)'),
('Bolsista Integral', 'BOLSISTA_INT', false, false, 'Bolsa 100% - não entra em cálculos de ticket médio'),
('Bolsista Parcial', 'BOLSISTA_PARC', false, false, 'Bolsa parcial - não entra em cálculos de ticket médio'),
('Matrícula em Banda', 'BANDA', false, false, 'Projeto de banda - não entra em cálculos')
ON CONFLICT (codigo) DO NOTHING;

-- SEED: TIPOS DE SAÍDA (3 registros)
INSERT INTO tipos_saida (nome, codigo, descricao) VALUES
('Interrompido', 'INTERROMPIDO', 'Cancelou no meio do contrato de 12 meses'),
('Não Renovou', 'NAO_RENOVOU', 'Contrato venceu e não renovou'),
('Aviso Prévio', 'AVISO_PREVIO', 'Avisou que vai sair - paga mês atual + próximo')
ON CONFLICT (codigo) DO NOTHING;
