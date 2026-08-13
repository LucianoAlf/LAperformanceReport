#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const restartWindowMinutes = 15;
const statsRetryAttempts = 15;
const statsRetryDelayMs = 100;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function usage() {
  return `Uso seguro em PowerShell (uma linha):
  $env:DATABASE_URL='<url-nao-producao>'; node scripts/benchmark-health-score-professor-v3.mjs --competencia YYYY-MM-01 --unit-id <uuid-1> --unit-id <uuid-2> --unit-id <uuid-3> --postgres-restarted-after <ISO-8601> --output <arquivo-novo.json> --confirm-non-production

Executa tres rodadas sequenciais dos quatro executores completos com
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON), cada chamada dentro de BEGIN/ROLLBACK.
Exige PostgreSQL reiniciado de forma observavel nos ultimos ${restartWindowMinutes} minutos e
track_functions=all. A rodada 1 observa shared_buffers apos esse reinicio;
o cache do sistema operacional nao e controlado nem garantido. Rodadas 2 e 3
sao classificadas como aquecidas.

Isso mede materializacao, fingerprint e persistencia sem conservar writes.
O wrapper de alerta e validado separadamente e nao e disparado pelo benchmark.`;
}

export function parseArgs(argv) {
  const args = { unitIds: [], confirmNonProduction: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') args.help = true;
    else if (token === '--confirm-non-production') args.confirmNonProduction = true;
    else if (token === '--competencia') args.competencia = argv[++index];
    else if (token === '--unit-id') args.unitIds.push(argv[++index]);
    else if (token === '--postgres-restarted-after') args.postgresRestartedAfter = argv[++index];
    else if (token === '--output') args.output = argv[++index];
    else throw new Error(`Argumento desconhecido: ${token}`);
  }
  return args;
}

