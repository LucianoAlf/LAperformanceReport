-- O enriquecimento set-based cruza cada item financeiro pela identidade
-- canônica. Sem este índice o PostgreSQL fazia Seq Scan em toda
-- sync_run_items no consolidado e a RPC ultrapassava o statement_timeout do
-- papel autenticado.
create index if not exists sync_run_items_canonical_fatura_idx
  on public.sync_run_items (canonical_fatura_id, created_at desc, id desc)
  where canonical_fatura_id is not null;

-- Mantém o fallback eficiente para snapshots antigos que ainda não possuem
-- canonical_fatura_id.
create index if not exists sync_run_items_unidade_fatura_idx
  on public.sync_run_items (unidade_id, emusys_fatura_id, created_at desc, id desc)
  where emusys_fatura_id is not null;
