#!/usr/bin/env node
'use strict';

// A ponte pergunta "esta mensagem chama a Sol?" ANTES de escolher o caminho do
// caixa (ferramentas × automático). A pergunta não pode mexer na janela de
// conversa: quem decide de verdade é a política mais abaixo, uma vez só.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ge = require(path.resolve(__dirname, '../../vps/la-hq/sol/runtime/group-engagement.cjs'));
const CHAT = 'cg@g.us';

function politica() {
  return ge.createGroupEngagementPolicy({ gruposQueRespondem: new Set([CHAT]), janelaMs: 180000 });
}

test('ditado sem "Sol" não é chamada: vai ao caminho automático, não ao agente', () => {
  const p = politica();
  const r = p.prever({ chatId: CHAT, texto: 'PG pix parcela 09/2026 aluno Noah Peres - Kids CG R$456,00', senderId: 'a' });
  assert.equal(r.responder, false);
});

test('chamada é prevista sem abrir janela; a decisão real abre', () => {
  const p = politica();
  const e = { chatId: CHAT, texto: 'Sol, lança a parcela do João R$ 300,00 pix', senderId: 'a', agora: 1000 };
  assert.equal(p.prever(e).responder, true);
  assert.equal(p.ativoAte.has(CHAT), false, 'prever não pode abrir janela');
  assert.equal(p.decidir(e).responder, true);
  assert.equal(p.ativoAte.has(CHAT), true);
});

test('dispensa prevista não fecha a janela; só a decisão real fecha', () => {
  const p = politica();
  p.decidir({ chatId: CHAT, texto: 'Sol, oi', senderId: 'a', agora: 1000 });
  const disp = { chatId: CHAT, texto: 'Sol não tô falando com você', senderId: 'a', agora: 2000 };
  assert.equal(p.prever(disp).responder, false);
  assert.equal(p.ativoAte.has(CHAT), true, 'prever não pode fechar janela');
  p.decidir(disp);
  assert.equal(p.ativoAte.has(CHAT), false);
});

test('janela ativa do mesmo remetente: continuação prevista como chamada', () => {
  const p = politica();
  p.decidir({ chatId: CHAT, texto: 'Sol, quanto entrou hoje?', senderId: 'a', agora: 1000 });
  assert.equal(p.prever({ chatId: CHAT, texto: 'e em pix?', senderId: 'a', agora: 2000 }).responder, true);
  assert.equal(p.prever({ chatId: CHAT, texto: 'e em pix?', senderId: 'b', agora: 2000 }).responder, false);
});
