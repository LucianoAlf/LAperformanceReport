#!/usr/bin/env node
'use strict';

// A LLM escolhe a ferramenta e passa o movimento exato. O runtime continua
// dono do preview, approval V3 e escrita; busca heuristica nunca roda.
process.env.SOL_CAIXA_V3_LEDGER_MODE = 'production';
process.env.SOL_CAIXA_V3_LEDGER_STRICT = '1';
const assert = require('assert');
const mod = require('./_alvo.cjs');

const CHAT = 'grupo-teste@g.us';
const UNIDADE = '00000000-0000-0000-0000-000000000001';
const MOV = '00000000-0000-0000-0000-000000000099';

(async () => {
  const enviadas = [];
  let corrigiu = null;
  let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { unidade_id: UNIDADE, nome: 'Unidade Teste' } },
    sendFn: async (_chat, texto) => { enviadas.push(String(texto)); return 'MSG-' + (++seq); },
    buscarMovimentosFn: async () => { throw new Error('busca heuristica nao pode rodar'); },
    identidadeFn: async () => ({ identificado: true, nome: 'Operadora Teste' }),
    registrarPreviewV3Fn: async () => ({ ok: true, preview_id: 'PREV-1' }),
    registrarApprovalV3Fn: async () => ({ ok: true, approval_id: 'APPR-1' }),
    corrigirMovimentoFn: async (payload) => { corrigiu = payload; return { ok: true, depois: {
      valor: Number(payload.valor), categoria: payload.categoria, forma_pagamento: payload.forma,
    } }; },
  });

  const alvo = { movimentacao_id: MOV, unidade_id: UNIDADE, valor: 500,
    categoria: 'parcela', forma_pagamento: 'pix' };
  const cmd = { tipo: 'corrigir', motivo: 'forma informada errada',
    correcoes: { forma_pagamento: 'dinheiro' } };
  const prep = await h.handle({ chatId: CHAT, senderPhone: '5521999999999',
    senderId: '5521999999999@s.whatsapp.net', messageId: 'TOOL-PREP',
    body: 'corrigir lançamento', caixaToolCommand: cmd, caixaToolTarget: alvo });

  assert.strictEqual(prep.acao, 'movimento_operacao_preview_enviado');
  assert.strictEqual(prep.movimentacao_id, MOV);
  const pend = (h._pendentes.get(CHAT) || [])[0];
  assert(pend, 'preview nao ficou pendente');
  assert.strictEqual(pend.movimentacao_id, MOV);
  assert.strictEqual(pend.payloadBase.movimentacao_id, MOV);
  assert.strictEqual(pend.forma, 'dinheiro');

  const aprov = await h.handle({ chatId: CHAT, senderPhone: '5521999999999',
    senderId: '5521999999999@s.whatsapp.net', messageId: 'TOOL-PODE', body: 'pode',
    quotedMessageId: pend.previewId });
  assert.strictEqual(aprov.acao, 'movimento_corrigido');
  assert(corrigiu, 'RPC de correcao nao foi chamada');
  assert.strictEqual(corrigiu.movimentacao_id, MOV);
  assert.strictEqual(corrigiu.correcoes.forma_pagamento, 'dinheiro');
  assert(enviadas.some((x) => /Posso corrigir|pode/i.test(x)), 'card de confirmacao ausente');
  assert(enviadas.some((x) => /Corrigi no caixa/i.test(x)), 'recibo de correcao ausente');
  console.log('caixa tool alvo exato: preview, pode, RPC e recibo OK');
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
