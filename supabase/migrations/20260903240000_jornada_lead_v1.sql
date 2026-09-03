-- A3 do Mapa de Sinais — ALICERCE da vertical COMERCIAL (Mila + consultoras).
--
-- Uma linha por lead com a historia inteira: por onde entrou (canal, anuncio do
-- Meta, campanha de WhatsApp, sessao de Instagram), quem falou com ele, se fez
-- experimental, e no que deu.
--
-- ⚠️ POR QUE NAO USEI `vw_leads_comercial`, que tem 50 colunas e todos os
-- marcos: a ultima linha dela e
--     WHERE l.status <> 'convertido' OR l.status IS NULL
-- Ela EXCLUI os convertidos por construcao — e lista de trabalho do comercial,
-- nao jornada. Foi assim que medi `converteu = 0` em 2.491 leads de 90 dias
-- enquanto `leads` mostrava 211 conversoes no mesmo periodo, a ultima no
-- proprio dia. Sem desfecho nao ha aprendizado: o 2o andar precisa saber em que
-- os leads deram.
--
-- ⚠️ A ETAPA E DERIVADA DE FATO, nunca de `leads.status`. O vocabulario derivou:
-- a view antiga faz CASE sobre (novo, em_contato, agendado, realizado,
-- convertido, arquivado, perdido) e o que existe hoje em 90 dias e (novo,
-- experimental_agendada, experimental_realizada, experimental_faltou,
-- convertido, visita_escola) — QUATRO valores vivos caem no ELSE e viram 'lead'.
--
-- ⚠️ `data_primeiro_contato`, `data_ultimo_contato` e `data_passagem_mila` sao
-- TIMESTAMPTZ. Converter com `::date` direto usaria o fuso da SESSAO (UTC no
-- servidor) e das 21h a meia-noite BRT ja estaria no dia seguinte — a mesma
-- armadilha que a `vw_contratos_vencendo` teve com CURRENT_DATE. Por isso o CTE
-- `base` converte em America/Sao_Paulo antes de virar date.
--
-- Cobertura medida em 03/09/2026, sobre 2.649 leads de 90 dias:
--   100% com 1o contato | 71% com ultimo contato (e os 1.886 avancaram, o campo
--   E mantido) | 977 com anuncio identificado | 57 de campanha | 40 do Instagram
--   ⚠️ `data_passagem_mila` esta ZERADA — campo morto.

