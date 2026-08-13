import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertTrackFunctions,
  dominantFunctionDelta,
  restartWindowMinutes,
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

test('benchmark exige alvo, competencia, tres unidades, output e confirmacao nao produtiva', () => {
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

  const onlyTwoUnits = completeArgs();
  onlyTwoUnits.splice(onlyTwoUnits.indexOf(unitIds[2]) - 1, 2);
  const missingUnit = runScript(onlyTwoUnits, 'postgresql://fixture.invalid/postgres');
  assert.equal(missingUnit.status, 1);
  assert.match(missingUnit.stderr, /exatamente tres --unit-id/iu);

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

test('benchmark exige correspondencia exata das tres unidades ativas', () => {
  const rows = unitIds.map((id, index) => ({ id, nome: `Unidade ${index + 1}`, ativo: true }));
  assert.deepEqual(validateActiveUnits(unitIds, rows).map((row) => row.id), [...unitIds].sort());
  assert.throws(
    () => validateActiveUnits(unitIds, rows.map((row, index) => (
      index === 1 ? { ...row, ativo: false } : row
    ))),
    /unidades ativas existentes/iu,
  );
  assert.throws(
    () => validateActiveUnits(unitIds, rows.slice(0, 2)),
    /unidades ativas existentes/iu,
  );
  assert.throws(
    () => validateActiveUnits(unitIds, [
      rows[0], rows[1], { ...rows[2], id: '20000000-0000-4000-8000-000000000003' },
    ]),
    /unidades ativas existentes/iu,
  );
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

test('benchmark recusa track_functions diferente de all', () => {
  assert.equal(assertTrackFunctions('all\n'), 'all');
  assert.throws(() => assertTrackFunctions('none'), /track_functions deve ser all/iu);
  assert.throws(() => assertTrackFunctions('pl'), /track_functions deve ser all/iu);
  assert.throws(() => assertTrackFunctions(''), /valor atual: vazio/iu);
});

test('benchmark mede quatro executores completos em rollback e preserva EXPLAIN bruto', () => {
  assert.match(script, /begin;[\s\S]*explain\s*\(analyze,\s*buffers,\s*format json\)[\s\S]*executar_health_score_professor_v3_escopo_diario[\s\S]*rollback;/iu);
  assert.doesNotMatch(script, /get_health_score_professor_v3_performance\s*\(/iu);
  assert.match(script, /for\s*\(let round = 1; round <= 3; round \+= 1\)/u);
  assert.match(script, /raw_explain:\s*rawExplain/u);
  assert.match(script, /requiredNumber\(root,\s*'Temp Read Blocks'/u);
  assert.match(script, /requiredNumber\(root,\s*'Temp Written Blocks'/u);
  assert.match(script, /pg_stat_user_functions/iu);
  assert.match(script, /show track_functions/iu);
  assert.match(script, /normalized !== 'all'/u);
  assert.match(script, /pg_stat_clear_snapshot\s*\(\)/u);
  assert.doesNotMatch(script, /pg_stat_reset\s*\(/u);
  assert.match(script, /dominant_function_pg_stat:\s*dominantFunction/u);
  assert.match(script, /pg_stat_user_functions sem delta positivo/iu);
  assert.doesNotMatch(script, /available:\s*false/u);
  assert.match(script, /benchmark incompleto: funcao dominante indisponivel/iu);
  assert.match(script, /funcid::text/iu);
  assert.doesNotMatch(script, /dominant_node|Function Name/iu);
  assert.match(script, /pg_postmaster_start_time\s*\(\)/u);
  assert.match(script, /shared_buffers_reiniciado_observavel/u);
  assert.match(script, /:\s*'aquecida'/u);
  assert.match(script, /cache do sistema operacional nao e controlado nem garantido/iu);
  assert.match(script, /postgres_restarted_after_evidence/iu);
  assert.match(script, /first_round_started_at/iu);
  assert.match(script, /reiniciou entre a verificacao e a primeira rodada/iu);
  assert.match(script, /from public\.unidades[\s\S]*where ativo = true/iu);
  assert.match(script, /alert_wrapper:\s*'validado_separadamente_nao_disparado_no_benchmark'/u);
  assert.match(script, /PowerShell \(uma linha\)/u);
  assert.doesNotMatch(script, /node scripts\/benchmark[^\n]*\\\s*$/mu);
});
