import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260731161000_snapshot_experimentais_minimiza_payload.sql';

function migration() {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  return readFileSync(migrationPath, 'utf8');
}

test('snapshot remove leitura autenticada ampla e concede apenas colunas operacionais', () => {
  const sql = migration();

  assert.match(
    sql,
    /revoke\s+select\s+on\s+table\s+public\.emusys_experimentais_raw\s+from\s+authenticated/i,
  );
  assert.doesNotMatch(
    sql,
    /grant\s+select\s+on\s+(?:table\s+)?public\.emusys_experimentais_raw\s+to\s+authenticated/i,
  );
  assert.match(
    sql,
    /grant\s+select\s*\(\s*id\s*,\s*aluno_nome\s*,\s*data_aula\s*,\s*horario_aula\s*,\s*situacao_operacional\s*\)\s+on\s+table\s+public\.emusys_experimentais_raw\s+to\s+authenticated/i,
  );
  assert.match(
    sql,
    /grant\s+select\s+on\s+table\s+public\.emusys_experimentais_raw\s+to\s+service_role/i,
  );
  assert.doesNotMatch(
    sql,
    /grant\s+select\s*\([^)]*\b(?:payload|aluno_telefone|responsavel_nome|responsavel_telefone|professor_nome)\b[^)]*\)\s+on\s+table\s+public\.emusys_experimentais_raw\s+to\s+authenticated/i,
  );
});

test('snapshot saneia o historico para o schema minimo versionado', () => {
  const sql = migration();

  assert.match(
    sql,
    /update\s+public\.emusys_experimentais_raw[\s\S]*set\s+payload\s*=\s*jsonb_build_object/i,
  );
  for (const key of [
    'schema_version',
    'data_aula',
    'horario_aula',
    'cancelada',
    'aula',
    'participante',
    'id_lead',
    'id_aluno',
  ]) {
    assert.match(sql, new RegExp(`'${key}'`, 'i'));
  }
  assert.doesNotMatch(
    sql,
    /\|\||jsonb_strip_nulls|payload\s*-\s*'|jsonb_set\s*\(\s*payload/i,
  );
});