create or replace view public.vw_jornada_lead_v1 as
 WITH exp AS (
         SELECT le.lead_id,
            count(*) AS aulas_experimentais,
            min(le.data_experimental) AS primeira_experimental,
            max(le.data_experimental) AS ultima_experimental,
            count(*) FILTER (WHERE le.status::text = ANY (ARRAY['experimental_realizada'::character varying, 'convertido'::character varying]::text[])) AS exp_realizadas,
            count(*) FILTER (WHERE le.status::text = 'experimental_faltou'::text) AS exp_faltas
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
         SELECT l_1.id,
            l_1.nome,
            l_1.telefone,
            l_1.whatsapp,
            l_1.email,
            l_1.idade,
            l_1.unidade_id,
            l_1.curso_interesse_id,
            l_1.canal_origem_id,
            l_1.data_contato,
            l_1.data_primeiro_contato,
            l_1.data_ultimo_contato,
            l_1.status,
            l_1.motivo_arquivamento,
            l_1.experimental_agendada,
            l_1.data_experimental,
            l_1.horario_experimental,
            l_1.professor_experimental_id,
            l_1.experimental_realizada,
            l_1.faltou_experimental,
            l_1.converteu,
            l_1.data_conversao,
            l_1.aluno_id,
            l_1.motivo_nao_matricula,
            l_1.agente_comercial,
            l_1.observacoes,
            l_1.created_at,
            l_1.updated_at,
            l_1.created_by,
            l_1.valor_passaporte,
            l_1.valor_parcela,
            l_1.forma_pagamento_id,
            l_1.forma_pagamento_passaporte_id,
            l_1.professor_fixo_id,
            l_1.tipo_matricula,
            l_1.tipo_aluno,
            l_1.aluno_novo_retorno,
            l_1.dia_vencimento,
            l_1.sabia_preco,
            l_1.quantidade,
            l_1.motivo_arquivamento_id,
            l_1.motivo_nao_matricula_id,
            l_1.data_arquivamento,
            l_1.arquivado,
            l_1.chatwoot_conversation_id,
            l_1.etapa_pipeline_id,
            l_1.temperatura,
            l_1.faixa_etaria,
            l_1.tipo_agendamento,
            l_1.observacoes_professor,
            l_1.qtd_tentativas_sem_resposta,
            l_1.qtd_desmarcacoes,
            l_1.motivo_nao_comparecimento_id,
            l_1.atendido_por_id,
            l_1.consultor_id,
            l_1.data_passagem_mila,
            l_1.motivo_passagem_mila,
            l_1.qtd_mensagens_mila,
            l_1.taxa_compromisso_cobrada,
            l_1.emusys_lead_id,
            l_1.nocodb_lead_id,
            l_1.meta_ad_source_id,
            l_1.meta_ctwa_clid,
            l_1.data_nascimento,
            (l_1.data_primeiro_contato AT TIME ZONE 'America/Sao_Paulo'::text)::date AS d_primeiro_contato,
            (l_1.data_ultimo_contato AT TIME ZONE 'America/Sao_Paulo'::text)::date AS d_ultimo_contato,
            (l_1.created_at AT TIME ZONE 'America/Sao_Paulo'::text)::date AS d_criado,
            (now() AT TIME ZONE 'America/Sao_Paulo'::text)::date AS hoje_brt
           FROM leads l_1
        )
 SELECT l.id AS lead_id,
    l.nome,
    l.telefone,
    fn_normalizar_telefone_br_key(l.telefone::text) AS telefone_chave,
    l.unidade_id,
    u.nome AS unidade_nome,
    l.curso_interesse_id,
    cur.nome AS curso_interesse,
    co.nome AS canal_origem,
    l.meta_ad_source_id,
    ads.ad_name AS anuncio,
    ads.campaign_name AS campanha_meta,
    camp.campanhas AS campanhas_whatsapp,
    ins.ig_conta AS instagram_conta,
    ins.ig_interesse AS instagram_interesse,
    ins.ig_estagio AS instagram_estagio,
    ins.ig_transferido AS instagram_transferido,
    COALESCE(l.data_contato, l.d_criado) AS entrou_em,
    l.data_primeiro_contato AS primeiro_contato_em,
    l.data_passagem_mila AS passagem_mila_em,
    l.data_experimental AS experimental_agendada_para,
    exp.primeira_experimental AS experimental_real_em,
    l.data_conversao AS convertido_em,
    l.data_arquivamento AS arquivado_em,
    l.data_ultimo_contato AS ultimo_contato_em,
        CASE
            WHEN l.converteu THEN 'convertido'::text
            WHEN l.status::text = 'arquivado'::text OR l.data_arquivamento IS NOT NULL THEN 'perdido'::text
            WHEN COALESCE(exp.exp_realizadas, 0::bigint) > 0 OR l.experimental_realizada THEN 'experimental_realizada'::text
            WHEN l.faltou_experimental OR COALESCE(exp.exp_faltas, 0::bigint) > 0 THEN 'experimental_faltou'::text
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
    l.converteu,
    l.aluno_id,
    l.motivo_nao_matricula,
    l.temperatura,
    l.agente_comercial,
    l.status AS status_bruto,
    l.created_at
   FROM base l
     LEFT JOIN unidades u ON u.id = l.unidade_id
     LEFT JOIN canais_origem co ON co.id = l.canal_origem_id
     LEFT JOIN cursos cur ON cur.id = l.curso_interesse_id
     LEFT JOIN professores prof ON prof.id = l.professor_experimental_id
     LEFT JOIN meta_ads_cache ads ON ads.source_id = l.meta_ad_source_id
     LEFT JOIN exp ON exp.lead_id = l.id
     LEFT JOIN camp ON camp.lead_id = l.id
     LEFT JOIN insta ins ON ins.telefone_chave = fn_normalizar_telefone_br_key(l.telefone::text);

comment on view public.vw_jornada_lead_v1 is
  'Jornada COMPLETA do lead (inclui convertidos, ao contrario de vw_leads_comercial, que os exclui no WHERE). Etapa DERIVADA dos marcos, nunca de leads.status. Datas convertidas em BRT antes de virar date. Espinha da fatia comercial do Mapa de Sinais.';

