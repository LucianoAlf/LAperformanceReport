-- sync_run_items tem 8,4M linhas / 12 GB e todos os indices comecam por run_id.
-- resolver_reconciliacao_fatura busca por (unidade_id, emusys_fatura_id) sem
-- run_id -> seq scan de minutos -> o botao "Registrar decisao" da tela de
-- faturas estourava timeout. Indice criado em producao via CREATE INDEX
-- CONCURRENTLY (porta de sessao 5432); este arquivo registra o objeto para
-- ambientes novos e para o mapa do banco.
create index if not exists sync_run_items_unidade_fatura_idx
  on public.sync_run_items (unidade_id, emusys_fatura_id, created_at desc, canonical_fatura_id desc)
  where emusys_fatura_id is not null;
