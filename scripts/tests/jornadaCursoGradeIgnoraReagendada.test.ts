import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL(
  '../../supabase/migrations/20260722100000_jornada_curso_grade_ignora_reagendada.sql',
  import.meta.url,
);
const originMigrationUrl = new URL(
  '../../supabase/migrations/20260722101000_jornada_curso_origem_depara.sql',
  import.meta.url,
);

test('aula reagendada nao redefine o curso atual da jornada', () => {
  assert.equal(existsSync(migrationUrl), true, 'migration de protecao ainda nao existe');
  const migration = readFileSync(migrationUrl, 'utf8');

  assert.match(
    migration,
    /and\s+not\s+coalesce\(a\.reagendada,\s*false\)/i,
  );
  assert.match(
    migration,
    /having\s+count\(\*\)\s*>=\s*2/i,
  );
  assert.doesNotMatch(
    migration,
    /or\s+count\(\*\)\s+filter\s*\(where\s+a\.data_aula\s*>=\s*current_date\)\s*>=\s*2/i,
  );
});

test('curso de origem acompanha o de-para da disciplina recebida pela API', () => {
  assert.equal(
    existsSync(originMigrationUrl),
    true,
    'migration de consistencia da origem ainda nao existe',
  );
  const migration = readFileSync(originMigrationUrl, 'utf8');

  assert.match(
    migration,
    /d\.emusys_disciplina_id\s*=\s*v_disciplina_api/i,
  );
  assert.match(
    migration,
    /j\.curso_id_origem\s+is\s+distinct\s+from\s+d\.curso_id/i,
  );
});
