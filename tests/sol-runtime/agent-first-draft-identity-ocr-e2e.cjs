#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const runtimePath = path.resolve(__dirname, '../../vps/la-hq/sol/runtime/caixa-financeiro.cjs');
const CHATS = ['barra@g.us', 'campo-grande@g.us', 'recreio@g.us'];

function carregarRuntime() {
  delete require.cache[runtimePath];
  process.env.SOL_CAIXA_V3_LEDGER_MODE = 'production';
  process.env.SOL_CAIXA_V3_LEDGER_STRICT = '1';
  process.env.SOL_CAIXA_V4_CANARIO = CHATS.join(',');
  process.env.SOL_CAIXA_LOTE_MS = '0';
  return require(runtimePath);
}

function evento(chatId, messageId, sender, body, extra = {}) {
  return {
    chatId, messageId, senderId: `${sender}@c.us`, senderPhone: sender,
    body, hasMedia: false, timestamp: 1_789_160_000, ...extra,
  };
}

function fixture() {
  const { criarHandlerFinanceiro } = carregarRuntime();
  const grupos = Object.fromEntries(CHATS.map((chatId, i) => [chatId, {
    unidade_id: `00000000-0000-0000-0000-00000000000${i + 1}`,
    nome: ['Barra', 'Campo Grande', 'Recreio'][i],
  }]));
  const envios = [];
  const logs = [];
  const ledger = [];
  const lancamentos = [];
  const documentos = [];
  let seq = 0;
  const h = criarHandlerFinanceiro({
    grupos,
    sendFn: async (chatId, texto) => {
      const id = `msg-${++seq}`;
      envios.push({ id, chatId, texto });
      return id;
    },
    ocrFn: async () => ({
      text: 'COMPROVANTE PAGBANK VENDA CREDITO PARCELADO 2X VALOR PAGO R$ 400,00 NSU 123',
      status: 'ok', file_bytes: 43210, ocr_confidence: 0.98,
    }),
    visaoFn: async () => null,
    rotearV4Fn: async (_texto, _contexto, opts) => {
      documentos.push(opts && opts.documento);
      return {
        intencao: 'lancamento_por_texto', aluno_nome: 'Matheus Teste',
        valor_total: null, forma: null, categoria: 'parcela', competencia: '09/2026',
      };
    },
    resolverEnvelopeFn: async ({ envelope }) => ({
      ok: true, valor_total: envelope.valor_total, itens: [{
        aluno_nome: 'Matheus Teste', valor: envelope.valor_total,
        categoria: 'parcela', competencia: '09/2026',
        canonical_fatura_id: 'fatura-matheus', descricao: 'Parcela 09/2026',
        fatura: { canonical_fatura_id: 'fatura-matheus', status: 'paga', valor_pago: 400 },
      }],
    }),
    registrarPreviewV3Fn: async (payload) => {
      ledger.push(JSON.parse(JSON.stringify(payload)));
      return { ok: true, preview_id: `ledger-${ledger.length}` };
    },
    registrarApprovalV3Fn: async () => ({ ok: true, approval_id: 'approval-1' }),
    finalizarPreviewV3Fn: async () => ({ ok: true }),
    listarPreviewsAbertosFn: async () => [],
    identidadeFn: async () => ({ identificado: true, nome: 'Operadora Teste' }),
    lancarFn: async (payload) => { lancamentos.push(payload); return { ok: true, movimentacao_id: 'mov-1', valor: payload.valor }; },
    log: (linha) => logs.push(JSON.parse(JSON.stringify(linha))),
  });
  return { h, grupos, envios, logs, ledger, lancamentos, documentos };
}

