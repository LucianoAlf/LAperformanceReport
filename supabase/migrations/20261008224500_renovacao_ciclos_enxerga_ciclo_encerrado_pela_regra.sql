-- 08/10/2026 -- `vw_renovacao_ciclos` volta a enxergar o ciclo RENOVADO.
--
-- Regressão causada por 20261008220000 (minutos antes): a view lê
-- `vw_jornada_aluno_atual` (só `status_matricula = 'ativa'`) e o "renovou" é a
-- linha ANTIGA com `sucedida_por`. Encerradas pela regra, as linhas renovadas
-- sumiram dos dois lados da Cobertura de Renovação -- out/2026: Barra 7/11 -> 0/4,
-- CG 19/22 -> 0/2, Recreio 8/15 -> 0/7.
--
-- Conserto: a fonte `j` passa a ser a mesma projeção de `vw_jornada_aluno_atual`
-- sem o filtro de status, e o filtro vem para cá: `ativa` OU ciclo renovado que
-- a regra `regra:sumiu_do_emusys` encerrou. Restringir à fonte da regra preserva a
-- semântica anterior: as 9 linhas `finalizada` + `sucedida_por` que já existiam
-- (finalizadas pelo próprio Emusys) continuam fora, como antes.
-- `vw_jornada_aluno_atual` NÃO é alterada (20+ consumidores). Mesmas colunas,
-- então `create or replace` preserva grants e opções.

create or replace view public.vw_renovacao_ciclos as
SELECT j.unidade_id,
    j.unidade_nome,
    j.aluno_id,
    j.aluno_nome,
    j.emusys_matricula_id,
    j.emusys_matricula_disciplina_id,
    j.curso_id,
    j.curso_nome,
    j.professor_nome,
    a.data_matricula,
    j.data_ultima_aula,
    j.nr_aulas_futuras,
    a.valor_parcela,
    jc.inadimplente_emusys AS inadimplente,
    a.telefone,
    a.whatsapp,
    j.ultima_sincronizacao_emusys,
    jc.sucedida_por,
    (jc.sucedida_por IS NOT NULL) AS renovou,
    is_atividade_extra_curso(j.curso_id) AS atividade_extra,
    (date_trunc('month'::text, (j.data_ultima_aula AT TIME ZONE 'America/Sao_Paulo'::text)))::date AS competencia_aula,
        CASE
            WHEN ((jc.nr_faturas IS NULL) OR (jc.nr_faturas <= 0)) THEN NULL::date
            WHEN (jc.data_primeira_fatura IS NULL) THEN NULL::date
            ELSE ((date_trunc('month'::text, (jc.data_primeira_fatura + make_interval(months => (jc.nr_faturas - 1)))))::date + (LEAST(COALESCE(jc.dia_vencimento_emusys, (EXTRACT(day FROM jc.data_primeira_fatura))::integer), (EXTRACT(day FROM (date_trunc('month'::text, (jc.data_primeira_fatura + make_interval(months => (jc.nr_faturas - 1)))) + '1 mon -1 days'::interval)))::integer) - 1))
        END AS venc_ultima_fatura,
        CASE
            WHEN ((jc.nr_faturas IS NULL) OR (jc.nr_faturas <= 0)) THEN NULL::date
            WHEN (jc.data_primeira_fatura IS NULL) THEN NULL::date
            ELSE (date_trunc('month'::text, date_trunc('month'::text, (jc.data_primeira_fatura + make_interval(months => (jc.nr_faturas - 1))))))::date
        END AS competencia_fatura,
    (COALESCE(fv.qtd, (0)::bigint))::integer AS faturas_vencidas_abertas
   FROM ((((
SELECT j.id,
    j.unidade_id,
    u.nome AS unidade_nome,
    j.aluno_id,
    a.nome AS aluno_nome,
    a.telefone,
    a.whatsapp,
    a.responsavel_nome,
    a.responsavel_telefone,
    j.emusys_aluno_id,
    j.emusys_matricula_id,
    j.emusys_matricula_disciplina_id,
    j.emusys_disciplina_id,
    j.curso_id,
    COALESCE(c.nome, (j.curso_nome_emusys)::character varying) AS curso_nome,
    j.curso_nome_emusys,
    j.professor_id,
    COALESCE(p.nome, (j.professor_nome_emusys)::character varying) AS professor_nome,
    j.emusys_professor_id,
    j.professor_nome_emusys,
    j.status_matricula,
    j.qtd_contratos,
    j.nr_aulas_contratadas,
    j.nr_aulas_passadas,
    j.nr_aulas_futuras,
    j.proxima_aula_numero,
    j.percentual_jornada,
        CASE
            WHEN (j.nr_aulas_contratadas IS NULL) THEN NULL::text
            WHEN ((COALESCE(j.nr_aulas_futuras, 0) > 0) AND (j.proxima_aula_numero IS NOT NULL)) THEN ((('Aula '::text || j.proxima_aula_numero) || '/'::text) || j.nr_aulas_contratadas)
            WHEN (COALESCE(j.nr_aulas_passadas, 0) >= j.nr_aulas_contratadas) THEN (((j.nr_aulas_contratadas || '/'::text) || j.nr_aulas_contratadas) || ' concluida'::text)
            ELSE ((COALESCE(j.nr_aulas_passadas, 0) || '/'::text) || j.nr_aulas_contratadas)
        END AS jornada_label,
    j.data_primeira_aula,
    j.data_ultima_aula,
    j.dia_semana,
    j.horario,
    j.fonte_ultima_atualizacao,
    j.ultima_sincronizacao_emusys,
    j.updated_at
   FROM ((((aluno_jornada_matricula_disciplina j
     LEFT JOIN unidades u ON ((u.id = j.unidade_id)))
     LEFT JOIN alunos a ON ((a.id = j.aluno_id)))
     LEFT JOIN cursos c ON ((c.id = j.curso_id)))
     LEFT JOIN professores p ON ((p.id = j.professor_id)))
) j
     JOIN aluno_jornada_matricula_disciplina jc ON (((jc.unidade_id = j.unidade_id) AND (jc.emusys_matricula_disciplina_id = j.emusys_matricula_disciplina_id))))
     LEFT JOIN alunos a ON ((a.id = j.aluno_id)))
     LEFT JOIN ( SELECT emusys_faturas.unidade_id,
            emusys_faturas.emusys_matricula_id,
            count(*) AS qtd
           FROM emusys_faturas
          WHERE ((emusys_faturas.status = 'aberta'::text) AND (emusys_faturas.data_vencimento < ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date))
          GROUP BY emusys_faturas.unidade_id, emusys_faturas.emusys_matricula_id) fv ON (((fv.unidade_id = j.unidade_id) AND (fv.emusys_matricula_id = j.emusys_matricula_id))))
  WHERE (((j.status_matricula = 'ativa'::text) OR ((jc.sucedida_por IS NOT NULL) AND (jc.fonte_ultima_atualizacao = 'regra:sumiu_do_emusys'::text))) AND ((( SELECT CURRENT_USER AS "current_user") = ANY (ARRAY['service_role'::name, 'postgres'::name])) OR ( SELECT is_admin() AS is_admin) OR (j.unidade_id IN ( SELECT get_user_unidade_ids() AS get_user_unidade_ids))));
