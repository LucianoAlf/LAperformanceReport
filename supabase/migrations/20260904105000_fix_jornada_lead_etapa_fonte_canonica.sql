-- 🔴 FALSO POSITIVO reportado pela Daiana (Recreio) e pela Vitória (CG) em 03/09.
--
-- A Daiana: "o Marcelo faltou, não fez a experimental" — mas o relatório dizia
-- "fez a experimental de Violão e está há 6 dias sem desfecho".
--
-- CAUSA: o `etapa` decidia com
--     `COALESCE(exp.exp_realizadas,0) > 0 OR l.experimental_realizada`
-- ou seja, o flag de `leads` SOBREPUNHA a fonte canônica. O Marcelo tem
-- `lead_experimentais.status = 'cancelada'` (a aula não aconteceu) e
-- `leads.experimental_realizada = true` — os dois flags dele são contraditórios
-- (`realizada` E `faltou` ao mesmo tempo). Medido: 10 leads com essa contradição
-- e 8 sinais R15 abertos sem nenhuma experimental realizada na fonte canônica.
--
-- ⚠️ `lead_experimentais` É A FONTE CANÔNICA — o CLAUDE.md já registra isso para
--    a taxa de conversão do professor, migrada de `leads` (20/06/2026) pelo mesmo
--    motivo. Agora vale aqui também: **existindo linha canônica, ela manda**; o
--    flag de `leads` só resgata quem não tem nenhuma (histórico antigo).
--
-- ⚠️ `cancelada` ganha tratamento próprio: aula cancelada não é experimental
--    agendada nem realizada — o lead volta a ser atendimento.
--
-- ⚠️ As 3 colunas novas entram no FIM da lista: `CREATE OR REPLACE VIEW` não
--    deixa inserir coluna no meio (renomearia as seguintes e o Postgres recusa).
--
-- Consumidor único conferido: `radar_detectar_sinais_comercial_v1`.
-- Apuramento completo: docs/auditorias/2026-09-04-falsos-positivos-pauta-comercial.md
create or replace view public.vw_jornada_lead_v1 as
 WITH exp AS (
         SELECT le.lead_id,
            count(*) AS aulas_experimentais,
            min(le.data_experimental) AS primeira_experimental,
            max(le.data_experimental) AS ultima_experimental,
            count(*) FILTER (WHERE le.status::text = ANY (ARRAY['experimental_realizada'::text, 'convertido'::text])) AS exp_realizadas,
            count(*) FILTER (WHERE le.status::text = 'experimental_faltou'::text) AS exp_faltas,
            count(*) FILTER (WHERE le.status::text = 'cancelada'::text) AS exp_canceladas,
            count(*) FILTER (WHERE le.status::text = 'experimental_agendada'::text) AS exp_agendadas
           FROM lead_experimentais le
          WHERE le.lead_id IS NOT NULL
          GROUP BY le.lead_id
        ), camp AS (
         SELECT lc.lead_id,
            min(lc.created_at) AS primeira_campanha_em,
            string_agg(DISTINCT lc.campanha_nome, ' | '::text) AS campanhas
           FROM leads_campanhas lc
          GROUP BY lc.lead_id
        ), insta AS (
         SELECT s.telefone_chave,
            min(s.iniciada_em) AS ig_primeira_em,
            max(s.ultima_atividade_em) AS ig_ultima_em,
            bool_or(s.transferido) AS ig_transferido,
            (array_agg(s.conta ORDER BY s.ultima_atividade_em DESC))[1] AS ig_conta,
            (array_agg(s.estagio ORDER BY s.ultima_atividade_em DESC))[1] AS ig_estagio,
            (array_agg(s.interesse ORDER BY s.ultima_atividade_em DESC))[1] AS ig_interesse
           FROM instagram_sessoes s
          WHERE s.telefone_chave IS NOT NULL
          GROUP BY s.telefone_chave
        ), base AS (
         SELECT l_1.*,
            (l_1.data_primeiro_contato AT TIME ZONE 'America/Sao_Paulo'::text)::date AS d_primeiro_contato,
            (l_1.data_ultimo_contato AT TIME ZONE 'America/Sao_Paulo'::text)::date AS d_ultimo_contato,
            (l_1.created_at AT TIME ZONE 'America/Sao_Paulo'::text)::date AS d_criado,
            (now() AT TIME ZONE 'America/Sao_Paulo'::text)::date AS hoje_brt
           FROM leads l_1
        )
 SELECT l.id AS lead_id, l.nome, l.telefone,
    fn_normalizar_telefone_br_key(l.telefone::text) AS telefone_chave,
    l.unidade_id, u.nome AS unidade_nome, l.curso_interesse_id,
    cur.nome AS curso_interesse, co.nome AS canal_origem,
    l.meta_ad_source_id, ads.ad_name AS anuncio, ads.campaign_name AS campanha_meta,
    camp.campanhas AS campanhas_whatsapp,
    ins.ig_conta AS instagram_conta, ins.ig_interesse AS instagram_interesse,
    ins.ig_estagio AS instagram_estagio, ins.ig_transferido AS instagram_transferido,
    COALESCE(l.data_contato, l.d_criado) AS entrou_em,
    l.data_primeiro_contato AS primeiro_contato_em,
    l.data_passagem_mila AS passagem_mila_em,
    l.data_experimental AS experimental_agendada_para,
    exp.primeira_experimental AS experimental_real_em,
    l.data_conversao AS convertido_em, l.data_arquivamento AS arquivado_em,
    l.data_ultimo_contato AS ultimo_contato_em,
        CASE
            WHEN l.converteu THEN 'convertido'::text
            WHEN l.status::text = 'arquivado'::text OR l.data_arquivamento IS NOT NULL THEN 'perdido'::text
            -- FONTE CANÔNICA manda quando existe linha
            WHEN COALESCE(exp.aulas_experimentais, 0::bigint) > 0 THEN
            CASE
                WHEN COALESCE(exp.exp_realizadas, 0::bigint) > 0 THEN 'experimental_realizada'::text
                WHEN COALESCE(exp.exp_faltas, 0::bigint) > 0 THEN 'experimental_faltou'::text
                WHEN COALESCE(exp.exp_agendadas, 0::bigint) > 0 THEN 'experimental_agendada'::text
                ELSE 'em_atendimento'::text
            END
            -- resgate para quem não tem NENHUMA linha canônica (histórico antigo)
            WHEN l.experimental_realizada THEN 'experimental_realizada'::text
            WHEN l.faltou_experimental THEN 'experimental_faltou'::text
            WHEN l.experimental_agendada OR l.data_experimental IS NOT NULL THEN 'experimental_agendada'::text
            WHEN l.data_primeiro_contato IS NOT NULL THEN 'em_atendimento'::text
            ELSE 'novo'::text
        END AS etapa,
    l.d_primeiro_contato - COALESCE(l.data_contato, l.d_criado) AS dias_ate_primeiro_contato,
    l.hoje_brt - GREATEST(COALESCE(l.d_ultimo_contato, '-infinity'::date), COALESCE(l.d_primeiro_contato, '-infinity'::date), COALESCE(l.data_experimental, '-infinity'::date), COALESCE(l.data_contato, '-infinity'::date), COALESCE(l.d_criado, '-infinity'::date)) AS dias_parado,
    l.hoje_brt - COALESCE(l.data_contato, l.d_criado) AS dias_no_funil,
    COALESCE(exp.aulas_experimentais, 0::bigint) AS aulas_experimentais,
    COALESCE(exp.exp_realizadas, 0::bigint) AS experimentais_realizadas,
    COALESCE(exp.exp_faltas, 0::bigint) AS experimentais_faltou,
    prof.nome AS professor_experimental,
    l.converteu, l.aluno_id, l.motivo_nao_matricula, l.temperatura,
    l.agente_comercial, l.status AS status_bruto, l.created_at,
    COALESCE(exp.exp_canceladas, 0::bigint) AS experimentais_canceladas,
    COALESCE(exp.exp_agendadas, 0::bigint) AS experimentais_agendadas,
    exp.ultima_experimental AS ultima_experimental_em
   FROM base l
     LEFT JOIN unidades u ON u.id = l.unidade_id
     LEFT JOIN canais_origem co ON co.id = l.canal_origem_id
     LEFT JOIN cursos cur ON cur.id = l.curso_interesse_id
     LEFT JOIN professores prof ON prof.id = l.professor_experimental_id
     LEFT JOIN meta_ads_cache ads ON ads.source_id = l.meta_ad_source_id
     LEFT JOIN exp ON exp.lead_id = l.id
     LEFT JOIN camp ON camp.lead_id = l.id
     LEFT JOIN insta ins ON ins.telefone_chave = fn_normalizar_telefone_br_key(l.telefone::text);

