-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

CREATE TABLE IF NOT EXISTS professor_360_criterios (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(50) UNIQUE NOT NULL,
  nome VARCHAR(100) NOT NULL,
  descricao TEXT,
  tipo VARCHAR(20) NOT NULL DEFAULT 'penalidade',
  peso INTEGER DEFAULT 10,
  pontos_perda INTEGER DEFAULT 10,
  tolerancia INTEGER DEFAULT 0,
  regra_detalhada TEXT,
  ativo BOOLEAN DEFAULT true,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO professor_360_criterios (codigo, nome, descricao, tipo, peso, pontos_perda, tolerancia, regra_detalhada, ordem) VALUES
('atrasos', 'Pontualidade', 'Atrasos acima de 10 minutos', 'penalidade', 15, 10, 2, 
 'Se o professor chegar acima de 10 min atrasado, perde ponto. Tem direito a 2 atrasos menores que 10 min, a partir do 3º também perde ponto.', 1),
('faltas', 'Assiduidade', 'Faltas sem justificativa', 'penalidade', 20, 20, 0, 
 'Se o professor faltar sem justificativa, perde ponto.', 2),
('organizacao_sala', 'Organização de Salas', 'Sala desorganizada após aula', 'penalidade', 15, 10, 0, 
 'Ao final da aula o professor deve manter a sala organizada, luz apagada, ar desligado. Se a Farmer ou próximo professor encontrar desorganização, perde ponto.', 3),
('uniforme', 'Dresscode', 'Não seguir código de vestimenta', 'penalidade', 10, 10, 0, 
 'A LA Music tem um dresscode que o professor precisa seguir. Caso não esteja dentro dos padrões, perde ponto.', 4),
('prazos', 'Cumprimento de Prazos', 'Descumprimento de prazos', 'penalidade', 15, 15, 0, 
 'Caso o professor descumpra qualquer prazo estabelecido, perde ponto. Prazo da ADM = perde na unidade. Prazo da Coordenação = perde em todas as unidades.', 5),
('emusys', 'Preenchimento EMUSYS', 'Sistema não preenchido 100%', 'penalidade', 25, 25, 0, 
 'O professor precisa preencher todas as presenças (dele e dos alunos) e anotações de todas as aulas. Se não tiver 100% de aproveitamento no mês, perde ponto.', 6),
('projetos', 'Engajamento em Projetos', 'Participação em mini projetos pedagógicos', 'bonus', 0, 0, 0, 
 'Critério de pontuação EXTRA. O professor que fizer projetos pedagógicos com seus alunos ou participar de projetos do curso ganha ponto extra.', 7)
ON CONFLICT (codigo) DO NOTHING;
