-- T3 do checkpoint de 03/09 — ALICERCE (camadas estrategica + tatica).
--
-- O Trafego Pago e 100% AO VIVO: o numero de gasto de hoje deixa de existir
-- amanha, e a matricula acontece semanas depois. Consequencia medida: o 2o andar
-- sabia qual criativo traz CONVERSA e NUNCA saberia qual traz MATRICULA.
--
-- Esta tabela e a memoria que faltava: uma linha por (dia, anuncio). Grao diario
-- porque e o menor que a Graph API entrega estavel (time_increment=1) e porque a
-- decisao ("pauso este criativo?") e diaria.
--
-- ⚠️ NAO substitui a leitura ao vivo: a tela continua chamando
-- `meta-ads-insights`. Isto e para o APRENDIZADO (2o andar).
-- ⚠️ `conversas` = onsite_conversion.messaging_conversation_started_7d, a MESMA
-- acao da edge de leitura. Dois numeros com o mesmo nome e origens diferentes e
-- o padrao que gerou as duplicatas de renovacao neste projeto.
-- ⚠️ Custo por MATRICULA NAO mora aqui: nasce do cruzamento
-- ad_id -> leads.meta_ad_source_id -> converteu (vw_jornada_lead_v1), e mudaria
-- toda vez que um lead antigo converte. Guardar seria congelar numero vivo.

create table if not exists public.meta_ads_metricas_diarias (
  dia               date        not null,
  ad_id             text        not null,
  ad_name           text,
  campaign_id       text,
  campaign_name     text,
  adset_id          text,
  adset_name        text,
  gasto             numeric(12,2) not null default 0,
  impressoes        bigint      not null default 0,
  cliques           bigint      not null default 0,
  ctr               numeric(8,4),
  cpm               numeric(12,4),
  alcance           bigint,
  frequencia        numeric(8,4),
  conversas         integer     not null default 0,
  custo_por_conversa numeric(12,4)
    generated always as (case when conversas > 0 then gasto / conversas end) stored,
  moeda             text        not null default 'BRL',
  capturado_em      timestamptz not null default now(),
  primary key (dia, ad_id)
);

comment on table public.meta_ads_metricas_diarias is
  'Memoria diaria por anuncio do Meta Ads. Existe porque o Trafego Pago e 100% ao vivo e sem historico o 2o andar nunca sabe qual criativo traz lead que MATRICULA. Nao substitui a leitura ao vivo.';
comment on column public.meta_ads_metricas_diarias.custo_por_conversa is
  'GERADA. Custo por MATRICULA nao mora aqui: nasce do cruzamento ad_id -> leads.meta_ad_source_id -> converteu.';

create index if not exists idx_meta_ads_metricas_dia on public.meta_ads_metricas_diarias (dia desc);
create index if not exists idx_meta_ads_metricas_ad  on public.meta_ads_metricas_diarias (ad_id, dia desc);

alter table public.meta_ads_metricas_diarias enable row level security;

-- ACL: ALTER DEFAULT PRIVILEGES da `authenticated=arwdDxtm` a toda relacao nova.
-- Custo de midia e sensivel (a edge de leitura tem gate por e-mail) — leitura so
-- para admin, escrita so para service_role.
revoke all on public.meta_ads_metricas_diarias from public, anon, authenticated;
grant select on public.meta_ads_metricas_diarias to authenticated;

drop policy if exists meta_ads_metricas_leitura_admin on public.meta_ads_metricas_diarias;
create policy meta_ads_metricas_leitura_admin on public.meta_ads_metricas_diarias
  for select to authenticated
  using ((select public.is_admin()));
