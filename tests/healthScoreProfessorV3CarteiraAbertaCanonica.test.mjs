import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationsDir = 'supabase/migrations';
const migrationSuffix = '_health_score_v3_carteira_aberta_jornada_canonica.sql';

function readMigration() {
  const migration = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(migrationSuffix))
    .sort()
    .at(-1);

  assert.ok(migration, `migration ${migrationSuffix} deve existir`);
  return readFileSync(join(migrationsDir, migration), 'utf8');
}

test('periodo aberto do Health Score usa a mesma carteira canonica da Carteira', () => {
  const sql = readMigration();

  assert.match(
    sql,
    /create\s+or\s+replace\s+function\s+public\.get_hs_prof_v3_segmentadas_agregadas_before_snapshot_20260804/i,
  );
  assert.match(sql, /get_carteira_professor_periodo_canonica\s*\(/i);
  assert.doesNotMatch(
    sql,
    /get_carteira_professores\s*\(/i,
    'o retrato aberto nao pode voltar para a carteira legada',
  );
});

test('carteira canonica preserva escopo por unidade e consolidado', () => {
  const sql = readMigration();

  assert.match(sql, /p_unidade_id\s+is\s+null/i);
  assert.match(sql, /sum\s*\(\s*c\.carteira_alunos\s*\)/i);
  assert.match(sql, /date_trunc\('month',\s*p_competencia\)/i);
  assert.match(sql, /least\([\s\S]*v_data_atual/i);
});

test('a migration deixa o helper interno somente para service_role', () => {
  const migration = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(migrationSuffix))
    .sort()
    .at(-1);

  assert.ok(migration && existsSync(join(migrationsDir, migration)));
  const sql = readFileSync(join(migrationsDir, migration), 'utf8');

  assert.match(
    sql,
    /revoke\s+all\s+on\s+function[\s\S]*get_hs_prof_v3_segmentadas_agregadas_before_snapshot_20260804[\s\S]*from\s+public,\s*anon,\s*authenticated/i,
  );
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function[\s\S]*get_hs_prof_v3_segmentadas_agregadas_before_snapshot_20260804[\s\S]*to\s+service_role/i,
  );
});
