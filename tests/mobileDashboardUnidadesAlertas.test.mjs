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

// Extrai o VALOR do objeto associado a uma chave especifica de
// `severidadeConfig` (ex.: "critico: { dot: 'bg-red-500', text: 'text-red-400' }"
// devolve "dot: 'bg-red-500', text: 'text-red-400'"). Isolar por chave — em
// vez de casar o objeto inteiro e procurar as 3 cores em qualquer lugar dele —
// e o que distingue "a cor certa" de "as cores certas, na severidade errada":
// um regex que so verifica presenca das 3 palavras no bloco inteiro passaria
// com as cores TROCADAS entre severidades (critico:blue, atencao:red,
// informativo:amber), que e uma inversao real de urgencia visual.
function extrairBlocoSeveridade(fonteTxt, chave) {
  const re = new RegExp(`\\b${chave}:\\s*\\{([^}]*)\\}`);
  const m = fonteTxt.match(re);
  return m ? m[1] : null;
}

test('cor por severidade repete a semantica do desktop — cada severidade com A SUA cor, nao so as 3 cores presentes em algum lugar do objeto', () => {
  const critico = extrairBlocoSeveridade(alertas, 'critico');
  const atencao = extrairBlocoSeveridade(alertas, 'atencao');
  const informativo = extrairBlocoSeveridade(alertas, 'informativo');
  assert.ok(critico, 'nao achei o bloco de config da severidade critico');
  assert.ok(atencao, 'nao achei o bloco de config da severidade atencao');
  assert.ok(informativo, 'nao achei o bloco de config da severidade informativo');

  assert.match(critico, /red/, 'critico nao usa a familia de cor vermelha do desktop');
  assert.doesNotMatch(critico, /amber|blue/, 'critico usa a cor de outra severidade — inversao de urgencia visual');

  assert.match(atencao, /amber/, 'atencao nao usa a familia de cor amber do desktop');
  assert.doesNotMatch(atencao, /red|blue/, 'atencao usa a cor de outra severidade — inversao de urgencia visual');

  assert.match(informativo, /blue/, 'informativo nao usa a familia de cor azul do desktop');
  assert.doesNotMatch(informativo, /red|amber/, 'informativo usa a cor de outra severidade — inversao de urgencia visual');
});

// Mesmo principio acima, para o mapa emoji-por-tipo: cada uma das 8 chaves do
// desktop (DashboardPage.tsx:328-337) precisa apontar para o SEU proprio
// emoji — nao apenas para "um emoji qualquer do conjunto", que passaria com
// os 8 pares embaralhados entre si.
function extrairEmojiDoTipo(fonteTxt, chave) {
  const re = new RegExp(`${chave}:\\s*'([^']*)'`);
  const m = fonteTxt.match(re);
  return m ? m[1] : null;
}

const EMOJI_POR_TIPO_NO_DESKTOP = {
  CONTRATO_VENCENDO: '📋',
  RENOVACOES_PENDENTES: '🔄',
  CONVERSAO_BAIXA: '📉',
  INADIMPLENCIA_ALTA: '💰',
  TICKET_CAINDO: '🎫',
  PROFESSOR_TURMA_BAIXA: '👨‍🏫',
  CHURN_ALTO: '📤',
  META_EM_RISCO: '🎯',
};

test('icone por tipo de alerta repete o mapa do desktop, com o mesmo fallback ⚠️', () => {
  assert.match(alertas, /tipoIcone\[alerta\.tipo_alerta\]/, 'o icone nao e resolvido por alerta.tipo_alerta');
  assert.match(alertas, /\|\|\s*'⚠️'/, 'sumiu o fallback ⚠️ para tipo_alerta desconhecido (mesmo do desktop)');
});

test('cada uma das 8 chaves de tipoIcone aponta para o SEU emoji do desktop — nao emojis embaralhados entre tipos', () => {
  for (const [chave, emojiEsperado] of Object.entries(EMOJI_POR_TIPO_NO_DESKTOP)) {
    const emojiReal = extrairEmojiDoTipo(alertas, chave);
    assert.equal(emojiReal, emojiEsperado, `a chave ${chave} nao aponta para o emoji ${emojiEsperado} do desktop`);
  }
});

test('badge de quantidade aparece quando quantidade > 1 — mesma condicao do desktop (DashboardPage.tsx:349-353)', () => {
  // Sem badge de quantidade, um alerta repetido (ex.: 5 contratos vencendo)
  // parece um unico caso isolado — perda de informacao real, nao so estetica.
  assert.match(
    alertas,
    /alerta\.quantidade > 1[\s\S]{0,200}\{alerta\.quantidade\}/,
    'nao achei o badge condicional de quantidade (quantidade > 1 seguido do valor renderizado)'
  );
});

test('nome da unidade aparece em cada alerta — sem ele, a visao consolidada nao diz de qual unidade e o alerta (DashboardPage.tsx:358-360)', () => {
  assert.match(alertas, /\{alerta\.unidade_nome\}/, 'alerta.unidade_nome nao e renderizado');
});
