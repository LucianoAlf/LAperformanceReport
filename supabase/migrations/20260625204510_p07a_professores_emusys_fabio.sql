-- P07A - Professor identity by unit for Fabio and Emusys reconciliation.
-- Safe migration: no destructive changes, no mass overwrite.

alter table public.professores_unidades
  add column if not exists emusys_nome text,
  add column if not exists emusys_nome_normalizado text,
  add column if not exists emusys_ativo boolean not null default true,
  add column if not exists validacao_status text not null default 'pendente',
  add column if not exists match_score numeric(5,2),
  add column if not exists origem text not null default 'la_report',
  add column if not exists payload_emusys jsonb not null default '{}'::jsonb,
  add column if not exists validado_em timestamptz,
  add column if not exists validado_por text,
  add column if not exists last_seen_em timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.professores_unidades
set
  validacao_status = case
    when emusys_id is not null and validacao_status = 'pendente' then 'preexistente'
    else validacao_status
  end,
  origem = case
    when emusys_id is not null and origem = 'la_report' then 'la_report_legacy'
    else origem
  end,
  updated_at = now()
where emusys_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'professores_unidades_validacao_status_check'
      and conrelid = 'public.professores_unidades'::regclass
  ) then
    alter table public.professores_unidades
      add constraint professores_unidades_validacao_status_check
      check (validacao_status in (
        'pendente',
        'preexistente',
        'auto_match',
        'validado_humano',
        'conflito',
        'ignorado'
      ));
  end if;
end $$;

create unique index if not exists professores_unidades_unidade_emusys_id_uq
  on public.professores_unidades (unidade_id, emusys_id)
  where emusys_id is not null;

create index if not exists idx_professores_unidades_validacao_status
  on public.professores_unidades (validacao_status);

drop trigger if exists set_updated_at_professores_unidades on public.professores_unidades;
create trigger set_updated_at_professores_unidades
  before update on public.professores_unidades
  for each row
  execute function public.set_updated_at();

