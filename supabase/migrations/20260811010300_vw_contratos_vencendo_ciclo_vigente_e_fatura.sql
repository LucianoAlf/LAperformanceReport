-- vw_contratos_vencendo: (1) ignora ciclo ja substituido e (2) expoe a janela por FATURA.
--
-- (1) CICLO VIGENTE -- `jc.sucedida_por is null`.
--     A aba listava contrato ja renovado como se estivesse vencendo, porque o ciclo
--     antigo continua `status_matricula='ativa'` na jornada. Efeito medido (janela 30d):
--       Barra 16 -> 11 | CG 30 -> 22 | Recreio 43 -> 15
--     identico ao que GET /matriculas devolve para as mesmas janelas.
--     ⚠️ O filtro fica AQUI, e nao em vw_jornada_aluno_atual: aquela e lida por 20+
--     consumidores (carteira, agenda, health score) e mudaria todos de uma vez.
--
-- (2) JANELA POR FATURA -- `dias_ate_venc_fatura`.
--     A tela do Emusys tem um alternador "Usar Data da Ultima Aula" / "Usar Vencimento
--     da Ultima Fatura", porque os dois marcos raramente coincidem: em 831 de 1.060
--     contratos ativos (78%) eles caem em MESES diferentes. Ate agora so expunhamos
--     `dias_ate_vencimento` (aula), entao quem vence so pela fatura nao entrava na
--     janela -- o caso "acabou a parcela e as aulas ainda vao correr".
--     A coluna venc_ultima_fatura ja existia (exibida, nunca filtravel).
--
-- Paridade do venc_ultima_fatura conferida em 10/08/2026 contra GET /faturas:
-- 7 de 7 contratos com o dia exato, incluindo os casos com taxa de matricula avulsa
-- (fatura sem numero_parcela) e 1a fatura em dia diferente das demais.

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
    j.data_ultima_aula::date - CURRENT_DATE AS dias_ate_vencimento,
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
        -- mesma expressao do venc_ultima_fatura, em dias a partir de hoje: e o que torna
        -- a janela filtravel pelo criterio financeiro. NULL quando nao ha faturas.
        -- ⚠️ Coluna nova vai no FIM: `create or replace view` recusa insercao no meio
        -- ("cannot change name of view column"), e um DROP+CREATE aqui derrubaria as
        -- permissoes e exigiria recriar tudo.
        CASE
            WHEN jc.nr_faturas IS NULL OR jc.nr_faturas <= 0 THEN NULL::integer
            WHEN jc.data_primeira_fatura IS NULL THEN NULL::integer
            ELSE (date_trunc('month'::text, jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1))::date + (LEAST(COALESCE(jc.dia_vencimento_emusys, EXTRACT(day FROM jc.data_primeira_fatura)::integer), EXTRACT(day FROM date_trunc('month'::text, jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1)) + '1 mon -1 days'::interval)::integer) - 1)) - CURRENT_DATE
        END AS dias_ate_venc_fatura
   FROM vw_jornada_aluno_atual j
     JOIN aluno_jornada_matricula_disciplina jc ON jc.unidade_id = j.unidade_id AND jc.emusys_matricula_disciplina_id = j.emusys_matricula_disciplina_id
     LEFT JOIN alunos a ON a.id = j.aluno_id
  WHERE j.status_matricula = 'ativa'::text
    AND jc.sucedida_por IS NULL;

-- Toda relacao nova em public nasce com authenticated=arwdDxtm por causa do
-- ALTER DEFAULT PRIVILEGES do schema; `grant select` depois NAO tira o resto.
revoke all on public.vw_contratos_vencendo from public, anon, authenticated;
grant select on public.vw_contratos_vencendo to authenticated, service_role;
