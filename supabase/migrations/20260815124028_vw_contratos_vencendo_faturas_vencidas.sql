-- vw_contratos_vencendo: coluna `faturas_vencidas_abertas` para replicar a coluna
-- "Faturas" da tela Escola -> Renovacao de Matriculas do Emusys.
--
-- O QUE A COLUNA DO EMUSYS CONTA (medido ao vivo em 15/08/2026, 3 hipoteses testadas):
--   E o numero de faturas EM ABERTO E VENCIDAS -- um contador de inadimplencia.
--   Semaforo da tela: verde 0 | ambar 1 | vermelho 2+.
--
--   Descartadas por contra-exemplo, nao por opiniao:
--   (a) "total de faturas do contrato" -- daria 12 em todos; a tela mostra 0.
--   (b) "parcelas restantes a vencer"  -- Andre Luis de Souza Rangel (CG) tem
--       venc. ultima fatura em 20/09/2026 (futuro, logo 2 restantes) e a tela mostra 0;
--       Caio Villela Meireles (Recreio) idem, 05/09/2026 e tela mostra 0.
--   Confirmacao positiva: Renan de Souza Correa (CG) = 2 em vermelho e Pedro Marinho
--   (Barra) = 1 em ambar -- os dois inadimplentes na nossa base, contra 0 verde em
--   todas as outras 44 linhas das janelas de 30 e 60 dias.
--
-- ⚠️ O NUMERO E UM PISO, NAO O VALOR EXATO. `emusys_faturas` so tem competencia
--    a partir de 2026-06 (o sync roda competencia atual + anterior), entao atraso mais
--    antigo que isso nao esta no espelho. Medido: das 41 matriculas inadimplentes,
--    2 tem ZERO fatura vencida no espelho e o Renan aparece com 1 onde o Emusys diz 2.
--    Por isso o consumidor DEVE usar `inadimplente` (booleano vindo do contrato, via
--    /matriculas, sempre correto) para decidir a COR, e esta coluna so para o NUMERO,
--    exibido como ">=N". Usar a contagem sozinha pintaria de verde 2 inadimplentes reais.
--    Para paridade numerica exata seria preciso estender o sync-faturas-emusys para
--    varrer `status=aberta` sem recorte de competencia -- fora do escopo desta mudanca.
--
-- Grao: a contagem e do CONTRATO/matricula e repete nas N linhas de uma matricula
-- multi-disciplina -- mesmo comportamento ja adotado por nr_faturas e inadimplente.
--
-- ⚠️ A coluna nova vai no FIM: `create or replace view` recusa insercao no meio
--    ("cannot change name of view column"), e DROP+CREATE derrubaria as permissoes.

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

    -- coluna nova (ver cabecalho): piso de faturas vencidas e nao pagas
    COALESCE(fv.qtd, 0)::integer AS faturas_vencidas_abertas

   FROM vw_jornada_aluno_atual j
     JOIN aluno_jornada_matricula_disciplina jc ON jc.unidade_id = j.unidade_id AND jc.emusys_matricula_disciplina_id = j.emusys_matricula_disciplina_id
     LEFT JOIN alunos a ON a.id = j.aluno_id
     -- agregado ANTES do join (nao correlacionado por linha): a view tem grao de
     -- matricula-disciplina e varias linhas compartilham a mesma matricula.
     LEFT JOIN (
       SELECT unidade_id, emusys_matricula_id, count(*) AS qtd
         FROM emusys_faturas
        WHERE status = 'aberta'
          AND data_vencimento < (now() AT TIME ZONE 'America/Sao_Paulo')::date
        GROUP BY unidade_id, emusys_matricula_id
     ) fv ON fv.unidade_id = j.unidade_id AND fv.emusys_matricula_id = j.emusys_matricula_id
  WHERE j.status_matricula = 'ativa'::text
    AND jc.sucedida_por IS NULL;

-- Toda relacao nova em public nasce com authenticated=arwdDxtm por causa do
-- ALTER DEFAULT PRIVILEGES do schema; `grant select` depois NAO tira o resto.
revoke all on public.vw_contratos_vencendo from public, anon, authenticated;
grant select on public.vw_contratos_vencendo to authenticated, service_role;
