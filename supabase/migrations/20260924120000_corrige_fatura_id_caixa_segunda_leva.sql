-- Corrige segunda leva de caixa_movimentacoes linkadas a fatura errada.
-- Padrao: a entrada aponta a parcela seguinte em aberto (ou fatura errada de categoria)
-- enquanto o Pix quitou outra fatura (paga, valor e data exatos).
-- Confirmado por auditoria cruzada caixa x espelho Emusys (data_pagamento).
-- Francisco R$640 (2ab1a67a) fica de fora: pagamento composto ainda em verificacao.

begin;

-- Eduardo da Silva Barreto: apontava 41477 (Canto T 08/2026, aberta); Pix de 27/08 quitou 50365 (Canto 08/2026, paga 27/08)
update caixa_movimentacoes set fatura_id = '4b8e71a0-89d9-4b4d-8420-4f622a53bedc'
where id = '316f71b9-1c34-49d1-990b-f44a3944d93a';

-- Jhonatan Samuel: venda lojinha R$20 linkada a fatura de mensalidade 44267; correta e a fatura de produto 50507 (paga 02/09)
update caixa_movimentacoes set fatura_id = '8ce55f60-7ef9-4bf5-96f3-d817f2c3243d'
where id = '5696bd96-fd90-47fa-8560-fef367b08003';

-- Marcia Fatima Darzi: apontava 27272 (10/2026 aberta); Pix de 04/09 quitou 27271 (09/2026, paga 04/09)
update caixa_movimentacoes set fatura_id = '0687b161-158a-4598-8d38-a690bd878f61'
where id = '8f43e15a-224a-407f-8848-3d10e70ebf1c';

-- Heitor West: apontava 29122 (10/2026 aberta); Pix de 08/09 quitou 29121 (09/2026, paga 08/09)
update caixa_movimentacoes set fatura_id = '914ec825-46f0-4d2b-a4bb-93c137ef83e3'
where id = '5d65e538-2372-40b8-800a-0ec2e0992ad6';

-- Giovanna Chipitelli: apontava 29538 (10/2026 aberta); Pix de 09/09 quitou 29537 (09/2026, paga 09/09)
update caixa_movimentacoes set fatura_id = 'f5c82638-f832-4a18-aab9-909d2d6ecadb'
where id = 'bc5cdc52-347f-432d-81d0-374ca16282e5';

-- Enrico Florenzano: apontava 30166 (10/2026 aberta); Pix de 11/09 quitou 30165 (09/2026, paga 11/09)
update caixa_movimentacoes set fatura_id = '6888967b-22a3-44b9-b9ce-ae3a3f20fe28'
where id = '0bbac36f-f764-450f-8bac-427392763e0e';

-- Lis Regly: apontava 48238 (10/2026 aberta); Pix de 17/09 quitou 48237 (09/2026, paga 16/09)
update caixa_movimentacoes set fatura_id = '1180b854-72bf-4352-a37a-7a777f9044aa'
where id = 'c75e9dfa-93db-4336-9b50-2ab216593635';

-- Luigi Rodrigues: apontava 14502 (10/2026 aberta); Pix de 17/09 quitou 14503 (09/2026, paga 17/09)
update caixa_movimentacoes set fatura_id = '48714cae-13d5-43c6-bf2d-8ecd4b92dc5b'
where id = '6b2428db-2ff2-4737-9275-c83fa0c69e43';

-- pos-condicao: so pode restar a entrada do Francisco apontando para fatura aberta
do $$
declare resto int;
begin
  select count(*) into resto
  from caixa_movimentacoes m join emusys_faturas f on f.id = m.fatura_id
  where f.status = 'aberta' and m.tipo = 'entrada';
  if resto <> 1 then
    raise exception 'pos-condicao falhou: % entradas ainda apontam fatura aberta (esperado 1 = Francisco)', resto;
  end if;
end $$;

commit;
