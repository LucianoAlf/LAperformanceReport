#!/usr/bin/env node
'use strict';

// §8.2 do handoff de 28/09 (pedido do Alfredo): com mais de um lançamento IGUAL,
// a Sol nunca escolhe qual estornar. Caso real: Barra 26/09, passaporte do Bento
// lançado 3× (R$ 550 cada) — a busca devolvia "achei mais de um" e não havia como
// apontar qual. Agora ela lista hora, quem lançou e id curto; só quem pediu (ou
// quem cita a lista) escolhe pelo número/id; e o estorno ainda exige "pode".
process.env.SOL_CAIXA_V3_LEDGER_MODE = 'production';
process.env.SOL_CAIXA_V3_LEDGER_STRICT = '1';
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
process.env.SOL_CAIXA_V4_CANARIO = '';
const test = require('node:test');
const assert = require('node:assert/strict');
const mod = require('./_alvo.cjs');

const CHAT = 'barra@g.us';
const UNIDADE = '00000000-0000-0000-0000-000000000001';
const PEDE = '5521900000001';
const OUTRA = '5521900000002';
// Dois lançamentos idênticos — só hora, autor e id os distinguem.
const MOVS = [
  { movimentacao_id: 'aaaa1111-0000-0000-0000-000000000001', unidade_id: UNIDADE, valor: 550,
    categoria: 'passaporte', forma_pagamento: 'cartao', descricao: 'Passaporte - Bento',
    criado_por: 'Sol (Arthur)', created_at: '2026-09-26T20:36:00Z' },
  { movimentacao_id: 'bbbb2222-0000-0000-0000-000000000002', unidade_id: UNIDADE, valor: 550,
    categoria: 'passaporte', forma_pagamento: 'cartao', descricao: 'Passaporte - Bento',
    criado_por: 'Sol (Kailane)', created_at: '2026-09-26T20:33:00Z' },
];

function fixture() {
  const enviadas = []; const estornos = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { unidade_id: UNIDADE, nome: 'Barra' } },
    sendFn: async (_c, t) => { enviadas.push(String(t)); return 'MSG-' + (++seq); },
    buscarMovimentosFn: async () => ({ ok: true, items: MOVS, count: MOVS.length }),
    identidadeFn: async () => ({ identificado: true, nome: 'Arthur' }),
    estornarMovimentoFn: async (p) => { estornos.push(p); return { ok: true, movimentacao_id: p.movimentacao_id, estorno_id: 'EST-1' }; },
    listarPreviewsAbertosFn: async () => [],
    log: () => {},
  });
  const ev = (id, body, sender = PEDE, extra = {}) => ({ chatId: CHAT, messageId: id, senderPhone: sender,
    senderId: sender + '@s.whatsapp.net', body, hasMedia: false, ...extra });
  return { h, enviadas, estornos, ev };
}

test('lista os idênticos com hora, quem lançou e id — e não estorna nada', async () => {
  const { h, enviadas, estornos, ev } = fixture();
  const r = await h.handle(ev('M1', 'Sol, estorna o passaporte de R$ 550,00 do Bento'));
  assert.equal(r.acao, 'movimento_alvo_ambiguo');
  const lista = enviadas.at(-1);
  assert.match(lista, /Não vou escolher sozinha/);
  assert.match(lista, /17:36/, 'hora em BRT do 1º');
  assert.match(lista, /17:33/, 'hora em BRT do 2º');
  assert.match(lista, /lançado por Sol \(Arthur\)/);
  assert.match(lista, /lançado por Sol \(Kailane\)/);
  assert.match(lista, /aaaa1111/);
  assert.match(lista, /bbbb2222/);
  assert.equal(estornos.length, 0);
  assert.equal((h._pendentes.get(CHAT) || []).length, 0, 'lista não é card de estorno');
});

test('"2" de quem pediu vira alvo exato do 2º, com card; o estorno só sai no pode', async () => {
  const { h, enviadas, estornos, ev } = fixture();
  await h.handle(ev('M1', 'Sol, estorna o passaporte de R$ 550,00 do Bento'));
  assert.equal(h.deveTratarComplementoDeterministico(ev('M2', '2')), true, 'a ponte manda a escolha ao caminho determinístico');
  const r = await h.handle(ev('M2', '2'));
  assert.equal(r.acao, 'movimento_operacao_preview_enviado', JSON.stringify(r));
  assert.equal(r.movimentacao_id, MOVS[1].movimentacao_id);
  assert.match(enviadas.at(-1), /Vou estornar/);
  assert.equal(estornos.length, 0, 'escolher não estorna');
  const pend = h._pendentes.get(CHAT)[0];
  const ok = await h.handle(ev('M3', 'pode', PEDE, { quotedMessageId: pend.previewId }));
  assert.equal(ok.acao, 'movimento_estornado', JSON.stringify(ok));
  assert.equal(estornos.length, 1);
  assert.equal(estornos[0].movimentacao_id, MOVS[1].movimentacao_id, 'estornou exatamente o escolhido');
});

test('escolha pelo id curto funciona', async () => {
  const { h, ev } = fixture();
  await h.handle(ev('M1', 'Sol, estorna o passaporte de R$ 550,00 do Bento'));
  const r = await h.handle(ev('M2', 'é o aaaa1111'));
  assert.equal(r.movimentacao_id, MOVS[0].movimentacao_id);
});

test('outra pessoa respondendo "1" sem citar a lista não escolhe; citando, escolhe', async () => {
  const { h, ev } = fixture();
  const lista = await h.handle(ev('M1', 'Sol, estorna o passaporte de R$ 550,00 do Bento'));
  assert.equal(h.deveTratarComplementoDeterministico(ev('M2', '1', OUTRA)), false);
  assert.ok(h._escolhasMovimento.get(CHAT), 'a lista continua esperando quem pediu');
  const r = await h.handle(ev('M3', '1', OUTRA, { quotedMessageId: lista.previewId }));
  assert.equal(r.movimentacao_id, MOVS[0].movimentacao_id);
});

test('número fora da lista pede de novo e mantém a lista', async () => {
  const { h, enviadas, ev } = fixture();
  await h.handle(ev('M1', 'Sol, estorna o passaporte de R$ 550,00 do Bento'));
  const r = await h.handle(ev('M2', '5'));
  assert.equal(r.acao, 'movimento_escolha_fora_da_lista');
  assert.match(enviadas.at(-1), /de \*1\* a \*2\*/);
  assert.ok(h._escolhasMovimento.get(CHAT));
});
