/**
 * Regras de palco do modulo Eventos (LAPE-39, fase 4).
 *
 * Trava o que a tela de montagem promete: a grafia digitada a mao nao pode multiplicar o
 * mesmo item na lista de palco, e a consolidacao tem de responder "o que precisa estar no
 * palco", nao "quantos pedidos foram feitos".
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

// Mesma forma de `eventosHorario.test.mjs`: roda a FUNCAO REAL, transpilada, nao uma copia
// da regra escrita aqui — copia prova a copia, que foi como a costura runtime/banco do lote
// do caixa passou batida (R$ 1.722 aprovados, R$ 432 gravados).
const lib = await (async () => {
  const { code } = await esbuild.transform(readFileSync('src/lib/eventos.ts', 'utf8'), {
    loader: 'ts',
    format: 'esm',
  });
  const arquivo = path.join(mkdtempSync(path.join(tmpdir(), 'evt-palco-')), 'eventos.mjs');
  writeFileSync(arquivo, code);
  return import(pathToFileURL(arquivo).href);
})();

const { chaveDoItem, consolidarItensDoPalco, instrumentoDoCurso, resumirPalcoDaApresentacao } =
  lib;

const instrumento = (nome, quantidade = 1) => ({ tipo: 'instrumento', nome, quantidade });
const equipamento = (nome, quantidade = 1) => ({ tipo: 'equipamento', nome, quantidade });

/** Apresentacao sem curso reconhecido: isola o que foi DIGITADO do que e derivado. */
const ap = (...itens) => ({ cursoNome: null, itens });
/** Apresentacao de um curso, com o que foi digitado alem do instrumento dele. */
const apDe = (cursoNome, ...itens) => ({ cursoNome, itens });

/* ───────────────────────── chave de agrupamento ───────────────────────── */

test('chaveDoItem ignora acento, caixa e espaco sobrando', () => {
  assert.equal(chaveDoItem('Violão'), chaveDoItem('violao'));
  assert.equal(chaveDoItem('  VIOLÃO  '), chaveDoItem('violão'));
  assert.equal(chaveDoItem('Estante  de  partitura'), chaveDoItem('estante de partitura'));
});

test('chaveDoItem NAO colapsa plural nem sinonimo — seriam pedidos diferentes', () => {
  assert.notEqual(chaveDoItem('Violao'), chaveDoItem('Violoes'));
  assert.notEqual(chaveDoItem('Cubo'), chaveDoItem('Amplificador'));
});

/* ─────────────── instrumento derivado do curso ─────────────── */

test('o instrumento sai do CURSO — ninguem digita "Violao" numa apresentacao de Violao', () => {
  assert.equal(instrumentoDoCurso('Violão'), 'Violão');
  assert.equal(instrumentoDoCurso('Bateria'), 'Bateria');
  assert.equal(instrumentoDoCurso('Contrabaixo'), 'Contrabaixo');
});

test('" IND" e MODALIDADE, nao outro instrumento', () => {
  // Medido no banco: `Violão` e `Violão IND` sao cursos distintos e o mesmo objeto fisico.
  assert.equal(instrumentoDoCurso('Violão IND'), instrumentoDoCurso('Violão'));
  assert.equal(instrumentoDoCurso('Bateria IND'), 'Bateria');
  assert.equal(instrumentoDoCurso('Canto IND'), null);
});

test('curso que NAO poe objeto no palco devolve null', () => {
  // Canto e o 2o maior curso da rede (233 matriculas ativas) e nao e instrumento: quem
  // canta precisa de microfone, que e equipamento e nao se deduz do curso.
  assert.equal(instrumentoDoCurso('Canto'), null);
  assert.equal(instrumentoDoCurso('Musicalização Infantil'), null);
  assert.equal(instrumentoDoCurso('Musicalização para Bebês'), null);
  assert.equal(instrumentoDoCurso('Harmonia'), null);
  assert.equal(instrumentoDoCurso('Home Studio'), null);
  assert.equal(instrumentoDoCurso('Teatro Musical'), null);
});

