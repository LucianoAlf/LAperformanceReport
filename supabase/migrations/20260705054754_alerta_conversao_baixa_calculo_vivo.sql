-- Migra o alerta CONVERSAO_BAIXA de dados_comerciais (tabela inflada por trigger bugado, 3-17x)
-- para calculo vivo direto de leads, espelhando a formula do Dashboard:
-- denominador = leads com experimental_realizada=true no mes; numerador = destes, status matriculado/convertido.
CREATE OR REPLACE VIEW vw_alertas_inteligentes AS
 WITH churn_realtime AS (
         SELECT u.id AS unidade_id,
            u.nome AS unidade_nome,
            COALESCE(em.evasoes, 0::bigint) AS evasoes,
            COALESCE(ap.alunos_pagantes, 0::bigint) AS alunos_pagantes,
                CASE
                    WHEN COALESCE(ap.alunos_pagantes, 0::bigint) > 0 THEN round(COALESCE(em.evasoes, 0::bigint)::numeric / ap.alunos_pagantes::numeric * 100::numeric, 2)
                    ELSE 0::numeric
                END AS churn_rate
           FROM unidades u
             LEFT JOIN ( SELECT m.unidade_id,
                    count(*) AS evasoes
                   FROM movimentacoes_admin m
                  WHERE is_movimentacao_admin_retencao_valida(m.id) AND EXTRACT(year FROM m.data) = EXTRACT(year FROM CURRENT_DATE) AND EXTRACT(month FROM m.data) = EXTRACT(month FROM CURRENT_DATE) AND (m.tipo::text = ANY (ARRAY['evasao'::character varying::text, 'nao_renovacao'::character varying::text]))
                  GROUP BY m.unidade_id) em ON em.unidade_id = u.id
             LEFT JOIN ( SELECT a.unidade_id,
                    count(*) AS alunos_pagantes
                   FROM alunos a
                  WHERE a.status::text = 'ativo'::text AND a.valor_parcela > 0::numeric AND (a.is_segundo_curso = false OR a.is_segundo_curso IS NULL)
                  GROUP BY a.unidade_id) ap ON ap.unidade_id = u.id
          WHERE u.ativo = true
        ), ticket_realtime AS (
         SELECT mrr.unidade_id,
                CASE
                    WHEN COALESCE(pag.pagantes_unicos, 0::bigint) > 0 THEN mrr.mrr_total / pag.pagantes_unicos::numeric
                    ELSE 0::numeric
                END AS ticket_atual
           FROM ( SELECT alunos.unidade_id,
                    sum(alunos.valor_parcela) AS mrr_total
                   FROM alunos
                  WHERE alunos.status::text = 'ativo'::text AND alunos.valor_parcela > 0::numeric
                  GROUP BY alunos.unidade_id) mrr
             LEFT JOIN ( SELECT alunos.unidade_id,
                    count(*) AS pagantes_unicos
                   FROM alunos
                  WHERE alunos.status::text = 'ativo'::text AND alunos.valor_parcela > 0::numeric AND (alunos.is_segundo_curso = false OR alunos.is_segundo_curso IS NULL)
                  GROUP BY alunos.unidade_id) pag ON pag.unidade_id = mrr.unidade_id
        ), conversao_realtime AS (
         SELECT l.unidade_id,
            count(*) FILTER (WHERE l.status::text = ANY (ARRAY['matriculado'::text, 'convertido'::text]))::numeric AS matriculas,
            count(*)::numeric AS experimentais
           FROM leads l
          WHERE l.experimental_realizada = true
            AND date_trunc('month', l.data_contato) = date_trunc('month', CURRENT_DATE)
          GROUP BY l.unidade_id
        )
 SELECT tipo_alerta,
    severidade,
    unidade_id,
    unidade_nome,
    quantidade,
    descricao,
    detalhe,
    valor_atual,
    valor_meta,
    data_referencia
   FROM ( SELECT 'CONTRATO_VENCENDO'::text AS tipo_alerta,
            'critico'::text AS severidade,
            a.unidade_id,
            u.nome AS unidade_nome,
            count(*)::integer AS quantidade,
            'Contratos vencendo em 30 dias sem renovação'::text AS descricao,
            concat(count(*), ' alunos com contrato vencendo até ', to_char(CURRENT_DATE + '30 days'::interval, 'DD/MM'::text)) AS detalhe,
            NULL::numeric AS valor_atual,
            NULL::numeric AS valor_meta,
            CURRENT_DATE AS data_referencia
           FROM alunos a
             JOIN unidades u ON a.unidade_id = u.id
             LEFT JOIN movimentacoes_admin r ON r.aluno_id = a.id AND r.tipo::text = 'renovacao'::text AND (r.renovacao_status = ANY (ARRAY['confirmada'::text, 'antecipada_confirmada'::text])) AND r.data >= (CURRENT_DATE - '90 days'::interval)
          WHERE a.status::text = 'ativo'::text AND a.data_fim_contrato >= CURRENT_DATE AND a.data_fim_contrato <= (CURRENT_DATE + '30 days'::interval) AND r.id IS NULL
          GROUP BY a.unidade_id, u.nome
         HAVING count(*) > 0
        UNION ALL
         SELECT 'RENOVACOES_PENDENTES'::text,
            'atencao'::text,
            a.unidade_id,
            u.nome,
            count(*)::integer,
            'Renovações pendentes para este mês'::text,
            concat(count(*), ' contratos vencem este mês'),
            NULL::numeric,
            NULL::numeric,
            CURRENT_DATE
           FROM alunos a
             JOIN unidades u ON a.unidade_id = u.id
          WHERE a.status::text = 'ativo'::text AND EXTRACT(month FROM a.data_fim_contrato) = EXTRACT(month FROM CURRENT_DATE) AND EXTRACT(year FROM a.data_fim_contrato) = EXTRACT(year FROM CURRENT_DATE)
          GROUP BY a.unidade_id, u.nome
         HAVING count(*) > 0
        UNION ALL
         SELECT 'CONVERSAO_BAIXA'::text,
                CASE
                    WHEN round(cr.matriculas / NULLIF(cr.experimentais, 0::numeric) * 100::numeric, 1) < 10::numeric THEN 'critico'::text
                    ELSE 'atencao'::text
                END,
            u.id,
            u.nome,
            1,
            'Taxa de conversão abaixo da meta'::text,
            concat('Conversão: ', round(cr.matriculas / NULLIF(cr.experimentais, 0::numeric) * 100::numeric, 1), '% (meta: 13.5%)'),
            round(cr.matriculas / NULLIF(cr.experimentais, 0::numeric) * 100::numeric, 1),
            13.5,
            date_trunc('month', CURRENT_DATE)::date
           FROM conversao_realtime cr
             JOIN unidades u ON u.id = cr.unidade_id
          WHERE cr.experimentais > 0::numeric AND (cr.matriculas / cr.experimentais * 100::numeric) < 13.5
        UNION ALL
         SELECT 'CHURN_ALTO'::text,
                CASE
                    WHEN cr.churn_rate > 6::numeric THEN 'critico'::text
                    ELSE 'atencao'::text
                END,
            cr.unidade_id,
            cr.unidade_nome,
            1,
            'Churn acima da meta mensal'::text,
            concat('Churn: ', cr.churn_rate, '% (meta: 4%) - ', cr.evasoes, ' evasões / ', cr.alunos_pagantes, ' pagantes'),
            cr.churn_rate,
            4.0,
            CURRENT_DATE
           FROM churn_realtime cr
          WHERE cr.churn_rate > 4::numeric
        UNION ALL
         SELECT 'TICKET_CAINDO'::text,
            'atencao'::text,
            tr.unidade_id,
            u.nome,
            1,
            'Ticket médio caindo vs mês anterior'::text,
            concat('Ticket caiu ', round((dm.ticket_medio - tr.ticket_atual) / NULLIF(dm.ticket_medio, 0::numeric) * 100::numeric, 1), '% (R$', round(dm.ticket_medio), ' → R$', round(tr.ticket_atual), ')'),
            tr.ticket_atual,
            dm.ticket_medio,
            CURRENT_DATE
           FROM ticket_realtime tr
             JOIN unidades u ON u.id = tr.unidade_id
             JOIN dados_mensais dm ON dm.unidade_id = tr.unidade_id AND (dm.ano::numeric = EXTRACT(year FROM CURRENT_DATE) AND dm.mes::numeric = (EXTRACT(month FROM CURRENT_DATE) - 1::numeric) OR dm.ano::numeric = (EXTRACT(year FROM CURRENT_DATE) - 1::numeric) AND dm.mes = 12 AND EXTRACT(month FROM CURRENT_DATE) = 1::numeric)
          WHERE tr.ticket_atual < dm.ticket_medio
        UNION ALL
         SELECT 'PROFESSOR_TURMA_BAIXA'::text,
            'informativo'::text,
            pu.unidade_id,
            u.nome,
            count(DISTINCT t.professor_id)::integer,
            'Professores com média alunos/turma baixa'::text,
            concat(count(DISTINCT t.professor_id), ' professores com média < 1.5 alunos/turma'),
            NULL::numeric,
            1.5,
            CURRENT_DATE
           FROM ( SELECT vw_turmas_implicitas.professor_id,
                    vw_turmas_implicitas.unidade_id,
                    avg(vw_turmas_implicitas.total_alunos) AS media
                   FROM vw_turmas_implicitas
                  GROUP BY vw_turmas_implicitas.professor_id, vw_turmas_implicitas.unidade_id
                 HAVING avg(vw_turmas_implicitas.total_alunos) < 1.5) t
             JOIN professores_unidades pu ON t.professor_id = pu.professor_id AND t.unidade_id = pu.unidade_id
             JOIN unidades u ON pu.unidade_id = u.id
          GROUP BY pu.unidade_id, u.nome
         HAVING count(DISTINCT t.professor_id) > 0
        UNION ALL
         SELECT 'META_EM_RISCO'::text,
            'critico'::text,
            mk.unidade_id,
            u.nome,
            1,
            concat('Meta de ', mk.tipo, ' em risco'),
            concat(mk.tipo, ': realizado abaixo de 70% da meta'),
            NULL::numeric,
            mk.valor,
            make_date(mk.ano, mk.mes, 1)
           FROM metas_kpi mk
             JOIN unidades u ON mk.unidade_id = u.id
          WHERE mk.ano::numeric = EXTRACT(year FROM CURRENT_DATE) AND mk.mes::numeric = EXTRACT(month FROM CURRENT_DATE) AND (mk.tipo::text = ANY (ARRAY['matriculas'::character varying::text, 'alunos_ativos'::character varying::text]))) alertas
  ORDER BY (
        CASE severidade
            WHEN 'critico'::text THEN 1
            WHEN 'atencao'::text THEN 2
            ELSE 3
        END), quantidade DESC;

COMMENT ON VIEW vw_alertas_inteligentes IS 'Alertas do Dashboard. Desde 2026-07-05, o alerta CONVERSAO_BAIXA e calculado ao vivo de leads (formula do Dashboard: exp realizadas -> convertidos), nao mais de dados_comerciais (tabela legado, inflada por trigger incremental bugado).';
