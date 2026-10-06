#!/usr/bin/env node
'use strict';
// Caso real Recreio, 05-06/10/2026 (nomes trocados).
//
// 05/10 22:06  Vitória manda a foto do cupom com a legenda
//              "Compra de 3 pós de café e 3 de açúcar\nRetirada do caixa\nR$91,40 - dinheiro"
// 05/10 22:08  Sol: "✅ Lancei a saída… Retirada — R$ 91,40 (dinheiro) · Compra de pós de
//              café e de açúcar Retirada do caixa"  ← era o campo ALUNO (lixo da legenda)
//              banco: caixa_movimentacoes.descricao = "PG Semana Retirada"
//              fechamento: "R$ 91,40 - PG Semana Retirada". A ADM corrige à mão TODA vez.
// 06/10        a equipe conversa sobre isso e a Sol se mete 3x:
//              "Entendi que é saída de retirada/despesa, …" — inclusive lendo
//              "Descrição correta: R$91,40 Compra de…" (citando o FECHAMENTO) como
//              saída NOVA de R$ 91,40: um "pode" ali lançava o dinheiro duas vezes.
//
// 🔴 DEFEITO 1 — duas fontes de verdade para a descrição (texto e mídia), ambas
//    jogavam fora a frase quando ela tinha a palavra da categoria ("retirada").
// 🔴 DEFEITO 2 — texto sem valor/anexo e citação do que a Sol JÁ concluiu abriam
//    fluxo de lançamento.
const mod = require('./_alvo.cjs');

const CHAT = 'recreio-teste@g.us';
const UNIDADE = 'u-recreio-teste';
const VITORIA = '5521900000001';
const GERENTE = '5521900000002';
const LEGENDA = 'Compra de 3 pós de café e 3 de açúcar\nRetirada do caixa\nR$91,40 - dinheiro';
const DESC = 'Compra de 3 pós de café e 3 de açúcar';
const OCR_CUPOM = [
  'MERCADO EXEMPLO LTDA CNPJ 00.000.000/0001-00',
  'Documento Auxiliar da Nota Fiscal de Consumidor Eletronica',
  'CAFE PO 500G 3 UN 21,30 63,90',
  'ACUCAR 1KG 3 UN 9,17 27,50',
  'VALOR TOTAL R$ 91,40',
  'FORMA DE PAGAMENTO DINHEIRO 91,40',
].join('\n');
const FECHAMENTO = [
  '*FECHAMENTO DE CAIXA DE RECREIO*', '📆 05/10/2026', '',
  '💰 *Caixa Cofre Dinheiro - RECREIO*', '', 'Saldo inicial: *R$ 355,30*', '',
  '🔴 *Saida do dia:*', '- R$ 91,40 - PG Semana Retirada', '',
  '✅ *Saldo final caixa dia 05/10/2026:* R$ 263,90',
].join('\n');

function novo() {
  const enviadas = []; const ids = []; const logs = []; const saidas = []; const recebimentos = [];
  let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Recreio' } },
    sendFn: async (_c, t) => { enviadas.push(String(t)); const id = 'SOL' + (++seq); ids.push(id); return id; },
    ocrFn: async () => ({ text: OCR_CUPOM, status: 'ok' }),
    visaoFn: async () => ({ valor: 91.4, forma: 'dinheiro' }),
    // o modelo devolveu a legenda como "aluno" — foi o que vazou na confirmação real
    interpretarFn: async () => ({ categoria: 'outro', aluno: 'Compra de pós de café e de açúcar Retirada do caixa', competencia: null, forma: 'dinheiro' }),
    canonicaFn: async () => null, casarFn: async () => null, responsavelFn: async () => null,
    faturasMesFn: async () => null, pagadorFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Vitória' }),
    lancarFn: async (p) => { recebimentos.push(p); return { ok: true, movimentacao_id: 'MOVR', valor: Number(p.valor), forma: p.forma }; },
    lancarSaidaFn: async (p) => { saidas.push(p); return { ok: true, movimentacao_id: 'MOVS' + saidas.length, valor: Number(p.valor), forma: p.forma }; },
    log: (o) => logs.push(o),
  });
  return { h, enviadas, ids, logs, saidas, recebimentos };
}
let n = 0;
const msg = (h, body, extra = {}) => h.handle({ chatId: CHAT, senderPhone: VITORIA, senderId: VITORIA,
  messageId: 'M' + (++n), body, hasMedia: false, ...extra });
