-- ============================================================================
-- P09E - RPC guardada para gravar snapshots mensais
-- Projeto alvo: ouqwbbermlzqqvtqwlul
--
-- Objetivo:
-- - Criar a funcao que grava o fechamento mensal somente a partir do preview
--   canonico aprovado.
-- - Restringir execucao a service_role.
-- - Impedir sobrescrita silenciosa de snapshots aprovados/fechados.
--
-- Nao faz:
-- - Nao chama a funcao.
-- - Nao grava Junho/2026.
-- - Nao altera dados_mensais.
-- - Nao fecha competencia.
-- - Nao roda sync/backfill/recalculo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.gravar_snapshot_fechamento_mensal(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_confirmar_alertas boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_preview jsonb;
  v_alertas jsonb;
  v_bloqueios jsonb;
  v_unidade jsonb;
  v_unidade_id uuid;
  v_unidade_nome text;
  v_dominio text;
  v_payload_key text;
  v_fonte text;
  v_payload jsonb;
  v_version integer;
  v_snapshot_id uuid;
  v_snapshot_ids jsonb := '[]'::jsonb;
  v_snapshot_count integer := 0;
BEGIN
  IF p_ano IS NULL OR p_mes IS NULL OR p_mes < 1 OR p_mes > 12 THEN
    RAISE EXCEPTION 'Competencia invalida para fechamento: ano %, mes %', p_ano, p_mes;
  END IF;

  v_preview := public.preview_fechamento_mensal(p_ano, p_mes, p_unidade_id, true);
  v_alertas := COALESCE(v_preview->'alertas', '[]'::jsonb);
  v_bloqueios := COALESCE(v_preview->'bloqueios', '[]'::jsonb);

  IF COALESCE(v_preview->>'status_geral', 'bloqueado') <> 'aprovavel'
     OR jsonb_array_length(v_bloqueios) > 0 THEN
    RAISE EXCEPTION 'Fechamento bloqueado. Resolva os bloqueios do preview antes de gravar snapshot. Bloqueios: %',
      v_bloqueios::text;
  END IF;

  IF NOT p_confirmar_alertas AND jsonb_array_length(v_alertas) > 0 THEN
    RAISE EXCEPTION 'Preview contem alertas. Reexecute com p_confirmar_alertas=true somente apos validacao humana. Alertas: %',
      v_alertas::text;
  END IF;

  FOR v_unidade IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(v_preview->'unidades', '[]'::jsonb)) AS t(value)
  LOOP
    v_unidade_id := (v_unidade->>'unidade_id')::uuid;
    v_unidade_nome := v_unidade->>'unidade_nome';

    IF v_unidade_id IS NULL THEN
      RAISE EXCEPTION 'Preview retornou unidade sem unidade_id: %', v_unidade::text;
    END IF;

    FOR v_dominio, v_payload_key, v_fonte IN
      SELECT *
      FROM (VALUES
        ('alunos_admin', 'admin_operacional', 'get_kpis_alunos_admin_operacional'),
        ('alunos_executivo', 'alunos_canonicos', 'get_kpis_alunos_canonicos'),
        ('comercial', 'comercial_canonico', 'get_kpis_comercial_canonicos_v2'),
        ('relatorio_gerencial', 'relatorio_gerencial', 'get_dados_relatorio_gerencial'),
        ('relatorio_coordenacao', 'relatorio_coordenacao', 'get_dados_relatorio_coordenacao'),
        ('programa_matriculador', 'programa_matriculador', 'get_programa_matriculador_dados'),
        ('programa_fideliza', 'programa_fideliza', 'get_programa_fideliza_dados')
      ) AS dominios(dominio, payload_key, fonte)
    LOOP
      v_payload := v_unidade->'fontes'->v_payload_key;

      IF v_payload IS NULL OR v_payload = 'null'::jsonb OR v_payload ? 'erro' THEN
        RAISE EXCEPTION 'Payload invalido para %/% unidade %. Conteudo: %',
          v_dominio,
          v_payload_key,
          COALESCE(v_unidade_nome, v_unidade_id::text),
          COALESCE(v_payload::text, 'null');
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.fechamento_mensal_snapshots s
        WHERE s.ano = p_ano
          AND s.mes = p_mes
          AND s.escopo = 'unidade'
          AND s.unidade_id = v_unidade_id
          AND s.dominio = v_dominio
          AND s.status IN ('aprovado', 'fechado')
      ) THEN
        RAISE EXCEPTION 'Snapshot %/% ja aprovado/fechado para unidade %, dominio %. Use fluxo de retificacao.',
          p_mes, p_ano, COALESCE(v_unidade_nome, v_unidade_id::text), v_dominio;
      END IF;

      SELECT COALESCE(MAX(s.versao), 0) + 1
      INTO v_version
      FROM public.fechamento_mensal_snapshots s
      WHERE s.ano = p_ano
        AND s.mes = p_mes
        AND s.escopo = 'unidade'
        AND s.unidade_id = v_unidade_id
        AND s.dominio = v_dominio;

      INSERT INTO public.fechamento_mensal_snapshots (
        ano,
        mes,
        escopo,
        unidade_id,
        dominio,
        versao,
        status,
        fonte,
        payload,
        payload_hash,
        financeiro_realizado_disponivel,
        observacao,
        capturado_por,
        aprovado_em,
        aprovado_por
      )
      VALUES (
        p_ano,
        p_mes,
        'unidade',
        v_unidade_id,
        v_dominio,
        v_version,
        'aprovado',
        v_fonte,
        v_payload,
        public.hash_jsonb_canonico(v_payload),
        false,
        p_observacao,
        auth.uid(),
        now(),
        auth.uid()
      )
      RETURNING id INTO v_snapshot_id;

      INSERT INTO public.fechamento_mensal_auditoria (
        snapshot_id,
        ano,
        mes,
        escopo,
        unidade_id,
        acao,
        detalhes,
        actor_id
      )
      VALUES (
        v_snapshot_id,
        p_ano,
        p_mes,
        'unidade',
        v_unidade_id,
        'snapshot_gravado',
        jsonb_build_object(
          'dominio', v_dominio,
          'fonte', v_fonte,
          'versao', v_version,
          'alertas_confirmados', p_confirmar_alertas
        ),
        auth.uid()
      );

      v_snapshot_count := v_snapshot_count + 1;
      v_snapshot_ids := v_snapshot_ids || jsonb_build_array(v_snapshot_id);
    END LOOP;
  END LOOP;

  IF p_unidade_id IS NULL THEN
    FOR v_dominio, v_payload_key, v_fonte IN
      SELECT *
      FROM (VALUES
        ('alunos_admin', 'admin_operacional', 'get_kpis_alunos_admin_operacional'),
        ('alunos_executivo', 'alunos_canonicos', 'get_kpis_alunos_canonicos'),
        ('comercial', 'comercial_canonico', 'get_kpis_comercial_canonicos_v2')
      ) AS dominios(dominio, payload_key, fonte)
    LOOP
      v_payload := v_preview->'totais'->v_payload_key;

      IF v_payload IS NULL OR v_payload = 'null'::jsonb OR v_payload ? 'erro' THEN
        RAISE EXCEPTION 'Payload consolidado invalido para %/%. Conteudo: %',
          v_dominio,
          v_payload_key,
          COALESCE(v_payload::text, 'null');
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.fechamento_mensal_snapshots s
        WHERE s.ano = p_ano
          AND s.mes = p_mes
          AND s.escopo = 'consolidado'
          AND s.unidade_id IS NULL
          AND s.dominio = v_dominio
          AND s.status IN ('aprovado', 'fechado')
      ) THEN
        RAISE EXCEPTION 'Snapshot consolidado %/% ja aprovado/fechado para dominio %. Use fluxo de retificacao.',
          p_mes, p_ano, v_dominio;
      END IF;

      SELECT COALESCE(MAX(s.versao), 0) + 1
      INTO v_version
      FROM public.fechamento_mensal_snapshots s
      WHERE s.ano = p_ano
        AND s.mes = p_mes
        AND s.escopo = 'consolidado'
        AND s.unidade_id IS NULL
        AND s.dominio = v_dominio;

      INSERT INTO public.fechamento_mensal_snapshots (
        ano,
        mes,
        escopo,
        unidade_id,
        dominio,
        versao,
        status,
        fonte,
        payload,
        payload_hash,
        financeiro_realizado_disponivel,
        observacao,
        capturado_por,
        aprovado_em,
        aprovado_por
      )
      VALUES (
        p_ano,
        p_mes,
        'consolidado',
        NULL,
        v_dominio,
        v_version,
        'aprovado',
        v_fonte,
        v_payload,
        public.hash_jsonb_canonico(v_payload),
        false,
        p_observacao,
        auth.uid(),
        now(),
        auth.uid()
      )
      RETURNING id INTO v_snapshot_id;

      INSERT INTO public.fechamento_mensal_auditoria (
        snapshot_id,
        ano,
        mes,
        escopo,
        unidade_id,
        acao,
        detalhes,
        actor_id
      )
      VALUES (
        v_snapshot_id,
        p_ano,
        p_mes,
        'consolidado',
        NULL,
        'snapshot_gravado',
        jsonb_build_object(
          'dominio', v_dominio,
          'fonte', v_fonte,
          'versao', v_version,
          'alertas_confirmados', p_confirmar_alertas
        ),
        auth.uid()
      );

      v_snapshot_count := v_snapshot_count + 1;
      v_snapshot_ids := v_snapshot_ids || jsonb_build_array(v_snapshot_id);
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'ano', p_ano,
    'mes', p_mes,
    'unidade_id', p_unidade_id,
    'snapshots_gravados', v_snapshot_count,
    'snapshot_ids', v_snapshot_ids,
    'financeiro_realizado_disponivel', false,
    'alertas_confirmados', p_confirmar_alertas
  );
END;
$function$;

COMMENT ON FUNCTION public.gravar_snapshot_fechamento_mensal(integer, integer, uuid, text, boolean) IS
  'Grava snapshots mensais aprovados a partir do preview canonico. Restrita a service_role; nao deve ser chamada pela UI comum.';

REVOKE ALL ON FUNCTION public.gravar_snapshot_fechamento_mensal(integer, integer, uuid, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_snapshot_fechamento_mensal(integer, integer, uuid, text, boolean)
  TO service_role;
