import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('sync de matriculas captura Lead ID com escopo e sem sobrescrita', () => {
  const sync = read('supabase/functions/sync-matriculas-emusys/index.ts');
  const jornada = read('supabase/functions/_shared/jornada-canonica.ts');
  const migration = read('supabase/migrations/20260811131500_emusys_lead_id_alunos.sql');

  assert.match(sync, /emusys_lead_id/);
  assert.match(sync, /\.eq\('unidade_id', u\.id\)/);
  assert.match(sync, /\.is\('emusys_lead_id', null\)/);
  assert.match(sync, /tipo_divergencia: 'lead_id_divergente'/);
  assert.match(sync, /localizarAlunoParaLeadId/);
  assert.match(jornada, /mat\.aluno\?\.lead_id/);
  assert.match(jornada, /emusysLeadId/);
  assert.match(migration, /add column if not exists emusys_lead_id bigint/i);
});
