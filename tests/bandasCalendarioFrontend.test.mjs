import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const modal = read('src/components/App/Bandas/ModalEventoBanda.tsx');

test('modal aceita data inicial apenas na criação e edição prevalece', () => {
  assert.match(modal, /dataInicial\?: Date \| null/);
  assert.match(
    modal,
    /evento\s*\? new Date\(evento\.data_inicio\)\s*:\s*dataInicial\s*\? new Date\(dataInicial\)\s*:\s*undefined/,
  );
  assert.match(modal, /\[aberto, evento, unidadeAtual, dataInicial\]/);
});

export { existsSync, path, read, root };
