#!/usr/bin/env node
'use strict';

// Recreio, 02/10/2026 14:50 BRT — retirada para depósito de R$ 1.000,00
// (20 cédulas de R$ 50, comprovante Banco24Horas). Legenda:
//   "Retirada para depósito / Valor: 1.000 - dinheiro / Retirada"
// A Sol publicou "Saída de caixa — PAGAMENTO (saída) R$ 2,00".
//
// Cadeia provada com o módulo vivo e o OCR real da imagem (sem gravar nada):
//   1. extrairValor(legenda) = null — "Valor: 1.000" sem "R$" não era dinheiro;
//      a legenda nem competiu com a imagem;
//   2. o OCR leu "QTDE NOTAS: 020" como "R$ 02" e o "R$" do total como "Ro";
//      o primeiro "R$" > 0 venceu: parseBRMoney("02") = 2;
//   3. o modo "solto" lia "1.000" como 1 e "1 mil" como 1 — o mesmo erro
//      esperava no "pode, 1.000" (conf.valor vence o valor do card).
//
// Este teste prova a correção por INVARIANTE (gerador determinístico de
// valores × formatos pt-BR) e por frase real, e prova o protocolo: conflito
// entre legenda e comprovante, ou leitura de baixa confiança, vira pergunta;
// nada é gravado antes de um "pode" com valor.
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
process.env.SOL_CAIXA_V3_LEDGER_MODE = process.env.SOL_CAIXA_V3_LEDGER_MODE || 'production';
const path = require('path');
const mod = require('./_alvo.cjs');
const executor = require(process.env.SOL_CAIXA_TOOL_EXECUTOR_CJS
  || path.join(__dirname, '..', '..', 'vps', 'la-hq', 'sol', 'runtime', 'caixa-tool-executor.cjs'));

const falhas = [];
const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

// ── gerador determinístico (mulberry32) ─────────────────────────────────────
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const milhar = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
function formatos(centavos) {
  const inteiro = Math.floor(centavos / 100);
  const cent = String(centavos % 100).padStart(2, '0');
  const f = [
    `R$ ${milhar(inteiro)},${cent}`, `R$${milhar(inteiro)},${cent}`, `R$ ${inteiro},${cent}`,
    `${milhar(inteiro)},${cent} reais`, `Valor: ${milhar(inteiro)},${cent}`, `valor: R$ ${milhar(inteiro)},${cent}`,
  ];
  if (centavos % 100 === 0) {
    f.push(`R$ ${milhar(inteiro)}`, `${milhar(inteiro)} reais`, `Valor: ${milhar(inteiro)}`, `Valor: ${inteiro}`);
    if (inteiro % 1000 === 0) f.push(`${inteiro / 1000} mil`, `R$ ${inteiro / 1000} mil`, `${inteiro / 1000} mil reais`);
    if (inteiro % 100 === 0 && inteiro % 1000 !== 0 && inteiro > 1000) {
      f.push(`${Math.floor(inteiro / 1000)},${(inteiro % 1000) / 100} mil`.replace(/,(\d)0? mil/, ',$1 mil'));
    }
  }
  return f;
}

// ── 1. invariante: todo valor escrito num formato pt-BR inequívoco volta igual ─
{
  const r = rng(20261002);
  const fixos = [1, 50, 100, 1000, 1500, 10000, 100000, 2034.9, 402.5, 387, 1722, 0.5];
  const amostra = fixos.map((v) => Math.round(v * 100));
  for (let i = 0; i < 400; i++) {
    const escala = [100, 10000, 1000000, 100000000][i % 4];
    amostra.push(1 + Math.floor(r() * escala * 100));
  }
  let casos = 0;
  for (const c of amostra) {
    const v = c / 100;
    for (const frase of formatos(c)) {
      casos++;
      const lido = mod.extrairValor(frase);
      if (lido !== v) { falhas.push(`invariante: extrairValor(${JSON.stringify(frase)}) = ${lido}, esperado ${v}`); continue; }
      const solto = mod.extrairValor(frase, { allowBare: true });
      if (solto !== v) falhas.push(`invariante solto: ${JSON.stringify(frase)} = ${solto}, esperado ${v}`);
      // a mesma cifra dentro de uma aprovação ("pode, <valor>"): a gramática do
      // "pode" pode RECUSAR a frase (falha fechada), mas se aprovar, o valor é exato.
      const p = mod.casarPode('pode, ' + frase.replace(/^valor:\s*/i, ''));
      if (p.pode && p.valor !== v) falhas.push(`invariante pode: "pode, ${frase}" = ${p.valor}, esperado ${v}`);
      if (falhas.length > 20) break;
    }
  }
  console.log(`invariante pt-BR: ${casos} frases geradas`);
}

