#!/usr/bin/env node
'use strict';

// Recreio, 28/09/2026 09:20 — Pix de R$ 402,50 com a legenda "Parcela do mês de
// Setembro da aluna … - R$402,50". A leitura acertou (pix, 402.5) e a Sol respondeu
// "o valor total que li não confere com o que está escrito", duas vezes.
//
// Raiz 1: o roteador devolve JSON (`"valor_total": 402.5`) e o código fazia
//   parseBRMoney(String(402.5)) → "402.5" com ponto de MILHAR → 4025. A guarda
//   procurava 4025 na legenda e recusava o valor certo. Todo centavo terminado em
//   zero caía nisso. O "R$ 2.034,90 virou 20.349" que a guarda atribuía ao modelo
//   era este mesmo defeito.
// Raiz 2: o agente mandou a competência como "Setembro" e o Core compara
//   "MM/YYYY" — a parcela paga não foi encontrada ("nenhuma_fatura_aberta").
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mod = require('./_alvo.cjs');

// --- Raiz 1 ---------------------------------------------------------------
assert.strictEqual(mod.parseBRMoney(String(402.5)), 4025, 'pré-condição: o leitor brasileiro lê "402.5" como milhar');
assert.strictEqual(mod.valorConfereComTexto(mod.parseBRMoney(String(402.5)), 'Parcela de Setembro - R$402,50').ok, false,
  'pré-condição: o caminho antigo recusava o valor certo');

for (const [entrada, esperado] of [[402.5, 402.5], ['402.5', 402.5], ['402.50', 402.5], [2034.9, 2034.9],
  ['402,50', 402.5], ['1.500', 1500], ['R$ 1.397,00', 1397], [null, null], [0, null], ['abc', null]]) {
  assert.strictEqual(mod.valorDoModelo(entrada), esperado, `valorDoModelo(${JSON.stringify(entrada)})`);
}
assert.strictEqual(mod.valorConfereComTexto(mod.valorDoModelo(402.5),
  'Parcela do mês de Setembro da aluna Fulana de Tal - R$402,50').ok, true, 'o valor do caso real passa na guarda');
assert.strictEqual(mod.valorConfereComTexto(mod.valorDoModelo(4025), 'R$402,50').ok, false,
  'a guarda continua pegando valor que NÃO está no texto');

// Nenhum número vindo de modelo pode voltar a passar pelo leitor brasileiro.
const fonte = fs.readFileSync(process.env.SOL_CAIXA_CJS
  || path.join(__dirname, '..', '..', 'vps', 'la-hq', 'sol', 'runtime', 'caixa-financeiro.cjs'), 'utf8');
assert.ok(!/parseBRMoney\(String\((?:o|it)\.valor/.test(fonte),
  'número de JSON de modelo convertido por parseBRMoney(String(...)) — use valorDoModelo');

// --- Raiz 2 ---------------------------------------------------------------
for (const [entrada, esperado] of [['Setembro', '09/2026'], ['setembro de 2025', '09/2025'], ['09/2026', '09/2026'],
  ['9/26', '09/2026'], ['2026-10', '10/2026'], ['2026-10-01', '10/2026'], ['', null]]) {
  assert.strictEqual(mod.normalizarCompetenciaV4(entrada), esperado, `normalizarCompetenciaV4(${JSON.stringify(entrada)})`);
}
assert.strictEqual(mod.normalizarCompetenciaV4('lixo'), 'lixo', 'irreconhecível segue como veio: o Core recusa, nunca vira outro mês');
const env = mod.montarEnvelopeV4({ intencao: 'lancamento_por_texto', valor_total: 402.5, forma: 'pix',
  itens: [{ aluno: 'Fulana de Tal', categorias: ['parcela'], competencias: ['Setembro'] }] });
assert.strictEqual(env.ok, true);
assert.deepStrictEqual(env.envelope.itens[0].competencias, ['09/2026'], 'o envelope chega ao Core no formato que ele compara');

console.log('v4: valor do modelo e competência normalizados — OK');
