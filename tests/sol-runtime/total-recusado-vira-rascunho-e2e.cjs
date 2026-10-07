#!/usr/bin/env node
'use strict';

// Recreio, 28/09/2026: a Sol recusou o total do comprovante e pediu "me manda o
// total exato" — mas não guardava nada. A resposta "o total foi R$ 402,50"
// chegava sem aluno, sem fatura e sem o comprovante, e nada era lançado.
// Aqui a recusa vira RASCUNHO sem total, a resposta do mesmo autor completa só
// o total, e sai o card de sempre (nada é gravado antes do "pode").
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
  return require(process.env.SOL_CAIXA_CJS || runtimePath);
}

function evento(chatId, messageId, sender, body, extra = {}) {
  return { chatId, messageId, senderId: `${sender}@c.us`, senderPhone: sender,
    body, hasMedia: false, timestamp: 1_789_160_000, ...extra };
}

function fixture() {
  const { criarHandlerFinanceiro } = carregarRuntime();
  const grupos = Object.fromEntries(CHATS.map((chatId, i) => [chatId, {
    unidade_id: `00000000-0000-0000-0000-00000000000${i + 1}`,
    nome: ['Barra', 'Campo Grande', 'Recreio'][i],
  }]));
  const envios = []; const ledger = []; const lancamentos = []; const resolvidos = [];
  let seq = 0; let turno = 0;
  const h = criarHandlerFinanceiro({
    grupos,
    sendFn: async (chatId, texto) => { const id = `msg-${++seq}`; envios.push({ id, chatId, texto }); return id; },
    ocrFn: async () => ({ text: 'PIX ENVIADO VALOR R$ 402,50 FORMA PIX', status: 'ok', file_bytes: 1000, ocr_confidence: 0.98 }),
    visaoFn: async () => null,
    rotearV4Fn: async () => {
      turno += 1;
      if (turno === 1) {
        // O total lido não aparece na legenda: a guarda anula, como em produção.
        return { intencao: 'lancamento_por_texto', aluno_nome: 'Fulana de Tal', valor_total: null,
          valor_total_recusado: { valor: 402.5, motivo: 'nao_esta_no_texto' },
          forma: 'pix', categoria: 'parcela', competencia: '09/2026' };
      }
      return { intencao: 'lancamento_por_texto', valor_total: 402.5 };
    },
    resolverEnvelopeFn: async ({ envelope }) => {
      resolvidos.push(JSON.parse(JSON.stringify(envelope)));
      return { ok: true, valor_total: envelope.valor_total, itens: [{
        aluno_nome: 'Fulana de Tal', valor: envelope.valor_total, categoria: 'parcela',
        competencia: '09/2026', canonical_fatura_id: 'fatura-1', descricao: 'Parcela 09/2026',
        fatura: { canonical_fatura_id: 'fatura-1', status: 'aberta', valor: envelope.valor_total },
      }] };
    },
    registrarPreviewV3Fn: async (p) => { ledger.push(JSON.parse(JSON.stringify(p))); return { ok: true, preview_id: `ledger-${ledger.length}` }; },
    registrarApprovalV3Fn: async () => ({ ok: true, approval_id: 'a1' }),
    finalizarPreviewV3Fn: async () => ({ ok: true }),
    listarPreviewsAbertosFn: async () => [],
    identidadeFn: async () => ({ identificado: true, nome: 'Operadora Teste' }),
    lancarFn: async (payload) => { lancamentos.push(payload); return { ok: true, movimentacao_id: 'mov-1', valor: payload.valor }; },
    log: () => {},
  });
  return { h, grupos, envios, ledger, lancamentos, resolvidos };
}

test('total recusado guarda o comprovante e a resposta com o total monta o card, nas 3 unidades', async () => {
  for (const chatId of CHATS) {
    const { h, envios, lancamentos, resolvidos } = fixture();
    const r1 = await h.handle(evento(chatId, `m-${chatId}`, '5521991111111',
      'Parcela do mês de Setembro da aluna Fulana de Tal - R$400,00', {
        hasMedia: true, mediaType: 'image', mediaUrls: ['/tmp/comprovante.jpg'] }), 1_000_000);
    assert.equal(r1.acao, 'agent_first_valor_total_recusado', chatId);
    const draft = h._rascunhosV4.get(chatId);
    assert.ok(draft, 'a recusa tem de deixar rascunho');
    assert.equal(draft.envelope.valor_total, null);
    assert.equal(draft.envelope.forma, 'pix');
    assert.match(envios.at(-1).texto, /guardei o restante/i);
    assert.equal(resolvidos.length, 0, 'sem total nada vai ao Core');

    // "pode" antes do total não passa
    const rPode = await h.tratarAgentFirst(evento(chatId, `p-${chatId}`, '5521991111111', 'pode'), {
      unidade_id: 'x', nome: 'x' }, 1_000_100);
    assert.equal(rPode.acao, 'agent_first_draft_ainda_sem_total');

    // Outra pessoa respondendo um valor não completa o rascunho alheio
    const alheio = evento(chatId, `o-${chatId}`, '5521992222222', 'R$ 402,50');
    assert.equal(h.deveTratarComplementoDeterministico(alheio, 1_000_150), false);

    const resposta = evento(chatId, `r-${chatId}`, '5521991111111', 'o total foi R$ 402,50');
    assert.equal(h.deveTratarComplementoDeterministico(resposta, 1_000_200), true);
    const r2 = await h.handle(resposta, 1_000_200);
    assert.match(String(r2.acao), /preview/, `${chatId}: ${JSON.stringify(r2)}`);
    assert.equal(resolvidos.at(-1).valor_total, 402.5);
    assert.equal(resolvidos.at(-1).forma, 'pix');
    assert.equal(resolvidos.at(-1).itens[0].aluno, 'Fulana de Tal');
    assert.equal(h._rascunhosV4.size, 0, 'rascunho completado sai do mapa');
    assert.equal(lancamentos.length, 0, 'card não é lançamento: só o pode grava');
  }
});

test('dois valores diferentes na resposta é ambíguo: pergunta de novo, não escolhe', async () => {
  const { h, envios, resolvidos } = fixture();
  const chatId = CHATS[0];
  await h.handle(evento(chatId, 'm1', '5521991111111', 'Parcela de Setembro da aluna Fulana de Tal - R$400,00', {
    hasMedia: true, mediaType: 'image', mediaUrls: ['/tmp/c.jpg'] }), 2_000_000);
  const r = await h.handle(evento(chatId, 'm2', '5521991111111', 'foi R$ 402,50 ou R$ 400,00'), 2_000_100);
  assert.equal(r.acao, 'agent_first_draft_ainda_sem_total');
  assert.equal(resolvidos.length, 0);
  assert.match(envios.at(-1).texto, /total exato/);
  assert.ok(h._rascunhosV4.get(chatId), 'rascunho continua esperando');
});
