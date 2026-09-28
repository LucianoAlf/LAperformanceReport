#!/usr/bin/env node
'use strict';

// Venda de lojinha voltou a lançar por TEXTO e pela FERRAMENTA (28/09/2026).
// A V4 mandava toda venda ao Core, que procura fatura no Emusys — venda de
// lojinha não tem fatura, então a Sol respondia "não achei fatura" (ou ficava
// muda) e nada era lançado. Aqui: texto de venda → card de lojinha SEM fatura →
// "pode" → lançamento categoria lojinha. Parcela continua indo ao Core.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const runtimePath = path.resolve(__dirname, '../../vps/la-hq/sol/runtime/caixa-financeiro.cjs');
const CHATS = ['barra@g.us', 'campo-grande@g.us', 'recreio@g.us'];

function fixture({ decisao, resolver, remetente = 'Operadora' }) {
  delete require.cache[runtimePath];
  process.env.SOL_CAIXA_V3_LEDGER_MODE = 'production';
  process.env.SOL_CAIXA_V4_CANARIO = CHATS.join(',');
  process.env.SOL_CAIXA_LOTE_MS = '0';
  const { criarHandlerFinanceiro } = require(process.env.SOL_CAIXA_CJS || runtimePath);
  const grupos = Object.fromEntries(CHATS.map((c, i) => [c, { unidade_id: `u${i}`, nome: ['Barra', 'Campo Grande', 'Recreio'][i] }]));
  const envios = []; const lancamentos = []; const core = [];
  let seq = 0;
  const h = criarHandlerFinanceiro({
    grupos,
    sendFn: async (c, t) => { envios.push(t); return `M${++seq}`; },
    // Como o roteador real: "pode" é aprovação, não lançamento novo.
    rotearV4Fn: async (texto) => (/^\s*pode\b/i.test(String(texto)) ? { intencao: 'aprovar', confianca: 0.95 } : decisao),
    resolverEnvelopeFn: async (p) => { core.push(p); return resolver ? resolver(p) : { ok: false, motivo: 'nenhuma_fatura_aberta' }; },
    responsavelFn: async (_u, aluno) => ({ ok: true, aluno_nome: 'Beatriz Gonçalves', responsavel_nome: 'Mãe da Beatriz' }),
    identidadeFn: async () => ({ identificado: true, nome: remetente }),
    lancarFn: async (payload) => { lancamentos.push(payload); return { ok: true, movimentacao_id: 'mov-1', valor: payload.valor }; },
    listarPreviewsAbertosFn: async () => [],
    duplicataFn: async () => ({ ja_lancado: false }),
    log: () => {},
  });
  return { h, envios, lancamentos, core };
}

const ev = (chatId, id, body, extra = {}) => ({ chatId, messageId: id, senderId: '5521991111111@c.us',
  senderPhone: '5521991111111', body, hasMedia: false, timestamp: 1, ...extra });

const VENDA = { intencao: 'lancamento_por_texto', aluno_nome: 'Beatriz Gonçalves', valor_total: 60,
  forma: 'pix', categoria: 'lojinha', competencia: null };

test('venda por texto sem fatura vira card de lojinha, e o pode lança como lojinha — 3 unidades', async () => {
  for (const chatId of CHATS) {
    const { h, envios, lancamentos, core } = fixture({ decisao: VENDA });
    const r = await h.handle(ev(chatId, `v-${chatId}`, 'Venda de corda para a aluna Beatriz Gonçalves Valor:60 reais pix'));
    assert.equal(r.acao, 'preview_agent_first_lojinha', `${chatId}: ${JSON.stringify(r)}`);
    assert.equal(core.length, 1, 'procura fatura de lojinha primeiro (CG emite)');
    assert.match(envios.at(-1), /Corda/);
    const pend = h._pendentes.get(chatId)[0];
    assert.equal(pend.categoria, 'lojinha');
    assert.equal(pend.descricao, 'Lojinha/Venda - Corda - Beatriz Gonçalves');
    assert.equal(lancamentos.length, 0, 'card não é lançamento');
    const rp = await h.handle(ev(chatId, `p-${chatId}`, 'pode', { quotedMessageId: pend.previewId }));
    assert.equal(rp.acao, 'lancado', `${chatId}: ${JSON.stringify(rp)}`);
    assert.equal(lancamentos.length, 1);
    assert.equal(lancamentos[0].categoria, 'lojinha');
    assert.equal(Number(lancamentos[0].valor), 60);
    assert.ok(!lancamentos[0].fatura_id, 'venda de lojinha não se liga a fatura');
  }
});

test('venda classificada como "venda" com produto no texto: Core sem fatura → resgate para lojinha', async () => {
  const { h, core } = fixture({ decisao: { ...VENDA, categoria: 'venda' },
    resolver: () => ({ ok: false, motivo: 'fonte_indisponivel' }) });
  const r = await h.handle(ev(CHATS[0], 'v2', 'venda capotraste para a aluna Beatriz Gonçalves R$60,00 pix Venda Kailane'));
  assert.equal(r.acao, 'preview_agent_first_lojinha');
  assert.equal(core.length, 1);
});

