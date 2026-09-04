-- 🔒 FURO FECHADO (03/09): `radar_trafego_criativo_v1` e `radar_trafego_canal_v1`
-- nasceram `SECURITY DEFINER` com `grant execute to authenticated` — ou seja,
-- QUALQUER usuario logado (inclusive ADM de unidade) podia ler o gasto de midia
-- da rede inteira chamando a RPC direto pelo PostgREST. O modulo Trafego Pago
-- tem 3 camadas de restricao (guard de rota, filtro no menu e gate de e-mail
-- dentro da edge `meta-ads-insights`) exatamente porque custo de midia e
-- restrito — e eu abri um caminho que passa por fora das tres.
--
-- ⚠️ SECURITY DEFINER nao e alcancado por RLS: a policy `is_admin()` das duas
--    tabelas de metricas NAO protege quem chega pela RPC. O guard tem que estar
--    DENTRO da funcao. (Mesma armadilha ja documentada no CLAUDE.md para as 213
--    RPCs que confiam no `p_unidade_id` do front.)
--
-- ⚠️ Passaram de `language sql` para `plpgsql` por causa do guard. `plpgsql` +
--    RETURN QUERY e ESTRITO no tipo: `canais_origem.nome` e varchar e precisou de
--    cast explicito para text — a versao `sql` coagia em silencio. Pego pelo
--    proprio banco na 1a chamada, nao em revisao de codigo.
--
-- ⚠️ O gate e `is_admin()` (9 admins), deliberadamente MAIS LARGO que o gate de
--    2 e-mails da pagina de Trafego Pago. Escolhido para casar com a RLS das
--    proprias tabelas e nao espalhar e-mail hardcoded em SQL. Se precisar
--    apertar, o lugar e aqui — nao no front.
--
-- ⚠️ `radar_publico_reativacao_v1` fica FORA do gate de proposito: devolve
--    tamanho de publico, nao dinheiro, e serve ao time comercial.
--
-- Validado nos 3 perfis: service_role 10 linhas, admin 10 linhas, usuario de
-- unidade BARRADO com 42501.

CREATE OR REPLACE FUNCTION public.radar_trafego_canal_v1(p_dias integer DEFAULT 180, p_maturidade_dias integer DEFAULT 35)
 RETURNS TABLE(canal text, leads bigint, agendou bigint, realizou_exp bigint, matriculas bigint, conv_pct numeric, gasto numeric, gasto_dias_cobertos integer, janela_dias integer, custo_lead numeric, custo_matricula numeric, ltv_estimado numeric, retorno_x numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (current_user in ('service_role','postgres') or public.is_admin()) then
    raise exception 'acesso_restrito_custo_de_midia' using errcode = '42501';
  end if;
  return query
  with janela as (
    select (current_date - p_dias)::date de,
           (current_date - p_maturidade_dias)::date ate
  ),
  base as (
    select (case when coalesce(c.nome,'SEM ORIGEM') = 'Site' then 'Google'
                 else coalesce(c.nome,'SEM ORIGEM') end)::text canal,
           l.id, l.converteu, l.experimental_agendada,
           exists (select 1 from public.lead_experimentais x
                    where x.lead_id = l.id
                      and x.status in ('experimental_realizada','convertido')) fez_exp
      from public.leads l
      left join public.canais_origem c on c.id = l.canal_origem_id, janela j
     where (l.created_at at time zone 'America/Sao_Paulo')::date between j.de and j.ate
  ),
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
  liga as (
    select a.*, (case when a.canal in ('Instagram','Facebook') then 'meta'
                      when a.canal = 'Google' then 'google' end)::text plataforma
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
end;
$function$
;

CREATE OR REPLACE FUNCTION public.radar_trafego_criativo_v1(p_de date DEFAULT (CURRENT_DATE - 30), p_ate date DEFAULT CURRENT_DATE)
 RETURNS TABLE(ad_id text, ad_name text, campanha text, gasto numeric, conversas bigint, leads bigint, agendou bigint, realizou_exp bigint, matriculou bigint, custo_conversa numeric, custo_lead numeric, custo_agendamento numeric, custo_matricula numeric, taxa_agendamento_pct numeric, dias_maturidade integer, cohort_madura boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (current_user in ('service_role','postgres') or public.is_admin()) then
    raise exception 'acesso_restrito_custo_de_midia' using errcode = '42501';
  end if;
  return query
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
end;
$function$
;

revoke all on function public.radar_trafego_criativo_v1(date,date) from public, anon;
grant execute on function public.radar_trafego_criativo_v1(date,date) to authenticated, service_role;
revoke all on function public.radar_trafego_canal_v1(integer,integer) from public, anon;
grant execute on function public.radar_trafego_canal_v1(integer,integer) to authenticated, service_role;
