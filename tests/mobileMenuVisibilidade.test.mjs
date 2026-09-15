import assert from 'node:assert/strict';
import test from 'node:test';

import { itemVisivel, filtrarVisiveis } from '../src/lib/menuVisibilidade.ts';

const TODOS = { isAdmin: true, campanhasVisivel: true, trafegoPagoVisivel: true };
const NENHUM = { isAdmin: false, campanhasVisivel: false, trafegoPagoVisivel: false };

test('itemVisivel', async (t) => {
  await t.test('item sem regra e visivel para todo mundo', () => {
    assert.equal(itemVisivel(undefined, NENHUM), true);
    assert.equal(itemVisivel('sempre', NENHUM), true);
  });

  await t.test('admin: so quem e admin ve', () => {
    assert.equal(itemVisivel('admin', TODOS), true);
    assert.equal(itemVisivel('admin', NENHUM), false);
  });

  await t.test('campanhas e trafego seguem a flag de cada um, nao o admin', () => {
    // Trafego Pago e custo de midia: a regra e lista fixa de e-mail, resolvida
    // fora daqui. Ser admin NAO da acesso.
    const soCampanhas = { isAdmin: true, campanhasVisivel: true, trafegoPagoVisivel: false };
    assert.equal(itemVisivel('campanhas', soCampanhas), true);
    assert.equal(itemVisivel('trafego_pago', soCampanhas), false);
  });

  await t.test('regra desconhecida NAO aparece — fail-closed', () => {
    // Item novo com regra mal escrita nao pode vazar modulo sensivel.
    // Some da tela, mas avisa no console para nao sumir em silencio.
    assert.equal(itemVisivel('financeiro_secreto', TODOS), false);
  });
});

test('filtrarVisiveis preserva a ordem e devolve os mesmos objetos', () => {
  const itens = [
    { path: '/app', visibilidade: 'sempre' },
    { path: '/app/trafego-pago', visibilidade: 'trafego_pago' },
    { path: '/app/alunos' },
    { path: '/app/automacoes', visibilidade: 'admin' },
  ];
  const r = filtrarVisiveis(itens, { isAdmin: false, campanhasVisivel: false, trafegoPagoVisivel: false });
  assert.deepEqual(r.map((i) => i.path), ['/app', '/app/alunos']);
  assert.equal(r[0], itens[0], 'devolve a referencia original, nao uma copia');
});
