-- ============================================
-- Migration: Corrigir fechamento mensal para excluir atividades extras de evasões/churn
-- Contexto: recalcular_dados_mensais_unguarded alimenta dados_mensais no fechamento da competência.
-- Segurança: não altera dados e não roda fechamento. Apenas redefine função existente.
-- ============================================

CREATE OR REPLACE FUNCTION public.recalcular_dados_mensais_unguarded(p_ano integer, p_mes integer, p_unidade_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_result jsonb;
  v_inicio_mes date;
  v_fim_mes date;
  v_alunos_ativos integer;
  v_alunos_pagantes integer;
  v_matriculas_ativas integer;
  v_matriculas_banda integer;
  v_matriculas_2_curso integer;
  v_novas_matriculas integer;
  v_evasoes integer;
  v_churn_rate numeric;
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
    LEFT JOIN alunos aluno_mov ON aluno_mov.id = m.aluno_id
    WHERE m.unidade_id = p_unidade_id
      AND m.tipo IN ('evasao', 'nao_renovacao')
      AND m.data >= v_inicio_mes
      AND m.data < (v_fim_mes + INTERVAL '1 day')
      AND NOT public.is_atividade_extra_curso(COALESCE(m.curso_id, aluno_mov.curso_id))
    ORDER BY
      LOWER(TRIM(BOTH FROM m.aluno_nome)),
      m.aluno_id DESC NULLS LAST,
      m.data DESC
  ) ev;

  v_churn_rate := CASE
    WHEN COALESCE(v_alunos_pagantes, 0) > 0
    THEN ROUND((v_evasoes::numeric / v_alunos_pagantes::numeric) * 100, 2)
    ELSE 0
  END;

  INSERT INTO dados_mensais (
    unidade_id, ano, mes,
    alunos_ativos, alunos_pagantes, matriculas_ativas,
    matriculas_banda, matriculas_2_curso,
    novas_matriculas, evasoes, churn_rate,
    updated_at
  ) VALUES (
    p_unidade_id, p_ano, p_mes,
    v_alunos_ativos, v_alunos_pagantes, v_matriculas_ativas,
    v_matriculas_banda, v_matriculas_2_curso,
    v_novas_matriculas, v_evasoes, v_churn_rate,
    NOW()
  )
  ON CONFLICT (unidade_id, ano, mes) DO UPDATE SET
    alunos_ativos = EXCLUDED.alunos_ativos,
    alunos_pagantes = EXCLUDED.alunos_pagantes,
    matriculas_ativas = EXCLUDED.matriculas_ativas,
    matriculas_banda = EXCLUDED.matriculas_banda,
    matriculas_2_curso = EXCLUDED.matriculas_2_curso,
    novas_matriculas = EXCLUDED.novas_matriculas,
    evasoes = EXCLUDED.evasoes,
    churn_rate = EXCLUDED.churn_rate,
    updated_at = NOW();

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
$function$
;


COMMENT ON FUNCTION public.recalcular_dados_mensais_unguarded(integer, integer, uuid)
IS 'Fechamento mensal sem guarda: evasões/churn excluem atividades extras via is_atividade_extra_curso(COALESCE(movimentacoes_admin.curso_id, alunos.curso_id)).';
