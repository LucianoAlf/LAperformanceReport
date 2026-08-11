-- 2026-08-12 — Motor de Projeção de Contrato: tabelas do motor
--
-- Base: docs/superpowers/specs/2026-08-11-motor-projecao-contrato.md
-- O motor cruza o que o Emusys já manda (primeira e última aula) com o
-- calendário real da escola (feriados, recessos, emendas) para projetar
-- quando o contrato termina e alertar quando não fecha.

-- 1. Calendário escolar: recessos e emendas por unidade/ano
create table if not exists calendario_escolar (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id),
  ano integer not null,
  tipo text not null check (tipo in ('recesso', 'emenda')),
  data_inicio date not null,
  data_fim date not null,
  nome text not null,
  status text not null default 'confirmado' check (status in ('simulado', 'confirmado')),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unidade_id, ano, tipo, data_inicio)
);

comment on table calendario_escolar is
  'Recessos e emendas por unidade/ano. Feriados continuam em feriados (globais). Emenda simulada é teste; confirmada entra no cálculo da projeção.';

-- 2. Projeção materializada — cada aula do contrato com data prevista
create table if not exists projecao_aulas (
  id uuid primary key default gen_random_uuid(),
  aluno_id integer not null references alunos(id),
  matricula_disciplina_id bigint not null,
  unidade_id uuid not null references unidades(id),
  sequencia integer not null,
  data_projetada date not null,
  dia_semana text not null,
  status text not null default 'projetada' check (status in (
    'projetada',
    'realizada',
    'falta',
    'falta_justificada',
    'reposta',
    'debitada_evento',
    'cancelada'
  )),
  versao integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (aluno_id, matricula_disciplina_id, sequencia)
);

comment on table projecao_aulas is
  'Projeção materializada das aulas do contrato. Cada linha é uma aula com data prevista. A versão incrementa a cada recálculo.';

create index if not exists idx_projecao_aulas_contrato on projecao_aulas (aluno_id, matricula_disciplina_id, versao);
create index if not exists idx_projecao_aulas_data on projecao_aulas (unidade_id, data_projetada);
create index if not exists idx_projecao_aulas_status on projecao_aulas (status, data_projetada);

-- 3. Auditoria de recálculo
create table if not exists projecao_recaculo_log (
  id uuid primary key default gen_random_uuid(),
  aluno_id integer not null,
  matricula_disciplina_id bigint not null,
  trigger_evento text not null,
  versao_anterior integer not null,
  versao_nova integer not null,
  detalhes jsonb,
  created_at timestamptz not null default now()
);

comment on table projecao_recaculo_log is
  'Auditoria de cada recálculo da projeção. Por que a data mudou.';

create index if not exists idx_projecao_recaculo_contrato on projecao_recaculo_log (aluno_id, matricula_disciplina_id, created_at);

-- Grants
grant select on calendario_escolar to authenticated;
grant insert, update, delete on calendario_escolar to authenticated;
grant select on projecao_aulas to authenticated;
grant insert, update on projecao_aulas to authenticated;
grant select on projecao_recaculo_log to authenticated;
grant insert on projecao_recaculo_log to authenticated;

-- RLS
alter table calendario_escolar enable row level security;
alter table projecao_aulas enable row level security;
alter table projecao_recaculo_log enable row level security;

-- Políticas: usuário só vê/edita da sua unidade (ou consolidado se tiver permissão)
create policy calendario_escolar_select on calendario_escolar
  for select to authenticated
  using (
    unidade_id in (
      select unidade_id from usuarios where auth_user_id = auth.uid() and coalesce(ativo, true)
    )
    or exists (
      select 1 from usuarios where auth_user_id = auth.uid() and coalesce(ativo, true) and perfil = 'admin'
    )
  );

create policy calendario_escolar_insert on calendario_escolar
  for insert to authenticated
  with check (
    unidade_id in (
      select unidade_id from usuarios where auth_user_id = auth.uid() and coalesce(ativo, true)
    )
    or exists (
      select 1 from usuarios where auth_user_id = auth.uid() and coalesce(ativo, true) and perfil = 'admin'
    )
  );

create policy calendario_escolar_update on calendario_escolar
  for update to authenticated
  using (
    unidade_id in (
      select unidade_id from usuarios where auth_user_id = auth.uid() and coalesce(ativo, true)
    )
    or exists (
      select 1 from usuarios where auth_user_id = auth.uid() and coalesce(ativo, true) and perfil = 'admin'
    )
  );

create policy projecao_aulas_select on projecao_aulas
  for select to authenticated
  using (
    unidade_id in (
      select unidade_id from usuarios where auth_user_id = auth.uid() and coalesce(ativo, true)
    )
    or exists (
      select 1 from usuarios where auth_user_id = auth.uid() and coalesce(ativo, true) and perfil = 'admin'
    )
  );

create policy projecao_aulas_insert on projecao_aulas
  for insert to authenticated
  with check (
    unidade_id in (
      select unidade_id from usuarios where auth_user_id = auth.uid() and coalesce(ativo, true)
    )
    or exists (
      select 1 from usuarios where auth_user_id = auth.uid() and coalesce(ativo, true) and perfil = 'admin'
    )
  );

create policy projecao_aulas_update on projecao_aulas
  for update to authenticated
  using (
    unidade_id in (
      select unidade_id from usuarios where auth_user_id = auth.uid() and coalesce(ativo, true)
    )
    or exists (
      select 1 from usuarios where auth_user_id = auth.uid() and coalesce(ativo, true) and perfil = 'admin'
    )
  );

create policy projecao_recaculo_log_select on projecao_recaculo_log
  for select to authenticated
  using (
    aluno_id in (
      select id from alunos where unidade_id in (
        select unidade_id from usuarios where auth_user_id = auth.uid() and coalesce(ativo, true)
      )
    )
    or exists (
      select 1 from usuarios where auth_user_id = auth.uid() and coalesce(ativo, true) and perfil = 'admin'
    )
  );

create policy projecao_recaculo_log_insert on projecao_recaculo_log
  for insert to authenticated
  with check (true); -- log é sempre permitido
