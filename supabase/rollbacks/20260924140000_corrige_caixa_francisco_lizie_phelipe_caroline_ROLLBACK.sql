-- Rollback de 20260924140000_corrige_caixa_francisco_lizie_phelipe_caroline

begin;

update caixa_movimentacoes
set fatura_id = (select id from emusys_faturas where emusys_fatura_id = 46232),
    aluno_id = null
where id = '2ab1a67a-91ed-414d-a725-96c04f43e05f';

update caixa_movimentacoes
set fatura_id = null, aluno_id = null
where id = '64df1736-82b2-4515-887f-c5d540581014';

delete from caixa_movimentacoes
where descricao like '%(split da entrada composta 63a7ade0)%'
  and valor = 320 and data_movimento = '2026-09-05' and aluno_id = 1555;

update caixa_movimentacoes
set valor = 640,
    descricao = 'Parcelas 09/2026 Aluno Phelipe Rocha (R$320,00) e aluna Carolina Lima (R$320,00)',
    fatura_id = null, aluno_id = null
where id = '63a7ade0-8d06-490a-881a-c4089d704367';

commit;
