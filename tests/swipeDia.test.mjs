import test from 'node:test';
import assert from 'node:assert/strict';

import {
  swipeInicial,
  aoPressionar,
  aoMover,
  aoSoltar,
  LIMIAR_EIXO_PX,
  LIMIAR_TROCA_FRACAO,
} from '../src/lib/swipeDia.ts';

const L = 390;
const TOTAL = 3;
const opcoes = { largura: L, total: TOTAL };

// Aplica uma sequencia de movimentos a partir de um toque em (0, 0).
function arrastar(estado, pontos) {
  let e = aoPressionar(estado, { x: 0, y: 0 });
  for (const p of pontos) e = aoMover(e, p, opcoes);
  return e;
}

test('zona morta: abaixo de 10px nenhum eixo e decidido e nada se move', () => {
  const e = arrastar({ ...swipeInicial, indice: 1 }, [{ x: 6, y: 4 }]);
  assert.equal(e.eixo, null);
  assert.equal(e.dx, 0);
  assert.equal(LIMIAR_EIXO_PX, 10);
});

test('movimento horizontal decide eixo x e o painel segue o dedo', () => {
  const e = arrastar({ ...swipeInicial, indice: 1 }, [{ x: 40, y: 5 }]);
  assert.equal(e.eixo, 'x');
  assert.equal(e.dx, 40);
});

test('movimento vertical decide eixo y e a maquina nao move nada', () => {
  const e = arrastar({ ...swipeInicial, indice: 1 }, [{ x: 5, y: 40 }]);
  assert.equal(e.eixo, 'y');
  assert.equal(e.dx, 0);
});

test('o eixo NAO e reavaliado no meio do arrasto', () => {
  // Comeca vertical e depois vira muito horizontal: se a maquina reavaliasse,
  // o painel comecaria a deslizar no meio da rolagem. E o tremor diagonal.
  const e = arrastar({ ...swipeInicial, indice: 1 }, [
    { x: 4, y: 30 },
    { x: 200, y: 32 },
  ]);
  assert.equal(e.eixo, 'y');
  assert.equal(e.dx, 0);
});

test('decidido x, continua x mesmo que o dedo desca muito depois', () => {
  const e = arrastar({ ...swipeInicial, indice: 1 }, [
    { x: 30, y: 2 },
    { x: 35, y: 300 },
  ]);
  assert.equal(e.eixo, 'x');
  assert.equal(e.dx, 35);
});

test('resistencia de 25% na primeira ponta', () => {
  const e = arrastar({ ...swipeInicial, indice: 0 }, [{ x: 100, y: 0 }]);
  assert.equal(e.dx, 25);
});

test('resistencia de 25% na ultima ponta', () => {
  const e = arrastar({ ...swipeInicial, indice: TOTAL - 1 }, [{ x: -100, y: 0 }]);
  assert.equal(e.dx, -25);
});

test('no meio nao ha resistencia em nenhum sentido', () => {
  assert.equal(arrastar({ ...swipeInicial, indice: 1 }, [{ x: 100, y: 0 }]).dx, 100);
  assert.equal(arrastar({ ...swipeInicial, indice: 1 }, [{ x: -100, y: 0 }]).dx, -100);
});

test('soltar abaixo do limiar volta ao mesmo dia', () => {
  const quase = Math.floor(L * LIMIAR_TROCA_FRACAO) - 1;
  const e = aoSoltar(arrastar({ ...swipeInicial, indice: 1 }, [{ x: -quase, y: 0 }]), opcoes);
  assert.equal(e.indice, 1);
  assert.equal(e.dx, 0);
  assert.equal(e.eixo, null);
});

test('soltar acima do limiar para a esquerda avanca um dia', () => {
  const passa = Math.ceil(L * LIMIAR_TROCA_FRACAO) + 1;
  const e = aoSoltar(arrastar({ ...swipeInicial, indice: 1 }, [{ x: -passa, y: 0 }]), opcoes);
  assert.equal(e.indice, 2);
  assert.equal(e.dx, 0);
});

test('soltar acima do limiar para a direita volta um dia', () => {
  const passa = Math.ceil(L * LIMIAR_TROCA_FRACAO) + 1;
  const e = aoSoltar(arrastar({ ...swipeInicial, indice: 1 }, [{ x: passa, y: 0 }]), opcoes);
  assert.equal(e.indice, 0);
});

test('arrasto vertical longo nunca troca o dia', () => {
  const e = aoSoltar(arrastar({ ...swipeInicial, indice: 1 }, [{ x: 2, y: 400 }]), opcoes);
  assert.equal(e.indice, 1);
});

test('a ponta nao passa nem com arrasto enorme', () => {
  const e = aoSoltar(arrastar({ ...swipeInicial, indice: 0 }, [{ x: 900, y: 0 }]), opcoes);
  assert.equal(e.indice, 0);
});

test('aoMover sem aoPressionar e ignorado', () => {
  // Um pointermove pode chegar sem o down correspondente (ponteiro entrou na
  // area com o botao ja pressionado). Isso nao pode mover nada.
  const e = aoMover({ ...swipeInicial, indice: 1 }, { x: 200, y: 0 }, opcoes);
  assert.equal(e.dx, 0);
  assert.equal(e.arrastando, false);
});

test('aoSoltar sem arrasto nenhum e inofensivo', () => {
  const e = aoSoltar({ ...swipeInicial, indice: 1 }, opcoes);
  assert.equal(e.indice, 1);
  assert.equal(e.dx, 0);
});
