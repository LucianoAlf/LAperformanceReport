-- Adicionar campo limite_minutos_atraso na tabela professor_360_criterios
-- Este campo define o limite de minutos para considerar atraso grave (sem tolerância)
-- Usado apenas no critério de Pontualidade (codigo = 'atrasos')

ALTER TABLE professor_360_criterios 
ADD COLUMN IF NOT EXISTS limite_minutos_atraso INTEGER DEFAULT 10;

-- Atualizar o critério de pontualidade com o valor padrão
UPDATE professor_360_criterios 
SET limite_minutos_atraso = 10 
WHERE codigo = 'atrasos';

COMMENT ON COLUMN professor_360_criterios.limite_minutos_atraso IS 'Limite de minutos para atraso grave (sem tolerância). Usado apenas no critério de Pontualidade.';
