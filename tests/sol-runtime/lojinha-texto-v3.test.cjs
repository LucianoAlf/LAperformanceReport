#!/usr/bin/env node
'use strict';
// Lojinha por texto na V3 (29/09/2026): parsing determinístico de valor e comprador.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const cf = require(path.resolve(__dirname, '../../vps/la-hq/sol/runtime/caixa-financeiro.cjs'));

test('valor único em formatos da equipe', () => {
  const v = cf._valorLojinhaTexto;
  assert.equal(v('Venda de corda para a aluna Fulana Souza Valor:60 reais pix'), 60);
  assert.equal(v('Venda de capotraste — aluno Fulano de Tal — R$ 40,00 — pix'), 40);
  assert.equal(v('Venda caderno 25 reais dinheiro'), 25);
  assert.equal(v('Venda de corda R$ 40 e palheta R$ 5 pix'), null); // dois valores: não adivinha
  assert.equal(v('Venda de corda pix'), null);
});

test('comprador declarado', () => {
  const c = cf._compradorDeclaradoLojinha;
  assert.equal(c('Venda de corda para a aluna Fulana Beltrana de Souza Valor:60 reais pix'), 'Fulana Beltrana de Souza');
  assert.equal(c('Venda de capotraste — aluno Fulano de Tal — R$ 40,00 — pix'), 'Fulano de Tal');
  assert.equal(c('Venda de corda R$ 40 pix'), null);
});
