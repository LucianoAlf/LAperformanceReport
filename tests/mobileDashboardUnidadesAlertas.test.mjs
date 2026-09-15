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

// A fonte dos dois mapas e o DESKTOP. Reescreve-los aqui seria uma TERCEIRA
// versao da regra: mudar a cor de `critico` no desktop deixaria a suite verde
// com as duas telas divergindo — que e exatamente o que este arquivo existe
// para impedir. Mesmo padrao dos testes dos 13 KPIs e dos 4 modais
// (tests/mobileDashboardTela.test.mjs).
const desktop = readFileSync(
  new URL('../src/components/App/Dashboard/DashboardPage.tsx', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');

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

// A frase do vazio sai do DESKTOP, como os mapas acima. O `catch` do fetch de
// alertas so faz console.error, entao `alertas` chega [] tanto quando nao ha
// alerta quanto quando a consulta falhou: sumir com o bloco tornaria os dois
// casos a MESMA tela — nada (CLAUDE.md, "Falha tem que ser diagnosticavel").
// O bloco de unidades, no mesmo commit, ja tinha escolhido o oposto.
const FRASES_DO_VAZIO = ['Tudo sob controle!', 'Nenhum alerta ativo no momento'];

test('lista vazia AFIRMA que esta vazia — a mesma frase do desktop, nao um bloco sumido', () => {
  for (const frase of FRASES_DO_VAZIO) {
    assert.ok(desktop.includes(frase), `a frase "${frase}" mudou no desktop — resincronizar as duas telas`);
  }
  assert.doesNotMatch(
    alertas,
    /return null/,
    'o bloco volta a sumir em silencio: "sem alerta" e "a consulta falhou" viram a mesma tela',
  );
});

test('as frases estao no ramo VAZIO do ternario — nao soltas, aparecendo sempre', () => {
  // Solta no arquivo, a frase apareceria tambem com alertas na tela, e o teste
  // acima aprovaria justamente o defeito que ele existe para pegar. Mesmo
  // padrao do ternario de resumoUnidades em tests/mobileDashboardTela.test.mjs.
  const ternario = alertas.match(/\{alertas\.length > 0 \? \(([\s\S]*?)\) : \(([\s\S]*?)\)\}/);
  assert.ok(ternario, 'nao achei o ternario de alertas.length — o bloco mudou de forma');
  const [, ramoComDados, ramoVazio] = ternario;
  assert.match(ramoComDados, /alertas\.map\(/, 'o ramo com dados nao renderiza a lista');
  for (const frase of FRASES_DO_VAZIO) {
    assert.ok(ramoVazio.includes(frase), `a frase "${frase}" nao esta no ramo vazio`);
    // Uma ocorrencia no ARQUIVO INTEIRO, nao so fora do ramo com dados: uma
    // copia solta ANTES do ternario nao esta em ramo nenhum, e passaria por
    // um assert que so olhasse os dois ramos — apareceria sempre, inclusive
    // com alertas na tela. (Medido: esta mutacao passava antes deste assert.)
    const ocorrencias = alertas.split(frase).length - 1;
    assert.equal(ocorrencias, 1, `a frase "${frase}" aparece ${ocorrencias}x — fora do ramo vazio ela aparece sempre`);
  }
});

test('cada alerta mostra titulo (descricao) e detalhe — os mesmos 2 campos do card do desktop', () => {
  assert.match(alertas, /\{alerta\.descricao\}/, 'alerta.descricao nao e renderizado (titulo do card)');
  assert.match(alertas, /\{alerta\.detalhe\}/, 'alerta.detalhe nao e renderizado (subtitulo do card)');
});

// Extrai o corpo de `const <nome>... = { ... };`.
//
// O `[^=]*` pula a anotacao de tipo do mobile
// (`: Record<Alerta['severidade'], { dot: string; text: string }>`), que tem
// chaves proprias; o fecho e o primeiro `};` — entrada interna fecha com `},`,
// nunca com `};`. As chaves sao escritas de forma diferente nos dois arquivos
// (o desktop cita 'CONTRATO_VENCENDO', o mobile nao), entao a aspa e opcional.
const RE_SEVERIDADE = /severidadeConfig[^=]*=\s*\{([\s\S]*?)\}\s*;/;
const RE_TIPO_ICONE = /tipoIcone[^=]*=\s*\{([\s\S]*?)\}\s*;/;
const RE_FALLBACK_ICONE = /tipoIcone\[alerta\.tipo_alerta\]\s*\|\|\s*'([^']*)'/;

function extrairCorpo(fonteTxt, re, nome, onde) {
  const m = fonteTxt.match(re);
  assert.ok(m, `nao achei o mapa ${nome} em ${onde} — a forma do mapa mudou`);
  return m[1];
}

function mapaDeObjetos(fonteTxt, onde) {
  const corpo = extrairCorpo(fonteTxt, RE_SEVERIDADE, 'severidadeConfig', onde);
  const saida = {};
  for (const [, chave, campos] of corpo.matchAll(/'?(\w+)'?:\s*\{([^}]*)\}/g)) {
    const obj = {};
    for (const [, campo, valor] of campos.matchAll(/(\w+):\s*'([^']*)'/g)) obj[campo] = valor;
    saida[chave] = obj;
  }
  // Extracao que devolve vazio tem de FALHAR ALTO: dois mapas vazios comparados
  // entre si passariam com ZERO pares conferidos — que e a forma de um teste
  // "verde" que nao verifica nada.
  assert.ok(Object.keys(saida).length > 0, `extrai ZERO severidades em ${onde}`);
  return saida;
}

