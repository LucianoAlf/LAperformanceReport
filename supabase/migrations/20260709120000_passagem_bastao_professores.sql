-- Passagem de bastao entre professores
-- Camada fria: transicao automatica por matricula/disciplina.
-- Camada quente: pendencia humana para o professor de origem responder no LA Teacher.

create table if not exists public.aluno_professor_transicoes (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id) on delete cascade,
  aluno_id integer references public.alunos(id) on delete set null,
  emusys_matricula_id bigint,
  emusys_matricula_disciplina_id bigint not null,
  curso_id integer references public.cursos(id) on delete set null,
  curso_anterior_id integer references public.cursos(id) on delete set null,
  professor_anterior_id integer references public.professores(id) on delete set null,
  professor_novo_id integer references public.professores(id) on delete set null,
  emusys_professor_anterior_id bigint,
  emusys_professor_novo_id bigint,
  data_transicao timestamptz not null default now(),
  tipo_transicao text not null default 'troca_professor',
  descricao_emusys text,
  automacao_log_id bigint references public.automacao_log(id) on delete set null,
  payload_snapshot jsonb not null default '{}'::jsonb,
  fonte text not null default 'webhook:matricula_alterada',
  created_at timestamptz not null default now()
);

create index if not exists idx_aluno_professor_transicoes_aluno
  on public.aluno_professor_transicoes (aluno_id, data_transicao desc);

create index if not exists idx_aluno_professor_transicoes_origem
  on public.aluno_professor_transicoes (professor_anterior_id, data_transicao desc);

create index if not exists idx_aluno_professor_transicoes_destino
  on public.aluno_professor_transicoes (professor_novo_id, data_transicao desc);

create index if not exists idx_aluno_professor_transicoes_disciplina
  on public.aluno_professor_transicoes (unidade_id, emusys_matricula_disciplina_id);

create unique index if not exists uq_aluno_professor_transicoes_evento
  on public.aluno_professor_transicoes (
    unidade_id,
    emusys_matricula_disciplina_id,
    coalesce(emusys_professor_anterior_id, -1),
    coalesce(emusys_professor_novo_id, -1),
    data_transicao
  );

create table if not exists public.professor_passagem_bastao (
  id uuid primary key default gen_random_uuid(),
  transicao_id uuid not null references public.aluno_professor_transicoes(id) on delete cascade,
  aluno_id integer references public.alunos(id) on delete set null,
  emusys_matricula_disciplina_id bigint not null,
  curso_id integer references public.cursos(id) on delete set null,
  professor_origem_id integer references public.professores(id) on delete set null,
  professor_destino_id integer references public.professores(id) on delete set null,
  status text not null default 'pendente',
  motivo_dispensa text,
  resposta_texto text,
  audio_url text,
  transcricao text,
  resumo_ia text,
  created_at timestamptz not null default now(),
  respondido_em timestamptz,
  constraint professor_passagem_bastao_status_check
    check (status in ('pendente', 'respondido', 'dispensado')),
  constraint professor_passagem_bastao_transicao_unique
    unique (transicao_id)
);

create index if not exists idx_professor_passagem_bastao_origem_status
  on public.professor_passagem_bastao (professor_origem_id, status, created_at desc);

create index if not exists idx_professor_passagem_bastao_destino
  on public.professor_passagem_bastao (professor_destino_id, created_at desc);

create index if not exists idx_professor_passagem_bastao_aluno
  on public.professor_passagem_bastao (aluno_id, created_at desc);

create or replace function public.passagem_bastao_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(auth.role(), '') = 'service_role'
    or exists (
      select 1
      from public.usuarios u
      where u.auth_user_id = auth.uid()
        and coalesce(u.ativo, true)
        and u.perfil = 'admin'
    );
$$;

