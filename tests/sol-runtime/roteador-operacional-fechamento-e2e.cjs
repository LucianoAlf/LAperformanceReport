#!/usr/bin/env node
'use strict';

// O roteador V4 pode orientar um executor determinístico de preview sem
// promover aprovação financeira nem criar uma regex para cada frase humana.
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
process.env.SOL_CAIXA_V4_SHADOW = '1';
const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const fin = require(path.join(root, 'vps/la-hq/sol/runtime/caixa-financeiro.cjs'));
const CHAT = 'barra@g.us';

(async () => {
  const logs = [];
  const h = fin.criarHandlerFinanceiro({
    grupos: { [CHAT]: { unidade_id: 'unidade-barra', nome: 'Barra' } },
    sendFn: async () => 'msg',
    rotearV4Fn: async (texto) => ({
      intencao: texto.includes('relatório') ? 'fechar_caixa' : 'conversa',
      confianca: 0.99,
    }),
    log: (item) => logs.push(item),
  });
  const event = {
    chatId: CHAT, messageId: 'pedido-relatorio-1', senderPhone: '5521888888888',
    body: 'Sol, me manda o relatório do caixa agora para aprovar', hasMedia: false,
  };
  const dec = await h.decidirRoteadorV4(event, 'nada', { modo: 'preflight_operacional' });
  assert.strictEqual(dec.intencao, 'fechar_caixa');
  assert.strictEqual(dec.confianca, 0.99);
  const registro = logs.find((x) => x.acao === 'roteador_v4_shadow');
  assert(registro, 'decisão não foi registrada no placar');
  assert.strictEqual(registro.modo, 'preflight_operacional');
  assert.strictEqual(registro.legado, 'nada');
  assert.strictEqual(registro.intencao, 'fechar_caixa');
  console.log('roteador operacional: frase inédita -> executor determinístico — OK');
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
