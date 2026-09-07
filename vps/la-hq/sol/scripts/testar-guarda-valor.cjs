#!/usr/bin/env node
// TESTA A GUARDA DE VALOR CONTRA AS 213 MENSAGENS REAIS, ANTES DE INSTALAR.
//
// O replay achou 3 de 73 valores errados (4,1%) — 435,50 virou 4355, 464,40
// virou 4644, 450,00 virou 50. Um em cada 24 lancamentos, dois por fator de 10.
// Nao ha padrao (a hipotese do centavo quebrado foi derrubada: 14 acertos com
// centavo nao-zero), entao nao se conserta com prompt: conserta-se conferindo o
// numero contra o texto.
//
// 🔴 O RISCO DA GUARDA E O FALSO BLOQUEIO. Se ela recusar valor legitimo, o
//    fluxo passa a pedir valor que a pessoa ja mandou — pior que o defeito que
//    ela conserta. Por isso este teste mede as DUAS taxas sobre dado real:
//    pegou os 3 errados? recusou algum dos 70 certos?
//
// ⚠️ Ela aceita tres formas de "o valor esta no texto":
//      1. valor exato presente (com ou sem R$)
//      2. SOMA dos valores presentes — pagamento composto ("200 + 235,50")
//      3. valor presente em qualquer texto extra passado (OCR, quando houver)
//    Sem (2) ela reprovaria todo pagamento em partes, que e comum no caixa.
'use strict';
const fs = require('node:fs');

// ── a guarda ────────────────────────────────────────────────────────────────
function _numerosDoTexto(texto) {
  const t = String(texto || '');
  const achados = [];
  // com R$ (o caso comum) e sem R$ (a equipe escreve "mandei 435,50")
  for (const m of t.matchAll(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/gi)) {
    const bruto = m[1];
    // ⚠️ "12/09" e "3x" nao sao dinheiro; o \b e a ausencia de / ja filtram a
    //    maioria, mas numero inteiro pequeno sem R$ e ambiguo demais para
    //    contar como "o valor esta la".
    const temRS = /r\$/i.test(m[0]);
    const temDecimal = /,\d{1,2}$/.test(bruto);
    if (!temRS && !temDecimal) continue;
    const n = Number(bruto.replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(n) && n > 0) achados.push(n);
  }
  return achados;
}

function valorConfereComTexto(valor, ...textos) {
  if (valor == null) return { ok: true, motivo: 'sem_valor' };
  const alvo = Math.round(Number(valor) * 100);
  if (!Number.isFinite(alvo) || alvo <= 0) return { ok: false, motivo: 'valor_invalido' };
  for (const t of textos) {
    const ns = _numerosDoTexto(t);
    if (ns.some((n) => Math.round(n * 100) === alvo)) return { ok: true, motivo: 'exato' };
    if (ns.length >= 2) {
      const soma = ns.reduce((s, n) => s + n, 0);
      if (Math.round(soma * 100) === alvo) return { ok: true, motivo: 'soma' };
    }
  }
  return { ok: false, motivo: 'nao_esta_no_texto' };
}

// ── o teste ─────────────────────────────────────────────────────────────────
const replay = fs.readFileSync('/tmp/replay-v4-15ago.jsonl', 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l));
const textos = JSON.parse(fs.readFileSync(process.argv[2] || '/tmp/textos-15ago.json', 'utf8'));
const porId = new Map(textos.map((t) => [t.id, t.raw_text]));

let pegou = 0, escapou = 0, falsoBloqueio = 0, aprovouCerto = 0, semTexto = 0;
const detalhes = { pegou: [], escapou: [], falso: [] };

for (const x of replay) {
  const lv = x.legado_valor, vv = x.v4_valor;
  if (!vv) continue;
  const txt = porId.get(x.id);
  if (txt == null) { semTexto++; continue; }
  const g = valorConfereComTexto(vv, txt);
  const certo = lv ? Math.abs(vv * 100 - lv) < 2 : null;
  if (certo === false) { (g.ok ? (escapou++, detalhes.escapou) : (pegou++, detalhes.pegou)).push({ lv, vv, m: g.motivo }); }
  else if (certo === true) { (g.ok ? (aprovouCerto++, []) : (falsoBloqueio++, detalhes.falso)).push({ lv, vv, m: g.motivo, txt: String(txt).slice(0, 70) }); }
}

console.log('== GUARDA DE VALOR contra as mensagens reais ==\n');
console.log(`  🔴 valores ERRADOS que a guarda PEGOU:    ${pegou}`);
console.log(`  ⚠️  valores errados que ESCAPARAM:        ${escapou}`);
console.log(`  ✅ valores certos APROVADOS:              ${aprovouCerto}`);
console.log(`  🔴 valores certos BLOQUEADOS (falso):     ${falsoBloqueio}`);
if (semTexto) console.log(`  (sem texto para conferir: ${semTexto})`);
if (detalhes.pegou.length) {
  console.log('\n  pegou:');
  for (const p of detalhes.pegou) console.log(`    legado R$ ${(p.lv / 100).toFixed(2)} · V4 ${p.vv} · ${p.m}`);
}
if (detalhes.falso.length) {
  console.log('\n  🔴 FALSOS BLOQUEIOS (o risco real):');
  for (const p of detalhes.falso.slice(0, 10)) console.log(`    V4 ${p.vv} · "${p.txt}"`);
}
if (detalhes.escapou.length) {
  console.log('\n  escapou:');
  for (const p of detalhes.escapou) console.log(`    legado R$ ${(p.lv / 100).toFixed(2)} · V4 ${p.vv} · ${p.m}`);
}

module.exports = { valorConfereComTexto, _numerosDoTexto };
