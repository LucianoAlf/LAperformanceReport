-- Move os consumidores operacionais do Fabio para as fontes pedagogicas canonicas.
-- O pente-fino permanece fechado ao agente enquanto o contrato esta em auditoria.

CREATE OR REPLACE FUNCTION public.fabio_contexto_professor(
  p_professor_id integer,
  p_data date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_nome text;
  v_res jsonb;
BEGIN
  SELECT nome
    INTO v_nome
  FROM public.professores
  WHERE id = p_professor_id
    AND COALESCE(ativo, true);

  IF v_nome IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'motivo', 'professor_nao_encontrado'
    );
  END IF;

  SELECT jsonb_build_object(
    'ok', true,
    'professor_id', p_professor_id,
    'nome', v_nome,
    'primeiro_nome', split_part(btrim(v_nome), ' ', 1),
    'unidades', COALESCE((
      SELECT jsonb_agg(x.nome ORDER BY x.nome)
      FROM (
        SELECT DISTINCT u.nome
        FROM public.vw_professor_carteira_pessoa_canonica_sombra c
        JOIN public.unidades u ON u.id = c.unidade_id
        WHERE c.professor_id = p_professor_id
      ) x
    ), '[]'::jsonb),
    'total_alunos_carteira', (
      SELECT count(*)
      FROM public.vw_professor_carteira_pessoa_canonica_sombra c
      WHERE c.professor_id = p_professor_id
    ),
    'fonte_carteira', 'vw_professor_carteira_pessoa_canonica_sombra',
    'hoje', jsonb_build_object(
      'data', p_data,
      'total_aulas', (
        SELECT count(DISTINCT (ae.data_hora_inicio, ae.data_hora_fim))
        FROM public.aulas_emusys ae
        WHERE ae.professor_id = p_professor_id
          AND ae.data_aula = p_data
          AND COALESCE(ae.cancelada, false) = false
      ),
      'aulas', COALESCE((
        WITH slots AS (
          SELECT
            data_hora_inicio,
            data_hora_fim,
            array_agg(id ORDER BY CASE WHEN tipo = 'turma' THEN 0 ELSE 1 END, id) AS aula_ids,
            (array_agg(id ORDER BY CASE WHEN tipo = 'turma' THEN 0 ELSE 1 END, id))[1] AS aula_ancora
          FROM public.aulas_emusys
          WHERE professor_id = p_professor_id
            AND data_aula = p_data
            AND COALESCE(cancelada, false) = false
          GROUP BY data_hora_inicio, data_hora_fim
        )
        SELECT jsonb_agg(
          jsonb_build_object(
            'hora', to_char(
              ae.data_hora_inicio AT TIME ZONE 'America/Sao_Paulo',
              'HH24:MI'
            ),
            'curso', ae.curso_nome,
            'alunos', COALESCE((
              SELECT jsonb_agg(roster.nome ORDER BY roster.nome)
              FROM (
                SELECT DISTINCT a.id, a.nome
                FROM public.aula_alunos_emusys r
                JOIN public.alunos a ON a.id = r.aluno_id
                WHERE r.aula_emusys_id = ANY(s.aula_ids)
              ) roster
            ), '[]'::jsonb),
            'chamada_feita', EXISTS (
              SELECT 1
              FROM public.vw_aluno_presenca_semantica_v1 ps
              WHERE ps.aula_emusys_id = ANY(s.aula_ids)
                AND ps.resultado_pedagogico IN ('presente', 'falta_confirmada')
            ),
            'chamada_situacao', CASE
              WHEN EXISTS (
                SELECT 1
                FROM public.vw_aluno_presenca_semantica_v1 ps
                WHERE ps.aula_emusys_id = ANY(s.aula_ids)
                  AND ps.resultado_pedagogico IN ('presente', 'falta_confirmada')
              ) THEN 'confirmada'
              WHEN EXISTS (
                SELECT 1
                FROM public.vw_aluno_presenca_semantica_v1 ps
                WHERE ps.aula_emusys_id = ANY(s.aula_ids)
              ) THEN 'evidencia_inconclusiva'
              ELSE 'nao_registrada'
            END
          )
          ORDER BY ae.data_hora_inicio
        )
        FROM slots s
        JOIN public.aulas_emusys ae ON ae.id = s.aula_ancora
      ), '[]'::jsonb)
    ),
    'pendencias_cobraveis', (
      SELECT COALESCE(
        (public.fn_pendencias_do_professor(p_professor_id, false))->>'total_alunos',
        '0'
      )::integer
    )
  )
  INTO v_res;

  RETURN v_res;
