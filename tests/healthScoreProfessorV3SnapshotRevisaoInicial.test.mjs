import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260728126000_health_score_v3_snapshot_revisao_inicial.sql';

test('primeiro snapshot inicia na revisao um sem pai', () => {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  const sql = readFileSync(migrationPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '');

  assert.match(sql, /if\s+not\s+found\s+then/i);
  assert.match(sql, /v_snapshot_anterior_id\s*:=\s*null/i);
  assert.match(sql, /v_revisao\s*:=\s*1/i);
  assert.match(sql, /HEALTH_SCORE_V3_PATCH_INCOMPATIVEL/i);
});
