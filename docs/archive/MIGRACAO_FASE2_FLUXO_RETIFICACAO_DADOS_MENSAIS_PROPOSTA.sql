-- =============================================================================
-- MIGRACAO_FASE2_FLUXO_RETIFICACAO_DADOS_MENSAIS_PROPOSTA.sql
--
-- FASE 2 — FLUXO OFICIAL DE RETIFICAÇÃO HISTÓRICA (PROPOSTA)
--
-- OBJETIVO
--   Desenhar um fluxo oficial e controlado para retificação de `dados_mensais`,
--   garantindo que mês fechado não mude sozinho e que qualquer alteração seja
--   explícita, auditada, justificável e reversível.
--
-- IMPORTANTE
--   - Modo proposta: NÃO executar sem aprovação explícita.
--   - Este arquivo NÃO deve ser aplicado agora.
--   - Esta proposta NÃO recalcula Maio/2026 automaticamente.
--   - Esta proposta NÃO faz backfill.
--   - Esta proposta NÃO altera funções operacionais existentes nesta fase.
--   - Esta proposta serve apenas como artefato revisável de arquitetura SQL.
--
-- PRINCÍPIO DE NEGÓCIO
--   - mês atual pode ter cálculo vivo;
--   - mês fechado não muda sozinho;
--   - qualquer alteração em mês fechado vira retificação explícita;
--   - retificação exige preview, diff, motivo, solicitante, aprovador e log.
-- =============================================================================


-- =============================================================================
-- BLOCO 1) VISÃO GERAL DO FLUXO PROPOSTO
--
-- 1. PREVIEW / DRY-RUN
--    - calcula um snapshot proposto para uma competência fechada
--    - não grava em `dados_mensais`
--    - retorna:
--      * snapshot atual
--      * snapshot proposto
--      * diff campo a campo
--
-- 2. APPLY CONTROLADO
--    - só aplica com motivo + solicitante + aprovador
--    - registra auditoria antes de atualizar
--    - atualiza apenas 1 competência / 1 unidade por vez
--    - não permite execução em massa silenciosa
--
-- 3. AUDITORIA DE RETIFICAÇÃO
--    - preserva antes/depois/diff/motivo/aprovação/origem/timestamps
-- =============================================================================


-- =============================================================================
-- BLOCO 2) TABELA DE AUDITORIA DE RETIFICAÇÕES (PROPOSTA)
--
-- Finalidade:
--   Guardar toda retificação histórica aplicada em `dados_mensais`.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.dados_mensais_retificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id UUID NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  motivo TEXT NOT NULL,
  solicitado_por TEXT NOT NULL,
  aprovado_por TEXT NOT NULL,
  origem TEXT NOT NULL DEFAULT 'retificacao_controlada',
  snapshot_antes JSONB NOT NULL,
  snapshot_depois JSONB NOT NULL,
  diff JSONB NOT NULL,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dados_mensais_retificacoes_mes_ck CHECK (mes BETWEEN 1 AND 12)
);

CREATE INDEX IF NOT EXISTS idx_dm_retificacoes_competencia
  ON public.dados_mensais_retificacoes (unidade_id, ano, mes, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dm_retificacoes_created_at
  ON public.dados_mensais_retificacoes (created_at DESC);


-- =============================================================================
-- BLOCO 3) FUNÇÃO AUXILIAR DE DIFF CAMPO A CAMPO (PROPOSTA)
--
-- Finalidade:
--   Comparar snapshot atual vs snapshot proposto e retornar apenas os campos
--   alterados, com valor anterior e novo valor.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.diff_jsonb_flat(
  p_before JSONB,
  p_after JSONB
)
RETURNS JSONB
LANGUAGE sql
AS $function$
  WITH before_kv AS (
    SELECT key, value
    FROM jsonb_each(COALESCE(p_before, '{}'::jsonb))
  ),
  after_kv AS (
    SELECT key, value
    FROM jsonb_each(COALESCE(p_after, '{}'::jsonb))
  ),
  merged AS (
    SELECT
      COALESCE(b.key, a.key) AS key,
      b.value AS before_value,
      a.value AS after_value
    FROM before_kv b
    FULL OUTER JOIN after_kv a ON a.key = b.key
  )
  SELECT COALESCE(
    jsonb_object_agg(
      key,
      jsonb_build_object(
        'antes', before_value,
        'depois', after_value
      )
    ) FILTER (WHERE before_value IS DISTINCT FROM after_value),
    '{}'::jsonb
  )
  FROM merged;
