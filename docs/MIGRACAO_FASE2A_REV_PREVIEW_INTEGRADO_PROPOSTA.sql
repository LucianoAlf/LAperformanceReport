-- =============================================================================
-- MIGRACAO_FASE2A_REV_PREVIEW_INTEGRADO_PROPOSTA.sql
--
-- FASE 2A-REV — PREVIEW NORMALIZADO DE RETIFICAÇÃO (PROPOSTA)
--
-- Versão revisada com contrato normalizado (Alfredo).
--
-- OBJETIVO
--   Criar um preview confiável de retificação de `dados_mensais`, comparando
--   apenas campos do mesmo contrato lógico.
--
-- PRINCÍPIO
--   - preview calcula;
--   - preview compara;
--   - preview NÃO grava;
--   - diff só compara campos equivalentes;
--   - metadata/financeiro ficam fora deste escopo.
--
-- IMPORTANTE
--   - NÃO executar sem revisão.
--   - NÃO altera `dados_mensais`.
--   - NÃO recalcula Maio gravando nada.
--   - NÃO habilita apply.
--   - NÃO faz backfill.
-- =============================================================================


-- =============================================================================
-- 1) FUNÇÃO AUXILIAR: DIFF FLAT JSONB
--
-- Compara dois JSONB planos e retorna apenas campos diferentes.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.diff_jsonb_flat(
  p_before JSONB,
  p_after JSONB
)
RETURNS JSONB
LANGUAGE sql
STABLE
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
      ORDER BY key
    ) FILTER (WHERE before_value IS DISTINCT FROM after_value),
    '{}'::jsonb
  )
  FROM merged;
$function$;


-- =============================================================================
-- 2) FUNÇÃO AUXILIAR: SNAPSHOT ATUAL NORMALIZADO
--
-- Esta função lê `dados_mensais`, mas retorna SOMENTE os campos comparáveis
-- com o motor puro `calcular_snapshot_dados_mensais`.
--
-- Não inclui:
--   - id
--   - created_at
--   - updated_at
--   - ticket_medio
--   - financeiro
--   - saldo
--   - campos fora do escopo alunos/matrículas
-- =============================================================================
CREATE OR REPLACE FUNCTION public.snapshot_atual_dados_mensais_alunos_matriculas(
  p_ano INTEGER,
  p_mes INTEGER,
  p_unidade_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $function$
  SELECT COALESCE(
    jsonb_build_object(
      'scope', 'ALUNOS_MATRICULAS_ONLY',
      'ano', dm.ano,
      'mes', dm.mes,
      'unidade_id', dm.unidade_id,
      'alunos_ativos', dm.alunos_ativos,
      'alunos_pagantes', dm.alunos_pagantes,
      'matriculas_ativas', dm.matriculas_ativas,
      'matriculas_banda', dm.matriculas_banda,
      'matriculas_2_curso', dm.matriculas_2_curso,
      'novas_matriculas', dm.novas_matriculas,
      'evasoes', dm.evasoes,
      'churn_rate', dm.churn_rate,
      'financeiro_alterado', false
    ),
    '{}'::jsonb
  )
  FROM public.dados_mensais dm
  WHERE dm.unidade_id = p_unidade_id
    AND dm.ano = p_ano
    AND dm.mes = p_mes;
$function$;


-- =============================================================================
-- 3) PREVIEW NORMALIZADO
--
-- Pré-requisito:
--   public.calcular_snapshot_dados_mensais(p_ano, p_mes, p_unidade_id)
--
-- Essa função deve ser pura:
--   - sem INSERT
--   - sem UPDATE
--   - sem UPSERT
--   - sem DELETE
--   - sem alteração de qualquer tabela
-- =============================================================================
CREATE OR REPLACE FUNCTION public.preview_retificacao_dados_mensais(
  p_ano INTEGER,
  p_mes INTEGER,
  p_unidade_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_snapshot_atual JSONB;
  v_snapshot_proposto JSONB;
  v_diff JSONB;
BEGIN
  -- Snapshot gravado, mas NORMALIZADO para o mesmo contrato do cálculo puro.
  v_snapshot_atual := public.snapshot_atual_dados_mensais_alunos_matriculas(
    p_ano,
    p_mes,
    p_unidade_id
  );

  -- Snapshot que seria calculado hoje pelo motor puro, sem gravação.
  v_snapshot_proposto := public.calcular_snapshot_dados_mensais(
    p_ano,
    p_mes,
    p_unidade_id
  );

  -- Diff limpo: atual vs proposto com o mesmo contrato.
  v_diff := public.diff_jsonb_flat(v_snapshot_atual, v_snapshot_proposto);

  RETURN jsonb_build_object(
    'modo', 'preview',
    'scope', 'ALUNOS_MATRICULAS_ONLY',
    'grava_em_dados_mensais', false,
    'apply_habilitado', false,
    'ano', p_ano,
    'mes', p_mes,
    'unidade_id', p_unidade_id,
    'snapshot_atual', COALESCE(v_snapshot_atual, '{}'::jsonb),
    'snapshot_proposto', COALESCE(v_snapshot_proposto, '{}'::jsonb),
    'diff', COALESCE(v_diff, '{}'::jsonb),
    'avisos', jsonb_build_array(
      'Preview compara apenas o escopo ALUNOS_MATRICULAS_ONLY.',
      'Não compara id, created_at, updated_at, ticket_medio ou financeiro.',
      'Snapshot proposto é cálculo atual sobre tabelas operacionais; não recupera sozinho fechamento validado antigo.',
      'Apply permanece bloqueado.'
    )
  );
END;
$function$;


-- =============================================================================
-- 4) APPLY CONTROLADO — CONTINUA BLOQUEADO
--
-- A função apply da Fase 2 continua existindo como desenho estrutural,
-- mas NÃO é habilitada operacionalmente nesta fase.
--
-- Quando o preview estiver validado, a Fase 3 pode desbloquear o apply
-- com regras de:
--   - motivo obrigatório
--   - solicitante obrigatório
--   - aprovador obrigatório
--   - registro em `dados_mensais_retificacoes`
-- =============================================================================


