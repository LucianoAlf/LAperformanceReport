-- vw_contratos_vencendo media a janela em UTC, nao em BRT.
--
-- `CURRENT_DATE` no servidor e UTC. Das 21:00 BRT a meia-noite, ele ja virou o dia
-- seguinte -- entao `dias_ate_vencimento` fica 1 dia adiantado e o filtro `>= 0` do
-- hook CORTA quem vence hoje.
--
-- Flagrado em 2026-08-10 ~21h BRT: Vaner Paranhos e Gabriel Wandeck (Recreio), ambos
-- com ultima aula em 10/08 16:00 BRT, apareciam com dias_ate_vencimento = -1 e sumiam
-- da aba -- enquanto GET /matriculas ainda os devolvia. Era o unico resto da divergencia
-- do Recreio contra a API depois do fix de ciclo sucedido (13 nossos x 15 da API).
--
-- Efeito: a aba "perde" os vencimentos do dia durante as 3 horas finais de cada dia,
-- que e justamente quando a ADM fecha o dia. Vale para as tres unidades.
--
-- Tambem converte data_ultima_aula para BRT antes do ::date. Hoje nao ha nenhuma linha
-- em que isso mude o dia (medido: 0 de 1.166), porque as aulas terminam ate 21h BRT --
-- mas deixar em UTC e uma armadilha esperando uma aula noturna aparecer.

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
        -- venc_ultima_fatura em dias a partir de hoje (BRT): torna a janela filtravel
        -- pelo criterio financeiro -- o alternador que a tela do Emusys tem.
        -- venc_ultima_fatura ja e `date` puro, entao so o "hoje" precisa de fuso.
        CASE
            WHEN jc.nr_faturas IS NULL OR jc.nr_faturas <= 0 THEN NULL::integer
            WHEN jc.data_primeira_fatura IS NULL THEN NULL::integer
            ELSE (date_trunc('month'::text, jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1))::date + (LEAST(COALESCE(jc.dia_vencimento_emusys, EXTRACT(day FROM jc.data_primeira_fatura)::integer), EXTRACT(day FROM date_trunc('month'::text, jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1)) + '1 mon -1 days'::interval)::integer) - 1)) - (now() AT TIME ZONE 'America/Sao_Paulo')::date
        END AS dias_ate_venc_fatura
   FROM vw_jornada_aluno_atual j
     JOIN aluno_jornada_matricula_disciplina jc ON jc.unidade_id = j.unidade_id AND jc.emusys_matricula_disciplina_id = j.emusys_matricula_disciplina_id
     LEFT JOIN alunos a ON a.id = j.aluno_id
  WHERE j.status_matricula = 'ativa'::text
    AND jc.sucedida_por IS NULL;

revoke all on public.vw_contratos_vencendo from public, anon, authenticated;
grant select on public.vw_contratos_vencendo to authenticated, service_role;