create or replace function public.passagem_bastao_is_professor(p_professor_id integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_professor_id is not null
    and exists (
      select 1
      from public.professores p
      join public.usuarios u on u.id = p.usuario_id
      where p.id = p_professor_id
        and u.auth_user_id = auth.uid()
        and coalesce(p.ativo, true)
        and coalesce(u.ativo, true)
    );
$$;

alter table public.aluno_professor_transicoes enable row level security;
alter table public.professor_passagem_bastao enable row level security;

drop policy if exists "service_role_all_aluno_professor_transicoes"
  on public.aluno_professor_transicoes;
create policy "service_role_all_aluno_professor_transicoes"
  on public.aluno_professor_transicoes
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "authenticated_select_aluno_professor_transicoes"
  on public.aluno_professor_transicoes;
create policy "authenticated_select_aluno_professor_transicoes"
  on public.aluno_professor_transicoes
  for select
  to authenticated
  using (
    public.passagem_bastao_is_admin()
    or public.passagem_bastao_is_professor(professor_anterior_id)
    or public.passagem_bastao_is_professor(professor_novo_id)
  );

drop policy if exists "service_role_all_professor_passagem_bastao"
  on public.professor_passagem_bastao;
create policy "service_role_all_professor_passagem_bastao"
  on public.professor_passagem_bastao
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "authenticated_select_professor_passagem_bastao"
  on public.professor_passagem_bastao;
create policy "authenticated_select_professor_passagem_bastao"
  on public.professor_passagem_bastao
  for select
  to authenticated
  using (
    public.passagem_bastao_is_admin()
    or public.passagem_bastao_is_professor(professor_origem_id)
    or public.passagem_bastao_is_professor(professor_destino_id)
  );

create or replace function public.get_passagens_bastao_pendentes(p_professor_id integer)
returns table (
  id uuid,
  transicao_id uuid,
  aluno_id integer,
  aluno_nome text,
  emusys_matricula_disciplina_id bigint,
  curso_id integer,
  curso_nome text,
  professor_origem_id integer,
  professor_origem_nome text,
  professor_destino_id integer,
  professor_destino_nome text,
  data_transicao timestamptz,
  descricao_emusys text,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (
    public.passagem_bastao_is_admin()
    or public.passagem_bastao_is_professor(p_professor_id)
  ) then
    raise exception 'Acesso negado para professor %', p_professor_id
      using errcode = '42501';
  end if;

  return query
  select
    pb.id,
    pb.transicao_id,
    pb.aluno_id,
    a.nome::text as aluno_nome,
    pb.emusys_matricula_disciplina_id,
    pb.curso_id,
    c.nome::text as curso_nome,
    pb.professor_origem_id,
    po.nome::text as professor_origem_nome,
    pb.professor_destino_id,
    pd.nome::text as professor_destino_nome,
    t.data_transicao,
    t.descricao_emusys,
    pb.status,
    pb.created_at
  from public.professor_passagem_bastao pb
  join public.aluno_professor_transicoes t on t.id = pb.transicao_id
  left join public.alunos a on a.id = pb.aluno_id
  left join public.cursos c on c.id = pb.curso_id
  left join public.professores po on po.id = pb.professor_origem_id
  left join public.professores pd on pd.id = pb.professor_destino_id
  where pb.professor_origem_id = p_professor_id
    and pb.status = 'pendente'
  order by t.data_transicao desc, pb.created_at desc;
end;
$$;

create or replace function public.responder_passagem_bastao(
  p_id uuid,
  p_texto text default null,
  p_audio_url text default null
)
returns table (
  id uuid,
  status text,
  respondido_em timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_passagem public.professor_passagem_bastao%rowtype;
begin
  select *
  into v_passagem
  from public.professor_passagem_bastao
  where professor_passagem_bastao.id = p_id;

  if not found then
    raise exception 'Passagem de bastao nao encontrada: %', p_id
      using errcode = 'P0002';
  end if;

  if not (
    public.passagem_bastao_is_admin()
    or public.passagem_bastao_is_professor(v_passagem.professor_origem_id)
  ) then
    raise exception 'Acesso negado para responder passagem %', p_id
      using errcode = '42501';
  end if;

  return query
  update public.professor_passagem_bastao pb
  set
    resposta_texto = nullif(trim(p_texto), ''),
    audio_url = nullif(trim(p_audio_url), ''),
    status = 'respondido',
    respondido_em = now()
  where pb.id = p_id
  returning pb.id, pb.status, pb.respondido_em;
end;
$$;

create or replace function public.dispensar_passagem_bastao(
  p_id uuid,
  p_motivo text default null
)
returns table (
  id uuid,
  status text,
  motivo_dispensa text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_passagem public.professor_passagem_bastao%rowtype;
begin
  select *
  into v_passagem
  from public.professor_passagem_bastao
  where professor_passagem_bastao.id = p_id;

  if not found then
    raise exception 'Passagem de bastao nao encontrada: %', p_id
      using errcode = 'P0002';
  end if;

  if not (
    public.passagem_bastao_is_admin()
    or public.passagem_bastao_is_professor(v_passagem.professor_origem_id)
  ) then
    raise exception 'Acesso negado para dispensar passagem %', p_id
      using errcode = '42501';
  end if;

  return query
  update public.professor_passagem_bastao pb
  set
    motivo_dispensa = nullif(trim(p_motivo), ''),
    status = 'dispensado'
  where pb.id = p_id
  returning pb.id, pb.status, pb.motivo_dispensa;
end;
$$;

create or replace function public.get_passagem_bastao_aluno(p_aluno_id integer)
returns table (
  id uuid,
  transicao_id uuid,
  aluno_id integer,
  aluno_nome text,
  emusys_matricula_disciplina_id bigint,
  curso_id integer,
  curso_nome text,
  professor_origem_id integer,
  professor_origem_nome text,
  professor_destino_id integer,
  professor_destino_nome text,
  status text,
  motivo_dispensa text,
  resposta_texto text,
  audio_url text,
  transcricao text,
  resumo_ia text,
  data_transicao timestamptz,
  respondido_em timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.professor_passagem_bastao pb
    where pb.aluno_id = p_aluno_id
      and (
        public.passagem_bastao_is_admin()
        or public.passagem_bastao_is_professor(pb.professor_origem_id)
        or public.passagem_bastao_is_professor(pb.professor_destino_id)
      )
  ) then
    return;
  end if;

  return query
  select
    pb.id,
    pb.transicao_id,
    pb.aluno_id,
    a.nome::text as aluno_nome,
    pb.emusys_matricula_disciplina_id,
    pb.curso_id,
    c.nome::text as curso_nome,
    pb.professor_origem_id,
    po.nome::text as professor_origem_nome,
    pb.professor_destino_id,
    pd.nome::text as professor_destino_nome,
    pb.status,
    pb.motivo_dispensa,
    pb.resposta_texto,
    pb.audio_url,
    pb.transcricao,
    pb.resumo_ia,
    t.data_transicao,
    pb.respondido_em,
    pb.created_at
  from public.professor_passagem_bastao pb
  join public.aluno_professor_transicoes t on t.id = pb.transicao_id
  left join public.alunos a on a.id = pb.aluno_id
  left join public.cursos c on c.id = pb.curso_id
  left join public.professores po on po.id = pb.professor_origem_id
  left join public.professores pd on pd.id = pb.professor_destino_id
  where pb.aluno_id = p_aluno_id
    and (
      public.passagem_bastao_is_admin()
      or public.passagem_bastao_is_professor(pb.professor_origem_id)
      or public.passagem_bastao_is_professor(pb.professor_destino_id)
    )
  order by t.data_transicao desc, pb.created_at desc;
end;
$$;

grant select on public.aluno_professor_transicoes to authenticated, service_role;
grant select on public.professor_passagem_bastao to authenticated, service_role;
grant insert, update, delete on public.aluno_professor_transicoes to service_role;
grant insert, update, delete on public.professor_passagem_bastao to service_role;

grant execute on function public.passagem_bastao_is_admin() to authenticated, service_role;
grant execute on function public.passagem_bastao_is_professor(integer) to authenticated, service_role;
grant execute on function public.get_passagens_bastao_pendentes(integer) to authenticated, service_role;
grant execute on function public.responder_passagem_bastao(uuid, text, text) to authenticated, service_role;
grant execute on function public.dispensar_passagem_bastao(uuid, text) to authenticated, service_role;
grant execute on function public.get_passagem_bastao_aluno(integer) to authenticated, service_role;

comment on table public.aluno_professor_transicoes is
  'Camada fria: registro automatico de troca de professor por matricula/disciplina.';
comment on table public.professor_passagem_bastao is
  'Camada quente: pendencia humana de passagem de bastao para LA Teacher/Fabio.';
