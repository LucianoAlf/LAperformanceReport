import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260912043000_sol_gate4_kill_switch_uniforme_do_terceiro_andar.sql',
  import.meta.url,
);
const rollbackUrl = new URL(
  '../supabase/rollbacks/20260912043000_sol_gate4_kill_switch_uniforme_do_terceiro_andar_ROLLBACK.sql',
  import.meta.url,
);
const migration = () => readFileSync(migrationUrl, 'utf8');

function docker(args, input) {
  return spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}

function psql(container, sql) {
  return docker([
    'exec', '-i', container,
    'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-At',
  ], sql);
}

async function waitForPostgres(container) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (psql(container, 'select 1;').status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou');
}

test('contrato: switch proprio nasce off, e fail-closed sem parar o relatorio', () => {
  const source = migration();
  assert.match(source, /radar_bloco_sinais_comercial[\s\S]*false/i);
  assert.match(source, /coalesce[\s\S]*radar_bloco_sinais_comercial[\s\S]*false/i);
  assert.match(source, /create or replace function public\.radar_bloco_comercial_grupo_v1/i);
  assert.doesNotMatch(source, /cron\.schedule|net\.http|http_post|relatorio-admin-whatsapp/i);
  assert.doesNotMatch(source, /update\s+public\.radar_sinais|insert\s+into\s+public\.radar_entregas/i);
  assert.match(readFileSync(rollbackUrl, 'utf8'), /set ativo = true/i);
});

test('PostgreSQL 17: OFF, ON, OFF e linha ausente sao provados', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `sol-gate4-third-floor-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const setup = psql(container, String.raw`
      create role anon;
      create role authenticated;
      create role service_role;
      create table public.automacoes_config (
        slug text primary key,
        ativo boolean not null,
        updated_at timestamptz not null default now()
      );
      create table public.gate4_sinais_fixture (
        id uuid primary key,
        regra_codigo text,
        contexto text,
        orientacao text,
        detectado_em timestamptz,
        evidencia jsonb,
        situacao text,
        dominio text,
        status text,
        unidade_id uuid,
        expira_em timestamptz,
        vigencia text
      );
      create view public.vw_radar_sinal_vigencia_v1 as
        select * from public.gate4_sinais_fixture;
      insert into public.gate4_sinais_fixture values (
        '00000000-0000-0000-0000-000000000001', 'R2',
        'Caso sanitizado Escreveu há 3 dias', 'Fazer contato.', now(),
        '{"conversa_id":"fixture-1","dias_parado":3}', 'fixture',
        'comercial', 'aberto', '10000000-0000-0000-0000-000000000001',
        now() + interval '1 day', 'vigente'
      );
    `);
    assert.equal(setup.status, 0, setup.stderr || setup.stdout);

    const applied = psql(container, migration());
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);

    const off = psql(container, String.raw`
      select cardinality(public.radar_bloco_comercial_grupo_v1(
        '10000000-0000-0000-0000-000000000001', 6, 30));
    `);
    assert.equal(off.status, 0, off.stderr || off.stdout);
    assert.equal(off.stdout.trim(), '0');

    const on = psql(container, String.raw`
      update public.automacoes_config set ativo=true
       where slug='radar_bloco_sinais_comercial';
      select cardinality(public.radar_bloco_comercial_grupo_v1(
        '10000000-0000-0000-0000-000000000001', 6, 30));
    `);
    assert.equal(on.status, 0, on.stderr || on.stdout);
    assert.equal(on.stdout.trim().split('\n').at(-1), '1');

    const absent = psql(container, String.raw`
      delete from public.automacoes_config where slug='radar_bloco_sinais_comercial';
      select cardinality(public.radar_bloco_comercial_grupo_v1(
        '10000000-0000-0000-0000-000000000001', 6, 30));
    `);
    assert.equal(absent.status, 0, absent.stderr || absent.stdout);
    assert.equal(absent.stdout.trim().split('\n').at(-1), '0');

    const grants = psql(container, String.raw`
      select has_function_privilege('anon',
               'public.radar_bloco_comercial_grupo_v1(uuid,integer,integer)', 'EXECUTE'),
             has_function_privilege('authenticated',
               'public.radar_bloco_comercial_grupo_v1(uuid,integer,integer)', 'EXECUTE'),
             has_function_privilege('service_role',
               'public.radar_bloco_comercial_grupo_v1(uuid,integer,integer)', 'EXECUTE');
    `);
    assert.equal(grants.status, 0, grants.stderr || grants.stdout);
    assert.equal(grants.stdout.trim(), 'f|t|t');
  } finally {
    docker(['stop', container]);
  }
});
