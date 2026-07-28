import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260728125000_health_score_v3_segmento_diagnostico_nao_pontuavel.sql';

test('segmento nao pontuavel possui estado diagnostico explicito', () => {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  const sql = readFileSync(migrationPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '');

  assert.match(
    sql,
    /drop\s+constraint\s+health_score_professor_v3_snapshot_metrica_se_estado_base_check/i,
  );
  assert.match(
    sql,
    /add\s+constraint\s+health_score_professor_v3_snapshot_metrica_se_estado_base_check[\s\S]*diagnostico_nao_pontuavel/i,
  );
  assert.match(sql, /validate\s+constraint/i);
});
