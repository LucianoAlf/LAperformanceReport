#!/usr/bin/env node
'use strict';

// O preview foi criado pelo cron, portanto não existe janela conversacional.
// O "Pode" ainda deve resolver a pendência e abrir pela RPC determinística.
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const fin = require(path.join(root, 'vps/la-hq/sol/runtime/caixa-financeiro.cjs'));
const abf = require(path.join(root, 'vps/la-hq/sol/runtime/caixa-abertura-fechamento.cjs'));

(async () => {
  const chamadas = [];
  const enviadas = [];
  const governanca = [];
  const identificarOriginal = fin.identificarPessoa;
  fin.identificarPessoa = async () => ({ identificado: true, nome: 'Operadora Teste' });
  try {
    const tratado = await abf.tratarConfirmacao({
      chatId: 'recreio@g.us', senderId: '5521999999999@s.whatsapp.net',
      senderPhone: '5521999999999', senderName: 'Operadora', body: 'Pode',
      hasMedia: false, quotedMessageId: null,
      caixaGovernancaEpisode: { episode_id: 'ep1.teste.' + 'a'.repeat(64) },
    }, {
      sendFn: async (_chatId, texto) => { enviadas.push(texto); return 'MSG-RECIBO'; },
      governanceFn: async (_event, eventType, details) => { governanca.push({ eventType, details }); },
      temComprovantePendente: () => false,
      rpcFn: async (nome, args) => {
        chamadas.push({ nome, args });
        if (nome === 'sol_caixa_pendencia_aguardando') return {
          id: 'pend-abertura-1', tipo: 'abrir', unidade_id: 'unidade-recreio',
          data: '2026-09-11', idade_min: 1, preview_message_id: 'MSG-CRON',
        };
        if (nome === 'sol_caixa_abrir') return {
          ok: true, caixa_diario_id: 'caixa-1', saldo_inicial: 109.10,
        };
        if (nome === 'sol_caixa_pendencia_resolver') return { ok: true };
        throw new Error('RPC inesperada: ' + nome);
      },
    });

    assert.strictEqual(tratado, true);
    assert(chamadas.some((x) => x.nome === 'sol_caixa_abrir'));
    const resolveu = chamadas.find((x) => x.nome === 'sol_caixa_pendencia_resolver');
    assert(resolveu, 'pendência não foi resolvida');
    assert.strictEqual(resolveu.args.p_status, 'confirmado');
    assert(enviadas.some((x) => /Caixa aberto!/.test(x) && /R\$ 109,10/.test(x)));
    for (const tipo of ['approval_observed', 'write_applied', 'approval_consumed', 'receipt_sent', 'readback_failed']) {
      assert(governanca.some((x) => x.eventType === tipo), `evento de governança ausente: ${tipo}`);
    }

    // Caso real da Barra em 15/09: a abertura precisa ser recusada quando o
    // dia anterior segue aberto, mas a operadora deve receber o motivo real —
    // não o genérico "não consegui abrir".
    const recusadas = [];
    const recusou = await abf.tratarConfirmacao({
      chatId: 'barra@g.us', senderId: '5521888888888@s.whatsapp.net',
      senderPhone: '5521888888888', senderName: 'Arthur', body: 'Pode',
      hasMedia: false, quotedMessageId: 'MSG-ABERTURA-BARRA',
    }, {
      sendFn: async (_chatId, texto) => { recusadas.push(texto); return 'MSG-RECUSA'; },
      temComprovantePendente: () => false,
      rpcFn: async (nome) => {
        if (nome === 'sol_caixa_pendencia_aguardando') return {
          id: 'pend-abertura-barra', tipo: 'abrir', unidade_id: 'unidade-barra',
          data: '2026-09-15', idade_min: 1, preview_message_id: 'MSG-ABERTURA-BARRA',
        };
        if (nome === 'sol_caixa_abrir') return { ok: false, motivo: 'fechamento_pendente_dia_anterior' };
        if (nome === 'sol_caixa_pendencia_resolver') return { ok: true };
        throw new Error('RPC inesperada: ' + nome);
      },
    });
    assert.strictEqual(recusou, true);
    assert(recusadas.some((x) => /caixa de ontem ainda está aberto/i.test(x)));
    assert(recusadas.some((x) => /feche-o antes de abrir o de hoje/i.test(x)));
    assert(!recusadas.some((x) => /não consegui abrir/i.test(x)));

    // Se também há preview de lançamento, o "pode" seco pertence a ele. A
    // abertura só ganha prioridade quando a pessoa cita o card de abertura.
    const concorrentes = [];
    const cedeu = await abf.tratarConfirmacao({
      chatId: 'recreio@g.us', senderId: '5521999999999@s.whatsapp.net',
      senderPhone: '5521999999999', senderName: 'Operadora', body: 'Pode',
      hasMedia: false, quotedMessageId: null,
    }, {
      sendFn: async () => { throw new Error('não deveria responder'); },
      temComprovantePendente: () => true,
      rpcFn: async (nome) => {
        concorrentes.push(nome);
        if (nome === 'sol_caixa_pendencia_aguardando') return {
          id: 'pend-abertura-2', tipo: 'abrir', unidade_id: 'unidade-recreio',
          data: '2026-09-11', idade_min: 1, preview_message_id: 'MSG-CRON',
        };
        throw new Error('não deveria abrir com preview financeiro concorrente');
      },
    });
    assert.strictEqual(cedeu, false);
    assert.deepStrictEqual(concorrentes, ['sol_caixa_pendencia_aguardando']);
  } finally {
    fin.identificarPessoa = identificarOriginal;
  }
  console.log('abertura do cron: "Pode" resolve pela RPC determinística — OK');
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
