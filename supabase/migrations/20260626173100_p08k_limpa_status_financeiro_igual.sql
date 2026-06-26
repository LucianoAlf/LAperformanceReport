-- P08K: remove pendencias financeiras residuais quando os dois lados ja concordam.

update public.alunos_emusys_atributos_divergencias d
set resolvido = true,
    decisao = 'resolvido_por_status_financeiro_igual',
    updated_at = now()
from public.alunos a
where d.aluno_id = a.id
  and d.resolvido = false
  and d.tipo_divergencia = 'status_financeiro_divergente'
  and d.campo = 'status_pagamento'
  and lower(trim(coalesce(a.status_pagamento, ''))) =
      lower(trim(coalesce(d.valor_emusys->>'status_pagamento', '')))
  and coalesce(a.status_pagamento, '') <> '';
