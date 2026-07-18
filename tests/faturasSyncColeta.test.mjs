import assert from 'node:assert/strict';
import test from 'node:test';

import {
  coletarFaturasUnidade,
  GlobalRateLimiter,
  mapFatura,
  REQUEST_INTERVAL_MS,
} from '../supabase/functions/_shared/faturasSync.ts';

const UNIDADE = {
  nome: 'Campo Grande',
  id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
  token: 'token-teste',
};
const COMPETENCIA = '2026-06-01';

const rawFatura = (overrides = {}) => ({
  id: '9007199254740993',
  matricula_id: '9007199254740995',
  contrato_id: 77,
  aluno_id: 88,
  descricao: 'Parcela Junho',
  status: 'paga',
  data_vencimento: '2026-06-10',
  data_pagamento: '2026-06-09',
  valor_original: '500.00',
  valor_pago: '500.00',
  juros_e_multa: 0,
  desconto_aplicado: 0,
  desconto_fixo: 0,
  desconto_condicional: 0,
  ...overrides,
});

function fakeClock() {
  let now = 0;
  const sleeps = [];
  return {
    sleeps,
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
  };
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

test('mapeia IDs bigint como texto e bloqueia ID, data ou competencia invalidos', () => {
  const mapped = mapFatura(rawFatura(), 'cg', UNIDADE, COMPETENCIA);
  assert.equal(mapped.emusys_fatura_id, '9007199254740993');
  assert.equal(mapped.competencia, COMPETENCIA);

  assert.throws(() => mapFatura(rawFatura({ id: 'x1' }), 'cg', UNIDADE, COMPETENCIA), /identificador.*invalido/i);
  assert.throws(() => mapFatura(rawFatura({ data_vencimento: '2026-02-31' }), 'cg', UNIDADE, COMPETENCIA), /data.*invalida/i);
  assert.throws(() => mapFatura(rawFatura({ data_vencimento: '2026-07-10' }), 'cg', UNIDADE, COMPETENCIA), /competencia/i);
});

test('trata matricula zero do Emusys como ausencia sem afrouxar IDs obrigatorios', () => {
  const mappedNumber = mapFatura(rawFatura({ matricula_id: 0 }), 'cg', UNIDADE, COMPETENCIA);
  const mappedString = mapFatura(rawFatura({ matricula_id: '0' }), 'cg', UNIDADE, COMPETENCIA);

  assert.equal(mappedNumber.emusys_matricula_id, null);
  assert.equal(mappedString.emusys_matricula_id, null);
  assert.throws(
    () => mapFatura(rawFatura({ id: 0 }), 'cg', UNIDADE, COMPETENCIA),
    /identificador.*invalido/i,
  );
});

test('coleta todas as paginas completas e limita globalmente a 50 requisicoes por minuto', async () => {
  const clock = fakeClock();
  const limiter = new GlobalRateLimiter(REQUEST_INTERVAL_MS, clock.sleep, clock.now);
  const requestedUrls = [];
  const responses = [
    jsonResponse({ items: [rawFatura()], paginacao: { tem_mais: true, proximo_cursor: 'cursor-2' } }),
    jsonResponse({ items: [rawFatura({ id: 2 })], paginacao: { tem_mais: false, proximo_cursor: null } }),
  ];
  const result = await coletarFaturasUnidade({
    apiBaseUrl: 'https://api.example/v1',
    competencia: COMPETENCIA,
    unidadeCodigo: 'cg',
    unidade: UNIDADE,
    limiter,
    sleepFn: clock.sleep,
    fetchFn: async (url) => {
      requestedUrls.push(String(url));
      return responses.shift();
    },
  });

  assert.equal(result.rows.length, 2);
  assert.equal(result.resumo.paginas, 2);
  assert.equal(result.resumo.recebidas_api, 2);
  assert.match(requestedUrls[1], /cursor=cursor-2/);
  assert.deepEqual(clock.sleeps, [REQUEST_INTERVAL_MS]);
});

test('bloqueia cursor repetido, tem_mais sem cursor e pagina vazia contraditoria', async () => {
  const scenarios = [
    {
      payloads: [
        { items: [rawFatura()], paginacao: { tem_mais: true, proximo_cursor: 'repetido' } },
        { items: [rawFatura({ id: 2 })], paginacao: { tem_mais: true, proximo_cursor: 'repetido' } },
      ],
      message: /cursor.*repetido/i,
    },
    {
      payloads: [{ items: [rawFatura()], paginacao: { tem_mais: true, proximo_cursor: null } }],
      message: /tem_mais.*cursor/i,
    },
    {
      payloads: [{ items: [], paginacao: { tem_mais: true, proximo_cursor: 'x' } }],
      message: /pagina vazia/i,
    },
  ];

  for (const scenario of scenarios) {
    const payloads = [...scenario.payloads];
    const limiter = new GlobalRateLimiter(0, async () => {}, () => 0);
    await assert.rejects(
      () => coletarFaturasUnidade({
        apiBaseUrl: 'https://api.example/v1',
        competencia: COMPETENCIA,
        unidadeCodigo: 'cg',
        unidade: UNIDADE,
        limiter,
        fetchFn: async () => jsonResponse(payloads.shift()),
      }),
      scenario.message,
    );
  }
});

test('bloqueia IDs duplicados dentro da unidade', async () => {
  const limiter = new GlobalRateLimiter(0, async () => {}, () => 0);
  await assert.rejects(
    () => coletarFaturasUnidade({
      apiBaseUrl: 'https://api.example/v1',
      competencia: COMPETENCIA,
      unidadeCodigo: 'cg',
      unidade: UNIDADE,
      limiter,
      fetchFn: async () => jsonResponse({
        items: [rawFatura(), rawFatura()],
        paginacao: { tem_mais: false, proximo_cursor: null },
      }),
    }),
    /ID.*duplicado/i,
  );
});

test('429 respeita Retry-After e refaz a chamada', async () => {
  const clock = fakeClock();
  const limiter = new GlobalRateLimiter(REQUEST_INTERVAL_MS, clock.sleep, clock.now);
  const responses = [
    jsonResponse({ erro: 'limite' }, { status: 429, headers: { 'Retry-After': '2' } }),
    jsonResponse({ items: [rawFatura()], paginacao: { tem_mais: false, proximo_cursor: null } }),
  ];
  const result = await coletarFaturasUnidade({
    apiBaseUrl: 'https://api.example/v1',
    competencia: COMPETENCIA,
    unidadeCodigo: 'cg',
    unidade: UNIDADE,
    limiter,
    sleepFn: clock.sleep,
    fetchFn: async () => responses.shift(),
  });

  assert.equal(result.rows.length, 1);
  assert.ok(clock.sleeps.includes(2000));
});
