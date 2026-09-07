#!/usr/bin/env node
// GUARDA DETERMINISTICA DE VALOR NO ROTEADOR V4 (07/09/2026).
//
// O replay sobre 213 mensagens reais de 15/08 achou **3 de 73 valores errados
// (4,1%)**: 435,50 virou 4355, 464,40 virou 4644, 450,00 virou 50. Um em cada
// 24 lancamentos, dois deles por fator de 10.
//
// 🔴 NAO SE CONSERTA COM PROMPT. A hipotese "centavo nao-zero sempre quebra"
//    foi TESTADA E DERRUBADA — ha 14 acertos com centavo quebrado, incluindo
//    1836,28 / 1248,16 / 0,99, todos exatos. Nao existe padrao: e extracao
//    ocasional errada. Contra isso o remedio e deterministico — conferir o
//    numero contra o texto — nao estatistico.
//
// ✅ MEDIDO ANTES DE INSTALAR, sobre as mesmas 213 mensagens:
//      pegou 2 dos 3 valores errados (os dois de fator 10)
//      ZERO falso bloqueio em 70 valores corretos   ← o numero que decide
//      escapou 1: 450,00 -> 50, porque o "50" ESTA no texto
//    Erro de valor cai de 4,1% para 1,4%, e o residual erra para MENOS, que o
//    preview humano pega.
//
// 🔴 O RISCO DA GUARDA E O FALSO BLOQUEIO, nao o escape. Recusar valor
//    legitimo faz a Sol pedir de novo o que a pessoa ja mandou — pior que o
//    defeito que ela conserta. Por isso ela aceita tres formas de "esta no
//    texto": valor exato, SOMA dos valores presentes (pagamento composto,
//    "200 + 235,50"), e presenca em texto extra (OCR, quando houver).
//
// ⚠️ Ela ANULA o valor, nao descarta a decisao: a intencao pode estar certa e
//    so o numero nao ser confiavel. Sem valor, o fluxo pergunta — que e o
//    comportamento seguro.
//
// ⚠️ Numero inteiro pequeno SEM "R$" nao conta como presenca ("3x", "12/09").
//    Sem esse filtro, qualquer valor bateria com qualquer texto e a guarda
//    viraria enfeite.
'use strict';
const fs = require('node:fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-guarda-valor-v4-07set.cjs <caixa-financeiro.cjs>'); process.exit(2); }
let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

if (src.includes('valorConfereComTexto')) {
  console.log('guarda de valor ja instalada — nada a fazer');
  process.exit(0);
}

// ── 1. as duas funcoes, antes do roteador ───────────────────────────────────
const ANC_FN = 'function rotearMensagemV4(texto, contexto, { timeout = 30000 } = {}) {';
const FUNCS = `// ── GUARDA DETERMINISTICA DE VALOR ──────────────────────────────────────────
// Ver o cabecalho do patch _patch-guarda-valor-v4-07set.cjs: 4,1% dos valores
// extraidos pelo roteador saiam errados, dois deles por fator de 10, e sem
// padrao que prompt resolva. Medida sobre 213 mensagens reais: pega 2 dos 3
// erros e faz ZERO falso bloqueio em 70 valores corretos.
function _numerosDoTexto(texto) {
  const t = String(texto || '');
  const achados = [];
  for (const m of t.matchAll(/(?:r\\$\\s*)?(\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:,\\d{1,2})?)/gi)) {
    // ⚠️ inteiro pequeno sem "R$" nao conta: "3x", "12/09" e numero de sala
    //    fariam qualquer valor "bater" e a guarda viraria enfeite.
    if (!/r\\$/i.test(m[0]) && !/,\\d{1,2}$/.test(m[1])) continue;
    const n = Number(String(m[1]).replace(/\\./g, '').replace(',', '.'));
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
    // pagamento composto: "200 + 235,50" para um total de 435,50. Sem isto a
    // guarda reprovaria pagamento em partes, que e comum no caixa.
    if (ns.length >= 2) {
      const soma = ns.reduce((s, n) => s + n, 0);
      if (Math.round(soma * 100) === alvo) return { ok: true, motivo: 'soma' };
    }
  }
  return { ok: false, motivo: 'nao_esta_no_texto' };
}

${ANC_FN}`;

if (src.split(ANC_FN).length - 1 !== 1) {
  console.error('ANCORA da assinatura do roteador: esperava 1');
  process.exit(1);
}
src = src.replace(ANC_FN, FUNCS);

// ── 2. o roteador confere antes de devolver ─────────────────────────────────
const DE = `        resolve({
          intencao: String(o.intencao || 'nada'),
          aluno_nome: (o.aluno_nome && String(o.aluno_nome).trim()) || null,
          valor: o.valor != null ? parseBRMoney(String(o.valor)) : null,`;
const PARA = `        const _v = o.valor != null ? parseBRMoney(String(o.valor)) : null;
        // 🔴 O valor so passa se estiver NO TEXTO. Ver a guarda acima: sem
        //    isto, 1 em cada 24 lancamentos sai com valor errado, dois por
        //    fator de 10. Anula o valor, NAO a decisao — a intencao pode estar
        //    certa e o fluxo pergunta o numero, que e o caminho seguro.
        const _g = valorConfereComTexto(_v, texto);
        resolve({
          intencao: String(o.intencao || 'nada'),
          aluno_nome: (o.aluno_nome && String(o.aluno_nome).trim()) || null,
          valor: _g.ok ? _v : null,
          valor_recusado: _g.ok ? null : { valor: _v, motivo: _g.motivo },`;

if (src.split(DE).length - 1 !== 1) {
  console.error('ANCORA do resolve do roteador: esperava 1');
  process.exit(1);
}
src = src.replace(DE, PARA);

fs.writeFileSync(alvo, src);
console.log(`  ok  guarda instalada (${antes} -> ${src.length} bytes)`);
