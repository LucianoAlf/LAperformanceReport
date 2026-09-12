import assert from 'node:assert/strict';
import test from 'node:test';

import { tituloDaRota, TITULO_PADRAO } from '../src/mobile/tituloRota.ts';

const ITENS = [
  { path: '/app', label: 'Dashboard', end: true },
  { path: '/app/faturas', label: 'Faturas' },
  { path: '/app/administrativo', label: 'Administrativo' },
];

test('tituloDaRota', async (t) => {
  await t.test('rota sem correspondencia cai no titulo padrao', () => {
    assert.equal(tituloDaRota('/app/nao-existe', ITENS), TITULO_PADRAO);
    assert.equal(TITULO_PADRAO, 'LA Report');
  });

  await t.test('casa a rota exata de um modulo qualquer', () => {
    assert.equal(tituloDaRota('/app/faturas', ITENS), 'Faturas');
  });

  await t.test('sub-rota herda o titulo do modulo', () => {
    // E o que acontece ao abrir um card/modal dentro de Administrativo.
    assert.equal(tituloDaRota('/app/administrativo/contratos', ITENS), 'Administrativo');
  });

  await t.test('a raiz (`end: true`) so casa exata — nao vaza para as outras rotas', () => {
    assert.equal(tituloDaRota('/app', ITENS), 'Dashboard');
    // Sem o `end`, TODA rota comeca com '/app' e tudo viraria "Dashboard".
    assert.equal(tituloDaRota('/app/faturas', ITENS), 'Faturas');
    assert.equal(tituloDaRota('/app/administrativo', ITENS), 'Administrativo');
  });

  await t.test('nao casa por prefixo de texto solto', () => {
    // '/app/faturas-antigas' nao e sub-rota de '/app/faturas'.
    assert.equal(tituloDaRota('/app/faturas-antigas', ITENS), TITULO_PADRAO);
  });
});
