-- Teto do get_kpis_turmas_canonicos_v2: o leitor renomeado herdou 30s,
-- mas o compute frio sob carga passa de 60s (medido 65s) — miss morria
-- antes de gravar o cache e a pagina Alunos recebia 500. Mesmo padrao
-- do repo: wrapper 90s, leitor 85s.

alter function public.get_kpis_turmas_canonicos_v2(integer, integer, uuid, date, date)
  set statement_timeout = '90s';

alter function public.kpis_turmas_canonicos_v2_sem_cache_20260925(integer, integer, uuid, date, date)
  set statement_timeout = '85s';
