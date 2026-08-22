-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


CREATE OR REPLACE FUNCTION fechar_dados_mensais(p_ano INT, p_mes INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inicio DATE := make_date(p_ano, p_mes, 1);
  v_fim DATE := (make_date(p_ano, p_mes, 1) + INTERVAL '1 month')::date;
  v_unidade RECORD;
  v_alunos_ativos INT;
  v_alunos_pagantes INT;
  v_matriculas_ativas INT;
  v_matriculas_banda INT;
  v_matriculas_2_curso INT;
  v_novas_matriculas INT;
  v_evasoes INT;
  v_churn_rate NUMERIC;
  v_ticket_medio NUMERIC;
BEGIN
  FOR v_unidade IN SELECT id, nome FROM unidades WHERE nome IN ('Barra', 'Campo Grande', 'Recreio')
  LOOP
    -- Alunos ativos no fim do mês (únicos, sem segundo curso)
    SELECT COUNT(*) INTO v_alunos_ativos
    FROM alunos
    WHERE unidade_id = v_unidade.id
      AND is_segundo_curso = false
      AND data_matricula < v_fim
      AND (status = 'ativo' OR (status = 'inativo' AND data_saida >= v_fim));

    -- Alunos pagantes (tipos que contam como pagante)
    SELECT COUNT(*) INTO v_alunos_pagantes
    FROM alunos a
    JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
    WHERE a.unidade_id = v_unidade.id
      AND a.is_segundo_curso = false
      AND tm.conta_como_pagante = true
      AND a.data_matricula < v_fim
      AND (a.status = 'ativo' OR (a.status = 'inativo' AND a.data_saida >= v_fim));

    -- Matrículas ativas (total incluindo segundo curso e banda)
    SELECT COUNT(*) INTO v_matriculas_ativas
    FROM alunos
    WHERE unidade_id = v_unidade.id
      AND data_matricula < v_fim
      AND (status = 'ativo' OR (status = 'inativo' AND data_saida >= v_fim));

    -- Matrículas banda (tipo_matricula=5 OU curso=33)
    SELECT COUNT(*) INTO v_matriculas_banda
    FROM alunos
    WHERE unidade_id = v_unidade.id
      AND (tipo_matricula_id = 5 OR curso_id = 33)
      AND data_matricula < v_fim
      AND (status = 'ativo' OR (status = 'inativo' AND data_saida >= v_fim));

    -- Matrículas segundo curso
    SELECT COUNT(*) INTO v_matriculas_2_curso
    FROM alunos
    WHERE unidade_id = v_unidade.id
      AND is_segundo_curso = true
      AND data_matricula < v_fim
      AND (status = 'ativo' OR (status = 'inativo' AND data_saida >= v_fim));

    -- Novas matrículas no mês (excluindo segundo curso e não pagantes)
    SELECT COUNT(*) INTO v_novas_matriculas
    FROM alunos a
    JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
    WHERE a.unidade_id = v_unidade.id
      AND a.data_matricula >= v_inicio AND a.data_matricula < v_fim
      AND a.is_segundo_curso = false
      AND tm.conta_como_pagante = true;

    -- Evasões no mês
    SELECT COUNT(*) INTO v_evasoes
    FROM alunos
    WHERE unidade_id = v_unidade.id
      AND data_saida >= v_inicio AND data_saida < v_fim
      AND status = 'inativo';

    -- Churn rate
    v_churn_rate := CASE 
      WHEN v_alunos_ativos > 0 THEN ROUND(v_evasoes::numeric / v_alunos_ativos * 100, 2)
      ELSE 0 
    END;

    -- Ticket médio (média das parcelas dos pagantes ativos no fim do mês)
    SELECT COALESCE(ROUND(AVG(a.valor_parcela), 2), 0) INTO v_ticket_medio
    FROM alunos a
    JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
    WHERE a.unidade_id = v_unidade.id
      AND a.is_segundo_curso = false
      AND tm.conta_como_pagante = true
      AND a.valor_parcela > 0
      AND a.data_matricula < v_fim
      AND (a.status = 'ativo' OR (a.status = 'inativo' AND a.data_saida >= v_fim));

    -- UPSERT (sem faturamento_estimado e saldo_liquido pois são GENERATED)
    INSERT INTO dados_mensais (
      unidade_id, ano, mes,
      alunos_ativos, alunos_pagantes, matriculas_ativas,
      matriculas_banda, matriculas_2_curso,
      novas_matriculas, evasoes, churn_rate,
      ticket_medio
    ) VALUES (
      v_unidade.id, p_ano, p_mes,
      v_alunos_ativos, v_alunos_pagantes, v_matriculas_ativas,
      v_matriculas_banda, v_matriculas_2_curso,
      v_novas_matriculas, v_evasoes, v_churn_rate,
      v_ticket_medio
    )
    ON CONFLICT (unidade_id, ano, mes)
    DO UPDATE SET
      alunos_ativos = EXCLUDED.alunos_ativos,
      alunos_pagantes = EXCLUDED.alunos_pagantes,
      matriculas_ativas = EXCLUDED.matriculas_ativas,
      matriculas_banda = EXCLUDED.matriculas_banda,
      matriculas_2_curso = EXCLUDED.matriculas_2_curso,
      novas_matriculas = EXCLUDED.novas_matriculas,
      evasoes = EXCLUDED.evasoes,
      churn_rate = EXCLUDED.churn_rate,
      ticket_medio = EXCLUDED.ticket_medio;
  END LOOP;
END;
$$;
