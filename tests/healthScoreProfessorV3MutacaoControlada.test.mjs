import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260802192500_health_score_v3_materializacao_controlada.sql';

test('materializador abre e restaura explicitamente a mutacao controlada', () => {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  const sql = readFileSync(migrationPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '');

  assert.match(
    sql,
    /alter\s+function\s+public\.materializar_health_score_professor_v3_periodo_impl[\s\S]*rename\s+to\s+materializar_hs_v3_periodo_impl_pre_guard_20260802/i,
  );
  assert.match(
    sql,
    /set_config\s*\(\s*'app\.health_score_v3_mutacao_controlada'\s*,\s*'on'\s*,\s*true\s*\)/i,
  );
  assert.match(sql, /exception\s+when\s+others[\s\S]*set_config[\s\S]*raise/i);
  assert.match(
    sql,
    /set_config\s*\(\s*'app\.health_score_v3_mutacao_controlada'\s*,\s*v_mutacao_anterior\s*,\s*true\s*\)/i,
  );
  assert.doesNotMatch(sql, /update\s+public\.health_score_professor_v3_snapshots/i);
});
