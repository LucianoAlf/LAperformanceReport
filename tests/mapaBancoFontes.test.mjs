import assert from 'node:assert/strict';
import test from 'node:test';
import { ehArquivoGerado } from '../scripts/mapa-banco/fontes.mjs';

// Regressao de 2026-09-02: com database.types.ts contado como consumidor, o
// catalogo passou de 439 para 1148 funcoes ATIVA e zerou ORFA/LEGADO. O arquivo
// cita todas as funcoes do banco por ser gerado a partir dele.
test('database.types.ts nao conta como consumidor', () => {
  assert.equal(ehArquivoGerado('src/types/database.types.ts'), true);
  assert.equal(ehArquivoGerado('src\\types\\database.types.ts'), true);
});

test('arquivo .gerado. nao conta como consumidor', () => {
  assert.equal(ehArquivoGerado('docs/banco/FUNCOES.gerado.md'), true);
});

test('codigo de verdade continua contando', () => {
  assert.equal(ehArquivoGerado('src/hooks/useAgenda.ts'), false);
  assert.equal(ehArquivoGerado('src/types/database.ts'), false);
  assert.equal(ehArquivoGerado('supabase/functions/sync-matriculas-emusys/index.ts'), false);
});
