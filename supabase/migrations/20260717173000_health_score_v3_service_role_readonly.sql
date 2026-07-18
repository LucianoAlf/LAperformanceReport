-- Gate 5: default ACL do Supabase concede DML ao service_role em tabelas novas.
-- A escrita V3 deve ocorrer exclusivamente pelas RPCs SECURITY DEFINER.

revoke insert, update, delete, truncate, references, trigger
  on table public.health_score_professor_v3_config_versoes
  from service_role;
revoke insert, update, delete, truncate, references, trigger
  on table public.health_score_professor_v3_config_metricas
  from service_role;
revoke insert, update, delete, truncate, references, trigger
  on table public.health_score_professor_v3_snapshots
  from service_role;
revoke insert, update, delete, truncate, references, trigger
  on table public.health_score_professor_v3_snapshot_metricas
  from service_role;

grant select
  on table public.health_score_professor_v3_config_versoes to service_role;
grant select
  on table public.health_score_professor_v3_config_metricas to service_role;
grant select
  on table public.health_score_professor_v3_snapshots to service_role;
grant select
  on table public.health_score_professor_v3_snapshot_metricas to service_role;
