// Numero do recital — apresentacoes que sobem JUNTAS (pedido do Arthur, prototipo de 27/09).
//
// A apresentacao continua sendo o par (pessoa, curso): e nela que moram o certificado por
// curso e o que o professor lanca no LA Teacher. O numero so junta quem toca junto, e estes
// testes travam as tres consequencias disso: um horario so, palco somado entre quem toca ao
// mesmo tempo, e uma posicao so na ordem que a coxia anuncia.
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
  const arquivo = path.join(mkdtempSync(path.join(tmpdir(), 'evt-numero-')), 'eventos.mjs');
  writeFileSync(arquivo, code);
  return import(pathToFileURL(arquivo).href);
})();

const {
  agruparEmNumeros,
  calcularHorariosDaGrade,
  consolidarItensDoPalco,
  palcoDosNumeros,
  montarListaDeChegada,
  idadeEmAnos,
  hojeNoBrasil,
  rotuloIdade,
} = lib;

const EVENTO = {
  horario_inicio: '09:00',
  duracao_padrao_segundos: 300,
  intervalo_entre_blocos_segundos: 2700,
};

const bloco = (id, ordem, apresentacoes) => ({
  id,
  ordem,
  horario_inicial: null,
  inicio_manual: false,
  apresentacoes,
});

/* ─────────────── agrupar ─────────────── */

test('sem grupo, cada apresentacao e um numero proprio', () => {
  const numeros = agruparEmNumeros([
    { id: 1, ordem: 1 },
    { id: 2, ordem: 2 },
  ]);
  assert.deepEqual(numeros.map((n) => n.map((a) => a.id)), [[1], [2]]);
});

test('vizinhos com o mesmo grupo viram UM numero, na ordem da grade', () => {
  const numeros = agruparEmNumeros([
    { id: 3, ordem: 3 },
    { id: 2, ordem: 2, grupo_id: 'g' },
    { id: 1, ordem: 1, grupo_id: 'g' },
  ]);
  assert.deepEqual(numeros.map((n) => n.map((a) => a.id)), [[1, 2], [3]]);
});

test('grupo intercalado se parte em dois numeros em vez de reordenar a grade', () => {
  // Nunca deveria acontecer (a RPC poe o novo integrante logo depois do ultimo), mas se
  // acontecer a tela mostra dois horarios — nao arrasta ninguem de posicao por conta propria.
  const numeros = agruparEmNumeros([
    { id: 1, ordem: 1, grupo_id: 'g' },
    { id: 2, ordem: 2 },
    { id: 3, ordem: 3, grupo_id: 'g' },
  ]);
  assert.deepEqual(numeros.map((n) => n.map((a) => a.id)), [[1], [2], [3]]);
});

test('grupos diferentes lado a lado nao se fundem', () => {
  const numeros = agruparEmNumeros([
    { id: 1, ordem: 1, grupo_id: 'a' },
    { id: 2, ordem: 2, grupo_id: 'b' },
  ]);
  assert.equal(numeros.length, 2);
});

/* ─────────────── horario ─────────────── */

test('quem toca junto comeca no mesmo minuto e ocupa UM slot', () => {
  const [h] = calcularHorariosDaGrade(EVENTO, [
    bloco(10, 1, [
      { id: 1, ordem: 1, duracao_segundos: 180, grupo_id: 'duo' },
      { id: 2, ordem: 2, duracao_segundos: 180, grupo_id: 'duo' },
      { id: 3, ordem: 3, duracao_segundos: 300 },
    ]),
  ]);
  const inicio = Object.fromEntries(h.apresentacoes.map((a) => [a.id, a.inicio]));
  assert.equal(inicio[1], '09:00');
  assert.equal(inicio[2], '09:00');
  // 09:00 + 3 min do duo = 09:03. Sem o grupo seria 09:06.
  assert.equal(inicio[3], '09:03');
  assert.equal(h.fim, '09:08');
});

test('o numero dura o MAIOR dos integrantes quando as duracoes divergem', () => {
  const [h] = calcularHorariosDaGrade(EVENTO, [
    bloco(10, 1, [
      { id: 1, ordem: 1, duracao_segundos: 120, grupo_id: 'duo' },
      { id: 2, ordem: 2, duracao_segundos: 240, grupo_id: 'duo' },
      { id: 3, ordem: 3, duracao_segundos: 60 },
    ]),
  ]);
  const porId = Object.fromEntries(h.apresentacoes.map((a) => [a.id, a]));
  assert.equal(porId[1].duracaoSegundos, 240);
  assert.equal(porId[2].duracaoSegundos, 240);
  assert.equal(porId[3].inicio, '09:04');
});

test('grupo de um integrante so (sobra de quem saiu) e igual a apresentacao sozinha', () => {
  const comSobra = calcularHorariosDaGrade(EVENTO, [
    bloco(10, 1, [
      { id: 1, ordem: 1, duracao_segundos: 300, grupo_id: 'sobrou' },
      { id: 2, ordem: 2, duracao_segundos: 300 },
    ]),
  ]);
  const semGrupo = calcularHorariosDaGrade(EVENTO, [
    bloco(10, 1, [
      { id: 1, ordem: 1, duracao_segundos: 300 },
      { id: 2, ordem: 2, duracao_segundos: 300 },
    ]),
  ]);
  assert.deepEqual(comSobra, semGrupo);
});

