import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertStatusContract,
  assertTrackFunctions,
  cronBudgetMs,
  dominantFunctionDelta,
  executeObservableSequence,
  restartWindowMinutes,
  summarizeRounds,
  validateActiveUnits,
  validateRestartEvidence,
} from '../scripts/benchmark-health-score-professor-v3.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(root, 'scripts/benchmark-health-score-professor-v3.mjs');
const script = readFileSync(scriptPath, 'utf8');
const unitIds = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
];

function runScript(args, databaseUrl) {
  const env = { ...process.env };
  if (databaseUrl === undefined) delete env.DATABASE_URL;
  else env.DATABASE_URL = databaseUrl;
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    env,
  });
}

function completeArgs() {
  return [
    '--competencia', '2026-08-01',
    ...unitIds.flatMap((id) => ['--unit-id', id]),
    '--postgres-restarted-after', '2026-08-13T12:00:00Z',
    '--output', 'benchmark-nao-criar.json',
    '--confirm-non-production',
  ];
}

test('benchmark exige alvo, competencia, lista nao vazia de unidades, output e confirmacao nao produtiva', () => {
  const missingDatabase = runScript(completeArgs(), undefined);
  assert.equal(missingDatabase.status, 1);
  assert.match(missingDatabase.stderr, /DATABASE_URL e obrigatoria/iu);

  const missingConfirmation = runScript(
    completeArgs().filter((arg) => arg !== '--confirm-non-production'),
    'postgresql://fixture.invalid/postgres',
  );
  assert.equal(missingConfirmation.status, 1);
  assert.match(missingConfirmation.stderr, /--confirm-non-production/iu);

  const invalidCompetence = runScript(
    completeArgs().map((arg) => arg === '2026-08-01' ? '2026-08-02' : arg),
    'postgresql://fixture.invalid/postgres',
  );
  assert.equal(invalidCompetence.status, 1);
  assert.match(invalidCompetence.stderr, /YYYY-MM-01/iu);

  const noUnits = completeArgs().filter((arg, index, all) => (
    arg !== '--unit-id' && all[index - 1] !== '--unit-id'
  ));
  const missingUnit = runScript(noUnits, 'postgresql://fixture.invalid/postgres');
  assert.equal(missingUnit.status, 1);
  assert.match(missingUnit.stderr, /ao menos um --unit-id/iu);

  const oneUnit = completeArgs();
  for (const id of unitIds.slice(1)) oneUnit.splice(oneUnit.indexOf(id) - 1, 2);
  const dynamicList = runScript(oneUnit, 'postgresql://fixture.invalid/postgres');
  assert.notEqual(
    dynamicList.stderr.match(/exatamente tres --unit-id/iu)?.[0],
    'exatamente tres --unit-id',
    'lista com uma unidade deve passar pela validacao de quantidade e chegar ao alvo fixture',
  );

  const missingOutput = completeArgs();
  missingOutput.splice(missingOutput.indexOf('--output'), 2);
  const noOutput = runScript(missingOutput, 'postgresql://fixture.invalid/postgres');
  assert.equal(noOutput.status, 1);
  assert.match(noOutput.stderr, /--output explicito e obrigatorio/iu);

  const missingRestart = completeArgs();
  missingRestart.splice(missingRestart.indexOf('--postgres-restarted-after'), 2);
  const noRestart = runScript(missingRestart, 'postgresql://fixture.invalid/postgres');
  assert.equal(noRestart.status, 1);
  assert.match(noRestart.stderr, /--postgres-restarted-after.*ISO-8601/iu);

  const invalidRestart = completeArgs();
  invalidRestart[invalidRestart.indexOf('2026-08-13T12:00:00Z')] = 'ontem';
  const badRestart = runScript(invalidRestart, 'postgresql://fixture.invalid/postgres');
  assert.equal(badRestart.status, 1);
  assert.match(badRestart.stderr, /--postgres-restarted-after.*ISO-8601/iu);
});

