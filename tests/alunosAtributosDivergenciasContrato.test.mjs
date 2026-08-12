import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
const migrationName = readdirSync(migrationsDir)
  .find((name) => /_alunos_atributos_data_nascimento_divergente\.sql$/u.test(name));

test('o CHECK aceita a divergencia de data de nascimento emitida pelo sincronizador', () => {
  assert.ok(
    migrationName,
    'falta migration alunos_atributos_data_nascimento_divergente',
  );

  const sql = readFileSync(join(migrationsDir, migrationName), 'utf8');
  assert.match(sql, /drop\s+constraint\s+if\s+exists\s+alunos_emusys_atributos_divergencias_tipo_divergencia_check/iu);
  assert.match(sql, /data_nascimento_divergente/iu);
  assert.match(sql, /not\s+valid/iu);
  assert.match(sql, /validate\s+constraint\s+alunos_emusys_atributos_divergencias_tipo_divergencia_check/iu);
});
