-- Fonte UNICA de "quanto gastamos em midia por dia, por plataforma".
-- Existe para nao haver duas somas de gasto no projeto: quem precisar do custo
-- le daqui, nao das tabelas cruas. (Duas fontes de escrita com regras proprias
-- para o mesmo numero foi a causa-raiz das duplicatas de renovacao.)
--
-- ⚠️ `security_invoker = false` de proposito: as duas tabelas base sao
--    restritas a admin, e a view precisa alcanca-las. A ACL da propria view e
--    quem limita — por isso o revoke/grant explicito abaixo.
create or replace view public.vw_ads_gasto_diario_v1
with (security_invoker = false) as
  select m.dia, 'meta'::text as plataforma,
         m.campaign_id  as campanha_id,
         m.campaign_name as campanha_nome,
         null::text     as canal_tipo,
         m.gasto,
         m.impressoes, m.cliques,
         m.conversas::numeric as conversoes_plataforma,
         m.moeda
    from public.meta_ads_metricas_diarias m
  union all
  select g.dia, 'google'::text,
         g.campanha_id, g.campanha_nome, g.canal_tipo,
         g.gasto, g.impressoes, g.cliques, g.conversoes, g.moeda
    from public.google_ads_metricas_diarias g;

revoke all on public.vw_ads_gasto_diario_v1 from public, anon, authenticated;
grant select on public.vw_ads_gasto_diario_v1 to authenticated;

comment on view public.vw_ads_gasto_diario_v1 is
  'Alicerce/estrategica. Gasto diario de midia unificado (meta + google). FONTE UNICA do custo — nao somar as tabelas cruas em consumidor novo. ⚠️ `conversoes_plataforma` NAO e comparavel entre plataformas: no Meta e conversa iniciada no WhatsApp, no Google e a acao de conversao configurada na conta. Serve para acompanhar cada uma contra ela mesma, nunca para ranquear uma contra a outra.';

-- ── radar_trafego_canal_v1: passa a enxergar o custo do Google ───────────────
drop function if exists public.radar_trafego_canal_v1(integer, integer);

create function public.radar_trafego_canal_v1(
  p_dias int default 180,
  p_maturidade_dias int default 35
) returns table (
  canal text, leads bigint, agendou bigint, realizou_exp bigint,
  matriculas bigint, conv_pct numeric,
  gasto numeric, gasto_dias_cobertos int, janela_dias int,
  custo_lead numeric, custo_matricula numeric,
  ltv_estimado numeric, retorno_x numeric
) language sql stable security definer set search_path = public as $fn$
  with janela as (
    select (current_date - p_dias)::date de,
           (current_date - p_maturidade_dias)::date ate
  ),
  base as (
    -- `Site` e a landing page que roda no Google (regra do Luciano, 03/09)
    select case when coalesce(c.nome,'SEM ORIGEM') = 'Site' then 'Google'
                else coalesce(c.nome,'SEM ORIGEM') end canal,
           l.id, l.converteu, l.experimental_agendada,
           exists (select 1 from public.lead_experimentais x
                    where x.lead_id = l.id
                      and x.status in ('experimental_realizada','convertido')) fez_exp
      from public.leads l
      left join public.canais_origem c on c.id = l.canal_origem_id, janela j
     where (l.created_at at time zone 'America/Sao_Paulo')::date between j.de and j.ate
  ),
  -- gasto por PLATAFORMA na mesma janela, da fonte unica
  gasto as (
    select v.plataforma, round(sum(v.gasto),2) total, count(distinct v.dia)::int dias
      from public.vw_ads_gasto_diario_v1 v, janela j
     where v.dia between j.de and j.ate
     group by v.plataforma
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
  ),
  -- de qual plataforma cada canal cobra o custo (canal sem midia paga = null)
  liga as (
    select a.*, case when a.canal in ('Instagram','Facebook') then 'meta'
                     when a.canal = 'Google' then 'google' end plataforma
      from agg a
  )
  select l.canal, l.leads, l.agendou, l.realizou_exp, l.matriculas,
         round(100.0 * l.matriculas / nullif(l.leads,0), 1),
         g.total, coalesce(g.dias, 0), (p_dias - p_maturidade_dias)::int,
         round(g.total / nullif(l.leads,0), 2),
         round(g.total / nullif(l.matriculas,0), 2),
         (l.matriculas * ltv.v)::numeric(12,2),
         case when g.total > 0 then round((l.matriculas * ltv.v) / g.total, 1) end
    from liga l
    left join gasto g on g.plataforma = l.plataforma
    cross join ltv
   order by l.matriculas desc;
$fn$;

revoke all on function public.radar_trafego_canal_v1(integer,integer) from public, anon;
grant execute on function public.radar_trafego_canal_v1(integer,integer) to authenticated, service_role;

comment on function public.radar_trafego_canal_v1(integer,integer) is
  '2o andar/estrategica. Desempenho por CANAL com coorte madura. `Site` e dobrado em `Google` (landing page que roda no Google). Custo vem de vw_ads_gasto_diario_v1 (meta+google). gasto NULL com gasto_dias_cobertos=0 significa NAO SABEMOS naquela janela — nunca "de graca".';
