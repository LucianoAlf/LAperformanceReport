-- Rollback de 20260923210000_corrige_fatura_id_caixa_parcela_errada_recreio
-- Restaura fatura_id para a parcela 10/2026 e a descricao original.

begin;

update caixa_movimentacoes
set fatura_id = '5f9cc14c-38db-460b-bef0-a37cbb22079d',
    descricao = replace(descricao, '09/2026', '10/2026'), updated_at = now()
where id = 'cdd1ae15-03b1-4923-b7de-03a3973afe66'
  and fatura_id = '13368077-2bb4-4694-a9fb-23c545669fcf';

update caixa_movimentacoes
set fatura_id = '14ecdf7f-ed30-4f7b-bbc9-80f6d2caf792',
    descricao = replace(descricao, '09/2026', '10/2026'), updated_at = now()
where id = 'd3e84605-5030-45e1-96f2-d6da6dc07dbe'
  and fatura_id = '2ea61413-22c7-439a-b288-53218843d572';

update caixa_movimentacoes
set fatura_id = (select id from emusys_faturas where emusys_fatura_id = 27198),
    descricao = replace(descricao, '09/2026', '10/2026'), updated_at = now()
where id = '10518476-91a3-4d19-bb84-78e6794cbe6f'
  and fatura_id = '40fe8909-5a3d-4975-a303-5c6cb1ed71ba';

update caixa_movimentacoes
set fatura_id = (select id from emusys_faturas where emusys_fatura_id = 28506),
    descricao = replace(descricao, '09/2026', '10/2026'), updated_at = now()
where id = '3c2a7efd-6151-46e9-ad45-ffa15530760a'
  and fatura_id = 'faf90fdd-57e3-4867-8589-e565d36dffea';

commit;
