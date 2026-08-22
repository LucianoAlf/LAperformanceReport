-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Corrigir função para não inserir em colunas GENERATED
CREATE OR REPLACE FUNCTION snapshot_dados_mensais(p_ano INTEGER, p_mes INTEGER)
RETURNS TABLE (unidade_nome VARCHAR, registros_afetados INTEGER) AS $$
DECLARE
  v_unidade RECORD;
BEGIN
  FOR v_unidade IN SELECT id, nome FROM unidades WHERE ativo = true LOOP
    
    INSERT INTO dados_mensais (
      unidade_id, ano, mes,
      alunos_pagantes, novas_matriculas, evasoes,
      churn_rate, ticket_medio, taxa_renovacao,
      tempo_permanencia, inadimplencia
      -- faturamento_estimado e saldo_liquido são GENERATED, não inserir
    )
    SELECT 
      v_unidade.id,
      p_ano,
      p_mes,
      -- Alunos pagantes
      (SELECT COUNT(*) FROM alunos a 
       LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
       WHERE a.unidade_id = v_unidade.id AND a.status = 'ativo' 
       AND (tm.conta_como_pagante = true OR tm.id IS NULL))::INTEGER,
      -- Novas matrículas do mês
      (SELECT COALESCE(SUM(quantidade), 0) FROM leads_diarios 
       WHERE unidade_id = v_unidade.id AND tipo = 'matricula'
       AND EXTRACT(YEAR FROM data) = p_ano AND EXTRACT(MONTH FROM data) = p_mes)::INTEGER,
      -- Evasões do mês
      (SELECT COUNT(*) FROM evasoes 
       WHERE unidade = v_unidade.nome
       AND EXTRACT(YEAR FROM competencia) = p_ano AND EXTRACT(MONTH FROM competencia) = p_mes)::INTEGER,
      -- Churn rate
      COALESCE((
        SELECT CASE WHEN dm_ant.alunos_pagantes > 0 
          THEN ROUND(((SELECT COUNT(*) FROM evasoes WHERE unidade = v_unidade.nome 
                       AND EXTRACT(YEAR FROM competencia) = p_ano 
                       AND EXTRACT(MONTH FROM competencia) = p_mes)::NUMERIC 
                      / dm_ant.alunos_pagantes) * 100, 2)
          ELSE 0 END
        FROM dados_mensais dm_ant
        WHERE dm_ant.unidade_id = v_unidade.id 
        AND ((dm_ant.ano = p_ano AND dm_ant.mes = p_mes - 1)
           OR (dm_ant.ano = p_ano - 1 AND dm_ant.mes = 12 AND p_mes = 1))
        LIMIT 1
      ), 0),
      -- Ticket médio
      (SELECT COALESCE(ROUND(AVG(a.valor_parcela), 2), 0) FROM alunos a
       LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
       WHERE a.unidade_id = v_unidade.id AND a.status = 'ativo'
       AND (tm.entra_ticket_medio = true OR tm.id IS NULL)),
      -- Taxa renovação (placeholder)
      0,
      -- Tempo permanência médio
      (SELECT COALESCE(ROUND(AVG(tempo_permanencia_meses), 0), 0) FROM alunos 
       WHERE unidade_id = v_unidade.id AND status = 'ativo')::INTEGER,
      -- Inadimplência (placeholder)
      0
    ON CONFLICT (unidade_id, ano, mes) DO UPDATE SET
      alunos_pagantes = EXCLUDED.alunos_pagantes,
      novas_matriculas = EXCLUDED.novas_matriculas,
      evasoes = EXCLUDED.evasoes,
      churn_rate = EXCLUDED.churn_rate,
      ticket_medio = EXCLUDED.ticket_medio,
      tempo_permanencia = EXCLUDED.tempo_permanencia,
      updated_at = NOW();
    
    unidade_nome := v_unidade.nome;
    registros_afetados := 1;
    RETURN NEXT;
    
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;
