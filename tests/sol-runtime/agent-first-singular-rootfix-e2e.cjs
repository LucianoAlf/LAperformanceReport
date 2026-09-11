#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const runtimePath = path.resolve(__dirname, '../../vps/la-hq/sol/runtime/caixa-financeiro.cjs');
const CHAT = 'recreio-teste@g.us';
const UNIDADE = '00000000-0000-0000-0000-000000000001';
const FATURA = '00000000-0000-0000-0000-000000000099';

function carregarRuntime() {
  delete require.cache[runtimePath];
  process.env.SOL_CAIXA_V3_LEDGER_MODE = 'production';
  process.env.SOL_CAIXA_V3_LEDGER_STRICT = '1';
  process.env.SOL_CAIXA_V4_CANARIO = CHAT;
  return require(runtimePath);
}

function fixture({ falharPrepare = false, falharPublicar = false,
  janelaMs = 30 * 60 * 1000, resolverItens = 1, abertos = [] } = {}) {
  const { criarHandlerFinanceiro } = carregarRuntime();
  const envios = [];
  const ledger = [];
  const lancamentos = [];
  const lotes = [];
  const timeline = [];
  const porHash = new Map();
  let mid = 0;
  const registrarPreviewV3Fn = async (payload) => {
    timeline.push(`ledger:${payload.preview_status}`);
    ledger.push(JSON.parse(JSON.stringify(payload)));
    if (falharPrepare && payload.preview_status === 'prepared_private') return { ok: false };
    if (falharPublicar && payload.preview_status === 'public_preview_sent') return { ok: false };
    const id = porHash.get(payload.preview_hash) || `ledger-${porHash.size + 1}`;
    porHash.set(payload.preview_hash, id);
    return { ok: true, preview_id: id };
  };
  const itens = resolverItens === 1 ? [{
    aluno_nome: 'Beatriz Teste', valor: 590, categoria: 'passaporte', competencia: '09/2026',
    canonical_fatura_id: FATURA, descricao: 'Taxa de Matrícula do curso de Canto',
    responsavel_financeiro: 'Responsável Teste',
    fatura: { canonical_fatura_id: FATURA, tipo_fatura: 'passaporte_taxa_matricula',
      descricao: 'Taxa de Matrícula do curso de Canto', competencia: '2026-09-01',
      status: 'paga', valor_pago: 590 },
  }] : [
    { aluno_nome: 'Ana Teste', valor: 300, categoria: 'parcela', competencia: '09/2026', canonical_fatura_id: FATURA, fatura: { canonical_fatura_id: FATURA, status: 'paga' } },
    { aluno_nome: 'Bia Teste', valor: 290, categoria: 'passaporte', competencia: '09/2026', canonical_fatura_id: '00000000-0000-0000-0000-000000000098', fatura: { canonical_fatura_id: '00000000-0000-0000-0000-000000000098', status: 'paga' } },
  ];
  const h = criarHandlerFinanceiro({
    grupos: { [CHAT]: { unidade_id: UNIDADE, nome: 'Recreio' } },
    sendFn: async (chatId, texto) => { const id = `msg-${++mid}`; envios.push({ id, chatId, texto }); timeline.push(`send:${id}`); return id; },
    registrarPreviewV3Fn,
    registrarApprovalV3Fn: async () => ({ ok: true, approval_id: 'approval-1' }),
    finalizarPreviewV3Fn: async () => ({ ok: true }),
    resolverEnvelopeFn: async ({ envelope }) => ({ ok: true, valor_total: envelope.valor_total, itens }),
    rotearV4Fn: async (texto) => {
      if (/^pode$/i.test(texto)) return { intencao: 'aprovar' };
      if (/cart[aã]o/i.test(texto)) return { intencao: 'lancamento_por_texto', forma: 'cartao' };
      return null;
    },
    identidadeFn: async () => ({ identificado: true, nome: 'Fefê Teste' }),
    lancarFn: async (payload) => { lancamentos.push(payload); return { ok: true, valor: Number(payload.valor), forma: payload.forma, movimentacao_id: 'mov-1' }; },
    lancarLoteFn: async (payload) => { lotes.push(payload); return { ok: true, lote_id: 'lote-1', movimentacoes: payload.itens.map((i, n) => ({ ...i, id: `m-${n}` })) }; },
    listarPreviewsAbertosFn: async () => abertos,
    janelaMs,
  });
  return { h, envios, ledger, lancamentos, lotes, timeline };
}

function evento(messageId, body, extra = {}) {
  return { chatId: CHAT, messageId, senderId: '5521999999999@c.us', senderPhone: '5521999999999',
    body, hasMedia: false, timestamp: 1789160000, ...extra };
}