END
$function$;

CREATE OR REPLACE FUNCTION public.fabio_briefing_matinal(
  p_professor_id integer,
  p_data date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_nome text;
  v_res jsonb;
BEGIN
  SELECT nome
    INTO v_nome
  FROM public.professores
  WHERE id = p_professor_id
    AND COALESCE(ativo, true);

  IF v_nome IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'motivo', 'professor_nao_encontrado'
    );
  END IF;

  SELECT jsonb_build_object(
    'ok', true,
    'professor_id', p_professor_id,
    'primeiro_nome', split_part(btrim(v_nome), ' ', 1),
    'data', p_data,
    'fonte_presenca', 'vw_aluno_presenca_semantica_v1',
    'aulas', COALESCE((
      WITH slots AS (
        SELECT
          data_hora_inicio,
          data_hora_fim,
          array_agg(id ORDER BY CASE WHEN tipo = 'turma' THEN 0 ELSE 1 END, id) AS aula_ids,
          (array_agg(id ORDER BY CASE WHEN tipo = 'turma' THEN 0 ELSE 1 END, id))[1] AS aula_ancora
        FROM public.aulas_emusys
        WHERE professor_id = p_professor_id
          AND data_aula = p_data
          AND COALESCE(cancelada, false) = false
        GROUP BY data_hora_inicio, data_hora_fim
      )
      SELECT jsonb_agg(
        jsonb_build_object(
          'hora', to_char(
            ae.data_hora_inicio AT TIME ZONE 'America/Sao_Paulo',
            'HH24:MI'
          ),
          'curso', ae.curso_nome,
          'alunos', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'nome', roster.nome,
                'primeiro_nome', split_part(btrim(roster.nome), ' ', 1),
                'resumo_ultima_aula', (
                  SELECT left(
                    regexp_replace(
                      COALESCE(
                        nullif(btrim(fat.campos->>'progresso'), ''),
                        nullif(btrim(reg.campos->>'atividades'), ''),
                        nullif(btrim(reg.texto_consolidado), ''),
                        nullif(btrim(ae2.anotacoes_fabio), ''),
                        nullif(btrim(ae2.anotacoes), '')
                      ),
                      '\s+',
                      ' ',
                      'g'
                    ),
                    110
                  )
                  FROM public.aulas_emusys ae2
                  LEFT JOIN public.fabio_registros_aula reg
                    ON reg.aula_id = ae2.id
                   AND reg.parent_id IS NULL
                  LEFT JOIN public.fabio_registros_aula fat
                    ON fat.parent_id = reg.id
                   AND fat.aluno_id = roster.id
                  WHERE ae2.professor_id = p_professor_id
                    AND ae2.data_aula < p_data
                    AND COALESCE(ae2.cancelada, false) = false
                    AND public.fn_curso_base(ae2.curso_nome) = public.fn_curso_base(ae.curso_nome)
                    AND (
                      EXISTS (
                        SELECT 1
                        FROM public.aula_alunos_emusys rr
                        WHERE rr.aula_emusys_id = ae2.id
                          AND rr.aluno_id = roster.id
                      )
                      OR EXISTS (
                        SELECT 1
                        FROM public.vw_aluno_presenca_semantica_v1 ps
                        WHERE ps.aula_emusys_id = ae2.id
                          AND ps.aluno_id = roster.id
                      )
                    )
                    AND (
                      reg.id IS NOT NULL
                      OR COALESCE(btrim(ae2.anotacoes_fabio), '') <> ''
                      OR COALESCE(btrim(ae2.anotacoes), '') <> ''
                    )
                  ORDER BY ae2.data_aula DESC, ae2.data_hora_inicio DESC
                  LIMIT 1
                )
              )
              ORDER BY roster.nome
            )
            FROM (
              SELECT DISTINCT a.id, a.nome
              FROM public.aula_alunos_emusys r
              JOIN public.alunos a ON a.id = r.aluno_id
              WHERE r.aula_emusys_id = ANY(s.aula_ids)
            ) roster
          ), '[]'::jsonb)
        )
        ORDER BY ae.data_hora_inicio
      )
      FROM slots s
      JOIN public.aulas_emusys ae ON ae.id = s.aula_ancora
    ), '[]'::jsonb)
  )
  INTO v_res;

  RETURN v_res;
