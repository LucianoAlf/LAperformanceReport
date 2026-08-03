import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const lib = await readFile(
  new URL('../src/lib/fallbackCompetenciaRelatorio.ts', import.meta.url),
  'utf8',
);
const hook = await readFile(
  new URL('../src/hooks/useConfirmacaoCompetencia.ts', import.meta.url),
  'utf8',
);

test('o corpo do erro e lido do context da resposta', () => {
  assert.match(lib, /context/);
  assert.match(lib, /\.json\(\)/);
});

test('parse ilegivel devolve null em vez de estourar', () => {
  assert.match(lib, /catch/);
  assert.match(lib, /return null/);
});

test('so aceita fallback com motivo de fechamento indisponivel', () => {
  assert.match(lib, /fechamento_indisponivel/);
});

test('o hook expoe a promise de confirmacao', () => {
  assert.match(hook, /export function useConfirmacaoCompetencia/);
  assert.match(hook, /Promise<boolean>/);
});

test('o ciclo tentar-oferecer-reenviar mora numa unica funcao', () => {
  assert.match(lib, /export async function solicitarRelatorioMensalComFallback/);
});
