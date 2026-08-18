import assert from 'node:assert/strict';
import test from 'node:test';

import { abreviarNome, abreviarNomesSemColisao } from '../src/lib/nomeExibicao.mjs';

test('abrevia nome longo para os dois primeiros nomes', () => {
  // Caso que originou a regra: cadastro real da lista do 360.
  assert.equal(abreviarNome('Mayra Alves Meondonça da Silva'), 'Mayra Alves');
});

test('nome com duas palavras ou menos volta intacto', () => {
  assert.equal(abreviarNome('Vitória Andrade'), 'Vitória Andrade');
  assert.equal(abreviarNome('Arthur'), 'Arthur');
});

test('conectivo nao consome uma das duas vagas', () => {
  // Sem pular o conectivo, o corte devolveria "Ana de".
  assert.equal(abreviarNome('Ana de Souza Lima'), 'Ana Souza');
  assert.equal(abreviarNome('Maria da Silva Santos'), 'Maria Silva');
});

test('espaco extra e borda nao geram palavra vazia', () => {
  assert.equal(abreviarNome('  Joao   Pedro  Almeida '), 'Joao Pedro');
  assert.equal(abreviarNome(''), '');
  assert.equal(abreviarNome(null), '');
  assert.equal(abreviarNome(undefined), '');
});

test('nome formado so por conectivos cai no corte cru em vez de string vazia', () => {
  // String vazia quebraria o Select do Radix, que proibe value="".
  assert.equal(abreviarNome('de da do'), 'de da');
});

test('dois nomes distintos nunca colapsam no mesmo texto', () => {
  // O texto abreviado e o que se grava em registrado_por (coluna text, sem FK):
  // colapsar tornaria impossivel saber depois quem registrou.
  const curtos = abreviarNomesSemColisao(['Mayra Alves Silva', 'Mayra Alves Costa', 'Arthur']);
  assert.deepEqual(curtos, ['Mayra Alves Silva', 'Mayra Alves Costa', 'Arthur']);
  assert.equal(new Set(curtos).size, 3);
});

test('quem nao colide continua curto', () => {
  const curtos = abreviarNomesSemColisao([
    'Mayra Alves Silva',
    'Mayra Alves Costa',
    'Joana Ribeiro Prado',
  ]);
  assert.equal(curtos[2], 'Joana Ribeiro');
});

test('cadastros homonimos exatos nao entram em loop nem incham', () => {
  // Nada distingue os dois; alongar deixaria ambos longos sem ganho algum.
  assert.deepEqual(abreviarNomesSemColisao(['Ana Paula', 'Ana Paula']), ['Ana Paula', 'Ana Paula']);
});

test('lista vazia ou ausente nao quebra', () => {
  assert.deepEqual(abreviarNomesSemColisao([]), []);
  assert.deepEqual(abreviarNomesSemColisao(undefined), []);
});