END
$function$;

CREATE OR REPLACE FUNCTION public.fabio_pente_fino_unidade(
  p_usuario_id integer,
  p_unidade_nome text,
  p_janela_dias integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_perfil text;
  v_unidade_id uuid;
  v_res jsonb;
  v_janela integer := greatest(14, least(COALESCE(p_janela_dias, 60), 180));
BEGIN
  SELECT perfil
    INTO v_perfil
  FROM public.usuarios
  WHERE id = p_usuario_id
    AND COALESCE(ativo, true);

  IF v_perfil IS NULL OR v_perfil <> 'admin' THEN
    RAISE EXCEPTION 'nao_e_admin' USING errcode = '42501';
  END IF;

  SELECT id
    INTO v_unidade_id
  FROM public.unidades
  WHERE nome ILIKE p_unidade_nome
  LIMIT 1;

  IF v_unidade_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'motivo', 'unidade_nao_encontrada'
    );
  END IF;

  WITH professores_base AS MATERIALIZED (
    SELECT
      p.id,
      p.nome,
      p.usuario_id,
      EXISTS (
        SELECT 1
        FROM public.usuarios u2
        WHERE u2.id = p.usuario_id
          AND COALESCE(u2.ativo, true)
          AND u2.auth_user_id IS NOT NULL
          AND u2.perfil = 'professor'
      ) AS tem_login
    FROM public.professores p
    JOIN public.professores_unidades pu
      ON pu.professor_id = p.id
     AND pu.unidade_id = v_unidade_id
     AND COALESCE(pu.emusys_ativo, true)
    WHERE COALESCE(p.ativo, true)
  ),
  pessoas AS MATERIALIZED (
    SELECT
      c.professor_id,
      c.pessoa_chave,
      i.aluno_ids_locais
    FROM public.vw_professor_carteira_pessoa_canonica_sombra c
    JOIN public.vw_aluno_identidade_unidade_canonica i
      ON i.unidade_id = c.unidade_id
     AND i.pessoa_chave = c.pessoa_chave
    WHERE c.unidade_id = v_unidade_id
  ),
  mapa_pessoas AS MATERIALIZED (
    SELECT
      ps.professor_id,
      ps.pessoa_chave,
      local.aluno_id
    FROM pessoas ps
    CROSS JOIN LATERAL unnest(ps.aluno_ids_locais) AS local(aluno_id)
  ),
  eventos_faltas AS MATERIALIZED (
    SELECT
      mp.professor_id,
      mp.pessoa_chave,
      CASE
        WHEN sem.aula_emusys_id IS NOT NULL THEN 'aula:' || sem.aula_emusys_id::text
        ELSE concat_ws(
          ':',
          'fallback',
          sem.data_aula::text,
          sem.horario_aula::text,
          COALESCE(sem.professor_id::text, 'sem-professor'),
          COALESCE(lower(btrim(sem.curso_nome)), 'sem-curso')
        )
      END AS evento_chave,
      bool_or(sem.resultado_pedagogico = 'falta_confirmada') AS falta_confirmada,
      bool_or(sem.resultado_pedagogico = 'falta_provavel') AS falta_provavel
    FROM public.vw_aluno_presenca_semantica_v1 sem
    JOIN mapa_pessoas mp
      ON mp.aluno_id = sem.aluno_id
     AND mp.professor_id = sem.professor_id
    WHERE sem.unidade_id = v_unidade_id
      AND sem.data_aula >= current_date - v_janela
      AND sem.data_aula <= current_date
    GROUP BY mp.professor_id, mp.pessoa_chave, evento_chave
  ),
  faltas_por_pessoa AS MATERIALIZED (
    SELECT
      professor_id,
      pessoa_chave,
      count(*) FILTER (WHERE falta_confirmada) AS faltas_confirmadas,
      count(*) FILTER (WHERE falta_provavel AND NOT falta_confirmada) AS faltas_provaveis
    FROM eventos_faltas
    GROUP BY professor_id, pessoa_chave
  ),
  agregado_carteira AS MATERIALIZED (
    SELECT
      professor_id,
      count(*)::integer AS total_pessoas
    FROM pessoas
    GROUP BY professor_id
  ),
  agregado_faltas AS MATERIALIZED (
    SELECT
      professor_id,
      count(*) FILTER (WHERE faltas_confirmadas >= 3)::integer
        AS faltas_recorrentes_confirmadas,
      count(*) FILTER (WHERE faltas_provaveis >= 3)::integer
        AS faltas_recorrentes_provaveis
    FROM faltas_por_pessoa
    GROUP BY professor_id
  ),
  frequencia_atual AS MATERIALIZED (
    SELECT f.*
    FROM public.get_frequencia_professor_periodo_publicavel_v1(
      extract(year FROM current_date)::integer,
      extract(month FROM current_date)::integer,
      v_unidade_id,
      current_date - 29,
      current_date
    ) f
  ),
  frequencia_anterior AS MATERIALIZED (
    SELECT f.*
    FROM public.get_frequencia_professor_periodo_publicavel_v1(
      extract(year FROM current_date - 30)::integer,
      extract(month FROM current_date - 30)::integer,
      v_unidade_id,
      current_date - 59,
      current_date - 30
    ) f
  )
  SELECT jsonb_build_object(
    'ok', true,
    'aviso_geral', 'Somente faltas confirmadas entram no indicador oficial. Faltas provaveis ficam separadas para triagem e nunca sao publicadas como fato.',
    'recorte', jsonb_build_object(
      'unidade', p_unidade_nome,
      'janela_dias', v_janela,
      'fonte_carteira', 'vw_professor_carteira_pessoa_canonica_sombra, uma linha por pessoa/professor/unidade',
      'fonte_presenca', 'vw_aluno_presenca_semantica_v1',
      'regra_faltas_recorrentes', '>= 3 faltas_confirmadas na janela, por pessoa canonica',
      'regra_faltas_provaveis', '>= 3 faltas_provaveis na janela, apenas triagem',
      'regra_frequencia', 'percentual publicado somente quando get_frequencia_professor_periodo_publicavel_v1 retorna confianca alta',
      'cobertura_registro', 'mes de referencia mais recente por professor com login ativo; anotacoes_fabio OR anotacoes Emusys',
      'aviso_temporal', 'carteira atual; faltas em janela rolante; frequencia compara dois blocos de 30 dias; cobertura usa o ultimo mes disponivel',
      'gerado_em', now()
    ),
    'professores', COALESCE((
      SELECT jsonb_agg(t.x ORDER BY t.prioridade DESC, t.nome)
      FROM (
        SELECT
          pb.nome,
          jsonb_build_object(
            'professor_id', pb.id,
            'nome', pb.nome,
            'tem_login', pb.tem_login,
            'total_alunos_carteira_unidade', COALESCE(ac.total_pessoas, 0),
            'cobertura_registro_unidade', CASE
              WHEN pb.tem_login THEN (
                SELECT jsonb_build_object(
                  'mes_referencia', ar.mes,
                  'pct_cobertura', ar.pct_cobertura,
                  'aulas', ar.aulas,
                  'com_registro', ar.com_registro
                )
                FROM public.vw_aderencia_registro_professor ar
                WHERE ar.professor_id = pb.id
                  AND ar.unidade_id = v_unidade_id
                ORDER BY ar.mes DESC
                LIMIT 1
              )
              ELSE NULL
            END,
            'alunos_faltas_recorrentes_nao_justificadas', COALESCE(af.faltas_recorrentes_confirmadas, 0),
            'alunos_faltas_recorrentes_incluindo_justificadas', COALESCE(af.faltas_recorrentes_confirmadas, 0),
            'alunos_faltas_provaveis_para_triagem', COALESCE(af.faltas_recorrentes_provaveis, 0),
            'frequencia_ultimos_30_dias', CASE
              WHEN COALESCE(fa.publicavel, false) THEN jsonb_build_object(
                'media_presenca', fa.media_presenca,
                'taxa_faltas', fa.taxa_faltas,
                'cobertura_resultado_confirmado', fa.cobertura_resultado_confirmado,
                'confianca', fa.confianca_presenca,
                'publicavel', true
              )
              ELSE jsonb_build_object(
                'media_presenca', NULL,
                'taxa_faltas', NULL,
                'cobertura_resultado_confirmado', COALESCE(fa.cobertura_resultado_confirmado, 0),
                'confianca', COALESCE(fa.confianca_presenca, 'sem_base'),
                'publicavel', false
              )
            END,
            'dado_suspeito', (
              NOT COALESCE(fa.publicavel, false)
              OR (
                COALESCE(fa.publicavel, false)
                AND COALESCE(fp.publicavel, false)
                AND fp.media_presenca >= 30
                AND fa.media_presenca < fp.media_presenca * 0.5
              )
            ),
            'motivo_suspeita', CASE
              WHEN NOT COALESCE(fa.publicavel, false) THEN format(
                'frequencia nao publicavel: confianca %s, cobertura %s%%',
                COALESCE(fa.confianca_presenca, 'sem_base'),
                round(COALESCE(fa.cobertura_resultado_confirmado, 0) * 100, 1)
              )
              WHEN COALESCE(fp.publicavel, false)
                AND fp.media_presenca >= 30
                AND fa.media_presenca < fp.media_presenca * 0.5 THEN format(
                  'presenca confirmada caiu de %s%% (30-60d atras) para %s%% (ultimos 30d)',
                  round(fp.media_presenca),
                  round(fa.media_presenca)
                )
              ELSE NULL
            END,
            'sinal', CASE
              WHEN pb.tem_login THEN 'com_acesso'
              ELSE 'sem_acesso_ao_app_ainda'
            END
          ) AS x,
          COALESCE(af.faltas_recorrentes_confirmadas, 0) AS prioridade
        FROM professores_base pb
        LEFT JOIN agregado_carteira ac ON ac.professor_id = pb.id
        LEFT JOIN agregado_faltas af ON af.professor_id = pb.id
        LEFT JOIN frequencia_atual fa
          ON fa.professor_id = pb.id
         AND fa.unidade_id = v_unidade_id
        LEFT JOIN frequencia_anterior fp
          ON fp.professor_id = pb.id
         AND fp.unidade_id = v_unidade_id
      ) t
    ), '[]'::jsonb)
  )
  INTO v_res;

  RETURN v_res;
END
$function$;

REVOKE ALL ON FUNCTION public.fabio_contexto_professor(integer, date)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fabio_briefing_matinal(integer, date)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fabio_pente_fino_unidade(integer, text, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fabio_contexto_professor(integer, date)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fabio_briefing_matinal(integer, date)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fabio_pente_fino_unidade(integer, text, integer)
  TO service_role;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabio_agent') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.fabio_contexto_professor(integer, date) TO fabio_agent';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.fabio_briefing_matinal(integer, date) TO fabio_agent';
    EXECUTE 'REVOKE ALL ON FUNCTION public.fabio_pente_fino_unidade(integer, text, integer) FROM fabio_agent';
  END IF;
END
$do$;
