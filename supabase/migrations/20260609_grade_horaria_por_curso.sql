-- Reescreve sincronizar_grade_horaria_alunos para derivar dia_aula/horario_aula
-- por PESSOA (nome+unidade) + CURSO DA AULA, em vez de por aluno_id.
--
-- Motivo: alunos com 2+ cursos tinham os horarios embaralhados entre as matriculas
-- (a versao antiga agrupava aluno_presenca por aluno_id, que vinha do match por nome do
-- sync, misturando os cursos). Agrupando por pessoa+curso, cada matricula recebe o horario
-- do seu proprio curso. Robusta ao historico embaralhado: o embaralhamento sempre manteve
-- as presencas dentro das matriculas da mesma pessoa (nome certo, curso trocado), entao
-- reagrupar pelo curso da aula corrige sem precisar sanear o passado.
--
-- O edge sync-presenca-emusys deixou de calcular horario; esta funcao e a fonte unica.

-- Helpers de normalizacao (espelham normalizarNome/normalizarCurso do edge TS)
CREATE OR REPLACE FUNCTION grade_norm_nome(p text)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT trim(regexp_replace(
           regexp_replace(lower(unaccent(coalesce(p, ''))), '\(.*?\)', '', 'g'),
         '\s+', ' ', 'g'))
$$;

CREATE OR REPLACE FUNCTION grade_norm_curso(p text)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT trim(regexp_replace(
           regexp_replace(
             regexp_replace(lower(unaccent(coalesce(p, ''))), '\s+para\s+instrumento$', ''),
           '\s+(t|ind)$', ''),
         '\s+', ' ', 'g'))
$$;

CREATE OR REPLACE FUNCTION sincronizar_grade_horaria_alunos()
 RETURNS TABLE(alunos_atualizados integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  contador int;
BEGIN
  WITH presenca_30d AS (
    SELECT
      grade_norm_nome(al.nome) AS nome_norm,
      al.unidade_id,
      grade_norm_curso(ae.curso_nome) AS curso_norm,
      EXTRACT(DOW FROM ae.data_hora_inicio AT TIME ZONE 'America/Sao_Paulo')::int AS dow,
      to_char((ae.data_hora_inicio AT TIME ZONE 'America/Sao_Paulo'), 'HH24:MI:SS')::time AS horario,
      count(*) AS ocorrencias
    FROM aluno_presenca ap
    JOIN aulas_emusys ae ON ae.id = ap.aula_emusys_id
    JOIN alunos al ON al.id = ap.aluno_id
    WHERE ae.cancelada = false
      AND ae.categoria = 'normal'
      AND ae.data_hora_inicio > now() - interval '30 days'
      AND ap.aluno_id IS NOT NULL
    GROUP BY nome_norm, al.unidade_id, curso_norm, dow, horario
  ),
  top_30 AS (
    SELECT DISTINCT ON (nome_norm, unidade_id, curso_norm)
      nome_norm, unidade_id, curso_norm, dow, horario
    FROM presenca_30d
    WHERE ocorrencias >= 3
    ORDER BY nome_norm, unidade_id, curso_norm, ocorrencias DESC, dow ASC
  ),
  presenca_60d AS (
    SELECT
      grade_norm_nome(al.nome) AS nome_norm,
      al.unidade_id,
      grade_norm_curso(ae.curso_nome) AS curso_norm,
      EXTRACT(DOW FROM ae.data_hora_inicio AT TIME ZONE 'America/Sao_Paulo')::int AS dow,
      to_char((ae.data_hora_inicio AT TIME ZONE 'America/Sao_Paulo'), 'HH24:MI:SS')::time AS horario,
      count(*) AS ocorrencias
    FROM aluno_presenca ap
    JOIN aulas_emusys ae ON ae.id = ap.aula_emusys_id
    JOIN alunos al ON al.id = ap.aluno_id
    WHERE ae.cancelada = false
      AND ae.categoria = 'normal'
      AND ae.data_hora_inicio > now() - interval '60 days'
      AND ap.aluno_id IS NOT NULL
    GROUP BY nome_norm, al.unidade_id, curso_norm, dow, horario
  ),
  top_60 AS (
    SELECT DISTINCT ON (nome_norm, unidade_id, curso_norm)
      p.nome_norm, p.unidade_id, p.curso_norm, p.dow, p.horario
    FROM presenca_60d p
    WHERE p.ocorrencias >= 3
      AND NOT EXISTS (
        SELECT 1 FROM top_30 t
        WHERE t.nome_norm = p.nome_norm AND t.unidade_id = p.unidade_id AND t.curso_norm = p.curso_norm
      )
    ORDER BY p.nome_norm, p.unidade_id, p.curso_norm, p.ocorrencias DESC, p.dow ASC
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
    JOIN cursos c ON grade_norm_curso(c.nome) = tf.curso_norm AND c.ativo = true
    WHERE grade_norm_nome(a.nome) = tf.nome_norm
      AND a.unidade_id = tf.unidade_id
      AND a.curso_id = c.id
      AND a.status = 'ativo'
      AND (a.horario_aula::time IS DISTINCT FROM tf.horario
           OR upper(coalesce(a.dia_aula::text, '')) IS DISTINCT FROM upper(dn.nome))
    RETURNING a.id
  )
  SELECT count(*) INTO contador FROM upd;

  RETURN QUERY SELECT contador;
END;
$function$;
