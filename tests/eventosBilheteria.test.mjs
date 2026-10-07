/**
 * Bilheteria do recital (M9) — espelho testavel das regras que o banco tambem aplica.
 *
 * O que estes testes travam:
 *  - TODOS pagam o preco cobrado (meia) — sem checkbox, sem meia parcial;
 *  - o pacote e automatico: o MAIOR desconto que a quantidade habilita, nunca um pior;
 *  - lugar ocupado = cortesia + venda viva (pendente conta ate ser cobrada/cancelada);
 *  - convidado sem nome nasce com placeholder — a fila da porta nao pode travar.
 *
 * Errar isso produz: troco errado no caixa, familia sentando em lugar vendido duas
 * vezes, ou recepcionista sem saber o nome de quem entrou.
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const lib = await (async () => {
  const { code } = await esbuild.transform(readFileSync('src/lib/eventos.ts', 'utf8'), {
    loader: 'ts',
    format: 'esm',
  });
  const arquivo = path.join(mkdtempSync(path.join(tmpdir(), 'evt-bil-')), 'eventos.mjs');
  writeFileSync(arquivo, code);
  return import(pathToFileURL(arquivo).href);
})();

const { simularOrcamentoVenda, vagasLivresDoBloco, nomeConvidadoPlaceholder } = lib;

const pacotes = [
  { id: 1, nome: '3+', quantidade_minima: 3, quantidade_maxima: null, desconto_pct: 10 },
  { id: 2, nome: '6+', quantidade_minima: 6, quantidade_maxima: null, desconto_pct: 20 },
];

test('orcamento: quantidade x preco cobrado, sem pacote quando nao atinge o minimo', () => {
  const o = simularOrcamentoVenda(50, 2, pacotes);
  assert.equal(o.valorBase, 100);
  assert.equal(o.pacote, null);
  assert.equal(o.descontoPct, 0);
  assert.equal(o.valorFinal, 100);
});

test('orcamento: o melhor pacote aplicavel ganha (6+ com 20%, nao 3+ com 10%)', () => {
  const o = simularOrcamentoVenda(50, 7, pacotes);
  assert.equal(o.valorBase, 350);
  assert.equal(o.pacote?.id, 2);
  assert.equal(o.valorFinal, 280);
});

test('orcamento: pacote respeita o teto (quantidade_maxima)', () => {
  const faixa = [{ id: 3, nome: 'familia', quantidade_minima: 4, quantidade_maxima: 6, desconto_pct: 15 }];
  const dentro = simularOrcamentoVenda(50, 5, faixa);
  const fora = simularOrcamentoVenda(50, 7, faixa);
  assert.equal(dentro.pacote?.id, 3);
  assert.equal(dentro.valorFinal, 212.5);
  assert.equal(fora.pacote, null);
  assert.equal(fora.valorFinal, 350);
});

test('orcamento: sem preco cadastrado = zero, nunca NaN na tela', () => {
  const o = simularOrcamentoVenda(null, 4, pacotes);
  assert.equal(o.valorBase, 0);
  assert.equal(o.valorFinal, 0);
  assert.ok(Number.isFinite(o.valorFinal));
});

test('orcamento: arredonda centavo igual ao round() do Postgres', () => {
  // 3 x 33.33 = 99.99 com 10% = 89.991 -> 89.99
  const o = simularOrcamentoVenda(33.33, 3, pacotes);
  assert.equal(o.valorBase, 99.99);
  assert.equal(o.valorFinal, 89.99);
});

test('vagas: cortesia e venda pendente ocupam lugar; capacidade nula = sem teto', () => {
  assert.equal(vagasLivresDoBloco({ capacidade: 100, cortesias: 30, vendidos: 41 }), 29);
  assert.equal(vagasLivresDoBloco({ capacidade: null, cortesias: 30, vendidos: 41 }), null);
  assert.equal(vagasLivresDoBloco({ capacidade: 10, cortesias: 8, vendidos: 4 }), -2);
});

test('placeholder: "Convidado N de <comprador>" — editavel depois, nunca vazio', () => {
  assert.equal(nomeConvidadoPlaceholder('Ana Silva', 2), 'Convidado 2 de Ana Silva');
  assert.equal(nomeConvidadoPlaceholder('  Ana  ', 1), 'Convidado 1 de Ana');
});
