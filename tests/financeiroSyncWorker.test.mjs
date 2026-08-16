import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyFinanceiroSyncError,
} from '../supabase/functions/_shared/financeiroSyncQueue.ts';
import {
  EmusysHttpError,
  EmusysRateLimitError,
} from '../supabase/functions/_shared/faturasSync.ts';

test('classifica 429 com Retry-After para backoff persistente', () => {
  const result = classifyFinanceiroSyncError(new EmusysRateLimitError(7_100, 'Barra'));
  assert.deepEqual(result, {
    retryable: true,
    code: 'EMUSYS_RATE_LIMIT',
    detail: 'Emusys /faturas Barra: HTTP 429',
    httpStatus: 429,
    retryAfterSeconds: 8,
  });
});
test('classifica 5xx, rede e mutex como transitorios', () => {
  const serviceUnavailable = classifyFinanceiroSyncError(
    new EmusysHttpError(503, 'Emusys indisponivel'),
  );
  assert.equal(serviceUnavailable.retryable, true);
  assert.equal(serviceUnavailable.httpStatus, 503);
  assert.equal(serviceUnavailable.code, 'EMUSYS_HTTP_503');

  const network = classifyFinanceiroSyncError(new TypeError('fetch failed'));
  assert.equal(network.retryable, true);
  assert.equal(network.code, 'NETWORK_ERROR');

  const mutex = classifyFinanceiroSyncError(
    new Error('FINANCEIRO_SYNC_MUTEX: ja existe um sync running'),
  );
  assert.equal(mutex.retryable, true);
  assert.equal(mutex.code, 'FINANCEIRO_SYNC_MUTEX');
  assert.equal(mutex.retryAfterSeconds, 60);
});

test('erros estruturais de payload ou paginacao sao terminais', () => {
  for (const error of [
    new Error('identificador invalido em id'),
    new Error('data_vencimento fora da competencia 2026-07-01'),
    new Error('cursor repetido'),
    new EmusysHttpError(400, 'requisicao invalida'),
  ]) {
    const result = classifyFinanceiroSyncError(error);
    assert.equal(result.retryable, false);
    assert.equal(result.retryAfterSeconds, null);
  }
});
