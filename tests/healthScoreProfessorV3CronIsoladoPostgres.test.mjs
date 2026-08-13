import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'supabase/migrations');
const legacyMigrationName =
  '20260808193000_health_score_v3_cron_diario_idempotente.sql';
const legacyJobName = 'materializar-health-score-professor-v3-diario';
const jobPrefix = 'materializar-health-score-professor-v3-diario-';
const unitIds = [
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
];
const inactiveUnitId = '10000000-0000-0000-0000-000000000004';

function docker(args, input) {
  return spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

function psql(container, sql, { tuplesOnly = true } = {}) {
  const args = [
    'exec', '-i', container,
    'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres',
  ];
  if (tuplesOnly) args.push('-qAt');
  return docker(args, sql);
}

async function waitForPostgres(container) {
  let consecutiveReadyChecks = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = psql(container, 'select 1;');
    if (ready.status === 0) {
      consecutiveReadyChecks += 1;
      if (consecutiveReadyChecks === 2) return;
    } else {
      consecutiveReadyChecks = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL 17 do cron isolado nao iniciou a tempo');
}

function migrationNamesAfterAnchor() {
  return fs.readdirSync(migrationsDir)
    .filter((name) => /^\d{14}_.+\.sql$/u.test(name))
    .filter((name) => name > legacyMigrationName)
    .sort();
}

function discoverCorrectiveMigration() {
  const matches = migrationNamesAfterAnchor().filter((name) => {
    const sql = withoutSqlComments(
      fs.readFileSync(path.join(migrationsDir, name), 'utf8'),
    );
    return /materializar-health-score-professor-v3-diario/iu.test(sql)
      && /cron\.unschedule\s*\(/iu.test(sql)
      && /cron\.schedule\s*\(/iu.test(sql)
      && /executar_health_score_professor_v3_escopo_diario\s*\(/iu.test(sql);
  });

  assert.ok(
    matches.length <= 1,
    `mais de uma migration candidata ao cron isolado: ${matches.join(', ')}`,
  );
  return matches.length === 1 ? matches[0] : null;
}

function withoutSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .replace(/--[^\r\n]*/gu, ' ');
}

function assertNoStatementTimeout(sql) {
  assert.doesNotMatch(
    sql,
    /\bstatement_timeout\b/iu,
    'migration nova nao pode depender de SET, SET LOCAL, set_config ou ALTER para timeout',
  );
}

function parseScheduledCommand(command) {
  const match = /^\s*select\s+public\.([a-z_][a-z0-9_]*)\s*\(\s*'(unidade|consolidado)'\s*(?:::text)?\s*,\s*(null\s*::\s*uuid|'([0-9a-f-]{36})'\s*(?:::uuid)?)\s*\)\s*;?\s*$/iu.exec(command);
  assert.ok(
    match,
    `command deve chamar wrapper publico com assinatura contratada (text,uuid): ${command}`,
  );
  const scope = match[2].toLowerCase();
  const unitId = match[4]?.toLowerCase() ?? null;
  assert.equal(scope === 'unidade', unitId !== null, `escopo/unidade incompatível: ${command}`);
  return {
    functionName: match[1].toLowerCase(),
    signature: `public.${match[1].toLowerCase()}(text,uuid)`,
    scope,
    unitId,
  };
}

function parseJsonLines(stdout) {
  return stdout.trim().split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

function parseCronMinute(schedule) {
  const match = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/u.exec(schedule);
  assert.ok(match, `agenda deve usar cron UTC diario explicito: ${schedule}`);
  return Number(match[2]) * 60 + Number(match[1]);
}

test('detector proibe qualquer mecanismo de statement_timeout', () => {
  for (const sql of [
    "select set_config('statement_timeout', '75s', true);",
    'set statement_timeout = 75000;',
    "set local statement_timeout to '75s';",
    'alter role service_role set statement_timeout = 0;',
    "alter database postgres set statement_timeout to '1min';",
  ]) {
    assert.throws(() => assertNoStatementTimeout(sql));
  }
  assert.doesNotThrow(() => assertNoStatementTimeout('select cron.schedule(1, 2, 3);'));
});

test('parser ancora a assinatura exata chamada pelos jobs', () => {
  assert.deepEqual(
    parseScheduledCommand(
      "select public.executar_health_score_professor_v3_job_escopo('unidade', '10000000-0000-0000-0000-000000000001'::uuid);",
    ),
    {
      functionName: 'executar_health_score_professor_v3_job_escopo',
      signature: 'public.executar_health_score_professor_v3_job_escopo(text,uuid)',
      scope: 'unidade',
      unitId: '10000000-0000-0000-0000-000000000001',
    },
  );
  assert.equal(
    parseScheduledCommand(
      "select public.executar_health_score_professor_v3_job_escopo('consolidado', null::uuid);",
    ).signature,
    'public.executar_health_score_professor_v3_job_escopo(text,uuid)',
  );
  assert.throws(
    () => parseScheduledCommand(
      "select public.executar_health_score_professor_v3_escopo_diario(current_date, 'mensal', 'consolidado', null::uuid);",
    ),
    /assinatura contratada/iu,
  );
});

const setupSql = String.raw`
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema cron;
create schema net;
create schema vault;

create table public.unidades (
  id uuid primary key,
  nome text not null,
  ativo boolean not null
);

insert into public.unidades (id, nome, ativo) values
  ('${unitIds[0]}', 'Barra', true),
  ('${unitIds[1]}', 'Campo Grande', true),
  ('${unitIds[2]}', 'Recreio', true),
  ('${inactiveUnitId}', 'Inativa', false);

create table cron.job (
  jobid bigint generated always as identity primary key,
  schedule text not null,
  command text not null,
  nodename text not null default 'localhost',
  nodeport integer not null default 5432,
  database text not null default current_database(),
  username text not null default current_user,
  active boolean not null default true,
  jobname text not null unique
);

create table cron.api_calls (
  id bigint generated always as identity primary key,
  operation text not null,
  jobname text,
  schedule text,
  command text
);

create or replace function cron.schedule(
  job_name text,
  schedule text,
  command text
)
returns bigint
language plpgsql
as $$
declare
  v_jobid bigint;
begin
  insert into cron.job (jobname, schedule, command)
  values ($1, $2, $3)
  on conflict (jobname) do update
    set schedule = excluded.schedule,
        command = excluded.command,
        active = true
  returning jobid into v_jobid;

  insert into cron.api_calls (operation, jobname, schedule, command)
  values ('schedule', $1, $2, $3);
  return v_jobid;
end;
$$;

create or replace function cron.unschedule(job_id bigint)
returns boolean
language plpgsql
as $$
declare
  v_jobname text;
begin
  select j.jobname into v_jobname from cron.job j where j.jobid = $1;
  delete from cron.job j where j.jobid = $1;
  insert into cron.api_calls (operation, jobname) values ('unschedule', v_jobname);
  return found;
end;
$$;

create or replace function cron.unschedule(job_name text)
returns boolean
language plpgsql
as $$
declare
  v_deleted boolean;
begin
  delete from cron.job j where j.jobname = $1;
  v_deleted := found;
  insert into cron.api_calls (operation, jobname) values ('unschedule', $1);
  return v_deleted;
end;
$$;

create or replace function cron.alter_job(
  job_id bigint,
  schedule text default null,
  command text default null,
  database text default null,
  username text default null,
  active boolean default null
)
returns void
language plpgsql
as $$
declare
  v_jobname text;
begin
  select jobname into v_jobname from cron.job where jobid = job_id;
  update cron.job j
     set schedule = coalesce(alter_job.schedule, j.schedule),
         command = coalesce(alter_job.command, j.command),
         database = coalesce(alter_job.database, j.database),
         username = coalesce(alter_job.username, j.username),
         active = coalesce(alter_job.active, j.active)
   where j.jobid = job_id;
  insert into cron.api_calls (operation, jobname, schedule, command)
  values ('alter_job', v_jobname, alter_job.schedule, alter_job.command);
end;
$$;

create table vault.decrypted_secrets (
  name text primary key,
  decrypted_secret text not null
);
insert into vault.decrypted_secrets values
  ('lia_alertas_service_role_key', 'fixture-secret-never-in-job');

create table net.http_calls (
  id bigint generated always as identity primary key,
  url text not null,
  headers jsonb not null,
  body jsonb not null
);

create or replace function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb,
  timeout_milliseconds integer default 5000
)
returns bigint
language plpgsql
as $$
declare
  v_id bigint;
begin
  insert into net.http_calls (url, headers, body)
  values (url, headers, body)
  returning id into v_id;
  return v_id;
end;
$$;

create table public.health_score_v3_executor_calls (
  id bigint generated always as identity primary key,
  competencia date not null,
  periodicidade text not null,
  escopo text not null,
  unidade_id uuid
);

create or replace function public.executar_health_score_professor_v3_escopo_diario(
  p_competencia date,
  p_periodicidade text,
  p_escopo text,
  p_unidade_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  insert into public.health_score_v3_executor_calls (
    competencia, periodicidade, escopo, unidade_id
  ) values (
    p_competencia, p_periodicidade, p_escopo, p_unidade_id
  );

  v_result := case
    when p_escopo = 'consolidado' and p_unidade_id is null then
      jsonb_build_object(
        'status', 'sem_alteracao',
        'execution_id', 'exec-sem-alteracao',
        'professores_incompletos', '[]'::jsonb
      )
    when p_unidade_id = '${unitIds[0]}'::uuid then
      jsonb_build_object(
        'status', 'parcial',
        'execution_id', 'exec-parcial',
        'professores_incompletos', jsonb_build_array(101)
      )
    when p_unidade_id = '${unitIds[1]}'::uuid then
      jsonb_build_object(
        'status', 'materializado',
        'execution_id', 'exec-materializado',
        'professores_incompletos', '[]'::jsonb
      )
    when p_unidade_id = '${unitIds[2]}'::uuid then
      jsonb_build_object(
        'status', 'erro',
        'execution_id', 'exec-erro',
        'erro', 'fixture-error',
        'professores_incompletos', jsonb_build_array(303)
      )
    else
      jsonb_build_object(
        'status', 'fixture_invalido',
        'execution_id', 'exec-fixture-invalido'
      )
  end;
  return v_result;
end;
$$;

revoke all on function public.executar_health_score_professor_v3_escopo_diario(date, text, text, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.executar_health_score_professor_v3_cron_diario()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('status', 'legado');
$$;

revoke all on function public.executar_health_score_professor_v3_cron_diario()
  from public, anon, authenticated;
grant execute on function public.executar_health_score_professor_v3_cron_diario()
  to service_role;

insert into cron.job (jobname, schedule, command) values
  ('${legacyJobName}', '30 6 * * *', 'select public.executar_health_score_professor_v3_cron_diario();'),
  ('job-alheio-nao-tocar', '5 1 * * *', 'select 42;');
`;

test('migration corretiva real usa somente APIs publicas do pg_cron', () => {
  const migrationName = discoverCorrectiveMigration();
  assert.ok(
    migrationName,
    'RED esperado: ainda nao existe migration posterior isolando o cron Health Score V3',
  );

  const sql = withoutSqlComments(
    fs.readFileSync(path.join(migrationsDir, migrationName), 'utf8'),
  );
  assert.match(migrationName, /^\d{14}_.+\.sql$/u);
  assert.match(sql, /cron\.unschedule\s*\(/iu);
  assert.match(sql, /cron\.schedule\s*\(/iu);
  assert.doesNotMatch(sql, /(?:insert\s+into|update|delete\s+from)\s+cron\.job\b/iu);
  assertNoStatementTimeout(sql);
  assert.doesNotMatch(sql, /fixture-secret-never-in-job/iu);
});

test('PostgreSQL 17 substitui o monolito por quatro jobs isolados e idempotentes', async () => {
  const container = `la-hs-v3-cron-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--rm', '--detach', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr);

  try {
    await waitForPostgres(container);
    const setup = psql(container, setupSql);
    assert.equal(setup.status, 0, setup.stderr);

    const migrationName = discoverCorrectiveMigration();
    if (migrationName) {
      const migrationSql = fs.readFileSync(path.join(migrationsDir, migrationName), 'utf8');
      const firstApply = psql(container, migrationSql, { tuplesOnly: false });
      assert.equal(firstApply.status, 0, firstApply.stderr);

      const firstCatalog = psql(
        container,
        `select jsonb_agg(to_jsonb(j) order by jobname)::text
           from cron.job j
          where jobname like '${jobPrefix}%';`,
      );
      assert.equal(firstCatalog.status, 0, firstCatalog.stderr);

      const secondApply = psql(container, migrationSql, { tuplesOnly: false });
      assert.equal(secondApply.status, 0, secondApply.stderr);
      const secondCatalog = psql(
        container,
        `select jsonb_agg(to_jsonb(j) order by jobname)::text
           from cron.job j
          where jobname like '${jobPrefix}%';`,
      );
      assert.equal(secondCatalog.status, 0, secondCatalog.stderr);
      assert.equal(secondCatalog.stdout.trim(), firstCatalog.stdout.trim());
    }

    const catalogResult = psql(
      container,
      `select jsonb_build_object(
         'legacy_count', count(*) filter (where jobname = '${legacyJobName}'),
         'unrelated', jsonb_agg(to_jsonb(j) order by jobname)
           filter (where jobname = 'job-alheio-nao-tocar'),
         'isolated', jsonb_agg(to_jsonb(j) order by jobname)
           filter (where jobname like '${jobPrefix}%')
       )::text from cron.job j;`,
    );
    assert.equal(catalogResult.status, 0, catalogResult.stderr);
    const catalog = JSON.parse(catalogResult.stdout.trim());

    assert.equal(catalog.legacy_count, 0, 'job legado deve ser removido pelo nome exato');
    assert.deepEqual(catalog.unrelated, [{
      jobid: 2,
      schedule: '5 1 * * *',
      command: 'select 42;',
      nodename: 'localhost',
      nodeport: 5432,
      database: 'postgres',
      username: 'postgres',
      active: true,
      jobname: 'job-alheio-nao-tocar',
    }]);

    assert.equal(catalog.isolated?.length, 4, 'devem existir 3 unidades ativas + consolidado');
    const expectedNames = [
      ...unitIds.map((id) => `${jobPrefix}unidade-${id}`),
      `${jobPrefix}consolidado`,
    ].sort();
    assert.deepEqual(catalog.isolated.map((job) => job.jobname).sort(), expectedNames);
    assert.ok(
      catalog.isolated.every((job) => !job.jobname.includes(inactiveUnitId)),
      'unidade inativa nao pode ganhar job',
    );
    assert.ok(
      catalog.isolated.every((job) => job.active === true),
      'os quatro jobs isolados devem permanecer ativos',
    );

    const cronApiResult = psql(
      container,
      `select jsonb_agg(to_jsonb(c) - 'id' order by id)::text from cron.api_calls c;`,
    );
    assert.equal(cronApiResult.status, 0, cronApiResult.stderr);
    const cronApiCalls = JSON.parse(cronApiResult.stdout.trim());
    assert.ok(
      cronApiCalls.some((call) => (
        call.operation === 'unschedule' && call.jobname === legacyJobName
      )),
      'job legado deve ser desagendado pelo nome exato',
    );
    assert.ok(
      cronApiCalls.every((call) => call.jobname !== 'job-alheio-nao-tocar'),
      'APIs do cron nao podem tocar jobs alheios',
    );

    const minutes = catalog.isolated.map((job) => parseCronMinute(job.schedule));
    assert.equal(new Set(minutes).size, 4, 'horarios UTC devem ser escalonados');
    assert.ok(
      [...minutes].sort((a, b) => a - b).every(
        (minute, index, ordered) => index === 0 || minute - ordered[index - 1] >= 5,
      ),
      'jobs devem ter intervalo minimo de cinco minutos',
    );

    const parsedCommands = new Map();
    for (const job of catalog.isolated) {
      assert.doesNotMatch(job.command, /executar_health_score_professor_v3_cron_diario/iu);
      assert.doesNotMatch(job.command, /from\s+public\.unidades|\bloop\b/iu);
      assert.doesNotMatch(job.command, /fixture-secret|bearer\s+/iu);
      parsedCommands.set(job.jobname, parseScheduledCommand(job.command));
    }
    assert.equal(
      new Set([...parsedCommands.values()].map((parsed) => parsed.signature)).size,
      1,
      'todos os jobs devem chamar a mesma assinatura publica contratada',
    );
    assert.deepEqual(
      [...parsedCommands.values()]
        .filter((parsed) => parsed.scope === 'unidade')
        .map((parsed) => parsed.unitId)
        .sort(),
      [...unitIds].sort(),
    );
    assert.equal(
      [...parsedCommands.values()].filter((parsed) => parsed.scope === 'consolidado').length,
      1,
    );

    const beforeExecution = psql(
      container,
      'truncate public.health_score_v3_executor_calls, net.http_calls restart identity;',
    );
    assert.equal(beforeExecution.status, 0, beforeExecution.stderr);

    const orderedJobs = [...catalog.isolated].sort((a, b) => (
      parseCronMinute(a.schedule) - parseCronMinute(b.schedule)
    ));
    const returnedResults = [];
    for (const job of orderedJobs) {
      const parsedCommand = parsedCommands.get(job.jobname);
      const execution = psql(container, `set role service_role; ${job.command}`);
      assert.equal(execution.status, 0, execution.stderr);
      returnedResults.push(...parseJsonLines(execution.stdout).map((result) => ({
        scope: parsedCommand.scope,
        unidade_id: parsedCommand.unitId,
        result,
      })));
    }

    const callsResult = psql(
      container,
      `select jsonb_agg(to_jsonb(c) - 'id' order by id)::text
         from public.health_score_v3_executor_calls c;`,
    );
    assert.equal(callsResult.status, 0, callsResult.stderr);
    const calls = JSON.parse(callsResult.stdout.trim());
    assert.equal(calls.length, 4);
    assert.deepEqual(calls.map((call) => call.periodicidade), Array(4).fill('mensal'));
    assert.ok(calls.every((call) => call.competencia.endsWith('-01')));
    assert.deepEqual(
      calls.filter((call) => call.escopo === 'unidade').map((call) => call.unidade_id).sort(),
      [...unitIds].sort(),
    );
    assert.deepEqual(
      calls.filter((call) => call.escopo === 'consolidado').map((call) => call.unidade_id),
      [null],
    );
    assert.equal(returnedResults.length, 4);
    assert.deepEqual(
      returnedResults.map(({ result }) => result.status).sort(),
      ['erro', 'materializado', 'parcial', 'sem_alteracao'],
    );
    const byUnit = new Map(returnedResults.map((entry) => [entry.unidade_id, entry.result]));
    assert.equal(byUnit.get(unitIds[0]).status, 'parcial');
    assert.deepEqual(byUnit.get(unitIds[0]).professores_incompletos, [101]);
    assert.equal(byUnit.get(unitIds[1]).status, 'materializado');
    assert.deepEqual(byUnit.get(unitIds[1]).professores_incompletos, []);
    assert.equal(byUnit.get(unitIds[2]).status, 'erro');
    assert.equal(byUnit.get(unitIds[2]).erro, 'fixture-error');
    assert.deepEqual(byUnit.get(unitIds[2]).professores_incompletos, [303]);
    assert.equal(byUnit.get(null).status, 'sem_alteracao');
    assert.deepEqual(byUnit.get(null).professores_incompletos, []);

    const alertsResult = psql(
      container,
      `select jsonb_agg(to_jsonb(h) - 'id' order by id)::text from net.http_calls h;`,
    );
    assert.equal(alertsResult.status, 0, alertsResult.stderr);
    const alerts = JSON.parse(alertsResult.stdout.trim());
    assert.equal(alerts.length, 1, 'somente status=erro deve disparar alerta');
    const authorization = Object.entries(alerts[0].headers).find(
      ([key]) => key.toLowerCase() === 'authorization',
    )?.[1];
    assert.equal(authorization, 'Bearer fixture-secret-never-in-job');
    assert.equal(alerts[0].body.execution_id, 'exec-erro');
    for (const nonErrorExecutionId of [
      'exec-parcial',
      'exec-materializado',
      'exec-sem-alteracao',
    ]) {
      assert.equal(
        alerts.filter((alert) => alert.body.execution_id === nonErrorExecutionId).length,
        0,
        `${nonErrorExecutionId} nao pode disparar alerta`,
      );
    }

    const exactSignature = [...parsedCommands.values()][0].signature;
    const securityResult = psql(
      container,
      `with wrapper as (
         select p.oid,
                format(
                  'public.%I(%s)',
                  p.proname,
                  replace(pg_get_function_identity_arguments(p.oid), ', ', ',')
                ) as assinatura,
                p.prosecdef, p.proconfig, p.proacl, p.proowner,
                pg_get_functiondef(p.oid) as definicao
           from pg_proc p
          where p.oid = to_regprocedure('${exactSignature}')
       )
       select jsonb_build_object(
         'assinatura', assinatura,
         'security_definer', prosecdef,
         'config', proconfig,
         'public', exists (
           select 1
           from aclexplode(coalesce(proacl, acldefault('f', proowner))) a
           where a.grantee = 0 and a.privilege_type = 'EXECUTE'
         ),
         'anon', has_function_privilege('anon', oid, 'EXECUTE'),
         'authenticated', has_function_privilege('authenticated', oid, 'EXECUTE'),
         'service_role', has_function_privilege('service_role', oid, 'EXECUTE'),
         'core_calls', (length(lower(definicao)) - length(replace(lower(definicao),
           'executar_health_score_professor_v3_escopo_diario(', '')))
           / length('executar_health_score_professor_v3_escopo_diario('),
         'has_loop', lower(definicao) ~ '\\mloop\\M',
         'reads_units', lower(definicao) like '%from public.unidades%'
       )::text from wrapper;`,
    );
    assert.equal(securityResult.status, 0, securityResult.stderr);
    assert.notEqual(securityResult.stdout.trim(), '', `assinatura ausente: ${exactSignature}`);
    const wrapper = JSON.parse(securityResult.stdout.trim());
    assert.equal(wrapper.assinatura, exactSignature);
    assert.equal(wrapper.security_definer, true);
    assert.ok(wrapper.config?.includes('search_path=public, pg_temp'));
    assert.equal(wrapper.public, false);
    assert.equal(wrapper.anon, false);
    assert.equal(wrapper.authenticated, false);
    assert.equal(wrapper.service_role, true);
    assert.equal(wrapper.core_calls, 1);
    assert.equal(wrapper.has_loop, false);
    assert.equal(wrapper.reads_units, false);
  } finally {
    docker(['rm', '--force', container]);
  }
});
