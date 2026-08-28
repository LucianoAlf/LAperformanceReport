import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const IMAGE = process.env.PRESENCA_SYNC_POSTGRES_IMAGE || 'postgres:17-alpine';
const UNIDADE_A = '10000000-0000-0000-0000-000000000001';
const UNIDADE_B = '10000000-0000-0000-0000-000000000002';
const UNIDADE_C = '10000000-0000-0000-0000-000000000003';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} falhou\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

function docker(args, options = {}) {
  return run('docker', args, options);
}

function psql(container, sql) {
  return docker(
    ['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-tA'],
    { input: sql },
  );
}

function dockerAsync(args, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`docker ${args.join(' ')} falhou\n${stdout}\n${stderr}`));
    });
    child.stdin.end(input);
  });
}

function waitForPostgres(container) {
  let consecutivos = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync('docker', [
      'exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', 'select 1',
    ], { encoding: 'utf8' });
    consecutivos = probe.status === 0 ? consecutivos + 1 : 0;
    if (consecutivos >= 3) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error('PostgreSQL 17 descartavel nao ficou pronto');
}

function migration(pattern) {
  const matches = readdirSync(MIGRATIONS).filter((name) => pattern.test(name));
  assert.equal(matches.length, 1, `migration ausente ou duplicada: ${pattern}`);
  return join(MIGRATIONS, matches[0]);
}

function asService(sql) {
  return `select set_config('request.jwt.claim.role', 'service_role', false);\n${sql}`;
}

test('lease serializa modos e datas da mesma unidade sem bloquear outra unidade', async () => {
  const container = `la-presenca-unit-lease-${process.pid}`;
  docker(['run', '--rm', '--name', container, '-e', 'POSTGRES_PASSWORD=postgres', '-d', IMAGE]);
  try {
    waitForPostgres(container);
    psql(container, String.raw`
      create extension if not exists pgcrypto;
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create function auth.role() returns text language sql stable as $$
        select nullif(current_setting('request.jwt.claim.role', true), '')
      $$;
      create table public.unidades(id uuid primary key, nome text not null);
      insert into public.unidades values
        ('${UNIDADE_A}', 'A'),
        ('${UNIDADE_B}', 'B'),
        ('${UNIDADE_C}', 'C');
    `);
    psql(container, readFileSync(migration(/^20260827030200_presenca_sync_cobertura_idempotente\.sql$/u), 'utf8'));
    psql(container, readFileSync(migration(/^\d+_presenca_sync_serializacao_unidade\.sql$/u), 'utf8'));

    const metadados = JSON.parse(psql(container, asService(String.raw`
      select public.presenca_sync_iniciar_v1(
        '${UNIDADE_A}', 'metadados', '2026-08-28',
        '20000000-0000-4000-8000-000000000001', 900
      );
    `)).split('\n').at(-1));
    assert.equal(metadados.adquirida, true);

    const presenca = JSON.parse(psql(container, asService(String.raw`
      select public.presenca_sync_iniciar_v1(
        '${UNIDADE_A}', 'presenca', '2026-08-27',
        '20000000-0000-4000-8000-000000000002', 180
      );
    `)).split('\n').at(-1));
    assert.equal(presenca.adquirida, false);
    assert.equal(presenca.motivo, 'lease_unidade_ativo');
    assert.equal(presenca.run_ativo, metadados.run_id);

    const tentativaBloqueadaPersistida = Number(psql(container, asService(String.raw`
      select count(*) from public.presenca_sync_execucoes
       where request_id = '20000000-0000-4000-8000-000000000002';
    `)).split('\n').at(-1));
    assert.equal(tentativaBloqueadaPersistida, 0);

    const agenda = JSON.parse(psql(container, asService(String.raw`
      select public.presenca_sync_iniciar_v1(
        '${UNIDADE_A}', 'agenda', '2026-08-28',
        '20000000-0000-4000-8000-000000000003', 180
      );
    `)).split('\n').at(-1));
    assert.equal(agenda.adquirida, false);
    assert.equal(agenda.motivo, 'lease_unidade_ativo');

    const outraUnidade = JSON.parse(psql(container, asService(String.raw`
      select public.presenca_sync_iniciar_v1(
        '${UNIDADE_B}', 'presenca', '2026-08-27',
        '20000000-0000-4000-8000-000000000004', 180
      );
    `)).split('\n').at(-1));
    assert.equal(outraUnidade.adquirida, true);

    const finalizada = JSON.parse(psql(container, asService(String.raw`
      select public.presenca_sync_finalizar_v1(
        '${metadados.run_id}', 'concluida', '${'a'.repeat(64)}', '{}'::jsonb, null
      );
    `)).split('\n').at(-1));
    assert.equal(finalizada.publicavel, true);

    const retomada = JSON.parse(psql(container, asService(String.raw`
      select public.presenca_sync_iniciar_v1(
        '${UNIDADE_A}', 'presenca', '2026-08-27',
        '20000000-0000-4000-8000-000000000002', 180
      );
    `)).split('\n').at(-1));
    assert.equal(retomada.adquirida, true);

    const concorrentes = await Promise.all([
      dockerAsync([
        'exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1',
        '-U', 'postgres', '-d', 'postgres', '-tA',
      ], asService(String.raw`
        select public.presenca_sync_iniciar_v1(
          '${UNIDADE_C}', 'presenca', '2026-08-27',
          '20000000-0000-4000-8000-000000000006', 180
        );
      `)),
      dockerAsync([
        'exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1',
        '-U', 'postgres', '-d', 'postgres', '-tA',
      ], asService(String.raw`
        select public.presenca_sync_iniciar_v1(
          '${UNIDADE_C}', 'metadados', '2026-08-28',
          '20000000-0000-4000-8000-000000000007', 900
        );
      `)),
    ]);
    const resultadosConcorrentes = concorrentes.map((output) =>
      JSON.parse(output.split('\n').at(-1))
    );
    assert.equal(resultadosConcorrentes.filter((item) => item.adquirida).length, 1);
    assert.equal(
      resultadosConcorrentes.filter((item) => item.motivo === 'lease_unidade_ativo').length,
      1,
    );

    const acl = JSON.parse(psql(container, String.raw`
      select json_build_object(
        'anon', has_function_privilege('anon', 'public.presenca_sync_iniciar_v1(uuid,text,date,uuid,integer)', 'execute'),
        'authenticated', has_function_privilege('authenticated', 'public.presenca_sync_iniciar_v1(uuid,text,date,uuid,integer)', 'execute'),
        'service_role', has_function_privilege('service_role', 'public.presenca_sync_iniciar_v1(uuid,text,date,uuid,integer)', 'execute')
      );
    `));
    assert.deepEqual(acl, { anon: false, authenticated: false, service_role: true });
  } finally {
    docker(['rm', '-f', container]);
  }
});

