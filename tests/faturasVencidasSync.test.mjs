import assert from 'node:assert/strict';
import test from 'node:test';

import {
  coletarFaturasAbertasVencidas,
  coletarPaginaFaturasAbertasVencidas,
  GlobalRateLimiter,
} from '../supabase/functions/_shared/faturasSync.ts';

const UNIDADE = {
  nome: 'Campo Grande',
  id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
  token: 'token-teste',
};

const rawFatura = (overrides = {}) => ({
  id: 9001,
  matricula_id: 501,
  contrato_id: 77,
  aluno_id: 88,
  descricao: 'Parcela',
  status: 'aberta',
  data_vencimento: '2026-06-10',
  data_pagamento: null,
  valor_original: '500.00',
  valor_pago: null,
  juros_e_multa: '19.17',
  desconto_aplicado: 0,
  desconto_fixo: 0,
  desconto_condicional: 0,
  ...overrides,
});

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('pagina de abertas vencidas pede status=aberta e a janela de vencimento', async () => {
  const limiter = new GlobalRateLimiter(0, async () => {}, () => 0);
  let requestedUrl = '';
  await coletarPaginaFaturasAbertasVencidas({
    apiBaseUrl: 'https://api.example/v1',
    dataVencimentoInicial: '2020-01-01',
    dataVencimentoFinal: '2026-10-07',
    unidade: UNIDADE,
    limiter,
    fetchFn: async (url) => {
      requestedUrl = String(url);
      return jsonResponse({ items: [rawFatura()], paginacao: { tem_mais: false } });
    },
  });
  assert.match(requestedUrl, /status=aberta/);
  assert.match(requestedUrl, /data_vencimento_inicial=2020-01-01/);
  assert.match(requestedUrl, /data_vencimento_final=2026-10-07/);
});

test('coleta multi-mes deriva a competencia do proprio vencimento', async () => {
  const limiter = new GlobalRateLimiter(0, async () => {}, () => 0);
  const result = await coletarFaturasAbertasVencidas({
    apiBaseUrl: 'https://api.example/v1',
    dataVencimentoInicial: '2020-01-01',
    dataVencimentoFinal: '2026-10-07',
    unidadeCodigo: 'cg',
    unidade: UNIDADE,
    limiter,
    fetchFn: async () => jsonResponse({
      items: [
        rawFatura({ id: 1, data_vencimento: '2026-06-10' }),
        rawFatura({ id: 2, data_vencimento: '2026-08-05' }),
        rawFatura({ id: 3, data_vencimento: '2025-12-20' }),
      ],
      paginacao: { tem_mais: false },
    }),
  });
  assert.equal(result.rows.length, 3);
  assert.deepEqual(
    result.rows.map((r) => r.competencia),
    ['2026-06-01', '2026-08-01', '2025-12-01'],
  );
  assert.equal(result.rows[0].juros_e_multa, 19.17);
  assert.equal(result.resumo.recebidas_api, 3);
});

test('pagina ate o fim respeitando cursor e bloqueia ID duplicado', async () => {
  const limiter = new GlobalRateLimiter(0, async () => {}, () => 0);
  const respostas = [
    jsonResponse({ items: [rawFatura({ id: 1 })], paginacao: { tem_mais: true, proximo_cursor: 'c2' } }),
    jsonResponse({ items: [rawFatura({ id: 2 })], paginacao: { tem_mais: false } }),
  ];
  const urls = [];
  const result = await coletarFaturasAbertasVencidas({
    apiBaseUrl: 'https://api.example/v1',
    dataVencimentoInicial: '2020-01-01',
    dataVencimentoFinal: '2026-10-07',
    unidadeCodigo: 'cg',
    unidade: UNIDADE,
    limiter,
    fetchFn: async (url) => {
      urls.push(String(url));
      return respostas.shift();
    },
  });
  assert.equal(result.rows.length, 2);
  assert.match(urls[1], /cursor=c2/);

  await assert.rejects(
    () => coletarFaturasAbertasVencidas({
      apiBaseUrl: 'https://api.example/v1',
      dataVencimentoInicial: '2020-01-01',
      dataVencimentoFinal: '2026-10-07',
      unidadeCodigo: 'cg',
      unidade: UNIDADE,
      limiter,
      fetchFn: async () => jsonResponse({
        items: [rawFatura({ id: 7 }), rawFatura({ id: 7 })],
        paginacao: { tem_mais: false },
      }),
    }),
    /ID.*duplicado/i,
  );
});
