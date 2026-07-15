-- KPI de professor com presenca submetida ao contrato de publicacao.
-- As demais metricas continuam na fonte canonica vigente; presenca e faltas
-- ficam nulas enquanto a cobertura da chamada nao sustentar uma conclusao.

CREATE OR REPLACE FUNCTION public.get_kpis_professor_periodo_canonico_v2(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid DEFAULT NULL,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL
)
RETURNS TABLE(
  professor_id integer,
  professor_nome text,
  unidade_id uuid,
  ano integer,
  mes integer,
  carteira_alunos integer,
  ticket_medio numeric,
  media_presenca numeric,
  taxa_faltas numeric,
  mrr_carteira numeric,
  nps_medio numeric,
  media_alunos_turma numeric,
  experimentais integer,
  experimentais_agendadas integer,
  experimentais_faltas integer,
  matriculas integer,
  matriculas_pos_exp integer,
  matriculas_diretas integer,
  taxa_conversao numeric,
  renovacoes integer,
  nao_renovacoes integer,
  taxa_renovacao numeric,
  evasoes integer,
  mrr_perdido numeric,
  taxa_cancelamento numeric,
  total_turmas integer,
  alunos_via_turmas integer,
  turmas_elegiveis_media integer,
  presenca_publicavel boolean,
  presenca_cobertura numeric,
  presenca_confianca text,
  presenca_eventos_confirmados integer,
  presenca_eventos_incertos integer,
  presenca_regra_versao text
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
      IF NOT public.usuario_tem_permissao(
        v_usuario_id,
        'professores.ver',
        p_unidade_id
      ) THEN
        RAISE EXCEPTION 'Acesso negado: sem permissao para professores'
          USING ERRCODE = '42501';
      END IF;
      v_unidade_efetiva := p_unidade_id;
    ELSE
      IF v_unidade_usuario IS NULL
         OR (p_unidade_id IS NOT NULL AND p_unidade_id <> v_unidade_usuario)
         OR NOT public.usuario_tem_permissao(
           v_usuario_id,
           'professores.ver',
           v_unidade_usuario
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
    b.professor_nome,
    b.unidade_id,
    b.ano,
    b.mes,
    b.carteira_alunos,
    b.ticket_medio,
    f.media_presenca,
    f.taxa_faltas,
    b.mrr_carteira,
    b.nps_medio,
    b.media_alunos_turma,
    b.experimentais,
    b.experimentais_agendadas,
    b.experimentais_faltas,
    b.matriculas,
    b.matriculas_pos_exp,
    b.matriculas_diretas,
    b.taxa_conversao,
    b.renovacoes,
    b.nao_renovacoes,
    b.taxa_renovacao,
    b.evasoes,
    b.mrr_perdido,
    b.taxa_cancelamento,
    b.total_turmas,
    b.alunos_via_turmas,
    b.turmas_elegiveis_media,
    COALESCE(f.publicavel, false),
    COALESCE(f.cobertura_resultado_confirmado, 0),
    COALESCE(f.confianca_presenca, 'sem_base'),
    COALESCE(f.eventos_resultado_confirmado, 0),
    COALESCE(f.eventos_incertos, 0),
    COALESCE(f.regra_versao, 'frequencia-professor-publicavel-v1')
  FROM public.get_kpis_professor_periodo_canonico(
    p_ano,
    p_mes,
    v_unidade_efetiva,
    p_data_inicio,
    p_data_fim
  ) b
  LEFT JOIN public.get_frequencia_professor_periodo_publicavel_v1(
    p_ano,
    p_mes,
    v_unidade_efetiva,
    p_data_inicio,
    p_data_fim
  ) f
    ON f.professor_id = b.professor_id
   AND f.unidade_id = b.unidade_id
  ORDER BY b.professor_id, b.unidade_id;
END;
$$;

COMMENT ON FUNCTION public.get_kpis_professor_periodo_canonico_v2(
  integer, integer, uuid, date, date
) IS
  'KPI de professor com presenca publicavel apenas quando a chamada tem confianca alta e escopo de unidade validado.';

REVOKE ALL ON FUNCTION public.get_kpis_professor_periodo_canonico_v2(
  integer, integer, uuid, date, date
) FROM PUBLIC, anon, authenticated, fabio_agent;
GRANT EXECUTE ON FUNCTION public.get_kpis_professor_periodo_canonico_v2(
  integer, integer, uuid, date, date
) TO authenticated, service_role;
