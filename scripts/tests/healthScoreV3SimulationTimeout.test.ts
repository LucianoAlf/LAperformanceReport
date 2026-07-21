import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const migrationPath =
  'supabase/migrations/20260721153000_health_score_v3_simulacao_timeout.sql';

test('simulacao administrativa possui timeout proprio sem alterar o motor', () => {
  assert.equal(existsSync(migrationPath), true, 'migration de timeout deve existir');
  const migration = readFileSync(migrationPath, 'utf8');

  assert.match(
    migration,
    /alter function public\.simular_health_score_professor_v3_config\(uuid, date\)\s+set statement_timeout = '60s'/i,
  );
  assert.match(
    migration,
    /alter function public\.simular_health_score_professor_v3_config_pre_catalogo_v1\(uuid, date\)\s+set statement_timeout = '60s'/i,
  );
  assert.doesNotMatch(migration, /create\s+or\s+replace\s+function/i);
});
