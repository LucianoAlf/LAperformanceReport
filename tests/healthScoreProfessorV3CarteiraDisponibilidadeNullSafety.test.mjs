import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260728124000_health_score_v3_carteira_disponibilidade_null_safety.sql';

function migration() {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  return readFileSync(migrationPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '');
}

test('ausencia de disponibilidade produz peso indisponivel false, nunca null', () => {
  const sql = migration();

  assert.match(
    sql,
    /coalesce\s*\(\s*v_numero\.publicavel\s*,\s*false\s*\)/i,
  );
  assert.match(
    sql,
    /coalesce\s*\(\s*v_numero\.denominador\s*,\s*0\s*\)\s*>\s*0/i,
  );
  assert.match(
    sql,
    /coalesce\s*\(\s*v_numero\.estado_base\s*,\s*''''\s*\)\s*=\s*''ok''/i,
  );
});

test('patch falha fechado se o corpo esperado nao estiver presente', () => {
  const sql = migration();

  assert.match(sql, /if\s+position\s*\(\s*v_antigo\s+in\s+v_definicao\s*\)\s*=\s*0/i);
  assert.match(sql, /raise\s+exception\s+'HEALTH_SCORE_V3_PATCH_INCOMPATIVEL/i);
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function[\s\S]*from\s+public,\s*anon,\s*authenticated/i,
  );
});
