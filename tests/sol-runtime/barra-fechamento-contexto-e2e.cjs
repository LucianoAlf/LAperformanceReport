#!/usr/bin/env node
'use strict';

// Regressão do Financeiro Barra em 14/09/2026:
// - pedido explícito de relatório oficial para aprovação caiu no LLM;
// - o LLM tentou a porta agent-first, que corretamente recusou Barra fora do canário;
// - nenhum novo preview determinístico foi criado e o caixa ficou aberto.
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const fin = require(path.join(root, 'vps/la-hq/sol/runtime/caixa-financeiro.cjs'));
const abf = require(path.join(root, 'vps/la-hq/sol/runtime/caixa-abertura-fechamento.cjs'));

// A frase inédita não ganha regex nova. O roteador estruturado escolhe o
// executor; a gramática antiga continua sendo apenas fallback.
assert.strictEqual(abf.pedidoDiretoFechar('Sol, me manda o relatório do caixa agora para aprovar'), false);

(async () => {
  const chamadas = [];
  const enviadas = [];
  const governanca = [];
  const identificarOriginal = fin.identificarPessoa;
  fin.identificarPessoa = async () => ({ identificado: true, nome: 'Arthur' });
  try {
    const tratado = await abf.tratarPedidoDiretoFechamento({
      chatId: 'barra@g.us', senderPhone: '5521888888888', senderName: 'Arthur',
      body: 'Sol, me manda o relatório do caixa agora para aprovar', hasMedia: false,
      caixaGovernancaEpisode: { episode_id: 'ep.barra.' + 'a'.repeat(64) },
    }, {
      grupo: { unidade_id: 'unidade-barra', nome: 'Barra' },
      intencaoEstruturada: 'fechar_caixa',
      sendFn: async (_chatId, texto) => { enviadas.push(texto); return 'MSG-PREVIEW-NOVO'; },
      governanceFn: async (_event, eventType, details) => governanca.push({ eventType, details }),
      rpcFn: async (nome, args) => {
        chamadas.push({ nome, args });
        if (nome === 'sol_caixa_dados_abertura') return { ja_aberto: true, caixa_id_aberto: 'caixa-barra' };
        if (nome === 'sol_caixa_dados_fechamento') return {
          unidadeNome: 'Barra', data: '14/09/2026', saldoInicial: 312.80,
          cofreEntradas: [], cofreSaidas: [],
          vendasPorForma: { dinheiro: 0, pix: 1400, cartao: 550, cheque: 0, transferencia: 0 },
          detalhes: [], saldoFinal: 2262.80, conferidoPor: '',
        };
        if (nome === 'sol_caixa_pendencia_criar') return { ok: true };
        throw new Error('RPC inesperada: ' + nome);
      },
    });

    assert.strictEqual(tratado, true);
    assert.deepStrictEqual(chamadas.map((x) => x.nome), [
      'sol_caixa_dados_abertura', 'sol_caixa_dados_fechamento', 'sol_caixa_pendencia_criar',
    ]);
    assert(enviadas.some((x) => /FECHAMENTO DE CAIXA DE BARRA/.test(x)));
    assert(enviadas.some((x) => /Posso fechar agora/.test(x)));
    assert(governanca.some((x) => x.eventType === 'preview_sent'));
  } finally {
    fin.identificarPessoa = identificarOriginal;
  }
  console.log('Barra: relatório atual para aprovar usa fechamento determinístico — OK');
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
