import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// O working tree deste repo guarda .tsx em CRLF no Windows; normalizar deixa
// os regex abaixo previsíveis independente do fim de linha (padrão já usado
// em tests/dashboardDadosContrato.test.mjs).
const cartao = readFileSync(new URL('../src/mobile/telas/dashboard/CartaoUnidade.tsx', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');
const alertas = readFileSync(new URL('../src/mobile/telas/dashboard/ListaAlertas.tsx', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

test('a tabela de 5 colunas virou cartao — sem <table> no mobile', () => {
  assert.doesNotMatch(cartao, /<table|<thead|<tbody/, 'tabela do desktop vazou para o mobile');
});

test('os 2 numeros inteiros aparecem RENDERIZADOS (dados.<campo> dentro de {}), nao so mencionados no arquivo', () => {
  // `cartao.includes('alunos_ativos')` passaria com um comentario ou um nome
  // de variavel morto contendo a palavra — sem provar que o valor E EXIBIDO.
  // Ancorar em "{dados.<campo>}" prova que e' uma expressao JSX de fato lida
  // pelo React, nao so uma substring solta no arquivo.
  for (const campo of ['alunos_ativos', 'alunos_pagantes']) {
    const re = new RegExp(`\\{dados\\.${campo}\\}`);
    assert.match(cartao, re, `dados.${campo} nao aparece como expressao JSX renderizada`);
  }
});

test('os 2 valores monetarios passam por formatCurrency(dados.<campo>) — nao por toLocaleString', () => {
  // O teste original do brief so confere que "formatCurrency(" aparece em
  // ALGUM lugar do arquivo — uma implementacao que formata ticket_medio com
  // formatCurrency e faturamento_previsto com toLocaleString(), ou vice-versa,
  // passaria por ele sem que ninguem notasse a mistura. Aqui cada campo
  // monetario e conferido individualmente, e a ausencia de toLocaleString e
  // exigida no arquivo inteiro.
  for (const campo of ['ticket_medio', 'faturamento_previsto']) {
    const re = new RegExp(`formatCurrency\\(dados\\.${campo}\\)`);
    assert.match(cartao, re, `dados.${campo} nao passa por formatCurrency(...)`);
  }
  assert.doesNotMatch(cartao, /toLocaleString/, 'dinheiro formatado por toLocaleString solto, fora de formatCurrency');
});

test('lista de alertas some quando nao ha alerta — nao mostra caixa vazia', () => {
  assert.match(alertas, /alertas\.length === 0[\s\S]{0,80}return null/);
});

test('o guard de lista vazia vem ANTES da renderizacao — nao e um trecho morto depois do map', () => {
  // Sem isto, um "alertas.length === 0 ... return null" dentro de um bloco
  // inalcancavel (ex.: `if (false) { ... }`) satisfaria o teste anterior sem
  // que o componente de fato deixasse de renderizar quando a lista e vazia.
  const posGuard = alertas.search(/alertas\.length === 0[\s\S]{0,80}return null/);
  const posMap = alertas.search(/alertas\.map\(/);
  assert.ok(posGuard >= 0 && posMap >= 0, 'nao achei o guard e/ou o .map(...) no arquivo');
  assert.ok(posGuard < posMap, 'o guard de lista vazia vem depois do .map — nao protege a renderizacao');
});

test('cada alerta mostra titulo (descricao) e detalhe — os mesmos 2 campos do card do desktop', () => {
  assert.match(alertas, /\{alerta\.descricao\}/, 'alerta.descricao nao e renderizado (titulo do card)');
  assert.match(alertas, /\{alerta\.detalhe\}/, 'alerta.detalhe nao e renderizado (subtitulo do card)');
});

test('cor por severidade repete a semantica do desktop — 3 severidades, 3 cores distintas', () => {
  // O desktop (DashboardPage.tsx) usa red/amber/blue para critico/atencao/
  // informativo. Checar so "existe uma classe de cor" passaria com as 3
  // severidades pintadas da MESMA cor — o que muda a leitura visual entre as
  // duas telas (a regra que o brief da task pede para nao quebrar).
  const configMatch = alertas.match(/critico:[\s\S]*?atencao:[\s\S]*?informativo:[\s\S]{0,200}/);
  assert.ok(configMatch, 'nao achei um mapa de config com as 3 chaves de severidade, na ordem critico/atencao/informativo');
  const bloco = configMatch[0];
  assert.match(bloco, /red/, 'severidade critico nao usa a familia de cor vermelha do desktop');
  assert.match(bloco, /amber/, 'severidade atencao nao usa a familia de cor amber do desktop');
  assert.match(bloco, /blue/, 'severidade informativo nao usa a familia de cor azul do desktop');
});

test('icone por tipo de alerta repete o mapa do desktop, com o mesmo fallback ⚠️', () => {
  // Igual ao teste de cor acima: sem checar o FALLBACK, uma implementacao que
  // sempre mostra o mesmo emoji fixo (ignorando tipo_alerta) passaria por um
  // assert.match solto em "tipo_alerta" — aqui a expressao de lookup e o
  // fallback default sao exigidos juntos.
  assert.match(alertas, /tipoIcone\[alerta\.tipo_alerta\]/, 'o icone nao e resolvido por alerta.tipo_alerta');
  assert.match(alertas, /\|\|\s*'⚠️'/, 'sumiu o fallback ⚠️ para tipo_alerta desconhecido (mesmo do desktop)');
});