$function$;


-- =============================================================================
-- BLOCO 4) FUNÇÃO PREVIEW / DRY-RUN (PROPOSTA)
--
-- Finalidade:
--   Calcular a proposta de retificação sem gravar em `dados_mensais`.
--
-- Estratégia:
--   - reutiliza `recalcular_dados_mensais` como motor de cálculo
--   - exige versão futura da função em modo somente-preview OU encapsulamento
--     da lógica de cálculo em função pura reutilizável
--
-- Observação importante:
--   A implementação abaixo é uma PROPOSTA ESTRUTURAL.
--   Antes de executar, será necessário adaptar `recalcular_dados_mensais`
--   para não gravar diretamente, ou extrair a lógica para uma função pura.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.preview_retificacao_dados_mensais(
  p_ano INTEGER,
  p_mes INTEGER,
  p_unidade_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $function$
DECLARE
  v_atual JSONB;
  v_proposto JSONB;
  v_diff JSONB;
BEGIN
  SELECT to_jsonb(dm)
  INTO v_atual
  FROM dados_mensais dm
  WHERE dm.unidade_id = p_unidade_id
    AND dm.ano = p_ano
    AND dm.mes = p_mes;

  -- PROPOSTA:
  -- substituir este bloco por uma função pura de cálculo, por exemplo:
  --   public.calcular_snapshot_dados_mensais(p_ano, p_mes, p_unidade_id)
  -- que retorne jsonb sem gravar.
  --
  -- Enquanto isso não existir, esta função é apenas um desenho de contrato.
  v_proposto := jsonb_build_object(
    'status', 'PROPOSTA_NAO_EXECUTAVEL_AINDA',
    'mensagem', 'Extrair lógica pura de cálculo antes de ativar preview operacional.',
    'ano', p_ano,
    'mes', p_mes,
    'unidade_id', p_unidade_id
  );

  v_diff := public.diff_jsonb_flat(v_atual, v_proposto);

  RETURN jsonb_build_object(
    'modo', 'preview',
    'grava_em_dados_mensais', false,
    'ano', p_ano,
    'mes', p_mes,
    'unidade_id', p_unidade_id,
    'snapshot_atual', COALESCE(v_atual, '{}'::jsonb),
    'snapshot_proposto', COALESCE(v_proposto, '{}'::jsonb),
    'diff', COALESCE(v_diff, '{}'::jsonb)
  );
END;
$function$;


-- =============================================================================
-- BLOCO 5) FUNÇÃO APPLY CONTROLADO (PROPOSTA)
--
-- Finalidade:
--   Aplicar uma retificação histórica somente com metadados obrigatórios.
--
-- Regras propostas:
--   - exige motivo
--   - exige solicitante
--   - exige aprovador
--   - grava log antes/depois/diff
--   - atua em 1 competência / 1 unidade por vez
--   - não faz operação em massa silenciosa
--
-- Observação importante:
--   Esta função depende do preview operacional real.
--   Portanto, nesta fase ela é apenas proposta estrutural.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.aplicar_retificacao_dados_mensais(
  p_ano INTEGER,
  p_mes INTEGER,
  p_unidade_id UUID,
  p_motivo TEXT,
  p_solicitado_por TEXT,
  p_aprovado_por TEXT,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $function$
DECLARE
  v_preview JSONB;
  v_atual JSONB;
  v_proposto JSONB;
  v_diff JSONB;
  v_retificacao_id UUID;
BEGIN
  IF NULLIF(TRIM(COALESCE(p_motivo, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Motivo da retificação é obrigatório.';
  END IF;

  IF NULLIF(TRIM(COALESCE(p_solicitado_por, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Solicitante da retificação é obrigatório.';
  END IF;

  IF NULLIF(TRIM(COALESCE(p_aprovado_por, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Aprovação da retificação é obrigatória.';
  END IF;

  v_preview := public.preview_retificacao_dados_mensais(
    p_ano,
    p_mes,
    p_unidade_id
  );

  v_atual := v_preview->'snapshot_atual';
  v_proposto := v_preview->'snapshot_proposto';
  v_diff := v_preview->'diff';

  -- PROPOSTA DE SEGURANÇA:
  -- enquanto o preview real não estiver operacional, bloquear apply.
  IF (v_proposto->>'status') = 'PROPOSTA_NAO_EXECUTAVEL_AINDA' THEN
    RAISE EXCEPTION 'Apply bloqueado: preview ainda não está operacional.';
  END IF;

  INSERT INTO public.dados_mensais_retificacoes (
    unidade_id,
    ano,
    mes,
    motivo,
    solicitado_por,
    aprovado_por,
    origem,
    snapshot_antes,
    snapshot_depois,
    diff,
    observacoes
  ) VALUES (
    p_unidade_id,
    p_ano,
    p_mes,
    p_motivo,
    p_solicitado_por,
    p_aprovado_por,
    'retificacao_controlada',
    COALESCE(v_atual, '{}'::jsonb),
    COALESCE(v_proposto, '{}'::jsonb),
    COALESCE(v_diff, '{}'::jsonb),
    p_observacoes
  )
  RETURNING id INTO v_retificacao_id;

  -- PROPOSTA:
  -- quando o preview real existir, este bloco fará o update explícito.
  --
  -- UPDATE dados_mensais
  -- SET ...campos vindos do snapshot proposto...
  -- WHERE unidade_id = p_unidade_id
  --   AND ano = p_ano
  --   AND mes = p_mes;

  RETURN jsonb_build_object(
    'status', 'PROPOSTA_NAO_EXECUTADA',
    'mensagem', 'Retificação registrada apenas como desenho estrutural. Apply real permanece bloqueado nesta fase.',
    'retificacao_id', v_retificacao_id,
    'ano', p_ano,
    'mes', p_mes,
    'unidade_id', p_unidade_id,
    'diff', COALESCE(v_diff, '{}'::jsonb)
  );
END;
$function$;


-- =============================================================================
-- BLOCO 6) RISCOS E PONTOS DE ATENÇÃO
--
-- 1. A função `recalcular_dados_mensais` atual grava em `dados_mensais`.
--    Antes de ativar o preview real, será necessário:
--      - extrair a lógica de cálculo para uma função pura; OU
--      - criar um modo explícito `preview_only`; OU
--      - duplicar a lógica em função sem side effects.
--
-- 2. O apply real não deve ser habilitado antes de existir preview confiável.
--
-- 3. `upsert_dados_mensais` e `sync_evasao_to_dados_mensais` continuam sendo
--    riscos para mês fechado enquanto não forem revisados em fases futuras.
--
-- 4. Esta fase NÃO resolve automaticamente o valor correto de Maio/2026.
--    Ela só desenha o trilho seguro para uma retificação futura.
-- =============================================================================


-- =============================================================================
-- BLOCO 7) PLANO DE VALIDAÇÃO (PROPOSTA)
--
-- Antes de qualquer execução futura:
--   [ ] validar estrutura da tabela `dados_mensais_retificacoes`
--   [ ] validar contrato de retorno do preview
--   [ ] validar formato do diff campo a campo
--   [ ] validar obrigatoriedade de motivo/solicitante/aprovador
--   [ ] validar que apply não roda sem preview operacional
--   [ ] validar que nenhuma retificação roda em massa
--   [ ] validar rollback em ambiente seguro
-- =============================================================================


-- =============================================================================
-- BLOCO 8) ROLLBACK (PROPOSTA)
--
-- Use apenas se esta fase vier a ser executada futuramente e precisar ser
-- revertida.
-- =============================================================================
-- DROP FUNCTION IF EXISTS public.aplicar_retificacao_dados_mensais(
--   INTEGER,
--   INTEGER,
--   UUID,
--   TEXT,
--   TEXT,
--   TEXT,
--   TEXT
-- );
--
-- DROP FUNCTION IF EXISTS public.preview_retificacao_dados_mensais(
--   INTEGER,
--   INTEGER,
--   UUID
-- );
--
-- DROP FUNCTION IF EXISTS public.diff_jsonb_flat(JSONB, JSONB);
--
-- DROP TABLE IF EXISTS public.dados_mensais_retificacoes;


-- =============================================================================
-- CHECKLIST DE REVISÃO HUMANA
--
-- [ ] O arquivo está claramente marcado como PROPOSTA
-- [ ] Nenhuma parte recalcula Maio automaticamente
-- [ ] Nenhuma parte faz backfill
-- [ ] Nenhuma parte altera função operacional nesta fase
-- [ ] O preview não grava em `dados_mensais`
-- [ ] O apply exige motivo, solicitante e aprovador
-- [ ] O rollback está documentado
-- =============================================================================