test('benchmark recusa reinicio sem prova recente e anterior a primeira rodada', () => {
  const valid = validateRestartEvidence({
    evidenceIso: '2026-08-13T11:59:00Z',
    postmasterStartIso: '2026-08-13T12:00:00Z',
    verifiedAtIso: '2026-08-13T12:10:00Z',
    firstRoundStartedAtIso: '2026-08-13T12:10:01Z',
  });
  assert.equal(valid.restart_window_minutes, restartWindowMinutes);
  assert.equal(valid.postmaster_age_seconds_at_verification, 600);
  assert.equal(valid.postmaster_start_time, '2026-08-13T12:00:00.000Z');
  assert.equal(valid.first_round_started_at, '2026-08-13T12:10:01.000Z');

  assert.throws(() => validateRestartEvidence({
    evidenceIso: '2026-08-13T12:01:00Z',
    postmasterStartIso: '2026-08-13T12:00:00Z',
    verifiedAtIso: '2026-08-13T12:10:00Z',
  }), /anterior a evidencia/iu);
  assert.throws(() => validateRestartEvidence({
    evidenceIso: '2026-08-13T11:00:00Z',
    postmasterStartIso: '2026-08-13T11:30:00Z',
    verifiedAtIso: '2026-08-13T12:00:01Z',
  }), /janela de 15 minutos/iu);
  assert.throws(() => validateRestartEvidence({
    evidenceIso: '2026-08-13T11:59:00Z',
    postmasterStartIso: '2026-08-13T12:10:01Z',
    verifiedAtIso: '2026-08-13T12:10:02Z',
    firstRoundStartedAtIso: '2026-08-13T12:10:01Z',
  }), /antes da primeira rodada/iu);
  assert.throws(() => validateRestartEvidence({
    evidenceIso: '2026-02-31T11:59:00Z',
    postmasterStartIso: '2026-03-01T12:00:00Z',
    verifiedAtIso: '2026-03-01T12:01:00Z',
  }), /ISO-8601 valido/iu);
});

test('benchmark exige igualdade exata entre a lista dinamica e todas as unidades ativas', () => {
  const rows = unitIds.map((id, index) => ({ id, nome: `Unidade ${index + 1}`, ativo: true }));
  assert.deepEqual(validateActiveUnits(unitIds, rows).map((row) => row.id), [...unitIds].sort());

  const single = [rows[0]];
  assert.deepEqual(validateActiveUnits([unitIds[0]], single), single);
  assert.throws(
    () => validateActiveUnits(unitIds, rows.map((row, index) => (
      index === 1 ? { ...row, ativo: false } : row
    ))),
    /todas as unidades ativas/iu,
  );
  assert.throws(
    () => validateActiveUnits(unitIds, rows.slice(0, 2)),
    /todas as unidades ativas/iu,
  );
  assert.throws(
    () => validateActiveUnits(unitIds, [
      rows[0], rows[1], { ...rows[2], id: '20000000-0000-4000-8000-000000000003' },
    ]),
    /todas as unidades ativas/iu,
  );
  assert.throws(
    () => validateActiveUnits(unitIds.slice(0, 2), rows),
    /todas as unidades ativas/iu,
    'unidade ativa extra no banco deve invalidar o benchmark',
  );
  assert.throws(() => validateActiveUnits([], []), /ao menos uma unidade ativa/iu);
});

test('funcao dominante usa delta por OID e exige chamada positiva', () => {
  const before = [
    { oid: '10', schema: 'public', function: 'a', calls: 5, total_time_ms: 20, self_time_ms: 10 },
    { oid: '11', schema: 'public', function: 'b', calls: 1, total_time_ms: 2, self_time_ms: 1 },
  ];
  const after = [
    { oid: '10', schema: 'public', function: 'a', calls: 6, total_time_ms: 25, self_time_ms: 12 },
    { oid: '11', schema: 'public', function: 'b', calls: 3, total_time_ms: 14, self_time_ms: 8 },
  ];
  assert.deepEqual(dominantFunctionDelta(before, after), {
    oid: '11', schema: 'public', function: 'b', calls_delta: 2,
    total_time_delta_ms: 12, self_time_delta_ms: 7,
  });
  assert.equal(dominantFunctionDelta(before, before), null);
});

