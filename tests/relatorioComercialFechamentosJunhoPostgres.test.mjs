import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20260909050455_relatorio_comercial_fechamentos_junho_cg_barra.sql',
  import.meta.url,
);

const dockerWindows = join(
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
    '-U', 'postgres', '-d', 'postgres', '-At',
  ], sql);
}

async function waitForPostgres(container) {
  let consecutiveReadyChecks = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (psql(container, 'select 1;').status === 0) {
      consecutiveReadyChecks += 1;
      if (consecutiveReadyChecks >= 3) return;
    } else {
      consecutiveReadyChecks = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou a tempo');
}

const fixture = String.raw`
  create extension pgcrypto;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

  create table public.unidades (
    id uuid primary key,
    codigo text not null unique,
    nome text not null,
    ativo boolean not null default true
  );
  create table public.fechamento_mensal_snapshots (
    id uuid primary key default gen_random_uuid(),
    ano integer not null,
    mes integer not null,
    escopo text not null,
    unidade_id uuid,
    dominio text not null,
    versao integer not null,
    status text not null,
    fonte text not null,
    payload jsonb not null,
    payload_hash text not null,
    observacao text,
    capturado_em timestamptz not null default now(),
    capturado_por uuid,
    aprovado_em timestamptz,
    aprovado_por uuid,
    fechado_em timestamptz,
    fechado_por uuid,
    created_at timestamptz not null default now()
  );
  create table public.fechamento_mensal_auditoria (
    id bigint generated always as identity primary key,
    snapshot_id uuid not null,
    ano integer not null,
    mes integer not null,
    escopo text not null,
    unidade_id uuid,
    acao text not null,
    detalhes jsonb not null,
    actor_id uuid,
    created_at timestamptz not null default now()
  );

  create function public.hash_jsonb_canonico(jsonb) returns text
  language sql immutable as $$
    select encode(digest($1::text, 'sha256'), 'hex')
  $$;

  insert into public.unidades (id,codigo,nome) values
    ('10000000-0000-0000-0000-000000000001','CG','Campo Grande'),
    ('20000000-0000-0000-0000-000000000002','BARRA','Barra'),
    ('30000000-0000-0000-0000-000000000003','REC','Recreio');

  create function public.montar_relatorio_comercial_mensal_payload_v1(
    p_unidade_id uuid, p_ano integer, p_mes integer
  ) returns jsonb language sql stable as $$
    select jsonb_build_object(
      'competencia', jsonb_build_object('ano',p_ano,'mes',p_mes),
      'unidade', jsonb_build_object('id',u.id,'nome',u.nome),
      'capturado_em', '2026-07-01T02:05:51.192152+00:00',
      'resumo', jsonb_build_object('matriculas',13),
      'matriculas', (
        select jsonb_agg(jsonb_build_object(
          'id',x.n,
          'nome','Aluno ' || x.n,
          'data_matricula',to_char(date '2026-06-01' + (x.ord::integer - 1), 'YYYY-MM-DD'),
          'professores_experimentais','Valdo Delfino'
        ) order by x.n)
        from unnest(case upper(u.codigo)
          when 'CG' then array[1745,1746,1751,1752,1756,1758,1763,1770,1773,1790,1792,1801,1806]
          else array[1737,1765,1769,1777,1791,1793,1794,1796,1797,1798,1800,1802,1807]
        end) with ordinality as x(n, ord)
      )
    )
    from public.unidades u where u.id=p_unidade_id
  $$;
`;

const fixtureSemUnidadesDeProducao = fixture.replace(
  /insert into public\.unidades \(id,codigo,nome\) values[\s\S]*?\('30000000-0000-0000-0000-000000000003','REC','Recreio'\);/,
  '',
);

const fixtureComIdsErrados = fixture.replace(
  /case upper\(u\.codigo\)[\s\S]*?end/,
  'array(select generate_series(1,13))',
);

test('migration de reparo nao bloqueia uma base nova sem as unidades de producao', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-comercial-junho-empty-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const migration = readFileSync(migrationPath, 'utf8');
    const applied = psql(container, `${fixtureSemUnidadesDeProducao}\n${migration}`);
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);

    const count = psql(container, 'select count(*) from public.fechamento_mensal_snapshots;');
    assert.equal(count.status, 0, count.stderr || count.stdout);
    assert.equal(Number(count.stdout.trim()), 0);
  } finally {
    docker(['stop', container]);
  }
});

test('fecha as lacunas comerciais de junho com documento verificavel e idempotente', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-comercial-junho-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const migration = readFileSync(migrationPath, 'utf8');
    const first = psql(container, `${fixture}\n${migration}`);
    assert.equal(first.status, 0, first.stderr || first.stdout);

    const second = psql(container, migration);
    assert.equal(second.status, 0, second.stderr || second.stdout);

    const query = psql(container, String.raw`
      select jsonb_build_object(
        'snapshots', count(*),
        'unidades', jsonb_agg(u.codigo order by u.codigo),
        'contagens', jsonb_agg(jsonb_array_length(s.payload->'matriculas') order by u.codigo),
        'status', jsonb_agg(s.status order by u.codigo),
        'hashes_validos', bool_and(s.payload_hash=public.hash_jsonb_canonico(s.payload)),
        'auditorias', (select count(*) from public.fechamento_mensal_auditoria)
      )::text
      from public.fechamento_mensal_snapshots s
      join public.unidades u on u.id=s.unidade_id
      where s.ano=2026 and s.mes=6 and s.dominio='relatorio_comercial_mensal';
    `);
    assert.equal(query.status, 0, query.stderr || query.stdout);
    const result = JSON.parse(query.stdout.trim().split(/\r?\n/).at(-1));

    assert.equal(result.snapshots, 2);
    assert.deepEqual(result.unidades, ['BARRA', 'CG']);
    assert.deepEqual(result.contagens, [13, 13]);
    assert.deepEqual(result.status, ['retificado', 'retificado']);
    assert.equal(result.hashes_validos, true);
    assert.equal(result.auditorias, 2);
  } finally {
    docker(['stop', container]);
  }
});

test('rejeita treze linhas diferentes do universo historico imutavel', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-comercial-junho-wrong-ids-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const migration = readFileSync(migrationPath, 'utf8');
    const applied = psql(container, `${fixtureComIdsErrados}\n${migration}`);
    assert.notEqual(applied.status, 0, applied.stderr || applied.stdout);
    assert.match(applied.stderr, /RELATORIO_COMERCIAL_JUNHO_IDS_INESPERADOS/u);

    const count = psql(container, 'select count(*) from public.fechamento_mensal_snapshots;');
    assert.equal(count.status, 0, count.stderr || count.stdout);
    assert.equal(Number(count.stdout.trim()), 0);
  } finally {
    docker(['stop', container]);
  }
});