-- Detector da fatia COMERCIAL. Idempotente por `chave_dedup`
-- (regra|lead|semana) — validado: a 2a execucao no mesmo dia devolve 0.
--
-- Os baldes foram DIMENSIONADOS antes de virar regra, para nao repetir a lista
-- de 142 que ja mordeu esta frente:
--   C1 novo sem 1o contato >2d ....... 0     -> DESCARTADA por falta de lastro
--   C2 exp agendada ja passou ........ 103   -> R16
--   C3 exp REALIZADA sem desfecho .... 179   -> R15 (maior valor)
--   C4 faltou e ninguem remarcou ..... 81    -> R17
--   C5 parado 7-30d .................. 605   -> FORA do 1o andar
--   C6 parado >30d ................... 2.148 -> FORA: e cemiterio, nao lista de
--                                              trabalho. Virar sinal seria a
--                                              mesma armadilha do R8 ingenuo
--                                              (248 casos, 5% de precisao).
-- C5 e C6 viram METRICA do 2o andar, nao alerta.

CREATE OR REPLACE FUNCTION public.radar_detectar_sinais_comercial_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_hoje        date := (now() at time zone 'America/Sao_Paulo')::date;
  v_semana      text := to_char(v_hoje, 'IYYY-IW');
  v_competencia date := date_trunc('month', v_hoje)::date;
  v_r15 int := 0; v_r16 int := 0; v_r17 int := 0;
