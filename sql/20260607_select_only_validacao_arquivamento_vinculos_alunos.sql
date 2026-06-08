-- SELECT-only - Validacao do fluxo seguro de arquivamento de vinculos.
--
-- Regras:
-- - Nao executar UPDATE/DELETE.
-- - Nao arquivar casos nominais por este arquivo.
-- - Usar antes/depois da migration e antes/depois da aplicacao nominal.

-- 1. Confirmar se o schema de arquivamento ja existe em public.alunos.
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'alunos'
  and column_name in (
    'arquivado_em',
    'arquivado_por',
    'arquivado_motivo',
    'arquivado_origem',
    'arquivado_aluno_principal_id'
  )
order by ordinal_position;

-- 2. Estado atual dos quatro casos-alvo.
with ids(id) as (
  values (930),(1703),(1425),(1426),(1430),(1442),(1433),(1434)
)
select
  a.id,
  a.nome,
  a.status,
  a.data_saida,
  a.unidade_id,
  u.codigo as unidade_codigo,
  a.professor_atual_id,
  p.nome as professor_nome,
  a.curso_id,
  c.nome as curso_nome,
  c.is_projeto_banda,
  a.tipo_matricula_id,
  tm.codigo as tipo_matricula_codigo,
  a.is_segundo_curso,
  a.data_matricula,
  a.dia_aula,
  a.horario_aula
from public.alunos a
join ids on ids.id = a.id
left join public.unidades u on u.id = a.unidade_id
left join public.professores p on p.id = a.professor_atual_id
left join public.cursos c on c.id = a.curso_id
left join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
order by a.nome, a.id;

-- 3. Dependencias que impedem delete fisico seguro.
with ids(id) as (
  values (930),(1703),(1425),(1426),(1430),(1442),(1433),(1434)
),
refs as (
  select 'aluno_presenca' as tabela, aluno_id, count(*) as qtd
  from public.aluno_presenca
  where aluno_id in (select id from ids)
  group by aluno_id
  union all
  select 'renovacoes', aluno_id, count(*)
  from public.renovacoes
  where aluno_id in (select id from ids)
  group by aluno_id
  union all
  select 'movimentacoes_admin', aluno_id, count(*)
  from public.movimentacoes_admin
  where aluno_id in (select id from ids)
  group by aluno_id
  union all
  select 'aluno_contatos', aluno_id, count(*)
  from public.aluno_contatos
  where aluno_id in (select id from ids)
  group by aluno_id
  union all
  select 'leads', aluno_id, count(*)
  from public.leads
  where aluno_id in (select id from ids)
  group by aluno_id
)
select
  ids.id,
  a.nome,
  coalesce(sum(refs.qtd), 0) as total_refs,
  jsonb_object_agg(refs.tabela, refs.qtd order by refs.tabela) filter (where refs.tabela is not null) as refs_por_tabela
from ids
left join public.alunos a on a.id = ids.id
left join refs on refs.aluno_id = ids.id
group by ids.id, a.nome
order by a.nome, ids.id;

-- 4. Depois da aplicacao nominal, validar arquivamentos logicos esperados.
-- Esperado quando aprovado/aplicado:
-- - Ester 1426 com arquivado_em preenchido, status inativo, principal 1425.
-- - Julia 1430 com arquivado_em preenchido, status inativo, principal 1442.
-- - Gabriel 930/1703 sem arquivado_em.
-- - Vinicius 1433/1434 sem arquivado_em.
select
  id,
  nome,
  status,
  data_saida,
  to_jsonb(a)->>'arquivado_em' as arquivado_em,
  to_jsonb(a)->>'arquivado_por' as arquivado_por,
  to_jsonb(a)->>'arquivado_origem' as arquivado_origem,
  to_jsonb(a)->>'arquivado_aluno_principal_id' as arquivado_aluno_principal_id,
  to_jsonb(a)->>'arquivado_motivo' as arquivado_motivo
from public.alunos a
where id in (930,1703,1425,1426,1430,1442,1433,1434)
order by nome, id;

-- 5. Confirmar que nenhum dos IDs sumiu de public.alunos.
select
  count(*) as total_ids_presentes,
  array_agg(id order by id) as ids_presentes
from public.alunos
where id in (930,1703,1425,1426,1430,1442,1433,1434);

-- 6. Confirmar anotacoes de auditoria criadas pelo fluxo novo.
select
  aluno_id,
  categoria,
  resolvido,
  criado_por,
  created_at,
  texto
from public.anotacoes_alunos
where aluno_id in (1426,1430)
  and categoria = 'arquivamento'
order by created_at desc;
