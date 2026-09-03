-- Duas correcoes na radar_trafego_canal_v1, ambas por regra declarada pelo
-- Luciano em 03/09:
--
-- (1) "Site Google e a mesma coisa — o time coloca como Google, site e a landing
--     page que roda no Google. Por isso site tem que puxar para dentro do
--     Google." O canal `Site` (66 leads, 0 agendamentos na coorte madura) e a
--     MESMA verba; ler separado esconde metade do desempenho do Google.
--
-- (2) `gasto` NULL era ambiguo: nao distinguia "nao gastamos" de "nao temos o
--     dado". `meta_ads_metricas_diarias` so nasceu em 04/08/2026, entao toda
--     janela madura anterior a isso vem sem custo. `gasto_dias_cobertos` diz
--     quantos dias da janela tem foto de gasto — 0 significa "nao sei".
--
-- ⚠️ DROP+CREATE porque `returns table` mudou de forma. Isso REABRE EXECUTE para
--    `anon` (ALTER DEFAULT PRIVILEGES do schema) — o revoke nominal abaixo nao e
--    opcional. ACL correta: {postgres=X, authenticated=X, service_role=X}.

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
  gasto_meta as (
    select round(sum(m.gasto), 2) total, count(distinct m.dia)::int dias
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
         coalesce(g.dias, 0), (p_dias - p_maturidade_dias)::int,
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

revoke all on function public.radar_trafego_canal_v1(integer,integer) from public, anon;
grant execute on function public.radar_trafego_canal_v1(integer,integer) to authenticated, service_role;

comment on function public.radar_trafego_canal_v1(integer,integer) is
  '2o andar/estrategica. Desempenho por CANAL com coorte madura. `Site` e dobrado em `Google` (regra do Luciano 03/09: e a landing page que roda no Google). gasto NULL com gasto_dias_cobertos=0 significa NAO SABEMOS (Meta so tem foto desde 04/08/2026; Google Ads nao e sincronizado) — nunca "de graca".';
