-- Adicionar campo duracao_minutos na tabela turmas
ALTER TABLE turmas 
ADD COLUMN IF NOT EXISTS duracao_minutos INTEGER DEFAULT 60;

-- Atualizar turmas existentes: calcular duração baseada em horario_inicio e horario_fim
UPDATE turmas 
SET duracao_minutos = EXTRACT(EPOCH FROM (horario_fim - horario_inicio)) / 60
WHERE horario_fim IS NOT NULL AND duracao_minutos IS NULL;

-- Atualizar horario_fim para turmas que não têm (baseado em duração padrão de 1h)
UPDATE turmas 
SET horario_fim = horario_inicio + INTERVAL '1 hour'
WHERE horario_fim IS NULL;

-- Adicionar comentário na coluna
COMMENT ON COLUMN turmas.duracao_minutos IS 'Duração da aula em minutos (padrão: 60)';
