-- =============================================================================
-- MIGRACAO_FASE2B_AUDITORIA_NOMINAL_RETIFICACAO_PROPOSTA.sql
--
-- FASE 2B — AUDITORIA NOMINAL E RETIFICAÇÃO HISTÓRICA (PROPOSTA)
--
-- ATENÇÃO: Existem TRÊS ESTADOS distintos para Maio/CG/2026.
-- O preview da Fase 2A-REV provou segurança técnica, mas NÃO valida histórico.
--
--   1) FECHAMENTO VALIDADO (o correto — precisa ser preservado/restaurado):
--      alunos_ativos: 496, alunos_pagantes: 470, matriculas_ativas: 561,
--      matriculas_banda: 41, matriculas_2_curso: 27, novas_matriculas: 23,
--      evasoes: 13, churn_rate: ~2.77%
--
--   2) SNAPSHOT ATUAL em dados_mensais (contaminado pelo job legado):
--      alunos_ativos: 489, alunos_pagantes: 463, matriculas_ativas: 552,
--      matriculas_banda: 40 (-7 ativos, -7 pagantes, -9 matrículas, -1 banda)
--
--   3) CÁLCULO VIVO atual olhando Maio (ainda mais distante, usa cadastro atual):
--      alunos_ativos: 475, alunos_pagantes: 445, matriculas_ativas: 538,
--      matriculas_banda: 40 (-21 ativos, -25 pagantes, -23 matrículas vs validado)
--
-- OBJETIVO
--   1. Reconstruir o fechamento validado de Maio/CG a partir de fonte confiável.
--   2. Comparar: validado vs atual vs vivo — campo a campo, nome a nome.
--   3. Identificar nominalmente quem saiu em cada transição.
--   4. Separar:
--      * correção legítima
--      * alteração retroativa
--      * perda causada por função antiga (overwrite)
--      * perda causada por cadastro atual divergente
--   5. Propor retificação explícita, sem aplicar.
--
-- IMPORTANTE
--   - Modo proposta: NÃO executar sem aprovação explícita.
--   - NÃO altera `dados_mensais`.
--   - NÃO aplica retificação.
--   - NÃO faz backfill.
--   - NÃO recalcula Maio gravando nada.
--   - Apenas auditoria nominal e proposta de retificação.
-- =============================================================================


-- =============================================================================
-- 1) BLOCO PRÉ-REQUISITO: FONTE DO FECHAMENTO VALIDADO
--
-- Problema central:
--   Não existe snapshot automático do estado de `alunos` em 31/05/2026.
--   O `dados_mensais` de Maio foi sobreescrito pelo job legado.
--
-- Opções de fonte confiável (escolher UMA antes de prosseguir):
--   A) Planilha/manual fechado em 31/05/2026 com lista nominal de alunos.
--      → Inserir em tabela temporária `fechamento_validado_maio_cg`.
--   B) Backup do `dados_mensais` anterior ao overwrite (se existir).
--      → Usar cópia do registro de Maio/CG antes da alteração.
--   C) `audit_log` se registrar alterações em `dados_mensais`.
--      → Reconstruir estado anterior via audit trail.
--   D) Reconstrução via `movimentacoes_admin` + `alunos` com data de corte.
--      → Aproximação; não garante exatidão do fechamento.
--
-- Recomendação: Priorizar A ou B. D e C são contingências.
-- =============================================================================


-- =============================================================================
-- 2) TABELA: FECHAMENTO VALIDADO (SEMI-PERMANENTE)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.dados_mensais_fechamentos_validados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id UUID NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  snapshot_validado JSONB NOT NULL,
  fonte TEXT NOT NULL,
  validado_por TEXT,
  validado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT dm_fechamentos_validados_competencia_ck CHECK (mes BETWEEN 1 AND 12),
  CONSTRAINT dm_fechamentos_validados_unique UNIQUE (unidade_id, ano, mes)
);

CREATE INDEX IF NOT EXISTS idx_dm_fechamentos_validados_competencia
  ON public.dados_mensais_fechamentos_validados (unidade_id, ano, mes);

COMMENT ON TABLE public.dados_mensais_fechamentos_validados IS
  'Armazena snapshots validados de fechamentos mensais para auditoria e retificação futura. NUNCA alterar após validação.';


