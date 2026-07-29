/// <reference lib="deno.ns" />

import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import {
  buildEmusysMatriculaIdentity,
  resolveEmusysMatriculaLifecycle,
} from './emusys-matricula-lifecycle.ts';

Deno.test('ativa entra na base operacional atual', () => {
  assertEquals(resolveEmusysMatriculaLifecycle({ status: 'ativa' }), {
    rawStatus: 'ativa',
    rawReason: null,
    localStatus: 'ativo',
    journeyStatus: 'ativa',
    movementKind: null,
    automaticTransition: true,
    auditReason: null,
  });
});

Deno.test('trancada preserva os detalhes do trancamento temporario', () => {
  const result = resolveEmusysMatriculaLifecycle({
    status: 'trancada',
    trancamento_ativo: {
      id: 44,
      motivo: 'Viagem',
      data_inicial: '2026-07-01',
      data_final: '2026-07-31',
    },
  });

  assertEquals(result.localStatus, 'trancado');
  assertEquals(result.journeyStatus, 'trancada');
  assertEquals(result.movementKind, 'trancamento');
  assertEquals(result.automaticTransition, true);
  assertEquals(result.lock, {
    id: 44,
    motivo: 'Viagem',
    dataInicial: '2026-07-01',
    dataFinal: '2026-07-31',
  });
});

Deno.test('inativa interrompida vira interrupcao definitiva', () => {
  const result = resolveEmusysMatriculaLifecycle({
    status: 'INATIVA',
    motivo_inativa: 'Interrompida',
  });

  assertEquals(result.rawReason, 'interrompida');
  assertEquals(result.localStatus, 'evadido');
  assertEquals(result.journeyStatus, 'finalizada');
  assertEquals(result.movementKind, 'evasao');
  assertEquals(result.automaticTransition, true);
});

Deno.test('inativa concluida vira contrato concluido sem evasao', () => {
  const result = resolveEmusysMatriculaLifecycle({
    status: 'inativa',
    motivo_inativa: 'Concluída',
  });

  assertEquals(result.rawReason, 'concluida');
  assertEquals(result.localStatus, 'inativo');
  assertEquals(result.journeyStatus, 'finalizada');
  assertEquals(result.movementKind, 'nao_renovacao');
  assertEquals(result.automaticTransition, true);
});

Deno.test('inativa sem motivo nao sofre transicao automatica', () => {
  const result = resolveEmusysMatriculaLifecycle({ status: 'inativa' });

  assertEquals(result.localStatus, null);
  assertEquals(result.journeyStatus, 'desconhecido');
  assertEquals(result.automaticTransition, false);
  assertEquals(result.auditReason, 'inativa_sem_motivo');
});

Deno.test('status desconhecido nunca cai para ativo', () => {
  const result = resolveEmusysMatriculaLifecycle({ status: 'pausada' });

  assertEquals(result.rawStatus, 'desconhecido');
  assertEquals(result.localStatus, null);
  assertEquals(result.journeyStatus, 'desconhecido');
  assertEquals(result.automaticTransition, false);
  assertEquals(result.auditReason, 'status_emusys_desconhecido');
});

Deno.test('finalizada legada continua legivel mas exige contexto para transicao', () => {
  const result = resolveEmusysMatriculaLifecycle({ status: 'finalizada' });

  assertEquals(result.rawStatus, 'finalizada');
  assertEquals(result.localStatus, null);
  assertEquals(result.journeyStatus, 'desconhecido');
  assertEquals(result.automaticTransition, false);
  assertEquals(result.auditReason, 'finalizada_legada_ambigua');
});

Deno.test('identidade numerica igual continua isolada por unidade', () => {
  assertEquals(
    buildEmusysMatriculaIdentity('barra', 123),
    'barra:123',
  );
  assertEquals(
    buildEmusysMatriculaIdentity('recreio', 123),
    'recreio:123',
  );
});
