import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath =
  'supabase/migrations/20260911120000_agenda_experimental_respeita_professor.sql';

test('a agenda vincula experimental ao professor e evita fallback ambiguo', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(
    sql,
    /le\.professor_experimental_id\s*=\s*b\.professor_id/iu,
  );
  assert.match(
    sql,
    /le\.professor_experimental_id\s+is\s+null/iu,
  );
  assert.match(sql, /select\s+count\s*\(\s*distinct\s+b_outra\.chave\s*\)/iu);
  assert.match(sql, /from\s+base\s+b_outra/iu);
  assert.match(sql, /\)\s*=\s*1/iu);
  assert.match(sql, /get_agenda_dia/iu);
  assert.match(sql, /get_agenda_semana/iu);
});
