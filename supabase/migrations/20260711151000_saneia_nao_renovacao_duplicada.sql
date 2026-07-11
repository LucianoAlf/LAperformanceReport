-- Remove somente duplicidades produzidas pela primeira execucao da regra,
-- preservando o registro humano (motivo e observacao) e seu enriquecimento.

do $$
declare
  v_auto record;
  v_manual_id integer;
begin
  for v_auto in
    select m.*
    from public.movimentacoes_admin m
    where m.tipo = 'nao_renovacao'
      and m.observacoes = 'Nao renovacao identificada automaticamente: renovacao pendente e mesma matricula finalizada no Emusys.'
  loop
    select humano.id
    into v_manual_id
    from public.movimentacoes_admin humano
    where humano.id <> v_auto.id
      and humano.unidade_id = v_auto.unidade_id
      and humano.aluno_id = v_auto.aluno_id
      and humano.tipo = 'nao_renovacao'
      and humano.competencia_referencia is not distinct from v_auto.competencia_referencia
      and humano.observacoes is distinct from v_auto.observacoes
    order by humano.updated_at desc nulls last, humano.id desc
    limit 1;

    if v_manual_id is not null then
      update public.movimentacoes_admin humano
      set
        emusys_matricula_id = coalesce(humano.emusys_matricula_id, v_auto.emusys_matricula_id),
        tempo_permanencia_meses = coalesce(humano.tempo_permanencia_meses, v_auto.tempo_permanencia_meses),
        valor_parcela_evasao = coalesce(humano.valor_parcela_evasao, v_auto.valor_parcela_evasao),
        updated_at = now()
      where humano.id = v_manual_id;

      delete from public.movimentacoes_admin m
      where m.id = v_auto.id;
    end if;
  end loop;
end;
$$;