test('caso real: rascunho duravel -> cartao 2x -> singular -> pode -> uma escrita', async () => {
  const { h, envios, ledger, lancamentos, lotes, timeline } = fixture();
  const inicio = 1_789_160_000_000;
  const primeira = evento('origem-1', 'Pagamento Beatriz R$ 590,00 passaporte', {
    caixaToolDecision: { intencao: 'lancamento_por_texto', aluno_nome: 'Beatriz Teste',
      valor_total: 590, forma: null, categoria: 'passaporte', competencia: '09/2026' },
  });
  const r1 = await h.tratarAgentFirst(primeira, { unidade_id: UNIDADE, nome: 'Recreio' }, inicio);
  assert.equal(r1.acao, 'agent_first_aguardando_forma');
  assert.equal(h._pendentes.get(CHAT)?.length || 0, 0, 'rascunho nao pode virar pendencia aprovavel');
  assert.equal(h._rascunhosV4.size, 1);
  assert.equal(ledger[0].preview_status, 'draft_missing_fields');
  assert.equal(ledger[0].operacao, 'agent_first_draft');
  assert.equal(envios.some((e) => /Posso lan[cç]ar/i.test(e.texto)), false);

  const segunda = evento('forma-1', 'cartão de crédito 2x', {
    caixaToolDecision: { intencao: 'lancamento_por_texto', forma: 'cartao' },
  });
  const r2 = await h.tratarAgentFirst(segunda, { unidade_id: UNIDADE, nome: 'Recreio' }, inicio + 1000);
  assert.equal(r2.acao, 'preview_agent_first_singular');
  const fases = ledger.filter((x) => x.mode === 'v4_agent_first_two_phase').map((x) => x.preview_status);
  assert.deepEqual(fases, ['prepared_private', 'public_preview_sent']);
  const prepareIndex = timeline.indexOf('ledger:prepared_private');
  const cardIndex = timeline.indexOf(`send:${r2.previewId}`);
  const publicIndex = timeline.indexOf('ledger:public_preview_sent');
  assert.ok(prepareIndex >= 0 && prepareIndex < cardIndex && cardIndex < publicIndex,
    `ordem segura esperada, veio ${timeline.join(' -> ')}`);
  const pend = h._pendentes.get(CHAT)[0];
  assert.equal(pend.categoria, 'passaporte');
  assert.equal(pend.forma, 'cartao');
  assert.equal(pend.cartaoParcelas, 2);
  assert.equal(pend.tipoOperacao, undefined, 'um item usa executor singular');
  assert.equal(h._rascunhosV4.size, 0);

  const aprova = await h.handle(evento('aprova-1', 'pode', { quotedMessageId: r2.previewId }), inicio + 2000);
  assert.equal(aprova.acao, 'lancado');
  assert.equal(lancamentos.length, 1);
  assert.equal(lotes.length, 0);
  assert.equal(lancamentos[0].categoria, 'passaporte');
  assert.equal(lancamentos[0].cartao_parcelas, 2);
  assert.equal(lancamentos[0].fatura_id, FATURA);

  await h.handle(evento('aprova-2', 'pode', { quotedMessageId: r2.previewId }), inicio + 3000);
  assert.equal(lancamentos.length, 1, 'redelivery/segundo pode nao duplica');
});

test('pode nao aprova rascunho incompleto; nao cancela e expiracao remove', async () => {
  const { h, lancamentos } = fixture({ janelaMs: 1000 });
  const base = evento('origem-2', 'Pagamento Beatriz R$ 590,00', {
    caixaToolDecision: { intencao: 'lancamento_por_texto', aluno_nome: 'Beatriz Teste', valor_total: 590, categoria: 'passaporte' },
  });
  await h.tratarAgentFirst(base, { unidade_id: UNIDADE, nome: 'Recreio' }, 10_000);
  const pode = await h.tratarAgentFirst(evento('p-2', 'pode'), { unidade_id: UNIDADE, nome: 'Recreio' }, 10_100);
  assert.equal(pode.acao, 'agent_first_draft_ainda_sem_forma');
  assert.equal(lancamentos.length, 0);
  const nao = await h.tratarAgentFirst(evento('n-2', 'não'), { unidade_id: UNIDADE, nome: 'Recreio' }, 10_200);
  assert.equal(nao.acao, 'agent_first_draft_descartado');
  assert.equal(h._rascunhosV4.size, 0);

  await h.tratarAgentFirst({ ...base, messageId: 'origem-3' }, { unidade_id: UNIDADE, nome: 'Recreio' }, 20_000);
  await h.tratarAgentFirst(evento('late', 'cartão 2x', { caixaToolDecision: { intencao: 'lancamento_por_texto', forma: 'cartao' } }),
    { unidade_id: UNIDADE, nome: 'Recreio' }, 21_500);
  assert.equal(h._rascunhosV4.size, 0, 'rascunho vencido nao e reutilizado');
  assert.equal(lancamentos.length, 0);
});

