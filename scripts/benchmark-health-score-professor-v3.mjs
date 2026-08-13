#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

export const restartWindowMinutes = 15;
export const cronBudgetMs = 75_000;
const statsRetryAttempts = 15;
const statsRetryDelayMs = 100;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function usage() {
  return `Uso seguro em PowerShell (uma linha):
  $env:DATABASE_URL='<url-nao-producao>'; node scripts/benchmark-health-score-professor-v3.mjs --competencia YYYY-MM-01 --unit-id <uuid-1> [--unit-id <uuid-N> ...] --postgres-restarted-after <ISO-8601> --output <arquivo-novo.json> --confirm-non-production

Executa 3 rodadas x (N unidades ativas + consolidado) em uma unica transacao. Cada executor completo e
medido por EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON), grava o status em tabela
temporaria e preserva seus writes para as rodadas seguintes. Um unico ROLLBACK
no finally desfaz tudo, inclusive em erro ou sinal.

Exige reinicio observavel nos ultimos ${restartWindowMinutes} minutos e
track_functions=all. A rodada 1 observa shared_buffers apos o reinicio; o cache
do sistema operacional nao e controlado nem garantido. Rodadas 2 e 3 sao
aquecidas. O wrapper de alerta e validado separadamente e nao e disparado.`;
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
  if (!match) throw new Error(`${label} deve ser ISO-8601 com timezone`);
  const [, year, month, day, hour, minute, second, timezone] = match;
  const calendarProbe = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const offsetHours = timezone === 'Z' ? 0 : Number(timezone.slice(1, 3));
  const offsetMinutes = timezone === 'Z' ? 0 : Number(timezone.slice(4, 6));
  if (
    calendarProbe.getUTCFullYear() !== Number(year)
    || calendarProbe.getUTCMonth() + 1 !== Number(month)
    || calendarProbe.getUTCDate() !== Number(day)
    || Number(hour) > 23
    || Number(minute) > 59
    || Number(second) > 59
    || offsetHours > 14
    || (offsetHours === 14 && offsetMinutes !== 0)
    || offsetMinutes > 59
  ) throw new Error(`${label} deve ser ISO-8601 valido`);
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
  const competence = new Date(`${args.competencia}T00:00:00Z`);
  if (
    Number.isNaN(competence.valueOf())
    || competence.toISOString().slice(0, 10) !== args.competencia
  ) throw new Error('--competencia deve ser uma data valida YYYY-MM-01');
  if (args.unitIds.length < 1) throw new Error('Informe ao menos um --unit-id');
  if (new Set(args.unitIds.map((id) => id.toLowerCase())).size !== args.unitIds.length) {
    throw new Error('Os --unit-id devem ser distintos');
  }
  for (const id of args.unitIds) {
    if (!uuidPattern.test(id)) throw new Error(`--unit-id invalido: ${id}`);
  }
  parseIsoTimestamp(args.postgresRestartedAfter, '--postgres-restarted-after');
  if (!args.output) throw new Error('--output explicito e obrigatorio');
}

