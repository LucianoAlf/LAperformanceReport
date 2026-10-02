#!/usr/bin/env node
'use strict';

// Recreio, 02/10/2026: o Alf pediu que retirada E sangria sejam lidas como
// SAÍDA do caixa. "Retirada" já era vocabulário de saída; "sangria" — o nome
// de balcão para tirar dinheiro do caixa — não era: "sangria do caixa 1.000"
// não virava categoria de saída. Mesmo vocabulário, mesma categoria
// (`retirada`), sem nova categoria no banco.
//
// Prova: vocabulário puro + ditado ponta a ponta (card de saída com o valor
// certo, nada gravado antes do "pode") + fronteiras que NÃO são saída.
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
process.env.SOL_CAIXA_V3_LEDGER_MODE = process.env.SOL_CAIXA_V3_LEDGER_MODE || 'production';
const mod = require('./_alvo.cjs');

const falhas = [];
const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

// ── vocabulário ─────────────────────────────────────────────────────────────
const SAIDA = [
  ['Retirada para depósito Valor: 1.000 - dinheiro', 'retirada'],
  ['sangria do caixa 1.000', 'retirada'],
  ['Sol, fiz uma sangria de R$ 1.000,00 em dinheiro', 'retirada'],
  ['Sangria R$ 500', 'retirada'],
  ['sangrias da semana 1.500', 'retirada'],
];
for (const [frase, cat] of SAIDA) {
  checar(mod.categoriaSaidaDoTexto(frase) === cat,
    `categoriaSaidaDoTexto(${JSON.stringify(frase)}) = ${mod.categoriaSaidaDoTexto(frase)}, esperado ${cat}`);
}
// Fronteiras: recebimento de aluno nunca é saída.
const NAO_SAIDA = [
  'parcela do João R$ 350 pix',
  'passaporte da Ana 1.000 dinheiro',
  'mensalidade de outubro 1.000',
];
for (const frase of NAO_SAIDA) {
  checar(mod.categoriaSaidaDoTexto(frase) == null,
    `categoriaSaidaDoTexto(${JSON.stringify(frase)}) deveria ser null, veio ${mod.categoriaSaidaDoTexto(frase)}`);
}

// ── ditado ponta a ponta ────────────────────────────────────────────────────
const CHAT = '5521900000000-recreio@g.us';
const UNIDADE = '95553e96-971b-4590-a6eb-0201d013c14d';
function novo() {
  const enviadas = [];
  let entrada = null; let saida = null; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Recreio' } },
    sendFn: async (_c, t) => { enviadas.push(t); return 'S' + (++seq); },
    identidadeFn: async () => ({ identificado: true, nome: 'Pessoa Teste' }),
    duplicataFn: async () => ({ ja_lancado: false }),
    lancarFn: async (p) => { entrada = p; return { ok: true, movimentacao_id: 'E1', valor: Number(p.valor), forma: p.forma, categoria: p.categoria }; },
    lancarSaidaFn: async (p) => { saida = p; return { ok: true, movimentacao_id: 'X1', valor: Number(p.valor), forma: p.forma, categoria: p.categoria }; },
    rotearV4Fn: async () => null,
    log: () => {},
  });
  return { h, enviadas, get entrada() { return entrada; }, get saida() { return saida; } };
}

(async () => {
  for (const [frase, valor] of [
    ['Sol, fiz uma sangria de R$ 1.000,00 em dinheiro', 1000],
    ['Sol, sangria do caixa 1.000 dinheiro', 1000],
    ['Sol, retirada para depósito 1 mil em dinheiro', 1000],
  ]) {
    const A = novo();
    await A.h.handle({ chatId: CHAT, senderPhone: '5521900000001', messageId: 'M1', body: frase, hasMedia: false });
    const card = String(A.enviadas[A.enviadas.length - 1] || '');
    checar(/Saída de caixa/.test(card), `${JSON.stringify(frase)}: card não é de saída: ${card.slice(0, 160)}`);
    checar(/R\$\s*1\.000,00/.test(card), `${JSON.stringify(frase)}: card sem R$ 1.000,00: ${card.slice(0, 200)}`);
    checar(/retirada/i.test(card), `${JSON.stringify(frase)}: card sem categoria retirada`);
    checar(!A.entrada && !A.saida, `${JSON.stringify(frase)}: gravou antes do pode`);
    await A.h.handle({ chatId: CHAT, senderPhone: '5521900000001', messageId: 'M2', body: 'pode', hasMedia: false, quotedMessageId: 'S' + A.enviadas.length });
    checar(!A.entrada, `${JSON.stringify(frase)}: virou ENTRADA`);
    checar(A.saida && Number(A.saida.valor) === valor && A.saida.categoria === 'retirada',
      `${JSON.stringify(frase)}: saída gravada errada: ${JSON.stringify(A.saida && { v: A.saida.valor, c: A.saida.categoria })}`);
  }

  // Fail-closed: dois números sem sinal monetário não viram valor por chute.
  {
    const B = novo();
    await B.h.handle({ chatId: CHAT, senderPhone: '5521900000001', messageId: 'N1',
      body: 'Sol, sangria do caixa 20 notas de 50 dinheiro', hasMedia: false });
    const msg = String(B.enviadas[B.enviadas.length - 1] || '');
    checar(/falta o valor/i.test(msg), `dois números: deveria perguntar o valor, veio: ${msg.slice(0, 160)}`);
    checar(!B.entrada && !B.saida, 'dois números: gravou algo');
  }

  if (falhas.length) {
    console.error('VERMELHO sangria-retirada-saida:\n  - ' + falhas.join('\n  - '));
    process.exit(1);
  }
  console.log('VERDE sangria-retirada-saida: vocabulário, fronteiras e ditado ponta a ponta');
})().catch((e) => { console.error('ERRO:', e && e.stack); process.exit(1); });
