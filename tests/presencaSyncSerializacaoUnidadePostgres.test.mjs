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

function datasCobertas(janelas) {
  return [...new Set(janelas.flatMap((item) => {
    const fim = new Date(`${item.data_fim}T00:00:00.000Z`);
    return Array.from({ length: item.dias }, (_, index) => {
      const data = new Date(fim);
      data.setUTCDate(data.getUTCDate() - index);
      return data.toISOString().slice(0, 10);
    });
  }))].sort();
}

function intervaloDatas(dataInicio, quantidade) {
  const inicio = new Date(`${dataInicio}T00:00:00.000Z`);
  return Array.from({ length: quantidade }, (_, index) => {
    const data = new Date(inicio);
    data.setUTCDate(data.getUTCDate() + index);
    return data.toISOString().slice(0, 10);
  });
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

test('backlog substitui o worker monolitico por tres fatias unitarias limitadas', () => {
  const sql = readFileSync(
    migration(/^\d+_presenca_backlog_fatiado_por_unidade\.sql$/u),
    'utf8',
  );

  assert.match(sql, /cron\.unschedule[\s\S]*sync-presenca-backlog/iu);
  for (const [job, schedule, unidadeIndex] of [
    ['sync-presenca-backlog-campo-grande', '12 6 * * *', 0],
    ['sync-presenca-backlog-barra', '32 6 * * *', 1],
    ['sync-presenca-backlog-recreio', '52 6 * * *', 2],
  ]) {
    assert.match(sql, new RegExp(`['"]${job}['"][\\s\\S]{0,120}['"]${schedule.replaceAll('*', '\\*')}['"]`, 'u'));
    assert.match(sql, new RegExp(`['"]unidade_index['"]\\s*,\\s*${unidadeIndex}`, 'u'));
  }
  assert.match(sql, /least\s*\(\s*3\s*,\s*14\s*-\s*v_deslocamento\s*\)/iu);
  assert.doesNotMatch(sql, /['"]dias['"]\s*,\s*14/iu);
});

test('migration do backlog compila, preserva terceiros e cobre 14 dias em cinco fatias', () => {
  const container = `la-presenca-backlog-fatias-${process.pid}`;
  docker(['run', '--rm', '--name', container, '-e', 'POSTGRES_PASSWORD=postgres', '-d', IMAGE]);
  try {
    waitForPostgres(container);
    psql(container, String.raw`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema cron;
      create table cron.job(
        jobid bigint generated always as identity primary key,
        jobname text not null unique,
        schedule text not null,
        command text not null default '',
        database text not null default 'postgres',
        username text not null default 'postgres',
        active boolean not null default true
      );
      create function cron.unschedule(p_job_id bigint)
      returns boolean language plpgsql as $$
      begin
        delete from cron.job where jobid = p_job_id;
        return found;
      end;
      $$;
      create function cron.schedule(p_job_name text, p_schedule text, p_command text)
      returns bigint language plpgsql as $$
      declare v_job_id bigint;
      begin
        insert into cron.job(jobname, schedule, command)
        values (p_job_name, p_schedule, p_command)
        returning jobid into v_job_id;
        return v_job_id;
      end;
      $$;
      insert into cron.job(jobname, schedule, command) values
        ('sync-presenca-backlog', '12 6 * * *', 'legado'),
        ('job-nao-relacionado', '7 7 * * *', 'preservar');
    `);

    psql(container, readFileSync(
      migration(/^\d+_presenca_backlog_fatiado_por_unidade\.sql$/u),
      'utf8',
    ));

    const jobs = JSON.parse(psql(container, String.raw`
      select json_agg(json_build_object(
        'job', jobname,
        'schedule', schedule,
        'command', command
      ) order by jobname)
      from cron.job;
    `));
    assert.deepEqual(jobs.map(({ job, schedule }) => ({ job, schedule })), [
      { job: 'job-nao-relacionado', schedule: '7 7 * * *' },
      { job: 'sync-presenca-backlog-barra', schedule: '32 6 * * *' },
      { job: 'sync-presenca-backlog-campo-grande', schedule: '12 6 * * *' },
      { job: 'sync-presenca-backlog-recreio', schedule: '52 6 * * *' },
    ]);
    for (const [job, unidadeIndex] of [
      ['sync-presenca-backlog-campo-grande', 0],
      ['sync-presenca-backlog-barra', 1],
      ['sync-presenca-backlog-recreio', 2],
    ]) {
      const command = jobs.find((item) => item.job === job)?.command ?? '';
      assert.match(command, new RegExp(`'unidade_index'\\s*,\\s*${unidadeIndex}`, 'u'));
      assert.match(command, /presenca_sync_backlog_janela_v1/iu);
    }

    const janelas = JSON.parse(psql(container, String.raw`
      select json_agg(row_to_json(x) order by x.data_base)
      from (
        select d::date as data_base, j.data_fim, j.dias, j.deslocamento
        from generate_series(date '2026-08-27', date '2026-08-31', interval '1 day') d
        cross join lateral public.presenca_sync_backlog_janela_v1(d::date) j
      ) x;
    `));
    assert.equal(Math.max(...janelas.map((item) => item.dias)), 3);
    assert.deepEqual(janelas.map((item) => item.deslocamento), [12, 9, 6, 3, 0]);
    assert.deepEqual(datasCobertas(janelas), intervaloDatas('2026-08-13', 14));

    const janelasViradaAnoBissexto = JSON.parse(psql(container, String.raw`
      select json_agg(row_to_json(x) order by x.data_base)
      from (
        select d::date as data_base, j.data_fim, j.dias, j.deslocamento
        from generate_series(date '2028-12-29', date '2029-01-02', interval '1 day') d
        cross join lateral public.presenca_sync_backlog_janela_v1(d::date) j
      ) x;
    `));
    assert.deepEqual(datasCobertas(janelasViradaAnoBissexto), intervaloDatas('2028-12-15', 14));

    const acl = JSON.parse(psql(container, String.raw`
      select json_build_object(
        'anon', has_function_privilege('anon', 'public.presenca_sync_backlog_janela_v1(date)', 'execute'),
        'authenticated', has_function_privilege('authenticated', 'public.presenca_sync_backlog_janela_v1(date)', 'execute'),
        'service_role', has_function_privilege('service_role', 'public.presenca_sync_backlog_janela_v1(date)', 'execute')
      );
    `));
    assert.deepEqual(acl, { anon: false, authenticated: false, service_role: false });
  } finally {
    docker(['rm', '-f', container]);
  }
});
