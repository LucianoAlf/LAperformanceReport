create table if not exists public.emusys_experimentais_raw (
  id bigserial primary key,
  raw_key text not null,
  emusys_aula_id integer not null,
  aula_emusys_id integer references public.aulas_emusys(id) on delete set null,
  unidade_id uuid not null references public.unidades(id),
  data_aula date not null,
  horario_aula time without time zone,
  aluno_nome text not null,
  aluno_nome_normalizado text not null,
  aluno_telefone text not null default '',
  responsavel_nome text,
  responsavel_telefone text,
  professor_nome text,
  professor_id integer references public.professores(id),
  curso_nome text,
  curso_id integer references public.cursos(id),
  presenca_emusys text,
  situacao_operacional text not null default 'desconhecida',
  lead_id integer references public.leads(id) on delete set null,
  aluno_id integer references public.alunos(id) on delete set null,
  lead_experimental_id integer references public.lead_experimentais(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint emusys_experimentais_raw_situacao_check check (
    situacao_operacional in (
      'presente',
      'matriculado',
      'faltou',
      'cancelada',
      'desconhecida'
    )
  )
);

create unique index if not exists emusys_experimentais_raw_raw_key_idx
  on public.emusys_experimentais_raw (raw_key);

create index if not exists emusys_experimentais_raw_unidade_data_idx
  on public.emusys_experimentais_raw (unidade_id, data_aula);

create index if not exists emusys_experimentais_raw_situacao_idx
  on public.emusys_experimentais_raw (situacao_operacional);

create index if not exists emusys_experimentais_raw_aluno_idx
  on public.emusys_experimentais_raw (aluno_id);

drop trigger if exists trg_emusys_experimentais_raw_updated_at on public.emusys_experimentais_raw;
create trigger trg_emusys_experimentais_raw_updated_at
  before update on public.emusys_experimentais_raw
  for each row
  execute function public.update_updated_at_column();

alter table public.emusys_experimentais_raw enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'emusys_experimentais_raw'
      and policyname = 'emusys_experimentais_raw_select_authenticated'
  ) then
    create policy emusys_experimentais_raw_select_authenticated
      on public.emusys_experimentais_raw
      for select
      to authenticated
      using (true);
  end if;
end $$;

comment on table public.emusys_experimentais_raw is
  'Bruto por aluno das aulas experimentais do Emusys. Nao altera lead_experimentais, status, presenca ou KPI canonico.';

create or replace function public.get_experimentais_emusys_operacional_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodo text default 'mensal',
  p_data date default null
)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with periodo as (
    select
      case
        when lower(coalesce(p_periodo, 'mensal')) = 'diario'
          then coalesce(p_data, make_date(p_ano, p_mes, 1))
        else make_date(p_ano, p_mes, 1)
      end as data_inicio,
      case
        when lower(coalesce(p_periodo, 'mensal')) = 'diario'
          then coalesce(p_data, make_date(p_ano, p_mes, 1)) + interval '1 day'
        else make_date(p_ano, p_mes, 1) + interval '1 month'
      end as data_fim_exclusivo
  ),
  base as (
    select r.*
    from public.emusys_experimentais_raw r
    cross join periodo p
    where r.data_aula >= p.data_inicio
      and r.data_aula < p.data_fim_exclusivo
      and (p_unidade_id is null or r.unidade_id = p_unidade_id)
  ),
  por_unidade as (
    select
      u.id as unidade_id,
      u.nome as unidade_nome,
      count(b.*)::integer as linhas_raw,
      count(b.*) filter (where b.situacao_operacional = 'presente')::integer as presentes,
      count(b.*) filter (where b.situacao_operacional = 'matriculado')::integer as matriculados,
      count(b.*) filter (where b.situacao_operacional in ('presente', 'matriculado'))::integer as realizadas_emusys,
      count(b.*) filter (where b.situacao_operacional = 'faltou')::integer as faltas,
      count(b.*) filter (where b.situacao_operacional = 'cancelada')::integer as canceladas,
      count(b.*) filter (where b.aluno_id is null)::integer as sem_aluno_id,
      count(b.*) filter (where b.lead_id is null)::integer as sem_lead_id
    from public.unidades u
    left join base b on b.unidade_id = u.id
    where p_unidade_id is null or u.id = p_unidade_id
    group by u.id, u.nome
  ),
  total as (
    select
      count(*)::integer as linhas_raw,
      count(*) filter (where situacao_operacional = 'presente')::integer as presentes,
      count(*) filter (where situacao_operacional = 'matriculado')::integer as matriculados,
      count(*) filter (where situacao_operacional in ('presente', 'matriculado'))::integer as realizadas_emusys,
      count(*) filter (where situacao_operacional = 'faltou')::integer as faltas,
      count(*) filter (where situacao_operacional = 'cancelada')::integer as canceladas,
      count(*) filter (where aluno_id is null)::integer as sem_aluno_id,
      count(*) filter (where lead_id is null)::integer as sem_lead_id
    from base
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object(
      'ano', p_ano,
      'mes', p_mes,
      'tipo', lower(coalesce(p_periodo, 'mensal')),
      'data', p_data
    ),
    'resumo', jsonb_build_object(
      'linhas_raw', total.linhas_raw,
      'presentes', total.presentes,
      'matriculados', total.matriculados,
      'realizadas_emusys', total.realizadas_emusys,
      'faltas', total.faltas,
      'canceladas', total.canceladas,
      'sem_aluno_id', total.sem_aluno_id,
      'sem_lead_id', total.sem_lead_id
    ),
    'por_unidade', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'unidade_id', unidade_id,
            'unidade_nome', unidade_nome,
            'linhas_raw', linhas_raw,
            'presentes', presentes,
            'matriculados', matriculados,
            'realizadas_emusys', realizadas_emusys,
            'faltas', faltas,
            'canceladas', canceladas,
            'sem_aluno_id', sem_aluno_id,
            'sem_lead_id', sem_lead_id
          )
          order by unidade_nome
        )
        from por_unidade
      ),
      '[]'::jsonb
    )
  )
  from total;
$$;

revoke all on function public.get_experimentais_emusys_operacional_v1(uuid, integer, integer, text, date) from public, anon;
grant execute on function public.get_experimentais_emusys_operacional_v1(uuid, integer, integer, text, date) to authenticated, service_role;

comment on function public.get_experimentais_emusys_operacional_v1(uuid, integer, integer, text, date) is
  'Resumo operacional SELECT-only das experimentais brutas do Emusys por aluno. Nao e denominador oficial de taxa Exp->Mat.';
