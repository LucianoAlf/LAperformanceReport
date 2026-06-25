-- =============================================================================
-- MIGRACAO_REGLA_KPI_V4_FINANCEIRO.sql
-- Parte 2/2: KPIs FINANCEIROS (pendente validação nominal)
-- NÃO EXECUTAR sem aprovação do Alf e validação contra ADM/Emusys
-- =============================================================================

/*
SCHEMA CHECK (executar manualmente antes):
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'dados_mensais'
  AND column_name IN (
    'ticket_medio','mrr','inadimplencia',
    'taxa_renovacao','reajuste_parcelas','tempo_permanencia'
  );
*/

-- =============================================================================
-- VIEW completa com financeiros (substitui V4_ALUNOS quando aprovada)
-- =============================================================================

CREATE OR REPLACE VIEW vw_kpis_gestao_mensal AS
WITH fm AS (
  SELECT DATE_TRUNC('month', CURRENT_DATE)::DATE AS inicio_mes,
         (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE AS fim_mes
),
sb AS (
  SELECT a.unidade_id, a.id, a.nome, a.status, a.data_matricula, a.data_saida,
         a.valor_parcela, a.is_segundo_curso, a.tipo_matricula_id, a.curso_id,
         a.status_pagamento, tm.codigo AS tipo_matricula_codigo,
         tm.conta_como_pagante, tm.entra_ticket_medio, tm.entra_churn,
         c.is_projeto_banda, c.nome AS curso_nome
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  LEFT JOIN cursos c ON c.id = a.curso_id
  CROSS JOIN fm
  WHERE a.status IN ('ativo','trancado')
    AND a.data_matricula <= fm.fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > fm.fim_mes)
),
mm AS (
  SELECT a.unidade_id,
    EXTRACT(year FROM a.data_matricula)::int AS ano,
    EXTRACT(month FROM a.data_matricula)::int AS mes,
    COUNT(*) AS novas_matriculas
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  LEFT JOIN cursos c ON c.id = a.curso_id
  CROSS JOIN fm
  WHERE a.status IN ('ativo','trancado')
    AND a.data_matricula >= fm.inicio_mes AND a.data_matricula <= fm.fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > fm.fim_mes)
    AND COALESCE(a.is_segundo_curso, false) = false
    AND (tm.codigo IS NULL OR tm.codigo NOT IN ('BOLSISTA_INT','BOLSISTA_PARC'))
    AND COALESCE(c.is_projeto_banda, false) = false
    AND (c.nome IS NULL OR c.nome NOT ILIKE '%canto coral%')
  GROUP BY a.unidade_id, EXTRACT(year FROM a.data_matricula), EXTRACT(month FROM a.data_matricula)
),
at AS (
  SELECT sb.unidade_id, EXTRACT(year FROM CURRENT_DATE)::int AS ano, EXTRACT(month FROM CURRENT_DATE)::int AS mes,
    COUNT(DISTINCT sb.nome) AS total_alunos,
    COUNT(DISTINCT sb.nome) FILTER (WHERE sb.conta_como_pagante) AS alunos_pagantes,
    COUNT(DISTINCT sb.nome) FILTER (WHERE sb.tipo_matricula_codigo='BOLSISTA_INT') AS bolsistas_integrais,
    COUNT(DISTINCT sb.nome) FILTER (WHERE sb.tipo_matricula_codigo='BOLSISTA_PARC') AS bolsistas_parciais,
    COUNT(*) AS matriculas_ativas,
    COUNT(*) FILTER (WHERE sb.is_projeto_banda) AS total_banda,
    COUNT(*) FILTER (WHERE sb.is_segundo_curso AND NOT COALESCE(sb.is_projeto_banda,false)) AS segundo_curso,
    SUM(sb.valor_parcela) FILTER (WHERE sb.conta_como_pagante AND COALESCE(sb.status_pagamento,'')<>'sem_parcela') AS mrr,
    COUNT(DISTINCT sb.nome) FILTER (WHERE sb.status_pagamento='inadimplente' AND sb.conta_como_pagante) AS qtd_inadimplentes,
    COALESCE(SUM(sb.valor_parcela) FILTER (WHERE sb.status_pagamento='inadimplente' AND sb.conta_como_pagante AND COALESCE(sb.status_pagamento,'')<>'sem_parcela'),0) AS mrr_inadimplente
  FROM sb GROUP BY sb.unidade_id
),
tk AS (
  SELECT sb.unidade_id, sb.nome AS chave_aluno, SUM(sb.valor_parcela) AS valor_total
  FROM sb WHERE sb.entra_ticket_medio GROUP BY sb.unidade_id, sb.nome
),
tpu AS (SELECT unidade_id, ROUND(AVG(valor_total),2) AS ticket_medio FROM tk GROUP BY unidade_id),
pc AS (
  SELECT unidade_id, ROUND(AVG(meses),1) AS tempo_permanencia_medio FROM (
    SELECT ah.unidade_id, ah.tempo_permanencia_meses AS meses FROM alunos_historico ah WHERE ah.tempo_permanencia_meses>=4
    UNION ALL
    SELECT a.unidade_id, a.tempo_permanencia_meses FROM alunos a
    LEFT JOIN tipos_matricula tm ON tm.id=a.tipo_matricula_id
    WHERE a.status IN ('inativo','evadido') AND a.tempo_permanencia_meses>=4
      AND (tm.codigo IS NULL OR tm.codigo NOT IN ('BOLSISTA_INT','BOLSISTA_PARC','BANDA'))
      AND COALESCE(a.is_segundo_curso,false)=false
  ) x GROUP BY unidade_id
),
ed AS (
  SELECT DISTINCT ON (LOWER(TRIM(BOTH FROM m.aluno_nome)), m.unidade_id, EXTRACT(year FROM m.data), EXTRACT(month FROM m.data))
    m.unidade_id, m.data AS data_evasao
  FROM movimentacoes_admin m WHERE m.tipo IN ('evasao','nao_renovacao')
  ORDER BY LOWER(TRIM(BOTH FROM m.aluno_nome)), m.unidade_id, EXTRACT(year FROM m.data), EXTRACT(month FROM m.data), m.aluno_id DESC NULLS LAST, m.data DESC
),
em AS (SELECT unidade_id, EXTRACT(year FROM data_evasao)::int AS ano, EXTRACT(month FROM data_evasao)::int AS mes, COUNT(*) AS total_evasoes FROM ed GROUP BY unidade_id, EXTRACT(year FROM data_evasao), EXTRACT(month FROM data_evasao)),
lm AS (
  SELECT l.unidade_id, EXTRACT(year FROM l.data_contato)::int AS ano, EXTRACT(month FROM l.data_contato)::int AS mes,
    SUM(CASE WHEN l.status IN ('novo','agendado') THEN COALESCE(l.quantidade,1) ELSE 0 END) AS total_leads
  FROM leads l GROUP BY l.unidade_id, EXTRACT(year FROM l.data_contato), EXTRACT(month FROM l.data_contato)
),
rm AS (
  SELECT m.unidade_id, EXTRACT(year FROM m.data)::int AS ano, EXTRACT(month FROM m.data)::int AS mes,
    COUNT(*) FILTER (WHERE m.tipo='renovacao') AS renovacoes,
    COUNT(*) FILTER (WHERE m.tipo IN ('renovacao','nao_renovacao')) AS total_contratos,
    ROUND(AVG((m.valor_parcela_novo-m.valor_parcela_anterior)/NULLIF(m.valor_parcela_anterior,0)*100)
      FILTER (WHERE m.tipo='renovacao' AND m.valor_parcela_anterior>0 AND m.valor_parcela_novo>m.valor_parcela_anterior),2) AS reajuste_medio
  FROM movimentacoes_admin m WHERE m.tipo IN ('renovacao','nao_renovacao')
  GROUP BY m.unidade_id, EXTRACT(year FROM m.data), EXTRACT(month FROM m.data)
)
SELECT u.id AS unidade_id, u.nome AS unidade_nome,
  COALESCE(am.ano, EXTRACT(year FROM CURRENT_DATE)::int) AS ano,
  COALESCE(am.mes, EXTRACT(month FROM CURRENT_DATE)::int) AS mes,
  COALESCE(at.total_alunos,0)::int AS total_alunos_ativos,
  COALESCE(at.alunos_pagantes,0)::int AS total_alunos_pagantes,
  COALESCE(at.bolsistas_integrais,0)::int AS total_bolsistas_integrais,
  COALESCE(at.bolsistas_parciais,0)::int AS total_bolsistas_parciais,
  COALESCE(at.matriculas_ativas,0)::int AS matriculas_ativas,
  COALESCE(at.total_banda,0)::int AS total_banda,
  COALESCE(at.segundo_curso,0)::int AS total_segundo_curso,
  COALESCE(tpu.ticket_medio,0)::numeric(10,2) AS ticket_medio,
  COALESCE(at.mrr,0)::numeric(12,2) AS mrr,
  (COALESCE(at.mrr,0)*12)::numeric(14,2) AS arr,
  COALESCE(pc.tempo_permanencia_medio,0)::numeric(5,1) AS tempo_permanencia_medio,
  (COALESCE(tpu.ticket_medio,0)*COALESCE(pc.tempo_permanencia_medio,0))::numeric(12,2) AS ltv_medio,
  CASE WHEN COALESCE(at.alunos_pagantes,0)>0 THEN ROUND(COALESCE(at.qtd_inadimplentes,0)::numeric/at.alunos_pagantes*100,2) ELSE 0 END::numeric(5,2) AS inadimplencia_pct,
  COALESCE(at.mrr,0)::numeric(12,2) AS faturamento_previsto,
  (COALESCE(at.mrr,0)-COALESCE(at.mrr_inadimplente,0))::numeric(12,2) AS faturamento_realizado,
  COALESCE(mm.novas_matriculas,0)::int AS novas_matriculas,
  COALESCE(em.total_evasoes,0)::int AS total_evasoes,
  CASE WHEN COALESCE(at.alunos_pagantes,0)>0 THEN ROUND(COALESCE(em.total_evasoes,0)::numeric/at.alunos_pagantes*100,2) ELSE 0 END::numeric(5,2) AS churn_rate,
  COALESCE(rm.renovacoes,0)::int AS renovacoes,
  CASE WHEN COALESCE(rm.total_contratos,0)>0 THEN ROUND(rm.renovacoes::numeric/rm.total_contratos*100,2) ELSE 0 END::numeric(5,2) AS taxa_renovacao,
  COALESCE(rm.reajuste_medio,0)::numeric(5,2) AS reajuste_medio
