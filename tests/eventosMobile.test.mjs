import assert from 'node:assert/strict';
import test from 'node:test';
import { abaFoiPortada, rotaTemFaixaPorAba } from '../src/mobile/abasPortadas.ts';

test('detalhe do evento: as 6 abas foram adaptadas ao celular', () => {
  assert.equal(rotaTemFaixaPorAba('/app/eventos/21'), true);
  for (const aba of ['alunos', 'grade', 'palco', 'bilheteria', 'revisao', 'documentos', 'checkin']) {
    assert.equal(abaFoiPortada('/app/eventos/21', aba), true, aba);
  }
  // Aba nova nasce com a faixa: so sai dela quem for adaptado de proposito.
  assert.equal(abaFoiPortada('/app/eventos/21', 'aba-nova'), false);
});

test('o * casa um segmento so: a lista de eventos segue com a faixa do shell', () => {
  assert.equal(rotaTemFaixaPorAba('/app/eventos'), false);
  assert.equal(rotaTemFaixaPorAba('/app/eventos/21/algo'), false);
  assert.equal(abaFoiPortada('/app/eventos', 'grade'), false);
});
