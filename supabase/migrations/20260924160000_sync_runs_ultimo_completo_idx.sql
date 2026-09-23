-- 24/09/2026 — a pagina Faturas de Alunos levava ~5s (max 24s) porque o lookup
-- "ultimo run completo por competencia" varria ~2.5k linhas de sync_runs com
-- heap fetch por linha (stats diziam 50 tuplas; a tabela real tem 8k runs).
-- Este indice cobre exatamente o predicado do lookup (live + succeeded +
-- snapshot_complete + 3 unidades + completed_at) ordenado por competencia e
-- completed_at desc: o row_number() pega o topo via index-only scan.
-- Em producao ja foi criado com CONCURRENTLY; aqui fica IF NOT EXISTS p/
-- paridade de ambientes. O ANALYZE repara as estatisticas zeradas das tabelas
-- do pipeline financeiro (nunca haviam sido analisadas).

create index if not exists sync_runs_ultimo_completo_idx
  on public.sync_runs (competencia, completed_at desc, id desc)
  where run_type = 'live'
    and status = 'succeeded'
    and snapshot_complete is true
    and unidades_concluidas = 3
    and completed_at is not null;

analyze public.sync_runs;
analyze public.sync_run_items;
analyze public.financeiro_emusys_lancamentos;
analyze public.caixa_movimentacoes;

do $pos$
declare
  v_falhas text[] := '{}';
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'sync_runs'
      and indexname = 'sync_runs_ultimo_completo_idx'
  ) then
    v_falhas := v_falhas || 'indice sync_runs_ultimo_completo_idx ausente';
  end if;
  if array_length(v_falhas, 1) > 0 then
    raise exception E'POS-CONDICAO indice sync_runs NAO FECHOU:\n  %',
      array_to_string(v_falhas, E'\n  ');
  end if;
  raise notice 'indice sync_runs_ultimo_completo_idx ok';
end $pos$;