revoke all on public.vw_jornada_lead_v1 from public, anon, authenticated;
grant select on public.vw_jornada_lead_v1 to authenticated, service_role;

comment on view public.vw_jornada_lead_v1 is
  'Jornada do lead. ⚠️ `etapa`: a FONTE CANONICA (lead_experimentais) manda quando existe linha; os flags de `leads` so resgatam quem nao tem nenhuma. Corrigido em 04/09 apos falso positivo reportado pela Daiana: o Marcelo tinha aula `cancelada` na fonte canonica e `experimental_realizada=true` no flag, e o R15 dizia que ele fez a experimental. 10 leads tinham os dois flags contraditorios.';

-- ── Fecha os sinais que a etapa corrigida nao sustenta mais ─────────────────
-- ⚠️ NAO deletar: o sinal existiu, foi entregue a um humano e ele reclamou. O
--    rastro e o que permite medir a taxa de falso positivo depois.
-- ⚠️ `desfecho` so aceita reteve|saiu|sem_acao|falso_positivo|nao_aplicavel —
--    o detalhe do POR QUE vai na `desfecho_nota`, nao inventado no enum.
update public.radar_sinais s
   set status = 'improcedente',
       desfecho = 'falso_positivo',
       desfecho_em = now(),
       desfecho_nota = 'Fonte nao canonica: a etapa vinha do flag de `leads`, que sobrepunha `lead_experimentais`. Fechado em 04/09 apos feedback da Daiana (Recreio) e da Vitoria (CG).',
       atualizado_em = now()
  from public.vw_jornada_lead_v1 j
 where j.lead_id = s.entidade_id
   and s.status = 'aberto'
   and (
     (s.regra_codigo = 'R15' and j.etapa <> 'experimental_realizada')
     or (s.regra_codigo = 'R17' and j.etapa <> 'experimental_faltou')
   );