test('"Venda Kailane" é quem vendeu, não quem comprou', async () => {
  const { h } = fixture({ decisao: { ...VENDA, aluno_nome: 'Kailane' }, remetente: 'Kailane' });
  await h.handle(ev(CHATS[0], 'v3', 'caderno de cordas R$ 60,00 pix Venda Kailane'));
  const pend = h._pendentes.get(CHATS[0])[0];
  assert.equal(pend.aluno, null);
  assert.equal(pend.descricao, 'Lojinha/Venda - Caderno de Cordas');
});

test('parcela continua indo ao Core (não vira lojinha por ter "cordas" no nome do curso)', async () => {
  const { h, core } = fixture({ decisao: { ...VENDA, categoria: 'parcela', competencia: '09/2026', valor_total: 400 } });
  await h.handle(ev(CHATS[1], 'v4', 'PG pix parcela 09/2026 curso de cordas aluna Beatriz Gonçalves R$400,00'));
  assert.equal(core.length, 1, 'parcela vai ao Core');
});

test('venda sem forma pede a forma e completa depois', async () => {
  const { h, envios } = fixture({ decisao: { ...VENDA, forma: null } });
  const r1 = await h.handle(ev(CHATS[2], 'v5', 'Venda de corda para a aluna Beatriz Gonçalves R$60,00'));
  assert.equal(r1.acao, 'agent_first_aguardando_forma');
  const r2 = await h.handle(ev(CHATS[2], 'v6', 'pix'));
  assert.equal(r2.acao, 'preview_agent_first_lojinha', JSON.stringify(r2));
  assert.equal(h._rascunhosV4.size, 0);
  assert.match(envios.at(-1), /Corda/);
});

test('venda por FOTO não passa pela rota nova (o caminho de foto segue no legado)', async () => {
  const { h, core } = fixture({ decisao: VENDA });
  await h.handle(ev(CHATS[0], 'v7', 'Venda de corda Beatriz Gonçalves R$60,00 pix',
    { hasMedia: true, mediaType: 'image', mediaUrls: ['/tmp/nao-existe.jpg'] })).catch(() => null);
  assert.equal((h._pendentes.get(CHATS[0]) || []).filter((p) => p.idemKey && /agent-first-lojinha/.test(p.idemKey)).length, 0);
  assert.ok(core.length <= 1);
});

test('roteador vazio na 1ª chamada: nova tentativa, e a venda sai (não fica muda)', async () => {
  let chamadas = 0;
  const { h } = fixture({ decisao: VENDA });
  h._rotearOriginal = null;
  // Troca o roteador deste handler: 1ª chamada vazia (timeout/provedor), 2ª decide.
  const { criarHandlerFinanceiro } = require(process.env.SOL_CAIXA_CJS || runtimePath);
  const envios = [];
  const h2 = criarHandlerFinanceiro({
    grupos: { [CHATS[0]]: { unidade_id: 'u0', nome: 'Barra' } },
    sendFn: async (c, t) => { envios.push(t); return 'M' + envios.length; },
    rotearV4Fn: async () => (++chamadas === 1 ? null : VENDA),
    resolverEnvelopeFn: async () => ({ ok: false, motivo: 'nenhuma_fatura_aberta' }),
    responsavelFn: async () => null, identidadeFn: async () => ({ identificado: true, nome: 'Operadora' }),
    listarPreviewsAbertosFn: async () => [], log: () => {},
  });
  const r = await h2.handle(ev(CHATS[0], 'rt1', 'Venda de corda para a aluna Beatriz Gonçalves R$60,00 pix'));
  assert.equal(chamadas, 2);
  assert.equal(r.acao, 'preview_agent_first_lojinha');
  assert.ok(h);
});

test('Campo Grande: com fatura de lojinha no Emusys, o card liga na fatura', async () => {
  const { h, core } = fixture({ decisao: VENDA, resolver: ({ envelope }) => ({ ok: true, valor_total: envelope.valor_total, itens: [{
    aluno_nome: 'Beatriz Gonçalves', valor: 60, categoria: 'lojinha', competencia: '09/2026',
    canonical_fatura_id: 'fat-loja', descricao: '1 palheta caveira',
    fatura: { canonical_fatura_id: 'fat-loja', status: 'paga', valor_pago: 60 } }] }) });
  const r = await h.handle(ev(CHATS[1], 'cgf', 'Venda de palheta para a aluna Beatriz Gonçalves R$60,00 pix'));
  assert.equal(core.length, 1);
  assert.equal(r.acao, 'preview_agent_first_singular');
  const pend = h._pendentes.get(CHATS[1])[0];
  assert.equal(pend.canonica.fatura.canonical_fatura_id, 'fat-loja');
});
