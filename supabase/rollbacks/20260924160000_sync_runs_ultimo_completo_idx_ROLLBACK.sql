-- Rollback: remove o indice do lookup do ultimo run completo.
drop index if exists public.sync_runs_ultimo_completo_idx;
