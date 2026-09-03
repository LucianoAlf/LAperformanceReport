-- ALICERCE · camadas ESTRATÉGICA + TÁTICA — gêmeo do meta_ads_metricas_diarias.
--
-- PARA QUE EXISTE: em 03/09 medimos que o Google converte MELHOR que o
-- Instagram por lead (3,7% x 2,7%, 1.178 leads -> 43 matriculas na coorte
-- madura) e nao tinhamos NENHUM custo dele — `radar_trafego_canal_v1` devolvia
-- `gasto NULL` para Google, e a pergunta "Google ou Instagram" ficava sem
-- resposta pelo lado do dinheiro. Esta tabela e a memoria do custo.
--
-- ⚠️ GRAO = CAMPANHA, nao anuncio (diferente do Meta, de proposito).
--    Performance Max nao expoe anuncio da mesma forma que Search, e o grao de
--    campanha atravessa TODOS os tipos. O equivalente do PC6 (qual criativo) no
--    Google e termo de busca / palavra-chave, que e outra consulta — fica para
--    a rodada seguinte, declaradamente fora desta.
--
-- ⚠️ `gasto` vem de `metrics.cost_micros` (micros = valor x 1.000.000).
--    Converter na INGESTAO, nunca na leitura: micro vazando para um consumidor
--    vira gasto 1 milhao de vezes maior sem ninguem notar a escala.
--
-- ⚠️ REESCREVE a janela a cada execucao (upsert por dia+campanha). O Google
--    tambem revisa numero (conversoes chegam com atraso por causa da janela de
--    atribuicao) — gravar uma vez e nunca mais congela o numero errado.
--
-- ⚠️ Idempotente por PK. Neste ambiente 1 disparo de cron vira 2-4 execucoes.

create table if not exists public.google_ads_metricas_diarias (
  dia               date  not null,
  campanha_id       text  not null,
  campanha_nome     text,
  canal_tipo        text,               -- SEARCH | PERFORMANCE_MAX | DISPLAY | VIDEO...
  status            text,
  gasto             numeric(12,2) not null default 0,
  impressoes        bigint,
  cliques           bigint,
  ctr               numeric(8,4),
  cpc_medio         numeric(12,4),
  conversoes        numeric(12,2) not null default 0,
  conversoes_todas  numeric(12,2),
  valor_conversoes  numeric(12,2),
  custo_por_conversao numeric(12,4) generated always as
    (case when conversoes > 0 then gasto / conversoes end) stored,
  moeda             text not null default 'BRL',
  conta_id          text,
  capturado_em      timestamptz not null default now(),
  primary key (dia, campanha_id)
);

create index if not exists google_ads_metricas_diarias_dia_idx
  on public.google_ads_metricas_diarias (dia desc);

alter table public.google_ads_metricas_diarias enable row level security;

-- Custo de midia e dado restrito: mesma politica do espelho do Meta.
-- ⚠️ ALTER DEFAULT PRIVILEGES do schema da `authenticated=arwdDxtm` a toda
--    relacao nova — revogar antes de conceder.
revoke all on public.google_ads_metricas_diarias from public, anon, authenticated;
grant select on public.google_ads_metricas_diarias to authenticated;

drop policy if exists google_ads_metricas_diarias_admin_le on public.google_ads_metricas_diarias;
create policy google_ads_metricas_diarias_admin_le
  on public.google_ads_metricas_diarias for select
  to authenticated using ((select public.is_admin()));

comment on table public.google_ads_metricas_diarias is
  'Alicerce/estrategica. Custo diario do Google Ads por CAMPANHA (grao de campanha atravessa Search e Performance Max; anuncio nao). Gemeo de meta_ads_metricas_diarias. Reescrita por janela — o Google revisa conversao por dias. gasto ja vem convertido de cost_micros na ingestao.';
comment on column public.google_ads_metricas_diarias.gasto is
  'Reais. Convertido de metrics.cost_micros (/1e6) na INGESTAO — micro nunca deve vazar para consumidor.';
comment on column public.google_ads_metricas_diarias.conversoes is
  'metrics.conversions (acoes de conversao primarias configuradas na conta). NAO e matricula — matricula so existe cruzando com leads/alunos.';