begin
  -- R15 — experimental REALIZADA e ninguém fechou.
  -- O ponto mais caro do funil: a pessoa veio até a escola.
  with alvo as (
    select j.*
    from public.vw_jornada_lead_v1 j
    where j.etapa = 'experimental_realizada'
      and not j.converteu
      and j.dias_parado > 3
      and j.entrou_em >= v_hoje - 120
      and j.motivo_nao_matricula is null
  ), ins as (
    insert into public.radar_sinais
      (entidade_tipo, entidade_id, unidade_id, regra_codigo, tipo_sinal, severidade,
       canonico, origem, dominio, contexto, interpretacao, orientacao, evidencia,
       identificacao, detectado_em, competencia, expira_em, chave_dedup, status, regra_versao)
    select 'lead', a.lead_id, a.unidade_id, 'R15', 'experimental_sem_desfecho', r.severidade_padrao,
           true, 'sql_comercial', 'comercial',
           a.nome || ' fez a experimental' ||
             coalesce(' de ' || a.curso_interesse, '') ||
             coalesce(' com ' || a.professor_experimental, '') ||
             ' e está há ' || a.dias_parado || ' dias sem desfecho.',
           r.lastro, r.orientacao_padrao,
           jsonb_build_object(
             'etapa', a.etapa, 'dias_parado', a.dias_parado,
             'experimental_em', a.experimental_real_em,
             'canal_origem', a.canal_origem, 'anuncio', a.anuncio,
             'curso', a.curso_interesse, 'professor', a.professor_experimental,
             'telefone', a.telefone),
           jsonb_build_object('metodo','jornada_lead','confianca',1.0,'lead_id',a.lead_id),
           now(), v_competencia, (v_hoje + 30)::timestamptz,
           'R15|lead|' || a.lead_id || '|' || v_semana, 'aberto', r.versao
    from alvo a cross join (select * from public.radar_regras where codigo='R15') r
    on conflict (chave_dedup) do nothing
    returning 1
  ) select count(*) into v_r15 from ins;

  -- R16 — experimental agendada cuja data já passou e ninguém deu desfecho.
  with alvo as (
    select j.*
    from public.vw_jornada_lead_v1 j
    where j.etapa = 'experimental_agendada'
      and not j.converteu
      and j.experimental_agendada_para < v_hoje
      and j.entrou_em >= v_hoje - 120
  ), ins as (
    insert into public.radar_sinais
      (entidade_tipo, entidade_id, unidade_id, regra_codigo, tipo_sinal, severidade,
       canonico, origem, dominio, contexto, interpretacao, orientacao, evidencia,
       identificacao, detectado_em, competencia, expira_em, chave_dedup, status, regra_versao)
    select 'lead', a.lead_id, a.unidade_id, 'R16', 'experimental_sem_lancamento', r.severidade_padrao,
           true, 'sql_comercial', 'comercial',
           a.nome || ' tinha experimental marcada para ' ||
             to_char(a.experimental_agendada_para, 'DD/MM') ||
             ' e ninguém registrou o que aconteceu (' ||
             (v_hoje - a.experimental_agendada_para) || ' dias).',
           r.lastro, r.orientacao_padrao,
           jsonb_build_object(
             'etapa', a.etapa, 'agendada_para', a.experimental_agendada_para,
             'dias_desde_a_data', (v_hoje - a.experimental_agendada_para),
             'canal_origem', a.canal_origem, 'curso', a.curso_interesse,
             'professor', a.professor_experimental, 'telefone', a.telefone),
           jsonb_build_object('metodo','jornada_lead','confianca',1.0,'lead_id',a.lead_id),
           now(), v_competencia, (v_hoje + 30)::timestamptz,
           'R16|lead|' || a.lead_id || '|' || v_semana, 'aberto', r.versao
    from alvo a cross join (select * from public.radar_regras where codigo='R16') r
    on conflict (chave_dedup) do nothing
    returning 1
  ) select count(*) into v_r16 from ins;

  -- R17 — faltou e ninguém remarcou.
  with alvo as (
    select j.*
    from public.vw_jornada_lead_v1 j
    where j.etapa = 'experimental_faltou'
      and not j.converteu
      and j.dias_parado > 2
      and j.entrou_em >= v_hoje - 120
  ), ins as (
    insert into public.radar_sinais
      (entidade_tipo, entidade_id, unidade_id, regra_codigo, tipo_sinal, severidade,
       canonico, origem, dominio, contexto, interpretacao, orientacao, evidencia,
       identificacao, detectado_em, competencia, expira_em, chave_dedup, status, regra_versao)
    select 'lead', a.lead_id, a.unidade_id, 'R17', 'faltou_sem_remarcacao', r.severidade_padrao,
           true, 'sql_comercial', 'comercial',
           a.nome || ' faltou à experimental' ||
             coalesce(' de ' || a.curso_interesse, '') ||
             ' e ninguém remarcou (' || a.dias_parado || ' dias).',
           r.lastro, r.orientacao_padrao,
           jsonb_build_object(
             'etapa', a.etapa, 'dias_parado', a.dias_parado,
             'agendada_para', a.experimental_agendada_para,
             'canal_origem', a.canal_origem, 'curso', a.curso_interesse,
             'telefone', a.telefone),
           jsonb_build_object('metodo','jornada_lead','confianca',1.0,'lead_id',a.lead_id),
           now(), v_competencia, (v_hoje + 30)::timestamptz,
           'R17|lead|' || a.lead_id || '|' || v_semana, 'aberto', r.versao
    from alvo a cross join (select * from public.radar_regras where codigo='R17') r
    on conflict (chave_dedup) do nothing
    returning 1
  ) select count(*) into v_r17 from ins;

  return jsonb_build_object(
    'ok', true, 'competencia', v_competencia, 'semana', v_semana,
    'R15_experimental_sem_desfecho', v_r15,
    'R16_experimental_sem_lancamento', v_r16,
    'R17_faltou_sem_remarcacao', v_r17,
    'total', v_r15 + v_r16 + v_r17);
end;
$function$;

comment on function public.radar_detectar_sinais_comercial_v1() is
  'Detector da fatia COMERCIAL (R15/R16/R17) sobre vw_jornada_lead_v1. Idempotente por chave_dedup. C5/C6 ficam fora de proposito.';

-- ACL: ALTER DEFAULT PRIVILEGES neste schema da `authenticated=arwdDxtm` a toda
-- relacao nova, e recriar funcao reabre EXECUTE para `anon`. Revoke nominal.
revoke all on public.vw_jornada_lead_v1 from public, anon, authenticated;
grant select on public.vw_jornada_lead_v1 to authenticated;

revoke all on function public.radar_detectar_sinais_comercial_v1() from public, anon;
grant execute on function public.radar_detectar_sinais_comercial_v1() to service_role;
