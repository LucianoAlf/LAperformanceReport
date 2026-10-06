#!/usr/bin/env node
'use strict';

// Membro novo num grupo financeiro oficial avisa o Alf (28/09/2026, pedido do
// Alfredo): desde a 20260928200000, estar no grupo basta para pedir à Sol
// abrir/fechar/lançar. Só avisa — não remove nem bloqueia.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { criarAlertaMembroNovo, formatarTelefone } = require('../../vps/la-hq/sol/runtime/group-membro-novo.cjs');
const BARRA = 'barra@g.us';
const GRUPOS = { [BARRA]: { unidade_id: 'u-barra', nome: 'Barra' } };
const ALF = '5521999990000@s.whatsapp.net';

function montar(extra = {}) {
  const envios = []; const logs = [];
  const alerta = criarAlertaMembroNovo({
    gruposFinanceiros: GRUPOS, destino: ALF,
    enviar: async (jid, texto) => { envios.push({ jid, texto }); return 'M'; },
    resolverTelefone: (jid) => (jid === '123456@lid' ? '5521988887777' : null),
    nomeDe: async (tel) => ({ '5521911112222': 'Kailane', '5521933334444': 'Arthur' })[tel] || null,
    log: (e) => logs.push(e), ...extra,
  });
  return { alerta, envios, logs };
}

test('entrada num grupo financeiro avisa o Alf com quem entrou e quem adicionou', async () => {
  const { alerta, envios } = montar();
  const r = await alerta.tratar({ id: BARRA, action: 'add', participants: ['5521911112222@s.whatsapp.net'],
    author: '5521933334444@s.whatsapp.net' });
  assert.equal(r.acao, 'avisado');
  assert.equal(envios.length, 1);
  assert.equal(envios[0].jid, ALF);
  assert.match(envios[0].texto, /grupo financeiro — Barra/);
  assert.match(envios[0].texto, /\*Kailane\* \(\+55 21 91111-2222\)/);
  assert.match(envios[0].texto, /Adicionado por Arthur/);
  assert.match(envios[0].texto, /abrir\/fechar o caixa/);
});

test('pessoa fora da governança aparece como não cadastrada; LID é resolvido pelo mapa', async () => {
  const { alerta, envios } = montar();
  await alerta.tratar({ id: BARRA, action: 'add', participants: [{ id: '123456@lid' }] });
  assert.match(envios[0].texto, /\+55 21 98888-7777 _\(não cadastrado na governança\)_/);
  assert.match(envios[0].texto, /sem registro de quem adicionou/);
});

test('grupo que não é financeiro, saída e promoção não avisam', async () => {
  const { alerta, envios } = montar();
  assert.equal((await alerta.tratar({ id: 'outro@g.us', action: 'add', participants: ['5521911112222@s.whatsapp.net'] })).motivo, 'grupo_nao_financeiro');
  assert.equal((await alerta.tratar({ id: BARRA, action: 'remove', participants: ['5521911112222@s.whatsapp.net'] })).motivo, 'nao_e_entrada');
  assert.equal((await alerta.tratar({ id: BARRA, action: 'promote', participants: ['5521911112222@s.whatsapp.net'] })).motivo, 'nao_e_entrada');
  assert.equal(envios.length, 0);
});

test('o mesmo evento repetido pelo WhatsApp não gera dois avisos', async () => {
  const { alerta, envios } = montar();
  const ev = { id: BARRA, action: 'add', participants: ['5521911112222@s.whatsapp.net'] };
  await alerta.tratar(ev, 1000);
  await alerta.tratar(ev, 5000);
  assert.equal(envios.length, 1);
});

test('sem destino configurado: só registra; falha de envio não derruba', async () => {
  const semDestino = montar({ destino: null });
  await semDestino.alerta.tratar({ id: BARRA, action: 'add', participants: ['5521911112222@s.whatsapp.net'] });
  assert.equal(semDestino.envios.length, 0);
  assert.ok(semDestino.logs.some((l) => l.step === 'grupo_financeiro_membro_novo_sem_destino'));
  const falha = montar({ enviar: async () => { throw new Error('offline'); } });
  const r = await falha.alerta.tratar({ id: BARRA, action: 'add', participants: ['5521911112222@s.whatsapp.net'] });
  assert.equal(r.acao, 'sem_envio');
  assert.ok(falha.logs.some((l) => l.step === 'grupo_financeiro_membro_novo_envio_erro'));
});

test('formatação de telefone', () => {
  assert.equal(formatarTelefone('5521911112222'), '+55 21 91111-2222');
  assert.equal(formatarTelefone(''), 'número não identificado');
});

test('a ponte escuta group-participants.update com try/catch e destino por env', () => {
  const ponte = fs.readFileSync(path.resolve(__dirname, '../../vps/la-hq/sol/runtime/bridge.js'), 'utf8');
  const i = ponte.indexOf("sock.ev.on('group-participants.update'");
  assert.ok(i > 0, 'handler registrado');
  const corpo = ponte.slice(i, i + 400);
  assert.match(corpo, /try \{ await alertaMembroNovo\(\)\.tratar\(update\); \}/);
  assert.match(corpo, /catch \(e\)/);
  assert.match(ponte, /SOL_CAIXA_ALERTA_MEMBRO_PARA/);
  assert.match(ponte, /import groupMembroNovo from '\.\/group-membro-novo\.cjs'/);
});
