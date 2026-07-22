-- Unifica a classificacao de fontes humanas e entrega presenca semantica na
-- ficha do LA Teacher sem alterar a evidencia bruta.

CREATE OR REPLACE FUNCTION public.fn_presenca_e_forte(
  p_respondido_por text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(
    p_respondido_por IN (
      'professor_la_teacher',
      'fabio_audio',
      'manual',
      'professor_whatsapp'
    ),
    false
  )
$$;

COMMENT ON FUNCTION public.fn_presenca_e_forte(text) IS
  'Matriz canonica de fontes humanas fortes para escrita, selo operacional e leitura semantica de presenca.';

CREATE OR REPLACE VIEW public.vw_aluno_presenca_semantica_v1
WITH (security_invoker = true) AS
WITH evidencia AS (
  SELECT
    ap.*,
    COALESCE(NULLIF(lower(ap.emusys_presenca_bruta), ''), lower(ap.status))
      AS estado_emusys_bruto,
    ae.emusys_id AS aula_emusys_evento_id,
    ae.cancelada AS aula_cancelada,
    ae.justificada AS aula_justificada,
    ae.categoria AS aula_categoria,
    ae.tipo AS aula_tipo,
    ae.data_hora_inicio,
    lower(NULLIF(ae.professor_presenca, '')) AS professor_presenca_emusys,
    CASE
      WHEN ap.aula_emusys_id IS NOT NULL THEN
        bool_or(ap.status = 'presente') OVER (PARTITION BY ap.aula_emusys_id)
      ELSE ap.status = 'presente'
    END AS evento_tem_aluno_presente,
    politica.id AS politica_confiabilidade_id,
    politica.ausencia_emusys_resultado,
    politica.exige_revisao_operacional,
    politica.evidencia AS politica_evidencia,
    revisao.status AS revisao_status
  FROM public.aluno_presenca ap
  LEFT JOIN public.aulas_emusys ae ON ae.id = ap.aula_emusys_id
  LEFT JOIN LATERAL (
    SELECT p.*
    FROM public.presenca_politicas_confiabilidade p
    WHERE p.unidade_id = ap.unidade_id
      AND p.ativa
      AND ap.data_aula BETWEEN p.data_inicio AND p.data_fim
    ORDER BY p.data_inicio DESC, p.created_at DESC, p.id
    LIMIT 1
  ) politica ON true
  LEFT JOIN public.aluno_presenca_revisoes_operacionais revisao
    ON revisao.aluno_presenca_id = ap.id
),
classificada AS (
  SELECT
    e.*,
    lower(COALESCE(e.status, 'desconhecido')) AS estado_origem,
    CASE
      WHEN e.respondido_por = 'professor_la_teacher' THEN 'la_teacher'
      WHEN e.respondido_por = 'fabio_audio' THEN 'fabio_audio'
      WHEN e.respondido_por = 'professor_whatsapp' THEN 'professor_whatsapp'
      WHEN e.respondido_por = 'manual' THEN 'manual'
      WHEN e.respondido_por IN ('emusys', 'sistema') THEN 'emusys'
      ELSE 'desconhecida'
    END AS proveniencia,
    CASE
      WHEN e.status = 'presente' THEN 'registrada'
      WHEN COALESCE(e.aula_cancelada, false)
        OR COALESCE(e.aula_justificada, false) THEN 'nao_aplicavel'
      WHEN public.fn_presenca_e_forte(e.respondido_por)
        AND e.status = 'ausente' THEN 'registrada'
      WHEN e.respondido_por IN ('emusys', 'sistema')
        AND e.estado_emusys_bruto = 'ausente'
        AND e.ausencia_emusys_resultado = 'falta_confirmada'
        THEN 'registrada_atestada'
      WHEN e.respondido_por IN ('emusys', 'sistema')
        AND e.estado_emusys_bruto = 'ausente'
        AND (
          e.evento_tem_aluno_presente
          OR e.professor_presenca_emusys = 'presente'
        ) THEN 'registrada_inferida'
      ELSE 'indeterminada'
    END AS situacao_chamada,
    CASE
      WHEN e.status = 'presente' THEN 'presente'
      WHEN COALESCE(e.aula_cancelada, false) THEN 'aula_cancelada'
      WHEN COALESCE(e.aula_justificada, false) THEN 'aula_justificada'
      WHEN public.fn_presenca_e_forte(e.respondido_por)
        AND e.status = 'ausente' THEN 'falta_confirmada'
      WHEN e.respondido_por IN ('emusys', 'sistema')
        AND e.estado_emusys_bruto = 'ausente'
        AND e.ausencia_emusys_resultado = 'falta_confirmada'
        THEN 'falta_confirmada'
      WHEN e.respondido_por IN ('emusys', 'sistema')
        AND e.estado_emusys_bruto = 'ausente'
        AND (
          e.evento_tem_aluno_presente
          OR e.professor_presenca_emusys = 'presente'
        ) THEN 'falta_provavel'
      ELSE 'indeterminado'
    END AS resultado_pedagogico
  FROM evidencia e
)
SELECT
  c.id AS aluno_presenca_id,
  c.aluno_id,
  c.professor_id,
  c.unidade_id,
  c.aula_emusys_id,
  c.aula_emusys_evento_id,
  c.data_aula,
  c.horario_aula,
  c.data_hora_inicio,
  c.curso_nome,
  c.turma_nome,
  c.aula_categoria,
  c.aula_tipo,
  c.estado_origem,
  c.respondido_por,
  c.respondido_em,
  c.proveniencia,
  c.situacao_chamada,
  c.resultado_pedagogico,
  CASE
    WHEN c.resultado_pedagogico IN (
      'presente', 'aula_cancelada', 'aula_justificada', 'falta_confirmada'
    ) THEN 'confirmada'
    WHEN c.resultado_pedagogico = 'falta_provavel' THEN 'provavel'
    ELSE 'desconhecida'
  END AS confianca,
  c.resultado_pedagogico IN ('presente', 'falta_confirmada')
    AS considera_frequencia_denominador,
  c.resultado_pedagogico = 'presente' AS considera_presenca,
  c.resultado_pedagogico = 'falta_confirmada' AS considera_falta,
  c.resultado_pedagogico IN ('aula_cancelada', 'aula_justificada')
    AS exclui_por_evento,
  public.fn_presenca_e_forte(c.respondido_por)
    AND c.respondido_em IS NOT NULL AS respondido_em_confiavel,
  (
    c.status = 'presente'
    AND (COALESCE(c.aula_cancelada, false) OR COALESCE(c.aula_justificada, false))
  ) AS possui_conflito,
  'presenca-semantica-v1.3'::text AS regra_versao,
  c.estado_emusys_bruto,
  c.sincronizado_emusys_em,
  c.professor_presenca_emusys,
  CASE
    WHEN public.fn_presenca_e_forte(c.respondido_por) THEN c.respondido_em
    ELSE c.sincronizado_emusys_em
  END AS evidencia_registrada_em,
  c.politica_confiabilidade_id,
  CASE
    WHEN public.fn_presenca_e_forte(c.respondido_por)
      THEN 'resposta_humana_explicita'
    WHEN c.estado_emusys_bruto = 'ausente'
      AND c.politica_confiabilidade_id IS NOT NULL
      THEN c.politica_evidencia
    WHEN c.resultado_pedagogico = 'falta_provavel'
      THEN 'evidencia_de_que_a_aula_ocorreu'
    ELSE 'regra_conservadora_sem_atestado'
  END AS fundamento_confianca,
  (
    COALESCE(c.exige_revisao_operacional, false)
    AND NOT public.fn_presenca_e_forte(c.respondido_por)
    AND c.respondido_por IN ('emusys', 'sistema')
    AND c.estado_emusys_bruto = 'ausente'
    AND NOT COALESCE(c.aula_cancelada, false)
    AND NOT COALESCE(c.aula_justificada, false)
  ) AS revisao_operacional_exigida,
  CASE
    WHEN COALESCE(c.exige_revisao_operacional, false)
      AND NOT public.fn_presenca_e_forte(c.respondido_por)
      AND c.respondido_por IN ('emusys', 'sistema')
      AND c.estado_emusys_bruto = 'ausente'
      AND NOT COALESCE(c.aula_cancelada, false)
      AND NOT COALESCE(c.aula_justificada, false)
      THEN COALESCE(c.revisao_status, 'pendente')
    ELSE 'nao_exigida'
  END AS revisao_operacional_status
FROM classificada c;

COMMENT ON VIEW public.vw_aluno_presenca_semantica_v1 IS
  'Presenca semantica v1.3. Fontes humanas fortes usam fn_presenca_e_forte; politicas temporais atestam ausencia Emusys sem reescrever evidencia bruta.';

REVOKE ALL ON TABLE public.vw_aluno_presenca_semantica_v1
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.vw_aluno_presenca_semantica_v1 TO service_role;

DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY[
    'fabio_agent',
    'lia_acesso_restrito',
    'mila_acesso_restrito',
    'sol_acesso_restrito'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE public.vw_aluno_presenca_semantica_v1 FROM %I',
        v_role
      );
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_aluno_ficha(
  p_aluno_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prof integer := public.fn_professor_do_usuario();
  v_ok boolean;
  v_nome text;
  v_cursos text[];
  v_res jsonb;
BEGIN
  IF v_prof IS NULL THEN
    RAISE EXCEPTION 'sem_professor_vinculado' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.vw_jornada_professor_atual v
    WHERE v.professor_id = v_prof
      AND v.aluno_id = p_aluno_id
  ) INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'aluno_fora_da_sua_carteira' USING ERRCODE = '42501';
  END IF;

  SELECT nome INTO v_nome
  FROM public.alunos
  WHERE id = p_aluno_id;

  SELECT array_agg(DISTINCT public.fn_curso_base(v.curso_nome))
  INTO v_cursos
  FROM public.vw_jornada_professor_atual v
  WHERE v.professor_id = v_prof
    AND v.aluno_id = p_aluno_id;

  SELECT jsonb_build_object(
    'perfil', (
      SELECT jsonb_build_object(
        'aluno_id', a.id,
        'nome', a.nome,
        'foto_url', a.foto_url,
        'idade', a.idade_atual,
        'data_nascimento', a.data_nascimento,
        'classificacao', a.classificacao,
        'modalidade', a.modalidade,
        'unidade', un.nome,
        'data_matricula', a.data_matricula,
        'meses_de_casa', CASE
          WHEN a.data_matricula IS NOT NULL
            THEN floor((now()::date - a.data_matricula) / 30.44)::int
        END,
        'status', a.status,
        'is_retorno', a.is_aluno_retorno,
        'is_segundo_curso', a.is_segundo_curso
      )
      FROM public.alunos a
      LEFT JOIN public.unidades un ON un.id = a.unidade_id
      WHERE a.id = p_aluno_id
    ),
    'minha_jornada', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'curso', v.curso_nome,
        'aula_atual', v.nr_aulas_passadas + 1,
        'aulas_contratadas', v.nr_aulas_contratadas,
        'aulas_realizadas', v.nr_aulas_passadas,
        'jornada_label', v.jornada_label,
        'dia_aula', v.dia_semana,
        'horario', v.horario,
        'status_matricula', v.status_matricula,
        'percentual', CASE
          WHEN COALESCE(v.nr_aulas_contratadas, 0) > 0
            THEN round((v.nr_aulas_passadas::numeric / v.nr_aulas_contratadas) * 100)
        END
      ))
      FROM public.vw_jornada_professor_atual v
      WHERE v.professor_id = v_prof
        AND v.aluno_id = p_aluno_id
    ), '[]'::jsonb),
    'outros_cursos', COALESCE((
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'curso', v2.curso_nome,
        'professor', v2.professor_nome
      ))
      FROM public.vw_jornada_professor_atual v2
      WHERE v2.aluno_nome = v_nome
        AND v2.professor_id IS DISTINCT FROM v_prof
    ), '[]'::jsonb),
    'responsaveis', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'nome', c.nome,
        'parentesco', c.parentesco,
        'principal', c.principal
      ))
      FROM public.aluno_contatos c
      WHERE c.aluno_id = p_aluno_id
    ), '[]'::jsonb),
    'presenca_recente', COALESCE((
      SELECT jsonb_agg(t.x ORDER BY t.data_aula DESC, t.horario_aula DESC)
      FROM (
        SELECT
          jsonb_build_object(
            'data', ps.data_aula,
            'horario', ps.horario_aula,
            'status', ps.estado_origem,
            'resultado_pedagogico', ps.resultado_pedagogico,
            'situacao_chamada', ps.situacao_chamada,
            'confianca', ps.confianca,
            'proveniencia', ps.proveniencia,
            'revisao_operacional_exigida', ps.revisao_operacional_exigida,
            'revisao_operacional_status', ps.revisao_operacional_status,
            'curso', ps.curso_nome
          ) AS x,
          ps.data_aula,
          ps.horario_aula
        FROM public.vw_aluno_presenca_semantica_v1 ps
        WHERE ps.aluno_id = p_aluno_id
          AND ps.professor_id = v_prof
        ORDER BY ps.data_aula DESC, ps.horario_aula DESC
        LIMIT 10
      ) t
    ), '[]'::jsonb),
    'historico_pedagogico', COALESCE((
      SELECT jsonb_agg(u.x ORDER BY u.data_aula DESC)
      FROM (
        SELECT t.x, t.data_aula
        FROM (
          SELECT DISTINCT ON (ae.data_aula)
            jsonb_build_object(
              'data', ae.data_aula,
              'curso', ae.curso_nome,
              'texto', COALESCE(NULLIF(btrim(ae.anotacoes_fabio), ''), ae.anotacoes),
              'origem', CASE
                WHEN COALESCE(btrim(ae.anotacoes_fabio), '') <> '' THEN 'fabio'
                ELSE 'emusys'
              END,
              'foi_voce', ae.professor_id = v_prof
            ) AS x,
            ae.data_aula
          FROM public.aulas_emusys ae
          WHERE COALESCE(ae.cancelada, false) = false
            AND public.fn_curso_base(ae.curso_nome) = ANY(v_cursos)
            AND COALESCE(btrim(COALESCE(ae.anotacoes_fabio, ae.anotacoes)), '') <> ''
            AND (
              EXISTS (
                SELECT 1
                FROM public.aula_alunos_emusys r
                WHERE r.aula_emusys_id = ae.id
                  AND r.aluno_id = p_aluno_id
              )
              OR EXISTS (
                SELECT 1
                FROM public.aluno_presenca ap
                WHERE ap.aula_emusys_id = ae.id
                  AND ap.aluno_id = p_aluno_id
              )
            )
          ORDER BY ae.data_aula DESC, ae.professor_id IS NULL, ae.id
        ) t
        ORDER BY t.data_aula DESC
        LIMIT 10
      ) u
    ), '[]'::jsonb)
  ) INTO v_res;

  RETURN v_res;
END;
$$;

COMMENT ON FUNCTION public.app_aluno_ficha(integer) IS
  'Ficha escopada do LA Teacher. Preserva status bruto por compatibilidade e expoe resultado pedagogico da presenca semantica v1.3.';

REVOKE ALL ON FUNCTION public.app_aluno_ficha(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_aluno_ficha(integer) TO authenticated;
