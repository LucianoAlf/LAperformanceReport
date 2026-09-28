#!/usr/bin/env node
'use strict';

// A Sol entendia um pagamento ditado, não achava a fatura e ficava MUDA: o
// agent-first devolvia null, o parser antigo também não tratava, e a pessoa não
// recebia card, pergunta nem motivo. Agora, se nada foi enviado no turno, ela
// diz o que entendeu e por que não lançou. No caminho das ferramentas ela NÃO
// fala sozinha: o agente recebe o motivo na resposta da tool.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const runtimePath = path.resolve(__dirname, '../../vps/la-hq/sol/runtime/caixa-financeiro.cjs');
const CHAT = 'cg@g.us';

function fixture({ resolver }) {
  delete require.cache[runtimePath];
  process.env.SOL_CAIXA_V3_LEDGER_MODE = 'production';
  process.env.SOL_CAIXA_V4_CANARIO = CHAT;
  process.env.SOL_CAIXA_LOTE_MS = '0';
  const { criarHandlerFinanceiro } = require(process.env.SOL_CAIXA_CJS || runtimePath);
  const envios = [];
  const h = criarHandlerFinanceiro({
    grupos: { [CHAT]: { unidade_id: 'u1', nome: 'Campo Grande' } },
    sendFn: async (c, t) => { envios.push(t); return 'M' + envios.length; },
    rotearV4Fn: async () => ({ intencao: 'lancamento_por_texto', aluno_nome: 'Fulano de Tal',
      valor_total: 456, forma: 'pix', categoria: 'parcela', competencia: '09/2026' }),
    resolverEnvelopeFn: resolver,
    registrarPreviewV3Fn: async () => ({ ok: true, preview_id: 'p1' }),
    listarPreviewsAbertosFn: async () => [],
    identidadeFn: async () => ({ identificado: true }),
    lancarFn: async () => { throw new Error('não pode lançar'); },
    // O parser antigo não reconhece nada neste teste.
    interpretarFn: async () => null, casarFn: async () => null, canonicaFn: async () => null,
    log: () => {},
  });
  return { h, envios };
}

const ev = (id, body) => ({ chatId: CHAT, messageId: id, senderId: '5521991111111@c.us',
  senderPhone: '5521991111111', body, hasMedia: false, timestamp: 1 });

test('pagamento entendido sem fatura: a Sol avisa e diz o motivo', async () => {
  const { h, envios } = fixture({ resolver: async () => ({ ok: false, motivo: 'nenhuma_fatura_aberta' }) });
  const r = await h.handle(ev('m1', 'PG pix parcela 09/2026 aluno Fulano de Tal R$456,00'));
  assert.equal(r.acao, 'agent_first_nao_resolveu_avisado');
  assert.equal(envios.length, 1);
  assert.match(envios[0], /Fulano de Tal/);
  assert.match(envios[0], /456,00/);
  assert.match(envios[0], /Nada foi lançado/);
});

test('no caminho das ferramentas a Sol não fala sozinha', async () => {
  const { h, envios } = fixture({ resolver: async () => ({ ok: false, motivo: 'nenhuma_fatura_aberta' }) });
  await h.handle(ev('tool-abc', 'PG pix parcela 09/2026 aluno Fulano de Tal R$456,00'));
  assert.equal(envios.length, 0);
});

test('quando sai card, não há aviso extra', async () => {
  const { h, envios } = fixture({ resolver: async ({ envelope }) => ({ ok: true, valor_total: envelope.valor_total, itens: [{
    aluno_nome: 'Fulano de Tal', valor: 456, categoria: 'parcela', competencia: '09/2026',
    canonical_fatura_id: 'f1', descricao: 'Parcela 09/2026', fatura: { canonical_fatura_id: 'f1', status: 'aberta', valor: 456 } }] }) });
  const r = await h.handle(ev('m2', 'PG pix parcela 09/2026 aluno Fulano de Tal R$456,00'));
  assert.match(String(r.acao), /preview/);
  assert.equal(envios.length, 1);
  assert.doesNotMatch(envios[0], /Nada foi lançado/);
});
