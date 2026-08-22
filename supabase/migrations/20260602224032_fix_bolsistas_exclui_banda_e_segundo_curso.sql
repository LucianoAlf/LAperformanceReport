-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


CREATE OR REPLACE VIEW vw_kpis_gestao_mensal AS
 WITH params AS (
         SELECT date_trunc('month'::text, CURRENT_DATE::timestamp with time zone)::date AS inicio_mes,
            (date_trunc('month'::text, CURRENT_DATE::timestamp with time zone) + '1 mon -1 days'::interval)::date AS fim_mes,
            EXTRACT(year FROM CURRENT_DATE)::integer AS ano,
            EXTRACT(month FROM CURRENT_DATE)::integer AS mes
        ), leads_mes AS (
         SELECT l.unidade_id,
            p_1.ano,
            p_1.mes,
            sum(
                CASE
                    WHEN l.status::text = ANY (ARRAY['novo'::character varying, 'agendado'::character varying]::text[]) THEN COALESCE(l.quantidade, 1)
                    ELSE 0
                END) AS total_leads,
            sum(
                CASE
                    WHEN l.status::text = 'experimental_agendada'::text THEN COALESCE(l.quantidade, 1)
                    ELSE 0
                END) AS experimentais_agendadas,
            sum(
                CASE
                    WHEN l.status::text = ANY (ARRAY['experimental_realizada'::character varying, 'compareceu'::character varying]::text[]) THEN COALESCE(l.quantidade, 1)
                    ELSE 0
                END) AS experimentais_realizadas,
            sum(
                CASE
                    WHEN l.status::text = 'experimental_faltou'::text THEN COALESCE(l.quantidade, 1)
                    ELSE 0
                END) AS faltaram,
            sum(
                CASE
                    WHEN l.arquivado = true THEN COALESCE(l.quantidade, 1)
                    ELSE 0
                END) AS leads_arquivados
           FROM leads l
             CROSS JOIN params p_1
          WHERE l.data_contato >= p_1.inicio_mes AND l.data_contato < (p_1.fim_mes + '1 day'::interval)
          GROUP BY l.unidade_id, p_1.ano, p_1.mes
        ), snapshot_base AS (
         SELECT a.unidade_id,
            a.id AS aluno_id,
            a.nome,
            a.status,
            a.data_matricula,
            a.data_saida,
            a.valor_parcela,
            a.is_segundo_curso,
            a.tipo_matricula_id,
            a.curso_id,
            tm.codigo AS tipo_matricula_codigo,
            tm.conta_como_pagante,
            c.is_projeto_banda,
            c.nome AS curso_nome
           FROM alunos a
             LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
             LEFT JOIN cursos c ON c.id = a.curso_id
             CROSS JOIN params p_1
          WHERE (a.status::text = ANY (ARRAY['ativo'::character varying, 'trancado'::character varying]::text[])) AND a.data_matricula <= p_1.fim_mes AND (a.data_saida IS NULL OR a.data_saida > p_1.fim_mes)
        ), alunos_mes AS (
         SELECT sb.unidade_id,
            p_1.ano,
            p_1.mes,
            count(DISTINCT sb.nome) AS total_alunos,
            count(DISTINCT sb.nome) FILTER (WHERE sb.conta_como_pagante = true) AS alunos_pagantes,
            count(DISTINCT sb.nome) FILTER (WHERE sb.tipo_matricula_codigo::text = 'BOLSISTA_INT'::text AND COALESCE(sb.is_projeto_banda, false) = false AND COALESCE(sb.is_segundo_curso, false) = false) AS bolsistas_integrais,
            count(DISTINCT sb.nome) FILTER (WHERE sb.tipo_matricula_codigo::text = 'BOLSISTA_PARC'::text AND COALESCE(sb.is_projeto_banda, false) = false AND COALESCE(sb.is_segundo_curso, false) = false) AS bolsistas_parciais,
            count(*) AS matriculas_ativas,
            count(*) FILTER (WHERE sb.is_projeto_banda = true) AS total_banda,
            count(*) FILTER (WHERE COALESCE(sb.is_segundo_curso, false) = true AND COALESCE(sb.is_projeto_banda, false) = false) AS segundo_curso
           FROM snapshot_base sb
             CROSS JOIN params p_1
          GROUP BY sb.unidade_id, p_1.ano, p_1.mes
        ), financeiro_legado AS (
         SELECT a.unidade_id,
            avg(a.valor_parcela) FILTER (WHERE tm.entra_ticket_medio = true) AS ticket_medio,
            sum(a.valor_parcela) FILTER (WHERE tm.conta_como_pagante = true) AS mrr,
            avg(a.tempo_permanencia_meses) AS tempo_permanencia_medio
           FROM alunos a
             LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
          WHERE a.status::text = 'ativo'::text
          GROUP BY a.unidade_id
        ), matriculas_mes AS (
         SELECT a.unidade_id,
            p_1.ano,
            p_1.mes,
            count(*) AS novas_matriculas
           FROM alunos a
             LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
             LEFT JOIN cursos c ON c.id = a.curso_id
             CROSS JOIN params p_1
          WHERE (a.status::text = ANY (ARRAY['ativo'::character varying, 'trancado'::character varying]::text[])) AND a.data_matricula >= p_1.inicio_mes AND a.data_matricula <= p_1.fim_mes AND (a.data_saida IS NULL OR a.data_saida > p_1.fim_mes) AND COALESCE(a.is_segundo_curso, false) = false AND (tm.codigo IS NULL OR (tm.codigo::text <> ALL (ARRAY['BOLSISTA_INT'::character varying, 'BOLSISTA_PARC'::character varying]::text[]))) AND COALESCE(c.is_projeto_banda, false) = false AND (c.nome IS NULL OR c.nome::text !~~* '%canto coral%'::text)
          GROUP BY a.unidade_id, p_1.ano, p_1.mes
        ), evasoes_dedup AS (
         SELECT DISTINCT ON ((lower(TRIM(BOTH FROM m.aluno_nome))), m.unidade_id, p_1.ano, p_1.mes) m.id,
            m.aluno_id,
            m.aluno_nome,
            m.unidade_id,
            p_1.ano,
            p_1.mes,
            m.data AS data_evasao
           FROM movimentacoes_admin m
             CROSS JOIN params p_1
          WHERE (m.tipo::text = ANY (ARRAY['evasao'::character varying, 'nao_renovacao'::character varying]::text[])) AND m.data >= p_1.inicio_mes AND m.data < (p_1.fim_mes + '1 day'::interval)
          ORDER BY (lower(TRIM(BOTH FROM m.aluno_nome))), m.unidade_id, p_1.ano, p_1.mes, m.aluno_id DESC NULLS LAST, m.data DESC
        ), evasoes_mes AS (
         SELECT evasoes_dedup.unidade_id,
            evasoes_dedup.ano,
            evasoes_dedup.mes,
            count(*) AS total_evasoes
           FROM evasoes_dedup
          GROUP BY evasoes_dedup.unidade_id, evasoes_dedup.ano, evasoes_dedup.mes
        ), renovacoes_mes AS (
         SELECT r.unidade_id,
            p_1.ano,
            p_1.mes,
            count(*) FILTER (WHERE r.status::text = 'renovado'::text) AS renovacoes,
            count(*) AS total_contratos,
            avg(r.percentual_reajuste) FILTER (WHERE r.status::text = 'renovado'::text) AS reajuste_medio
           FROM renovacoes r
             CROSS JOIN params p_1
          WHERE r.data_renovacao >= p_1.inicio_mes AND r.data_renovacao < (p_1.fim_mes + '1 day'::interval)
          GROUP BY r.unidade_id, p_1.ano, p_1.mes
        )
 SELECT u.id AS unidade_id,
    u.nome AS unidade_nome,
    p.ano,
    p.mes,
    COALESCE(am.total_alunos, 0::bigint)::integer AS total_alunos_ativos,
    COALESCE(am.alunos_pagantes, 0::bigint)::integer AS total_alunos_pagantes,
    COALESCE(am.bolsistas_integrais, 0::bigint)::integer AS total_bolsistas_integrais,
    COALESCE(am.bolsistas_parciais, 0::bigint)::integer AS total_bolsistas_parciais,
    COALESCE(am.total_banda, 0::bigint)::integer AS total_banda,
    COALESCE(am.segundo_curso, 0::bigint)::integer AS total_segundo_curso,
    COALESCE(fl.ticket_medio, 0::numeric)::numeric(10,2) AS ticket_medio,
    COALESCE(fl.mrr, 0::numeric)::numeric(12,2) AS mrr,
    (COALESCE(fl.mrr, 0::numeric) * 12::numeric)::numeric(14,2) AS arr,
    COALESCE(fl.tempo_permanencia_medio, 0::numeric)::numeric(5,1) AS tempo_permanencia_medio,
    (COALESCE(fl.ticket_medio, 0::numeric) * COALESCE(fl.tempo_permanencia_medio, 0::numeric))::numeric(12,2) AS ltv_medio,
    0::numeric(5,2) AS inadimplencia_pct,
    COALESCE(fl.mrr, 0::numeric)::numeric(12,2) AS faturamento_previsto,
    COALESCE(fl.mrr, 0::numeric)::numeric(12,2) AS faturamento_realizado,
    COALESCE(lm.total_leads, 0::bigint)::integer AS total_leads,
    COALESCE(lm.experimentais_agendadas, 0::bigint)::integer AS experimentais_agendadas,
    COALESCE(lm.experimentais_realizadas, 0::bigint)::integer AS experimentais_realizadas,
    COALESCE(mm.novas_matriculas, 0::bigint)::integer AS novas_matriculas,
    COALESCE(em.total_evasoes, 0::bigint)::integer AS total_evasoes,
        CASE
            WHEN COALESCE(am.alunos_pagantes, 0::bigint) > 0 THEN round(COALESCE(em.total_evasoes, 0::bigint)::numeric / am.alunos_pagantes::numeric * 100::numeric, 2)
            ELSE 0::numeric
        END::numeric(5,2) AS churn_rate,
    COALESCE(rm.renovacoes, 0::bigint)::integer AS renovacoes,
        CASE
            WHEN COALESCE(rm.total_contratos, 0::bigint) > 0 THEN round(rm.renovacoes::numeric / rm.total_contratos::numeric * 100::numeric, 2)
            ELSE 0::numeric
        END::numeric(5,2) AS taxa_renovacao,
    COALESCE(rm.reajuste_medio, 0::numeric)::numeric(5,2) AS reajuste_medio,
    COALESCE(am.matriculas_ativas, 0::bigint)::integer AS matriculas_ativas
   FROM unidades u
     CROSS JOIN params p
     LEFT JOIN alunos_mes am ON am.unidade_id = u.id AND am.ano = p.ano AND am.mes = p.mes
     LEFT JOIN financeiro_legado fl ON fl.unidade_id = u.id
     LEFT JOIN leads_mes lm ON lm.unidade_id = u.id AND lm.ano = p.ano AND lm.mes = p.mes
     LEFT JOIN matriculas_mes mm ON mm.unidade_id = u.id AND mm.ano = p.ano AND mm.mes = p.mes
     LEFT JOIN evasoes_mes em ON em.unidade_id = u.id AND em.ano = p.ano AND em.mes = p.mes
     LEFT JOIN renovacoes_mes rm ON rm.unidade_id = u.id AND rm.ano = p.ano AND rm.mes = p.mes
  WHERE u.ativo = true;