// ── 2. invariante: token ambíguo nunca vira dinheiro, em nenhum sinal ─────────
for (const amb of ['02', '020', '007', '1.0', '1,000', '1.000.00', '12.3456', '1,2,3']) {
  checar(mod.lerNumeroMonetarioBR(amb) === null, `ambíguo "${amb}" virou ${mod.lerNumeroMonetarioBR(amb)}`);
  for (const frase of [`R$ ${amb}`, `${amb} reais`, `Valor: ${amb}`, `pode, ${amb}`]) {
    const v = mod.extrairValor(frase, { allowBare: true });
    checar(v === null, `ambíguo dentro de "${frase}" virou ${v}`);
  }
}
// Zero à esquerda com decimal continua dinheiro; e número de data/hora/parcela não.
checar(mod.extrairValor('R$ 0,50') === 0.5, 'R$ 0,50');
checar(mod.extrairValor('parcela 09/2026', { allowBare: true }) === null, 'competência não é valor');
checar(mod.extrairValor('às 14:34', { allowBare: true }) === null, 'hora não é valor');
checar(mod.extrairValor('3x no cartão', { allowBare: true }) === null, 'parcelas não são valor');

// ── 3. frases do incidente e da equipe ────────────────────────────────────────
const LEGENDA = 'Retirada para depósito\nValor: 1.000 - dinheiro\nRetirada';
for (const [frase, esperado, opts] of [
  [LEGENDA, 1000],
  ['Sol o valor da retirada foi R$1.000', 1000],
  ['1.000', 1000, { allowBare: true }], ['1.500', 1500, { allowBare: true }], ['10.000', 10000, { allowBare: true }],
  ['1 mil', 1000], ['R$1.000,00', 1000], ['1 mil e 500', 1500], ['mil reais', 1000], ['1,5 mil', 1500],
]) {
  const v = mod.extrairValor(frase, opts || {});
  checar(v === esperado, `frase ${JSON.stringify(frase)} = ${v}, esperado ${esperado}`);
}

// As formas que a Sol ensina ("pode, R$ X") e as respostas curtas da equipe.
for (const [frase, esperado] of [['pode, R$ 1.000', 1000], ['pode, 1.000', 1000], ['pode 1.000,00', 1000],
  ['pode, R$ 1.000,00', 1000], ['pode, R$1.500', 1500], ['pode, 10.000', 10000]]) {
  const p = mod.casarPode(frase);
  checar(p.pode === true && p.valor === esperado, `"${frase}" deveria aprovar com ${esperado}; veio ${JSON.stringify(p)}`);
}

// ── 4. invariante da arbitragem ───────────────────────────────────────────────
{
  const r = rng(7);
  for (let i = 0; i < 300; i++) {
    const h = (1 + Math.floor(r() * 500000)) / 100;
    let c = (1 + Math.floor(r() * 500000)) / 100;
    if (Math.round(c * 100) === Math.round(h * 100)) c += 1;
    const igual = mod.arbitrarValorComprovante({ humano: h, comprovante: h });
    checar(igual.valor === h && !igual.conflito, `arbitragem igual ${h}`);
    const virg = mod.arbitrarValorComprovante({ humano: h, comprovante: Math.round(h * 100) });
    checar(virg.valor === h, `vírgula perdida ${h}`);
    if (Number.isInteger(c) && c === Math.round(h * 100)) continue;
    const conf = mod.arbitrarValorComprovante({ humano: h, comprovante: c });
    checar(conf.valor === null && conf.conflito && conf.conflito.legenda === h && conf.conflito.comprovante === c,
      `conflito ${h}×${c} deveria perguntar; veio ${JSON.stringify(conf)}`);
    const baixa = mod.arbitrarValorComprovante({ comprovante: c, comprovanteBaixaConfianca: true });
    checar(baixa.valor === null && baixa.baixaConfianca, `baixa confiança ${c} deveria perguntar`);
    const so = mod.arbitrarValorComprovante({ comprovante: c });
    checar(so.valor === c, `só comprovante ${c}`);
  }
}

