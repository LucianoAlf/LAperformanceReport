-- Backfill caixa_movimentacoes.fatura_id: 3 vinculos confirmados pela equipe
-- de Campo Grande na rodada de conciliacao humana (WhatsApp, set/2026).
-- Casos 1:1 somente; compostos de ciclo (Michelle/Gabriel/Levi) continuam
-- sem fatura_id porque a FK e singular — o extrato cobre o vinculo multiplo.
--
--   - Lis Regly de Assis, Canto 06/2026, Pix 397 em 22/06 (CG1)
--   - Hugo Sobrinho Carmo, Bateria 09/2026: metade Pix -> fatura 50665,
--     metade debito -> fatura 50114 (CG6, confirmado pelo time)

begin;

update caixa_movimentacoes
set fatura_id = '3452c73d-2bf9-46de-b17a-6a04da769a60', -- emusys_fatura_id 48234
    updated_at = now()
where id = '6c232537-63f4-442e-bf25-6a81ea3400a4'
  and fatura_id is null;

update caixa_movimentacoes
set fatura_id = '35def5f3-7a42-487d-b216-fdd16d613c32', -- emusys_fatura_id 50665 (pix)
    updated_at = now()
where id = '51e9cf20-1837-4570-9872-eb55861bce33'
  and fatura_id is null
  and forma_pagamento = 'pix';

update caixa_movimentacoes
set fatura_id = '18ab9e11-b244-4af0-aab6-3793aa23a523', -- emusys_fatura_id 50114 (debito)
    updated_at = now()
where id = '559141eb-bfd7-4b55-bf29-4c54cf1c5b63'
  and fatura_id is null
  and forma_pagamento = 'cartao';

do $$
declare v int;
begin
  select count(*) into v from caixa_movimentacoes
  where fatura_id in ('3452c73d-2bf9-46de-b17a-6a04da769a60',
                      '35def5f3-7a42-487d-b216-fdd16d613c32',
                      '18ab9e11-b244-4af0-aab6-3793aa23a523');
  if v <> 3 then
    raise exception 'pos-condicao falhou: esperado 3 movimentacoes vinculadas, achei %', v;
  end if;
end $$;

commit;
