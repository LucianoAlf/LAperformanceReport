#!/usr/bin/env node
'use strict';

// "Sol, abre o caixa de hoje" fora do canário deve produzir somente a prévia
// determinística. Nenhuma escrita ocorre antes de um novo "pode" humano.
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const abf = require(path.join(root, 'vps/la-hq/sol/runtime/caixa-abertura-fechamento.cjs'));

(async () => {
  const chamadas = [];
  const enviadas = [];
  const governanca = [];
  const tratado = await abf.tratarPedidoDiretoAbertura({
    chatId: 'barra@g.us', senderPhone: '5521888888888', senderName: 'Arthur',
    body: 'Sol, abre o caixa de hoje', hasMedia: false,
    caixaGovernancaEpisode: { episode_id: 'ep.barra.' + 'a'.repeat(64) },
  }, {
    grupo: { unidade_id: 'unidade-barra', nome: 'Barra' },
    intencaoEstruturada: 'abrir_caixa',
    sendFn: async (_chat, texto) => { enviadas.push(texto); return 'MSG-ABERTURA'; },
    governanceFn: async (_event, eventType, details) => governanca.push({ eventType, details }),
    rpcFn: async (nome, args) => {
      chamadas.push({ nome, args });
      if (nome === 'sol_caixa_dados_abertura') return {
        unidadeNome: 'Barra', data: '15/09/2026', saldoInicial: 1562.80,
        ja_existe: false, ja_aberto: false,
      };
      if (nome === 'sol_caixa_pendencia_criar') return { ok: true };
      if (nome === 'sol_caixa_abrir') throw new Error('não pode escrever no preview');
      throw new Error('RPC inesperada: ' + nome);
    },
  });

  assert.strictEqual(tratado, true);
  assert.deepStrictEqual(chamadas.map((x) => x.nome), [
    'sol_caixa_dados_abertura', 'sol_caixa_pendencia_criar',
  ]);
  assert(enviadas.some((x) => /ABERTURA DE CAIXA DE BARRA/.test(x)));
  assert(enviadas.some((x) => /R\$ 1\.562,80/.test(x)));
  assert(enviadas.some((x) => /Responde \*pode\*/.test(x)));
  assert(governanca.some((x) => x.eventType === 'preview_sent'));
  assert(!governanca.some((x) => x.eventType === 'write_applied'));

  const jaAbertas = [];
  const repetido = await abf.tratarPedidoDiretoAbertura({
    chatId: 'barra@g.us', body: 'Sol, abre o caixa de hoje', hasMedia: false,
  }, {
    grupo: { unidade_id: 'unidade-barra', nome: 'Barra' },
    intencaoEstruturada: 'abrir_caixa',
    sendFn: async (_chat, texto) => { jaAbertas.push(texto); return 'MSG-JA-ABERTO'; },
    rpcFn: async (nome) => {
      if (nome === 'sol_caixa_dados_abertura') return { ja_existe: true, ja_aberto: true };
      throw new Error('não deveria criar pendência quando já está aberto');
    },
  });
  assert.strictEqual(repetido, true);
  assert(jaAbertas.some((x) => /já está aberto/i.test(x)));
  console.log('abertura direta: roteador -> preview -> novo pode, sem escrita — OK');
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
