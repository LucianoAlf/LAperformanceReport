-- 2º ANDAR (padrões da REDE) · camadas ESTRATÉGICA + TÁTICA
--
-- PARA QUE EXISTE: o Luciano está cego no tráfego pago — ninguém entrega
-- relatório e a tela de Tráfego Pago só sabe CONVERSA, nunca MATRÍCULA. Estas
-- três RPCs são a fonte determinística que responde, com número:
--   1. qual CRIATIVO traz aluno (não lead, não conversa)
--   2. qual CANAL paga a conta
--   3. quais BASES já existem para reativar sem gastar mídia
--
-- ⚠️ O número sai daqui, não do LLM. A Mila/Sol leem estas RPCs e redigem.
--
-- ⚠️ MATURIDADE: medido em 03/09, a mediana lead→matrícula é 4 dias e o p90 é
-- 37. Coorte com menos de ~35 dias AINDA ESTÁ CONVERTENDO — por isso as duas
-- primeiras devolvem `dias_maturidade`/`cohort_madura`, para que ninguém leia
-- "0 matrículas" onde é só falta de tempo.

-- ── 1) FUNIL POR CRIATIVO ────────────────────────────────────────────────────
create or replace function public.radar_trafego_criativo_v1(
  p_de date default (current_date - 30),
  p_ate date default current_date
) returns table (
  ad_id text, ad_name text, campanha text,
  gasto numeric, conversas bigint, leads bigint,
  agendou bigint, realizou_exp bigint, matriculou bigint,
  custo_conversa numeric, custo_lead numeric,
  custo_agendamento numeric, custo_matricula numeric,
  taxa_agendamento_pct numeric, dias_maturidade int, cohort_madura boolean
) language sql stable security definer set search_path = public as $fn$
  with g as (
    select m.ad_id, max(m.ad_name) ad_name, max(m.campaign_name) campanha,
           round(sum(m.gasto), 2) gasto, sum(m.conversas)::bigint conversas
      from public.meta_ads_metricas_diarias m
     where m.dia between p_de and p_ate
     group by m.ad_id
  ),
  l as (
    select le.meta_ad_source_id ad_id,
           count(*)::bigint leads,
           count(*) filter (where le.experimental_agendada)::bigint agendou,
           count(*) filter (where exists (
             select 1 from public.lead_experimentais x
              where x.lead_id = le.id
                and x.status in ('experimental_realizada','convertido')))::bigint realizou_exp,
           count(*) filter (where le.converteu)::bigint matriculou
      from public.leads le
     where le.meta_ad_source_id is not null
       and (le.created_at at time zone 'America/Sao_Paulo')::date between p_de and p_ate
     group by 1
  )
  select g.ad_id, g.ad_name, g.campanha, g.gasto, g.conversas,
         coalesce(l.leads,0), coalesce(l.agendou,0),
         coalesce(l.realizou_exp,0), coalesce(l.matriculou,0),
         round(g.gasto / nullif(g.conversas,0), 2),
         round(g.gasto / nullif(l.leads,0), 2),
         round(g.gasto / nullif(l.agendou,0), 2),
         round(g.gasto / nullif(l.matriculou,0), 2),
         round(100.0 * coalesce(l.agendou,0) / nullif(l.leads,0), 1),
         (current_date - p_ate)::int,
         (current_date - p_ate) >= 35
    from g left join l using (ad_id)
   where g.gasto > 0
   order by g.gasto desc;
$fn$;

-- ── 2) DESEMPENHO POR CANAL ──────────────────────────────────────────────────
-- ⚠️ Só o Meta tem custo no nosso banco. Google Ads NÃO é sincronizado — por
--    isso `gasto` vem NULL para Google, e NULL aqui quer dizer "não sei",
--    nunca "de graça".
create or replace function public.radar_trafego_canal_v1(
  p_dias int default 180,
  p_maturidade_dias int default 35
) returns table (
  canal text, leads bigint, agendou bigint, realizou_exp bigint,
  matriculas bigint, conv_pct numeric,
  gasto numeric, custo_lead numeric, custo_matricula numeric,
  ltv_estimado numeric, retorno_x numeric
) language sql stable security definer set search_path = public as $fn$
  with janela as (
    select (current_date - p_dias)::date de,
           (current_date - p_maturidade_dias)::date ate
  ),
  base as (
    select coalesce(c.nome, 'SEM ORIGEM') canal, l.id, l.converteu,
           l.experimental_agendada,
           exists (select 1 from public.lead_experimentais x
                    where x.lead_id = l.id
                      and x.status in ('experimental_realizada','convertido')) fez_exp
      from public.leads l
      left join public.canais_origem c on c.id = l.canal_origem_id, janela j
     where (l.created_at at time zone 'America/Sao_Paulo')::date between j.de and j.ate
  ),
  gasto_meta as (
    select round(sum(m.gasto), 2) total
      from public.meta_ads_metricas_diarias m, janela j
     where m.dia between j.de and j.ate
  ),
  ltv as (
    select (percentile_cont(0.5) within group (order by nullif(a.valor_parcela,0))
            * 12.2)::numeric(10,2) v
      from public.alunos a where a.status = 'ativo'
  ),
  agg as (
    select b.canal, count(*)::bigint leads,
           count(*) filter (where b.experimental_agendada)::bigint agendou,
           count(*) filter (where b.fez_exp)::bigint realizou_exp,
           count(*) filter (where b.converteu)::bigint matriculas
      from base b group by b.canal
  )
  select a.canal, a.leads, a.agendou, a.realizou_exp, a.matriculas,
         round(100.0 * a.matriculas / nullif(a.leads,0), 1),
         case when a.canal in ('Instagram','Facebook') then g.total end,
         case when a.canal in ('Instagram','Facebook')
              then round(g.total / nullif(a.leads,0), 2) end,
         case when a.canal in ('Instagram','Facebook')
              then round(g.total / nullif(a.matriculas,0), 2) end,
         (a.matriculas * ltv.v)::numeric(12,2),
         case when a.canal in ('Instagram','Facebook') and g.total > 0
              then round((a.matriculas * ltv.v) / g.total, 1) end
    from agg a, gasto_meta g, ltv
   order by a.matriculas desc;
