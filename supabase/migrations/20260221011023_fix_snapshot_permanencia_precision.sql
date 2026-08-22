-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

CREATE OR REPLACE FUNCTION public.snapshot_dados_mensais(p_ano integer, p_mes integer)
 RETURNS TABLE(unidade_nome text, registros_afetados integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_unidade RECORD;
BEGIN
  FOR v_unidade IN SELECT id, nome FROM unidades WHERE ativo = true LOOP
    INSERT INTO dados_mensais (
      unidade_id, ano, mes, alunos_pagantes, novas_matriculas, evasoes,
      churn_rate, ticket_medio, taxa_renovacao, tempo_permanencia, inadimplencia
    )
    SELECT 
      v_unidade.id, p_ano, p_mes,
      (SELECT COUNT(*) FROM alunos a LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
       WHERE a.unidade_id = v_unidade.id AND a.status = 'ativo' AND (tm.conta_como_pagante = true OR tm.id IS NULL))::INTEGER,
      (SELECT COALESCE(SUM(COALESCE(quantidade, 1)), 0) FROM leads 
       WHERE unidade_id = v_unidade.id AND status IN ('matriculado','convertido')
       AND EXTRACT(YEAR FROM data_contato) = p_ano AND EXTRACT(MONTH FROM data_contato) = p_mes)::INTEGER,
      (SELECT COUNT(*) FROM evasoes WHERE unidade = v_unidade.nome
       AND EXTRACT(YEAR FROM competencia) = p_ano AND EXTRACT(MONTH FROM competencia) = p_mes)::INTEGER,
      COALESCE((SELECT CASE WHEN dm_ant.alunos_pagantes > 0 
        THEN ROUND(((SELECT COUNT(*) FROM evasoes WHERE unidade = v_unidade.nome 
                     AND EXTRACT(YEAR FROM competencia) = p_ano AND EXTRACT(MONTH FROM competencia) = p_mes)::NUMERIC 
                    / dm_ant.alunos_pagantes) * 100, 2) ELSE 0 END
        FROM dados_mensais dm_ant WHERE dm_ant.unidade_id = v_unidade.id 
        AND ((dm_ant.ano = p_ano AND dm_ant.mes = p_mes - 1) OR (dm_ant.ano = p_ano - 1 AND dm_ant.mes = 12 AND p_mes = 1))
        LIMIT 1), 0),
      (SELECT COALESCE(ROUND(AVG(a.valor_parcela), 2), 0) FROM alunos a
       LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
       WHERE a.unidade_id = v_unidade.id AND a.status = 'ativo' AND (tm.entra_ticket_medio = true OR tm.id IS NULL)),
      0,
      (SELECT COALESCE(ROUND(AVG(tempo_permanencia_meses), 1), 0) FROM alunos WHERE unidade_id = v_unidade.id AND status = 'ativo'),
      0
    ON CONFLICT (unidade_id, ano, mes) DO UPDATE SET
      alunos_pagantes = EXCLUDED.alunos_pagantes, novas_matriculas = EXCLUDED.novas_matriculas,
      evasoes = EXCLUDED.evasoes, churn_rate = EXCLUDED.churn_rate, ticket_medio = EXCLUDED.ticket_medio,
      tempo_permanencia = EXCLUDED.tempo_permanencia, updated_at = NOW();
    
    unidade_nome := v_unidade.nome;
    registros_afetados := 1;
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$function$;
