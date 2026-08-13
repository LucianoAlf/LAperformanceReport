import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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
});

test('benchmark mede quatro executores completos em rollback e preserva EXPLAIN bruto', () => {
  assert.match(script, /begin;[\s\S]*explain\s*\(analyze,\s*buffers,\s*format json\)[\s\S]*executar_health_score_professor_v3_escopo_diario[\s\S]*rollback;/iu);
  assert.doesNotMatch(script, /get_health_score_professor_v3_performance\s*\(/iu);
  assert.match(script, /for\s*\(let round = 1; round <= 3; round \+= 1\)/u);
  assert.match(script, /raw_explain:\s*rawExplain/u);
  assert.match(script, /requiredNumber\(root,\s*'Temp Read Blocks'/u);
  assert.match(script, /requiredNumber\(root,\s*'Temp Written Blocks'/u);
  assert.match(script, /pg_stat_user_functions/iu);
  assert.match(script, /track_functions=none/iu);
  assert.match(script, /dominant_function_pg_stat:\s*dominantFunctionDelta/u);
  assert.doesNotMatch(script, /dominant_node|Function Name/iu);
  assert.match(script, /primeira_observacao_nao_controlada/u);
  assert.match(script, /:\s*'aquecida'/u);
  assert.match(script, /nao e cache frio/iu);
  assert.doesNotMatch(script, /cache_observation:[\s\S]{0,80}['"](?:fria|cache_fria|cold)['"]/iu);
  assert.match(script, /alert_wrapper:\s*'validado_separadamente_nao_disparado_no_benchmark'/u);
});