function parseIsoTimestamp(value, label) {
  const match = typeof value === 'string'
    ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/u.exec(value)
    : null;
  if (!match) {
    throw new Error(`${label} deve ser ISO-8601 com timezone`);
  }
  const [, year, month, day, hour, minute, second, timezone] = match;
  const calendarProbe = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const invalidCalendar = calendarProbe.getUTCFullYear() !== Number(year)
    || calendarProbe.getUTCMonth() + 1 !== Number(month)
    || calendarProbe.getUTCDate() !== Number(day);
  const offsetHours = timezone === 'Z' ? 0 : Number(timezone.slice(1, 3));
  const offsetMinutes = timezone === 'Z' ? 0 : Number(timezone.slice(4, 6));
  if (
    invalidCalendar
    || Number(hour) > 23
    || Number(minute) > 59
    || Number(second) > 59
    || offsetHours > 14
    || (offsetHours === 14 && offsetMinutes !== 0)
    || offsetMinutes > 59
  ) {
    throw new Error(`${label} deve ser ISO-8601 valido`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw new Error(`${label} deve ser ISO-8601 valido`);
  return parsed;
}

export function assertInputs(args, databaseUrl) {
  if (args.help) return;
  if (!databaseUrl) throw new Error('DATABASE_URL e obrigatoria');
  if (!args.confirmNonProduction) {
    throw new Error('Confirme ambiente autorizado nao produtivo com --confirm-non-production');
  }
  if (!/^\d{4}-\d{2}-01$/u.test(args.competencia ?? '')) {
    throw new Error('--competencia deve usar YYYY-MM-01');
  }
  const parsedCompetencia = new Date(`${args.competencia}T00:00:00Z`);
  if (
    Number.isNaN(parsedCompetencia.valueOf())
    || parsedCompetencia.toISOString().slice(0, 10) !== args.competencia
  ) {
    throw new Error('--competencia deve ser uma data valida YYYY-MM-01');
  }
  if (args.unitIds.length !== 3) throw new Error('Informe exatamente tres --unit-id');
  if (new Set(args.unitIds.map((id) => id.toLowerCase())).size !== 3) {
    throw new Error('Os tres --unit-id devem ser distintos');
  }
  for (const id of args.unitIds) {
    if (!uuidPattern.test(id)) throw new Error(`--unit-id invalido: ${id}`);
  }
  parseIsoTimestamp(args.postgresRestartedAfter, '--postgres-restarted-after');
  if (!args.output) throw new Error('--output explicito e obrigatorio');
}

function runPsql(databaseUrl, sql) {
  const result = spawnSync(
    'psql',
    ['--no-psqlrc', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
    {
      input: sql,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      env: { ...process.env, PGDATABASE: databaseUrl },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`psql falhou (${result.status}): ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseJson(raw, context) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${context} nao retornou JSON valido`);
  }
}

export function validateRestartEvidence({
  evidenceIso,
  postmasterStartIso,
  verifiedAtIso,
  firstRoundStartedAtIso,
}) {
  const evidence = parseIsoTimestamp(evidenceIso, '--postgres-restarted-after');
  const postmasterStart = parseIsoTimestamp(postmasterStartIso, 'pg_postmaster_start_time()');
  const verifiedAt = parseIsoTimestamp(verifiedAtIso, 'clock_timestamp()');
  const firstRoundStartedAt = firstRoundStartedAtIso
    ? parseIsoTimestamp(firstRoundStartedAtIso, 'inicio da primeira rodada')
    : null;

  if (postmasterStart < evidence) {
    throw new Error('pg_postmaster_start_time() e anterior a evidencia informada');
  }
  if (postmasterStart > verifiedAt) {
    throw new Error('pg_postmaster_start_time() e posterior ao relogio do banco');
  }
  const ageMs = verifiedAt - postmasterStart;
  if (ageMs > restartWindowMinutes * 60 * 1000) {
    throw new Error(`reinicio do PostgreSQL excede a janela de ${restartWindowMinutes} minutos`);
  }
  if (firstRoundStartedAt && postmasterStart >= firstRoundStartedAt) {
    throw new Error('reinicio do PostgreSQL deve ocorrer antes da primeira rodada');
  }
  return {
    postgres_restarted_after_evidence: evidence.toISOString(),
    postmaster_start_time: postmasterStart.toISOString(),
    restart_verified_at: verifiedAt.toISOString(),
    first_round_started_at: firstRoundStartedAt?.toISOString() ?? null,
    postmaster_age_seconds_at_verification: ageMs / 1000,
    restart_window_minutes: restartWindowMinutes,
  };
}

export function validateActiveUnits(requestedIds, rows) {
  if (!Array.isArray(rows)) throw new Error('consulta de unidades nao retornou array');
  const requested = requestedIds.map((id) => id.toLowerCase()).sort();
  const resolved = rows.map((row) => {
    if (typeof row.id !== 'string' || typeof row.ativo !== 'boolean') {
      throw new Error('consulta de unidades retornou payload invalido');
    }
    return { id: row.id.toLowerCase(), ativo: row.ativo, nome: row.nome ?? null };
  });
  const active = resolved.filter((row) => row.ativo).map((row) => row.id).sort();
  if (resolved.length !== 3 || active.length !== 3 || active.join(',') !== requested.join(',')) {
    throw new Error('os tres UUIDs devem corresponder exatamente a unidades ativas existentes');
  }
  return resolved.sort((a, b) => a.id.localeCompare(b.id));
}

export function assertTrackFunctions(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized !== 'all') {
    throw new Error(`track_functions deve ser all; valor atual: ${normalized || 'vazio'}`);
  }
  return normalized;
}

function verifyEnvironment(databaseUrl, args) {
  const trackFunctions = assertTrackFunctions(
    runPsql(databaseUrl, 'show track_functions;'),
  );

  const unitValues = args.unitIds
    .map((id) => `(${sqlLiteral(id)}::uuid)`)
    .join(', ');
  const raw = runPsql(databaseUrl, `
    with solicitadas(id) as (values ${unitValues})
    select jsonb_build_object(
      'verified_at', clock_timestamp(),
      'postmaster_start_time', pg_postmaster_start_time(),
      'units', coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id,
        'nome', u.nome,
        'ativo', coalesce(u.ativo, false)
      ) order by s.id), '[]'::jsonb)
    )::text
    from solicitadas s
    left join (
      select id, nome, ativo
      from public.unidades
      where ativo = true
    ) u on u.id = s.id;`);
  const environment = parseJson(raw, 'verificacao do ambiente');
  const restart = validateRestartEvidence({
    evidenceIso: args.postgresRestartedAfter,
    postmasterStartIso: environment.postmaster_start_time,
    verifiedAtIso: environment.verified_at,
  });
  const units = validateActiveUnits(args.unitIds, environment.units);
  return { track_functions: trackFunctions, restart, units };
}

function executorExplainSql(competencia, scope) {
  const unit = scope.unidade_id ? `${sqlLiteral(scope.unidade_id)}::uuid` : 'null::uuid';
  return `
begin;
explain (analyze, buffers, format json)
select public.executar_health_score_professor_v3_escopo_diario(
  ${sqlLiteral(competencia)}::date,
  'mensal',
  ${sqlLiteral(scope.escopo)},
  ${unit}
);
rollback;`;
}

function requiredNumber(object, field, context) {
  if (!Object.hasOwn(object, field) || typeof object[field] !== 'number') {
    throw new Error(`EXPLAIN sem campo numerico obrigatorio ${context}.${field}`);
  }
  return object[field];
}

function summarizePlan(planDocument) {
  const root = planDocument.Plan;
  return {
    planning_time_ms: requiredNumber(planDocument, 'Planning Time', 'documento'),
    execution_time_ms: requiredNumber(planDocument, 'Execution Time', 'documento'),
    shared_hit_blocks: requiredNumber(root, 'Shared Hit Blocks', 'Plan'),
    shared_read_blocks: requiredNumber(root, 'Shared Read Blocks', 'Plan'),
    shared_dirtied_blocks: requiredNumber(root, 'Shared Dirtied Blocks', 'Plan'),
    shared_written_blocks: requiredNumber(root, 'Shared Written Blocks', 'Plan'),
    temp_read_blocks: requiredNumber(root, 'Temp Read Blocks', 'Plan'),
    temp_written_blocks: requiredNumber(root, 'Temp Written Blocks', 'Plan'),
  };
}

function assertExplainDocument(parsed) {
  if (!Array.isArray(parsed) || parsed.length !== 1 || !parsed[0]?.Plan) {
    throw new Error('EXPLAIN nao retornou um documento JSON de plano valido');
  }
}

function readFunctionStats(databaseUrl) {
  const raw = runPsql(databaseUrl, `
    select pg_stat_clear_snapshot();
    select coalesce(jsonb_agg(jsonb_build_object(
      'oid', funcid::text,
      'schema', schemaname,
      'function', funcname,
      'calls', calls,
      'total_time_ms', total_time,
      'self_time_ms', self_time
    ) order by funcid), '[]'::jsonb)::text
    from pg_stat_user_functions;`);
  const rows = parseJson(raw, 'pg_stat_user_functions');
  if (!Array.isArray(rows)) throw new Error('pg_stat_user_functions nao retornou array');
  for (const row of rows) {
    if (
      typeof row.oid !== 'string'
      || typeof row.schema !== 'string'
      || typeof row.function !== 'string'
    ) {
      throw new Error('pg_stat_user_functions sem OID ou identidade completa');
    }
    requiredNumber(row, 'calls', 'pg_stat_user_functions');
    requiredNumber(row, 'total_time_ms', 'pg_stat_user_functions');
    requiredNumber(row, 'self_time_ms', 'pg_stat_user_functions');
  }
  return rows;
}

export function dominantFunctionDelta(beforeRows, afterRows) {
  const previous = new Map(beforeRows.map((row) => [row.oid, row]));
  const deltas = afterRows.map((row) => {
    const old = previous.get(row.oid) ?? { calls: 0, total_time_ms: 0, self_time_ms: 0 };
    return {
      oid: row.oid,
      schema: row.schema,
      function: row.function,
      calls_delta: Number(row.calls) - Number(old.calls),
      total_time_delta_ms: Number(row.total_time_ms) - Number(old.total_time_ms),
      self_time_delta_ms: Number(row.self_time_ms) - Number(old.self_time_ms),
    };
  }).filter((row) => row.calls_delta > 0);
  deltas.sort((a, b) => (
    b.total_time_delta_ms - a.total_time_delta_ms
    || b.self_time_delta_ms - a.self_time_delta_ms
    || Number(a.oid) - Number(b.oid)
  ));
  return deltas[0] ?? null;
}

function wait(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function waitForFunctionDelta(databaseUrl, beforeRows) {
  for (let attempt = 1; attempt <= statsRetryAttempts; attempt += 1) {
    const afterRows = readFunctionStats(databaseUrl);
    const dominant = dominantFunctionDelta(beforeRows, afterRows);
    if (dominant) return { available: true, attempts: attempt, ...dominant };
    if (attempt < statsRetryAttempts) wait(statsRetryDelayMs);
  }
  throw new Error(
    `pg_stat_user_functions sem delta positivo apos ${statsRetryAttempts} tentativas`,
  );
}

function firstRoundMarker(databaseUrl) {
  return parseJson(runPsql(databaseUrl, `
    select jsonb_build_object(
      'postmaster_start_time', pg_postmaster_start_time(),
      'first_round_started_at', clock_timestamp()
    )::text;`), 'marcador da primeira rodada');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  assertInputs(args, databaseUrl);
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const environment = verifyEnvironment(databaseUrl, args);
  const marker = firstRoundMarker(databaseUrl);
  if (
    new Date(marker.postmaster_start_time).valueOf()
    !== new Date(environment.restart.postmaster_start_time).valueOf()
  ) {
    throw new Error('PostgreSQL reiniciou entre a verificacao e a primeira rodada');
  }
  const initialEnvironmentVerifiedAt = environment.restart.restart_verified_at;
  environment.restart = validateRestartEvidence({
    evidenceIso: environment.restart.postgres_restarted_after_evidence,
    postmasterStartIso: marker.postmaster_start_time,
    verifiedAtIso: marker.first_round_started_at,
    firstRoundStartedAtIso: marker.first_round_started_at,
  });
  environment.restart.environment_initially_verified_at = initialEnvironmentVerifiedAt;

  const scopes = [
    ...args.unitIds.map((unidadeId) => ({ escopo: 'unidade', unidade_id: unidadeId })),
    { escopo: 'consolidado', unidade_id: null },
  ];
  const measurements = [];
  for (let round = 1; round <= 3; round += 1) {
    for (const scope of scopes) {
      const statsBefore = readFunctionStats(databaseUrl);
      const raw = runPsql(databaseUrl, executorExplainSql(args.competencia, scope));
      const rawExplain = parseJson(raw, 'EXPLAIN');
      assertExplainDocument(rawExplain);
      const dominantFunction = waitForFunctionDelta(databaseUrl, statsBefore);
      measurements.push({
        round,
        cache_observation: round === 1
          ? 'shared_buffers_reiniciado_observavel'
          : 'aquecida',
        os_cache_guaranteed: false,
        scope,
        summary: summarizePlan(rawExplain[0]),
        dominant_function_pg_stat: dominantFunction,
        raw_explain: rawExplain,
      });
    }
  }
  if (measurements.some((measurement) => !measurement.dominant_function_pg_stat?.available)) {
    throw new Error('benchmark incompleto: funcao dominante indisponivel');
  }

  const report = {
    generated_at: new Date().toISOString(),
    competencia: args.competencia,
    benchmark: 'executar_health_score_professor_v3_escopo_diario',
    environment_confirmation: 'nao_producao_autorizado',
    observability: {
      ...environment.restart,
      track_functions: environment.track_functions,
      units: environment.units,
      os_cache_guaranteed: false,
      os_cache_note: 'reinicio comprova shared_buffers; cache do sistema operacional nao e garantido',
    },
    rounds: 3,
    sequential: true,
    transaction_policy: 'begin_explain_analyze_rollback_por_escopo',
    writes_preserved: false,
    alert_wrapper: 'validado_separadamente_nao_disparado_no_benchmark',
    scopes,
    measurements,
  };
  writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`Benchmark gravado em ${args.output}\n`);
}

const invokedAsScript = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedAsScript) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${usage()}\n`);
    process.exitCode = 1;
  }
}
