-- ROLLBACK de 20260930090000_caixa_trava_cheque_duplicado_NAO_APLICADA.sql
-- Remove a trava; não toca em dados. Rodar só se a trava tiver sido aplicada.
begin;
drop trigger if exists trg_caixa_trava_cheque_duplicado on public.caixa_movimentacoes;
drop function if exists public.caixa_trava_cheque_duplicado_v1();
drop index if exists public.idx_caixa_mov_cheque_unidade;
commit;
