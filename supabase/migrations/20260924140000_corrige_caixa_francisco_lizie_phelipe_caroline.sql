-- Fecha o caso Francisco R$640 (resposta da equipe CG, 24/09):
-- o Pix de 05/09 pagou a parcela 09/2026 do Francisco (Bateria) + a parcela
-- 09/2026 da filha Lizie (Mus. Infantil), 2x R$320. Francisco estava em
-- trancamento em agosto — nao havia fatura de agosto paga.
-- A equipe ja havia dividido a entrada em duas de R$320; faltavam os links.
-- Alem disso, a entrada composta de Phelipe Rocha + Caroline Lima (R$640,
-- mesmo dia) e' dividida no mesmo padrao para carregar os dois fatura_id.

begin;

-- Francisco: entrada apontava 46232 (08/2026, aberta — trancamento). Correta: 46233 (09/2026, paga 05/09)
update caixa_movimentacoes
set fatura_id = 'a1e271c6-e867-4c69-950f-33519a26c394', aluno_id = 1557
where id = '2ab1a67a-91ed-414d-a725-96c04f43e05f';

-- Lizie: entrada sem link. Correta: 46246 (09/2026, paga 05/09)
update caixa_movimentacoes
set fatura_id = '37de9ae2-e165-426a-95fb-09ad36b64887', aluno_id = 1558
where id = '64df1736-82b2-4515-887f-c5d540581014';

-- Phelipe + Caroline (640 composto): divide em duas entradas de 320,
-- mesmo padrao que a equipe usou no caso Francisco/Lizie.
update caixa_movimentacoes
set valor = 320,
    descricao = 'Parcela 09/2026 do curso de Violão - Phelipe Rocha',
    fatura_id = '3fd22001-48a1-49ef-831a-f8992573b54e',
    aluno_id = 1556
where id = '63a7ade0-8d06-490a-881a-c4089d704367';

insert into caixa_movimentacoes
  (caixa_diario_id, unidade_id, data_movimento, ambiente, tipo, forma_pagamento,
   categoria, descricao, valor, responsavel, criado_por, aluno_id, fatura_id)
values
  ('7ad89d57-5d63-4a7a-9c85-8e4e947e8bdf', '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
   '2026-09-05', 'venda', 'entrada', 'pix', 'parcela',
   'Parcela 09/2026 do curso de Teclado / Piano - Caroline Lima (split da entrada composta 63a7ade0)',
   320, 'Mayra Alves', 'Mayra Alves', 1555,
   (select id from emusys_faturas where emusys_fatura_id = 46207));

-- pos-condicao: nenhuma entrada de caixa pode apontar fatura aberta
do $$
declare resto int;
begin
  select count(*) into resto
  from caixa_movimentacoes m join emusys_faturas f on f.id = m.fatura_id
  where f.status = 'aberta' and m.tipo = 'entrada';
  if resto <> 0 then
    raise exception 'pos-condicao falhou: % entradas ainda apontam fatura aberta', resto;
  end if;
end $$;

commit;
