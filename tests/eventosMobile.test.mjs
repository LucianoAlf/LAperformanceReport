import assert from 'node:assert/strict';
import test from 'node:test';
import { abaFoiPortada, rotaTemFaixaPorAba } from '../src/mobile/abasPortadas.ts';

test('detalhe do evento: a faixa e por aba, e so a Grade foi adaptada', () => {
  assert.equal(rotaTemFaixaPorAba('/app/eventos/21'), true);
  assert.equal(abaFoiPortada('/app/eventos/21', 'grade'), true);
  for (const aba of ['alunos', 'palco', 'bilheteria', 'revisao', 'checkin']) {
    assert.equal(abaFoiPortada('/app/eventos/21', aba), false, aba);
  }
});

test('o * casa um segmento so: a lista de eventos segue com a faixa do shell', () => {
  assert.equal(rotaTemFaixaPorAba('/app/eventos'), false);
  assert.equal(rotaTemFaixaPorAba('/app/eventos/21/algo'), false);
  assert.equal(abaFoiPortada('/app/eventos', 'grade'), false);
});
