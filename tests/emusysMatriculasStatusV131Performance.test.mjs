import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260730131000_otimiza_estado_operacional_v131.sql',
  'utf8',
);

test('estado operacional resolve matricula exata sem converter a coluna indexada', () => {
  assert.match(
    migration,
    /exato\.emusys_matricula_id\s*=\s*a\.emusys_matricula_id_numero/i,
  );
  assert.doesNotMatch(
    migration,
    /estado\.emusys_matricula_id::text\s*=/i,
  );
});

test('fallback por aluno possui indice coerente com a ordenacao do lateral', () => {
  assert.match(
    migration,
    /on public\.emusys_matriculas_estado_atual\s*\(aluno_id,\s*sincronizado_em desc\)/i,
  );
  assert.match(migration, /where exato\.unidade_id is null/i);
  assert.match(migration, /estado\.aluno_id\s*=\s*a\.aluno_id/i);
});
