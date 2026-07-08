-- Jornada canonica por matricula/disciplina.
-- Fonte oficial: Emusys /matriculas + webhooks de matricula.

create table if not exists public.aluno_jornada_matricula_disciplina (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id) on delete cascade,
  aluno_id integer references public.alunos(id) on delete set null,
  emusys_aluno_id bigint,
  emusys_matricula_id bigint,
  emusys_matricula_disciplina_id bigint not null,
  emusys_disciplina_id bigint,
  curso_id integer references public.cursos(id) on delete set null,
  curso_nome_emusys text,
  professor_id integer references public.professores(id) on delete set null,
  emusys_professor_id bigint,
  professor_nome_emusys text,
  status_matricula text not null default 'desconhecido',
  qtd_contratos integer,
  nr_aulas_contratadas integer,
  nr_aulas_passadas integer,
  nr_aulas_futuras integer,
  proxima_aula_numero integer,
  percentual_jornada numeric(8,2),
  data_primeira_aula timestamptz,
  data_ultima_aula timestamptz,
  dia_semana text,
  horario text,
  fonte_ultima_atualizacao text not null,
  ultima_sincronizacao_emusys timestamptz not null default now(),
  payload_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint aluno_jornada_matricula_disciplina_status_chk
    check (status_matricula in ('ativa', 'trancada', 'finalizada', 'inativa', 'desconhecido')),
  constraint aluno_jornada_matricula_disciplina_percentual_chk
    check (percentual_jornada is null or (percentual_jornada >= 0 and percentual_jornada <= 100)),
  constraint aluno_jornada_matricula_disciplina_unq
    unique (unidade_id, emusys_matricula_disciplina_id)
);

create index if not exists idx_jornada_aluno_unidade_aluno
  on public.aluno_jornada_matricula_disciplina (unidade_id, aluno_id);

create index if not exists idx_jornada_aluno_unidade_professor
  on public.aluno_jornada_matricula_disciplina (unidade_id, professor_id);

create index if not exists idx_jornada_aluno_unidade_status
  on public.aluno_jornada_matricula_disciplina (unidade_id, status_matricula);

create index if not exists idx_jornada_aluno_unidade_proxima
  on public.aluno_jornada_matricula_disciplina (unidade_id, proxima_aula_numero);

create index if not exists idx_jornada_aluno_unidade_ultima
  on public.aluno_jornada_matricula_disciplina (unidade_id, data_ultima_aula);

drop trigger if exists trg_aluno_jornada_matricula_disciplina_updated_at
  on public.aluno_jornada_matricula_disciplina;

create trigger trg_aluno_jornada_matricula_disciplina_updated_at
  before update on public.aluno_jornada_matricula_disciplina
  for each row
  execute function public.update_updated_at_column();

alter table public.aluno_jornada_matricula_disciplina enable row level security;

drop policy if exists "service_role_all_aluno_jornada_matricula_disciplina"
  on public.aluno_jornada_matricula_disciplina;

create policy "service_role_all_aluno_jornada_matricula_disciplina"
  on public.aluno_jornada_matricula_disciplina
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "authenticated_select_aluno_jornada_matricula_disciplina"
  on public.aluno_jornada_matricula_disciplina;

create policy "authenticated_select_aluno_jornada_matricula_disciplina"
  on public.aluno_jornada_matricula_disciplina
  for select
  to authenticated
  using (true);

grant select, insert, update, delete on public.aluno_jornada_matricula_disciplina to service_role;
grant select on public.aluno_jornada_matricula_disciplina to authenticated;

alter table public.aulas_emusys
  add column if not exists matricula_disciplina_id bigint,
  add column if not exists qtd_aulas_contrato integer;

create index if not exists idx_aulas_emusys_matricula_disciplina
  on public.aulas_emusys (unidade_id, matricula_disciplina_id)
  where matricula_disciplina_id is not null;

create or replace view public.vw_jornada_aluno_atual
with (security_invoker=on) as
select
  j.id,
  j.unidade_id,
  u.nome as unidade_nome,
  j.aluno_id,
  a.nome as aluno_nome,
  a.telefone,
  a.whatsapp,
  a.responsavel_nome,
  a.responsavel_telefone,
  j.emusys_aluno_id,
  j.emusys_matricula_id,
  j.emusys_matricula_disciplina_id,
  j.emusys_disciplina_id,
  j.curso_id,
  coalesce(c.nome, j.curso_nome_emusys) as curso_nome,
  j.curso_nome_emusys,
  j.professor_id,
  coalesce(p.nome, j.professor_nome_emusys) as professor_nome,
  j.emusys_professor_id,
  j.professor_nome_emusys,
  j.status_matricula,
  j.qtd_contratos,
  j.nr_aulas_contratadas,
  j.nr_aulas_passadas,
  j.nr_aulas_futuras,
  j.proxima_aula_numero,
  j.percentual_jornada,
  case
    when j.nr_aulas_contratadas is null then null
    when coalesce(j.nr_aulas_futuras, 0) > 0 and j.proxima_aula_numero is not null
      then 'Aula ' || j.proxima_aula_numero || '/' || j.nr_aulas_contratadas
    when coalesce(j.nr_aulas_passadas, 0) >= j.nr_aulas_contratadas
      then j.nr_aulas_contratadas || '/' || j.nr_aulas_contratadas || ' concluida'
    else coalesce(j.nr_aulas_passadas, 0) || '/' || j.nr_aulas_contratadas
  end as jornada_label,
  j.data_primeira_aula,
  j.data_ultima_aula,
  j.dia_semana,
  j.horario,
  j.fonte_ultima_atualizacao,
  j.ultima_sincronizacao_emusys,
  j.updated_at
