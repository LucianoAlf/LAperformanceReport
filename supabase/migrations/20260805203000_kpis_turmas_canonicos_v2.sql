-- KPI canonico de ocupacao de turmas v2.
--
-- Formula homologada:
--   ocupacoes regulares elegiveis / professor-turmas regulares elegiveis.
-- Uma turma sem ocupacao elegivel nao existe no detalhe e, portanto, fica fora
-- do denominador. O diagnostico de turma unitaria usa exatamente o mesmo
-- universo de professor, unidade e turma.

CREATE OR REPLACE FUNCTION public.get_kpis_turmas_canonicos_v2(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid DEFAULT NULL,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL
)
RETURNS TABLE (
  professor_id integer,
  unidade_id uuid,
  ano integer,
  mes integer,
  ocupacoes_elegiveis integer,
  turmas_elegiveis integer,
  media_alunos_turma numeric,
  turmas_um_aluno integer,
  percentual_turmas_um_aluno numeric,
  competencia_status text,
  fonte text,
  regra_versao text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_usuario_id integer;
  v_perfil text;
  v_unidade_usuario uuid;
  v_unidade_efetiva uuid;
BEGIN
  IF p_mes < 1 OR p_mes > 12 THEN
    RAISE EXCEPTION 'Mes invalido: %', p_mes USING ERRCODE = '22023';
  END IF;

  IF auth.role() = 'service_role' THEN
    v_unidade_efetiva := p_unidade_id;
  ELSE
    SELECT u.id, u.perfil, u.unidade_id
      INTO v_usuario_id, v_perfil, v_unidade_usuario
    FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.ativo = true
    LIMIT 1;

    IF v_usuario_id IS NULL THEN
      RAISE EXCEPTION 'Acesso negado: usuario sem cadastro ativo'
        USING ERRCODE = '42501';
    END IF;

    IF v_perfil = 'admin' THEN
      IF NOT (
        public.usuario_tem_permissao(v_usuario_id, 'professores.ver', p_unidade_id)
        OR public.usuario_tem_permissao(v_usuario_id, 'alunos.ver', p_unidade_id)
      ) THEN
        RAISE EXCEPTION 'Acesso negado: sem permissao para turmas'
          USING ERRCODE = '42501';
      END IF;
      v_unidade_efetiva := p_unidade_id;
    ELSIF v_perfil = 'unidade' THEN
      IF v_unidade_usuario IS NULL
         OR (p_unidade_id IS NOT NULL AND p_unidade_id <> v_unidade_usuario) THEN
        RAISE EXCEPTION 'Acesso negado: unidade fora do escopo do usuario'
          USING ERRCODE = '42501';
      END IF;
      v_unidade_efetiva := v_unidade_usuario;
    ELSE
      IF v_unidade_usuario IS NULL
         OR (p_unidade_id IS NOT NULL AND p_unidade_id <> v_unidade_usuario)
         OR NOT (
           public.usuario_tem_permissao(v_usuario_id, 'professores.ver', v_unidade_usuario)
           OR public.usuario_tem_permissao(v_usuario_id, 'alunos.ver', v_unidade_usuario)
         ) THEN
        RAISE EXCEPTION 'Acesso negado: unidade fora do escopo do usuario'
          USING ERRCODE = '42501';
      END IF;
      v_unidade_efetiva := v_unidade_usuario;
    END IF;
  END IF;

  RETURN QUERY
  WITH detalhe AS (
    SELECT d.*
    FROM public.get_carteira_professor_periodo_detalhe_canonico_v1(
      p_ano,
      p_mes,
      v_unidade_efetiva,
      p_data_inicio,
      p_data_fim
    ) d
    WHERE d.elegivel_media
      AND d.pessoa_chave IS NOT NULL
      AND d.turma_chave IS NOT NULL
  ), ocupacao_turma AS (
    SELECT
      d.professor_id,
      d.unidade_id,
      d.turma_chave,
      count(DISTINCT jsonb_build_array(
        d.pessoa_chave,
        d.ocupacao_chave
      ))::integer AS ocupacoes_na_turma
    FROM detalhe d
    GROUP BY d.professor_id, d.unidade_id, d.turma_chave
  ), unitarias AS (
    SELECT
      o.professor_id,
      o.unidade_id,
      count(*) FILTER (WHERE o.ocupacoes_na_turma = 1)::integer AS turmas_um_aluno
    FROM ocupacao_turma o
    GROUP BY o.professor_id, o.unidade_id
  )
  SELECT
    k.professor_id,
    k.unidade_id,
    k.ano,
    k.mes,
    k.ocupacoes_elegiveis,
    k.turmas_elegiveis,
    k.media_alunos_turma,
    coalesce(u.turmas_um_aluno, 0)::integer AS turmas_um_aluno,
    CASE
      WHEN k.turmas_elegiveis > 0 THEN round(
        coalesce(u.turmas_um_aluno, 0)::numeric
          / k.turmas_elegiveis::numeric * 100,
        2
      )
      ELSE 0::numeric
    END AS percentual_turmas_um_aluno,
    k.competencia_status,
    'carteira_professor_periodo_canonica'::text AS fonte,
    'turmas_v2_pessoa_professor_turma_regular'::text AS regra_versao
  FROM public.get_kpis_turmas_canonicos_v1(
    p_ano,
    p_mes,
    v_unidade_efetiva,
    p_data_inicio,
    p_data_fim
  ) k
  LEFT JOIN unitarias u
    ON u.professor_id = k.professor_id
   AND u.unidade_id = k.unidade_id;
END;
$$;

COMMENT ON FUNCTION public.get_kpis_turmas_canonicos_v2(
  integer, integer, uuid, date, date
) IS 'Ocupacoes regulares por professor-turma elegivel; publica numerador, denominador, media e turmas unitarias no mesmo universo.';

REVOKE ALL ON FUNCTION public.get_kpis_turmas_canonicos_v2(
  integer, integer, uuid, date, date
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_kpis_turmas_canonicos_v2(
  integer, integer, uuid, date, date
) TO authenticated, service_role;
