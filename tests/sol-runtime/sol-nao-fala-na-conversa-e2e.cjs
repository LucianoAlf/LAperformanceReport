#!/usr/bin/env node
'use strict';

// 29/09/2026 (Recreio 16:10–16:11): a Sol falou no meio da conversa entre colegas.
//  - "Não muda o valor da parcela" (Rose citando a Vitória) → "Consigo corrigir/estornar…".
//  - Explicação longa sem citar o card trocou o valor do card de 1.850 para 500.
// Regra: mexer em lançamento/valor só quando falam COM ela (nome ou citação de msg dela).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const runtimePath = path.resolve(__dirname, '../../vps/la-hq/sol/runtime/caixa-financeiro.cjs');
const CHAT = 'rec@g.us';

function fixture() {
  delete require.cache[runtimePath];
  process.env.SOL_CAIXA_V3_LEDGER_MODE = 'production';
  process.env.SOL_CAIXA_V4_CANARIO = '';
  process.env.SOL_CAIXA_LOTE_MS = '0';
  const { criarHandlerFinanceiro } = require(runtimePath);
  const envios = [];
  const buscas = [];
  const h = criarHandlerFinanceiro({
    grupos: { [CHAT]: { unidade_id: 'u1', nome: 'Recreio' } },
    sendFn: async (c, t) => { envios.push(t); return 'SOL' + envios.length; },
    buscarMovimentosFn: async (q) => { buscas.push(q); return { items: [] }; },
    registrarPreviewV3Fn: async () => ({ ok: true, preview_id: 'p1' }),
    listarPreviewsAbertosFn: async () => [],
    identidadeFn: async () => ({ identificado: true, nome: 'Rose', papel: 'gerente' }),
    log: () => {},
  });
  return { h, envios, buscas };
}
const ev = (id, body, extra = {}) => ({ chatId: CHAT, messageId: id, senderPhone: '5521900000000',
  senderId: '5521900000000', body, hasMedia: false, ...extra });

test('correção dita entre colegas (citando colega) não faz a Sol falar', async () => {
  const { h, envios, buscas } = fixture();
  await h.handle(ev('m1', 'Não muda o valor da parcela', { quotedMessageId: 'MSG_DA_VITORIA', quotedBody: 'A Wenny está matriculada…' }));
  assert.equal(envios.length, 0, `a Sol falou: ${envios.join(' | ')}`);
  assert.equal(buscas.length, 0);
});

test('com "Sol," a correção segue o fluxo normal (pede o alvo)', async () => {
  const { h, envios } = fixture();
  await h.handle(ev('m2', 'Sol, corrige o valor da parcela para R$ 500'));
  assert.ok(envios.some((t) => /qual lançamento|mais de um lançamento/i.test(t)), envios.join(' | '));
});
