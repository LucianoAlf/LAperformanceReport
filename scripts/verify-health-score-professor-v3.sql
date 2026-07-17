-- Health Score Professor V3 - verificacao SELECT-only da Fase 2.
-- Versao piloto vigente: periodos-professor-v1.8-piloto.
-- Este arquivo nao cria, altera ou remove dados.

-- 1. Execucao final por unidade.
with latest as (
  select distinct on (r.unidade_id)
    r.*,
    u.nome as unidade
  from public.professor_periodos_reconstrucoes_v1 r
  join public.unidades u on u.id = r.unidade_id
  where r.versao_reconstrucao = 'periodos-professor-v1.8-piloto'
  order by r.unidade_id, r.created_at desc
)
select
  unidade,
  id as reconstrucao_id,
  status,
  data_inicio,
  data_fim,
  total_eventos,
  total_periodos,
  total_diagnosticos,
  entrada_hash,
  created_at,
  concluido_em
from latest
order by unidade;

-- 2. Invariantes e distribuicao de confianca.
with latest as (
  select distinct on (r.unidade_id)
    r.id,
    r.unidade_id,
    u.nome as unidade
  from public.professor_periodos_reconstrucoes_v1 r
  join public.unidades u on u.id = r.unidade_id
  where r.versao_reconstrucao = 'periodos-professor-v1.8-piloto'
    and r.status = 'concluido'
  order by r.unidade_id, r.created_at desc
)
select
  l.unidade,
  count(*) as periodos,
  count(*) filter (where p.status_periodo = 'ativo') as ativos,
  count(*) filter (where p.status_periodo = 'encerrado') as encerrados,
  count(*) filter (where p.confianca = 'alta') as confianca_alta,
  count(*) filter (where p.confianca = 'media') as confianca_media,
  count(*) filter (where p.confianca = 'revisar') as revisar,
  count(*) filter (where p.publicavel) as publicaveis_sombra,
  count(*) filter (where p.professor_id is null) as professor_nao_resolvido,
  count(*) filter (where p.emusys_matricula_disciplina_id is null) as sem_matricula_disciplina,
  count(*) filter (
    where p.status_periodo = 'encerrado' and p.data_fim is null
  ) as encerrado_sem_fim,
  count(*) filter (
    where p.status_periodo = 'ativo' and p.data_fim is not null
  ) as ativo_com_fim,
  count(*) filter (
    where p.status_periodo = 'ativo' and p.elegivel_permanencia
  ) as ativo_elegivel_permanencia
from latest l
join public.professor_matricula_disciplina_periodos_v1 p
  on p.reconstrucao_id = l.id
group by l.unidade
order by l.unidade;

-- 3. Sobreposicoes na mesma chave canonica. O resultado esperado e zero linhas.
with latest as (
  select distinct on (unidade_id) id, unidade_id
  from public.professor_periodos_reconstrucoes_v1
  where versao_reconstrucao = 'periodos-professor-v1.8-piloto'
    and status = 'concluido'
  order by unidade_id, created_at desc
), p as (
  select p.*
  from latest l
  join public.professor_matricula_disciplina_periodos_v1 p
    on p.reconstrucao_id = l.id
)
select
  a.unidade_id,
  a.pessoa_chave,
  a.emusys_matricula_disciplina_id,
  a.professor_id,
  a.id as periodo_a,
  b.id as periodo_b,
  a.data_inicio as inicio_a,
  a.data_fim as fim_a,
  b.data_inicio as inicio_b,
  b.data_fim as fim_b
from p a
join p b
  on b.id > a.id
 and b.unidade_id = a.unidade_id
 and b.pessoa_chave = a.pessoa_chave
 and b.emusys_matricula_disciplina_id
     is not distinct from a.emusys_matricula_disciplina_id
 and b.professor_id is not distinct from a.professor_id
 and tstzrange(a.data_inicio, coalesce(a.data_fim, 'infinity'::timestamptz), '[)')
     && tstzrange(b.data_inicio, coalesce(b.data_fim, 'infinity'::timestamptz), '[)')
order by a.unidade_id, a.pessoa_chave;

