-- Rollback de 20260923200000_backfill_fatura_id_caixa_confirmados_equipe
-- Apenas fatura_id volta a null (aluno_id e demais campos preservados).

begin;

update caixa_movimentacoes set fatura_id = null, updated_at = now()
where id = '6c232537-63f4-442e-bf25-6a81ea3400a4'
  and fatura_id = '3452c73d-2bf9-46de-b17a-6a04da769a60';

update caixa_movimentacoes set fatura_id = null, updated_at = now()
where id = '51e9cf20-1837-4570-9872-eb55861bce33'
  and fatura_id = '35def5f3-7a42-487d-b216-fdd16d613c32';

update caixa_movimentacoes set fatura_id = null, updated_at = now()
where id = '559141eb-bfd7-4b55-bf29-4c54cf1c5b63'
  and fatura_id = '18ab9e11-b244-4af0-aab6-3793aa23a523';

commit;