const ultimo = (a) => String(a[a.length - 1] || '');

(async () => {
  const falhas = [];
  const checar = (cond, m) => { if (!cond) falhas.push(m); };
  const d = mod._descricaoSaidaTexto;

  // ── 0. a função única ──────────────────────────────────────────────────────
  checar(typeof d === 'function', '_descricaoSaidaTexto precisa ser exportada (fonte única)');
  if (typeof d === 'function') {
    const casos = [
      [LEGENDA, 'retirada', DESC],
      [LEGENDA.replace(/\n/g, ' '), 'retirada', DESC],
      ['Retirada do caixa para compra de café R$ 20 dinheiro', 'retirada', 'Compra de café'],
      ['Retirada do caixa @61000000000000 @83000000000000', 'retirada', 'PG Semana Retirada'],
      ['Sol, retirada R$ 50 dinheiro', 'retirada', 'PG Semana Retirada'],
      ['', 'despesa', 'PG Semana Despesa'],
      // PG semana: formato antigo preservado (Mayra/CG 25/08; Jhon/CG 09/09)
      ['Sol, teve uma saída em dinheiro - PG segurança semana 25/08 R$100,00', 'seguranca', 'PG Semana Seguranca'],
      ['Sol, pagamento semanal do segurança - R$100,00 dinheiro', 'seguranca', 'PG Semana Seguranca'],
      ['Sol, saída em dinheiro R$100,00 pagamento semanal segurança', 'despesa', 'PG Semana Despesa - segurança'],
      ['saída seguranca R$ 100,00 dinheiro Pagamento semanal', 'seguranca', 'PG Semana Seguranca'],
    ];
    for (const [t, c, esp] of casos) {
      const got = d(t, c);
      checar(got === esp, `_descricaoSaidaTexto(${JSON.stringify(t)}, ${c}) = ${JSON.stringify(got)}, esperava ${JSON.stringify(esp)}`);
    }
  }

  // ── 1. foto + legenda: card, confirmação e banco com a MESMA descrição ─────
  const A = novo();
  await A.h.handle({ chatId: CHAT, senderPhone: VITORIA, senderId: VITORIA, messageId: 'FOTO1',
    body: LEGENDA, hasMedia: true, mediaType: 'image', mediaUrls: ['fake://cupom.jpg'] });
  const card = ultimo(A.enviadas);
  checar(/Sa[ií]da de caixa/i.test(card), `foto+legenda abre card de saída; veio: ${card.slice(0, 120)}`);
  checar(card.includes(DESC), `o card mostra a descrição que vai pro banco; veio: ${card.slice(0, 300)}`);
  await msg(A.h, 'Pode lançar', { quotedMessageId: A.ids[A.ids.length - 1] });
  checar(A.saidas.length === 1, `"pode" lança 1 saída; lançou ${A.saidas.length}`);
  checar(A.recebimentos.length === 0, 'nada vira recebimento');
  const confirmacao = A.enviadas.find((t) => /Lancei a sa[ií]da/.test(t)) || '';
  if (A.saidas[0]) {
    checar(A.saidas[0].descricao === DESC, `descrição gravada = descrição humana; veio ${JSON.stringify(A.saidas[0].descricao)}`);
    checar(!A.saidas[0].aluno, `saída não tem aluno; payload veio com ${JSON.stringify(A.saidas[0].aluno)}`);
    checar(Math.abs(Number(A.saidas[0].valor) - 91.4) < 0.01, `valor 91,40; veio ${A.saidas[0].valor}`);
  }
  checar(confirmacao.includes(DESC), `a confirmação mostra a mesma descrição; veio: ${confirmacao}`);
  checar(!/Retirada do caixa\./.test(confirmacao), 'a confirmação não repete a legenda-como-aluno');
  const confirmId = A.ids[A.enviadas.indexOf(confirmacao)];

  // ── 2. (a) citar o "✅ Lancei" explicando o problema → silêncio ───────────
  const antesA = A.enviadas.length;
  const ra = await msg(A.h, 'Quando tem alguma retirada de dinheiro no caixa, ela coloca aqui no grupo a descrição do que foi comprado, só que no caixa fica "pg semana retirada".',
    { quotedMessageId: confirmId, quotedBody: confirmacao });
  checar(A.enviadas.length === antesA, `citação do lançamento concluído: a Sol falou "${A.enviadas.slice(antesA).join(' | ')}" (${ra && ra.acao})`);
  checar(A.saidas.length === 1, 'citação do lançamento concluído não lança nada');
  // mesma citação, agora COM valor e sem falar a forma: não pode virar saída nova
  const antesA2 = A.enviadas.length;
  await msg(A.h, 'Essa retirada de R$ 91,40 ficou com a descrição errada no fechamento',
    { quotedMessageId: confirmId, quotedBody: confirmacao });
  checar(A.enviadas.length === antesA2, `citação do lançamento com valor: a Sol falou "${A.enviadas.slice(antesA2).join(' | ')}"`);
  checar(A.logs.some((l) => l.acao === 'citacao_concluido_da_sol_nao_abre_lancamento'),
    'a guarda de citação do concluído é que segura (não um acaso do fluxo)');
  await msg(A.h, 'pode');
  checar(A.saidas.length === 1, `"pode" depois da citação lançou de novo (${A.saidas.length}) — DUPLICIDADE`);

  // ── 3. (b) gerente cita o FECHAMENTO com valor → silêncio, sem card ───────
  const B = novo();
  const rb = await msg(B.h, 'Vi, bom diaaa! é que de novo vc fechou o caixa com a descrição da saída errada, confere a saída certinha pf\n\nDescrição correta: R$91,40 Compra de 3 pct pó de café e 3 de açúcar',
    { senderPhone: GERENTE, senderId: GERENTE, quotedMessageId: 'FECHAMENTO_DO_CRON', quotedBody: FECHAMENTO });
  checar(B.enviadas.length === 0, `citação do fechamento: a Sol falou "${B.enviadas.join(' | ')}" (${rb && rb.acao})`);
  checar(!B.h.temPendencia(CHAT), 'citação do fechamento não pode deixar card/pendência aberta');
  await msg(B.h, 'pode', { senderPhone: GERENTE, senderId: GERENTE });
  checar(B.saidas.length === 0, `um "pode" depois da citação do fechamento lançou ${B.saidas.length} saída(s) — DUPLICIDADE`);

  // ── 4. (c) texto sem valor e sem anexo → silêncio ──────────────────────────
  const C = novo();
  const rc1 = await msg(C.h, 'Compra de 3 pós de café e 3 de açúcar', { quotedMessageId: 'MSG_DO_DONO', quotedBody: 'Como deveria ficar?' });
  const rc2 = await msg(C.h, 'Retirada do caixa @61000000000000 @83000000000000');
  checar(C.enviadas.length === 0, `texto sem valor/anexo: a Sol falou "${C.enviadas.join(' | ')}" (${rc1 && rc1.acao}, ${rc2 && rc2.acao})`);
  checar(C.saidas.length === 0 && !C.h.temPendencia(CHAT), 'texto sem valor/anexo não abre fluxo');

  // ── 5. chamando a Sol pelo nome, sem valor → ainda pergunta o valor ───────
  const D = novo();
  await msg(D.h, 'Sol, saída de segurança dinheiro');
  checar(/falta o valor/i.test(ultimo(D.enviadas)), `"Sol, saída…" sem valor pergunta o valor; veio "${ultimo(D.enviadas)}"`);

  // ── 6. ditado com valor, sem citação → fluxo normal (fallback de descrição) ─
  const E = novo();
  await msg(E.h, 'Sol, pagamento semanal do segurança - R$100,00 dinheiro');
  checar(/Sa[ií]da de caixa/i.test(ultimo(E.enviadas)), 'ditado com valor abre o card');
  await msg(E.h, 'pode', { quotedMessageId: E.ids[E.ids.length - 1] });
  checar(E.saidas.length === 1 && E.saidas[0].descricao === 'PG Semana Seguranca',
    `PG semana segurança continua "PG Semana Seguranca"; veio ${JSON.stringify(E.saidas[0] && E.saidas[0].descricao)}`);

  if (falhas.length) {
    console.log('✗ saida-descricao-humana-e-conversa:');
    for (const f of falhas) console.log('  ✗ ' + f);
    process.exit(1);
  }
  console.log('✓ saida-descricao-humana-e-conversa: descrição única + Sol calada em conversa');
})().catch((e) => { console.log('✗ Error:', e && e.stack || e); process.exit(1); });