test('falha no prepare nao mostra card aprovavel nem deixa estado da origem', async () => {
  const { h, envios } = fixture({ falharPrepare: true });
  const ev = evento('origem-4', 'Pagamento Beatriz R$ 590,00 cartão', {
    caixaToolDecision: { intencao: 'lancamento_por_texto', aluno_nome: 'Beatriz Teste',
      valor_total: 590, forma: 'cartao', categoria: 'passaporte', competencia: '09/2026' },
  });
  const r = await h.tratarAgentFirst(ev, { unidade_id: UNIDADE, nome: 'Recreio' }, 30_000);
  assert.equal(r.acao, 'preview_prepare_falhou');
  assert.equal(envios.some((e) => /Posso lan[cç]ar/i.test(e.texto)), false);
  assert.equal(h._pendentes.get(CHAT)?.length || 0, 0);
  assert.equal(h._rascunhosV4.size, 0);
});

test('falha na ativacao avisa para ignorar o card e limpa todo estado local', async () => {
  const { h, envios } = fixture({ falharPublicar: true });
  const ev = evento('origem-4b', 'Pagamento Beatriz R$ 590,00 cartão', {
    caixaToolDecision: { intencao: 'lancamento_por_texto', aluno_nome: 'Beatriz Teste',
      valor_total: 590, forma: 'cartao', categoria: 'passaporte', competencia: '09/2026' },
  });
  const r = await h.tratarAgentFirst(ev, { unidade_id: UNIDADE, nome: 'Recreio' }, 35_000);
  assert.equal(r.acao, 'preview_publish_falhou');
  assert.equal(envios.some((e) => /Ignore esse card/i.test(e.texto)), true);
  assert.equal(h._pendentes.get(CHAT)?.length || 0, 0);
  assert.equal(h._rascunhosV4.size, 0);
});

test('dois itens continuam no lote e categoria mista nao escolhe a primeira', async () => {
  const { h, lotes } = fixture({ resolverItens: 2 });
  const ev = evento('origem-5', 'Ana 300 e Bia 290 total 590 no pix', {
    caixaToolDecision: { intencao: 'lancamento_multi_aluno', valor_total: 590, forma: 'pix',
      itens: [{ aluno: 'Ana Teste', categorias: ['parcela'] }, { aluno: 'Bia Teste', categorias: ['passaporte'] }] },
  });
  const r = await h.tratarAgentFirst(ev, { unidade_id: UNIDADE, nome: 'Recreio' }, 40_000);
  assert.equal(r.acao, 'preview_multi_aluno_enviado');
  const pend = h._pendentes.get(CHAT)[0];
  assert.equal(pend.tipoOperacao, 'lancar_recebimento_lote');
  assert.equal(pend.categoria, 'outro');
  await h.handle(evento('aprova-5', 'pode', { quotedMessageId: r.previewId }), 41_000);
  assert.equal(lotes.length, 1);
  assert.equal(lotes[0].itens.length, 2);
});

test('rascunho incompleto reidrata depois de restart sem virar pendencia aprovavel', async () => {
  const criado = new Date().toISOString();
  const envelope = { pagador: null, valor_total: 590, forma: null,
    itens: [{ aluno: 'Beatriz Teste', categorias: ['passaporte'], competencias: ['09/2026'] }] };
  const abertos = [{
    id: 'draft-ledger-1', preview_hash: 'hash-draft-1', criado_em: criado,
    operacao: 'agent_first_draft', status: 'draft_missing_fields',
    chat_id_hash: require('node:crypto').createHash('md5').update(CHAT).digest('hex'),
    pending: { tipoOperacao: 'agent_first_draft', origem: 'origem-restart', ts: Date.now(), agentFirstEnvelope: envelope },
  }];
  const { h } = fixture({ abertos });
  const reidratou = await h.reidratarPendencias();
  assert.equal(reidratou.rascunhos, 1);
  assert.equal(h._pendentes.get(CHAT)?.length || 0, 0);
  const r = await h.tratarAgentFirst(evento('forma-restart', 'cartão 2x', {
    caixaToolDecision: { intencao: 'lancamento_por_texto', forma: 'cartao' },
  }), { unidade_id: UNIDADE, nome: 'Recreio' }, Date.now());
  assert.equal(r.acao, 'preview_agent_first_singular');
});
