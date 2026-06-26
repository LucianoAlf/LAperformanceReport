-- P08I: normaliza matriculas que, por regra canonica de tipo, nao entram em MRR/ticket.
-- BANDA e BOLSISTA_INT podem manter valor de tabela em campos auxiliares, mas a parcela operacional e zero.

update public.alunos a
   set valor_parcela = 0,
       status_pagamento = 'sem_parcela',
       updated_at = now(),
       updated_by = 'migration_p08i_tipo_canonico'
from public.tipos_matricula tm
where tm.id = a.tipo_matricula_id
  and tm.codigo in ('BANDA', 'BOLSISTA_INT')
  and a.arquivado_em is null
  and a.status = 'ativo'
  and (
    coalesce(a.valor_parcela, 0) <> 0
    or coalesce(a.status_pagamento, '') <> 'sem_parcela'
  );

with unidade_cg as (
  select id from public.unidades where lower(nome) = 'campo grande' limit 1
),
tipo_bolsista as (
  select id from public.tipos_matricula where codigo = 'BOLSISTA_INT' limit 1
),
aluno_adriana as (
  update public.alunos a
     set tipo_matricula_id = (select id from tipo_bolsista),
         tipo_aluno = 'bolsista_integral',
         valor_cheio = 520,
         desconto_fixo = 0,
         desconto_condicional = 0,
         valor_parcela = 0,
         status_pagamento = 'sem_parcela',
         updated_at = now(),
         updated_by = 'migration_p08i_adriana_bolsista'
  where a.unidade_id = (select id from unidade_cg)
    and a.emusys_matricula_id = '2353'
    and unaccent(lower(a.nome)) = unaccent(lower('Adriana Mesquita dos Santos Vilas Boas'))
  returning a.id, a.unidade_id, a.emusys_matricula_id
),
decisao as (
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
    'Validado pela direcao: bolsa integral no Emusys, sem faturas/cobranca. Valor 520 e preco de tabela, nao parcela.',
    'migration_p08i',
    'migration_p08i',
    now()
  from aluno_adriana
  on conflict (unidade_id, emusys_matricula_id) do update set
    aluno_id = excluded.aluno_id,
    tipo_decisao = excluded.tipo_decisao,
    campos_bloqueados = excluded.campos_bloqueados,
    tipo_matricula_codigo = excluded.tipo_matricula_codigo,
    status_pagamento = excluded.status_pagamento,
    valor_parcela = excluded.valor_parcela,
    ignorar_sync = excluded.ignorar_sync,
    motivo = excluded.motivo,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning aluno_id
)
insert into public.matriculas_campos_fixados (aluno_id, campo, valor, fixado_por, fixado_em)
select aluno_id, campo, valor, 'migration_p08i', now()
from decisao
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
