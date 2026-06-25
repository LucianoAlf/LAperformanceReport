-- =============================================================================
-- MIGRACAO_FASE2A_CALCULO_PURO_SNAPSHOT_DADOS_MENSAIS_PROPOSTA.sql
--
-- FASE 2A — SEPARAÇÃO ENTRE CÁLCULO E GRAVAÇÃO (PROPOSTA)
--
-- OBJETIVO
--   Extrair a lógica de cálculo de `recalcular_dados_mensais` para uma função
--   pura, segura e sem side effects, por exemplo:
--
--     public.calcular_snapshot_dados_mensais(p_ano, p_mes, p_unidade_id)
--
--   Essa função deve apenas retornar o snapshot proposto e nunca alterar
--   `dados_mensais` nem qualquer outra tabela.
--
-- IMPORTANTE
--   - Modo proposta: NÃO executar sem aprovação explícita.
--   - Esta proposta NÃO recalcula Maio/2026.
--   - Esta proposta NÃO altera `dados_mensais`.
--   - Esta proposta NÃO habilita apply.
--   - Esta proposta NÃO faz backfill.
--   - Esta proposta NÃO altera a função operacional nesta fase.
--
-- PRINCÍPIO
--   cálculo puro primeiro, gravação depois.
-- =============================================================================


-- =============================================================================
-- BLOCO 1) RESUMO DA LÓGICA ATUAL DE `recalcular_dados_mensais`
--
-- A função atual já calcula corretamente o bloco principal de alunos/matrículas:
--   - alunos_ativos
--   - alunos_pagantes
--   - matriculas_ativas
--   - matriculas_banda
--   - matriculas_2_curso
--   - novas_matriculas
--   - evasoes
--   - churn_rate
--
-- Problema atual:
--   depois do cálculo, ela faz INSERT/UPSERT em `dados_mensais`.
--
-- Meta da Fase 2A:
--   preservar a mesma lógica de cálculo, removendo qualquer efeito colateral.
-- =============================================================================


-- =============================================================================
-- BLOCO 2) CONTRATO PROPOSTO DA FUNÇÃO PURA
--
-- Nome sugerido:
--   public.calcular_snapshot_dados_mensais(p_ano, p_mes, p_unidade_id)
--
-- Entrada:
--   - p_ano INTEGER
--   - p_mes INTEGER
--   - p_unidade_id UUID
--
-- Saída:
--   JSONB com os mesmos campos calculáveis da rotina atual
--
-- Restrições:
--   - sem INSERT
--   - sem UPDATE
--   - sem UPSERT
--   - sem DELETE
--   - sem alteração em `dados_mensais`
--   - sem alteração em qualquer tabela
-- =============================================================================


-- =============================================================================
-- BLOCO 3) FUNÇÃO PURA PROPOSTA
--
-- Observação:
--   Esta função replica a lógica de cálculo atual e remove totalmente o bloco
--   de persistência em `dados_mensais`.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.calcular_snapshot_dados_mensais(
  p_ano INTEGER,
  p_mes INTEGER,
  p_unidade_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $function$
DECLARE
  v_result JSONB;
  v_inicio_mes DATE;
  v_fim_mes DATE;
  v_alunos_ativos INTEGER;
  v_alunos_pagantes INTEGER;
  v_matriculas_ativas INTEGER;
  v_matriculas_banda INTEGER;
  v_matriculas_2_curso INTEGER;
  v_novas_matriculas INTEGER;
  v_evasoes INTEGER;
  v_churn_rate NUMERIC;
BEGIN
  v_inicio_mes := DATE_TRUNC('month', MAKE_DATE(p_ano, p_mes, 1))::date;
  v_fim_mes := (v_inicio_mes + INTERVAL '1 month - 1 day')::date;

  SELECT COUNT(DISTINCT a.nome)
  INTO v_alunos_ativos
  FROM alunos a
  WHERE a.unidade_id = p_unidade_id
    AND a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= v_fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes);

  SELECT COUNT(DISTINCT a.nome)
  INTO v_alunos_pagantes
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.unidade_id = p_unidade_id
    AND a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= v_fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes)
    AND tm.conta_como_pagante = true;

  SELECT COUNT(*)
  INTO v_matriculas_ativas
  FROM alunos a
  WHERE a.unidade_id = p_unidade_id
    AND a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= v_fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes);

  SELECT COUNT(*)
  INTO v_matriculas_banda
  FROM alunos a
  LEFT JOIN cursos c ON c.id = a.curso_id
  WHERE a.unidade_id = p_unidade_id
    AND a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= v_fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes)
    AND c.is_projeto_banda = true;

  SELECT COUNT(*)
  INTO v_matriculas_2_curso
  FROM alunos a
  LEFT JOIN cursos c ON c.id = a.curso_id
  WHERE a.unidade_id = p_unidade_id
    AND a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= v_fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes)
    AND COALESCE(a.is_segundo_curso, false) = true
    AND COALESCE(c.is_projeto_banda, false) = false;

  SELECT COUNT(*)
  INTO v_novas_matriculas
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
    AND (c.nome IS NULL OR c.nome NOT ILIKE '%canto coral%');

  SELECT COUNT(*)
  INTO v_evasoes
  FROM (
    SELECT DISTINCT ON (LOWER(TRIM(BOTH FROM m.aluno_nome)))
      m.id
    FROM movimentacoes_admin m
    WHERE m.unidade_id = p_unidade_id
      AND m.tipo IN ('evasao', 'nao_renovacao')
      AND m.data >= v_inicio_mes
      AND m.data < (v_fim_mes + INTERVAL '1 day')
    ORDER BY
      LOWER(TRIM(BOTH FROM m.aluno_nome)),
      m.aluno_id DESC NULLS LAST,
      m.data DESC
  ) ev;

  v_churn_rate := CASE
    WHEN COALESCE(v_alunos_pagantes, 0) > 0
    THEN ROUND((v_evasoes::NUMERIC / v_alunos_pagantes::NUMERIC) * 100, 2)
    ELSE 0
  END;

  v_result := jsonb_build_object(
    'scope', 'ALUNOS_MATRICULAS_ONLY',
    'ano', p_ano,
    'mes', p_mes,
    'unidade_id', p_unidade_id,
    'alunos_ativos', v_alunos_ativos,
    'alunos_pagantes', v_alunos_pagantes,
    'matriculas_ativas', v_matriculas_ativas,
    'matriculas_banda', v_matriculas_banda,
    'matriculas_2_curso', v_matriculas_2_curso,
    'novas_matriculas', v_novas_matriculas,
    'evasoes', v_evasoes,
    'churn_rate', v_churn_rate,
    'financeiro_alterado', false
  );

  RETURN v_result;
