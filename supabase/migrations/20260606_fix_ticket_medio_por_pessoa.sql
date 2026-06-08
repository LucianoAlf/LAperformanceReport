-- ============================================
-- Migration: Corrigir ticket médio por pessoa (não por linha)
-- Data: 2026-06-07
-- Base: 20260531_fix_renovacoes_reajuste_views.sql
-- Aprovado por: Alfredo (4 travas)
-- ============================================
-- Regra do ticket médio (Alf):
--   Ticket médio = soma das parcelas pagantes por PESSOA / quantidade de PESSOAS pagantes
--   Agrupar por: LOWER(TRIM(nome)) + unidade_id
--   Segundo curso entra no numerador (soma) mas não duplica o denominador
--   Excluir: bolsista integral/parcial, banda, coral, parcela zero

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
-- >>> CORREÇÃO: Ticket médio por PESSOA (não por linha)
-- Alteração vs versão 20260531:
--   - Remove data_nascimento da chave (Alf: não usar data_nascimento)
--   - Adiciona filtros de exclusão: bolsistas, banda, coral, parcela zero
--   - Renomeia total_alunos_ticket → total_pessoas_ticket (semântica)
alunos_ticket AS (
  SELECT a.unidade_id,
         (lower(TRIM(BOTH FROM a.nome)) || '-'::text) || a.unidade_id::text AS chave_pessoa,
         sum(a.valor_parcela) FILTER (
           WHERE tm.entra_ticket_medio = true
             AND a.valor_parcela > 0::numeric
             AND (tm.codigo IS NULL OR (tm.codigo::text <> ALL (ARRAY['BOLSISTA_INT'::character varying::text, 'BOLSISTA_PARC'::character varying::text])))
             AND COALESCE(c.is_projeto_banda, false) = false
             AND (c.nome IS NULL OR c.nome::text !~~* '%canto coral%'::text)
         ) AS valor_total
    FROM alunos a
    LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
    LEFT JOIN cursos c ON c.id = a.curso_id
   WHERE a.status::text = ANY (ARRAY['ativo'::character varying::text, 'trancado'::character varying::text])
     AND tm.entra_ticket_medio = true
     AND a.valor_parcela > 0::numeric
   GROUP BY a.unidade_id, ((lower(TRIM(BOTH FROM a.nome)) || '-'::text) || a.unidade_id::text)
  HAVING sum(a.valor_parcela) FILTER (
    WHERE tm.entra_ticket_medio = true
      AND a.valor_parcela > 0::numeric
      AND (tm.codigo IS NULL OR (tm.codigo::text <> ALL (ARRAY['BOLSISTA_INT'::character varying::text, 'BOLSISTA_PARC'::character varying::text])))
      AND COALESCE(c.is_projeto_banda, false) = false
      AND (c.nome IS NULL OR c.nome::text !~~* '%canto coral%'::text)
  ) > 0::numeric
),
ticket_por_unidade AS (
  SELECT unidade_id,
         count(*) AS total_pessoas_ticket,
         sum(valor_total) AS soma_parcelas,
         avg(valor_total) AS ticket_medio_calculado
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
     AND (tm.codigo IS NULL OR (tm.codigo::text <> ALL (ARRAY['BOLSISTA_INT'::character varying::text, 'BOLSISTA_PARC'::character varying::text, 'BANDA'::character varying::text)))
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

GRANT SELECT ON vw_kpis_gestao_mensal TO authenticated;
