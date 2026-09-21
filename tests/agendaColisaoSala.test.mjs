import test from 'node:test';
import assert from 'node:assert/strict';

import { colisoesDeSala } from '../src/lib/agenda.ts';

// Fabrica enxuta: so os campos que a funcao le.
const aula = (chave, sala, inicio, minutos, extra = {}) => ({
  chave,
  sala_nome: sala,
  hora_inicio: inicio,
  duracao_minutos: minutos,
  cancelada: false,
  ...extra,
});

test('duas aulas da MESMA sala no mesmo horario colidem — mesmo com professores diferentes', () => {
  // O caso que o desktop agrupado por professor nao mostra: as duas ficam em
  // trilhos separados, cada uma sozinha no seu, e nenhuma se sobrepoe la.
  const r = colisoesDeSala([
    aula('a', 'Sala 2', '11:00', 50),
    aula('b', 'Sala 2', '11:00', 50),
  ]);
  assert.equal(r.size, 2);
  assert.match(r.get('a'), /Sala 2/);
  assert.match(r.get('b'), /Sala 2/);
});

test('salas diferentes no mesmo horario nao colidem', () => {
  const r = colisoesDeSala([
    aula('a', 'Sala 1', '11:00', 50),
    aula('b', 'Sala 2', '11:00', 50),
  ]);
  assert.equal(r.size, 0);
});

test('encostar nao e sobrepor: 09:00-09:50 e 09:50-10:40 convivem', () => {
  const r = colisoesDeSala([
    aula('a', 'Sala 1', '09:00', 50),
    aula('b', 'Sala 1', '09:50', 50),
  ]);
  assert.equal(r.size, 0);
});

test('sobreposicao parcial colide', () => {
  const r = colisoesDeSala([
    aula('a', 'Sala 1', '09:00', 50),
    aula('b', 'Sala 1', '09:40', 50),
  ]);
  assert.equal(r.size, 2);
});

test('aula cancelada nao ocupa a sala — nem colide, nem faz colidir', () => {
  const r = colisoesDeSala([
    aula('a', 'Sala 1', '11:00', 50, { cancelada: true }),
    aula('b', 'Sala 1', '11:00', 50),
  ]);
  assert.equal(r.size, 0);
});

test('sem sala nao colide: "sem sala" nao e uma sala', () => {
  const r = colisoesDeSala([
    aula('a', null, '11:00', 50),
    aula('b', null, '11:00', 50),
  ]);
  assert.equal(r.size, 0);
});

test('aula sem aluno vinculado COLIDE — o horario esta reservado do mesmo jeito', () => {
  const r = colisoesDeSala([
    aula('a', 'Sala 1', '15:00', 50, { qtd_alunos: 0 }),
    aula('b', 'Sala 1', '15:00', 50, { qtd_alunos: 1 }),
  ]);
  assert.equal(r.size, 2);
});

test('tres na mesma sala: todas as tres sao marcadas', () => {
  const r = colisoesDeSala([
    aula('a', 'Sala 1', '11:00', 50),
    aula('b', 'Sala 1', '11:10', 50),
    aula('c', 'Sala 1', '11:20', 50),
  ]);
  assert.equal(r.size, 3);
});

test('dia inteiro sem colisao devolve mapa vazio — nao null', () => {
  const r = colisoesDeSala([aula('a', 'Sala 1', '09:00', 50)]);
  assert.equal(r.size, 0);
});

test('lista vazia nao quebra', () => {
  assert.equal(colisoesDeSala([]).size, 0);
});
