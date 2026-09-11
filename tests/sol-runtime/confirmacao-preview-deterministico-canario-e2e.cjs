#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');

process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
const root = path.resolve(__dirname, '../..');
const fin = require(path.join(root, 'vps/la-hq/sol/runtime/caixa-financeiro.cjs'));

const CHAT = 'recreio@g.us';
const handler = fin.criarHandlerFinanceiro({
  grupos: { [CHAT]: { chat_id: CHAT, unidade_id: 'u-recreio', nome: 'Recreio' } },
  sendFn: async () => 'msg',
  dryRun: true,
});

const base = { previewId: 'preview-midia', origem: 'comprovante-original', msgIds: ['preview-midia'], ts: Date.now() };
handler._pendentes.set(CHAT, [{ ...base }]);

assert.strictEqual(handler.deveTratarConfirmacaoDeterministica({ chatId: CHAT, body: 'pode', hasMedia: false }), true);
assert.strictEqual(handler.deveTratarConfirmacaoDeterministica({ chatId: CHAT, body: 'não', hasMedia: false }), true);
assert.strictEqual(handler.deveTratarConfirmacaoDeterministica({ chatId: CHAT, body: 'pode ser', hasMedia: false }), false);
assert.strictEqual(handler.deveTratarConfirmacaoDeterministica({ chatId: CHAT, body: 'corrige o aluno para Maria Silva', hasMedia: false }), false);
assert.strictEqual(handler.deveTratarConfirmacaoDeterministica({ chatId: CHAT, body: 'pode', hasMedia: true }), false);
assert.strictEqual(handler.deveTratarConfirmacaoDeterministica({ chatId: CHAT, body: 'sim', hasMedia: false, quotedMessageId: 'preview-midia' }), true);
assert.strictEqual(handler.deveTratarConfirmacaoDeterministica({ chatId: CHAT, body: 'sim', hasMedia: false, quotedMessageId: 'card-antigo' }), false);

handler._pendentes.set(CHAT, [{ ...base, previewId: 'preview-tool', msgIds: ['preview-tool'], agentFirstEnvelope: { operacao: 'entrada' } }]);
assert.strictEqual(handler.deveTratarConfirmacaoDeterministica({ chatId: CHAT, body: 'pode', hasMedia: false }), false);
assert.strictEqual(handler.deveTratarConfirmacaoDeterministica({ chatId: CHAT, body: 'não', hasMedia: false }), false);

console.log('canário: pode/não de preview determinístico fica no handler; texto novo e preview das tools seguem agent-first — OK');
