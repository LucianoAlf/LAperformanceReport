-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- View: vw_turmas_professor_periodo
-- Reconstroi turmas (curso/horario/dia) de um professor em qualquer periodo
-- a partir de aulas_emusys + aluno_presenca, espelhando o criterio da CTE
-- turmas_calc da RPC get_kpis_professor_periodo.
--
-- Granularidade: 1 linha por (aula x aluno presente/ausente).
-- Frontend filtra (professor_id, unidade_id, data_aula BETWEEN ?) e agrupa
-- por turma_nome no JS para montar a lista de turmas.
CREATE OR REPLACE VIEW vw_turmas_professor_periodo AS
SELECT
  ae.id                                                            AS aula_id,
  ae.professor_id,
  ae.unidade_id,
  ae.data_aula,
  ae.turma_nome,
  ae.curso_nome,
  ae.sala_nome,
  EXTRACT(ISODOW FROM ae.data_aula)::int                           AS dia_semana_iso,
  TO_CHAR((ae.data_hora_inicio AT TIME ZONE 'America/Sao_Paulo'), 'HH24:MI') AS horario_inicio,
  ap.aluno_id,
  ap.status                                                        AS status_presenca,
  a.nome                                                           AS aluno_nome,
  a.status                                                         AS aluno_status
FROM aulas_emusys ae
JOIN aluno_presenca ap ON ap.aula_emusys_id = ae.id
JOIN alunos a          ON a.id = ap.aluno_id
WHERE ae.cancelada = false
  AND ae.curso_nome NOT ILIKE '%banda%'
  AND ae.curso_nome NOT ILIKE '%garage band%'
  AND ae.curso_nome NOT ILIKE '%power kids%';

COMMENT ON VIEW vw_turmas_professor_periodo IS
  'Turmas reconstruidas a partir de aulas_emusys+aluno_presenca. Espelha turmas_calc da RPC get_kpis_professor_periodo. Usada pelo ModalDetalhesTurmas para mostrar turmas historicas alinhadas com a coluna Media/Turma.';