/* ─────────────── palco ─────────────── */

test('dois alunos de Violao no mesmo numero precisam de 2 violoes', () => {
  const entradas = palcoDosNumeros([
    { id: 1, ordem: 1, grupo_id: 'duo', curso_nome: 'Violão', itens: [] },
    { id: 2, ordem: 2, grupo_id: 'duo', curso_nome: 'Violão', itens: [] },
  ]);
  const [violao] = consolidarItensDoPalco(entradas);
  assert.equal(violao.nome, 'Violão');
  assert.equal(violao.quantidade, 2);
  assert.equal(violao.doCurso, true);
});

test('as mesmas duas apresentacoes em sequencia revezam 1 violao', () => {
  const entradas = palcoDosNumeros([
    { id: 1, ordem: 1, curso_nome: 'Violão', itens: [] },
    { id: 2, ordem: 2, curso_nome: 'Violão', itens: [] },
  ]);
  const [violao] = consolidarItensDoPalco(entradas);
  assert.equal(violao.quantidade, 1);
});

test('no numero, o violao digitado por um integrante nao apaga o do curso do outro', () => {
  const entradas = palcoDosNumeros([
    {
      id: 1,
      ordem: 1,
      grupo_id: 'duo',
      curso_nome: 'Violão',
      itens: [{ tipo: 'instrumento', nome: 'Violão', quantidade: 1 }],
    },
    { id: 2, ordem: 2, grupo_id: 'duo', curso_nome: 'Violão', itens: [] },
  ]);
  const [violao] = consolidarItensDoPalco(entradas);
  assert.equal(violao.quantidade, 2);
  // Alguem digitou, entao a etiqueta nao pode dizer que ninguem escolheu.
  assert.equal(violao.doCurso, false);
});

test('canto + violao no mesmo numero somam o que cada um pede', () => {
  const entradas = palcoDosNumeros([
    {
      id: 1,
      ordem: 1,
      grupo_id: 'duo',
      curso_nome: 'Canto',
      itens: [{ tipo: 'equipamento', nome: 'Microfone', quantidade: 1 }],
    },
    { id: 2, ordem: 2, grupo_id: 'duo', curso_nome: 'Violão', itens: [] },
  ]);
  const itens = consolidarItensDoPalco(entradas).map((i) => `${i.quantidade}× ${i.nome}`);
  assert.deepEqual(itens, ['1× Violão', '1× Microfone']);
});

test('entrada antiga, sem integrantes, segue o comportamento de sempre', () => {
  const [item] = consolidarItensDoPalco([{ cursoNome: 'Bateria', itens: [] }]);
  assert.equal(item.nome, 'Bateria');
  assert.equal(item.quantidade, 1);
});

/* ─────────────── check-in ─────────────── */

test('quem sobe junto recebe a MESMA posicao na ordem da coxia', () => {
  const lista = montarListaDeChegada({
    evento: EVENTO,
    blocos: [
      {
        ...bloco(10, 1, []),
        nome: 'Bloco 1',
        apresentacoes: [
          { id: 1, ordem: 1, duracao_segundos: 300, grupo_id: 'duo', pessoa_chave: 'a', aluno_id: 1, aluno_nome: 'Ana', curso_nome: 'Violão', musica: null },
          { id: 2, ordem: 2, duracao_segundos: 300, grupo_id: 'duo', pessoa_chave: 'p', aluno_id: 2, aluno_nome: 'Pedro', curso_nome: 'Canto', musica: null },
          { id: 3, ordem: 3, duracao_segundos: 300, pessoa_chave: 'b', aluno_id: 3, aluno_nome: 'Bia', curso_nome: 'Piano', musica: null },
        ],
      },
    ],
    participacoes: [],
  });
  const posicao = Object.fromEntries(lista.ordem.map((l) => [l.alunoNome, l.posicao]));
  assert.deepEqual(posicao, { Ana: 1, Pedro: 1, Bia: 2 });
  const horario = Object.fromEntries(lista.ordem.map((l) => [l.alunoNome, l.horario]));
  assert.equal(horario.Ana, horario.Pedro);
});

/* ─────────────── idade ─────────────── */

test('idade conta o aniversario pelo dia, sem voltar um dia no fuso', () => {
  assert.equal(idadeEmAnos('2014-09-28', '2026-09-28'), 12);
  assert.equal(idadeEmAnos('2014-09-29', '2026-09-28'), 11);
  assert.equal(idadeEmAnos('2014-12-31', '2026-01-01'), 11);
});

test('sem nascimento ou com data absurda, idade fica vazia em vez de inventar numero', () => {
  assert.equal(idadeEmAnos(null, '2026-09-28'), null);
  assert.equal(idadeEmAnos('', '2026-09-28'), null);
  assert.equal(idadeEmAnos('2030-01-01', '2026-09-28'), null);
});

test('hoje e medido em BRT: 01h UTC ainda e o dia anterior no Brasil', () => {
  assert.equal(hojeNoBrasil(new Date('2026-09-29T01:00:00Z')), '2026-09-28');
});

test('rotulo de idade no singular e vazio sem idade', () => {
  assert.equal(rotuloIdade(1), '1 ano');
  assert.equal(rotuloIdade(12), '12 anos');
  assert.equal(rotuloIdade(null), '');
});