function psqlArgs() {
  return ['--no-psqlrc', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'];
}

function psqlEnv(databaseUrl) {
  return { ...process.env, PGDATABASE: databaseUrl };
}

function runPsql(databaseUrl, sql) {
  const result = spawnSync('psql', psqlArgs(), {
    input: sql,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    env: psqlEnv(databaseUrl),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`psql falhou (${result.status}): ${result.stderr.trim()}`);
  return result.stdout.trim();
}

class PsqlSession {
  constructor(databaseUrl) {
    this.child = spawn('psql', psqlArgs(), {
      env: psqlEnv(databaseUrl),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.stdout = '';
    this.stderr = '';
    this.pending = null;
    this.closed = false;
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => {
      this.stdout += chunk;
      this.#resolvePending();
    });
    this.child.stderr.on('data', (chunk) => { this.stderr += chunk; });
    this.child.on('error', (error) => {
      this.closed = true;
      if (this.pending) {
        this.pending.reject(error);
        this.pending = null;
      }
    });
    this.child.on('exit', (code, signal) => {
      this.closed = true;
      if (this.pending) {
        this.pending.reject(new Error(
          `psql encerrou durante a transacao (code=${code}, signal=${signal}): ${this.stderr.trim()}`,
        ));
        this.pending = null;
      }
    });
  }

  #resolvePending() {
    if (!this.pending) return;
    const startIndex = this.stdout.indexOf(this.pending.start);
    const endIndex = this.stdout.indexOf(this.pending.end, startIndex + this.pending.start.length);
    if (startIndex === -1 || endIndex === -1) return;
    const value = this.stdout
      .slice(startIndex + this.pending.start.length, endIndex)
      .replace(/^\r?\n|\r?\n$/gu, '')
      .trim();
    this.stdout = this.stdout.slice(endIndex + this.pending.end.length);
    const { resolve } = this.pending;
    this.pending = null;
    resolve(value);
  }

  query(sql) {
    if (this.closed) return Promise.reject(new Error('sessao psql encerrada'));
    if (this.pending) return Promise.reject(new Error('consulta concorrente na sessao psql'));
    const token = randomUUID().replaceAll('-', '');
    const start = `__LA_HS_BEGIN_${token}__`;
    const end = `__LA_HS_END_${token}__`;
    return new Promise((resolve, reject) => {
      this.pending = { start, end, resolve, reject };
      this.child.stdin.write(`\\echo ${start}\n${sql.trim()}\n\\echo ${end}\n`);
    });
  }

  async close() {
    if (this.closed) return;
    await new Promise((resolve) => {
      this.child.once('exit', resolve);
      this.child.stdin.end('\\q\n');
      setTimeout(() => {
        if (!this.closed) this.child.kill('SIGTERM');
      }, 1_000).unref();
    });
  }
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseJson(raw, context) {
  try { return JSON.parse(raw); } catch { throw new Error(`${context} nao retornou JSON valido`); }
}

export function validateRestartEvidence({ evidenceIso, postmasterStartIso, verifiedAtIso, firstRoundStartedAtIso }) {
  const evidence = parseIsoTimestamp(evidenceIso, '--postgres-restarted-after');
  const postmasterStart = parseIsoTimestamp(postmasterStartIso, 'pg_postmaster_start_time()');
  const verifiedAt = parseIsoTimestamp(verifiedAtIso, 'clock_timestamp()');
  const firstRoundStartedAt = firstRoundStartedAtIso
    ? parseIsoTimestamp(firstRoundStartedAtIso, 'inicio da primeira rodada')
    : null;
  if (postmasterStart < evidence) throw new Error('pg_postmaster_start_time() e anterior a evidencia informada');
  if (postmasterStart > verifiedAt) throw new Error('pg_postmaster_start_time() e posterior ao relogio do banco');
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
  if (requested.length < 1) throw new Error('informe ao menos uma unidade ativa');
  if (new Set(requested).size !== requested.length) {
    throw new Error('lista solicitada contem unidades duplicadas');
  }
  const resolved = rows.map((row) => {
    if (typeof row.id !== 'string' || typeof row.ativo !== 'boolean') {
      throw new Error('consulta de unidades retornou payload invalido');
    }
    return { id: row.id.toLowerCase(), ativo: row.ativo, nome: row.nome ?? null };
  });
  const active = resolved.filter((row) => row.ativo).map((row) => row.id).sort();
  if (
    resolved.length !== active.length
    || new Set(active).size !== active.length
    || active.join(',') !== requested.join(',')
  ) {
    throw new Error('os UUIDs devem corresponder exatamente a todas as unidades ativas');
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
  const trackFunctions = assertTrackFunctions(runPsql(databaseUrl, 'show track_functions;'));
  const environment = parseJson(runPsql(databaseUrl, `
    select jsonb_build_object(
      'verified_at', clock_timestamp(),
      'postmaster_start_time', pg_postmaster_start_time(),
      'units', coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id, 'nome', u.nome, 'ativo', u.ativo
      ) order by u.id), '[]'::jsonb)
    )::text
    from public.unidades u
    where ativo = true;
  `), 'verificacao do ambiente');
  return {
    track_functions: trackFunctions,
    restart: validateRestartEvidence({
      evidenceIso: args.postgresRestartedAfter,
      postmasterStartIso: environment.postmaster_start_time,
      verifiedAtIso: environment.verified_at,
    }),
    units: validateActiveUnits(args.unitIds, environment.units),
  };
}

function requiredNumber(object, field, context) {
  if (!Object.hasOwn(object, field) || typeof object[field] !== 'number') {
    throw new Error(`EXPLAIN sem campo numerico obrigatorio ${context}.${field}`);
  }
  return object[field];
}

function summarizePlan(document) {
  const root = document.Plan;
  return {
    planning_time_ms: requiredNumber(document, 'Planning Time', 'documento'),
    execution_time_ms: requiredNumber(document, 'Execution Time', 'documento'),
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
    throw new Error('EXPLAIN nao retornou documento JSON valido');
  }
}

function statsSql() {
  return `
    select pg_stat_clear_snapshot();
    select coalesce(jsonb_agg(jsonb_build_object(
      'oid', funcid::text, 'schema', schemaname, 'function', funcname,
      'calls', calls, 'total_time_ms', total_time, 'self_time_ms', self_time
    ) order by funcid), '[]'::jsonb)::text from pg_stat_user_functions;
  `;
}

function parseFunctionStats(raw) {
  const rows = parseJson(raw, 'pg_stat_user_functions');
  if (!Array.isArray(rows)) throw new Error('pg_stat_user_functions nao retornou array');
  for (const row of rows) {
    if (typeof row.oid !== 'string' || typeof row.schema !== 'string' || typeof row.function !== 'string') {
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
      oid: row.oid, schema: row.schema, function: row.function,
      calls_delta: Number(row.calls) - Number(old.calls),
      total_time_delta_ms: Number(row.total_time_ms) - Number(old.total_time_ms),
      self_time_delta_ms: Number(row.self_time_ms) - Number(old.self_time_ms),
    };
  }).filter((row) => row.calls_delta > 0);
  deltas.sort((a, b) => b.total_time_delta_ms - a.total_time_delta_ms
    || b.self_time_delta_ms - a.self_time_delta_ms || Number(a.oid) - Number(b.oid));
  return deltas[0] ?? null;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForFunctionDelta(databaseUrl, beforeRows) {
  for (let attempt = 1; attempt <= statsRetryAttempts; attempt += 1) {
    const afterRows = parseFunctionStats(runPsql(databaseUrl, statsSql()));
    const dominant = dominantFunctionDelta(beforeRows, afterRows);
    if (dominant) return { available: true, attempts: attempt, ...dominant };
    if (attempt < statsRetryAttempts) await wait(statsRetryDelayMs);
  }
  throw new Error(`pg_stat_user_functions sem delta positivo apos ${statsRetryAttempts} tentativas`);
}

export async function executeObservableSequence({
  captureBaseline,
  beginTransaction,
  prepareTransaction = async () => {},
  executions,
  rollbackTransaction,
  capturePostRollback,
}) {
  const events = [];
  let baseline;
  let aggregateDominantFunction;
  let transactionStarted = false;
  let originalError = null;
  let rollbackError = null;
  let statsError = null;
  try {
    baseline = await captureBaseline();
    events.push('baseline');
    await beginTransaction();
    transactionStarted = true;
    events.push('begin');
    await prepareTransaction();
    for (let index = 0; index < executions.length; index += 1) {
      await executions[index]();
      events.push(`execution:${index + 1}`);
    }
  } catch (error) {
    originalError = error;
  } finally {
    if (transactionStarted) {
      try {
        await rollbackTransaction();
        events.push('rollback');
      } catch (error) {
        rollbackError = error;
      }
    }
    if (baseline !== undefined) {
      try {
        aggregateDominantFunction = await capturePostRollback(baseline);
        events.push('stats');
      } catch (error) {
        statsError = error;
      }
    }
  }
  if (originalError) {
    originalError.benchmarkCleanup = {
      rollback_error: rollbackError?.message ?? null,
      stats_error: statsError?.message ?? null,
    };
    throw originalError;
  }
  if (rollbackError) throw rollbackError;
  if (statsError) throw statsError;
  if (!aggregateDominantFunction?.available) {
    throw new Error('funcao dominante agregada indisponivel apos rollback');
  }
  return { baseline, aggregateDominantFunction, events };
}

function scopeKey(scope) {
  return scope.escopo === 'consolidado' ? 'consolidado' : `unidade:${scope.unidade_id}`;
}

function executionSql(round, scope, competencia) {
  const unit = scope.unidade_id ? `${sqlLiteral(scope.unidade_id)}::uuid` : 'null::uuid';
  return `
    explain (analyze, buffers, format json)
    insert into health_score_v3_benchmark_resultados (rodada, escopo, unidade_id, resultado)
    select ${round}, ${sqlLiteral(scope.escopo)}, ${unit},
      public.executar_health_score_professor_v3_escopo_diario(
        ${sqlLiteral(competencia)}::date, 'mensal', ${sqlLiteral(scope.escopo)}, ${unit}
      );
  `;
}

export function assertStatusContract(round, status) {
  if (round === 1 && status === 'baseline_adotado') {
    throw new Error(
      'rodada 1 retornou baseline_adotado: fixture nao limpa; prepare snapshots compativeis antes de medir',
    );
  }
  const allowedFirst = new Set(['materializado', 'parcial']);
  if (round === 1 && !allowedFirst.has(status)) {
    throw new Error(`rodada 1 retornou status inesperado: ${status}`);
  }
  if (round > 1 && status !== 'sem_alteracao') {
    throw new Error(`rodada ${round} deve exercitar sem_alteracao; recebeu ${status}`);
  }
  return status;
}

export function summarizeRounds(measurements, wallClockByRound) {
  const firstRound = measurements.filter((entry) => entry.round === 1);
  const expectedScopeKeys = firstRound.map((entry) => scopeKey(entry.scope)).sort();
  if (expectedScopeKeys.length < 2 || new Set(expectedScopeKeys).size !== expectedScopeKeys.length) {
    throw new Error('rodada 1 deve conter N unidades distintas e um consolidado');
  }
  if (expectedScopeKeys.filter((key) => key === 'consolidado').length !== 1) {
    throw new Error('rodada 1 deve conter exatamente um escopo consolidado');
  }
  const rounds = [1, 2, 3].map((round) => {
    const entries = measurements.filter((entry) => entry.round === round);
    const actualScopeKeys = entries.map((entry) => scopeKey(entry.scope)).sort();
    if (
      actualScopeKeys.length !== expectedScopeKeys.length
      || actualScopeKeys.join(',') !== expectedScopeKeys.join(',')
    ) throw new Error(`rodada ${round} deve conter o mesmo conjunto dinamico de escopos`);
    const total = entries.reduce((sum, entry) => sum + entry.summary.execution_time_ms, 0);
    const maximum = [...entries].sort((a, b) => b.summary.execution_time_ms - a.summary.execution_time_ms)[0];
    const states = Object.fromEntries(entries.map((entry) => [scopeKey(entry.scope), entry.status]));
    return {
      round,
      execution_time_total_ms: total,
      wall_clock_ms: requiredNumber(wallClockByRound, String(round), 'wall_clock_por_rodada'),
      max_scope: {
        scope: maximum.scope,
        execution_time_ms: maximum.summary.execution_time_ms,
      },
      states_by_scope: states,
      classification: total < cronBudgetMs ? 'abaixo_75s' : 'atingiu_ou_superou_75s',
    };
  });
  const current = rounds.every((round) => round.execution_time_total_ms < cronBudgetMs)
    ? 'sequencial_elegivel'
    : 'isolamento_obrigatorio';
  return {
    rounds,
    decision: {
      decisao_global: current,
      decisao_historica: 'isolamento_obrigatorio',
      decisao_operacional: 'isolamento_obrigatorio',
      justificativa_historica: 'execucoes observadas de 92s e 116s sob teto de plataforma de 120s',
    },
  };
}

async function runBenchmarkTransaction(databaseUrl, args, environment) {
  const session = new PsqlSession(databaseUrl);
  let rollbackCompleted = false;
  let rollbackPromise = null;
  const rollbackOnce = () => {
    if (rollbackCompleted) return Promise.resolve();
    if (!rollbackPromise) {
      rollbackPromise = session.query('rollback;').finally(() => { rollbackCompleted = true; });
    }
    return rollbackPromise;
  };
  const signalHandler = (signal) => {
    const signalExitCode = signal === 'SIGINT' ? 130 : 143;
    void rollbackOnce().finally(async () => {
      await session.close();
      process.exit(signalExitCode);
    });
  };
  process.once('SIGINT', signalHandler);
  process.once('SIGTERM', signalHandler);

  const measurements = [];
  const wallClockByRound = {};
  const scopes = [
    ...args.unitIds.map((unidadeId) => ({ escopo: 'unidade', unidade_id: unidadeId })),
    { escopo: 'consolidado', unidade_id: null },
  ];
  const executions = [];
  for (let round = 1; round <= 3; round += 1) {
    scopes.forEach((scope, scopeIndex) => executions.push({ round, scope, scopeIndex }));
  }
  const wallStartedByRound = {};
  try {
    const sequence = await executeObservableSequence({
      captureBaseline: async () => parseFunctionStats(runPsql(databaseUrl, statsSql())),
      beginTransaction: async () => session.query('begin;'),
      prepareTransaction: async () => {
        await session.query(`
          create temporary table health_score_v3_benchmark_resultados (
            rodada integer not null,
            escopo text not null,
            unidade_id uuid,
            resultado jsonb not null
          ) on commit drop;
        `);
        const marker = parseJson(await session.query(`
          select jsonb_build_object(
            'postmaster_start_time', pg_postmaster_start_time(),
            'first_round_started_at', clock_timestamp(),
            'track_functions', current_setting('track_functions')
          )::text;
        `), 'marcador da primeira rodada');
        assertTrackFunctions(marker.track_functions);
        if (new Date(marker.postmaster_start_time).valueOf()
          !== new Date(environment.restart.postmaster_start_time).valueOf()) {
          throw new Error('PostgreSQL reiniciou entre a verificacao e a primeira rodada');
        }
        environment.restart = validateRestartEvidence({
          evidenceIso: environment.restart.postgres_restarted_after_evidence,
          postmasterStartIso: marker.postmaster_start_time,
          verifiedAtIso: marker.first_round_started_at,
          firstRoundStartedAtIso: marker.first_round_started_at,
        });
      },
      executions: executions.map(({ round, scope, scopeIndex }) => async () => {
        if (scopeIndex === 0) wallStartedByRound[String(round)] = performance.now();
        const rawExplain = parseJson(await session.query(executionSql(round, scope, args.competencia)), 'EXPLAIN');
        assertExplainDocument(rawExplain);
        const result = parseJson(await session.query(`
          select resultado::text from health_score_v3_benchmark_resultados
          where rodada = ${round} and escopo = ${sqlLiteral(scope.escopo)}
            and unidade_id is not distinct from ${scope.unidade_id ? `${sqlLiteral(scope.unidade_id)}::uuid` : 'null::uuid'};
        `), 'resultado do executor');
        const status = assertStatusContract(round, result.status);
        measurements.push({
          round,
          cache_observation: round === 1 ? 'shared_buffers_reiniciado_observavel' : 'aquecida',
          os_cache_guaranteed: false,
          scope,
          status,
          executor_result: result,
          summary: summarizePlan(rawExplain[0]),
          function_observability: 'nao_atribuivel_sem_instrumentacao_intrusiva',
          raw_explain: rawExplain,
        });
        if (scopeIndex === scopes.length - 1) {
          wallClockByRound[String(round)] = performance.now() - wallStartedByRound[String(round)];
        }
      }),
      rollbackTransaction: rollbackOnce,
      capturePostRollback: async (baseline) => waitForFunctionDelta(databaseUrl, baseline),
    });
    return {
      measurements,
      wallClockByRound,
      aggregate_dominant_function: sequence.aggregateDominantFunction,
      observability_order: sequence.events,
      rollback_strategy: 'rollback_unico_no_finally',
    };
  } finally {
    process.removeListener('SIGINT', signalHandler);
    process.removeListener('SIGTERM', signalHandler);
    await session.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  assertInputs(args, databaseUrl);
  if (args.help) { process.stdout.write(`${usage()}\n`); return; }
  const environment = verifyEnvironment(databaseUrl, args);
  const benchmark = await runBenchmarkTransaction(databaseUrl, args, environment);
  const summary = summarizeRounds(benchmark.measurements, benchmark.wallClockByRound);
  const scopesPerRound = args.unitIds.length + 1;
  const executionsPerBenchmark = scopesPerRound * 3;
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
    executions: executionsPerBenchmark,
    rounds: 3,
    scopes_per_round: scopesPerRound,
    sequential: true,
    transaction_policy: `uma_transacao_${executionsPerBenchmark}_execucoes_rollback_unico_finally`,
    writes_preserved_between_rounds: true,
    writes_preserved_after_benchmark: false,
    rollback_strategy: benchmark.rollback_strategy,
    observability_order: benchmark.observability_order,
    aggregate_dominant_function: benchmark.aggregate_dominant_function,
    alert_wrapper: 'validado_separadamente_nao_disparado_no_benchmark',
    round_summaries: summary.rounds,
    decision: summary.decision,
    measurements: benchmark.measurements,
  };
  writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`Benchmark gravado em ${args.output}\n`);
}

const invokedAsScript = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedAsScript) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n\n${usage()}\n`);
    process.exitCode = 1;
  });
}
