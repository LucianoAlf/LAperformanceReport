-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Popular disponibilidade a partir dos horários reais dos alunos ativos
-- Para cada professor+unidade, pega o range de horários por dia da semana
-- Adiciona 1h ao último horário (pois o aluno tem aula naquele horário)
WITH disponibilidade_calculada AS (
  SELECT 
    pu.id as pu_id,
    a.dia_aula,
    MIN(a.horario_aula::time) as primeiro_horario,
    (MAX(a.horario_aula::time) + interval '1 hour')::time as ultimo_horario_fim
  FROM professores_unidades pu
  JOIN alunos a ON a.professor_atual_id = pu.professor_id 
    AND a.unidade_id = pu.unidade_id 
    AND a.status = 'ativo'
    AND a.dia_aula IS NOT NULL
    AND a.dia_aula NOT IN ('Domingo', 'Terça-feira') -- Ignorar dados inconsistentes
  GROUP BY pu.id, a.dia_aula
),
disponibilidade_json AS (
  SELECT 
    pu_id,
    jsonb_object_agg(
      dia_aula, 
      jsonb_build_object(
        'inicio', to_char(primeiro_horario, 'HH24:MI'),
        'fim', to_char(ultimo_horario_fim, 'HH24:MI')
      )
    ) as disponibilidade
  FROM disponibilidade_calculada
  GROUP BY pu_id
)
UPDATE professores_unidades pu
SET disponibilidade = dj.disponibilidade
FROM disponibilidade_json dj
WHERE pu.id = dj.pu_id;
