import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrationPath = 'supabase/migrations/20260715140000_presenca_semantica_canonica_sombra.sql';
const readOptional = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('presenca semantica preserva evidencia bruta e versiona a regra', () => {
  const migration = readOptional(migrationPath);

  assert.match(migration, /vw_aluno_presenca_semantica_v1/i);
  assert.match(migration, /estado_origem/i);
  assert.match(migration, /situacao_chamada/i);
  assert.match(migration, /resultado_pedagogico/i);
  assert.match(migration, /presenca-semantica-v1/i);
  assert.doesNotMatch(migration, /\b(update|delete|truncate)\s+(from\s+)?public\.aluno_presenca/i);
});

test('ausencia Emusys isolada nunca vira falta confirmada', () => {
  const migration = readOptional(migrationPath);

  assert.match(migration, /respondido_por\s*=\s*'emusys'/i);
  assert.match(migration, /'indeterminado'/i);
  assert.match(migration, /'falta_provavel'/i);
  assert.doesNotMatch(migration, /respondido_por\s*=\s*'emusys'[\s\S]{0,180}'falta_confirmada'/i);
});

test('LA Teacher confirma falta e aula justificada nao pune aluno', () => {
  const migration = readOptional(migrationPath);

  assert.match(migration, /professor_la_teacher[\s\S]*falta_confirmada/i);
  assert.match(migration, /justificada[\s\S]*aula_justificada/i);
  assert.match(migration, /considera_falta/i);
  assert.match(migration, /resultado_pedagogico\s*=\s*'falta_confirmada'/i);
});

test('view sombra e security invoker e nao e exposta ao navegador', () => {
  const migration = readOptional(migrationPath);

  assert.match(migration, /security_invoker\s*=\s*true/i);
  assert.match(migration, /revoke\s+all[\s\S]*vw_aluno_presenca_semantica_v1[\s\S]*public[\s\S]*anon[\s\S]*authenticated/i);
  assert.match(migration, /grant\s+select[\s\S]*vw_aluno_presenca_semantica_v1[\s\S]*service_role/i);
});
