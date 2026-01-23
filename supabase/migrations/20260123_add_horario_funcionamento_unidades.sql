-- Adicionar campo horario_funcionamento na tabela unidades
ALTER TABLE unidades
ADD COLUMN horario_funcionamento JSONB DEFAULT '{
  "segunda_sexta": {"inicio": "08:00", "fim": "21:00"},
  "sabado": {"inicio": "08:00", "fim": "16:00"},
  "domingo": {"fechado": true}
}'::jsonb;

-- Atualizar as 3 unidades existentes com horários padrão
UPDATE unidades
SET horario_funcionamento = '{
  "segunda_sexta": {"inicio": "08:00", "fim": "21:00"},
  "sabado": {"inicio": "08:00", "fim": "16:00"},
  "domingo": {"fechado": true}
}'::jsonb
WHERE ativo = true;

-- Comentário explicativo
COMMENT ON COLUMN unidades.horario_funcionamento IS 'Horário de funcionamento da unidade em formato JSON: {segunda_sexta: {inicio, fim}, sabado: {inicio, fim}, domingo: {fechado}}';
