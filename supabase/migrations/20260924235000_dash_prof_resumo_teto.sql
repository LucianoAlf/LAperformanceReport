-- 24/09/2026 — mesma armadilha do health-score: o wrapper com cache de
-- get_dashboard_professores_resumo_canonico_v1 (migration 20260924190000) ficou
-- SEM statement_timeout — o create or replace descartou o teto da migration
-- 20260923220000. Cache TTL de 5min expirava, a recomputacao fria (~10-40s)
-- morria nos 8s do papel authenticated e o cache nunca se reavivava pela API:
-- dashboard travada em 57014. Teto reposto no padrao teto_proprio.

alter function public.get_dashboard_professores_resumo_canonico_v1(integer, integer, uuid, date, date)
  set statement_timeout = '90s';
alter function public.dash_prof_resumo_sem_cache_20260924(integer, integer, uuid, date, date)
  set statement_timeout = '85s';

do $pos$
declare
  v_falhas text[] := '{}';
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_dashboard_professores_resumo_canonico_v1'
      and 'statement_timeout=90s' = any(p.proconfig)
  ) then
    v_falhas := v_falhas || 'wrapper sem teto de 90s';
  end if;
  if array_length(v_falhas, 1) > 0 then
    raise exception E'POS-CONDICAO teto dash_prof_resumo NAO FECHOU:\n  %',
      array_to_string(v_falhas, E'\n  ');
  end if;
  raise notice 'teto dash_prof_resumo ok';
end $pos$;
