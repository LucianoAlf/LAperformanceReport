-- P08J: Lavynea e Olivia confirmadas como bolsistas integrais no Emusys.
-- O valor 520 e preco de tabela; sem faturas/cobranca nao deve impactar MRR/ticket.
-- Chave canonica: unidade Campo Grande + emusys_matricula_id.

with tipo_bolsista as (
  select id
  from public.tipos_matricula
  where codigo = 'BOLSISTA_INT'
  limit 1
),
alunos_confirmados as (
  update public.alunos a
     set tipo_matricula_id = (select id from tipo_bolsista),
         tipo_aluno = 'bolsista_integral',
         valor_cheio = 520,
         desconto_fixo = 0,
         desconto_condicional = 0,
         valor_parcela = 0,
         status_pagamento = 'sem_parcela',
         updated_at = now(),
         updated_by = 'migration_p08j_bolsista_integral'
  from public.unidades u
  where u.id = a.unidade_id
    and u.nome = 'Campo Grande'
    and a.emusys_matricula_id in ('2308', '2358')
  returning a.id, a.unidade_id, a.emusys_matricula_id
),
decisoes as (
  insert into public.matriculas_emusys_decisoes_canonicas (
    unidade_id,
    emusys_matricula_id,
    aluno_id,
    tipo_decisao,
    campos_bloqueados,
    tipo_matricula_codigo,
    status_pagamento,
    valor_parcela,
    ignorar_sync,
    motivo,
    snapshot_emusys,
    created_by,
    updated_by,
    updated_at
  )
  select
    unidade_id,
    emusys_matricula_id,
    id,
    'bolsista_integral',
    array['tipo_matricula_id', 'valor_parcela', 'status_pagamento'],
    'BOLSISTA_INT',
    'sem_parcela',
    0,
    false,
    'Validado pela direcao e confirmado no Emusys: bolsa integral, sem faturas/cobranca. Valor 520 e preco de tabela, nao parcela.',
    jsonb_build_object(
      'fonte', 'Emusys /matriculas',
      'bolsa', true,
      'nr_faturas', 0,
      'valor_mensalidade', 520,
      'valor_total', 0
    ),
    'migration_p08j',
    'migration_p08j',
    now()
  from alunos_confirmados
  on conflict (unidade_id, emusys_matricula_id) do update set
    aluno_id = excluded.aluno_id,
    tipo_decisao = excluded.tipo_decisao,
    campos_bloqueados = excluded.campos_bloqueados,
    tipo_matricula_codigo = excluded.tipo_matricula_codigo,
    status_pagamento = excluded.status_pagamento,
    valor_parcela = excluded.valor_parcela,
    ignorar_sync = excluded.ignorar_sync,
    motivo = excluded.motivo,
    snapshot_emusys = excluded.snapshot_emusys,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning aluno_id
)
insert into public.matriculas_campos_fixados (aluno_id, campo, valor, fixado_por, fixado_em)
select aluno_id, campo, valor, 'migration_p08j', now()
from decisoes
cross join (
  values
    ('tipo_matricula_id', to_jsonb((select id from tipo_bolsista))),
    ('valor_parcela', to_jsonb(0)),
    ('status_pagamento', to_jsonb('sem_parcela'::text))
) as fix(campo, valor)
on conflict (aluno_id, campo) do update set
  valor = excluded.valor,
  fixado_por = excluded.fixado_por,
  fixado_em = excluded.fixado_em;
