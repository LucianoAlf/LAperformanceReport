-- ============================================================================
-- P09A - Preview read-only de fechamento mensal
-- Projeto alvo: ouqwbbermlzqqvtqwlul
--
-- Objetivo:
-- - Montar uma leitura de conferencia antes do fechamento de Junho/2026.
-- - Comparar fontes vivas canonicas com dados_mensais existente.
-- - Expor alertas sem gravar snapshot, competencia, historico ou aluno.
--
-- Nao faz:
-- - UPDATE/DELETE/INSERT em qualquer tabela de negocio.
-- - sync/backfill/recalculo.
-- - fechamento de competencia.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.preview_fechamento_mensal(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid DEFAULT NULL::uuid,
  p_incluir_payloads boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_admin_all jsonb;
  v_canon_all jsonb;
  v_comercial_all jsonb;
  v_unidades jsonb := '[]'::jsonb;
  v_bloqueios jsonb := '[]'::jsonb;
  v_alertas jsonb := '[]'::jsonb;
  v_payload jsonb;
  v_trimestre integer := CEIL(p_mes::numeric / 3)::integer;

  v_unidade record;
  v_comp record;
  v_dm record;
  v_admin_obj jsonb;
  v_canon_obj jsonb;
  v_comercial_obj jsonb;
  v_relatorio_gerencial jsonb;
  v_relatorio_coordenacao jsonb;
  v_matriculador jsonb;
  v_fideliza jsonb;
  v_dados_mensais_diff jsonb;
  v_unidade_alertas jsonb;
  v_unidade_bloqueios jsonb;
BEGIN
  IF p_mes < 1 OR p_mes > 12 THEN
    RAISE EXCEPTION 'Mes invalido: %', p_mes;
  END IF;

  v_admin_all := public.get_kpis_alunos_admin_operacional(p_unidade_id, p_ano, p_mes);
  v_canon_all := public.get_kpis_alunos_canonicos(p_unidade_id, p_ano, p_mes);
  v_comercial_all := public.get_kpis_comercial_canonicos_v2(p_unidade_id, p_ano, p_mes, 'mensal', NULL::date);

  FOR v_unidade IN
    SELECT id, nome
    FROM public.unidades
    WHERE ativo = true
      AND (p_unidade_id IS NULL OR id = p_unidade_id)
    ORDER BY nome
  LOOP
    v_unidade_alertas := '[]'::jsonb;
    v_unidade_bloqueios := '[]'::jsonb;
    v_relatorio_gerencial := NULL;
    v_relatorio_coordenacao := NULL;
    v_matriculador := NULL;
    v_fideliza := NULL;

    SELECT value
    INTO v_admin_obj
    FROM jsonb_array_elements(COALESCE(v_admin_all->'por_unidade', '[]'::jsonb)) AS t(value)
    WHERE value->>'unidade_id' = v_unidade.id::text
    LIMIT 1;

    SELECT value
    INTO v_canon_obj
    FROM jsonb_array_elements(COALESCE(v_canon_all->'por_unidade', '[]'::jsonb)) AS t(value)
    WHERE value->>'unidade_id' = v_unidade.id::text
    LIMIT 1;

    SELECT value
    INTO v_comercial_obj
    FROM jsonb_array_elements(COALESCE(v_comercial_all->'por_unidade', '[]'::jsonb)) AS t(value)
    WHERE value->>'unidade_id' = v_unidade.id::text
    LIMIT 1;

    SELECT *
    INTO v_comp
    FROM public.competencias_mensais cm
    WHERE cm.unidade_id = v_unidade.id
      AND cm.ano = p_ano
      AND cm.mes = p_mes
    LIMIT 1;

    SELECT *
    INTO v_dm
    FROM public.dados_mensais dm
    WHERE dm.unidade_id = v_unidade.id
      AND dm.ano = p_ano
      AND dm.mes = p_mes
    LIMIT 1;

    IF v_admin_obj IS NULL THEN
      v_unidade_bloqueios := v_unidade_bloqueios || jsonb_build_array('admin_operacional_indisponivel');
    END IF;

    IF v_canon_obj IS NULL THEN
      v_unidade_bloqueios := v_unidade_bloqueios || jsonb_build_array('alunos_canonicos_indisponivel');
    END IF;

    IF v_comercial_obj IS NULL THEN
      v_unidade_bloqueios := v_unidade_bloqueios || jsonb_build_array('comercial_canonico_indisponivel');
    END IF;

    IF v_admin_obj IS NOT NULL AND v_canon_obj IS NOT NULL THEN
      IF COALESCE((v_admin_obj->>'matriculas_ativas')::integer, -1) <> COALESCE((v_canon_obj->>'matriculas_ativas')::integer, -2)
        OR COALESCE((v_admin_obj->>'matriculas_banda')::integer, -1) <> COALESCE((v_canon_obj->>'matriculas_banda')::integer, -2)
        OR COALESCE((v_admin_obj->>'alunos_ativos')::integer, -1) <> COALESCE((v_canon_obj->>'alunos_ativos')::integer, -2)
      THEN
        v_unidade_bloqueios := v_unidade_bloqueios || jsonb_build_array('admin_vs_canonico_divergente');
      END IF;

      IF COALESCE((v_canon_obj->>'tempo_permanencia')::numeric, 0) = 0
        OR COALESCE((v_canon_obj->>'ltv_medio')::numeric, 0) = 0
      THEN
        v_unidade_bloqueios := v_unidade_bloqueios || jsonb_build_array('tempo_ltv_zerado');
      END IF;
    END IF;

    IF v_dm.id IS NULL THEN
      v_unidade_alertas := v_unidade_alertas || jsonb_build_array('dados_mensais_ausente');
      v_dados_mensais_diff := NULL;
    ELSE
      v_dados_mensais_diff := jsonb_build_object(
        'alunos_ativos', jsonb_build_object('dados_mensais', v_dm.alunos_ativos, 'preview', COALESCE((v_admin_obj->>'alunos_ativos')::integer, NULL)),
        'alunos_pagantes', jsonb_build_object('dados_mensais', v_dm.alunos_pagantes, 'preview', COALESCE((v_canon_obj->>'alunos_pagantes')::integer, NULL)),
        'matriculas_ativas', jsonb_build_object('dados_mensais', v_dm.matriculas_ativas, 'preview', COALESCE((v_admin_obj->>'matriculas_ativas')::integer, NULL)),
        'matriculas_banda', jsonb_build_object('dados_mensais', v_dm.matriculas_banda, 'preview', COALESCE((v_admin_obj->>'matriculas_banda')::integer, NULL)),
        'matriculas_2_curso', jsonb_build_object('dados_mensais', v_dm.matriculas_2_curso, 'preview', COALESCE((v_admin_obj->>'matriculas_2_curso')::integer, NULL)),
        'novas_matriculas', jsonb_build_object('dados_mensais', v_dm.novas_matriculas, 'preview', COALESCE((v_admin_obj->>'novas_matriculas')::integer, NULL)),
        'evasoes', jsonb_build_object('dados_mensais', v_dm.evasoes, 'preview', COALESCE((v_canon_obj->>'evasoes')::integer, NULL)),
        'ticket_medio', jsonb_build_object('dados_mensais', v_dm.ticket_medio, 'preview', COALESCE((v_canon_obj->>'ticket_medio')::numeric, NULL)),
        'tempo_permanencia', jsonb_build_object('dados_mensais', v_dm.tempo_permanencia, 'preview', COALESCE((v_canon_obj->>'tempo_permanencia')::numeric, NULL)),
        'inadimplencia', jsonb_build_object('dados_mensais', v_dm.inadimplencia, 'preview', COALESCE((v_canon_obj->>'inadimplencia')::numeric, NULL)),
        'bolsistas_integrais', jsonb_build_object('dados_mensais', v_dm.bolsistas_integrais, 'preview', COALESCE((v_admin_obj->>'bolsistas_integrais')::integer, NULL)),
        'bolsistas_parciais', jsonb_build_object('dados_mensais', v_dm.bolsistas_parciais, 'preview', COALESCE((v_admin_obj->>'bolsistas_parciais')::integer, NULL))
      );

      IF EXISTS (
        SELECT 1
        FROM jsonb_each(v_dados_mensais_diff) AS diff(campo, leitura)
        WHERE COALESCE(leitura->>'dados_mensais', '') <> COALESCE(leitura->>'preview', '')
      ) THEN
        v_unidade_alertas := v_unidade_alertas || jsonb_build_array('dados_mensais_divergente_do_preview');
      END IF;
    END IF;

    IF v_comp.id IS NULL THEN
      v_unidade_alertas := v_unidade_alertas || jsonb_build_array('competencia_sem_registro');
    ELSIF v_comp.status IN ('fechado', 'fechada', 'travado', 'travada') THEN
      v_unidade_alertas := v_unidade_alertas || jsonb_build_array('competencia_ja_fechada');
    END IF;

    IF p_incluir_payloads THEN
      BEGIN
        v_relatorio_gerencial := public.get_dados_relatorio_gerencial(v_unidade.id, p_ano, p_mes);
      EXCEPTION WHEN OTHERS THEN
        v_relatorio_gerencial := jsonb_build_object('erro', SQLERRM);
        v_unidade_alertas := v_unidade_alertas || jsonb_build_array('relatorio_gerencial_erro_preview');
      END;

      BEGIN
        v_relatorio_coordenacao := public.get_dados_relatorio_coordenacao(v_unidade.id, p_ano, p_mes);
      EXCEPTION WHEN OTHERS THEN
        v_relatorio_coordenacao := jsonb_build_object('erro', SQLERRM);
        v_unidade_alertas := v_unidade_alertas || jsonb_build_array('relatorio_coordenacao_erro_preview');
      END;

      BEGIN
        v_matriculador := public.get_programa_matriculador_dados(p_ano, v_unidade.id);
        v_unidade_alertas := v_unidade_alertas || jsonb_build_array('matriculador_funcao_anual_sem_parametro_mes');
      EXCEPTION WHEN OTHERS THEN
        v_matriculador := jsonb_build_object('erro', SQLERRM);
        v_unidade_alertas := v_unidade_alertas || jsonb_build_array('matriculador_erro_preview');
      END;

      BEGIN
        v_fideliza := public.get_programa_fideliza_dados(p_ano, v_trimestre, v_unidade.id);
        v_unidade_alertas := v_unidade_alertas || jsonb_build_array('fideliza_trimestral_nao_snapshot_mensal');
      EXCEPTION WHEN OTHERS THEN
        v_fideliza := jsonb_build_object('erro', SQLERRM);
        v_unidade_alertas := v_unidade_alertas || jsonb_build_array('fideliza_erro_preview');
      END;
    END IF;

    v_payload := jsonb_build_object(
      'unidade_id', v_unidade.id,
      'unidade_nome', v_unidade.nome,
      'status_preview', CASE WHEN jsonb_array_length(v_unidade_bloqueios) = 0 THEN 'aprovavel' ELSE 'bloqueado' END,
      'bloqueios', v_unidade_bloqueios,
      'alertas', v_unidade_alertas,
      'competencia', CASE WHEN v_comp.id IS NULL THEN NULL ELSE to_jsonb(v_comp) END,
      'dados_mensais_existente', CASE WHEN v_dm.id IS NULL THEN NULL ELSE to_jsonb(v_dm) END,
      'dados_mensais_diff', v_dados_mensais_diff,
      'fontes', jsonb_build_object(
        'admin_operacional', v_admin_obj,
        'alunos_canonicos', v_canon_obj,
        'comercial_canonico', v_comercial_obj,
        'relatorio_gerencial', v_relatorio_gerencial,
        'relatorio_coordenacao', v_relatorio_coordenacao,
        'programa_matriculador', v_matriculador,
        'programa_fideliza', v_fideliza
      ),
      'hash_preview', md5(jsonb_build_object(
        'admin_operacional', v_admin_obj,
        'alunos_canonicos', v_canon_obj,
        'comercial_canonico', v_comercial_obj
      )::text)
    );

    v_unidades := v_unidades || jsonb_build_array(v_payload);
    v_bloqueios := v_bloqueios || v_unidade_bloqueios;
    v_alertas := v_alertas || v_unidade_alertas;
  END LOOP;

  RETURN jsonb_build_object(
    'ano', p_ano,
    'mes', p_mes,
    'trimestre', v_trimestre,
    'gerado_em', now(),
    'modo', 'preview_readonly',
    'escreve_dados', false,
    'status_geral', CASE WHEN jsonb_array_length(v_bloqueios) = 0 THEN 'aprovavel' ELSE 'bloqueado' END,
    'bloqueios', v_bloqueios,
    'alertas', v_alertas,
    'totais', jsonb_build_object(
      'admin_operacional', v_admin_all->'totais',
      'alunos_canonicos', v_canon_all->'totais',
      'comercial_canonico', COALESCE(v_comercial_all->'totais', v_comercial_all->'kpis')
    ),
    'unidades', v_unidades
  );
END;
$function$;

COMMENT ON FUNCTION public.preview_fechamento_mensal(integer, integer, uuid, boolean)
IS 'P09A preview read-only de fechamento mensal: compara fontes canonicas vivas, dados_mensais e dominios de relatorio sem gravar snapshot.';

REVOKE ALL ON FUNCTION public.preview_fechamento_mensal(integer, integer, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_fechamento_mensal(integer, integer, uuid, boolean) TO authenticated, service_role;