-- =============================================================================
-- 3) FUNÇÃO: LISTAR ALUNOS NOMINALMENTE POR ESTADO E MÉTRICA
--
-- Estados:
--   'vivo'     → cálculo ao vivo sobre tabelas operacionais atuais
--   'validado' → snapshot do fechamento validado (requer dados previamente inseridos)
--   'dados_mensais' → avisa que não guarda lista nominal
--
-- Métricas: alunos_ativos, alunos_pagantes, matriculas_ativas,
--           matriculas_banda, matriculas_2_curso, novas_matriculas
-- =============================================================================

CREATE OR REPLACE FUNCTION public.listar_alunos_nominais_estado(
  p_ano INTEGER,
  p_mes INTEGER,
  p_unidade_id UUID,
  p_estado TEXT,
  p_metrica TEXT
)
RETURNS TABLE (
  aluno_id UUID,
  aluno_nome TEXT,
  curso_nome TEXT,
  status TEXT,
  data_matricula DATE,
  data_saida DATE,
  motivo_diferenca TEXT
)
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_inicio_mes DATE;
  v_fim_mes DATE;
BEGIN
  v_inicio_mes := DATE_TRUNC('month', MAKE_DATE(p_ano, p_mes, 1))::date;
  v_fim_mes  := (v_inicio_mes + INTERVAL '1 month - 1 day')::date;

  -- ESTADO 'vivo'
  IF p_estado = 'vivo' THEN
    IF p_metrica = 'alunos_ativos' THEN
      RETURN QUERY
        SELECT a.id, a.nome, c.nome, a.status, a.data_matricula, a.data_saida,
               'vivo: ativo em ' || v_fim_mes::text
        FROM alunos a
        LEFT JOIN cursos c ON c.id = a.curso_id
        WHERE a.unidade_id = p_unidade_id
          AND a.status IN ('ativo', 'trancado')
          AND a.data_matricula <= v_fim_mes
          AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes)
        ORDER BY a.nome;
    ELSIF p_metrica = 'alunos_pagantes' THEN
      RETURN QUERY
        SELECT a.id, a.nome, c.nome, a.status, a.data_matricula, a.data_saida,
               'vivo: pagante em ' || v_fim_mes::text
        FROM alunos a
        LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
        LEFT JOIN cursos c ON c.id = a.curso_id
        WHERE a.unidade_id = p_unidade_id
          AND a.status IN ('ativo', 'trancado')
          AND a.data_matricula <= v_fim_mes
          AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes)
          AND tm.conta_como_pagante = true
        ORDER BY a.nome;
    ELSIF p_metrica = 'matriculas_ativas' THEN
      RETURN QUERY
        SELECT a.id, a.nome, c.nome, a.status, a.data_matricula, a.data_saida,
               'vivo: matrícula ativa em ' || v_fim_mes::text
        FROM alunos a
        LEFT JOIN cursos c ON c.id = a.curso_id
        WHERE a.unidade_id = p_unidade_id
          AND a.status IN ('ativo', 'trancado')
          AND a.data_matricula <= v_fim_mes
          AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes)
        ORDER BY a.nome;
    ELSIF p_metrica = 'matriculas_banda' THEN
      RETURN QUERY
        SELECT a.id, a.nome, c.nome, a.status, a.data_matricula, a.data_saida,
               'vivo: banda em ' || v_fim_mes::text
        FROM alunos a
        LEFT JOIN cursos c ON c.id = a.curso_id
        WHERE a.unidade_id = p_unidade_id
          AND a.status IN ('ativo', 'trancado')
          AND a.data_matricula <= v_fim_mes
          AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes)
          AND c.is_projeto_banda = true
        ORDER BY a.nome;
    ELSIF p_metrica = 'matriculas_2_curso' THEN
      RETURN QUERY
        SELECT a.id, a.nome, c.nome, a.status, a.data_matricula, a.data_saida,
               'vivo: 2º curso em ' || v_fim_mes::text
        FROM alunos a
        LEFT JOIN cursos c ON c.id = a.curso_id
        WHERE a.unidade_id = p_unidade_id
          AND a.status IN ('ativo', 'trancado')
          AND a.data_matricula <= v_fim_mes
          AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes)
          AND COALESCE(a.is_segundo_curso, false) = true
          AND COALESCE(c.is_projeto_banda, false) = false
        ORDER BY a.nome;
    ELSIF p_metrica = 'novas_matriculas' THEN
      RETURN QUERY
        SELECT a.id, a.nome, c.nome, a.status, a.data_matricula, a.data_saida,
               'vivo: nova matrícula em ' || p_ano || '-' || LPAD(p_mes::text, 2, '0')
        FROM alunos a
        LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
        LEFT JOIN cursos c ON c.id = a.curso_id
        WHERE a.unidade_id = p_unidade_id
          AND a.status IN ('ativo', 'trancado')
          AND a.data_matricula >= v_inicio_mes
          AND a.data_matricula <= v_fim_mes
          AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes)
          AND COALESCE(a.is_segundo_curso, false) = false
          AND (tm.codigo IS NULL OR tm.codigo NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC'))
          AND COALESCE(c.is_projeto_banda, false) = false
          AND (c.nome IS NULL OR c.nome NOT ILIKE '%canto coral%')
        ORDER BY a.nome;
    ELSE
      RAISE EXCEPTION 'Métrica "%" não suportada para estado "vivo"', p_metrica;
    END IF;

  -- ESTADO 'validado' (requer dados previamente inseridos)
  ELSIF p_estado = 'validado' THEN
    RAISE NOTICE 'Inserir lista nominal do fechamento validado para usar este estado.';
    RETURN QUERY
      SELECT NULL::UUID, 'Inserir dados nominais do fechamento validado'::TEXT,
             NULL::TEXT, NULL::TEXT, NULL::DATE, NULL::DATE, 'n/a'::TEXT
      WHERE false;

  -- ESTADO 'dados_mensais' (não guarda lista nominal)
  ELSIF p_estado = 'dados_mensais' THEN
    RAISE NOTICE 'dados_mensais não armazena lista nominal — usar vivo + diff.';
    RETURN QUERY
      SELECT NULL::UUID, 'dados_mensais não armazena lista nominal'::TEXT,
             NULL::TEXT, NULL::TEXT, NULL::DATE, NULL::DATE, 'n/a'::TEXT
      WHERE false;
  ELSE
    RAISE EXCEPTION 'Estado "%" não reconhecido', p_estado;
  END IF;
END;
$function$;


-- =============================================================================
-- 4) FUNÇÃO: AUDITAR DIFERENÇAS NOMINAIS (FRAMEWORK)
--
-- Compara nominalmente dois estados e identifica quem saiu/entrou.
-- Requer dados nominais do fechamento validado para funcionar completamente.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.auditar_diferencas_nominais(
  p_ano INTEGER,
  p_mes INTEGER,
  p_unidade_id UUID,
  p_estado_referencia TEXT,
  p_estado_comparacao TEXT
)
RETURNS TABLE (
  tipo_diferenca TEXT,
  aluno_id UUID,
  aluno_nome TEXT,
  curso_nome TEXT,
  status TEXT,
  data_matricula DATE,
  data_saida DATE,
  metricas_afetadas TEXT[]
)
LANGUAGE plpgsql
STABLE
AS $function$
BEGIN
  RAISE NOTICE 'Framework pronto. Inserir dados nominais do fechamento validado para ativar comparação completa.';
  RETURN QUERY
    SELECT 'FRAMEWORK_PRONTO'::TEXT, NULL::UUID,
           'Aguardando dados nominais do fechamento validado'::TEXT,
           NULL::TEXT, NULL::TEXT, NULL::DATE, NULL::DATE,
           ARRAY['todos']::TEXT[]
    WHERE false;
