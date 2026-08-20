-- Segunda fonte da forma de pagamento: a forma que a PESSOA de fato usou na última
-- fatura paga. Decisão do Alf, 2026-08-20 ("todos têm forma de pagamento").
--
-- POR QUE ESSA FONTE É INDISPENSÁVEL:
--   - a fatura ABERTA sempre vem com `forma_pagamento_transacao` nula (o Emusys só sabe a
--     forma depois que o pagamento acontece);
--   - `contrato_atual.forma_pagamento` vem string vazia em 484 de 484 contratos ativos de CG;
--   - `cobranca_automatica.forma_pagamento` cobre só quem tem cobrança recorrente.
--
-- ⚠️ A busca é por PESSOA (`emusys_student_id`), não por matrícula. Quando o aluno renova,
-- o Emusys abre uma matrícula NOVA e as faturas antigas ficam na matrícula anterior —
-- buscar pela matrícula atual perde o histórico. Medido em Campo Grande: por matrícula
-- resolvia 115 dos 181; por pessoa, 157.
--
-- Os que sobram NÃO são cadastro incompleto: são bolsistas integrais/parciais e matrículas
-- de banda, que por definição não emitem fatura e portanto nunca terão forma de pagamento.

create or replace function public.forma_pagamento_ultima_fatura_por_pessoa(p_unidade_id uuid)
returns table(emusys_student_id text, forma_pagamento text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select distinct on (f.emusys_student_id::text)
         f.emusys_student_id::text,
         btrim(f.payload ->> 'forma_pagamento_transacao')
  from public.emusys_faturas f
  where f.unidade_id = p_unidade_id
    and f.emusys_student_id is not null
    and nullif(btrim(f.payload ->> 'forma_pagamento_transacao'), '') is not null
  order by f.emusys_student_id::text, f.data_pagamento desc nulls last, f.emusys_fatura_id desc;
$function$;

revoke all on function public.forma_pagamento_ultima_fatura_por_pessoa(uuid) from public, anon, authenticated;
grant execute on function public.forma_pagamento_ultima_fatura_por_pessoa(uuid) to service_role;
