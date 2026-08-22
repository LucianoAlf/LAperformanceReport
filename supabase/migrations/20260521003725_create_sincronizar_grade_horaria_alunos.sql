-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

CREATE OR REPLACE FUNCTION public.sincronizar_grade_horaria_alunos()
RETURNS TABLE(alunos_atualizados int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  contador int;
BEGIN
  WITH aulas_30d AS (
    SELECT
      ap.aluno_id,
      EXTRACT(DOW FROM ae.data_hora_inicio AT TIME ZONE 'America/Sao_Paulo')::int AS dow,
      to_char((ae.data_hora_inicio AT TIME ZONE 'America/Sao_Paulo'), 'HH24:MI:SS')::time AS horario,
      count(*) AS ocorrencias
    FROM aluno_presenca ap
    JOIN aulas_emusys ae ON ae.id = ap.aula_emusys_id
    WHERE ae.cancelada = false
      AND ae.data_hora_inicio > now() - interval '30 days'
      AND ap.aluno_id IS NOT NULL
    GROUP BY ap.aluno_id, dow, horario
  ),
  top_30 AS (
    SELECT DISTINCT ON (aluno_id) aluno_id, dow, horario
    FROM aulas_30d
    WHERE ocorrencias >= 3
    ORDER BY aluno_id, ocorrencias DESC, dow ASC
  ),
  aulas_60d AS (
    SELECT
      ap.aluno_id,
      EXTRACT(DOW FROM ae.data_hora_inicio AT TIME ZONE 'America/Sao_Paulo')::int AS dow,
      to_char((ae.data_hora_inicio AT TIME ZONE 'America/Sao_Paulo'), 'HH24:MI:SS')::time AS horario,
      count(*) AS ocorrencias
    FROM aluno_presenca ap
    JOIN aulas_emusys ae ON ae.id = ap.aula_emusys_id
    WHERE ae.cancelada = false
      AND ae.data_hora_inicio > now() - interval '60 days'
      AND ap.aluno_id IS NOT NULL
      AND ap.aluno_id NOT IN (SELECT aluno_id FROM top_30)
    GROUP BY ap.aluno_id, dow, horario
  ),
  top_60 AS (
    SELECT DISTINCT ON (aluno_id) aluno_id, dow, horario
    FROM aulas_60d
    WHERE ocorrencias >= 3
    ORDER BY aluno_id, ocorrencias DESC, dow ASC
  ),
  top_final AS (
    SELECT * FROM top_30
    UNION ALL
    SELECT * FROM top_60
  ),
  dia_nome AS (
    SELECT 0 AS dow, 'Domingo'::text AS nome UNION ALL
    SELECT 1, 'Segunda' UNION ALL
    SELECT 2, 'Terça' UNION ALL
    SELECT 3, 'Quarta' UNION ALL
    SELECT 4, 'Quinta' UNION ALL
    SELECT 5, 'Sexta' UNION ALL
    SELECT 6, 'Sábado'
  ),
  upd AS (
    UPDATE alunos a
    SET
      horario_aula = tf.horario,
      dia_aula = dn.nome::text,
      updated_at = now()
    FROM top_final tf
    JOIN dia_nome dn ON dn.dow = tf.dow
    WHERE a.id = tf.aluno_id
      AND a.status = 'ativo'
      AND (a.horario_aula::time IS DISTINCT FROM tf.horario OR upper(coalesce(a.dia_aula::text,'')) IS DISTINCT FROM upper(dn.nome))
    RETURNING a.id
  )
  SELECT count(*) INTO contador FROM upd;

  RETURN QUERY SELECT contador;
END;
$$;

COMMENT ON FUNCTION public.sincronizar_grade_horaria_alunos() IS
'Sincroniza alunos.dia_aula e alunos.horario_aula com o (dia,horario) mais frequente de aulas_emusys nos últimos 30d (fallback 60d), exigindo >= 3 aulas. Cron diário 22h30 BRT após sync-presenca-emusys. Criado em 2026-05-20 (plano docs/superpowers/plans/2026-05-20-fix-grade-horaria.md).';