from public.aluno_jornada_matricula_disciplina j
left join public.unidades u on u.id = j.unidade_id
left join public.alunos a on a.id = j.aluno_id
left join public.cursos c on c.id = j.curso_id
left join public.professores p on p.id = j.professor_id
where j.status_matricula = 'ativa';

create or replace view public.vw_jornada_aluno_com_presenca
with (security_invoker=on) as
select
  j.*,
  count(ap.id) filter (where ap.status = 'presente')::integer as presencas,
  count(ap.id) filter (where ap.status = 'ausente')::integer as faltas,
  count(ap.id)::integer as aulas_com_presenca_registrada,
  case
    when count(ap.id) = 0 then null
    else round(
      100.0 * count(ap.id) filter (where ap.status = 'presente') / nullif(count(ap.id), 0),
      2
    )
  end as percentual_presenca_contrato,
  max(ap.data_aula) as ultima_aula_registrada
from public.vw_jornada_aluno_atual j
left join public.aluno_presenca ap
  on ap.aluno_id = j.aluno_id
 and ap.unidade_id = j.unidade_id
left join public.aulas_emusys ae
  on ae.id = ap.aula_emusys_id
 and (
   ae.matricula_disciplina_id = j.emusys_matricula_disciplina_id
   or (
     ae.matricula_disciplina_id is null
     and ae.curso_emusys_id = j.emusys_disciplina_id
   )
 )
group by
  j.id, j.unidade_id, j.unidade_nome, j.aluno_id, j.aluno_nome, j.telefone, j.whatsapp,
  j.responsavel_nome, j.responsavel_telefone, j.emusys_aluno_id, j.emusys_matricula_id,
  j.emusys_matricula_disciplina_id, j.emusys_disciplina_id, j.curso_id, j.curso_nome,
  j.curso_nome_emusys, j.professor_id, j.professor_nome, j.emusys_professor_id,
  j.professor_nome_emusys, j.status_matricula, j.qtd_contratos, j.nr_aulas_contratadas,
  j.nr_aulas_passadas, j.nr_aulas_futuras, j.proxima_aula_numero, j.percentual_jornada,
  j.jornada_label, j.data_primeira_aula, j.data_ultima_aula, j.dia_semana, j.horario,
  j.fonte_ultima_atualizacao, j.ultima_sincronizacao_emusys, j.updated_at;

create or replace view public.vw_jornada_professor_atual
with (security_invoker=on) as
select *
from public.vw_jornada_aluno_com_presenca
where professor_id is not null;

create or replace view public.vw_jornada_marcos
with (security_invoker=on) as
select
  *,
  case
    when proxima_aula_numero = 1 then 'primeira_aula'
    when proxima_aula_numero in (15, 21) then 'marco_aula'
    when nr_aulas_futuras is not null and nr_aulas_futuras <= 4 then 'perto_renovacao'
    else 'jornada'
  end as tipo_marco
from public.vw_jornada_aluno_com_presenca;

create or replace function public.get_jornada_aluno(p_aluno_id integer)
returns setof public.vw_jornada_aluno_com_presenca
language sql
stable
security invoker
set search_path = public
as $$
  select *
  from public.vw_jornada_aluno_com_presenca
  where aluno_id = p_aluno_id
  order by curso_nome, emusys_matricula_disciplina_id;
$$;

create or replace function public.get_jornada_professor(p_professor_id integer)
returns setof public.vw_jornada_professor_atual
language sql
stable
security invoker
set search_path = public
as $$
  select *
  from public.vw_jornada_professor_atual
  where professor_id = p_professor_id
  order by aluno_nome, curso_nome;
$$;

grant select on public.vw_jornada_aluno_atual to authenticated, service_role;
grant select on public.vw_jornada_aluno_com_presenca to authenticated, service_role;
grant select on public.vw_jornada_professor_atual to authenticated, service_role;
grant select on public.vw_jornada_marcos to authenticated, service_role;
grant execute on function public.get_jornada_aluno(integer) to authenticated, service_role;
grant execute on function public.get_jornada_professor(integer) to authenticated, service_role;
