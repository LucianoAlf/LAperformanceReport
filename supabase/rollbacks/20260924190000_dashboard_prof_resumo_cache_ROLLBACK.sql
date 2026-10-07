-- Rollback: remove wrapper cacheado e devolve o nome original ao leitor.

drop function if exists public.get_dashboard_professores_resumo_canonico_v1(integer, integer, uuid, date, date);

alter function public.dash_prof_resumo_sem_cache_20260924(integer, integer, uuid, date, date)
  rename to get_dashboard_professores_resumo_canonico_v1;

revoke all on function public.get_dashboard_professores_resumo_canonico_v1(integer, integer, uuid, date, date) from public, anon;
grant execute on function public.get_dashboard_professores_resumo_canonico_v1(integer, integer, uuid, date, date) to authenticated, service_role;

drop table if exists public.dash_prof_resumo_cache;
drop type if exists public.dash_prof_resumo_row;
