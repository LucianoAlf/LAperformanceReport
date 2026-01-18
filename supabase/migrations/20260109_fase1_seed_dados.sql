-- ============================================================
-- FASE 1: SEED - DADOS INICIAIS DAS TABELAS MESTRAS
-- Data: 09/01/2026
-- Descrição: Popular tabelas mestras com dados iniciais
-- ============================================================

-- ============================================================
-- 1. PROFESSORES (43 registros)
-- ============================================================

INSERT INTO professores (nome) VALUES
('Antonio Marcos'),
('Caio Tenório'),
('Daiana Pacífico'),
('Elliabh Henrique'),
('Felipe Gevezier'),
('Gabriel Antony'),
('Gabriel Barbosa'),
('Gabriel Leão'),
('Guilherme Ovídio'),
('Isaque Mendes'),
('Israel Rocha'),
('Jeyson Gaia'),
('Joel de Salles'),
('Jordan Barbosa'),
('Kaio Felipe'),
('Larissa Bheattriz'),
('Leticia Fernandes'),
('Leticia Palmeira'),
('Léo Castro'),
('Lohana Leopoldo'),
('Lucas Guimarães'),
('Lucas Lisboa'),
('Marcos Saturnino'),
('Mariana Carneiro'),
('Matheus Felipe'),
('Matheus Lana'),
('Matheus Santos'),
('Matheus Sterque'),
('Miqueias de Oliveira'),
('Pedro Sérgio'),
('Peterson Biancamano'),
('Rafael Akeem'),
('Ramon Pina'),
('Renam Amorim'),
('Rodrigo Pinheiro'),
('Valdo Delfino'),
('Vicente Pinheiro'),
('Vinicius Pinheiro'),
('Wellerson de Lima'),
('Willer Arruda'),
('Willian de Andrade'),
('Willian Ribeiro')
ON CONFLICT (nome_normalizado) DO NOTHING;

-- ============================================================
-- 2. CURSOS (16 registros)
-- ============================================================

INSERT INTO cursos (nome) VALUES
('Bateria'),
('Canto'),
('Cavaquinho'),
('Contrabaixo'),
('Flauta Transversal'),
('Guitarra'),
('Musicalização para Bebês'),
('Musicalização Preparatória'),
('Piano'),
('Produção Musical'),
('Saxofone'),
('Teclado'),
('Teoria Musical'),
('Ukulele'),
('Violão'),
('Violino')
ON CONFLICT (nome_normalizado) DO NOTHING;

-- ============================================================
-- 3. CANAIS DE ORIGEM (9 registros)
-- ============================================================

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

-- ============================================================
-- 4. MOTIVOS DE SAÍDA (12 registros)
-- ============================================================

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

-- ============================================================
-- 5. FORMAS DE PAGAMENTO (5 registros)
-- ============================================================

INSERT INTO formas_pagamento (nome, sigla) VALUES
('Crédito Recorrente', 'C.R'),
('Cheque', 'CHQ'),
('Pix', 'PIX'),
('Dinheiro', 'DIN'),
('Link', 'LNK')
ON CONFLICT (nome) DO NOTHING;

-- ============================================================
-- 6. TIPOS DE MATRÍCULA (5 registros)
-- ============================================================

INSERT INTO tipos_matricula (nome, codigo, entra_ticket_medio, conta_como_pagante, descricao) VALUES
('Regular', 'REGULAR', true, true, 'Matrícula padrão (EMLA ou LAMK calculado pela idade)'),
('Segundo Curso', 'SEGUNDO_CURSO', true, true, 'Aluno que faz dois cursos (eleva ticket médio, conta como 1 aluno)'),
('Bolsista Integral', 'BOLSISTA_INT', false, false, 'Bolsa 100% - não entra em cálculos de ticket médio'),
('Bolsista Parcial', 'BOLSISTA_PARC', false, false, 'Bolsa parcial - não entra em cálculos de ticket médio'),
('Matrícula em Banda', 'BANDA', false, false, 'Projeto de banda - não entra em cálculos')
ON CONFLICT (codigo) DO NOTHING;

-- ============================================================
-- 7. TIPOS DE SAÍDA (3 registros)
-- ============================================================

INSERT INTO tipos_saida (nome, codigo, descricao) VALUES
('Interrompido', 'INTERROMPIDO', 'Cancelou no meio do contrato de 12 meses'),
('Não Renovou', 'NAO_RENOVOU', 'Contrato venceu e não renovou'),
('Aviso Prévio', 'AVISO_PREVIO', 'Avisou que vai sair - paga mês atual + próximo')
ON CONFLICT (codigo) DO NOTHING;

-- ============================================================
-- VERIFICAÇÃO FINAL
-- ============================================================

-- Esta query será executada para verificar os resultados
-- SELECT 'professores' as tabela, COUNT(*) as registros FROM professores
-- UNION ALL SELECT 'cursos', COUNT(*) FROM cursos
-- UNION ALL SELECT 'canais_origem', COUNT(*) FROM canais_origem
-- UNION ALL SELECT 'motivos_saida', COUNT(*) FROM motivos_saida
-- UNION ALL SELECT 'formas_pagamento', COUNT(*) FROM formas_pagamento
-- UNION ALL SELECT 'tipos_matricula', COUNT(*) FROM tipos_matricula
-- UNION ALL SELECT 'tipos_saida', COUNT(*) FROM tipos_saida;

-- ============================================================
-- FIM DO SEED
-- ============================================================
