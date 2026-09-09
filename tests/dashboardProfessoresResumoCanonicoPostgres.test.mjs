import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260909011724_dashboard_professores_resumo_canonico.sql',
);
const unidadeA = '10000000-0000-0000-0000-000000000001';
const unidadeB = '20000000-0000-0000-0000-000000000002';

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
  let probesEstaveis = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (psql(container, 'select 1;').status === 0) {
      probesEstaveis += 1;
      if (probesEstaveis >= 2) return;
    } else {
      probesEstaveis = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL do resumo do Dashboard nao iniciou a tempo');
}

const setupSql = String.raw`
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;

create function auth.role()
returns text language sql stable as $$
  select coalesce(current_setting('request.jwt.claim.role', true), 'anon')
$$;
create function auth.uid()
returns uuid language sql stable as $$ select null::uuid $$;

create table public.usuarios (
  id integer primary key,
  perfil text,
  unidade_id uuid,
  auth_user_id uuid,
  ativo boolean not null default true
);
create function public.usuario_tem_permissao(integer, text, uuid)
returns boolean language sql stable as $$ select false $$;

create table public.professores (
  id integer primary key,
  ativo boolean not null
);
create table public.professores_unidades (
  professor_id integer not null,
  unidade_id uuid not null,
  emusys_ativo boolean not null,
  validacao_status text
);
create table public.alunos (
  id integer primary key,
  professor_atual_id integer
);
create table public.movimentacoes_admin (
  id integer primary key,
  professor_id integer,
  aluno_id integer,
  unidade_id uuid,
  tipo text not null,
  data date not null
);
create table public.emusys_experimentais_raw (
  id bigint primary key,
  unidade_id uuid not null,
  data_aula date not null,
  professor_id integer
);

create function public.is_movimentacao_admin_retencao_valida(integer)
returns boolean language sql stable as $$ select $1 <> 999 $$;

create function public.get_carteira_professor_periodo_canonica(
  integer, integer, uuid, date, date
)
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
language sql stable as $$
  select *
  from (values
    (10, '${unidadeA}'::uuid, 10, 1.5::numeric, 8, 12, 8, 'fixture'::text),
    (20, '${unidadeB}'::uuid, 5, 2.0::numeric, 3, 6, 3, 'fixture'::text),
    (30, '${unidadeA}'::uuid, 99, 3.0::numeric, 9, 99, 9, 'fixture'::text),
    (40, '${unidadeA}'::uuid, 77, 4.0::numeric, 7, 77, 7, 'fixture'::text)
  ) as c(
    professor_id, unidade_id, carteira_alunos, media_alunos_turma, total_turmas,
    alunos_via_turmas, turmas_elegiveis_media, fonte_carteira
  )
  where $3 is null or c.unidade_id = $3
$$;

insert into public.professores (id, ativo) values
  (10, true), (20, true), (30, false), (40, true);
insert into public.professores_unidades (
  professor_id, unidade_id, emusys_ativo, validacao_status
) values
  (10, '${unidadeA}'::uuid, true, 'confirmado'),
  (20, '${unidadeB}'::uuid, true, 'confirmado'),
  (30, '${unidadeA}'::uuid, true, 'confirmado'),
  (40, '${unidadeA}'::uuid, true, 'ignorado');
insert into public.alunos (id, professor_atual_id) values (101, 10);
insert into public.movimentacoes_admin (
  id, professor_id, aluno_id, unidade_id, tipo, data
) values
  (1, 10, null, '${unidadeA}'::uuid, 'renovacao', date '2026-09-10'),
  (2, null, 101, '${unidadeA}'::uuid, 'nao_renovacao', date '2026-09-11'),
  (3, 20, null, '${unidadeB}'::uuid, 'renovacao', date '2026-09-12'),
  (4, 30, null, '${unidadeA}'::uuid, 'renovacao', date '2026-09-13'),
  (5, 40, null, '${unidadeA}'::uuid, 'renovacao', date '2026-09-14'),
  (999, 10, null, '${unidadeA}'::uuid, 'renovacao', date '2026-09-15');
`;

test('resumo canônico do Dashboard preserva universo ativo e numeradores em PostgreSQL real', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponível para fixture PostgreSQL');
    return;
  }

  const container = `la-dashboard-professores-${process.pid}-${Date.now()}`;
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
      select jsonb_build_object(
        'consolidado', (
          select to_jsonb(r)
          from public.get_dashboard_professores_resumo_canonico_v1(
            2026, 9, null, date '2026-09-01', date '2026-09-30'
          ) r
        ),
        'unidade_a', (
          select to_jsonb(r)
          from public.get_dashboard_professores_resumo_canonico_v1(
            2026, 9, '${unidadeA}'::uuid, date '2026-09-01', date '2026-09-30'
          ) r
        ),
        'indice', (
          select indexdef
          from pg_indexes
          where schemaname = 'public'
            and indexname = 'idx_emusys_experimentais_raw_unidade_data_professor_not_null'
        )
      )::text;
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim().split(/\r?\n/u).at(-1));

    assert.deepEqual(payload.consolidado, {
      carteira_alunos: 15,
      alunos_via_turmas: 18,
      turmas_elegiveis_media: 11,
      renovacoes: 2,
      nao_renovacoes: 1,
    });
    assert.deepEqual(payload.unidade_a, {
      carteira_alunos: 10,
      alunos_via_turmas: 12,
      turmas_elegiveis_media: 8,
      renovacoes: 1,
      nao_renovacoes: 1,
    });
    assert.match(payload.indice, /where \(professor_id is not null\)/i);
  } finally {
    docker(['stop', container]);
  }
});
