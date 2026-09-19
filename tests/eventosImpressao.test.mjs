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

const { gerarProgramaHtml, gerarFolhaDePalcoHtml, gerarPlanilhaCsv, nomeDoArquivo } = lib;

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

/* ───────────────────────── recorte por bloco ───────────────────────── */

test('imprimir UM bloco traz so ele', () => {
  const b1 = bloco('Abertura', [ap({ aluno_nome: 'Do primeiro' })]);
  const b2 = bloco('Encerramento', [ap({ aluno_nome: 'Do segundo' })]);
  b2.id = 2;
  b2.ordem = 2;
  const html = gerarProgramaHtml(dados([b1, b2]), 2);
  assert.match(html, /Do segundo/u);
  assert.doesNotMatch(html, /Do primeiro/u);
});

test('🔴 o bloco isolado mantem o horario REAL dele no recital', () => {
  // O encadeamento e inicio(N+1) = fim(N) + intervalo. Filtrar os blocos ANTES do calculo
  // faria o segundo bloco comecar as 09:00 — a folha diria a hora errada para quem vai
  // montar o palco, que e justamente quem usa a folha de um bloco so.
  const b1 = bloco('Abertura', [ap()]);
  const b2 = bloco('Encerramento', [ap()]);
  b2.id = 2;
  b2.ordem = 2;

  const soOSegundo = gerarProgramaHtml(dados([b1, b2]), 2);
  assert.match(soOSegundo, /09:50/u, 'tem de manter 09:50 (fim 09:05 + 45 min)');
  assert.doesNotMatch(soOSegundo, /09:00\s*–/u, 'nao pode reiniciar as 09:00');
});

test('o titulo avisa que e recorte, nunca se passa pela programacao inteira', () => {
  // Uma folha com 1 de 40 apresentacoes, sem aviso, faz quem recebe concluir que o recital
  // tem 1 numero.
  const b = bloco('Abertura', [ap()]);
  assert.match(gerarProgramaHtml(dados([b]), 1), /Programação — Abertura/u);
  assert.match(gerarFolhaDePalcoHtml(dados([b]), 1), /Folha de palco — Abertura/u);
});

test('a folha de UM bloco nao diz "o recital inteiro precisa de"', () => {
  // Seria mentira: o consolidado ali cobre so aquele bloco, e quem levasse a folha montaria
  // o palco achando que tem tudo.
  const b = bloco('Abertura', [ap({ curso_nome: 'Bateria' })]);
  const um = gerarFolhaDePalcoHtml(dados([b]), 1);
  assert.match(um, /Este bloco precisa de/u);
  assert.doesNotMatch(um, /recital inteiro/u);

  const tudo = gerarFolhaDePalcoHtml(dados([b]));
  assert.match(tudo, /O recital inteiro precisa de/u);
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

/* ───────────────────────── planilha (CSV) ───────────────────────── */

test('🔴 o CSV comeca com BOM UTF-8 e usa ponto e virgula', () => {
  // Sem BOM, o Excel em portugues le como ANSI e "Violao" vira "ViolÃ£o". Com virgula em vez
  // de ponto e virgula, ele joga a linha inteira numa coluna so. As duas coisas fazem a
  // planilha parecer quebrada sem nenhum erro aparecer.
  const csv = gerarPlanilhaCsv(dados([bloco('Bloco 1', [ap()])]));
  assert.ok(csv.startsWith('\uFEFF'), 'falta o BOM — o Excel quebraria os acentos');
  assert.match(csv.split('\r\n')[0], /^\uFEFFBloco;Ordem;Horário;Aluno;/u);
});

test('celula com ponto e virgula nao parte a linha', () => {
  // "Aquarela; ao vivo" viraria duas colunas sem as aspas.
  const csv = gerarPlanilhaCsv(dados([bloco('Bloco 1', [ap({ musica: 'Aquarela; ao vivo' })])]));
  assert.match(csv, /"Aquarela; ao vivo"/u);
});

test('aspas dentro do texto sao duplicadas, como manda o formato', () => {
  const csv = gerarPlanilhaCsv(dados([bloco('Bloco 1', [ap({ musica: 'A "melhor" de todas' })])]));
  assert.match(csv, /"A ""melhor"" de todas"/u);
});

test('uma linha por apresentacao, na ordem da grade', () => {
  const csv = gerarPlanilhaCsv(
    dados([
      bloco('Bloco 1', [ap({ aluno_nome: 'Primeiro' }), ap({ aluno_nome: 'Segundo' })]),
    ]),
  );
  const linhas = csv.trim().split('\r\n');
  assert.equal(linhas.length, 3, 'cabecalho + 2 apresentacoes');
  assert.ok(linhas[1].includes('Primeiro'));
  assert.ok(linhas[2].includes('Segundo'));
});

test('duracao padrao sai VAZIA, nunca zero', () => {
  // Zero seria somado como "dura nada" numa planilha; o que existe e "ainda usa o padrao".
  const csv = gerarPlanilhaCsv(dados([bloco('B', [ap({ duracao_segundos: null })])]));
  const linha = csv.trim().split('\r\n')[1].split(';');
  assert.equal(linha[7], '', 'a coluna de duracao tem de ficar vazia');
});

test('o CSV respeita o recorte por bloco', () => {
  const b1 = bloco('Abertura', [ap({ aluno_nome: 'Do primeiro' })]);
  const b2 = bloco('Encerramento', [ap({ aluno_nome: 'Do segundo' })]);
  b2.id = 2;
  const csv = gerarPlanilhaCsv(dados([b1, b2]), 2);
  assert.match(csv, /Do segundo/u);
  assert.doesNotMatch(csv, /Do primeiro/u);
});

test('itens de palco entram numa coluna legivel', () => {
  const csv = gerarPlanilhaCsv(
    dados([
      bloco('B', [
        ap({
          itens: [
            { tipo: 'equipamento', nome: 'Estante', quantidade: 2 },
            { tipo: 'equipamento', nome: 'Cabo P10', quantidade: 1 },
          ],
        }),
      ]),
    ]),
  );
  assert.match(csv, /2x Estante, Cabo P10/u);
});

test('o nome do arquivo sai seguro e reconhecivel', () => {
  const nome = nomeDoArquivo(dados([]), 'grade.csv');
  assert.equal(nome, '2026-09-21-recital-de-primavera-grade.csv');
  assert.doesNotMatch(nome, /[^a-z0-9.-]/u, 'sem acento, espaco ou caractere de caminho');
});
