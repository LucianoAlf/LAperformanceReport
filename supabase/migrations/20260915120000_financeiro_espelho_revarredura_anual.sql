-- Revarredura anual do espelho financeiro Emusys (pedido do Super Folha 2026-09-15).
-- A janela diária cobre só mês corrente + 2 anteriores; mês fechado que a Rose
-- corrigir depois sai do radar. Esta coluna rastreia quando o ano inteiro foi
-- revarrido pela última vez, para o Super Folha saber até quando cada mês antigo
-- foi conferido — distinto da ultima_varredura_completa_em da janela diária.

alter table public.financeiro_emusys_varredura_resumo
  add column if not exists ultima_revarredura_anual_em timestamptz;

comment on column public.financeiro_emusys_varredura_resumo.ultima_revarredura_anual_em is
  'Timestamp da última revarredura do ano corrente inteiro (jan–hoje, dia a dia). Distinto de ultima_varredura_completa_em (que é da janela diária de 3 meses). O Super Folha lê este campo para saber se um mês fora da janela diária já foi conferido.';