test('orquestrador prova baseline antes do BEGIN e stats somente apos ROLLBACK', async () => {
  const order = [];
  const executions = Array.from({ length: 12 }, (_, index) => async () => {
    order.push(`execution:${index + 1}`);
  });
  const result = await executeObservableSequence({
    captureBaseline: async () => { order.push('baseline'); return [{ oid: '10' }]; },
    beginTransaction: async () => { order.push('begin'); },
    executions,
    rollbackTransaction: async () => { order.push('rollback'); },
    capturePostRollback: async (baseline) => {
      assert.deepEqual(baseline, [{ oid: '10' }]);
      order.push('stats');
      return { available: true, oid: '10', calls_delta: 12 };
    },
  });
  assert.deepEqual(order, [
    'baseline', 'begin',
    ...Array.from({ length: 12 }, (_, index) => `execution:${index + 1}`),
    'rollback', 'stats',
  ]);
  assert.deepEqual(result.events, [
    'baseline', 'begin',
    ...Array.from({ length: 12 }, (_, index) => `execution:${index + 1}`),
    'rollback', 'stats',
  ]);
});

test('falha preserva erro original depois de rollback e tentativa de stats', async () => {
  const order = [];
  const original = new Error('falha-original-executor');
  const executions = Array.from({ length: 12 }, (_, index) => async () => {
    order.push(`execution:${index + 1}`);
    if (index === 2) throw original;
  });
  await assert.rejects(
    executeObservableSequence({
      captureBaseline: async () => { order.push('baseline'); return []; },
      beginTransaction: async () => { order.push('begin'); },
      executions,
      rollbackTransaction: async () => { order.push('rollback'); },
      capturePostRollback: async () => {
        order.push('stats');
        throw new Error('falha-secundaria-stats');
      },
    }),
    (error) => {
      assert.equal(error, original);
      assert.equal(error.benchmarkCleanup.rollback_error, null);
      assert.equal(error.benchmarkCleanup.stats_error, 'falha-secundaria-stats');
      return true;
    },
  );
  assert.deepEqual(order, [
    'baseline', 'begin', 'execution:1', 'execution:2', 'execution:3',
    'rollback', 'stats',
  ]);
});

test('benchmark recusa track_functions diferente de all', () => {
  assert.equal(assertTrackFunctions('all\n'), 'all');
  assert.throws(() => assertTrackFunctions('none'), /track_functions deve ser all/iu);
  assert.throws(() => assertTrackFunctions('pl'), /track_functions deve ser all/iu);
  assert.throws(() => assertTrackFunctions(''), /valor atual: vazio/iu);
});

test('benchmark exige estado inicial materializado e reruns sem alteracao', () => {
  for (const status of ['materializado', 'parcial']) {
    assert.equal(assertStatusContract(1, status), status);
  }
  assert.throws(
    () => assertStatusContract(1, 'baseline_adotado'),
    /baseline_adotado.*fixture nao limpa/iu,
  );
  assert.equal(assertStatusContract(2, 'sem_alteracao'), 'sem_alteracao');
  assert.equal(assertStatusContract(3, 'sem_alteracao'), 'sem_alteracao');
  assert.throws(() => assertStatusContract(1, 'sem_alteracao'), /rodada 1.*inesperado/iu);
  assert.throws(() => assertStatusContract(2, 'materializado'), /deve exercitar sem_alteracao/iu);
  assert.throws(() => assertStatusContract(3, 'parcial'), /deve exercitar sem_alteracao/iu);
});

