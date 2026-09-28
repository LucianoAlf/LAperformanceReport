#!/usr/bin/env node
'use strict';

// Rastro de quem pediu e quem aprovou (pedido do Alfredo, 28/09/2026). Com
// qualquer membro do grupo podendo pedir à Sol, o card mostra QUEM PEDIU e o
// ledger V3 da aprovação guarda os dois; mesma pessoa = "autoaprovado" no log e
// no ledger — sem bloquear (decisão do Alf).
process.env.SOL_CAIXA_V3_LEDGER_MODE = 'production';
process.env.SOL_CAIXA_V3_LEDGER_STRICT = '1';
process.env.SOL_CAIXA_V4_CANARIO = 'cg@g.us';
process.env.SOL_CAIXA_LOTE_MS = '0';
const test = require('node:test');
const assert = require('node:assert/strict');
const mod = require('./_alvo.cjs');

const CHAT = 'cg@g.us';
const NOMES = { '5521900000001': 'Vitória', '5521900000002': 'Jhonatan' };

function fixture() {
  const envios = []; const aprovacoes = []; const lancamentos = []; const logs = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { unidade_id: 'u1', nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { envios.push(String(t)); return 'M' + (++seq); },
    rotearV4Fn: async (t) => (/^\s*pode\b/i.test(t) ? { intencao: 'aprovar' } : { intencao: 'lancamento_por_texto',
      aluno_nome: 'Fulano de Tal', valor_total: 456, forma: 'pix', categoria: 'parcela', competencia: '09/2026' }),
    resolverEnvelopeFn: async ({ envelope }) => ({ ok: true, valor_total: envelope.valor_total, itens: [{
      aluno_nome: 'Fulano de Tal', valor: 456, categoria: 'parcela', competencia: '09/2026',
      canonical_fatura_id: 'f1', descricao: 'Parcela 09/2026', fatura: { canonical_fatura_id: 'f1', status: 'aberta', valor: 456 } }] }),
    identidadeFn: async (tel) => ({ identificado: true, nome: NOMES[String(tel)] || 'Equipe' }),
    registrarPreviewV3Fn: async () => ({ ok: true, preview_id: 'P' + (++seq) }),
    registrarApprovalV3Fn: async (p) => { aprovacoes.push(p); return { ok: true, approval_id: 'A1' }; },
    finalizarPreviewV3Fn: async () => ({ ok: true }),
    lancarFn: async (p) => { lancamentos.push(p); return { ok: true, movimentacao_id: 'mov', valor: p.valor, forma: p.forma }; },
    listarPreviewsAbertosFn: async () => [], duplicataFn: async () => ({ ja_lancado: false }),
    log: (e) => logs.push(e),
  });
  const ev = (id, body, tel, extra = {}) => ({ chatId: CHAT, messageId: id, senderPhone: tel,
    senderId: tel + '@s.whatsapp.net', body, hasMedia: false, ...extra });
  return { h, envios, aprovacoes, lancamentos, logs, ev };
}

test('o card mostra quem pediu', async () => {
  const { h, envios, ev } = fixture();
  const r = await h.handle(ev('m1', 'PG pix parcela 09/2026 aluno Fulano de Tal R$456,00', '5521900000001'));
  assert.equal(r.acao, 'preview_agent_first_singular', JSON.stringify(r));
  assert.match(envios.at(-1), /_Pedido por: Vitória_\n👉/);
});

test('mesma pessoa pede e aprova: lança (não bloqueia) e marca autoaprovado no ledger, no log e no lançamento', async () => {
  const { h, aprovacoes, lancamentos, logs, ev } = fixture();
  await h.handle(ev('m1', 'PG pix parcela 09/2026 aluno Fulano de Tal R$456,00', '5521900000001'));
  const pend = h._pendentes.get(CHAT)[0];
  const r = await h.handle(ev('m2', 'pode', '5521900000001', { quotedMessageId: pend.previewId }));
  assert.equal(r.acao, 'lancado', JSON.stringify(r));
  assert.equal(aprovacoes.length, 1);
  assert.equal(aprovacoes[0].decision_json.autoaprovado, true);
  assert.equal(aprovacoes[0].decision_json.pedido_por, 'Vitória');
  assert.equal(aprovacoes[0].decision_json.requester_id_hash, aprovacoes[0].decision_json.aprovador_id_hash);
  assert.ok(logs.some((l) => l.acao === 'autoaprovado'));
  assert.equal(lancamentos[0].autoaprovado, true);
});

test('pessoas diferentes: não é autoaprovado, e o recibo mostra quem enviou e quem autorizou', async () => {
  const { h, envios, aprovacoes, lancamentos, logs, ev } = fixture();
  await h.handle(ev('m1', 'PG pix parcela 09/2026 aluno Fulano de Tal R$456,00', '5521900000001'));
  const pend = h._pendentes.get(CHAT)[0];
  const r = await h.handle(ev('m2', 'pode', '5521900000002', { quotedMessageId: pend.previewId }));
  assert.equal(r.acao, 'lancado');
  assert.equal(aprovacoes[0].decision_json.autoaprovado, false);
  assert.notEqual(aprovacoes[0].decision_json.requester_id_hash, aprovacoes[0].decision_json.aprovador_id_hash);
  assert.ok(!logs.some((l) => l.acao === 'autoaprovado'));
  assert.equal(lancamentos[0].autoaprovado, false);
  assert.match(envios.at(-1), /Jhonatan autorizou · Vitória enviou/);
});

test('o ledger não guarda telefone em claro na aprovação', async () => {
  const { h, aprovacoes, ev } = fixture();
  await h.handle(ev('m1', 'PG pix parcela 09/2026 aluno Fulano de Tal R$456,00', '5521900000001'));
  const pend = h._pendentes.get(CHAT)[0];
  await h.handle(ev('m2', 'pode', '5521900000002', { quotedMessageId: pend.previewId }));
  assert.doesNotMatch(JSON.stringify(aprovacoes[0]), /5521900000001|5521900000002/);
});
