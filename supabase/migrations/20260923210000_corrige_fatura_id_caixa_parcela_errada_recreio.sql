-- Corrige fatura_id de 4 entradas do caixa do Recreio apontando para a
-- parcela 10/2026 (aberta) quando o Pix quitou a parcela 09/2026.
-- Confirmado pela equipe do Recreio na rodada de conciliacao (set/2026)
-- e pelo espelho Emusys (valor + data_pagamento batem em 09/2026).
-- Sem correcao: 09/2026 fica sem prova de pagamento no caixa e 10/2026
-- ganha prova espuria — quebra a reconciliacao nos dois lados.
-- Descricao tambem corrigida (audit_log preserva o texto original).

begin;

-- Calebe de Moura, Bateria: Pix 363,84 em 03/09 quitou 25909 (09/2026)
update caixa_movimentacoes
set fatura_id = '13368077-2bb4-4694-a9fb-23c545669fcf',
    descricao = replace(descricao, '10/2026', '09/2026'),
    updated_at = now()
where id = 'cdd1ae15-03b1-4923-b7de-03a3973afe66'
  and fatura_id = '5f9cc14c-38db-460b-bef0-a37cbb22079d'; -- era 25910 (10/2026)

-- Mariana Albuquerque, Violino: Pix 388,50 em 08/09 quitou 25636 (09/2026)
update caixa_movimentacoes
set fatura_id = '2ea61413-22c7-439a-b288-53218843d572',
    descricao = replace(descricao, '10/2026', '09/2026'),
    updated_at = now()
where id = 'd3e84605-5030-45e1-96f2-d6da6dc07dbe'
  and fatura_id = '14ecdf7f-ed30-4f7b-bbc9-80f6d2caf792'; -- era 25637 (10/2026)

-- Fernando Maciel, Bateria: Pix 420 em 05/09 quitou 27197 (09/2026)
update caixa_movimentacoes
set fatura_id = '40fe8909-5a3d-4975-a303-5c6cb1ed71ba',
    descricao = replace(descricao, '10/2026', '09/2026'),
    updated_at = now()
where id = '10518476-91a3-4d19-bb84-78e6794cbe6f'
  and fatura_id = (select id from emusys_faturas where emusys_fatura_id = 27198);

-- Maria Cecilia Muniz, Canto: Pix 405 em 05/09 quitou 28505 (09/2026)
update caixa_movimentacoes
set fatura_id = 'faf90fdd-57e3-4867-8589-e565d36dffea',
    descricao = replace(descricao, '10/2026', '09/2026'),
    updated_at = now()
where id = '3c2a7efd-6151-46e9-ad45-ffa15530760a'
  and fatura_id = (select id from emusys_faturas where emusys_fatura_id = 28506);

do $$
declare v int;
begin
  select count(*) into v from caixa_movimentacoes
  where fatura_id in ('13368077-2bb4-4694-a9fb-23c545669fcf',
                      '2ea61413-22c7-439a-b288-53218843d572',
                      '40fe8909-5a3d-4975-a303-5c6cb1ed71ba',
                      'faf90fdd-57e3-4867-8589-e565d36dffea');
  if v <> 4 then
    raise exception 'pos-condicao falhou: esperado 4 correcoes, achei %', v;
  end if;
  -- nenhuma das 4 entradas pode continuar apontando p/ fatura de 10/2026
  select count(*) into v from caixa_movimentacoes m
  join emusys_faturas f on f.id = m.fatura_id
  where m.id in ('cdd1ae15-03b1-4923-b7de-03a3973afe66','d3e84605-5030-45e1-96f2-d6da6dc07dbe',
                 '10518476-91a3-4d19-bb84-78e6794cbe6f','3c2a7efd-6151-46e9-ad45-ffa15530760a')
    and f.competencia <> '2026-09-01';
  if v <> 0 then
    raise exception 'pos-condicao falhou: % entradas seguem fora de 09/2026', v;
  end if;
end $$;

commit;
