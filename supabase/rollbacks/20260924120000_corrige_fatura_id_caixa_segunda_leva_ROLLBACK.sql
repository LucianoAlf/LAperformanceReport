-- Rollback de 20260924120000_corrige_fatura_id_caixa_segunda_leva
-- Restaura os fatura_id originais (todos apontavam a fatura errada/aberta).

begin;

update caixa_movimentacoes set fatura_id = (select id from emusys_faturas where emusys_fatura_id = 41477)
where id = '316f71b9-1c34-49d1-990b-f44a3944d93a';
update caixa_movimentacoes set fatura_id = (select id from emusys_faturas where emusys_fatura_id = 44267)
where id = '5696bd96-fd90-47fa-8560-fef367b08003';
update caixa_movimentacoes set fatura_id = (select id from emusys_faturas where emusys_fatura_id = 27272)
where id = '8f43e15a-224a-407f-8848-3d10e70ebf1c';
update caixa_movimentacoes set fatura_id = (select id from emusys_faturas where emusys_fatura_id = 29122)
where id = '5d65e538-2372-40b8-800a-0ec2e0992ad6';
update caixa_movimentacoes set fatura_id = (select id from emusys_faturas where emusys_fatura_id = 29538)
where id = 'bc5cdc52-347f-432d-81d0-374ca16282e5';
update caixa_movimentacoes set fatura_id = (select id from emusys_faturas where emusys_fatura_id = 30166)
where id = '0bbac36f-f764-450f-8bac-427392763e0e';
update caixa_movimentacoes set fatura_id = (select id from emusys_faturas where emusys_fatura_id = 48238)
where id = 'c75e9dfa-93db-4336-9b50-2ab216593635';
update caixa_movimentacoes set fatura_id = (select id from emusys_faturas where emusys_fatura_id = 14502)
where id = '6b2428db-2ff2-4737-9275-c83fa0c69e43';

commit;