FROM unidades u
LEFT JOIN at ON at.unidade_id=u.id
LEFT JOIN tpu ON tpu.unidade_id=u.id
LEFT JOIN pc ON pc.unidade_id=u.id
LEFT JOIN mm ON mm.unidade_id=u.id AND mm.ano=COALESCE(am.ano,EXTRACT(year FROM CURRENT_DATE)::int) AND mm.mes=COALESCE(am.mes,EXTRACT(month FROM CURRENT_DATE)::int)
LEFT JOIN em ON em.unidade_id=u.id AND em.ano=COALESCE(am.ano,EXTRACT(year FROM CURRENT_DATE)::int) AND em.mes=COALESCE(am.mes,EXTRACT(month FROM CURRENT_DATE)::int)
LEFT JOIN rm ON rm.unidade_id=u.id AND rm.ano=COALESCE(am.ano,EXTRACT(year FROM CURRENT_DATE)::int) AND rm.mes=COALESCE(am.mes,EXTRACT(month FROM CURRENT_DATE)::int)
WHERE u.ativo=true;


-- =============================================================================
-- FUNÇÃO completa com financeiros (substitui V4_ALUNOS quando aprovada)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.recalcular_dados_mensais(p_ano int, p_mes int, p_unidade_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $func$
DECLARE
  r JSONB; f DATE; i DATE;
  va INT; vp INT; vma INT; vb INT; v2 INT; vn INT; ve INT;
  vc NUMERIC; vt NUMERIC; vm NUMERIC; vi NUMERIC; vqi INT;
  vip NUMERIC; vtp NUMERIC; vtr NUMERIC; vre NUMERIC;
BEGIN
  i:=DATE_TRUNC('month',MAKE_DATE(p_ano,p_mes,1))::DATE; f:=(i+INTERVAL'1 month - 1 day')::DATE;

  SELECT COUNT(DISTINCT nome) INTO va FROM alunos WHERE unidade_id=p_unidade_id AND status IN ('ativo','trancado') AND data_matricula<=f AND (data_saida IS NULL OR data_saida>f);
  SELECT COUNT(DISTINCT a.nome) INTO vp FROM alunos a LEFT JOIN tipos_matricula tm ON tm.id=a.tipo_matricula_id WHERE a.unidade_id=p_unidade_id AND a.status IN ('ativo','trancado') AND a.data_matricula<=f AND (a.data_saida IS NULL OR a.data_saida>f) AND tm.conta_como_pagante=true;
  SELECT COUNT(*) INTO vma FROM alunos WHERE unidade_id=p_unidade_id AND status IN ('ativo','trancado') AND data_matricula<=f AND (data_saida IS NULL OR data_saida>f);
  SELECT COUNT(*) INTO vb FROM alunos a LEFT JOIN cursos c ON c.id=a.curso_id WHERE a.unidade_id=p_unidade_id AND a.status IN ('ativo','trancado') AND a.data_matricula<=f AND (a.data_saida IS NULL OR a.data_saida>f) AND c.is_projeto_banda=true;
  SELECT COUNT(*) INTO v2 FROM alunos a LEFT JOIN cursos c ON c.id=a.curso_id WHERE a.unidade_id=p_unidade_id AND a.status IN ('ativo','trancado') AND a.data_matricula<=f AND (a.data_saida IS NULL OR a.data_saida>f) AND COALESCE(a.is_segundo_curso,false)=true AND COALESCE(c.is_projeto_banda,false)=false;
  SELECT COUNT(*) INTO vn FROM alunos a LEFT JOIN tipos_matricula tm ON tm.id=a.tipo_matricula_id LEFT JOIN cursos c ON c.id=a.curso_id WHERE a.unidade_id=p_unidade_id AND a.status IN ('ativo','trancado') AND a.data_matricula>=i AND a.data_matricula<=f AND (a.data_saida IS NULL OR a.data_saida>f) AND COALESCE(a.is_segundo_curso,false)=false AND (tm.codigo IS NULL OR tm.codigo NOT IN ('BOLSISTA_INT','BOLSISTA_PARC')) AND COALESCE(c.is_projeto_banda,false)=false AND (c.nome IS NULL OR c.nome NOT ILIKE '%canto coral%');
  SELECT COUNT(*) INTO ve FROM (SELECT DISTINCT ON (LOWER(TRIM(BOTH FROM m.aluno_nome))) m.id FROM movimentacoes_admin m WHERE m.unidade_id=p_unidade_id AND m.tipo IN ('evasao','nao_renovacao') AND m.data>=i AND m.data<=f ORDER BY LOWER(TRIM(BOTH FROM m.aluno_nome)), m.data DESC) x;
  vc:=CASE WHEN COALESCE(vp,0)>0 THEN ROUND((ve::NUMERIC/vp)*100,2) ELSE 0 END;

  -- ticket_medio (PENDENTE VALIDAÇÃO)
  SELECT COALESCE(ROUND(AVG(valor_total),2),0) INTO vt FROM (SELECT a.nome, SUM(a.valor_parcela) AS valor_total FROM alunos a LEFT JOIN tipos_matricula tm ON tm.id=a.tipo_matricula_id WHERE a.unidade_id=p_unidade_id AND a.status IN ('ativo','trancado') AND a.data_matricula<=f AND (a.data_saida IS NULL OR a.data_saida>f) AND (tm.entra_ticket_medio=true OR tm.id IS NULL) GROUP BY a.nome) t;

  -- mrr e inadimplencia
  SELECT COALESCE(SUM(a.valor_parcela) FILTER (WHERE tm.conta_como_pagante=true AND COALESCE(a.status_pagamento,'')<>'sem_parcela'),0),
         COALESCE(SUM(a.valor_parcela) FILTER (WHERE a.status_pagamento='inadimplente' AND tm.conta_como_pagante=true AND COALESCE(a.status_pagamento,'')<>'sem_parcela'),0),
         COUNT(DISTINCT a.nome) FILTER (WHERE a.status_pagamento='inadimplente' AND tm.conta_como_pagante=true)
  INTO vm, vi, vqi FROM alunos a LEFT JOIN tipos_matricula tm ON tm.id=a.tipo_matricula_id WHERE a.unidade_id=p_unidade_id AND a.status IN ('ativo','trancado') AND a.data_matricula<=f AND (a.data_saida IS NULL OR a.data_saida>f);
  vip:=CASE WHEN COALESCE(vp,0)>0 THEN ROUND(vqi::NUMERIC/vp*100,2) ELSE 0 END;

  -- tempo_permanencia
  SELECT COALESCE(ROUND(AVG(tempo_permanencia_meses),1),0) INTO vtp FROM alunos WHERE unidade_id=p_unidade_id AND status IN ('ativo','trancado') AND data_matricula<=f AND (data_saida IS NULL OR data_saida>f);

  -- taxa_renovacao
  WITH rs AS (SELECT COUNT(*) FILTER (WHERE tipo='renovacao') AS rc, COUNT(*) FILTER (WHERE tipo='nao_renovacao') AS nc FROM movimentacoes_admin WHERE unidade_id=p_unidade_id AND data>=i AND data<=f AND tipo IN ('renovacao','nao_renovacao'))
  SELECT CASE WHEN (rc+nc)>0 THEN ROUND((rc::NUMERIC/(rc+nc))*100,2) ELSE 0 END INTO vtr FROM rs;

  -- reajuste_medio
  SELECT COALESCE(ROUND(AVG(CASE WHEN valor_parcela_anterior>0 AND valor_parcela_novo>valor_parcela_anterior THEN ((valor_parcela_novo-valor_parcela_anterior)/valor_parcela_anterior)*100 ELSE NULL END),2),0) INTO vre FROM movimentacoes_admin WHERE unidade_id=p_unidade_id AND tipo='renovacao' AND data>=i AND data<=f AND valor_parcela_anterior>0 AND valor_parcela_novo>valor_parcela_anterior;

  -- PERSISTIR (conferir schema antes; adicionar colunas se necessário)
  INSERT INTO dados_mensais (unidade_id,ano,mes,alunos_ativos,alunos_pagantes,matriculas_ativas,matriculas_banda,matriculas_2_curso,novas_matriculas,evasoes,churn_rate,ticket_medio,tempo_permanencia,taxa_renovacao,reajuste_parcelas,updated_at)
  VALUES (p_unidade_id,p_ano,p_mes,va,vp,vma,vb,v2,vn,ve,vc,vt,vtp,vtr,vre,NOW())
  ON CONFLICT (unidade_id,ano,mes) DO UPDATE SET
    alunos_ativos=EXCLUDED.alunos_ativos, alunos_pagantes=EXCLUDED.alunos_pagantes, matriculas_ativas=EXCLUDED.matriculas_ativas,
    matriculas_banda=EXCLUDED.matriculas_banda, matriculas_2_curso=EXCLUDED.matriculas_2_curso,
    novas_matriculas=EXCLUDED.novas_matriculas, evasoes=EXCLUDED.evasoes, churn_rate=EXCLUDED.churn_rate,
    ticket_medio=EXCLUDED.ticket_medio, tempo_permanencia=EXCLUDED.tempo_permanencia,
    taxa_renovacao=EXCLUDED.taxa_renovacao, reajuste_parcelas=EXCLUDED.reajuste_parcelas, updated_at=NOW();

  r:=jsonb_build_object(
    'alunos_ativos',va,'alunos_pagantes',vp,'matriculas_ativas',vma,'matriculas_banda',vb,'matriculas_2_curso',v2,
    'novas_matriculas',vn,'evasoes',ve,'churn_rate',vc,
    'ticket_medio',vt,'ticket_medio_status','PROVISORIO_PENDENTE_VALIDACAO',
    'mrr',vm,'mrr_inadimplente',vi,'inadimplencia_pct',vip,
    'tempo_permanencia',vtp,'taxa_renovacao',vtr,'reajuste_medio',vre,
    'faturamento_estimado',va*vt,'saldo_liquido',vn-ve
  );
  RETURN r;
END;
$func$;
