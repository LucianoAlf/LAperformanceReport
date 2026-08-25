import assert from 'node:assert/strict';
import test from 'node:test';
import {
  agruparEventosPorDia,
  construirGradeMes,
  filtrarEventosDaLista,
  limitarEventosDoDia,
} from '../src/components/App/Bandas/calendarioEventosBandas.mjs';

const evento = (id, data_inicio) => ({ evento_id: id, data_inicio });

test('agosto de 2026 ocupa seis semanas de domingo a sábado', () => {
  const dias = construirGradeMes(new Date(2026, 7, 15));
  assert.equal(dias.length, 42);
  assert.deepEqual(
    [dias[0].getFullYear(), dias[0].getMonth(), dias[0].getDate()],
    [2026, 6, 26],
  );
  assert.deepEqual(
    [dias.at(-1).getFullYear(), dias.at(-1).getMonth(), dias.at(-1).getDate()],
    [2026, 8, 5],
  );
});

test('eventos são agrupados no dia local e ordenados pelo início', () => {
  const cedo = evento(1, new Date(2026, 7, 25, 9).toISOString());
  const tarde = evento(2, new Date(2026, 7, 25, 18).toISOString());
  const grupos = agruparEventosPorDia([tarde, cedo]);
  const chave = [2026, '08', '25'].join('-');
  assert.deepEqual(grupos.get(chave)?.map((item) => item.evento_id), [1, 2]);
});

test('lista oculta somente eventos anteriores à referência', () => {
  const agora = new Date(2026, 7, 25, 12);
  const passado = evento(1, new Date(2026, 7, 25, 11, 59).toISOString());
  const futuro = evento(2, new Date(2026, 7, 25, 12, 1).toISOString());
  assert.deepEqual(
    filtrarEventosDaLista([passado, futuro], false, agora).map((item) => item.evento_id),
    [2],
  );
  assert.deepEqual(
    filtrarEventosDaLista([passado, futuro], true, agora).map((item) => item.evento_id),
    [1, 2],
  );
});

test('célula mostra três chips e informa o restante', () => {
  const resultado = limitarEventosDoDia([1, 2, 3, 4, 5]);
  assert.deepEqual(resultado.visiveis, [1, 2, 3]);
  assert.equal(resultado.restantes, 2);
});