END;
$function$;


-- =============================================================================
-- BLOCO 4) COMPARAÇÃO: FUNÇÃO ATUAL VS FUNÇÃO PURA PROPOSTA
--
-- Igual ao cálculo atual:
--   - mesmas entradas: ano, mês, unidade
--   - mesma base lógica de alunos/matrículas
--   - mesma regra de competência histórica
--   - mesma regra de evasão deduplicada via movimentacoes_admin
--   - mesmo cálculo de churn baseado em pagantes
--
-- Removido na função pura:
--   - INSERT INTO dados_mensais
--   - ON CONFLICT DO UPDATE
--   - updated_at = NOW()
--   - qualquer persistência em banco
--
-- Benefício:
--   - pode ser chamada infinitas vezes sem side effects
--   - permite preview real
--   - permite diff real
--   - prepara o apply controlado futuro
-- =============================================================================


-- =============================================================================
-- BLOCO 5) CAMPOS CALCULADOS PELA FUNÇÃO PURA
--
-- A saída proposta inclui:
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
-- Observação:
--   Esta Fase 2A mantém o mesmo escopo atual de `recalcular_dados_mensais`:
--   bloco de alunos/matrículas, sem expandir financeiro.
-- =============================================================================


-- =============================================================================
-- BLOCO 6) EXEMPLO DE USO FUTURO NO PREVIEW
--
-- Quando a Fase 2 evoluir, o preview pode usar:
--
--   SELECT public.calcular_snapshot_dados_mensais(2026, 5, '<unidade_uuid>');
--
-- E comparar isso com:
--
--   SELECT to_jsonb(dm)
--   FROM dados_mensais dm
--   WHERE dm.unidade_id = '<unidade_uuid>'
--     AND dm.ano = 2026
--     AND dm.mes = 5;
-- =============================================================================


-- =============================================================================
-- BLOCO 7) PONTOS DE RISCO
--
-- 1. Duplicidade por nome
--    A lógica atual usa COUNT(DISTINCT a.nome) para alguns indicadores.
--    Isso preserva o comportamento atual, mas nomes homônimos continuam sendo
--    um risco conceitual se a base não tiver identidade única confiável.
--
-- 2. Dependência de `movimentacoes_admin`
--    A qualidade de `evasoes` depende da consistência dessa tabela.
--
-- 3. Escopo parcial
--    Esta função pura cobre apenas o bloco atual de alunos/matrículas.
--    Ticket médio, renovação, reajuste e outros blocos exigem desenho separado.
--
-- 4. Compatibilidade de contrato
--    Se o preview futuro quiser retorno tabular em vez de JSONB, isso deve ser
--    decidido antes da implementação operacional.
--
-- 5. Não corrige histórico por si só
--    Esta função apenas calcula; não altera nenhum dado existente.
-- =============================================================================


-- =============================================================================
-- BLOCO 8) PLANO DE VALIDAÇÃO (PROPOSTA)
--
-- Antes de qualquer execução futura:
--   [ ] validar que a função não contém INSERT/UPDATE/UPSERT/DELETE
--   [ ] validar que o retorno JSONB contém todos os campos esperados
--   [ ] comparar retorno da função pura com o JSON que hoje sai de
--       `recalcular_dados_mensais` antes do bloco de persistência
--   [ ] validar competência histórica para mês fechado
--   [ ] validar repetibilidade: múltiplas execuções retornam o mesmo resultado
--   [ ] validar que `dados_mensais` permanece intocado
-- =============================================================================


-- =============================================================================
-- BLOCO 9) ROLLBACK (PROPOSTA)
--
-- Use apenas se esta fase vier a ser executada futuramente e precisar ser
-- revertida.
-- =============================================================================
-- DROP FUNCTION IF EXISTS public.calcular_snapshot_dados_mensais(
--   INTEGER,
--   INTEGER,
--   UUID
-- );


-- =============================================================================
-- CHECKLIST DE REVISÃO HUMANA
--
-- [ ] O arquivo está claramente marcado como PROPOSTA
-- [ ] A função proposta não altera nenhuma tabela
-- [ ] O contrato de entrada/saída está claro
-- [ ] A comparação com `recalcular_dados_mensais` está documentada
-- [ ] Os riscos estão explícitos
-- [ ] O plano de validação está explícito
-- =============================================================================