// ── 5. tool-executor usa o mesmo leitor ──────────────────────────────────────
checar(executor.textoContemValor(LEGENDA, 1000) === true, 'tool: "Valor: 1.000" contém 1000');
checar(executor.textoContemValor('retirada de 1 mil', 1000) === true, 'tool: "1 mil" contém 1000');
checar(executor.textoContemValor(LEGENDA, 1) === false, 'tool: "1.000" NÃO contém 1');
checar(executor.textoContemValor('QTDE NOTAS: 020', 20) === false, 'tool: "020" não é dinheiro');

// ── 6. ponta a ponta no handler real (fakes de E/S) ──────────────────────────
const CHAT = '5521900000000-1000000000@g.us';
const UNIDADE = '00000000-0000-4000-8000-000000000001';
const AUTOR = '5521900000001';
// Estrutura do OCR real do Banco24Horas, com nomes/contas fictícios: o "R$" do
// total saiu "Ro" e a quantidade de cédulas saiu "R$ 02".
const OCR_B24H = [
  'BANCO24HORAS', 'DEPOSITO EM DINHEIRO', 'AGENCIA: 0000 HORA 14.34.24',
  'FAVORECIDO: FULANO DE TAL CONTA CORRENTE: 0000000-0',
  'NSU: 1234 Ro > 1.000,00', 'a 50 N Ss: 020', 'PEA Uck N R$ 02',
  'SE FAZER DEPOSITO EM BANCO24HORAS ACESSE BANCO24HORAS.COM.BR',
].join('\n');
const OCR_CONFLITO = 'BANCO24HORAS\nDEPOSITO EM DINHEIRO\nValor do deposito R$ 2.000,00\nNSU: 1234';
const OCR_SO_IMAGEM = 'Comprovante Pix\nValor R$ 350,00\nPara ESCOLA DE MUSICA';
const OCR_AMBIGUO = 'Comprovante\n1.250,00\n80,00\nNSU 99881';

function novo(ocrTexto, overrides = {}) {
  const enviadas = []; const ids = []; const logs = []; const lancados = []; const saidas = [];
  let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Recreio' } },
    sendFn: async (_c, t) => { enviadas.push(t); const id = 'MSG' + (++seq); ids.push(id); return id; },
    ocrFn: async () => ({ text: ocrTexto, status: 'ok', file_bytes: 142811 }),
    visaoFn: async () => null,
    interpretarFn: async () => null,
    canonicaFn: async () => null, casarFn: async () => null, responsavelFn: async () => null,
    faturasMesFn: async () => null, pagadorFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Equipe Teste' }),
    classificarCorrecaoFn: async () => null,
    lancarFn: async (p) => { lancados.push(p); return { ok: true, movimentacao_id: 'R' + lancados.length, valor: p.valor }; },
    lancarSaidaFn: async (p) => { saidas.push(p); return { ok: true, movimentacao_id: 'S' + saidas.length, valor: p.valor }; },
    log: (o) => logs.push(o),
    ...overrides,
  });
  return { h, enviadas, ids, logs, lancados, saidas };
}
const ultimo = (a) => String(a[a.length - 1] || '');
const midia = (body, id = 'IMG1') => ({ chatId: CHAT, senderPhone: AUTOR, messageId: id, body,
  hasMedia: true, mediaType: 'image', mediaUrls: ['fake://b24h.jpg'] });
const texto = (body, id, extra = {}) => ({ chatId: CHAT, senderPhone: AUTOR, messageId: id, body, hasMedia: false, ...extra });