test('resumo decide pelo total dinamico de N mais um escopos sem apagar decisao historica', () => {
  const scopes = [
    ...unitIds.map((id) => ({ escopo: 'unidade', unidade_id: id })),
    { escopo: 'consolidado', unidade_id: null },
  ];
  const measurements = [1, 2, 3].flatMap((round) => scopes.map((scope, index) => ({
    round,
    scope,
    status: round === 1 ? 'materializado' : 'sem_alteracao',
    summary: { execution_time_ms: (index + 1) * 1_000 },
  })));
  const eligible = summarizeRounds(measurements, { 1: 11_000, 2: 10_500, 3: 10_250 });
  assert.deepEqual(
    eligible.rounds.map((round) => round.execution_time_total_ms),
    [10_000, 10_000, 10_000],
  );
  assert.deepEqual(
    eligible.rounds.map((round) => round.classification),
    ['abaixo_75s', 'abaixo_75s', 'abaixo_75s'],
  );
  assert.equal(eligible.rounds[0].wall_clock_ms, 11_000);
  assert.equal(eligible.rounds[0].max_scope.execution_time_ms, 4_000);
  assert.equal(Object.keys(eligible.rounds[0].states_by_scope).length, 4);
  assert.equal(eligible.decision.decisao_global, 'sequencial_elegivel');
  assert.equal(eligible.decision.decisao_historica, 'isolamento_obrigatorio');
  assert.equal(eligible.decision.decisao_operacional, 'isolamento_obrigatorio');

  const reducedScopes = [scopes[0], scopes.at(-1)];
  const dynamicMeasurements = [1, 2, 3].flatMap((round) => reducedScopes.map((scope) => ({
    round,
    scope,
    status: round === 1 ? 'parcial' : 'sem_alteracao',
    summary: { execution_time_ms: 500 },
  })));
  const dynamic = summarizeRounds(dynamicMeasurements, { 1: 1_100, 2: 1_050, 3: 1_025 });
  assert.deepEqual(dynamic.rounds.map((round) => round.execution_time_total_ms), [1_000, 1_000, 1_000]);
  assert.ok(dynamic.rounds.every((round) => Object.keys(round.states_by_scope).length === 2));

  const slow = structuredClone(measurements);
  slow.find((entry) => entry.round === 2).summary.execution_time_ms = cronBudgetMs - 9_000;
  const isolated = summarizeRounds(slow, { 1: 11_000, 2: 80_000, 3: 10_250 });
  assert.equal(isolated.rounds[1].classification, 'atingiu_ou_superou_75s');
  assert.equal(isolated.rounds[1].execution_time_total_ms, cronBudgetMs);
  assert.equal(isolated.decision.decisao_global, 'isolamento_obrigatorio');
  assert.equal(isolated.decision.decisao_historica, 'isolamento_obrigatorio');
});

