import assert from 'node:assert/strict';
import { alocarFaixas, contarFaixas, minutosDeHHMM } from '../../src/lib/agenda';

assert.equal(minutosDeHHMM('08:00'), 480, '08:00 deve virar 480 minutos');
assert.equal(minutosDeHHMM('17:30'), 1050, '17:30 deve virar 1050 minutos');

// Aulas que nao se sobrepoem ficam todas na faixa 0.
const seguidas = alocarFaixas([
  { hora_inicio: '14:00', duracao_minutos: 50 },
  { hora_inicio: '15:00', duracao_minutos: 50 },
]);
assert.deepEqual(
  seguidas.map((a) => a.faixa),
  [0, 0],
  'aulas em horarios distintos devem dividir a mesma faixa',
);

// Caso real: Isaque, Recreio, 04/08/2026.
// Experimental de 30min as 17:00 colide com a turma de 50min as 17:00;
// a segunda experimental as 17:30 cabe de volta na faixa 0.
const isaque = alocarFaixas([
  { hora_inicio: '17:00', duracao_minutos: 30 },
  { hora_inicio: '17:00', duracao_minutos: 50 },
  { hora_inicio: '17:30', duracao_minutos: 30 },
]);
assert.deepEqual(
  isaque.map((a) => a.faixa),
  [0, 1, 0],
  'aulas sobrepostas devem ocupar faixas distintas e reaproveitar a faixa livre',
);
assert.equal(contarFaixas(isaque), 2, 'o trilho do Isaque precisa de 2 faixas');

// A entrada pode chegar fora de ordem e o resultado deve ser o mesmo.
const desordenado = alocarFaixas([
  { hora_inicio: '17:30', duracao_minutos: 30 },
  { hora_inicio: '17:00', duracao_minutos: 50 },
  { hora_inicio: '17:00', duracao_minutos: 30 },
]);
assert.equal(contarFaixas(desordenado), 2, 'ordem da entrada nao pode mudar o numero de faixas');

// Aula que termina exatamente quando a proxima comeca nao conta como colisao.
const encostadas = alocarFaixas([
  { hora_inicio: '17:00', duracao_minutos: 30 },
  { hora_inicio: '17:30', duracao_minutos: 30 },
]);
assert.deepEqual(
  encostadas.map((a) => a.faixa),
  [0, 0],
  'fim == inicio da seguinte nao e colisao',
);

assert.deepEqual(alocarFaixas([]), [], 'lista vazia devolve lista vazia');
assert.equal(contarFaixas([]), 0, 'lista vazia precisa de 0 faixas');

console.log('agenda faixas: OK');
