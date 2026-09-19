/// <reference lib="deno.ns" />

import { assertEquals } from 'jsr:@std/assert@1';
import {
  activeQueuePayload,
  currentCompetenciaSaoPaulo,
  freshSnapshotPayload,
  isFreshCompleteSnapshot,
  resolveIncludeBacklog,
} from './refreshContasReceber.ts';

const AGORA = new Date('2026-09-19T18:00:00.000Z');

const runCompleto = {
  id: '11111111-1111-4111-8111-111111111111',
  competencia: '2026-01-01',
  run_type: 'live',
  status: 'succeeded',
  completed_at: '2026-09-19T17:45:00.000Z',
  stale_after: '2026-09-19T18:15:00.000Z',
  unidades_concluidas: 3,
  snapshot_complete: true,
  total_emusys: 1004,
  total_inseridos: 0,
  total_atualizados: 1004,
  total_ausentes_marcados: 0,
  units_summary: [{ unidade: 'cg', total: 341 }],
};

Deno.test('competencia corrente respeita o fuso de Sao Paulo na virada do mes', () => {
  assertEquals(currentCompetenciaSaoPaulo(new Date('2026-10-01T01:30:00.000Z')), '2026-09-01');
  assertEquals(currentCompetenciaSaoPaulo(new Date('2026-10-01T03:30:00.000Z')), '2026-10-01');
});

Deno.test('pedido de um mes fechado nunca inclui backlog', () => {
  assertEquals(resolveIncludeBacklog(undefined, ['2026-01-01'], AGORA), false);
  assertEquals(resolveIncludeBacklog(true, ['2026-01-01'], AGORA), false);
  assertEquals(resolveIncludeBacklog(false, ['2026-01-01'], AGORA), false);

  assertEquals(resolveIncludeBacklog(undefined, ['2026-09-01'], AGORA), true);
  assertEquals(resolveIncludeBacklog(undefined, [], AGORA), true);
  assertEquals(resolveIncludeBacklog(undefined, ['2026-01-01', '2026-02-01'], AGORA), true);
});

Deno.test('somente snapshot live completo e dentro de stale_after e reutilizavel', () => {
  assertEquals(isFreshCompleteSnapshot(runCompleto, AGORA), true);
  assertEquals(isFreshCompleteSnapshot({ ...runCompleto, stale_after: AGORA.toISOString() }, AGORA), true);
  assertEquals(
    isFreshCompleteSnapshot({ ...runCompleto, stale_after: '2026-09-19T17:59:59.999Z' }, AGORA),
    false,
  );
  assertEquals(isFreshCompleteSnapshot({ ...runCompleto, snapshot_complete: false }, AGORA), false);
  assertEquals(isFreshCompleteSnapshot({ ...runCompleto, unidades_concluidas: 2 }, AGORA), false);
  assertEquals(isFreshCompleteSnapshot(null, AGORA), false);
});

Deno.test('snapshot fresco devolve o mesmo contrato de uma conclusao do worker', () => {
  assertEquals(freshSnapshotPayload(runCompleto), {
    ok: true,
    queued: false,
    queue_status: 'succeeded',
    next_attempt_at: null,
    sync_run_id: runCompleto.id,
    competencia: '2026-01-01',
    snapshot_complete: true,
    resultado: {
      sync_run_id: runCompleto.id,
      status: 'succeeded',
      competencia: '2026-01-01',
      snapshot_complete: true,
      unidades_concluidas: 3,
      total_emusys: 1004,
      total_inseridos: 0,
      total_atualizados: 1004,
      total_ausentes_marcados: 0,
    },
    unidades: [{ unidade: 'cg', total: 341 }],
  });
});

Deno.test('job ativo volta com o mesmo id sem criar outra unidade de fila', () => {
  const job = {
    id: '22222222-2222-4222-8222-222222222222',
    competencia: '2026-01-01',
    status: 'running' as const,
    priority: 50,
    attempt_count: 1,
    max_attempts: 12,
    next_attempt_at: '2026-09-19T17:59:00.000Z',
  };

  assertEquals(activeQueuePayload(job), {
    ok: true,
    queued: true,
    queue_status: 'running',
    next_attempt_at: job.next_attempt_at,
    sync_run_id: null,
    jobs: [job],
  });
});
