-- P26.2 - Alinha os totais da coordenacao com a mesma consolidacao usada nas telas.
-- As linhas individuais ja eram canonicas; este adaptador elimina media de medias
-- para ocupacao, conversao e renovacao.

DO $$
BEGIN
  IF to_regprocedure(
    'public.get_dados_relatorio_coordenacao(uuid,integer,integer)'
  ) IS NOT NULL
  AND to_regprocedure(
    'public.get_dados_relatorio_coordenacao_pre_totais_20260711(uuid,integer,integer)'
  ) IS NULL THEN
    ALTER FUNCTION public.get_dados_relatorio_coordenacao(uuid, integer, integer)
    RENAME TO get_dados_relatorio_coordenacao_pre_totais_20260711;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dados_relatorio_coordenacao(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_totais jsonb;
BEGIN
  v_result := public.get_dados_relatorio_coordenacao_pre_totais_20260711(
    p_unidade_id,
    p_ano,
    p_mes
  );

  WITH r AS (
    SELECT *
    FROM public.get_kpis_professor_periodo_canonico(
      p_ano,
      p_mes,
      p_unidade_id,
      NULL,
      NULL
    )
  ),
  agregado AS (
    SELECT
      COUNT(DISTINCT r.professor_id)::integer AS total_professores,
      COALESCE(SUM(r.carteira_alunos), 0)::integer AS total_alunos,
      COALESCE(SUM(r.total_turmas), 0)::integer AS total_turmas,
      COALESCE(SUM(r.alunos_via_turmas), 0)::integer AS total_ocupacoes,
      COALESCE(SUM(r.turmas_elegiveis_media), 0)::integer AS total_turmas_elegiveis,
      COALESCE(SUM(r.experimentais), 0)::integer AS experimentais,
      COALESCE(SUM(r.matriculas_pos_exp), 0)::integer AS matriculas_pos_exp,
      COALESCE(SUM(r.renovacoes), 0)::integer AS renovacoes,
      COALESCE(SUM(r.nao_renovacoes), 0)::integer AS nao_renovacoes,
      COALESCE(SUM(r.evasoes), 0)::integer AS evasoes,
      COALESCE(SUM(r.mrr_perdido), 0)::numeric AS mrr_perdido,
      COALESCE(SUM(r.media_presenca * r.carteira_alunos), 0)::numeric AS presenca_ponderada,
      COALESCE(SUM(r.carteira_alunos), 0)::numeric AS peso_presenca
    FROM r
  )
  SELECT jsonb_build_object(
    'total_professores', a.total_professores,
    'total_alunos', a.total_alunos,
    'media_alunos_professor', CASE WHEN a.total_professores > 0
      THEN ROUND(a.total_alunos::numeric / a.total_professores, 1) ELSE 0 END,
    'media_alunos_turma', CASE WHEN a.total_turmas_elegiveis > 0
      THEN ROUND(a.total_ocupacoes::numeric / a.total_turmas_elegiveis, 2) ELSE 0 END,
    'media_presenca', CASE WHEN a.peso_presenca > 0
      THEN ROUND(a.presenca_ponderada / a.peso_presenca, 2) ELSE 0 END,
    'taxa_conversao_media', CASE WHEN a.experimentais > 0
      THEN ROUND(a.matriculas_pos_exp::numeric / a.experimentais * 100, 2) ELSE 0 END,
    'taxa_renovacao_media', CASE WHEN a.renovacoes + a.nao_renovacoes > 0
      THEN ROUND(a.renovacoes::numeric / (a.renovacoes + a.nao_renovacoes) * 100, 2) ELSE 0 END,
    'total_evasoes', a.evasoes,
    'total_matriculas', a.matriculas_pos_exp,
    'mrr_perdido', a.mrr_perdido,
    'total_turmas', a.total_turmas,
    'total_ocupacoes_regulares', a.total_ocupacoes,
    'total_turmas_regulares', a.total_turmas_elegiveis
  )
  INTO v_totais
  FROM agregado a;

  v_result := jsonb_set(
    v_result,
    '{totais}',
    COALESCE(v_result->'totais', '{}'::jsonb) || v_totais,
    true
  );
  v_result := jsonb_set(
    v_result,
    '{fonte_totais_professores}',
    to_jsonb('get_kpis_professor_periodo_canonico'::text),
    true
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_dados_relatorio_coordenacao(uuid, integer, integer)
IS 'Relatorio da coordenacao com linhas e totais derivados da fonte canonica por competencia.';

GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_coordenacao(uuid, integer, integer)
TO authenticated, service_role;
