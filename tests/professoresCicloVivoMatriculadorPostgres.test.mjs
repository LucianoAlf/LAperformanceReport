import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260908230249_professores_ciclo_vivo_matriculador_canonico.sql',
);
const unitIds = [
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
];
const campoGrande = unitIds[1];

const dockerWindows = path.join(
  process.env.LOCALAPPDATA || '',
  'Programs',
  'DockerDesktop',
  'resources',
  'bin',
  'docker.exe',
);
const dockerExecutable = process.platform === 'win32' && existsSync(dockerWindows)
  ? dockerWindows
  : 'docker';

function docker(args, input) {
  return spawnSync(dockerExecutable, args, {
    input,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

function psql(container, sql) {
  return docker([
    'exec', '-i', container,
    'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-qAt',
  ], sql);
}

async function waitForPostgres(container) {
  let consecutiveReadyChecks = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (psql(container, 'select 1;').status === 0) {
      consecutiveReadyChecks += 1;
      if (consecutiveReadyChecks === 2) return;
    } else {
      consecutiveReadyChecks = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL do ciclo vivo não iniciou a tempo');
}

const setupSql = String.raw`
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create schema cron;

create function auth.role()
returns text language sql stable as $$
  select coalesce(current_setting('request.jwt.claim.role', true), 'anon')
$$;
create function auth.uid()
returns uuid language sql stable as $$ select null::uuid $$;

create table public.unidades (
  id uuid primary key,
  ativo boolean not null,
  nome text not null
);
insert into public.unidades (id, ativo, nome) values
  ('${unitIds[0]}', true, 'Barra'),
  ('${unitIds[1]}', true, 'Campo Grande'),
  ('${unitIds[2]}', true, 'Recreio');

create table public.usuarios (
  id integer primary key,
  perfil text,
  unidade_id uuid,
  auth_user_id uuid,
  ativo boolean not null default true
);
create function public.usuario_tem_permissao(integer, text, uuid)
returns boolean language sql stable as $$ select false $$;

create table public.alunos (
  id integer primary key,
  professor_experimental_id integer
);
insert into public.alunos (id, professor_experimental_id)
select id, case when id <= 6 then 36 else 44 end
from generate_series(1, 9) as id;

create function public.matriculas_comerciais_v1(uuid, date, date)
returns table (aluno_id integer, conta boolean)
language sql stable security definer
as $$
  select id, true from generate_series(1, 9) as id
$$;

create function public.fn_health_score_professor_v3_ator_leitura(uuid)
returns void language plpgsql security definer
as $$ begin end $$;

create function public.montar_relatorio_coordenacao_payload_v3(uuid, integer, integer, text default 'mensal')
returns jsonb language sql stable security definer
as $$
  select jsonb_build_object(
    'periodo', jsonb_build_object('inicio', '2026-06-01', 'fim', '2026-08-31'),
    'professores', jsonb_build_array(
      jsonb_build_object('professor_id', 36, 'nome', 'Valdo Delfino'),
      jsonb_build_object('professor_id', 44, 'nome', 'Caio Tenório')
    )
  )
$$;

create function public.get_relatorio_coordenacao_canonico_v3(uuid, integer, integer, text default 'mensal')
returns jsonb language plpgsql stable security definer
set search_path to public, pg_temp
as $$
begin
  perform public.fn_health_score_professor_v3_ator_leitura($1);
  return public.montar_relatorio_coordenacao_payload_v3($1, $2, $3, $4);
end;
$$;

create function public.get_carteira_professor_periodo_canonica(integer, integer, uuid, date, date)
returns table (
  professor_id integer,
  unidade_id uuid,
  carteira_alunos integer,
  media_alunos_turma numeric,
  total_turmas integer,
  alunos_via_turmas integer,
  turmas_elegiveis_media integer,
  fonte_carteira text
)
language sql stable security definer
as $$
  select 36, $3, 8, 1.2::numeric, 15, 18, 15, 'fixture'
$$;

create table public.health_score_professor_v3_materializacao_execucoes (
  id uuid primary key default gen_random_uuid(),
  competencia date not null,
  periodicidade text not null,
  escopo text not null,
  unidade_id uuid,
  fingerprint_fonte text not null default 'fixture',
  status text not null default 'iniciada'
);
alter table public.health_score_professor_v3_materializacao_execucoes
  add constraint health_score_professor_v3_materializacao_ex_periodicidade_check
  check (periodicidade = 'mensal');

create function public.get_health_score_professor_v3_performance(date, uuid, text)
returns table (professor_id integer)
language sql stable
as $$ select 1 $$;

create function public.materializar_health_score_professor_v3_escopo_diario(
  p_competencia date, p_periodicidade text, p_escopo text, p_unidade_id uuid
)
returns jsonb
language plpgsql security definer
set search_path to public, pg_temp
as $$
declare
  v_escopo text := lower(trim(coalesce(p_escopo, '')));
begin
  if p_periodicidade <> 'mensal' or v_escopo not in ('unidade', 'consolidado') then
    raise exception 'HEALTH_SCORE_V3_PARAMETRO_INVALIDO: use mensal e escopo explicito';
  end if;
  perform 1 from public.get_health_score_professor_v3_performance(
    p_competencia, p_unidade_id, p_periodicidade
  );
  return jsonb_build_object(
    'status', 'materializado',
    'periodicidade', p_periodicidade,
    'escopo', p_escopo,
    'unidade_id', p_unidade_id
  );
end;
$$;

create function public.executar_health_score_professor_v3_escopo_diario(
  p_competencia date, p_periodicidade text, p_escopo text, p_unidade_id uuid
)
returns jsonb
language plpgsql security definer
set search_path to public, pg_temp
as $$
declare
  v_competencia date := date_trunc('month', current_date)::date;
begin
  if date_trunc('month', p_competencia)::date <> v_competencia or p_periodicidade <> 'mensal' then
    raise exception 'HEALTH_SCORE_V3_COMPETENCIA_NAO_ABERTA';
  end if;
  return public.materializar_health_score_professor_v3_escopo_diario(
    v_competencia, p_periodicidade, p_escopo, p_unidade_id
  );
end;
$$;

create table cron.job (
  jobid bigint generated always as identity primary key,
  schedule text not null,
  command text not null,
  jobname text not null,
  username text not null default current_user,
  active boolean not null default true,
  unique (jobname, username)
);
create function cron.schedule(job_name text, schedule text, command text)
returns bigint language plpgsql as $$
declare v_id bigint;
begin
  insert into cron.job(jobname, schedule, command)
  values (job_name, schedule, command)
  returning jobid into v_id;
  return v_id;
end;
$$;
create function cron.unschedule(bigint)
returns boolean language plpgsql as $$ begin delete from cron.job where jobid = $1; return found; end $$;
create function cron.alter_job(
  job_id bigint,
  schedule text default null,
  command text default null,
  database text default null,
  username text default null,
  active boolean default null
)
returns void language sql as $$
  update cron.job set
    schedule = coalesce($2, schedule),
    command = coalesce($3, command),
    active = coalesce($6, active)
  where jobid = $1
$$;

create function public.configurar_health_score_professor_v3_cron_escopos()
returns void language plpgsql security definer
as $$ begin end $$;

create function public.executar_health_score_professor_v3_job_escopo(
  p_escopo text, p_unidade_id uuid
)
returns jsonb language plpgsql security definer
set search_path to public, pg_temp
as $$
declare
  v_escopo text := p_escopo;
  v_unidade_id uuid := p_unidade_id;
begin
  if v_escopo = 'consolidado' then
    perform public.configurar_health_score_professor_v3_cron_escopos();
  end if;
  return public.executar_health_score_professor_v3_escopo_diario(
    date_trunc('month', current_date)::date,
    'mensal',
    v_escopo,
    v_unidade_id
  );
end;
$$;
`;

test('migration aplica ciclo vivo e Matriculador comercial em PostgreSQL real', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponível para fixture PostgreSQL');
    return;
  }

  const container = `la-professores-ciclo-vivo-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const setup = psql(container, setupSql);
    assert.equal(setup.status, 0, setup.stderr || setup.stdout);

    const migration = readFileSync(migrationPath, 'utf8');
    const applied = psql(container, migration);
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);

    const result = psql(container, String.raw`
      select set_config('request.jwt.claim.role', 'service_role', false);
      with relatorio as (
        select public.get_relatorio_coordenacao_canonico_v3(
          '${campoGrande}'::uuid, 2026, 8, 'ciclo'
        ) as payload
      ), cadastro as (
        select jsonb_agg(to_jsonb(c) order by c.professor_id) as linhas
        from public.get_kpis_professores_cadastro_canonicos_v1(
          2026, 9, '${campoGrande}'::uuid, date '2026-09-01', date '2026-09-08'
        ) c
      ), ciclo as (
        select public.executar_health_score_professor_v3_escopo_diario(
          date_trunc('month', current_date)::date,
          'ciclo',
          'unidade',
          '${campoGrande}'::uuid
        ) as resultado
      ), cron as (
        select jsonb_agg(
          jsonb_build_object('nome', jobname, 'agenda', schedule, 'comando', command)
          order by jobname
        ) as jobs
        from cron.job
        where jobname like 'materializar-health-score-professor-v3-ciclo-%'
      )
      select jsonb_build_object(
        'relatorio', (select payload from relatorio),
        'cadastro', (select linhas from cadastro),
        'ciclo', (select resultado from ciclo),
        'cron', (select jobs from cron),
        'job_ciclo_existe', to_regprocedure(
          'public.executar_health_score_professor_v3_job_ciclo_escopo(text,uuid)'
        ) is not null,
        'constraint', (
          select pg_get_constraintdef(c.oid)
          from pg_constraint c
          where c.conname = 'health_score_professor_v3_materializacao_ex_periodicidade_check'
        )
      )::text;
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim().split(/\r?\n/u).at(-1));

    const professores = payload.relatorio.professores;
    assert.equal(
      professores.find((professor) => professor.nome === 'Valdo Delfino')
        .operacional.matriculas_comerciais,
      6,
    );
    assert.equal(
      professores.find((professor) => professor.nome === 'Caio Tenório')
        .operacional.matriculas_comerciais,
      3,
    );
    assert.deepEqual(payload.cadastro, [{
      professor_id: 36,
      unidade_id: campoGrande,
      carteira_alunos: 8,
      total_turmas: 15,
      alunos_via_turmas: 18,
      turmas_elegiveis_media: 15,
      media_alunos_turma: 1.2,
    }]);
    assert.equal(payload.ciclo.periodicidade, 'ciclo');
    assert.equal(payload.ciclo.escopo, 'unidade');
    assert.equal(payload.job_ciclo_existe, true);
    assert.match(payload.constraint, /mensal.*ciclo/iu);
    assert.equal(payload.cron.length, 4, 'três unidades e consolidado recebem job de ciclo');
    assert.ok(payload.cron.every((job) => /job_ciclo_escopo/.test(job.comando)));
    assert.ok(payload.cron.every((job) => /^\d+\s+\d+\s+\*\s+\*\s+\*$/.test(job.agenda)));
  } finally {
    docker(['stop', container]);
  }
});