test('benchmark mede tres rodadas de N mais um escopos e observa funcoes somente depois do rollback', () => {
  assert.equal((script.match(/session\.query\('begin;'\)/gu) || []).length, 1);
  assert.equal((script.match(/session\.query\('rollback;'\)/gu) || []).length, 1);
  assert.match(script, /try\s*\{[\s\S]*baseline = await captureBaseline\(\)[\s\S]*await beginTransaction\(\)[\s\S]*finally\s*\{[\s\S]*await rollbackTransaction\(\)[\s\S]*await capturePostRollback\(baseline\)/u);
  assert.match(script, /process\.once\('SIGINT',\s*signalHandler\)/u);
  assert.match(script, /process\.once\('SIGTERM',\s*signalHandler\)/u);
  assert.match(script, /create temporary table health_score_v3_benchmark_resultados/iu);
  assert.match(script, /explain\s*\(analyze,\s*buffers,\s*format json\)[\s\S]*insert into health_score_v3_benchmark_resultados[\s\S]*executar_health_score_professor_v3_escopo_diario/iu);
  assert.doesNotMatch(script, /function executionSql[\s\S]{0,900}\bbegin;|function executionSql[\s\S]{0,900}\brollback;/iu);
  assert.doesNotMatch(script, /get_health_score_professor_v3_performance\s*\(/iu);
  assert.match(script, /for\s*\(let round = 1; round <= 3; round \+= 1\)/u);
  assert.match(script, /assertStatusContract\(round,\s*result\.status\)/u);
  assert.match(script, /captureBaseline:[\s\S]*statsSql\(\)[\s\S]*beginTransaction:[\s\S]*session\.query\('begin;'\)/u);
  assert.match(script, /rollbackTransaction:\s*rollbackOnce[\s\S]*capturePostRollback:/u);
  const executionCallbacks = /executions:\s*executions\.map[\s\S]*?\}\),\s*rollbackTransaction:/u.exec(script)?.[0];
  assert.ok(executionCallbacks, 'callbacks das 12 execucoes devem estar declarados');
  assert.doesNotMatch(executionCallbacks, /statsSql\(\)|pg_stat_user_functions|pg_stat_clear_snapshot/iu);
  assert.match(script, /writes_preserved_between_rounds:\s*true/u);
  assert.match(script, /transaction_policy:\s*`uma_transacao_\$\{executionsPerBenchmark\}_execucoes_rollback_unico_finally`/u);
  assert.match(script, /executions:\s*executionsPerBenchmark/u);
  assert.match(script, /scopes_per_round:\s*scopesPerRound/u);
  assert.match(script, /raw_explain:\s*rawExplain/u);
  assert.match(script, /requiredNumber\(root,\s*'Temp Read Blocks'/u);
  assert.match(script, /requiredNumber\(root,\s*'Temp Written Blocks'/u);
  assert.match(script, /pg_stat_user_functions/iu);
  assert.match(script, /show track_functions/iu);
  assert.match(script, /normalized !== 'all'/u);
  assert.match(script, /pg_stat_clear_snapshot\s*\(\)/u);
  assert.doesNotMatch(script, /pg_stat_reset\s*\(/u);
  assert.match(script, /function_observability:\s*'nao_atribuivel_sem_instrumentacao_intrusiva'/u);
  assert.match(script, /aggregate_dominant_function:\s*benchmark\.aggregate_dominant_function/u);
  assert.match(script, /pg_stat_user_functions sem delta positivo/iu);
  assert.doesNotMatch(script, /available:\s*false/u);
  assert.match(script, /funcid::text/iu);
  assert.doesNotMatch(script, /dominant_node|Function Name/iu);
  assert.match(script, /pg_postmaster_start_time\s*\(\)/u);
  assert.match(script, /shared_buffers_reiniciado_observavel/u);
  assert.match(script, /:\s*'aquecida'/u);
  assert.match(script, /cache\s+do sistema operacional nao e controlado nem garantido/iu);
  assert.match(script, /postgres_restarted_after_evidence/iu);
  assert.match(script, /first_round_started_at/iu);
  assert.match(script, /reiniciou entre a verificacao e a primeira rodada/iu);
  assert.match(script, /from public\.unidades[\s\S]*where ativo = true/iu);
  assert.match(script, /alert_wrapper:\s*'validado_separadamente_nao_disparado_no_benchmark'/u);
  assert.match(script, /execution_time_total_ms/iu);
  assert.match(script, /wall_clock_ms/iu);
  assert.match(script, /max_scope/iu);
  assert.match(script, /states_by_scope/iu);
  assert.match(script, /abaixo_75s/iu);
  assert.match(script, /atingiu_ou_superou_75s/iu);
  assert.match(script, /sequencial_elegivel/iu);
  assert.match(script, /decisao_historica:\s*'isolamento_obrigatorio'/u);
  assert.match(script, /PowerShell \(uma linha\)/u);
  assert.doesNotMatch(script, /node scripts\/benchmark[^\n]*\\\s*$/mu);
});
