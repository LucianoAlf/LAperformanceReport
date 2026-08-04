-- Fonte publica neutra para a Media de Alunos por Turma.
-- A aritmetica continua na carteira canonica homologada do professor:
-- pares pessoa/turma regular divididos por turmas regulares elegiveis.

CREATE OR REPLACE FUNCTION public.get_kpis_turmas_canonicos_v1(
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
  v_inicio date := COALESCE(p_data_inicio, make_date(p_ano, p_mes, 1));
  v_fim date := COALESCE(
    p_data_fim,
    (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date
  );
BEGIN
  IF p_mes < 1 OR p_mes > 12 THEN
    RAISE EXCEPTION 'Mes invalido: %', p_mes USING ERRCODE = '22023';
  END IF;

  IF v_fim < v_inicio THEN
    RAISE EXCEPTION 'Periodo invalido: data final anterior a inicial'
      USING ERRCODE = '22023';
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
  SELECT
    b.professor_id,
    b.unidade_id,
    p_ano AS ano,
    p_mes AS mes,
    b.alunos_via_turmas AS ocupacoes_elegiveis,
    b.turmas_elegiveis_media AS turmas_elegiveis,
    CASE
      WHEN b.turmas_elegiveis_media > 0
        THEN b.alunos_via_turmas::numeric / b.turmas_elegiveis_media
      ELSE 0::numeric
    END AS media_alunos_turma,
    CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM generate_series(
          date_trunc('month', v_inicio)::date,
          date_trunc('month', v_fim)::date,
          interval '1 month'
        ) AS periodo(mes_ref)
        LEFT JOIN public.competencias_mensais cm
          ON cm.unidade_id = b.unidade_id
         AND cm.ano = extract(year FROM periodo.mes_ref)::integer
         AND cm.mes = extract(month FROM periodo.mes_ref)::integer
        WHERE COALESCE(cm.status, 'aberto') NOT IN ('fechado', 'retificacao_pendente')
      ) THEN 'fechado'::text
      ELSE 'aberto'::text
    END AS competencia_status,
    'carteira_professor_periodo_canonica'::text AS fonte,
    'turmas_v1_pessoa_turma_regular'::text AS regra_versao
  FROM public.get_carteira_professor_periodo_canonica(
    p_ano,
    p_mes,
    v_unidade_efetiva,
    p_data_inicio,
    p_data_fim
  ) b;
END;
$$;

COMMENT ON FUNCTION public.get_kpis_turmas_canonicos_v1(
  integer, integer, uuid, date, date
) IS 'Media por turma: pares pessoa/turma regular divididos por turmas regulares elegiveis, com escopo por unidade e competencia.';

REVOKE ALL ON FUNCTION public.get_kpis_turmas_canonicos_v1(
  integer, integer, uuid, date, date
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_kpis_turmas_canonicos_v1(
  integer, integer, uuid, date, date
) TO authenticated, service_role;
