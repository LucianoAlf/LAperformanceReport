/// <reference lib="deno.ns" />
import { assertEquals, assertInstanceOf } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import {
  criarErroHttpFinanceiroEmusys,
  EmusysFinanceiroHttpError,
  retryAfterSegundos,
} from './financeiroEmusysHttp.ts';

Deno.test('HTTP 429 tem rótulo próprio e preserva Retry-After', () => {
  const erro = criarErroHttpFinanceiroEmusys({
    status: 429,
    caminho: '/financeiro/lancamentos',
    unidade: 'recreio',
    retryAfter: '75',
    detalhe: 'rate limit',
  });

  assertInstanceOf(erro, EmusysFinanceiroHttpError);
  assertEquals(erro.codigo, 'EMUSYS_HTTP_429');
  assertEquals(erro.status, 429);
  assertEquals(erro.retryAfterSeconds, 75);
  assertEquals(
    erro.message,
    'EMUSYS_HTTP_429 em /financeiro/lancamentos (recreio): HTTP 429 - rate limit',
  );
});

Deno.test('HTTP 5xx usa rótulo 5XX sem fingir que foi 429', () => {
  for (const status of [500, 502, 503]) {
    const erro = criarErroHttpFinanceiroEmusys({
      status,
      caminho: '/financeiro/plano_contas',
      unidade: 'cg',
      retryAfter: null,
      detalhe: 'erro desconhecido',
    });
    assertEquals(erro.codigo, 'EMUSYS_HTTP_5XX');
    assertEquals(erro.status, status);
    assertEquals(erro.retryAfterSeconds, null);
  }
});

Deno.test('Retry-After aceita segundos e data HTTP', () => {
  const agora = Date.parse('2026-09-19T14:00:00Z');
  assertEquals(retryAfterSegundos('60', agora), 60);
  assertEquals(retryAfterSegundos('Sat, 19 Sep 2026 14:01:30 GMT', agora), 90);
  assertEquals(retryAfterSegundos('inválido', agora), null);
  assertEquals(retryAfterSegundos(null, agora), null);
});
