-- Corrige lancamentos nao fisicos classificados como cofre e restaura o
-- invariante do dominio: o ambiente cofre representa somente dinheiro fisico.

update public.caixa_movimentacoes
set ambiente = 'venda'
where ambiente = 'cofre'
  and forma_pagamento <> 'dinheiro';

alter table public.caixa_movimentacoes
  drop constraint if exists caixa_movimentacoes_cofre_somente_dinheiro;

alter table public.caixa_movimentacoes
  add constraint caixa_movimentacoes_cofre_somente_dinheiro
  check (ambiente <> 'cofre' or forma_pagamento = 'dinheiro')
  not valid;

alter table public.caixa_movimentacoes
  validate constraint caixa_movimentacoes_cofre_somente_dinheiro;

comment on constraint caixa_movimentacoes_cofre_somente_dinheiro
  on public.caixa_movimentacoes is
  'Caixa-cofre representa dinheiro fisico; Pix, cartao e demais recebimentos pertencem ao ambiente venda.';
