import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260727126000_health_score_v3_snapshot_revisao_encadeada.sql';

function migration() {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  return readFileSync(migrationPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '');
}

test('materializador encadeia a nova revisao ao snapshot imediatamente anterior', () => {
  const sql = migration();

  assert.match(
    sql,
    /create\s+or\s+replace\s+function\s+public\.materializar_health_score_professor_v3_periodo_impl/i,
  );
  assert.match(sql, /\bv_snapshot_anterior_id\s+uuid\b/i);
  assert.match(
    sql,
    /select\s+s\.id[\s\S]*into\s+v_snapshot_anterior_id[\s\S]*order\s+by\s+s\.revisao\s+desc/i,
  );
  assert.match(
    sql,
    /insert\s+into\s+public\.health_score_professor_v3_snapshots\s*\([\s\S]*snapshot_anterior_id[\s\S]*\)\s*values\s*\([\s\S]*v_snapshot_anterior_id/i,
  );
});

test('revisao encadeada e append-only e nao altera snapshot anterior', () => {
  const sql = migration();
  const snapshotUpdates = [
    ...sql.matchAll(
      /update\s+(?:public\.)?health_score_professor_v3_snapshots[\s\S]*?where\s+id\s*=\s*([a-z_][a-z0-9_]*)\s*;/gi,
    ),
  ];

  assert.equal(
    snapshotUpdates.length,
    1,
    'materializador deve atualizar somente o snapshot que acabou de inserir',
  );
  assert.equal(
    snapshotUpdates[0][1].toLowerCase(),
    'v_snapshot_id',
    'UPDATE nao pode atingir a revisao anterior',
  );
  assert.doesNotMatch(
    sql,
    /delete\s+from\s+(?:public\.)?health_score_professor_v3_snapshots/i,
  );
  assert.match(sql, /set\s+search_path\s*=\s*public/i);
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.materializar_health_score_professor_v3_periodo_impl\s*\(\s*date\s*,\s*text\s*,\s*uuid\s*,\s*integer\s*\)\s+from\s+public,\s*anon,\s*authenticated/i,
  );
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.materializar_health_score_professor_v3_periodo_impl\s*\(\s*date\s*,\s*text\s*,\s*uuid\s*,\s*integer\s*\)\s+to\s+service_role/i,
  );
});
