-- Teto de tempo proprio para as RPCs da pagina inicial (Dashboard).
--
-- POR QUE: o papel `authenticator` impoe statement_timeout = 8s e toda sessao do
-- PostgREST o herda. Em 23/09 a Dashboard morreu em cascata: um CREATE INDEX
-- CONCURRENTLY em sync_run_items (8 GB, ~50 min varrendo a tabela) saturou o
-- compute e TUDO estourou 57014 -- incluindo select trivial em metas_kpi (160 kB)
-- e conversas_campanha (608 kB). Depois que o indice terminou, restaram os
-- gargalos intrinsecos, medidos com o banco em repouso:
--   * get_kpis_alunos_canonicos consolidado .... ~30-55s (por unidade ~2,2s)
--   * get_health_score_..._snapshot_v3 ........ ~6,5s quente / 18-48s frio
--   * get_kpis_comercial_canonicos_v2 (1 mes) . ~2,7s -- e o front dispara 12 em
--     paralelo (um por mes), derrubando uns aos outros sob concorrencia
--   * fn_novidades_na_hora .................... ~0,8s em repouso, mas somou 149
--     timeouts 57014 no dia (LA Teacher tambem e' cara visivel)
--
-- ⚠️ ARMADILHA ESPECIFICA do health-score: o cache de 30 min criado em
--    20260924180000 (health_score_v3_reader_cache) NUNCA esquenta pela API --
--    a chamada fria precisa de ~20-50s p/ computar e gravar, e morre nos 8s
--    antes do INSERT. Por isso o card "Health Score parcial" vive em "Sem base".
--    Com teto proprio a primeira chamada paga o custo frio, grava o cache e as
--    seguintes ficam instantaneas ate o TTL/materializacao nova.
--
-- ⚠️ base_ticket_denominador_v1 JA TINHA teto proprio de 15s -- e isso estrangula
--    a cadeia: o SET re-arma o timer do statement quando a funcao entra, entao
--    todo o trabalho interno (v131 -> p01t -> p01q + loop financeiro/tempo/
--    vinculos por unidade) fica preso numa janela de 15s. Subimos para 60s.
--
-- ⚠️ Isto NAO baratea a leitura -- troca "500 + spinner infinito" por "a tela
--    demora mais na primeira carga". O custo intrinseco segue aberto como frente
--    propria (snapshot/cache canonico para get_kpis_alunos_canonicos, no mesmo
--    modelo do situacao_alunos / faturas / health-score) e a rajada de 12
--    chamadas paralelas do comercial merece uma RPC de range.
--
-- ⚠️ Por FUNCAO, nunca no papel: os 8s do `authenticator` sao guard-rail contra
--    query de usuario descontrolada e continuam valendo p/ todo o resto. Mesmo
--    padrao das migrations 20260828210500, 20260914234500 e 20260922213500.

alter function public.get_kpis_alunos_canonicos(uuid, integer, integer)
  set statement_timeout = '90s';

alter function public.get_kpis_alunos_canonicos_base_ticket_denominador_v1(uuid, integer, integer)
  set statement_timeout = '60s';

alter function public.aplicar_denominador_ticket_kpis_v1(jsonb, uuid, integer, integer)
  set statement_timeout = '45s';

alter function public.get_kpis_comercial_canonicos_v2(uuid, integer, integer, text, date)
  set statement_timeout = '30s';

alter function public.get_health_score_professor_v3_performance_snapshot_v3(date, uuid, text)
  set statement_timeout = '90s';

alter function public.hs_prof_v3_reader_sem_cache_20260924(date, uuid, text)
  set statement_timeout = '75s';

alter function public.fn_novidades_na_hora(integer, boolean)
  set statement_timeout = '30s';

-- Guarda: se alguma nao ficou com o teto esperado, a migration falha em vez de
-- passar calada.
do $$
declare faltando text;
begin
  select string_agg(p.proname || '=' || coalesce(cfg.c, 'nada'), ', ') into faltando
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral (
    select c from unnest(coalesce(p.proconfig, '{}')) as c
    where c like 'statement_timeout=%' limit 1
  ) cfg
  where n.nspname = 'public'
    and (
      (p.proname = 'get_kpis_alunos_canonicos' and cfg.c <> 'statement_timeout=90s')
      or (p.proname = 'get_kpis_alunos_canonicos_base_ticket_denominador_v1' and cfg.c <> 'statement_timeout=60s')
      or (p.proname = 'aplicar_denominador_ticket_kpis_v1' and cfg.c <> 'statement_timeout=45s')
      or (p.proname = 'get_kpis_comercial_canonicos_v2' and cfg.c <> 'statement_timeout=30s')
      or (p.proname = 'get_health_score_professor_v3_performance_snapshot_v3' and cfg.c <> 'statement_timeout=90s')
      or (p.proname = 'hs_prof_v3_reader_sem_cache_20260924' and cfg.c <> 'statement_timeout=75s')
      or (p.proname = 'fn_novidades_na_hora' and cfg.c <> 'statement_timeout=30s')
    );
  if faltando is not null then
    raise exception 'statement_timeout nao aplicado como esperado em: %', faltando;
  end if;
end $$;
