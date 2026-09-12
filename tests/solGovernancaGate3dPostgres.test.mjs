import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260912032000_sol_governanca_gate3d_acervo.sql',
  import.meta.url,
);
const rollbackUrl = new URL(
  '../supabase/rollbacks/20260912032000_sol_governanca_gate3d_acervo_ROLLBACK.sql',
  import.meta.url,
);
const migration = () => readFileSync(migrationUrl, 'utf8');

function docker(args, input) {
  return spawnSync('docker', args, {
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
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (psql(container, 'select 1;').status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou');
}

test('contrato SQL e service_role-only, append-only e sem egress/promocao', () => {
  assert.ok(existsSync(migrationUrl));
  assert.ok(existsSync(rollbackUrl));
  const source = migration();
  assert.match(source, /enable row level security/i);
  assert.match(source, /force row level security/i);
  assert.match(source, /before update or delete/i);
  assert.match(source, /before truncate/i);
  assert.match(source, /pg_advisory_xact_lock/i);
  assert.match(source, /create unique index sol_governanca_run_started_unique/i);
  assert.match(source, /p_finished_at - p_started_at > interval '10 minutes'/i);
  assert.match(source, /auth\.role\(\) is distinct from 'service_role'/i);
  assert.match(source, /grant execute[\s\S]*sol_governanca_registrar_rodada_v1[\s\S]*to service_role/i);
  assert.doesNotMatch(source, /grant execute[\s\S]*to (anon|authenticated)/i);
  assert.doesNotMatch(source, /http_post|net\.http|cron\.schedule|functions\.invoke/i);
  assert.doesNotMatch(source, /insert into public\.(?!sol_governanca_eventos)/i);
  assert.match(source, /'governance_store_written', true/);
  assert.match(source, /'operational_database_touched', false/);
  assert.match(source, /'messaging_egress_sent', false/);
});

test('migration prova cadeia, idempotencia, negativo plantado e imutabilidade no PostgreSQL 17', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `sol-governanca-gate3d-${process.pid}-${Date.now()}`;
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
      create schema auth;
      create function auth.role() returns text
      language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;
      create schema extensions;
    `);
    assert.equal(setup.status, 0, setup.stderr || setup.stdout);

    const applied = psql(container, migration());
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);

    const unauthorized = psql(container, String.raw`
      select set_config('request.jwt.claim.role', 'authenticated', false);
      select public.sol_governanca_registrar_rodada_v1(
        'run:unauthorized', now(), now(), 'failed',
        '[{"check_id":"planted_negative","status":"failed","evidence":{"rejected":false}}]'::jsonb,
        repeat('a', 64)
      );
    `);
    assert.notEqual(unauthorized.status, 0);
    assert.match(unauthorized.stderr, /SERVICE_ROLE_REQUIRED/);

    const greenWithoutNegative = psql(container, String.raw`
      select set_config('request.jwt.claim.role', 'service_role', false);
      select public.sol_governanca_registrar_rodada_v1(
        'run:invalid-green', now(), now(), 'ok',
        '[{"check_id":"service_state","status":"ok","evidence":{"active":true}}]'::jsonb,
        repeat('b', 64)
      );
    `);
    assert.notEqual(greenWithoutNegative.status, 0);
    assert.match(greenWithoutNegative.stderr, /VERDE_SEM_NEGATIVO/);

    const pii = psql(container, String.raw`
      select set_config('request.jwt.claim.role', 'service_role', false);
      select public.sol_governanca_registrar_rodada_v1(
        'run:pii', now(), now(), 'failed',
        '[{"check_id":"service_state","status":"failed","evidence":{"email":"pessoa@example.com"}}]'::jsonb,
        repeat('c', 64)
      );
    `);
    assert.notEqual(pii.status, 0);
    assert.match(pii.stderr, /MEDICAO_NAO_SANITIZADA/);

    const runSql = String.raw`
      select set_config('request.jwt.claim.role', 'service_role', false);
      select public.sol_governanca_registrar_rodada_v1(
        'run:gate3d-proof-001',
        now() - interval '1 minute',
        now(),
        'ok',
        '[
          {"check_id":"planted_negative","status":"ok","evidence":{"rejected":true,"external_effect":false}},
          {"check_id":"service_state","status":"ok","evidence":{"active":true,"nrestarts":0}}
        ]'::jsonb,
        repeat('d', 64)
      )::text;
    `;
    const first = psql(container, runSql);
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const firstPayload = JSON.parse(first.stdout.trim().split('\n').at(-1));
    assert.equal(firstPayload.ok, true);
    assert.equal(firstPayload.duplicate, false);
    assert.equal(firstPayload.chain.ok, true);
    assert.equal(firstPayload.chain.events, 4);

    const replay = psql(container, runSql);
    assert.equal(replay.status, 0, replay.stderr || replay.stdout);
    const replayPayload = JSON.parse(replay.stdout.trim().split('\n').at(-1));
    assert.equal(replayPayload.duplicate, true);

    const counts = psql(container, String.raw`
      select jsonb_build_object(
        'events', count(*),
        'runs', count(*) filter (where entity_type = 'run'),
        'findings', count(*) filter (where entity_type = 'finding'),
        'direct_service_insert', has_table_privilege('service_role', 'public.sol_governanca_eventos', 'INSERT'),
        'direct_service_update', has_table_privilege('service_role', 'public.sol_governanca_eventos', 'UPDATE'),
        'direct_service_delete', has_table_privilege('service_role', 'public.sol_governanca_eventos', 'DELETE'),
        'direct_service_truncate', has_table_privilege('service_role', 'public.sol_governanca_eventos', 'TRUNCATE')
      )::text
      from public.sol_governanca_eventos;
    `);
    assert.equal(counts.status, 0, counts.stderr || counts.stdout);
    assert.deepEqual(JSON.parse(counts.stdout.trim()), {
      events: 4,
      runs: 4,
      findings: 0,
      direct_service_insert: false,
      direct_service_update: false,
      direct_service_delete: false,
      direct_service_truncate: false,
    });

    for (const mutation of [
      "update public.sol_governanca_eventos set payload = '{}'::jsonb where sequence = 1;",
      'delete from public.sol_governanca_eventos where sequence = 1;',
      'truncate public.sol_governanca_eventos;',
    ]) {
      const result = psql(container, mutation);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /SOL_GOVERNANCA_APPEND_ONLY/);
    }

    const chain = psql(container, 'select public.sol_governanca_verificar_acervo_v1()::text;');
    assert.equal(chain.status, 0, chain.stderr || chain.stdout);
    assert.equal(JSON.parse(chain.stdout.trim()).ok, true);
  } finally {
    docker(['stop', container]);
  }
});