test('mídia agent-first consome OCR estruturado e preserva crédito 2x nos três grupos', async () => {
  for (const chatId of CHATS) {
    const { h, documentos, lancamentos } = fixture();
    const r = await h.handle(evento(chatId, `media-${chatId}`, '5521991111111',
      'PG parcela 09/2026 aluno Matheus Teste', {
        hasMedia: true, mediaType: 'image', mediaUrls: ['/tmp/comprovante-fixture.jpg'],
      }), 1_789_160_000_000);
    assert.equal(r.acao, 'preview_agent_first_singular', chatId);
    assert.equal(documentos.length, 1, chatId);
    assert.equal(documentos[0].forma, 'cartao', chatId);
    assert.equal(documentos[0].cartao_modalidade, 'credito', chatId);
    assert.equal(documentos[0].cartao_parcelas, 2, chatId);
    const pend = h._pendentes.get(chatId)[0];
    assert.equal(pend.valor, 400, chatId);
    assert.equal(pend.forma, 'cartao', chatId);
    assert.equal(pend.cartaoModalidade, 'credito', chatId);
    assert.equal(pend.cartaoParcelas, 2, chatId);
    assert.equal(lancamentos.length, 0, 'preview nunca pode escrever dinheiro');
  }
});

test('complemento só alcança rascunho pelo mesmo remetente ou por citação', async () => {
  const { h, grupos } = fixture();
  const chatId = CHATS[2];
  const inicio = evento(chatId, 'origem-daiana', '5521991111111',
    'PG parcela 09/2026 aluno Matheus Teste R$ 400,00', {
      caixaToolDecision: { intencao: 'lancamento_por_texto', aluno_nome: 'Matheus Teste',
        valor_total: 400, forma: null, categoria: 'parcela', competencia: '09/2026' },
    });
  const r1 = await h.tratarAgentFirst(inicio, grupos[chatId], 10_000);
  assert.equal(r1.acao, 'agent_first_aguardando_forma');
  const draft = h._rascunhosV4.get(chatId);
  assert.ok(draft.msgIds.length === 1, 'pergunta da Sol deve ficar vinculada ao rascunho');

  const mesma = evento(chatId, 'forma-daiana', '5521991111111', 'Cartão de crédito 2x');
  assert.equal(h.deveTratarComplementoDeterministico(mesma, 10_100), true);
  const outra = evento(chatId, 'forma-vitoria', '5521992222222', 'Pix');
  assert.equal(h.deveTratarComplementoDeterministico(outra, 10_100), false);
  const citada = { ...outra, quotedMessageId: draft.msgIds[0] };
  assert.equal(h.deveTratarComplementoDeterministico(citada, 10_100), true);

  const ignorada = await h.tratarAgentFirst(outra, grupos[chatId], 10_100);
  assert.equal(ignorada.acao, 'agent_first_draft_ignorado_outro_remetente');
  assert.equal(h._rascunhosV4.get(chatId).origem, 'origem-daiana');
});

test('nova mídia invalida rascunho anterior e abre caso com origem própria', async () => {
  const { h, grupos, logs, lancamentos } = fixture();
  const chatId = CHATS[2];
  await h.tratarAgentFirst(evento(chatId, 'origem-daiana', '5521991111111',
    'PG parcela 09/2026 aluno Matheus Teste R$ 400,00', {
      caixaToolDecision: { intencao: 'lancamento_por_texto', aluno_nome: 'Matheus Teste',
        valor_total: 400, forma: null, categoria: 'parcela', competencia: '09/2026' },
    }), grupos[chatId], 20_000);

  const novo = await h.handle(evento(chatId, 'origem-vitoria', '5521992222222',
    'PG parcela 09/2026 aluno Matheus Teste', {
      hasMedia: true, mediaType: 'image', mediaUrls: ['/tmp/outro-comprovante.jpg'],
    }), 20_100);
  assert.equal(novo.acao, 'preview_agent_first_singular');
  assert.equal(h._rascunhosV4.size, 0);
  assert.equal(h._pendentes.get(chatId)[0].origem, 'origem-vitoria');
  assert.equal(logs.some((x) => x.acao === 'agent_first_draft_invalidado_nova_midia'), true);
  assert.equal(lancamentos.length, 0);
});

test('bridge prioriza complemento de rascunho antes do handoff ao agente', () => {
  const bridge = require('node:fs').readFileSync(
    path.resolve(__dirname, '../../vps/la-hq/sol/runtime/bridge.js'), 'utf8');
  assert.match(bridge, /deveTratarComplementoDeterministico/);
  assert.match(bridge, /!_confirmacaoDeterministica && !_complementoDeterministico/);
  assert.match(bridge, /complemento_rascunho_deterministico_priorizado/);
});
