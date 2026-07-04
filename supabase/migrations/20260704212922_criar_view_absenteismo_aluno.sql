CREATE OR REPLACE VIEW vw_absenteismo_aluno AS
WITH base AS (
  SELECT
    aluno_id,
    count(*)                                        AS total_aulas,
    count(*) FILTER (WHERE status='ausente')        AS faltas,
    count(*) FILTER (WHERE data_aula >= current_date - 30)                              AS aulas_30d,
    count(*) FILTER (WHERE status='ausente' AND data_aula >= current_date - 30)         AS faltas_30d,
    max(data_aula) FILTER (WHERE status='presente') AS ultima_presenca
  FROM aluno_presenca
  GROUP BY aluno_id
)
SELECT
  aluno_id,
  total_aulas,
  faltas,
  round(faltas::numeric / total_aulas, 3)                                   AS taxa_historica,
  CASE WHEN aulas_30d > 0
       THEN round(faltas_30d::numeric / aulas_30d, 3) END                   AS taxa_recente_30d,
  CASE WHEN aulas_30d > 0
       THEN round(faltas_30d::numeric / aulas_30d - faltas::numeric/total_aulas, 3) END AS tendencia,
  ultima_presenca,
  (current_date - ultima_presenca)                                          AS dias_sem_presenca,
  (total_aulas >= 4)                                                        AS confiavel
FROM base;

COMMENT ON VIEW vw_absenteismo_aluno IS 'Taxa de absenteismo por aluno (matricula), calculada em tempo real a partir de aluno_presenca. Sinal #6 e #9 do health score do aluno v2. Nao usar alunos.percentual_presenca (coluna dessincronizada, sem trigger de escrita).';
