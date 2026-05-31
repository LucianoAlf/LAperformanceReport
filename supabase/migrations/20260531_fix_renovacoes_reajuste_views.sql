-- ============================================
-- Migration: Correção Renovações/Reajuste/Retenção
-- Aprovado por: Alfredo + Cascade
-- Não altera dados. Apenas redefine views.
-- ============================================

-- --------------------------------------------
-- 1. vw_kpis_gestao_mensal
-- --------------------------------------------
-- Problema: CTE renovacoes_mes usava tabela `renovacoes` (fonte desatualizada)
-- Correção: usar `movimentacoes_admin` com filtros corretos de tipo
-- Regra: total_contratos = renovacao + nao_renovacao (exclui evasao, aviso, trancamento)
-- Regra: reajuste_medio = média apenas de aumentos positivos com anterior > 0
-- --------------------------------------------

CREATE OR REPLACE VIEW public.vw_kpis_gestao_mensal AS
WITH matriculas_mes AS (
  SELECT a.unidade_id,
         EXTRACT(year FROM a.data_matricula)::integer AS ano,
         EXTRACT(month FROM a.data_matricula)::integer AS mes,
         count(*) AS novas_matriculas
    FROM alunos a
    LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
    LEFT JOIN cursos c ON c.id = a.curso_id
   WHERE a.data_matricula IS NOT NULL
     AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)
     AND (c.is_projeto_banda IS NULL OR c.is_projeto_banda = false)
     AND (c.nome IS NULL OR c.nome::text !~~* '%canto coral%'::text)
     AND (tm.codigo IS NULL OR (tm.codigo::text <> ALL (ARRAY['BOLSISTA_INT'::character varying::text, 'BOLSISTA_PARC'::character varying::text])))
   GROUP BY a.unidade_id, EXTRACT(year FROM a.data_matricula), EXTRACT(month FROM a.data_matricula)
),
alunos_ticket AS (
  SELECT a.unidade_id,
         (((lower(TRIM(BOTH FROM a.nome)) || '-'::text) || COALESCE(a.data_nascimento::text, ''::text)) || '-'::text) || a.unidade_id AS chave_aluno,
         sum(a.valor_parcela) AS valor_total
    FROM alunos a
    LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
   WHERE a.status::text = ANY (ARRAY['ativo'::character varying::text, 'trancado'::character varying::text])
     AND tm.entra_ticket_medio = true
     AND a.valor_parcela > 0::numeric
   GROUP BY a.unidade_id, ((((lower(TRIM(BOTH FROM a.nome)) || '-'::text) || COALESCE(a.data_nascimento::text, ''::text)) || '-'::text) || a.unidade_id)
),
ticket_por_unidade AS (
  SELECT unidade_id, count(*) AS total_alunos_ticket, sum(valor_total) AS soma_parcelas, avg(valor_total) AS ticket_medio_calculado
    FROM alunos_ticket
   GROUP BY unidade_id
),
alunos_mes AS (
  SELECT a.unidade_id,
         EXTRACT(year FROM CURRENT_DATE)::integer AS ano,
         EXTRACT(month FROM CURRENT_DATE)::integer AS mes,
         count(*) FILTER (WHERE a.is_segundo_curso IS NULL OR a.is_segundo_curso = false) AS total_alunos,
         count(*) FILTER (WHERE tm.conta_como_pagante = true AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS alunos_pagantes,
         count(*) FILTER (WHERE tm.codigo::text = 'BOLSISTA_INT'::text AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS bolsistas_integrais,
         count(*) FILTER (WHERE tm.codigo::text = 'BOLSISTA_PARC'::text AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS bolsistas_parciais,
         count(*) FILTER (WHERE c.nome::text ~~* '%banda%'::text OR c.nome::text ~~* '%power kids%'::text) AS total_banda,
         count(*) FILTER (WHERE a.is_segundo_curso = true) AS segundo_curso,
         sum(a.valor_parcela) FILTER (WHERE tm.conta_como_pagante = true AND COALESCE(a.status_pagamento, ''::character varying)::text <> 'sem_parcela'::text) AS mrr,
         count(*) FILTER (WHERE a.status_pagamento::text = 'inadimplente'::text AND tm.conta_como_pagante = true AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS qtd_inadimplentes,
         COALESCE(sum(a.valor_parcela) FILTER (WHERE a.status_pagamento::text = 'inadimplente'::text AND tm.conta_como_pagante = true AND COALESCE(a.status_pagamento, ''::character varying)::text <> 'sem_parcela'::text), 0::numeric) AS mrr_inadimplente
    FROM alunos a
    LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
    LEFT JOIN cursos c ON c.id = a.curso_id
   WHERE a.status::text = ANY (ARRAY['ativo'::character varying::text, 'trancado'::character varying::text])
   GROUP BY a.unidade_id
),
permanencia_combinada AS (
  SELECT unidade_id, tempo_permanencia_meses AS meses FROM alunos_historico WHERE tempo_permanencia_meses >= 4::numeric
  UNION ALL
  SELECT a.unidade_id, a.tempo_permanencia_meses
    FROM alunos a
    LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
   WHERE a.status::text = ANY (ARRAY['inativo'::character varying::text, 'evadido'::character varying::text])
     AND a.tempo_permanencia_meses >= 4
     AND (tm.codigo IS NULL OR (tm.codigo::text <> ALL (ARRAY['BOLSISTA_INT'::character varying::text, 'BOLSISTA_PARC'::character varying::text, 'BANDA'::character varying::text])))
     AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)
),
permanencia_calc AS (
  SELECT unidade_id, round(avg(meses), 1) AS tempo_permanencia_medio, count(*) AS total_evasoes_calc
    FROM permanencia_combinada
   GROUP BY unidade_id
),
evasoes_dedup AS (
  SELECT DISTINCT ON (lower(TRIM(BOTH FROM m.aluno_nome)), m.unidade_id, EXTRACT(year FROM m.data), EXTRACT(month FROM m.data))
         m.id, m.aluno_id, m.unidade_id, m.data AS data_evasao, m.tipo,
         COALESCE(m.valor_parcela_evasao, m.valor_parcela_anterior) AS valor_parcela
    FROM movimentacoes_admin m
   WHERE m.tipo::text = ANY (ARRAY['evasao'::character varying::text, 'nao_renovacao'::character varying::text])
   ORDER BY lower(TRIM(BOTH FROM m.aluno_nome)), m.unidade_id, EXTRACT(year FROM m.data), EXTRACT(month FROM m.data), m.aluno_id DESC NULLS LAST, m.data DESC
),
evasoes_mes AS (
  SELECT unidade_id,
         EXTRACT(year FROM data_evasao)::integer AS ano,
         EXTRACT(month FROM data_evasao)::integer AS mes,
         count(*) AS total_evasoes
    FROM evasoes_dedup
   GROUP BY unidade_id, EXTRACT(year FROM data_evasao), EXTRACT(month FROM data_evasao)
),
leads_mes AS (
  SELECT l.unidade_id,
         EXTRACT(year FROM l.data_contato)::integer AS ano,
         EXTRACT(month FROM l.data_contato)::integer AS mes,
         sum(CASE WHEN l.status::text = ANY (ARRAY['novo'::character varying::text, 'agendado'::character varying::text]) THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS total_leads,
         sum(CASE WHEN l.status::text = 'experimental_agendada'::text THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS experimentais_agendadas,
         sum(CASE WHEN l.status::text = ANY (ARRAY['experimental_realizada'::character varying::text, 'compareceu'::character varying::text]) THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS experimentais_realizadas,
         sum(CASE WHEN l.status::text = 'experimental_faltou'::text THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS faltaram,
         sum(CASE WHEN l.arquivado = true THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS leads_arquivados
    FROM leads l
   GROUP BY l.unidade_id, EXTRACT(year FROM l.data_contato), EXTRACT(month FROM l.data_contato)
),
-- >>> CORREÇÃO: trocar fonte de renovacoes para movimentacoes_admin <<<
renovacoes_mes AS (
  SELECT m.unidade_id,
         EXTRACT(year FROM m.data)::integer AS ano,
         EXTRACT(month FROM m.data)::integer AS mes,
         count(*) FILTER (WHERE m.tipo = 'renovacao') AS renovacoes,
         count(*) FILTER (WHERE m.tipo IN ('renovacao', 'nao_renovacao')) AS total_contratos,
         count(*) FILTER (WHERE m.tipo = 'nao_renovacao') AS nao_renovacoes,
         round(avg(
           ((m.valor_parcela_novo - m.valor_parcela_anterior) / NULLIF(m.valor_parcela_anterior, 0)) * 100
         ) FILTER (
           WHERE m.tipo = 'renovacao'
             AND m.valor_parcela_anterior IS NOT NULL
             AND m.valor_parcela_novo IS NOT NULL
             AND m.valor_parcela_anterior > 0
             AND m.valor_parcela_novo > m.valor_parcela_anterior
         ), 2) AS reajuste_medio
    FROM movimentacoes_admin m
   WHERE m.tipo IN ('renovacao', 'nao_renovacao')
   GROUP BY m.unidade_id, EXTRACT(year FROM m.data), EXTRACT(month FROM m.data)
)
SELECT u.id AS unidade_id,
       u.nome AS unidade_nome,
       COALESCE(lm.ano, am.ano, EXTRACT(year FROM CURRENT_DATE)::integer) AS ano,
       COALESCE(lm.mes, am.mes, EXTRACT(month FROM CURRENT_DATE)::integer) AS mes,
       COALESCE(am.total_alunos, 0::bigint)::integer AS total_alunos_ativos,
       COALESCE(am.alunos_pagantes, 0::bigint)::integer AS total_alunos_pagantes,
       COALESCE(am.bolsistas_integrais, 0::bigint)::integer AS total_bolsistas_integrais,
       COALESCE(am.bolsistas_parciais, 0::bigint)::integer AS total_bolsistas_parciais,
       COALESCE(am.total_banda, 0::bigint)::integer AS total_banda,
       COALESCE(am.segundo_curso, 0::bigint)::integer AS total_segundo_curso,
       COALESCE(tpu.ticket_medio_calculado, 0::numeric)::numeric(10,2) AS ticket_medio,
       COALESCE(am.mrr, 0::numeric)::numeric(12,2) AS mrr,
       (COALESCE(am.mrr, 0::numeric) * 12::numeric)::numeric(14,2) AS arr,
       COALESCE(pc.tempo_permanencia_medio, 0::numeric)::numeric(5,1) AS tempo_permanencia_medio,
       (COALESCE(tpu.ticket_medio_calculado, 0::numeric) * COALESCE(pc.tempo_permanencia_medio, 0::numeric))::numeric(12,2) AS ltv_medio,
       CASE WHEN COALESCE(am.alunos_pagantes, 0::bigint) > 0 THEN round(COALESCE(am.qtd_inadimplentes, 0::bigint)::numeric / am.alunos_pagantes::numeric * 100::numeric, 2) ELSE 0::numeric END::numeric(5,2) AS inadimplencia_pct,
       COALESCE(am.mrr, 0::numeric)::numeric(12,2) AS faturamento_previsto,
       (COALESCE(am.mrr, 0::numeric) - COALESCE(am.mrr_inadimplente, 0::numeric))::numeric(12,2) AS faturamento_realizado,
       COALESCE(lm.total_leads, 0::bigint)::integer AS total_leads,
       COALESCE(lm.experimentais_agendadas, 0::bigint)::integer AS experimentais_agendadas,
       COALESCE(lm.experimentais_realizadas, 0::bigint)::integer AS experimentais_realizadas,
       COALESCE(mm.novas_matriculas, 0::bigint)::integer AS novas_matriculas,
       COALESCE(em.total_evasoes, 0::bigint)::integer AS total_evasoes,
       CASE WHEN COALESCE(am.alunos_pagantes, 0::bigint) > 0 THEN round(COALESCE(em.total_evasoes, 0::bigint)::numeric / am.alunos_pagantes::numeric * 100::numeric, 2) ELSE 0::numeric END::numeric(5,2) AS churn_rate,
       COALESCE(rm.renovacoes, 0::bigint)::integer AS renovacoes,
       CASE WHEN COALESCE(rm.total_contratos, 0::bigint) > 0 THEN round(rm.renovacoes::numeric / rm.total_contratos::numeric * 100::numeric, 2) ELSE 0::numeric END::numeric(5,2) AS taxa_renovacao,
       COALESCE(rm.reajuste_medio, 0::numeric)::numeric(5,2) AS reajuste_medio
  FROM unidades u
  LEFT JOIN leads_mes lm ON lm.unidade_id = u.id
  LEFT JOIN alunos_mes am ON am.unidade_id = u.id
  LEFT JOIN ticket_por_unidade tpu ON tpu.unidade_id = u.id
  LEFT JOIN permanencia_calc pc ON pc.unidade_id = u.id
  LEFT JOIN matriculas_mes mm ON mm.unidade_id = u.id AND mm.ano = COALESCE(lm.ano, am.ano, EXTRACT(year FROM CURRENT_DATE)::integer) AND mm.mes = COALESCE(lm.mes, am.mes, EXTRACT(month FROM CURRENT_DATE)::integer)
  LEFT JOIN evasoes_mes em ON em.unidade_id = u.id AND em.ano = COALESCE(lm.ano, am.ano, EXTRACT(year FROM CURRENT_DATE)::integer) AND em.mes = COALESCE(lm.mes, am.mes, EXTRACT(month FROM CURRENT_DATE)::integer)
  LEFT JOIN renovacoes_mes rm ON rm.unidade_id = u.id AND rm.ano = COALESCE(lm.ano, am.ano, EXTRACT(year FROM CURRENT_DATE)::integer) AND rm.mes = COALESCE(lm.mes, am.mes, EXTRACT(month FROM CURRENT_DATE)::integer)
 WHERE u.ativo = true;


-- --------------------------------------------
-- 2. vw_kpis_retencao_mensal
-- --------------------------------------------
-- Problema 1: evasoes_dedup incluia 'aviso_previo' no total de evasoes
-- Problema 2: renovacoes_mes nao contava nao_renovacoes (hardcoded 0)
-- Problema 3: taxa_renovacao usava previstas=realizadas (count(*) iguais)
-- Correção: remover aviso_previo de evasoes, corrigir contadores de renovacao
-- --------------------------------------------

CREATE OR REPLACE VIEW public.vw_kpis_retencao_mensal AS
WITH evasoes_dedup AS (
  SELECT DISTINCT ON (lower(TRIM(BOTH FROM m.aluno_nome)), m.unidade_id, EXTRACT(year FROM m.data), EXTRACT(month FROM m.data))
         m.id, m.aluno_id, m.aluno_nome, m.unidade_id, m.data AS data_evasao, m.tipo, m.tipo_evasao,
         COALESCE(m.valor_parcela_evasao, m.valor_parcela_anterior) AS valor_parcela
    FROM movimentacoes_admin m
   WHERE m.tipo::text = ANY (ARRAY['evasao'::text, 'nao_renovacao'::text])
   ORDER BY lower(TRIM(BOTH FROM m.aluno_nome)), m.unidade_id, EXTRACT(year FROM m.data), EXTRACT(month FROM m.data), m.aluno_id DESC NULLS LAST, m.data DESC
),
evasoes_mes AS (
  SELECT e.unidade_id,
         EXTRACT(year FROM e.data_evasao)::integer AS ano,
         EXTRACT(month FROM e.data_evasao)::integer AS mes,
         count(*) AS total_evasoes,
         count(*) FILTER (WHERE e.tipo::text = 'evasao'::text) AS evasoes_interrompidas,
         count(*) FILTER (WHERE e.tipo_evasao::text = 'transferencia'::text) AS transferencias,
         count(*) FILTER (WHERE e.tipo::text = 'nao_renovacao'::text) AS nao_renovacoes_evasao,
         sum(e.valor_parcela) AS mrr_perdido
    FROM evasoes_dedup e
   GROUP BY e.unidade_id, EXTRACT(year FROM e.data_evasao), EXTRACT(month FROM e.data_evasao)
),
-- >>> CORREÇÃO: avisos prévios em CTE separada (não são evasões) <<<
avisos_previos_mes AS (
  SELECT m.unidade_id,
         EXTRACT(year FROM m.data)::integer AS ano,
         EXTRACT(month FROM m.data)::integer AS mes,
         count(*) AS avisos_previos
    FROM movimentacoes_admin m
   WHERE m.tipo::text = 'aviso_previo'::text
   GROUP BY m.unidade_id, EXTRACT(year FROM m.data), EXTRACT(month FROM m.data)
),
-- >>> CORREÇÃO: contar nao_renovacoes e separar previstas de realizadas <<<
renovacoes_mes AS (
  SELECT m.unidade_id,
         EXTRACT(year FROM m.data)::integer AS ano,
         EXTRACT(month FROM m.data)::integer AS mes,
         count(*) FILTER (WHERE m.tipo = 'renovacao') AS renovacoes_realizadas,
         count(*) FILTER (WHERE m.tipo = 'nao_renovacao') AS nao_renovacoes_renovacao,
         count(*) FILTER (WHERE m.tipo IN ('renovacao', 'nao_renovacao')) AS renovacoes_previstas,
         0::bigint AS renovacoes_pendentes,
         0::bigint AS renovacoes_atrasadas
    FROM movimentacoes_admin m
   WHERE m.tipo::text = 'renovacao'::text OR m.tipo::text = 'nao_renovacao'::text
   GROUP BY m.unidade_id, EXTRACT(year FROM m.data), EXTRACT(month FROM m.data)
),
periodos AS (
  SELECT DISTINCT unidade_id, ano, mes FROM evasoes_mes
  UNION
  SELECT DISTINCT unidade_id, ano, mes FROM avisos_previos_mes
  UNION
  SELECT DISTINCT unidade_id, ano, mes FROM renovacoes_mes
),
total_alunos AS (
  SELECT a.unidade_id,
         count(*) FILTER (WHERE tm.conta_como_pagante = true AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS total_pagantes
    FROM alunos a
    LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
   WHERE a.status::text = ANY (ARRAY['ativo'::text, 'trancado'::text])
   GROUP BY a.unidade_id
)
SELECT u.id AS unidade_id,
       u.nome AS unidade_nome,
       p.ano,
       p.mes,
       COALESCE(em.total_evasoes, 0::bigint)::integer AS total_evasoes,
       COALESCE(em.evasoes_interrompidas, 0::bigint)::integer AS evasoes_interrompidas,
       COALESCE(apm.avisos_previos, 0::bigint)::integer AS avisos_previos,
       COALESCE(em.transferencias, 0::bigint)::integer AS transferencias,
       CASE WHEN COALESCE(ta.total_pagantes, 0::bigint) > 0 THEN ((COALESCE(em.total_evasoes, 0::bigint) - COALESCE(em.transferencias, 0::bigint))::numeric / ta.total_pagantes::numeric * 100::numeric)::numeric(5,2) ELSE 0::numeric END AS taxa_evasao,
       COALESCE(em.mrr_perdido, 0::numeric)::numeric(12,2) AS mrr_perdido,
       COALESCE(rm.renovacoes_previstas, 0::bigint)::integer AS renovacoes_previstas,
       COALESCE(rm.renovacoes_realizadas, 0::bigint)::integer AS renovacoes_realizadas,
       GREATEST(COALESCE(em.nao_renovacoes_evasao, 0::bigint), COALESCE(rm.nao_renovacoes_renovacao, 0::bigint))::integer AS nao_renovacoes,
       COALESCE(rm.renovacoes_pendentes, 0::bigint)::integer AS renovacoes_pendentes,
       COALESCE(rm.renovacoes_atrasadas, 0::bigint)::integer AS renovacoes_atrasadas,
       CASE WHEN COALESCE(rm.renovacoes_previstas, 0::bigint) > 0 THEN (rm.renovacoes_realizadas::numeric / rm.renovacoes_previstas::numeric * 100::numeric)::numeric(5,2) ELSE 0::numeric END AS taxa_renovacao,
       CASE WHEN COALESCE(rm.renovacoes_previstas, 0::bigint) > 0 THEN (COALESCE(rm.nao_renovacoes_renovacao, 0::bigint)::numeric / rm.renovacoes_previstas::numeric * 100::numeric)::numeric(5,2) ELSE 0::numeric END AS taxa_nao_renovacao
  FROM unidades u
  JOIN periodos p ON p.unidade_id = u.id
  LEFT JOIN evasoes_mes em ON em.unidade_id = u.id AND em.ano = p.ano AND em.mes = p.mes
  LEFT JOIN avisos_previos_mes apm ON apm.unidade_id = u.id AND apm.ano = p.ano AND apm.mes = p.mes
  LEFT JOIN renovacoes_mes rm ON rm.unidade_id = u.id AND rm.ano = p.ano AND rm.mes = p.mes
  LEFT JOIN total_alunos ta ON ta.unidade_id = u.id
 WHERE u.ativo = true;
