/**
 * Programacao impressa do recital — LAPE-39, fase 6.
 *
 * O papel e o unico artefato do modulo que ninguem consegue corrigir depois: ele sai da
 * impressora e vai para a mao do publico. Estes testes travam o que nao da para revisar
 * olhando a tela — escape de nome, data sem deslocamento de fuso e a separacao entre o que
 * o publico le e o que a producao le.
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

// Bundle porque `eventosImpressao.ts` importa `eventos.ts` — transpilar sozinho deixaria o
// import quebrado e o teste rodaria contra um modulo que nao carrega.
const lib = await (async () => {
  const { outputFiles } = await esbuild.build({
    entryPoints: ['src/lib/eventosImpressao.ts'],
    bundle: true,
    format: 'esm',
    write: false,
    logLevel: 'silent',
  });
  const arquivo = path.join(mkdtempSync(path.join(tmpdir(), 'evt-imp-')), 'impressao.mjs');
  writeFileSync(arquivo, outputFiles[0].text);
  return import(pathToFileURL(arquivo).href);
})();

const { gerarProgramaHtml, gerarFolhaDePalcoHtml } = lib;

const EVENTO = {
  titulo: 'Recital de Primavera',
  data_evento: '2026-09-21',
  local: 'Teatro Municipal',
  unidade_nome: 'Barra',
  horario_inicio: '09:00',
  duracao_padrao_segundos: 300,
  intervalo_entre_blocos_segundos: 2700,
};

let seq = 0;
const ap = (extra = {}) => ({
  id: ++seq,
  ordem: seq,
  duracao_segundos: 300,
  aluno_nome: `Aluno ${seq}`,
  curso_nome: 'Violão',
  professor_nome: 'Lohana Araújo',
  musica: 'Asa Branca',
  tem_playback: false,
  observacao_mapa: null,
  itens: [],
  ...extra,
});

const bloco = (nome, apresentacoes, extra = {}) => ({
  id: Number(nome.replace(/\D/g, '')) || 1,
  nome,
  ordem: Number(nome.replace(/\D/g, '')) || 1,
  horario_inicial: null,
  inicio_manual: false,
  apresentacoes,
  ...extra,
});

const dados = (blocos = []) => ({ evento: EVENTO, blocos });

/* ───────────────────────── seguranca do que vai ao papel ───────────────────────── */

test('nome com caractere de HTML e escapado, nao injetado', () => {
  // O nome vem do banco. Sem escape, um cadastro com `<` quebra o documento inteiro.
  const html = gerarProgramaHtml(
    dados([bloco('Bloco 1', [ap({ aluno_nome: '<script>alert(1)</script>' })])]),
  );
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/u);
  assert.match(html, /&lt;script&gt;/u);
});

