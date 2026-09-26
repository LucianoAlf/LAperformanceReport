#!/usr/bin/env node
'use strict';

// FINANCEIRO da Barra, 26/09/2026 17:21–17:24: a Kailane chamou a Sol uma vez
// ("Sol, abre o caixa de novo?") e as CINCO mensagens seguintes dela foram para o
// agente (log da ponte: chamada + 5x janela_ativa): "Ih", "Queria mandar um
// comprovante", "Espero?", "Sol não to falando ctg não", "Kkkk…". A Sol respondeu
// "Pois é 😕", depois uma lista de instruções, depois "Entendi — fico quieta" — e
// mesmo assim a janela continuou aberta.
//
// Três defeitos na régua do grupo, provados aqui com a política REAL:
// 1. a janela se RENOVAVA a cada mensagem humana: bastava a pessoa continuar
//    conversando com os colegas para a Sol continuar "na conversa";
// 2. "não tô falando com você" não fechava a janela — e, por citar "Sol",
//    reabria como chamada;
// 3. reação sem pedido ("Ih", "kkkk", emoji) virava turno do agente.
const assert = require('assert');
const mod = require('./_alvo.cjs');
const { createGroupEngagementPolicy } = mod.groupEngagement();

const CHAT = 'barra@g.us';
const KAILANE = '228475130654911@lid';
const ARTHUR = '4475523698943@lid';
const JANELA = 3 * 60 * 1000;
const t0 = Date.parse('2026-09-26T20:21:25Z');
const seg = (s) => t0 + s * 1000;

function nova() {
  return createGroupEngagementPolicy({ gruposQueRespondem: [CHAT], janelaMs: JANELA });
}
const falar = (p, senderId, texto, agora) => p.decidir({ chatId: CHAT, texto, mentionedIds: [], identidadesProprias: [], senderId, agora });

// --- a conversa de hoje -------------------------------------------------------
{
  const p = nova();
  assert.strictEqual(falar(p, KAILANE, 'Sol, abre o caixa de novo?', seg(0)).motivo, 'chamada');
  p.registrarRespostaDaSol({ chatId: CHAT, agora: seg(34) });

  const ih = falar(p, KAILANE, 'Ih', seg(45));
  assert.strictEqual(ih.responder, false, '"Ih" não é pedido: ' + JSON.stringify(ih));
  assert.strictEqual(ih.motivo, 'reacao_sem_pedido');

  // pergunta de verdade, logo depois da resposta da Sol: continua valendo
  assert.strictEqual(falar(p, KAILANE, 'Queria mandar um comprovante', seg(89)).responder, true);
  p.registrarRespostaDaSol({ chatId: CHAT, agora: seg(118) });

  const dispensa = falar(p, KAILANE, 'Sol não to falando ctg não', seg(119));
  assert.strictEqual(dispensa.responder, false, 'dispensa não pode ir ao agente');
  assert.strictEqual(dispensa.motivo, 'dispensada');

  const kkk = falar(p, KAILANE, 'Kkkkkkkkkkkkkkkkkkkkkkkkkkk', seg(160));
  assert.strictEqual(kkk.responder, false, 'depois da dispensa, nada vai ao agente');
  assert.strictEqual(kkk.motivo, 'standby');

  assert.strictEqual(falar(p, ARTHUR, 'Para de falar se não vai cagar tudo kailane', seg(170)).responder, false);
}

// --- a janela conta a partir da ÚLTIMA RESPOSTA DA SOL, não da última fala humana ---
{
  const p = nova();
  falar(p, KAILANE, 'Sol, quanto entrou hoje?', seg(0));
  p.registrarRespostaDaSol({ chatId: CHAT, agora: seg(10) });
  // a pessoa segue conversando (com os colegas) a cada minuto
  assert.strictEqual(falar(p, KAILANE, 'e o pix da manhã entrou?', seg(70)).responder, true);
  // a Sol ainda não respondeu essa; a próxima fala vem depois de a janela vencer
  const tarde = falar(p, KAILANE, 'vou almoçar e já volto', seg(10 + 181));
  assert.strictEqual(tarde.responder, false, 'fala humana não pode estender a janela sozinha');
}

// --- chamar de novo reabre; agradecimento continua com cortesia ---------------
{
  const p = nova();
  falar(p, KAILANE, 'Sol, abre o caixa', seg(0));
  p.registrarRespostaDaSol({ chatId: CHAT, agora: seg(5) });
  const ok = falar(p, KAILANE, 'obrigada sol', seg(20));
  assert.strictEqual(ok.responder, false);
  assert.strictEqual(ok.cortesia, true);
  assert.strictEqual(falar(p, KAILANE, 'Sol, e agora fecha?', seg(3600)).motivo, 'chamada');
}

// --- resposta curta a uma pergunta da Sol NÃO é reação: "sim", "ok", "2" passam ---
{
  const p = nova();
  falar(p, KAILANE, 'Sol, lança esse pix?', seg(0));
  p.registrarRespostaDaSol({ chatId: CHAT, agora: seg(5) });
  for (const r of ['sim', 'ok', '2', 'pix', 'não']) {
    assert.strictEqual(falar(p, KAILANE, r, seg(10)).responder, true, `"${r}" é resposta, não reação`);
  }
  for (const r of ['kkkk', 'rsrs', '😂😂', 'ih', 'eita', 'hahaha', '👍']) {
    assert.strictEqual(falar(p, KAILANE, r, seg(12)).responder, false, `"${r}" é reação`);
  }
}

// --- dispensa: formas naturais fecham; falar DA Sol com colega também não chama ---
{
  for (const frase of [
    'Sol não to falando ctg não',
    'não é com você sol',
    'sol, fica quieta',
    'Sol para de responder',
    'não tô falando com você',
    'nao estou falando contigo',
  ]) {
    const p = nova();
    falar(p, KAILANE, 'Sol, abre o caixa', seg(0));
    p.registrarRespostaDaSol({ chatId: CHAT, agora: seg(5) });
    const d = falar(p, KAILANE, frase, seg(10));
    assert.strictEqual(d.responder, false, `"${frase}" deveria dispensar`);
    assert.strictEqual(d.motivo, 'dispensada', `"${frase}" -> ${d.motivo}`);
    assert.strictEqual(falar(p, KAILANE, 'e o pix?', seg(20)).responder, false, `janela deveria fechar após "${frase}"`);
  }
  // "para" dentro de outra frase não é dispensa
  const p = nova();
  assert.strictEqual(falar(p, KAILANE, 'Sol, para quando é o fechamento?', seg(0)).motivo, 'chamada');
}

console.log('grupo: janela ancorada na resposta da Sol + dispensa + reação sem pedido — OK');