-- =============================================================================
-- 5) VALIDAÇÃO DE NÃO-MUTAÇÃO — RODAR MANUALMENTE, NÃO EMBUTIR EM MIGRATION
--
-- Estes SELECTs são para validação manual em ambiente seguro.
-- Não devem ficar misturados com migration automática.
-- =============================================================================

-- PRE-CHECK
-- SELECT
--   id,
--   unidade_id,
--   ano,
--   mes,
--   alunos_ativos,
--   alunos_pagantes,
--   matriculas_ativas,
--   matriculas_banda,
--   matriculas_2_curso,
--   novas_matriculas,
--   evasoes,
--   churn_rate,
--   ticket_medio,
--   updated_at
-- FROM public.dados_mensais
-- WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
--   AND ano = 2026
--   AND mes = 5;

-- PREVIEW
-- SELECT public.preview_retificacao_dados_mensais(
--   2026,
--   5,
--   '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
-- );

-- POST-CHECK
-- SELECT
--   id,
--   unidade_id,
--   ano,
--   mes,
--   alunos_ativos,
--   alunos_pagantes,
--   matriculas_ativas,
--   matriculas_banda,
--   matriculas_2_curso,
--   novas_matriculas,
--   evasoes,
--   churn_rate,
--   ticket_medio,
--   updated_at
-- FROM public.dados_mensais
-- WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
--   AND ano = 2026
--   AND mes = 5;


-- =============================================================================
-- 6) RESULTADO ESPERADO
--
-- O diff deve conter APENAS divergências entre estes campos:
--   - scope
--   - ano
--   - mes
--   - unidade_id
--   - alunos_ativos
--   - alunos_pagantes
--   - matriculas_ativas
--   - matriculas_banda
--   - matriculas_2_curso
--   - novas_matriculas
--   - evasoes
--   - churn_rate
--   - financeiro_alterado
--
-- Se aparecer id, created_at, updated_at, ticket_medio ou financeiro no diff,
-- o contrato está errado.
-- =============================================================================


-- =============================================================================
-- 7) RISCOS
--
-- 1. O preview calcula a partir do estado atual de `alunos`.
--    Se o cadastro mudou depois do fechamento, o snapshot proposto
--    será diferente do fechamento validado.
--
-- 2. O diff só mostra diferenças numéricas.
--    Ele não explica qual evento nominal mudou (ex: Vitória → bolsista).
--
-- 3. O preview pode retornar diferenças legítimas (correções reais)
--    e diferenças indesejadas (contaminações não detectadas).
--
-- 4. A validação de não-mutação depende do operador comparar PRE e POST.
--    Não é automática dentro do SQL.
-- =============================================================================


-- =============================================================================
-- 8) PLANO DE VALIDAÇÃO (PROPOSTA)
--
-- Antes de qualquer execução futura:
--   [ ] validar que preview NÃO contém INSERT/UPDATE/UPSERT/DELETE
--   [ ] validar que preview usa função pura
--   [ ] rodar PRE-CHECK e POST-CHECK manualmente
--   [ ] confirmar que updated_at não mudou
--   [ ] comparar snapshot_proposto com cálculo esperado
--   [ ] validar formato e legibilidade do diff
--   [ ] validar que apply permanece bloqueado
-- =============================================================================


-- =============================================================================
-- 9) ROLLBACK (PROPOSTA)
-- =============================================================================
-- DROP FUNCTION IF EXISTS public.preview_retificacao_dados_mensais(INTEGER, INTEGER, UUID);
-- DROP FUNCTION IF EXISTS public.snapshot_atual_dados_mensais_alunos_matriculas(INTEGER, INTEGER, UUID);
-- DROP FUNCTION IF EXISTS public.diff_jsonb_flat(JSONB, JSONB);


-- =============================================================================
-- CHECKLIST DE REVISÃO HUMANA
--
-- [ ] O arquivo está claramente marcado como PROPOSTA
-- [ ] preview_retificacao_dados_mensais não altera dados_mensais
-- [ ] preview usa calcular_snapshot_dados_mensais (função pura)
-- [ ] diff usa diff_jsonb_flat com contrato normalizado
-- [ ] snapshot_atual usa snapshot_atual_dados_mensais_alunos_matriculas
-- [ ] apply permanece bloqueado
-- [ ] não recalcula Maio automaticamente
-- [ ] não faz backfill
-- =============================================================================