(async () => {
  // 6a. o incidente: legenda e comprovante concordam em 1.000 → card certo, nada gravado
  const A = novo(OCR_B24H);
  await A.h.handle(midia(LEGENDA));
  const cardA = ultimo(A.enviadas);
  console.log('card incidente:', cardA.split('\n').filter(Boolean).slice(0, 3).join(' | '));
  checar(/Saída de caixa/.test(cardA), 'incidente: card de saída');
  checar(/R\$\s*1\.000,00/.test(cardA), 'incidente: card com R$ 1.000,00');
  checar(!/R\$\s*2,00/.test(cardA), 'incidente: R$ 2,00 não pode aparecer');
  checar(/retirada/i.test(cardA), 'incidente: categoria retirada');
  checar(A.saidas.length === 0 && A.lancados.length === 0, 'incidente: nada gravado antes do pode');
  await A.h.handle(texto('pode', 'P1', { quotedMessageId: A.ids[A.ids.length - 1] }));
  checar(A.saidas.length === 1 && Number(A.saidas[0].valor) === 1000,
    `incidente: o pode grava uma saída de 1000; veio ${JSON.stringify(A.saidas.map((s) => s.valor))}`);

  // 6b. conflito legenda × comprovante → pergunta; "pode" seco não grava
  const B = novo(OCR_CONFLITO);
  await B.h.handle(midia(LEGENDA, 'IMG2'));
  const cardB = ultimo(B.enviadas);
  console.log('card conflito:', cardB.split('\n').filter(Boolean).slice(0, 4).join(' | '));
  checar(/R\$\s*1\.000,00/.test(cardB) && /R\$\s*2\.000,00/.test(cardB), 'conflito: card mostra os dois valores');
  checar(/valor certo/i.test(cardB), 'conflito: card pergunta o valor certo');
  checar(!/Posso lançar no caixa de hoje/.test(cardB), 'conflito: card não convida o pode seco');
  checar(B.logs.some((l) => l.acao === 'valor_conflito_legenda_comprovante'), 'conflito: log estruturado');
  await B.h.handle(texto('pode', 'P2', { quotedMessageId: B.ids[B.ids.length - 1] }));
  checar(B.saidas.length === 0, 'conflito: "pode" seco não grava');
  await B.h.handle(texto('pode, R$ 1.000', 'P3', { quotedMessageId: B.ids[0] }));
  checar(B.saidas.length === 1 && Number(B.saidas[0].valor) === 1000,
    `conflito: "pode, R$ 1.000" grava 1000; veio ${JSON.stringify(B.saidas.map((s) => s.valor))}`);

  // 6c. card de saída com valor errado: a correção ditada vale também para saída
  const C = novo(OCR_CONFLITO);
  await C.h.handle(midia('Retirada para depósito em dinheiro', 'IMG3'));
  checar(/R\$\s*2\.000,00/.test(ultimo(C.enviadas)), 'correção: card nasce com o valor da imagem');
  const rC = await C.h.handle(texto('Sol, o valor é R$ 1.000', 'T3', { quotedMessageId: C.ids[0] }));
  checar(rC && rC.acao === 'preview_valor_corrigido', `correção de saída deveria remontar; veio ${rC && rC.acao}`);
  checar(/R\$\s*1\.000,00/.test(ultimo(C.enviadas)), 'correção: card remontado com R$ 1.000,00');
  checar(C.saidas.length === 0, 'correção: nada gravado');

  // 6d. valor só na imagem → usa a imagem
  const D = novo(OCR_SO_IMAGEM);
  await D.h.handle(midia('Retirada em dinheiro', 'IMG4'));
  checar(/R\$\s*350,00/.test(ultimo(D.enviadas)), 'só imagem: card com R$ 350,00');

  // 6e. só imagem e leitura de baixa confiança (dois valores sem rótulo) → pergunta
  const E = novo(OCR_AMBIGUO);
  await E.h.handle(midia('Retirada em dinheiro', 'IMG5'));
  const cardE = ultimo(E.enviadas);
  checar(/com segurança/.test(cardE) && /valor certo/i.test(cardE), 'baixa confiança: pergunta o valor');
  checar(!/R\$\s*1\.250,00|R\$\s*80,00/.test(cardE.split('\n').slice(0, 4).join('\n')), 'baixa confiança: não chuta valor');

  // 6f. card sem valor completado com número solto "1.000" vira 1000, não 1
  const F = novo(OCR_AMBIGUO);
  await F.h.handle(midia('Retirada em dinheiro', 'IMG6'));
  await F.h.handle(texto('1.000', 'T6'));
  checar(/R\$\s*1\.000,00/.test(ultimo(F.enviadas)), `completar com "1.000" = R$ 1.000,00; veio ${ultimo(F.enviadas).slice(0, 80)}`);

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.slice(0, 30).forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — valor pt-BR determinístico; conflito e baixa confiança perguntam');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
