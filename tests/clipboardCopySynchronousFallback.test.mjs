import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('copia tradicional acontece antes do primeiro await para preservar o clique', () => {
  const clipboard = read('src/lib/clipboard.ts');
  const inicio = clipboard.indexOf('export async function copyTextToClipboard');
  const fim = clipboard.indexOf('export function getManualCopyShortcut');
  const funcao = clipboard.slice(inicio, fim);

  const copiaSincrona = funcao.indexOf("document.execCommand('copy')");
  const primeiraEspera = funcao.indexOf('await navigator.clipboard.writeText');

  assert.notEqual(copiaSincrona, -1, 'fallback sincrono de copia ausente');
  assert.notEqual(primeiraEspera, -1, 'Clipboard API moderna ausente');
  assert.ok(
    copiaSincrona < primeiraEspera,
    'a copia sincrona precisa ocorrer antes da API assincrona consumir a ativacao do clique',
  );
});

test('modal gerencial seleciona o texto visivel quando nenhuma copia e permitida', () => {
  const modal = read('src/components/App/Administrativo/ModalRelatorio.tsx');

  assert.match(modal, /const textoRelatorioRef\s*=\s*React\.useRef/);
  assert.match(modal, /textoRelatorioRef\.current\?\.select\(\)/);
  assert.match(modal, /<Textarea[\s\S]*?ref=\{textoRelatorioRef\}/);
});
