import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260816010000_financeiro_sync_queue.sql',
);

const WORKER_A = 'aaaaaaaa-1111-1111-1111-111111111111';
const WORKER_B = 'bbbbbbbb-2222-2222-2222-222222222222';

function docker(args, input, timeout = 120_000) {
  return spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout,
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

function asRole(container, role, sql) {
  return psql(container, `
    set role ${role};
    set app.test_role = '${role}';
    ${sql}
  `);
}

async function waitForPostgres(container) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (psql(container, 'select 1;').status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou a tempo');
}

function assertPsql(result, label) {
  assert.equal(
    result.status,
    0,
    `${label}: ${result.stderr || result.stdout || result.error?.message || 'sem saida'}`,
  );
}

function scalar(result, label) {
  assertPsql(result, label);
  return result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
}

function jsonFrom(result, label) {
  return JSON.parse(scalar(result, label));
}

const fixtureSchema = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create schema cron;

  create function auth.role()
  returns text
  language sql stable
  as $$
    select coalesce(nullif(current_setting('app.test_role', true), ''), current_user::text);
  $$;

  create table public.sync_runs (
    id uuid primary key default gen_random_uuid(),
    competencia date not null,
    run_type text not null,
    status text not null,
    snapshot_complete boolean not null default false,
    unidades_concluidas integer not null default 0,
    completed_at timestamptz
  );

  create table public.sync_run_items (
    id bigint generated always as identity primary key,
    run_id uuid not null references public.sync_runs(id),
    competencia date not null,
    unidade_id uuid not null,
    status text not null,
    source_missing boolean not null default false
  );

  create table cron.job (
    jobid bigint generated always as identity primary key,
    jobname text not null unique
  );

  create function cron.unschedule(p_job_name text)
  returns boolean
  language plpgsql
  as $$
  declare
    v_count integer;
  begin
    delete from cron.job where jobname = p_job_name;
    get diagnostics v_count = row_count;
    return v_count > 0;
  end;
  $$;

  insert into cron.job (jobname) values
    ('sync-faturas-competencia-atual'),
    ('sync-faturas-competencia-anterior'),
    ('sync-faturas-competencia-seguinte'),
    ('job-nao-financeiro');
`;

test('Checkpoint 3: fila financeira serializa worker, persiste backoff e descobre backlog', {
  timeout: 90_000,
}, async (t) => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration da fila financeira nao existe');

  const dockerInfo = docker(['info'], undefined, 5_000);
  const dockerVersion = docker(
    ['version', '--format', '{{.Server.Version}}'],
    undefined,
    5_000,
  );
  if (
    dockerInfo.status !== 0
    || dockerInfo.error
    || !/Server Version:/u.test(dockerInfo.stdout || '')
    || dockerVersion.status !== 0
    || dockerVersion.error
    || !dockerVersion.stdout?.trim()
  ) {
    t.skip('Docker indisponivel para fixture PostgreSQL da fila financeira');
    return;
  }

  const container = `la-financeiro-queue-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres',
    '-d', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const migration = fs.readFileSync(migrationPath, 'utf8');
    assertPsql(psql(container, `${fixtureSchema}\n${migration}`), 'schema + migration da fila');

    assert.equal(
      scalar(psql(container, "select string_agg(jobname, ',' order by jobname) from cron.job;"), 'crons restantes'),
      'job-nao-financeiro',
    );

    jsonFrom(asRole(container, 'service_role', `
      select public.enqueue_financeiro_sync_competencias(
        array[date '2026-06-01', date '2026-07-01', date '2026-06-01'],
        'teste_idempotencia', 'fixture', 50
      )::text;
    `), 'enqueue inicial');
    jsonFrom(asRole(container, 'service_role', `
      select public.enqueue_financeiro_sync_competencias(
        array[date '2026-06-01'], 'teste_repetido', 'fixture', 40
      )::text;
    `), 'enqueue repetido');
    assert.equal(
      Number(scalar(psql(container, `
        select count(*) from public.financeiro_sync_queue
        where status in ('pending','running','retry_wait');
      `), 'jobs ativos')),
      2,
    );

    const claimedA = jsonFrom(asRole(container, 'service_role', `
      select public.claim_financeiro_sync_job('${WORKER_A}'::uuid, 300)::text;
    `), 'claim worker A');
    assert.equal(claimedA.status, 'running');
    assert.equal(claimedA.competencia, '2026-06-01');
    assert.equal(claimedA.attempt_count, 1);

    const claimedBWhileRunning = jsonFrom(asRole(container, 'service_role', `
      select coalesce(public.claim_financeiro_sync_job('${WORKER_B}'::uuid, 300), 'null'::jsonb)::text;
    `), 'claim concorrente');
    assert.equal(claimedBWhileRunning, null);

    const retry = jsonFrom(asRole(container, 'service_role', `
      select public.retry_financeiro_sync_job(
        '${claimedA.id}'::uuid, '${WORKER_A}'::uuid, null,
        'EMUSYS_RATE_LIMIT', 'HTTP 429', 429, 120
      )::text;
    `), 'retry 429');
    assert.equal(retry.status, 'retry_wait');
    assert.equal(retry.delay_seconds, 120);
    assert.ok(new Date(retry.next_attempt_at).getTime() > Date.now() + 115_000);

    const claimedSecond = jsonFrom(asRole(container, 'service_role', `
      select public.claim_financeiro_sync_job('${WORKER_B}'::uuid, 300)::text;
    `), 'claim segundo job');
    assert.equal(claimedSecond.competencia, '2026-07-01');

    assertPsql(psql(container, `
      insert into public.sync_runs (
        id, competencia, run_type, status, snapshot_complete,
        unidades_concluidas, completed_at
      ) values (
        '77777777-7777-7777-7777-777777777777', date '2026-07-01',
        'live', 'succeeded', true, 3, now()
      );
    `), 'run completo para conclusao');
    const completed = jsonFrom(asRole(container, 'service_role', `
      select public.complete_financeiro_sync_job(
        '${claimedSecond.id}'::uuid,
        '${WORKER_B}'::uuid,
        '77777777-7777-7777-7777-777777777777'::uuid
      )::text;
    `), 'conclusao do job');
    assert.equal(completed.status, 'succeeded');

    assertPsql(psql(container, `
      delete from public.financeiro_sync_queue;
      select setval(pg_get_serial_sequence('public.sync_run_items','id'), 1, false);
    `), 'limpa fila para lease');
    jsonFrom(asRole(container, 'service_role', `
      select public.enqueue_financeiro_sync_competencias(
        array[date '2026-05-01'], 'teste_lease', 'fixture', 10
      )::text;
    `), 'enqueue lease');
    const leaseA = jsonFrom(asRole(container, 'service_role', `
      select public.claim_financeiro_sync_job('${WORKER_A}'::uuid, 60)::text;
    `), 'claim lease A');
    assertPsql(psql(container, `
      update public.financeiro_sync_queue
      set lease_expires_at = now() - interval '1 second'
      where id = '${leaseA.id}'::uuid;
    `), 'expira lease');
    const leaseB = jsonFrom(asRole(container, 'service_role', `
      select public.claim_financeiro_sync_job('${WORKER_B}'::uuid, 60)::text;
    `), 'reclaim lease B');
    assert.equal(leaseB.id, leaseA.id);
    assert.equal(leaseB.attempt_count, 2);

    assertPsql(psql(container, `
      delete from public.financeiro_sync_queue;
    `), 'limpa fila para max attempts');
    jsonFrom(asRole(container, 'service_role', `
      select public.enqueue_financeiro_sync_competencias(
        array[date '2026-04-01'], 'teste_max', 'fixture', 10
      )::text;
    `), 'enqueue max attempts');
    assertPsql(psql(container, `
      update public.financeiro_sync_queue set max_attempts = 1;
    `), 'limita tentativas');
    const maxJob = jsonFrom(asRole(container, 'service_role', `
      select public.claim_financeiro_sync_job('${WORKER_A}'::uuid, 60)::text;
    `), 'claim max attempts');
    const terminal = jsonFrom(asRole(container, 'service_role', `
      select public.retry_financeiro_sync_job(
        '${maxJob.id}'::uuid, '${WORKER_A}'::uuid, null,
        'EMUSYS_RATE_LIMIT', 'HTTP 429', 429, 1
      )::text;
    `), 'retry terminal');
    assert.equal(terminal.status, 'failed');

    assertPsql(psql(container, `
      delete from public.financeiro_sync_queue;
      delete from public.sync_run_items;
      delete from public.sync_runs;

      insert into public.sync_runs (
        id, competencia, run_type, status, snapshot_complete,
        unidades_concluidas, completed_at
      ) values
        ('60000000-0000-0000-0000-000000000001', date '2026-06-01', 'live', 'succeeded', true, 3, now() - interval '2 days'),
        ('70000000-0000-0000-0000-000000000001', date '2026-07-01', 'live', 'succeeded', true, 3, now() - interval '2 days'),
        ('70000000-0000-0000-0000-000000000002', date '2026-07-01', 'live', 'succeeded', true, 3, now() - interval '1 day');

      insert into public.sync_run_items (run_id, competencia, unidade_id, status, source_missing) values
        ('60000000-0000-0000-0000-000000000001', date '2026-06-01', gen_random_uuid(), 'aberta', false),
        ('70000000-0000-0000-0000-000000000001', date '2026-07-01', gen_random_uuid(), 'aberta', false),
        ('70000000-0000-0000-0000-000000000002', date '2026-07-01', gen_random_uuid(), 'paga', false);
    `), 'snapshots para backlog');
    jsonFrom(asRole(container, 'service_role', `
      select public.enqueue_financeiro_sync_backlog('teste_backlog', 'fixture')::text;
    `), 'enqueue backlog com junho aberto');
    assert.equal(
      scalar(psql(container, `
        select exists(
          select 1 from public.financeiro_sync_queue
          where competencia = date '2026-06-01'
            and status in ('pending','running','retry_wait')
        )::text;
      `), 'junho no backlog'),
      'true',
    );

    assertPsql(psql(container, `
      delete from public.financeiro_sync_queue;
      insert into public.sync_runs (
        id, competencia, run_type, status, snapshot_complete,
        unidades_concluidas, completed_at
      ) values (
        '60000000-0000-0000-0000-000000000002', date '2026-06-01',
        'live', 'succeeded', true, 3, now()
      );
      insert into public.sync_run_items (run_id, competencia, unidade_id, status, source_missing)
      values (
        '60000000-0000-0000-0000-000000000002', date '2026-06-01',
        gen_random_uuid(), 'paga', false
      );
    `), 'snapshot novo quitou junho');
    jsonFrom(asRole(container, 'service_role', `
      select public.enqueue_financeiro_sync_backlog('teste_backlog_pago', 'fixture')::text;
    `), 'enqueue backlog apos quitacao');
    assert.equal(
      scalar(psql(container, `
        select exists(
          select 1 from public.financeiro_sync_queue
          where competencia = date '2026-06-01'
        )::text;
      `), 'junho fora do backlog'),
      'false',
    );

    const forbidden = asRole(container, 'authenticated', `
      select public.enqueue_financeiro_sync_competencias(
        array[date '2026-06-01'], 'forbidden', 'fixture', 100
      );
    `);
    assert.notEqual(forbidden.status, 0);
    assert.match(forbidden.stderr, /42501|service_role|forbidden|permission denied/i);
  } finally {
    docker(['rm', '--force', container]);
  }
});
