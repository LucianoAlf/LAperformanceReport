-- Rollback: derruba o wrapper cacheado e devolve o nome original ao leitor.

drop function if exists public.get_health_score_professor_v3_performance_snapshot_v3(date, uuid, text);

alter function public.hs_prof_v3_reader_sem_cache_20260924(date, uuid, text)
  rename to get_health_score_professor_v3_performance_snapshot_v3;

revoke all on function public.get_health_score_professor_v3_performance_snapshot_v3(date, uuid, text) from public, anon;
grant execute on function public.get_health_score_professor_v3_performance_snapshot_v3(date, uuid, text) to authenticated, service_role;

drop table if exists public.health_score_v3_reader_cache;
drop type if exists public.hsf_v3_reader_row;
