-- vw_renovacao_ciclos: mesma coluna `faturas_vencidas_abertas` de vw_contratos_vencendo.
--
-- Por que as duas: a aba Contratos troca a FONTE conforme o recorte -- janelas de
-- 30/60/90 dias leem vw_contratos_vencendo, "Este mes" le esta view (via
-- useCoberturaRenovacao). Sem a coluna aqui, a celula "Faturas" ficaria vazia
-- exatamente no recorte por competencia -- ou, pior, cairia no `?? 0` do front e
-- pintaria de verde ("em dia") quem esta devendo.
--
-- Semantica, limite do numero e as hipoteses descartadas estao documentados no
-- cabecalho de 20260815124028_vw_contratos_vencendo_faturas_vencidas.sql. Resumo:
-- e o piso de faturas vencidas e nao pagas; a COR deve sair de `inadimplente`.

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
    jc.sucedida_por IS NOT NULL AS renovou,
    is_atividade_extra_curso(j.curso_id) AS atividade_extra,
    date_trunc('month'::text, (j.data_ultima_aula AT TIME ZONE 'America/Sao_Paulo'::text))::date AS competencia_aula,
        CASE
            WHEN jc.nr_faturas IS NULL OR jc.nr_faturas <= 0 THEN NULL::date
            WHEN jc.data_primeira_fatura IS NULL THEN NULL::date
            ELSE date_trunc('month'::text, jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1))::date + (LEAST(COALESCE(jc.dia_vencimento_emusys, EXTRACT(day FROM jc.data_primeira_fatura)::integer), EXTRACT(day FROM date_trunc('month'::text, jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1)) + '1 mon -1 days'::interval)::integer) - 1)
        END AS venc_ultima_fatura,
        CASE
            WHEN jc.nr_faturas IS NULL OR jc.nr_faturas <= 0 THEN NULL::date
            WHEN jc.data_primeira_fatura IS NULL THEN NULL::date
            ELSE date_trunc('month'::text, date_trunc('month'::text, jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1)))::date
        END AS competencia_fatura,

    -- coluna nova, no FIM (create or replace recusa insercao no meio)
    COALESCE(fv.qtd, 0)::integer AS faturas_vencidas_abertas

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
  WHERE j.status_matricula = 'ativa'::text;

comment on view public.vw_renovacao_ciclos is
  'Ciclos de matricula-disciplina com os dois lados da renovacao (renovou / nao renovou), '
  'para calcular cobertura por competencia. Consumidores DEVEM filtrar atividade_extra = false '
  '(regra 3.5). Nao confundir com vw_contratos_vencendo, que so mostra ciclo vigente.';

revoke all on public.vw_renovacao_ciclos from public, anon, authenticated;
grant select on public.vw_renovacao_ciclos to authenticated, service_role;
