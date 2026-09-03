-- A3 do Mapa de Sinais — ALICERCE da vertical COMERCIAL (Mila + consultoras).
--
-- Uma linha por lead, com a história inteira: por onde entrou, quem falou com
-- ele, se fez experimental, e no que deu.
--
-- ⚠️ POR QUE NÃO USEI `vw_leads_comercial`, que tem 50 colunas e parece a
-- jornada: a última linha dela é
--     WHERE l.status <> 'convertido' OR l.status IS NULL
-- Ela EXCLUI os convertidos por construção — é a lista de trabalho do comercial,
-- não a jornada. Foi assim que medi `converteu = 0` em 2.491 leads de 90 dias
-- enquanto `leads` mostrava **211 conversões no mesmo período**, a última no
-- próprio dia. Sem o desfecho não há aprendizado: o 2º andar precisa saber em
-- que os leads deram.
--
-- ⚠️ A ETAPA É DERIVADA DE FATO, NUNCA DE `leads.status`. O vocabulário de
-- status derivou: a `vw_leads_comercial` faz CASE sobre
-- ('novo','em_contato','agendado','realizado','convertido','arquivado','perdido')
-- e o que existe hoje em 90 dias é
-- ('novo','experimental_agendada','experimental_realizada','experimental_faltou',
--  'convertido','visita_escola') — quatro deles caem no ELSE e viram 'lead'.
-- Derivar dos marcos (datas e booleanos) é imune a isso.

create or replace view public.vw_jornada_lead_v1 as
with exp as (
  -- experimental REAL (1 linha por aula em lead_experimentais), agregada
  select le.lead_id,
         count(*)                                              as aulas_experimentais,
         min(le.data_experimental)                             as primeira_experimental,
         max(le.data_experimental)                             as ultima_experimental,
         count(*) filter (where le.status in ('experimental_realizada','convertido')) as exp_realizadas,
         count(*) filter (where le.status = 'experimental_faltou')                    as exp_faltas
  from public.lead_experimentais le
  where le.lead_id is not null
  group by le.lead_id
),
camp as (
  select lc.lead_id,
         min(lc.created_at)                        as primeira_campanha_em,
         string_agg(distinct lc.campanha_nome, ' | ') as campanhas
  from public.leads_campanhas lc
  group by lc.lead_id
),
insta as (
  -- sessão da bridge de Instagram casada por telefone (chave canônica)
  select s.telefone_chave,
         min(s.iniciada_em)                          as ig_primeira_em,
         max(s.ultima_atividade_em)                  as ig_ultima_em,
         bool_or(s.transferido)                      as ig_transferido,
         (array_agg(s.conta      order by s.ultima_atividade_em desc))[1] as ig_conta,
         (array_agg(s.estagio    order by s.ultima_atividade_em desc))[1] as ig_estagio,
         (array_agg(s.interesse  order by s.ultima_atividade_em desc))[1] as ig_interesse
  from public.instagram_sessoes s
  where s.telefone_chave is not null
  group by s.telefone_chave
)
select
  l.id                                   as lead_id,
  l.nome,
  l.telefone,
  public.fn_normalizar_telefone_br_key(l.telefone) as telefone_chave,
  l.unidade_id,
  u.nome                                 as unidade_nome,
  l.curso_interesse_id,
  cur.nome                               as curso_interesse,

  -- ─── por onde entrou ───────────────────────────────────────────────────────
  co.nome                                as canal_origem,
  l.meta_ad_source_id,
  ads.ad_name                            as anuncio,
  ads.campaign_name                      as campanha_meta,
  camp.campanhas                         as campanhas_whatsapp,
  ins.ig_conta                           as instagram_conta,
  ins.ig_interesse                       as instagram_interesse,
  ins.ig_estagio                         as instagram_estagio,
  ins.ig_transferido                     as instagram_transferido,

  -- ─── marcos ────────────────────────────────────────────────────────────────
  coalesce(l.data_contato, l.created_at::date)     as entrou_em,
  l.data_primeiro_contato                          as primeiro_contato_em,
  l.data_passagem_mila                             as passagem_mila_em,
  l.data_experimental                              as experimental_agendada_para,
  exp.primeira_experimental                        as experimental_real_em,
  l.data_conversao                                 as convertido_em,
  l.data_arquivamento                              as arquivado_em,
  l.data_ultimo_contato                            as ultimo_contato_em,

  -- ─── etapa: DERIVADA DE FATO, não de `status` ──────────────────────────────
  case
    when l.converteu                              then 'convertido'
    when l.status = 'arquivado'
      or l.data_arquivamento is not null           then 'perdido'
    when coalesce(exp.exp_realizadas,0) > 0
      or l.experimental_realizada                  then 'experimental_realizada'
    when l.faltou_experimental
      or coalesce(exp.exp_faltas,0) > 0            then 'experimental_faltou'
    when l.experimental_agendada
      or l.data_experimental is not null           then 'experimental_agendada'
    when l.data_primeiro_contato is not null       then 'em_atendimento'
    else                                                'novo'
  end                                              as etapa,

  -- ─── tempos ────────────────────────────────────────────────────────────────
  (l.data_primeiro_contato - coalesce(l.data_contato, l.created_at::date))
                                                   as dias_ate_primeiro_contato,
  ((now() at time zone 'America/Sao_Paulo')::date
    - greatest(
        coalesce(l.data_ultimo_contato,  '-infinity'::date),
        coalesce(l.data_primeiro_contato,'-infinity'::date),
        coalesce(l.data_experimental,    '-infinity'::date),
        coalesce(l.data_contato,         '-infinity'::date),
        coalesce(l.created_at::date,     '-infinity'::date)
      ))::int                                      as dias_parado,
  ((now() at time zone 'America/Sao_Paulo')::date
    - coalesce(l.data_contato, l.created_at::date))::int as dias_no_funil,

  -- ─── experimental real ─────────────────────────────────────────────────────
  coalesce(exp.aulas_experimentais, 0)   as aulas_experimentais,
  coalesce(exp.exp_realizadas, 0)        as experimentais_realizadas,
  coalesce(exp.exp_faltas, 0)            as experimentais_faltou,
  prof.nome                              as professor_experimental,

  -- ─── desfecho ──────────────────────────────────────────────────────────────
  l.converteu,
  l.aluno_id,
  l.motivo_nao_matricula,
  l.temperatura,
  l.agente_comercial,
  l.status                               as status_bruto,
  l.created_at
from public.leads l
left join public.unidades          u    on u.id   = l.unidade_id
left join public.canais_origem     co   on co.id  = l.canal_origem_id
left join public.cursos            cur  on cur.id = l.curso_interesse_id
left join public.professores       prof on prof.id = l.professor_experimental_id
left join public.meta_ads_cache    ads  on ads.source_id = l.meta_ad_source_id
left join exp                           on exp.lead_id = l.id
left join camp                          on camp.lead_id = l.id
left join insta ins on ins.telefone_chave = public.fn_normalizar_telefone_br_key(l.telefone);

comment on view public.vw_jornada_lead_v1 is
  'Jornada COMPLETA do lead (inclui convertidos, ao contrario de vw_leads_comercial, que os exclui no WHERE). Etapa DERIVADA dos marcos, nunca de leads.status — o vocabulario de status derivou e quatro valores vivos caem no ELSE da view antiga. Espinha da fatia comercial do Mapa de Sinais.';

-- ACL: ALTER DEFAULT PRIVILEGES da `authenticated=arwdDxtm` a toda relacao nova.
revoke all on public.vw_jornada_lead_v1 from public, anon, authenticated;
grant select on public.vw_jornada_lead_v1 to authenticated;