test('curso desconhecido devolve null, NUNCA o proprio nome do curso', () => {
  // Erro de omissao (a pessoa digita) em vez de comissao (entra na lista e ninguem ve).
  assert.equal(instrumentoDoCurso('Curso Novo Que Ninguem Mapeou'), null);
  assert.equal(instrumentoDoCurso(null), null);
  assert.equal(instrumentoDoCurso(undefined), null);
  assert.equal(instrumentoDoCurso(''), null);
});

test('o instrumento do curso entra na consolidacao sem ninguem digitar nada', () => {
  const r = consolidarItensDoPalco([apDe('Violão'), apDe('Bateria')]);
  assert.equal(r.length, 2);
  assert.deepEqual(
    r.map((i) => i.nome).sort(),
    ['Bateria', 'Violão'],
  );
  assert.ok(r.every((i) => i.doCurso), 'ninguem digitou: os dois sao derivados');
});

test('apresentacao de Canto nao poe instrumento nenhum no palco', () => {
  assert.deepEqual(consolidarItensDoPalco([apDe('Canto')]), []);
});

test('digitar o mesmo instrumento do curso NAO duplica a quantidade', () => {
  // O aluno de Violao que escreve "Violão" a mao pediu UM violao, nao dois.
  const r = consolidarItensDoPalco([apDe('Violão', instrumento('Violão'))]);
  assert.equal(r.length, 1);
  assert.equal(r[0].quantidade, 1);
});

test('digitado vence o derivado — ele carrega quantidade que o curso nao sabe', () => {
  // Dueto de violao: a apresentacao e de Violao e pede 2. O derivado nao pode rebaixar.
  const r = consolidarItensDoPalco([apDe('Violão', instrumento('Violão', 2))]);
  assert.equal(r[0].quantidade, 2);
  assert.equal(r[0].doCurso, false, 'alguem escolheu — nao pode aparecer como automatico');
});

test('a origem NAO e inferida da chave: mesmo nome digitado marca doCurso=false', () => {
  const soCurso = consolidarItensDoPalco([apDe('Violão')]);
  const digitado = consolidarItensDoPalco([apDe('Violão', instrumento('violao'))]);
  assert.equal(soCurso[0].doCurso, true);
  assert.equal(digitado[0].doCurso, false);
});

test('curso e itens digitados convivem sem se atrapalhar', () => {
  const r = consolidarItensDoPalco([
    apDe('Canto', equipamento('Microfone')),
    apDe('Violão', equipamento('Banquinho')),
  ]);
  assert.deepEqual(
    r.map((i) => `${i.nome}:${i.doCurso}`),
    ['Violão:true', 'Banquinho:false', 'Microfone:false'],
  );
});

/* ───────────────────────── consolidacao ───────────────────────── */

test('sem item nenhum devolve lista vazia, nunca undefined', () => {
  assert.deepEqual(consolidarItensDoPalco([]), []);
  assert.deepEqual(consolidarItensDoPalco([ap(), ap(), ap()]), []);
});

test('variantes de grafia viram UMA linha', () => {
  const r = consolidarItensDoPalco([
    ap(instrumento('Violão')),
    ap(instrumento('violao')),
    ap(instrumento('VIOLAO')),
  ]);
  assert.equal(r.length, 1, 'tres grafias do mesmo instrumento tem de colapsar');
  assert.equal(r[0].apresentacoes, 3);
});

test('a grafia exibida e a mais frequente, nunca a chave normalizada', () => {
  const r = consolidarItensDoPalco([
    ap(instrumento('Violão')),
    ap(instrumento('Violão')),
    ap(instrumento('violao')),
  ]);
  assert.equal(r[0].nome, 'Violão');
});

test('empate de grafia resolve alfabeticamente — a lista nao pode trocar de nome sozinha', () => {
  const a = consolidarItensDoPalco([ap(instrumento('Violão')), ap(instrumento('violao'))]);
  const b = consolidarItensDoPalco([ap(instrumento('violao')), ap(instrumento('Violão'))]);
  assert.equal(a[0].nome, b[0].nome, 'a mesma entrada em outra ordem nao pode mudar o nome');
});

