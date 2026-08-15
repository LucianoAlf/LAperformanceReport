-- vw_contratos_vencendo: expoe `nr_faturas` (nº de parcelas do contrato).
--
-- Serve ao recorte "Sem parcela" (contratos cujas parcelas acabaram e ainda tem aula):
-- sem esta coluna, "pagou o ano a vista" e "parou de ser cobrado" ficam identicos na tela.
-- Medido em 15/08/2026: dos 75 contratos com a ultima fatura ja vencida e aula pela frente,
-- **4 tem nr_faturas = 1 somando 130 aulas** -- pagamento unico ou cadastro errado, e os
-- dados nao distinguem os dois. Quem julga e a ADM, entao a informacao vai para a tela em
-- vez de virar filtro. Os outros 56 de 12 parcelas sao o caso classico do descasamento.
--
-- O campo ja existia em aluno_jornada_matricula_disciplina (a view so nao o projetava) e
-- ja e usado aqui para derivar venc_ultima_fatura -- nao ha dado novo, so exposicao.
--
-- ⚠️ Coluna nova no FIM: `create or replace view` recusa insercao no meio.

create or replace view public.vw_contratos_vencendo as
 SELECT j.unidade_id,
    j.unidade_nome,
    j.aluno_id,
    j.aluno_nome,
    j.emusys_matricula_id,
    j.emusys_matricula_disciplina_id,
    j.curso_nome,
    j.professor_nome,
    a.data_matricula,
    j.data_ultima_aula,
    (j.data_ultima_aula AT TIME ZONE 'America/Sao_Paulo')::date
      - (now() AT TIME ZONE 'America/Sao_Paulo')::date AS dias_ate_vencimento,
    j.nr_aulas_futuras,
        CASE
            WHEN jc.nr_faturas IS NULL OR jc.nr_faturas <= 0 THEN NULL::date
            WHEN jc.data_primeira_fatura IS NULL THEN NULL::date
            ELSE date_trunc('month'::text, jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1))::date + (LEAST(COALESCE(jc.dia_vencimento_emusys, EXTRACT(day FROM jc.data_primeira_fatura)::integer), EXTRACT(day FROM date_trunc('month'::text, jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1)) + '1 mon -1 days'::interval)::integer) - 1)
        END AS venc_ultima_fatura,
    a.valor_parcela,
    jc.inadimplente_emusys AS inadimplente,
    a.telefone,
    a.whatsapp,
    j.ultima_sincronizacao_emusys,
        CASE
            WHEN jc.nr_faturas IS NULL OR jc.nr_faturas <= 0 THEN NULL::integer
            WHEN jc.data_primeira_fatura IS NULL THEN NULL::integer
            ELSE (date_trunc('month'::text, jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1))::date + (LEAST(COALESCE(jc.dia_vencimento_emusys, EXTRACT(day FROM jc.data_primeira_fatura)::integer), EXTRACT(day FROM date_trunc('month'::text, jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1)) + '1 mon -1 days'::interval)::integer) - 1)) - (now() AT TIME ZONE 'America/Sao_Paulo')::date
        END AS dias_ate_venc_fatura,
    COALESCE(fv.qtd, 0)::integer AS faturas_vencidas_abertas,

    -- coluna nova (ver cabecalho)
    jc.nr_faturas

   FROM vw_jornada_aluno_atual j
     JOIN aluno_jornada_matricula_disciplina jc ON jc.unidade_id = j.unidade_id AND jc.emusys_matricula_disciplina_id = j.emusys_matricula_disciplina_id
     LEFT JOIN alunos a ON a.id = j.aluno_id
     LEFT JOIN (
       SELECT unidade_id, emusys_matricula_id, count(*) AS qtd
         FROM emusys_faturas
        WHERE status = 'aberta'
          AND data_vencimento < (now() AT TIME ZONE 'America/Sao_Paulo')::date
        GROUP BY unidade_id, emusys_matricula_id
     ) fv ON fv.unidade_id = j.unidade_id AND fv.emusys_matricula_id = j.emusys_matricula_id
  WHERE j.status_matricula = 'ativa'::text
    AND jc.sucedida_por IS NULL;

revoke all on public.vw_contratos_vencendo from public, anon, authenticated;
grant select on public.vw_contratos_vencendo to authenticated, service_role;
