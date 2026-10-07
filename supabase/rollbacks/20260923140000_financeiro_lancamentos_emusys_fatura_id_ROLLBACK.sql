-- ROLLBACK de 20260923140000_financeiro_lancamentos_emusys_fatura_id.sql
-- Remove a coluna emusys_fatura_id e o indice parcial.
-- O campo continua existindo dentro de payload (jsonb cru da API): nada se perde.

drop index if exists public.financeiro_lancamentos_fatura_idx;

alter table public.financeiro_emusys_lancamentos
  drop column if exists emusys_fatura_id;