END;
$function$;


-- =============================================================================
-- 5) FUNÇÃO: CATEGORIZAR TIPO DE MUDANÇA
--
-- Categorias:
--   A) CORRECAO_LEGITIMA — aluno nunca deveria ter sido contado
--   B) ALTERACAO_RETROATIVA — cadastro alterado depois do fechamento
--   C) PERDA_FUNCAO_ANTIGA — job legado sobrescreveu dados
--   D) PERDA_CADASTRO_ATUAL — cadastro atual diverge da realidade de Maio
-- =============================================================================

CREATE OR REPLACE FUNCTION public.categorizar_mudanca_aluno(
  p_aluno_id UUID,
  p_ano INTEGER,
  p_mes INTEGER,
  p_unidade_id UUID,
  p_tipo_diferenca TEXT
)
RETURNS TABLE (
  categoria TEXT,
  confianca TEXT,
  evidencia TEXT,
  recomendacao TEXT
)
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_aluno RECORD;
  v_movimentacoes INTEGER;
  v_data_corte DATE;
BEGIN
  v_data_corte := (DATE_TRUNC('month', MAKE_DATE(p_ano, p_mes, 1))::date + INTERVAL '1 month - 1 day')::date;

  SELECT * INTO v_aluno FROM alunos WHERE id = p_aluno_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'PERDA_CADASTRO_ATUAL'::TEXT, 'media'::TEXT,
      'Aluno não encontrado no cadastro atual.'::TEXT,
      'Verificar merge de cadastros ou exclusão lógica.'::TEXT;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_movimentacoes
  FROM movimentacoes_admin
  WHERE aluno_id = p_aluno_id
    AND unidade_id = p_unidade_id
    AND data >= DATE_TRUNC('month', MAKE_DATE(p_ano, p_mes, 1))::date
    AND data < (DATE_TRUNC('month', MAKE_DATE(p_ano, p_mes, 1))::date + INTERVAL '1 month');

  IF v_movimentacoes > 0 THEN
    RETURN QUERY SELECT
      CASE WHEN p_tipo_diferenca = 'SAIU_DA_REFERENCIA' THEN 'CORRECAO_LEGITIMA' ELSE 'ALTERACAO_RETROATIVA' END::TEXT,
      'alta'::TEXT,
      'Movimentação administrativa encontrada: ' || v_movimentacoes || ' registro(s).'::TEXT,
      'Verificar tipo e data em movimentacoes_admin.'::TEXT;
    RETURN;
  END IF;

  IF v_aluno.data_saida IS NOT NULL AND v_aluno.data_saida <= v_data_corte THEN
    RETURN QUERY SELECT
      'ALTERACAO_RETROATIVA'::TEXT, 'media'::TEXT,
      'data_saida preenchida (' || v_aluno.data_saida::text || ') sem movimentação correspondente.'::TEXT,
      'Verificar se data_saida foi preenchida retroativamente.'::TEXT;
    RETURN;
  END IF;

  IF v_aluno.status NOT IN ('ativo', 'trancado') THEN
    RETURN QUERY SELECT
      'ALTERACAO_RETROATIVA'::TEXT, 'media'::TEXT,
      'Status atual (' || v_aluno.status || ') incompatível com contagem de Maio.'::TEXT,
      'Verificar quando o status mudou e se houve efeito retroativo.'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    'PERDA_FUNCAO_ANTIGA'::TEXT, 'baixa'::TEXT,
    'Nenhuma movimentação ou alteração retroativa óbvia encontrada.'::TEXT,
    'Investigar backup de dados_mensais ou planilha de fechamento.'::TEXT;