test('apostrofo e escapado — existe no cadastro real', () => {
  const html = gerarProgramaHtml(dados([bloco('Bloco 1', [ap({ musica: "D'Angelo" })])]));
  assert.match(html, /D&#39;Angelo/u);
});

test('e comercial no nome nao vira entidade quebrada', () => {
  const html = gerarProgramaHtml(dados([bloco('Bloco 1', [ap({ aluno_nome: 'Tom & Jerry' })])]));
  assert.match(html, /Tom &amp; Jerry/u);
});

/* ───────────────────────── data ───────────────────────── */

test('a data NAO desloca por fuso — 21/09 sai 21, nunca 20', () => {
  // `new Date('2026-09-21')` e interpretado como UTC e, em BRT, volta um dia. O papel ja
  // foi para a grafica quando alguem notaria.
  const html = gerarProgramaHtml(dados([bloco('Bloco 1', [ap()])]));
  assert.match(html, /21 de setembro de 2026/u);
  assert.doesNotMatch(html, /20 de setembro/u);
});

/* ───────────────────────── programacao (publico) ───────────────────────── */

test('a programacao traz aluno, curso, musica e professor', () => {
  const html = gerarProgramaHtml(dados([bloco('Abertura', [ap({ aluno_nome: 'Ana Vitória' })])]));
  assert.match(html, /Ana Vitória/u);
  assert.match(html, /Violão/u);
  assert.match(html, /Asa Branca/u);
  assert.match(html, /Prof\. Lohana Araújo/u);
  assert.match(html, /Abertura/u);
});

test('bloco VAZIO nao aparece na programacao do publico', () => {
  // Um titulo sem nada embaixo, no papel do publico, parece que alguem foi cortado.
  const html = gerarProgramaHtml(dados([bloco('Bloco 1', [ap()]), bloco('Bloco 2', [])]));
  assert.match(html, /Bloco 1/u);
  assert.doesNotMatch(html, /Bloco 2/u);
});

test('grade sem apresentacao nenhuma gera documento honesto, nao pagina quebrada', () => {
  const html = gerarProgramaHtml(dados([]));
  assert.match(html, /ainda não tem apresentações/u);
  assert.match(html, /<\/html>/u);
});

test('a programacao NAO carrega item de palco nem mapa', () => {
  // Papel do publico com "2x estante" e ruido; o mapa de palco e instrucao interna.
  const html = gerarProgramaHtml(
    dados([
      bloco('Bloco 1', [
        ap({
          itens: [{ tipo: 'equipamento', nome: 'Estante', quantidade: 2 }],
          observacao_mapa: 'cadeira à esquerda',
        }),
      ]),
    ]),
  );
  assert.doesNotMatch(html, /Estante/u);
  assert.doesNotMatch(html, /cadeira à esquerda/u);
});

test('a ordem do papel segue a ordem da grade, nao a ordem do array', () => {
  const primeiro = ap({ aluno_nome: 'Primeiro', ordem: 1 });
  const segundo = ap({ aluno_nome: 'Segundo', ordem: 2 });
  // Array fora de ordem de proposito.
  const html = gerarProgramaHtml(dados([bloco('Bloco 1', [segundo, primeiro])]));
  assert.ok(
    html.indexOf('Primeiro') < html.indexOf('Segundo'),
    'quem tem ordem 1 tem de sair antes no papel',
  );
});

/* ───────────────────────── folha de palco (producao) ───────────────────────── */

test('a folha traz item, playback e mapa', () => {
  const html = gerarFolhaDePalcoHtml(
    dados([
      bloco('Bloco 1', [
        ap({
          itens: [{ tipo: 'equipamento', nome: 'Amplificador', quantidade: 1 }],
          tem_playback: true,
          observacao_mapa: 'cadeira à esquerda',
        }),
      ]),
    ]),
  );
  assert.match(html, /Amplificador/u);
  assert.match(html, /Playback/u);
  assert.match(html, /cadeira à esquerda/u);
});

test('o instrumento do curso entra na folha sem ninguem digitar', () => {
  const html = gerarFolhaDePalcoHtml(dados([bloco('Bloco 1', [ap({ curso_nome: 'Bateria' })])]));
  assert.match(html, /Bateria/u);
});

test('curso que nao poe objeto no palco nao inventa instrumento', () => {
  const html = gerarFolhaDePalcoHtml(
    dados([bloco('Bloco 1', [ap({ curso_nome: 'Canto', professor_nome: null })])]),
  );
  assert.match(html, /nada registrado/u);
});

test('bloco VAZIO aparece na folha — o inverso da programacao', () => {
  // Quem monta precisa saber que o bloco existe e nao pede nada, senao procura a folha
  // que falta.
  const html = gerarFolhaDePalcoHtml(dados([bloco('Bloco 1', [ap()]), bloco('Bloco 2', [])]));
  assert.match(html, /Bloco 2/u);
});

/* ───────────────────────── moldura comum ───────────────────────── */

test('NENHUM documento dispara a impressao sozinho', () => {
  // A versao anterior chamava window.print() no onload, e quem so queria CONFERIR a
  // programacao caia num dialogo de impressao que nao pediu. Abrir e ver e o caso comum.
  for (const html of [gerarProgramaHtml(dados([bloco('B', [ap()])])), gerarFolhaDePalcoHtml(dados([]))]) {
    assert.doesNotMatch(html, /onload/u, 'nada pode rodar sozinho ao abrir');
    assert.doesNotMatch(html, /setTimeout\([^)]*print/u);
  }
});

test('imprimir e salvar em PDF sao BOTOES dentro do documento', () => {
  for (const html of [gerarProgramaHtml(dados([bloco('B', [ap()])])), gerarFolhaDePalcoHtml(dados([]))]) {
    assert.match(html, /onclick="window\.print\(\)"/u);
    assert.match(html, /Salvar em PDF/u);
    assert.match(html, /Imprimir/u);
  }
});

test('a barra de acoes NAO sai no papel', () => {
  // Botao impresso e tinta gasta num controle que ninguem pode clicar.
  const html = gerarProgramaHtml(dados([bloco('B', [ap()])]));
  assert.match(html, /@media print[\s\S]*\.acoes\s*\{\s*display:\s*none/u);
});

test('a logo entra quando ha origem, e o documento sobrevive sem ela', () => {
  const comLogo = gerarProgramaHtml({ ...dados([bloco('B', [ap()])]), origem: 'https://app.la' });
  assert.match(comLogo, /https:\/\/app\.la\/logo-la-music-light-completa\.svg/u);
  // A versao "light" e obrigatoria: a logo das telas do app tem texto branco e sumiria
  // num documento de fundo branco.
  assert.match(comLogo, /light/u);

  const semLogo = gerarProgramaHtml(dados([bloco('B', [ap()])]));
  assert.doesNotMatch(semLogo, /<img/u, 'sem origem, degrada — nao quebra');
  assert.match(semLogo, /<\/html>/u);
});

test('o cabecalho declara unidade, data e local nos dois documentos', () => {
  for (const html of [gerarProgramaHtml(dados([bloco('B', [ap()])])), gerarFolhaDePalcoHtml(dados([]))]) {
    assert.match(html, /Recital de Primavera/u);
    assert.match(html, /Barra/u);
    assert.match(html, /Teatro Municipal/u);
  }
});

test('a folha se identifica como uso interno; a programacao nao', () => {
  assert.match(gerarFolhaDePalcoHtml(dados([])), /uso interno/u);
  assert.doesNotMatch(gerarProgramaHtml(dados([bloco('B', [ap()])])), /uso interno/u);
});
