-- P08K: remove falsos positivos financeiros para tipos sem parcela.
-- BANDA e bolsista integral devem permanecer como sem_parcela no LA Report,
-- mesmo quando o contrato Emusys retorna status em_dia.

update public.alunos_emusys_atributos_divergencias d
set resolvido = true,
    decisao = 'resolvido_por_regra_canonica_sem_parcela',
    updated_at = now()
from public.alunos a
join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
where d.aluno_id = a.id
  and d.resolvido = false
  and d.tipo_divergencia = 'status_financeiro_divergente'
  and d.campo = 'status_pagamento'
  and tm.codigo in ('BANDA', 'BOLSISTA_INT')
  and coalesce(a.status_pagamento, '') = 'sem_parcela'
  and d.valor_emusys->>'status_pagamento' = 'em_dia';