END;
$function$;


-- =============================================================================
-- 6) FUNÇÃO: PREVIEW DE RETIFICAÇÃO HISTÓRICA
--
-- Diferença da Fase 2A-REV:
--   2A-REV: atual vs vivo (cálculo ao vivo)
--   2B:     validado vs atual (reconstrução histórica vs estado gravado)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.preview_retificacao_historica(
  p_ano INTEGER,
  p_mes INTEGER,
  p_unidade_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_snapshot_validado JSONB;
  v_snapshot_atual JSONB;
  v_diff JSONB;
BEGIN
  SELECT snapshot_validado INTO v_snapshot_validado
  FROM public.dados_mensais_fechamentos_validados
  WHERE unidade_id = p_unidade_id AND ano = p_ano AND mes = p_mes;

  IF v_snapshot_validado IS NULL THEN
    RETURN jsonb_build_object(
      'erro', true,
      'mensagem', 'Fechamento validado não encontrado. Inserir em dados_mensais_fechamentos_validados antes de usar.',
      'acao', 'Popular tabela com snapshot validado da competência.'
    );
  END IF;

  v_snapshot_atual := public.snapshot_atual_dados_mensais_alunos_matriculas(p_ano, p_mes, p_unidade_id);
  v_diff := public.diff_jsonb_flat(v_snapshot_validado, v_snapshot_atual);

  RETURN jsonb_build_object(
    'modo', 'preview_historico',
    'scope', 'ALUNOS_MATRICULAS_ONLY',
    'grava_em_dados_mensais', false,
    'apply_habilitado', false,
    'ano', p_ano, 'mes', p_mes, 'unidade_id', p_unidade_id,
    'snapshot_validado', v_snapshot_validado,
    'snapshot_atual', COALESCE(v_snapshot_atual, '{}'::jsonb),
    'diff', COALESCE(v_diff, '{}'::jsonb),
    'avisos', jsonb_build_array(
      'Preview compara FECHAMENTO VALIDADO vs ATUAL (não vs vivo).',
      'Requer dados_mensais_fechamentos_validados populado previamente.',
      'Não compara id, created_at, updated_at, ticket_medio ou financeiro.',
      'Análise nominal depende de lista de alunos do fechamento validado.',
      'Apply permanece bloqueado.'
    )
  );
END;
$function$;


-- =============================================================================
-- 7) VALIDAÇÃO MANUAL — RODAR SEPARADAMENTE, NÃO EMBUTIR EM MIGRATION
--
-- ATENÇÃO: Existem TRÊS ESTADOS distintos para Maio/CG/2026:
--
--   1) FECHAMENTO VALIDADO (o correto, que precisamos preservar/restaurar)
--      alunos_ativos: 496
--      alunos_pagantes: 470
--      matriculas_ativas: 561
--      matriculas_banda: 41
--      matriculas_2_curso: 27
--      novas_matriculas: 23
--      evasoes: 13
--      churn_rate: ~2.77%
--
--   2) SNAPSHOT ATUAL em dados_mensais (contaminado pelo job legado)
--      alunos_ativos: 489  (-7 vs validado)
--      alunos_pagantes: 463  (-7 vs validado)
--      matriculas_ativas: 552  (-9 vs validado)
--      matriculas_banda: 40  (-1 vs validado)
--      matriculas_2_curso: 27  (igual)
--      novas_matriculas: 23  (igual)
--
--   3) CÁLCULO VIVO atual olhando Maio (ainda mais distante, usa cadastro atual)
--      alunos_ativos: 475  (-21 vs validado, -14 vs atual)
--      alunos_pagantes: 445  (-25 vs validado, -18 vs atual)
--      matriculas_ativas: 538  (-23 vs validado, -14 vs atual)
--      matriculas_banda: 40  (-1 vs validado, igual vs atual)
--      matriculas_2_curso: 27  (igual)
--      novas_matriculas: 23  (igual)
--
-- O preview da Fase 2A-REV provou segurança técnica (não altera dados),
-- mas NÃO valida número histórico. Os números do preview (vivo) estão
-- mais errados que o snapshot atual, porque o cadastro de alunos divergiu
-- ainda mais desde o fechamento de Maio.
-- =============================================================================