test('instrumento e equipamento de mesmo nome sao linhas separadas', () => {
  const r = consolidarItensDoPalco([ap(instrumento('Microfone'), equipamento('Microfone'))]);
  assert.equal(r.length, 2);
});

test('item sem nome e descartado em vez de virar linha em branco', () => {
  const r = consolidarItensDoPalco([ap(instrumento('   '), instrumento('Violão'))]);
  assert.equal(r.length, 1);
  assert.equal(r[0].nome, 'Violão');
});

test('quantidade invalida vira 1 em vez de sumir com a linha', () => {
  const r = consolidarItensDoPalco([ap(instrumento('Violão', 0)), ap(instrumento('Violão', NaN))]);
  assert.equal(r.length, 1);
  assert.equal(r[0].apresentacoes, 2);
  assert.ok(r[0].quantidade >= 1, 'quantidade tem de ser ao menos 1');
});

test('quantidade e o PICO simultaneo, nao a soma dos pedidos', () => {
  // Seis apresentacoes de violao, uma depois da outra: o palco precisa de UM violao.
  // Somar levaria seis para um palco que usa um — e o erro cresce com o bloco.
  const r = consolidarItensDoPalco(Array.from({ length: 6 }, () => ap(instrumento('Violão'))));
  assert.equal(r[0].quantidade, 1, 'seis apresentacoes sequenciais nao precisam de seis violoes');
  assert.equal(r[0].apresentacoes, 6, 'mas o numero de apresentacoes continua visivel');
});

test('o dueto e o caso que separa pico de soma', () => {
  // Uma apresentacao com 2 estantes + cinco com 1: o palco precisa de 2 ao mesmo tempo.
  const r = consolidarItensDoPalco([
    ap(equipamento('Estante', 2)),
    ...Array.from({ length: 5 }, () => ap(equipamento('Estante'))),
  ]);
  assert.equal(r[0].quantidade, 2, 'o pico e 2; a soma (7) mandaria montar um palco inteiro a mais');
  assert.equal(r[0].apresentacoes, 6);
});

test('a mesma apresentacao pedindo o item duas vezes soma DENTRO dela', () => {
  // Digitar "Estante" duas vezes com quantidade 1 e o mesmo que pedir 2 — sao simultaneas,
  // porque e a mesma apresentacao.
  const r = consolidarItensDoPalco([ap(equipamento('Estante'), equipamento('Estante'))]);
  assert.equal(r[0].quantidade, 2);
  assert.equal(r[0].apresentacoes, 1);
});

test('instrumento vem antes de equipamento — e a ordem em que o palco e montado', () => {
  const r = consolidarItensDoPalco([ap(equipamento('Amplificador'), instrumento('Violão'))]);
  assert.equal(r[0].tipo, 'instrumento');
  assert.equal(r[1].tipo, 'equipamento');
});

test('apresentacoes conta em quantas o item aparece, nao quantas linhas foram digitadas', () => {
  // A mesma apresentacao pedindo o item em duas linhas continua sendo UMA apresentacao.
  const r = consolidarItensDoPalco([ap(instrumento('Estante'), instrumento('Estante'))]);
  assert.equal(r[0].apresentacoes, 1);
});

/* ───────────────────────── resumo do cartao ───────────────────────── */

test('apresentacao sem nada devolve null — o cartao nao carrega linha vazia', () => {
  assert.equal(resumirPalcoDaApresentacao([], false, false), null);
});

test('resumo pluraliza e junta playback e mapa', () => {
  assert.equal(resumirPalcoDaApresentacao([instrumento('Violão')], false, false), '1 instrumento');
  assert.equal(
    resumirPalcoDaApresentacao([instrumento('Violão'), instrumento('Cajón')], false, false),
    '2 instrumentos',
  );
  assert.equal(
    resumirPalcoDaApresentacao([instrumento('Violão'), equipamento('Cubo')], true, true),
    '1 instrumento · 1 equipamento · playback · mapa',
  );
});

test('playback sozinho aparece — e o que a operacao de som precisa saber', () => {
  assert.equal(resumirPalcoDaApresentacao([], true, false), 'playback');
});
