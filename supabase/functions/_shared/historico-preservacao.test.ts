/// <reference lib="deno.ns" />

import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { classificarEstadoAula } from './historico-preservacao.ts';

Deno.test('classifica aula vista no snapshot corrente', () => {
  assertEquals(classificarEstadoAula({ vistoNoSnapshotCorrente: true }), 'visto');
});

Deno.test('distingue ausencia corrente de historico preservado', () => {
  assertEquals(classificarEstadoAula({ vistoNoSnapshotCorrente: false }), 'ausente_no_snapshot_corrente');
  assertEquals(
    classificarEstadoAula({ vistoNoSnapshotCorrente: false, presenteNoFechamentoHistorico: true }),
    'historico_preservado',
  );
});

Deno.test('classifica remanejamento e cancelamento antes da ausencia', () => {
  assertEquals(
    classificarEstadoAula({ vistoNoSnapshotCorrente: true, movida: true }),
    'movido',
  );
  assertEquals(
    classificarEstadoAula({ vistoNoSnapshotCorrente: false, cancelada: true }),
    'cancelado',
  );
});