-- 7.1) POPULAR FECHAMENTO VALIDADO (MANUAL)
--
-- Inserir o snapshot validado de Maio/CG com os números corretos:
--
-- INSERT INTO public.dados_mensais_fechamentos_validados (
--   unidade_id, ano, mes, snapshot_validado, fonte, validado_por, validado_em
-- ) VALUES (
--   '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
--   2026,
--   5,
--   jsonb_build_object(
--     'scope', 'ALUNOS_MATRICULAS_ONLY',
--     'ano', 2026,
--     'mes', 5,
--     'unidade_id', '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
--     'alunos_ativos', 496,
--     'alunos_pagantes', 470,
--     'matriculas_ativas', 561,
--     'matriculas_banda', 41,
--     'matriculas_2_curso', 27,
--     'novas_matriculas', 23,
--     'evasoes', 13,
--     'churn_rate', 2.77,
--     'financeiro_alterado', false
--   ),
--   'planilha_fechamento_31_05_2026_cg',
--   '<nome_responsavel>',
--   '2026-05-31T00:00:00Z'
-- );

-- 7.2) PRE-CHECK — snapshot atual (contaminado) antes de qualquer operação
-- SELECT * FROM public.snapshot_atual_dados_mensais_alunos_matriculas(2026, 5, '2ec861f6-023f-4d7b-9927-3960ad8c2a92');