-- 4. Contaminacao por experimental. O resultado esperado e zero.
with latest as (
  select distinct on (unidade_id) id, unidade_id
  from public.professor_periodos_reconstrucoes_v1
  where versao_reconstrucao = 'periodos-professor-v1.8-piloto'
    and status = 'concluido'
  order by unidade_id, created_at desc
), aulas_periodo as (
  select
    p.id as periodo_id,
    p.unidade_id,
    (aula_id #>> '{}')::bigint as emusys_aula_id
  from latest l
  join public.professor_matricula_disciplina_periodos_v1 p
    on p.reconstrucao_id = l.id
  cross join lateral jsonb_array_elements(p.evidencias->'aulas') aula_id
)
select count(*) as aulas_experimentais_usadas_em_periodos
from aulas_periodo ap
join public.emusys_aulas_historico_staging_v1 a
  on a.unidade_id = ap.unidade_id
 and a.emusys_aula_id = ap.emusys_aula_id
where lower(coalesce(a.categoria, '')) like '%experimental%';

-- 5. Distribuicao dos diagnosticos por unidade.
with latest as (
  select distinct on (r.unidade_id)
    r.*,
    u.nome as unidade
  from public.professor_periodos_reconstrucoes_v1 r
  join public.unidades u on u.id = r.unidade_id
  where r.versao_reconstrucao = 'periodos-professor-v1.8-piloto'
  order by r.unidade_id, r.created_at desc
)
select
  l.unidade,
  d.value->>'tipo' as tipo,
  count(*) as total
from latest l
cross join lateral jsonb_array_elements(l.diagnosticos) d(value)
group by l.unidade, d.value->>'tipo'
order by l.unidade, total desc, tipo;

-- 6. Caso nominal: continuidade de renovacao e troca de professor da pessoa 3119.
with latest as (
  select distinct on (unidade_id) id
  from public.professor_periodos_reconstrucoes_v1
  where versao_reconstrucao = 'periodos-professor-v1.8-piloto'
    and status = 'concluido'
  order by unidade_id, created_at desc
)
select
  p.unidade_id,
  p.pessoa_chave,
  p.emusys_matricula_id,
  p.emusys_matricula_disciplina_id,
  p.professor_id,
  p.emusys_professor_id,
  p.data_inicio,
  p.data_fim,
  p.status_periodo,
  p.tipo_inicio,
  p.tipo_fim,
  p.confianca,
  p.publicavel,
  p.evidencias->'matriculas_disciplinas_origem' as matriculas_disciplinas_origem,
  p.conflitos
from latest l
join public.professor_matricula_disciplina_periodos_v1 p
  on p.reconstrucao_id = l.id
where p.pessoa_chave = 'emusys:3119'
order by p.data_inicio;

-- 7. Isolamento das tabelas e security_invoker da view.
select
  c.relname as objeto,
  c.relrowsecurity as rls_habilitada,
  c.relforcerowsecurity as rls_forcada,
  c.reloptions
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'professor_periodos_reconstrucoes_v1',
    'professor_matricula_disciplina_periodos_v1',
    'professor_periodos_revisoes_v1',
    'vw_professor_periodos_diagnostico_v1'
  )
order by c.relname;

select
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privilegios
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'professor_periodos_reconstrucoes_v1',
    'professor_matricula_disciplina_periodos_v1',
    'professor_periodos_revisoes_v1',
    'vw_professor_periodos_diagnostico_v1'
  )
group by table_name, grantee
order by table_name, grantee;

select
  routine_name,
  grantee,
  privilege_type
from information_schema.role_routine_grants
where specific_schema = 'public'
  and routine_name = 'materializar_periodos_professor_v1'
order by grantee;

-- 8. Homologacao nominal append-only de 16/07/2026.
with latest as (
  select distinct on (r.unidade_id)
    r.id,
    r.unidade_id,
    u.nome as unidade
  from public.professor_periodos_reconstrucoes_v1 r
  join public.unidades u on u.id = r.unidade_id
  where r.versao_reconstrucao = 'periodos-professor-v1.8-piloto'
    and r.status = 'concluido'
  order by r.unidade_id, r.created_at desc
), revisoes as (
  select
    l.unidade,
    rv.periodo_id,
    rv.decisao,
    rv.snapshot_posterior->'validacao_humana'->>'codigo' as codigo,
    rv.snapshot_posterior->>'confianca' as confianca_efetiva,
    (rv.snapshot_posterior->>'publicavel')::boolean as publicavel_efetivo
  from latest l
  join public.professor_matricula_disciplina_periodos_v1 p
    on p.reconstrucao_id = l.id
  join public.professor_periodos_revisoes_v1 rv
    on rv.periodo_id = p.id
  where rv.snapshot_posterior->'validacao_humana'->>'fonte'
    = 'confirmacao_operacional_unidades_2026-07-16'
)
select
  unidade,
  decisao,
  count(*) as total
from revisoes
group by unidade, decisao
order by unidade, decisao;

-- Deve retornar apenas CG-3C e CG-6, ambos nao publicaveis.
with revisoes as (
  select
    rv.snapshot_posterior->'validacao_humana'->>'codigo' as codigo,
    rv.decisao,
    rv.snapshot_posterior->>'confianca' as confianca_efetiva,
    (rv.snapshot_posterior->>'publicavel')::boolean as publicavel_efetivo
  from public.professor_periodos_revisoes_v1 rv
  where rv.snapshot_posterior->'validacao_humana'->>'fonte'
    = 'confirmacao_operacional_unidades_2026-07-16'
)
select *
from revisoes
where decisao = 'manter_revisao'
order by codigo;
