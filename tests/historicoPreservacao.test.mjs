import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('sync corrente nao possui caminho destrutivo para aulas, roster ou presenca', () => {
  const fontes = [
    read('supabase/functions/sync-presenca-emusys/index.ts'),
    read('supabase/functions/_shared/emusys-aulas.ts'),
  ].join('\n');
  assert.match(fontes, /aulas_emusys/);
  assert.match(fontes, /aula_alunos_emusys/);
  assert.doesNotMatch(fontes, /\.delete\s*\(/i);
  assert.doesNotMatch(fontes, /DELETE\s+FROM\s+(aulas_emusys|aula_alunos_emusys|aluno_presenca)/i);
});
