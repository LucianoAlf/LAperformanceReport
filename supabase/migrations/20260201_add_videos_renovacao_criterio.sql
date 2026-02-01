-- Migration: Adicionar critério de bônus "Envio de Vídeos de Renovação"
-- Data: 2026-02-01
-- Descrição: Novo critério de bônus para incentivar professores a enviarem vídeos de renovação

-- Inserir novo critério de bônus
INSERT INTO professor_360_criterios (codigo, nome, descricao, tipo, peso, pontos_perda, tolerancia, regra_detalhada, ordem, ativo)
VALUES (
  'videos_renovacao',
  'Envio de Vídeos de Renovação',
  'Envio de vídeos para renovação de alunos',
  'bonus',
  0,
  5, -- pontos ganhos por envio (configurável)
  0,
  'O professor que enviar os vídeos de renovação para os pais dos alunos ganha pontos extras. Se enviar 100% dos vídeos previstos no mês, ganha a pontuação completa. Se enviar 70% ou mais, ganha metade dos pontos.',
  8,
  true
)
ON CONFLICT (codigo) DO NOTHING;

-- Atualizar o critério de projetos para ter pontos_perda configurável (se ainda não tiver)
UPDATE professor_360_criterios 
SET pontos_perda = 5 
WHERE codigo = 'projetos' AND (pontos_perda IS NULL OR pontos_perda = 0);