create table if not exists public.professores_emusys_divergencias (
  id bigserial primary key,
  unidade_id uuid not null references public.unidades(id),
  professor_id integer references public.professores(id),
  professores_unidade_id integer references public.professores_unidades(id),
  emusys_professor_id integer,
  tipo_divergencia text not null check (tipo_divergencia in (
    'sem_vinculo_la',
    'so_no_emusys',
    'so_no_la',
    'nome_divergente',
    'id_duplicado',
    'conflito_unidade'
  )),
  nome_la text,
  nome_emusys text,
  valor_nosso jsonb not null default '{}'::jsonb,
  valor_emusys jsonb not null default '{}'::jsonb,
  sugestao jsonb not null default '{}'::jsonb,
  severidade text not null default 'media' check (severidade in ('baixa', 'media', 'alta')),
  resolvido boolean not null default false,
  decisao text,
  decidido_por text,
  decidido_em timestamptz,
  detectado_em timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_professores_emusys_divergencias_unidade
  on public.professores_emusys_divergencias (unidade_id);

create index if not exists idx_professores_emusys_divergencias_pendentes
  on public.professores_emusys_divergencias (resolvido, tipo_divergencia, severidade);

create unique index if not exists professores_emusys_divergencias_pendente_uq
  on public.professores_emusys_divergencias (
    unidade_id,
    tipo_divergencia,
    coalesce(emusys_professor_id, -1),
    coalesce(professor_id, -1)
  )
  where resolvido = false;

drop trigger if exists set_updated_at_professores_emusys_divergencias
  on public.professores_emusys_divergencias;
create trigger set_updated_at_professores_emusys_divergencias
  before update on public.professores_emusys_divergencias
  for each row
  execute function public.set_updated_at();

create table if not exists public.alunos_emusys_atributos_divergencias (
  id bigserial primary key,
  unidade_id uuid not null references public.unidades(id),
  aluno_id integer references public.alunos(id),
  emusys_student_id text,
  emusys_matricula_id text,
  tipo_divergencia text not null check (tipo_divergencia in (
    'foto_ausente',
    'instagram_ausente',
    'instagram_divergente',
    'contato_divergente',
    'responsavel_divergente',
    'status_financeiro_divergente',
    'forma_pagamento_divergente',
    'anamnese_pendente',
    'contrato_assinatura_pendente'
  )),
  campo text not null,
  valor_nosso jsonb not null default '{}'::jsonb,
  valor_emusys jsonb not null default '{}'::jsonb,
  sugestao jsonb not null default '{}'::jsonb,
  fonte text not null default 'emusys_matriculas',
  severidade text not null default 'media' check (severidade in ('baixa', 'media', 'alta')),
  resolvido boolean not null default false,
  decisao text,
  decidido_por text,
  decidido_em timestamptz,
  detectado_em timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_alunos_emusys_atributos_unidade
  on public.alunos_emusys_atributos_divergencias (unidade_id);

create index if not exists idx_alunos_emusys_atributos_pendentes
  on public.alunos_emusys_atributos_divergencias (resolvido, tipo_divergencia, severidade);

create unique index if not exists alunos_emusys_atributos_pendente_uq
  on public.alunos_emusys_atributos_divergencias (
    unidade_id,
    coalesce(aluno_id, -1),
    coalesce(emusys_matricula_id, ''),
    tipo_divergencia,
    campo
  )
  where resolvido = false;

drop trigger if exists set_updated_at_alunos_emusys_atributos_divergencias
  on public.alunos_emusys_atributos_divergencias;
create trigger set_updated_at_alunos_emusys_atributos_divergencias
  before update on public.alunos_emusys_atributos_divergencias
  for each row
  execute function public.set_updated_at();

create or replace view public.vw_professores_emusys_vinculos as
select
  pu.id as professores_unidade_id,
  pu.unidade_id,
  u.codigo as unidade_codigo,
  u.nome as unidade_nome,
  pu.professor_id,
  p.nome as professor_nome,
  p.nome_normalizado as professor_nome_normalizado,
  p.ativo as professor_ativo,
  pu.emusys_id as emusys_professor_id,
  pu.emusys_nome,
  pu.emusys_nome_normalizado,
  pu.emusys_ativo,
  pu.validacao_status,
  pu.match_score,
  pu.origem,
  pu.validado_em,
  pu.validado_por,
  pu.last_seen_em,
  pu.updated_at,
  case
    when pu.emusys_id is null then 'sem_emusys_id'
    when pu.validacao_status in ('validado_humano', 'auto_match', 'preexistente') then 'vinculo_utilizavel'
    else 'revisar'
  end as qualidade_vinculo
from public.professores_unidades pu
join public.professores p on p.id = pu.professor_id
join public.unidades u on u.id = pu.unidade_id;

create or replace view public.vw_fabio_carteira_professor as
select
  a.unidade_id,
  u.codigo as unidade_codigo,
  u.nome as unidade_nome,
  p.id as professor_id,
  p.nome as professor_nome,
  pu.id as professores_unidade_id,
  pu.emusys_id as emusys_professor_id,
  pu.validacao_status as professor_emusys_validacao_status,
  a.id as aluno_id,
  a.nome as aluno_nome,
  a.emusys_student_id,
  a.emusys_matricula_id,
  a.status as aluno_status,
  c.id as curso_id,
  c.nome as curso_nome,
  tm.codigo as tipo_matricula_codigo,
  tm.nome as tipo_matricula_nome,
  a.dia_aula,
  a.horario_aula,
  a.telefone,
  a.whatsapp,
  a.email,
  a.responsavel_nome,
  a.responsavel_telefone,
  a.valor_parcela,
  case
    when p.id is null then 'sem_professor_la'
    when pu.emusys_id is null then 'professor_sem_emusys_id'
    when a.emusys_student_id is null or a.emusys_matricula_id is null then 'aluno_sem_id_emusys'
    when a.dia_aula is null or a.horario_aula is null then 'sem_horario'
    else 'ok'
  end as qualidade_contexto
from public.alunos a
join public.unidades u on u.id = a.unidade_id
left join public.professores p on p.id = a.professor_atual_id
left join public.professores_unidades pu
  on pu.professor_id = p.id
 and pu.unidade_id = a.unidade_id
left join public.cursos c on c.id = a.curso_id
left join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
where coalesce(a.status, 'ativo') = 'ativo'
  and a.arquivado_em is null;

create or replace view public.vw_fabio_aulas_contexto as
select
  ae.id as aula_local_id,
  ae.emusys_id as aula_emusys_id,
  ae.unidade_id,
  u.codigo as unidade_codigo,
  u.nome as unidade_nome,
  ae.data_aula,
  ae.data_hora_inicio,
  ae.data_hora_fim,
  (ae.data_hora_inicio at time zone 'America/Sao_Paulo')::time as horario_inicio_brt,
  (ae.data_hora_fim at time zone 'America/Sao_Paulo')::time as horario_fim_brt,
  ae.tipo as aula_tipo,
  ae.categoria as aula_categoria,
  ae.turma_nome,
  ae.curso_emusys_id,
  ae.curso_nome,
  ae.sala_nome,
  ae.professor_id as emusys_professor_id,
  ae.professor_nome as emusys_professor_nome,
  pu.professor_id as professor_id,
  p.nome as professor_nome,
  pu.validacao_status as professor_emusys_validacao_status,
  ap.aluno_id,
  a.nome as aluno_nome,
  a.emusys_student_id,
  a.emusys_matricula_id,
  ap.status as presenca_status,
  ap.respondido_em as presenca_respondida_em,
  ae.cancelada,
  ae.nr_da_aula,
  ae.qtd_alunos,
  ae.anotacoes,
  ae.anotacoes_fabio,
  case
    when pu.professor_id is null then 'professor_sem_vinculo_la'
    when ap.aluno_id is null then 'aula_sem_aluno_presenca'
    when a.id is null then 'presenca_sem_aluno_la'
    else 'ok'
  end as qualidade_contexto
from public.aulas_emusys ae
join public.unidades u on u.id = ae.unidade_id
left join public.professores_unidades pu
  on pu.unidade_id = ae.unidade_id
 and pu.emusys_id = ae.professor_id
left join public.professores p on p.id = pu.professor_id
left join public.aluno_presenca ap
  on ap.unidade_id = ae.unidade_id
 and ap.aula_emusys_id = ae.emusys_id
left join public.alunos a on a.id = ap.aluno_id;

create or replace function public.get_conciliacao_professores_emusys(p_unidade_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'resumo', jsonb_build_object(
      'total_pendente', count(*) filter (where d.resolvido = false),
      'sem_vinculo_la', count(*) filter (where d.resolvido = false and d.tipo_divergencia = 'sem_vinculo_la'),
      'so_no_emusys', count(*) filter (where d.resolvido = false and d.tipo_divergencia = 'so_no_emusys'),
      'so_no_la', count(*) filter (where d.resolvido = false and d.tipo_divergencia = 'so_no_la'),
      'nome_divergente', count(*) filter (where d.resolvido = false and d.tipo_divergencia = 'nome_divergente'),
      'id_duplicado', count(*) filter (where d.resolvido = false and d.tipo_divergencia = 'id_duplicado'),
      'conflito_unidade', count(*) filter (where d.resolvido = false and d.tipo_divergencia = 'conflito_unidade')
    ),
    'items', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'unidade_id', d.unidade_id,
          'professor_id', d.professor_id,
          'professores_unidade_id', d.professores_unidade_id,
          'emusys_professor_id', d.emusys_professor_id,
          'tipo_divergencia', d.tipo_divergencia,
          'nome_la', d.nome_la,
          'nome_emusys', d.nome_emusys,
          'valor_nosso', d.valor_nosso,
          'valor_emusys', d.valor_emusys,
          'sugestao', d.sugestao,
          'severidade', d.severidade,
          'detectado_em', d.detectado_em
        )
        order by d.severidade desc, d.tipo_divergencia, d.detectado_em
      ) filter (where d.resolvido = false),
      '[]'::jsonb
    )
  )
  from public.professores_emusys_divergencias d
  where (p_unidade_id is null or d.unidade_id = p_unidade_id);
$$;

create or replace function public.get_fabio_aulas_do_professor(
  p_unidade_id uuid default null,
  p_emusys_professor_id integer default null,
  p_data_aula date default current_date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'data_aula', p_data_aula,
    'total', count(*),
    'aulas', coalesce(
      jsonb_agg(to_jsonb(v) order by v.data_hora_inicio, v.aluno_nome)
        filter (where v.aula_local_id is not null),
      '[]'::jsonb
    )
  )
  from public.vw_fabio_aulas_contexto v
  where (p_unidade_id is null or v.unidade_id = p_unidade_id)
    and (p_emusys_professor_id is null or v.emusys_professor_id = p_emusys_professor_id)
    and v.data_aula = p_data_aula;
$$;

grant select on public.vw_professores_emusys_vinculos to anon, authenticated;
grant select on public.vw_fabio_carteira_professor to anon, authenticated;
grant select on public.vw_fabio_aulas_contexto to anon, authenticated;
grant execute on function public.get_conciliacao_professores_emusys(uuid) to anon, authenticated;
grant execute on function public.get_fabio_aulas_do_professor(uuid, integer, date) to anon, authenticated;