-- 7.3) RODAR PREVIEW HISTÓRICO — validado vs atual
-- SELECT public.preview_retificacao_historica(2026, 5, '2ec861f6-023f-4d7b-9927-3960ad8c2a92');

-- 7.4) LISTAR ALUNOS NOMINALMENTE (vivo = estado atual do cadastro)
--
-- ATENÇÃO: estado 'vivo' mostra o cadastro ATUAL, não o de Maio.
-- Serve para entender por que o cálculo vivo diverge, mas NÃO representa
-- o fechamento histórico.
--
-- SELECT * FROM public.listar_alunos_nominais_estado(2026, 5, '2ec861f6-023f-4d7b-9927-3960ad8c2a92', 'vivo', 'alunos_ativos');
-- SELECT * FROM public.listar_alunos_nominais_estado(2026, 5, '2ec861f6-023f-4d7b-9927-3960ad8c2a92', 'vivo', 'alunos_pagantes');
-- SELECT * FROM public.listar_alunos_nominais_estado(2026, 5, '2ec861f6-023f-4d7b-9927-3960ad8c2a92', 'vivo', 'matriculas_banda');

-- 7.5) POST-CHECK — confirmar que dados_mensais não mudou
-- SELECT id, updated_at FROM public.dados_mensais
-- WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2026 AND mes = 5;


-- =============================================================================
-- 8) RISCOS
--
-- 1. Fonte confiável pode não existir. Reconstrução depende de planilha/manual.
-- 2. Lista nominal do fechamento validado pode não estar disponível.
-- 3. Categorização é heurística; confiança varia de baixa a alta.
-- 4. audit_log pode não ter granularidade suficiente para reconstrução.
-- 5. Sem snapshot do estado de `alunos` em 31/05/2026, reconstrução é
--    aproximada e depende de evidência externa.
-- =============================================================================


-- =============================================================================
-- 9) PLANO DE VALIDAÇÃO
--
-- Antes de qualquer execução futura:
--   [ ] Identificar e documentar fonte do fechamento validado
--   [ ] Inserir snapshot validado em dados_mensais_fechamentos_validados
--   [ ] Inserir lista nominal do fechamento validado (se disponível)
--   [ ] Rodar PRE-CHECK e POST-CHECK manualmente
--   [ ] Confirmar que dados_mensais não mudou
--   [ ] Validar diff entre validado e atual
--   [ ] Comparar alunos nominalmente (vivo vs validado)
--   [ ] Categorizar cada divergência
--   [ ] Validar que apply permanece bloqueado
-- =============================================================================


-- =============================================================================
-- 10) ROLLBACK (PROPOSTA)
-- =============================================================================
-- DROP FUNCTION IF EXISTS public.preview_retificacao_historica(INTEGER, INTEGER, UUID);
-- DROP FUNCTION IF EXISTS public.categorizar_mudanca_aluno(UUID, INTEGER, INTEGER, UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.auditar_diferencas_nominais(INTEGER, INTEGER, UUID, TEXT, TEXT);
-- DROP FUNCTION IF EXISTS public.listar_alunos_nominais_estado(INTEGER, INTEGER, UUID, TEXT, TEXT);
-- DROP TABLE IF EXISTS public.dados_mensais_fechamentos_validados;


-- =============================================================================
-- CHECKLIST DE REVISÃO HUMANA
--
-- [ ] Arquivo marcado como PROPOSTA
-- [ ] preview_retificacao_historica não altera dados_mensais
-- [ ] Requer dados_mensais_fechamentos_validados previamente populado
-- [ ] listar_alunos_nominais_estado cobre métricas do escopo
-- [ ] categorizar_mudanca_aluno retorna confiança e evidência
-- [ ] apply permanece bloqueado
-- [ ] Não recalcula Maio automaticamente
-- [ ] Não faz backfill
-- =============================================================================