$fn$;

-- ── 3) PÚBLICOS PRONTOS PARA REATIVAÇÃO (sem gastar mídia) ───────────────────
-- Cada bucket é um público de campanha por template oficial da Meta.
-- ⚠️ Devolve TAMANHO e critério, nunca a lista de telefones — quem dispara é o
--    módulo de Campanhas, com opt-out e janela própria.
create or replace function public.radar_publico_reativacao_v1(
  p_unidade_id uuid default null
) returns table (
  publico text, criterio text, pessoas bigint, temperatura text, ordem int
) language sql stable security definer set search_path = public as $fn$
  with fam as (
    select count(distinct coalesce(nullif(a.responsavel_telefone,''), a.telefone))::bigint n
      from public.alunos a
     where a.status = 'ativo'
       and (p_unidade_id is null or a.unidade_id = p_unidade_id)
       and coalesce(nullif(a.responsavel_telefone,''), a.telefone) is not null
  ),
  exp_sem_mat as (
    select count(distinct l.telefone)::bigint n
      from public.leads l
     where exists (select 1 from public.lead_experimentais x where x.lead_id = l.id
                    and x.status in ('experimental_realizada','convertido'))
       and coalesce(l.converteu,false) = false and l.telefone is not null
       and (p_unidade_id is null or l.unidade_id = p_unidade_id)
       and l.created_at >= current_date - interval '365 days'
  ),
  faltou as (
    select count(distinct l.telefone)::bigint n
      from public.leads l
     where coalesce(l.faltou_experimental,false)
       and coalesce(l.converteu,false) = false and l.telefone is not null
       and (p_unidade_id is null or l.unidade_id = p_unidade_id)
       and l.created_at >= current_date - interval '365 days'
  ),
  ex as (
    select count(distinct coalesce(nullif(a.responsavel_telefone,''), a.telefone))::bigint n
      from public.alunos a
     where a.status in ('evadido','inativo')
       and (p_unidade_id is null or a.unidade_id = p_unidade_id)
       and coalesce(nullif(a.responsavel_telefone,''), a.telefone) is not null
       and not exists (select 1 from public.alunos v where v.status = 'ativo'
                        and v.unidade_id = a.unidade_id and lower(v.nome) = lower(a.nome))
  ),
  frio as (
    select count(distinct l.telefone)::bigint n
      from public.leads l
     where coalesce(l.converteu,false) = false
       and coalesce(l.experimental_agendada,false) = false
       and l.telefone is not null
       and (p_unidade_id is null or l.unidade_id = p_unidade_id)
       and l.created_at >= current_date - interval '365 days'
  )
  select 'experimental_sem_matricula'::text,
         'Fez aula experimental nos ultimos 12 meses e nao matriculou'::text,
         exp_sem_mat.n, 'quente'::text, 1 from exp_sem_mat
  union all
  select 'faltou_experimental',
         'Agendou experimental, faltou e nunca remarcou (12 meses)',
         faltou.n, 'quente', 2 from faltou
  union all
  select 'familias_ativas_indicacao',
         'Familia com aluno ativo — publico de campanha de INDICACAO',
         fam.n, 'quente', 3 from fam
  union all
  select 'ex_alunos', 'Saiu e nao voltou (nenhuma matricula ativa no nome)',
         ex.n, 'morno', 4 from ex
  union all
  select 'lead_nunca_agendou', 'Conversou nos ultimos 12 meses e nunca agendou',
         frio.n, 'frio', 5 from frio
   order by 5;
$fn$;

-- ACL: gasto de midia e dado restrito. `ALTER DEFAULT PRIVILEGES` deste schema
-- abre EXECUTE para `anon` em toda funcao nova — revogar NOMINALMENTE.
do $acl$
declare f text;
begin
  foreach f in array array[
    'radar_trafego_criativo_v1(date,date)',
    'radar_trafego_canal_v1(integer,integer)',
    'radar_publico_reativacao_v1(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $acl$;

comment on function public.radar_trafego_criativo_v1(date,date) is
  '2o andar/estrategica. Funil por CRIATIVO: gasto -> conversa -> lead -> agendamento -> experimental -> matricula. Fonte unica do custo por matricula do Meta. Coorte com <35 dias ainda esta convertendo (cohort_madura=false).';
comment on function public.radar_trafego_canal_v1(integer,integer) is
  '2o andar/estrategica. Desempenho por CANAL com coorte madura. gasto NULL = nao sabemos (Google Ads nao e sincronizado), nunca "de graca".';
comment on function public.radar_publico_reativacao_v1(uuid) is
  '2o andar/tatica. Tamanho dos publicos ja existentes para reativacao por template oficial. Devolve TAMANHO, nunca telefone.';
