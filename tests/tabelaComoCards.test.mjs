// A tabela vira CARD no celular.
//
// 🔴 De onde veio: o Hugo, olhando o app no telefone — *"as tabelas na versão
// mobile é melhor virar card, não é não? Porque se continuar usando tabela,
// tem que ficar arrastando para o lado. A tabela ela expande muito
// horizontalmente, e em dispositivo móvel a gente não tem espaço
// horizontal."* Ele está certo, e a razão é estrutural: a largura mínima de
// uma tabela é a soma das colunas, então ela não encolhe — num telefone
// sempre estoura. O card troca o eixo (coluna vira linha rotulada) e cresce
// para baixo, que é o eixo que sobra.
//
// São 85 arquivos com `<table>` no app. A conversão age sobre o ELEMENTO,
// dentro do shell mobile, e por isso alcança todas — inclusive as que ainda
// não existem. O que este teste trava é o contrato dessa conversão.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(RAIZ, 'src/index.css'), 'utf8');
const hook = readFileSync(join(RAIZ, 'src/mobile/useTabelaComoCards.ts'), 'utf8');
const layout = readFileSync(join(RAIZ, 'src/mobile/MobileLayout.tsx'), 'utf8');

function semComentarios(fonte) {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('🔴 a conversão só existe abaixo de 1024px — o desktop continua com tabela', () => {
  const bloco = /@media \(max-width: 1023px\) \{([\s\S]*?)\n\}/.exec(css);
  assert.ok(bloco, 'o bloco de tabela-vira-card perdeu a media query');
  assert.match(
    bloco[1],
    /table:not\(\[data-cards='nao'\]\)\s*\{[^}]*display:\s*block/,
    'a tabela precisa virar bloco DENTRO da media query, nunca fora',
  );
  // A regra não pode escapar do media query: qualquer `display: block` em
  // `table` fora dele reescreveria a tabela do computador.
  const foraDaMedia = css.replace(/@media \(max-width: 1023px\) \{[\s\S]*?\n\}/g, '');
  assert.doesNotMatch(
    semComentarios(foraDaMedia),
    /table[^{]*\{[^}]*display:\s*block/,
    'regra de tabela-como-bloco vazou para fora da media query',
  );
});

test('a conversão é escopada ao shell mobile, não ao documento inteiro', () => {
  // Sem este escopo, um `<table>` dentro de um modal do desktop renderizado
  // numa janela estreita viraria card sem ninguém pedir.
  const regras = css.match(/main\[data-cards-mobile\][^{]*\{/g) ?? [];
  assert.ok(regras.length >= 6, `esperava as regras escopadas em main[data-cards-mobile], achei ${regras.length}`);
  assert.match(layout, /data-cards-mobile/, 'o shell mobile parou de marcar o <main>');
});

test('existe saída para a tabela em que o card ficar pior que rolar', () => {
  assert.match(css, /table:not\(\[data-cards='nao'\]\)/, 'o opt-out por data-cards sumiu do CSS');
  assert.match(hook, /dataset\.cards === 'nao'/, 'o hook parou de respeitar o opt-out');
});

test('🔴 o rótulo da célula vem do <thead>, nunca de uma lista escrita à mão', () => {
  const fonte = semComentarios(hook);
  // Duas listas de rótulos (uma no thead, outra no hook) divergiriam no
  // primeiro dia em que alguém renomeasse uma coluna — é a família das
  // duplicatas de renovação, em CSS.
  assert.match(fonte, /querySelectorAll<HTMLTableCellElement>\('thead th'\)/, 'o hook deixou de ler os cabeçalhos da própria tabela');
  assert.match(css, /content:\s*attr\(data-rotulo\)/, 'o CSS deixou de exibir o rótulo lido do thead');
});

test('🔴 o título do card é a primeira coluna COM CABEÇALHO, não a coluna 0', () => {
  // Medido na Lojinha: a coluna 0 é a foto do produto, com <th> vazio. Pela
  // régua ingênua o emoji virava título e "Azul Music Style - G" — o nome de
  // verdade — virava um atributo rotulado "PRODUTO".
  const fonte = semComentarios(hook);
  assert.match(fonte, /function indiceDoTitulo/, 'a escolha do título deixou de ser uma decisão própria');
  assert.match(fonte, /if \(!cabecalhos\[i\]\) continue;/, 'o título voltou a aceitar coluna sem cabeçalho');
  assert.doesNotMatch(fonte, /i === 0 && /, 'o título voltou a ser "a coluna 0"');
});

test('coluna sem cabeçalho não ganha rótulo em branco', () => {
  assert.match(hook, /data-semrotulo|semrotulo/, 'o hook parou de marcar a coluna decorativa');
  assert.match(css, /td\[data-semrotulo='sim'\]::before[\s\S]{0,80}display:\s*none/, 'o rótulo vazio voltou a ser desenhado');
});

test('a rotulagem reage a tabela que chega depois (dados assíncronos)', () => {
  // Quase toda tabela do app nasce depois: os dados vêm de hook assíncrono.
  // Um efeito de uma passada só acharia o <tbody> vazio.
  assert.match(hook, /new MutationObserver/, 'sem observador, tabela carregada depois fica sem rótulo');
  assert.match(hook, /subtree:\s*true/, 'a tabela nasce vários níveis abaixo — subtree é obrigatório');
  assert.match(hook, /observador\.disconnect\(\)/, 'o observador precisa morrer junto com o componente');
});

test('célula vazia não vira linha com rótulo órfão', () => {
  assert.match(hook, /const VAZIOS = new Set/, 'a régua de célula vazia sumiu');
  assert.match(css, /td\[data-vazia='sim'\][\s\S]{0,60}display:\s*none/, 'célula vazia voltou a ocupar linha');
});

test('🔴 o rótulo empurra o conteúdo; ele não SEPARA o valor do seu ícone', () => {
  // `justify-content: space-between` aqui espalhava os três itens da linha,
  // porque com o `td` virando flex cada nó filho (o texto "4.5%" e o <svg>
  // do ✓/×) vira um item independente. Quem empurra é o rótulo.
  const bloco = /td \{([\s\S]*?)\}/.exec(css.slice(css.indexOf('TABELA VIRA CARD')));
  assert.ok(bloco, 'o bloco da célula sumiu');
  assert.doesNotMatch(bloco[1], /justify-content:\s*space-between/, 'space-between separa o valor do próprio ícone');
  assert.match(css, /td::before \{[\s\S]*?margin-right:\s*auto/, 'o rótulo deixou de ser quem empurra');
});