test('migration de cron compila e altera somente os seis jobs esperados', () => {
  const container = `la-presenca-cron-gap-${process.pid}`;
  docker(['run', '--rm', '--name', container, '-e', 'POSTGRES_PASSWORD=postgres', '-d', IMAGE]);
  try {
    waitForPostgres(container);
    psql(container, String.raw`
      create schema cron;
      create table cron.job(
        jobid bigint generated always as identity primary key,
        jobname text not null unique,
        schedule text not null,
        active boolean not null default true
      );
      create function cron.alter_job(
        job_id bigint,
        schedule text default null,
        command text default null,
        database text default null,
        username text default null,
        active boolean default null
      ) returns void language plpgsql as $$
      begin
        update cron.job j
           set schedule = coalesce(alter_job.schedule, j.schedule),
               active = coalesce(alter_job.active, j.active)
         where j.jobid = alter_job.job_id;
      end;
      $$;
      insert into cron.job(jobname, schedule) values
        ('sync-grade-futura-cg', '0 0 * * 2-6'),
        ('sync-grade-futura-cg-sabado', '0 18 * * 6'),
        ('sync-agenda-professor-emusys-u1', '20 9 * * *'),
        ('sync-presenca-dia-recreio', '40 3 * * 0,2-6'),
        ('sync-presenca-catchup-manha', '30 10 * * *'),
        ('sync-presenca-backlog', '15 6 * * *'),
        ('job-nao-relacionado', '7 7 * * *');
    `);
    psql(container, readFileSync(
      migration(/^\d+_presenca_sync_crons_sem_colisao\.sql$/u),
      'utf8',
    ));

    const resultado = JSON.parse(psql(container, String.raw`
      select json_object_agg(jobname, schedule order by jobname)
      from cron.job;
    `));
    assert.deepEqual(resultado, {
      'job-nao-relacionado': '7 7 * * *',
      'sync-agenda-professor-emusys-u1': '23 9 * * *',
      'sync-grade-futura-cg': '3 0 * * 2-6',
      'sync-grade-futura-cg-sabado': '3 18 * * 6',
      'sync-presenca-backlog': '12 6 * * *',
      'sync-presenca-catchup-manha': '33 10 * * *',
      'sync-presenca-dia-recreio': '43 3 * * 0,2-6',
    });
  } finally {
    docker(['rm', '-f', container]);
  }
});

test('cron remove os seis alinhamentos deterministas com folga por unidade', () => {
  const sql = readFileSync(
    migration(/^\d+_presenca_sync_crons_sem_colisao\.sql$/u),
    'utf8',
  );
  const esperados = new Map([
    ['sync-grade-futura-cg', '3 0 * * 2-6'],
    ['sync-grade-futura-cg-sabado', '3 18 * * 6'],
    ['sync-agenda-professor-emusys-u1', '23 9 * * *'],
    ['sync-presenca-dia-recreio', '43 3 * * 0,2-6'],
    ['sync-presenca-catchup-manha', '33 10 * * *'],
    ['sync-presenca-backlog', '12 6 * * *'],
  ]);

  for (const [job, schedule] of esperados) {
    assert.match(sql, new RegExp(`['"]${job}['"][\\s\\S]{0,180}['"]${schedule.replaceAll('*', '\\*')}['"]`, 'u'));
  }
  assert.match(sql, /raise exception[^;]+jobs de presenca ausentes/isu);
});