function mapaDeStrings(fonteTxt, onde) {
  const corpo = extrairCorpo(fonteTxt, RE_TIPO_ICONE, 'tipoIcone', onde);
  const saida = {};
  for (const [, chave, valor] of corpo.matchAll(/'?([A-Z_]+)'?:\s*'([^']*)'/g)) saida[chave] = valor;
  assert.ok(Object.keys(saida).length > 0, `extrai ZERO tipos de alerta em ${onde}`);
  return saida;
}

test('cor por severidade sai do DESKTOP — mudanca la avisa aqui, em vez de aprovar duas versoes', () => {
  const noDesktop = mapaDeObjetos(desktop, 'DashboardPage');
  const noMobile = mapaDeObjetos(alertas, 'ListaAlertas');

  // A forma esperada do lado do desktop, declarada: se ela mudar, o teste
  // reprova dizendo o que mudou, em vez de passar comparando menos.
  assert.deepEqual(
    Object.keys(noDesktop).sort(),
    ['atencao', 'critico', 'informativo'],
    'o desktop mudou o conjunto de severidades — resincronizar as duas telas',
  );
  assert.deepEqual(Object.keys(noMobile).sort(), Object.keys(noDesktop).sort());

  // O mobile nao usa bg/border (o cartao dele tem fundo neutro); os campos
  // COMPARTILHADOS — os que pintam o ponto e o texto — tem de ser identicos.
  for (const severidade of Object.keys(noDesktop)) {
    for (const campo of ['dot', 'text']) {
      assert.ok(
        noDesktop[severidade][campo],
        `o desktop nao tem ${severidade}.${campo} — a forma do mapa mudou`,
      );
      assert.equal(
        noMobile[severidade][campo],
        noDesktop[severidade][campo],
        `${severidade}.${campo} diverge do desktop`,
      );
    }
  }
});

test('o fallback de icone e o mesmo do desktop', () => {
  const noDesktop = desktop.match(RE_FALLBACK_ICONE);
  assert.ok(noDesktop, 'nao achei o fallback de icone no desktop — a forma mudou');
  const noMobile = alertas.match(RE_FALLBACK_ICONE);
  assert.ok(noMobile, 'sumiu o fallback para tipo_alerta desconhecido');
  assert.equal(noMobile[1], noDesktop[1], 'o fallback de icone diverge do desktop');
});

test('cada chave de tipoIcone aponta para o emoji que o DESKTOP usa — mapa lido de la, nao reescrito aqui', () => {
  const noDesktop = mapaDeStrings(desktop, 'DashboardPage');
  const noMobile = mapaDeStrings(alertas, 'ListaAlertas');
  assert.equal(
    Object.keys(noDesktop).length,
    8,
    `o desktop mudou de numero de tipos de alerta (${Object.keys(noDesktop).length}) — reavaliar a tela mobile`,
  );
  assert.deepEqual(noMobile, noDesktop);
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
