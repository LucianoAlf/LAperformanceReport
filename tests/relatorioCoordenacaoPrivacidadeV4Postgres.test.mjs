import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20260909053633_relatorio_coordenacao_documentos_privados_v4.sql',
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
    maxBuffer: 10 * 1024 * 1024,
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
  let ready = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (psql(container, 'select 1;').status === 0) {
      ready += 1;
      if (ready >= 2) return;
    } else {
      ready = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou a tempo');
}

test('RLS impede acesso direto aos documentos V4 sem afetar outros dominios', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-coord-privacy-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const migration = readFileSync(migrationPath, 'utf8');
    const setup = psql(container, String.raw`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create table public.fechamento_mensal_snapshots (
        id bigint generated always as identity primary key,
        dominio text not null,
        payload jsonb not null default '{}'::jsonb
      );
      alter table public.fechamento_mensal_snapshots enable row level security;
      grant select,insert,update,delete on public.fechamento_mensal_snapshots
        to anon,authenticated,service_role;
      grant usage,select on sequence public.fechamento_mensal_snapshots_id_seq
        to anon,authenticated,service_role;
      create policy acesso_historico_permissivo
        on public.fechamento_mensal_snapshots
        for all to anon,authenticated
        using (true) with check (true);
      insert into public.fechamento_mensal_snapshots(dominio) values
        ('relatorio_admin_mensal'),
        ('relatorio_coordenacao'),
        ('relatorio_coordenacao_ciclo');
      ${migration}
    `);
    assert.equal(setup.status, 0, setup.stderr || setup.stdout);

    const authenticatedRead = psql(container, String.raw`
      set role authenticated;
      select coalesce(jsonb_agg(dominio order by dominio), '[]'::jsonb)::text
      from public.fechamento_mensal_snapshots;
    `);
    assert.equal(authenticatedRead.status, 0, authenticatedRead.stderr || authenticatedRead.stdout);
    assert.deepEqual(
      JSON.parse(authenticatedRead.stdout.trim().split(/\r?\n/).at(-1)),
      ['relatorio_admin_mensal'],
    );

    const blockedInsert = psql(container, String.raw`
      set role authenticated;
      insert into public.fechamento_mensal_snapshots(dominio)
      values ('relatorio_coordenacao');
    `);
    assert.notEqual(blockedInsert.status, 0, 'authenticated nao pode inserir documento da coordenacao');

    const allowedInsert = psql(container, String.raw`
      set role authenticated;
      insert into public.fechamento_mensal_snapshots(dominio)
      values ('relatorio_admin_mensal');
    `);
    assert.equal(allowedInsert.status, 0, allowedInsert.stderr || allowedInsert.stdout);

    const serviceRead = psql(container, String.raw`
      set role service_role;
      select count(*)::integer from public.fechamento_mensal_snapshots;
    `);
    assert.equal(serviceRead.status, 0, serviceRead.stderr || serviceRead.stdout);
    assert.equal(Number(serviceRead.stdout.trim().split(/\r?\n/).at(-1)), 4);
  } finally {
    docker(['stop', container]);
  }
});
