import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const edgePath = path.join(root, 'supabase/functions/processar-matricula-emusys/index.ts');

test('o aviso previo recebido do Emusys persiste sua origem de webhook', () => {
  const source = fs.readFileSync(edgePath, 'utf8');
  const start = source.indexOf('async function handleAvisoPrevio');
  const end = source.indexOf('\n// v12:', start);
  assert.notEqual(start, -1, 'handleAvisoPrevio ausente');
  assert.notEqual(end, -1, 'fim de handleAvisoPrevio ausente');

  const handler = source.slice(start, end);
  assert.match(handler, /origem_registro:\s*'webhook_emusys'/u);
});
