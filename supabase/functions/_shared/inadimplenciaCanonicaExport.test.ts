/// <reference lib="deno.ns" />

import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { prepararExportacaoInadimplenciaCanonica } from './inadimplenciaCanonicaExport.ts';

const UNIDADE_CG = '11111111-1111-4111-8111-111111111111';
const AGORA_MS = Date.parse('2026-08-16T12:00:00.000Z');
const FRESH_UNTIL = '2026-08-16T13:00:00.000Z';

const item = (overrides: Record<string, unknown> = {}) => ({
  canonical_fatura_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  unidade_id: UNIDADE_CG,
  unidade_codigo: 'CG',
  competencia: '2026-08-01',
  run_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  sync_completed_at: '2026-08-16T11:30:00.000Z',
  sync_fresh_until: FRESH_UNTIL,
  emusys_fatura_id: '9007199254740993',
  emusys_matricula_id: '9007199254740995',
  emusys_contrato_id: '9007199254740997',
  aluno_id_canonico: 10,
  contact_resolution_status: 'resolved',
  descricao: 'Parcela 08/2026',
  status: 'aberta',
  data_vencimento: '2026-08-05',
  data_pagamento: null,
  dias_atraso: 11,
  valor_original: 447,
  desconto_condicional_perdido: 40,
  multa_pct: 0.02,
  mora_pct_mes: 0.01,
  valor_atualizado: 457.58,
  source_missing: false,
  ...overrides,
});

const reconciliation = (overrides: Record<string, unknown> = {}) => ({
  status: 'clear',
  source_missing_count: 0,
  source_missing_open_count: 0,
  source_missing_other_count: 0,
  duplicate_fatura_count: 0,
  invalid_identity_invoice_count: 0,
  contact_resolution_pending_count: 0,
  validation_issue_count: 0,
  ...overrides,
});

const payload = (overrides: Record<string, unknown> = {}) => ({
  schema_version: 3,
  status: 'ok',
  fonte: 'sync_run_items',
  avaliado_em: '2026-08-16T11:31:00.000Z',
  unidade_id: UNIDADE_CG,
  as_of_date: '2026-08-16',
  policy: {
    delinquency_rule: 'd_plus_0',
    collection_grace_days: 2,
  },
  operational: {
    collection_allowed: true,
    collection_scope: 'confirmed_only',
    consumer_must_apply_collection_grace: true,
    block_reasons: [],
  },
  freshness: {
    competencias_necessarias: 1,
    competencias_frescas: 1,
    competencias_stale: 0,
    fresh_until: FRESH_UNTIL,
  },
  reconciliation: reconciliation(),
  totals: {
    total_faturas: 1,
    total_matriculas: 1,
    total_original: 447,
    total_atualizado: 457.58,
    maior_atraso: 11,
  },
  items: [item()],
  ...overrides,
});

const contexto = (agoraMs = AGORA_MS) => ({
  unidadeId: UNIDADE_CG,
  asOfDate: '2026-08-16',
  agoraMs,
});

Deno.test('v3 ok permitido e fresco exporta somente faturas confirmadas', async () => {
  const resultado = await prepararExportacaoInadimplenciaCanonica(payload(), contexto());

  assertEquals(resultado.itens.length, 1);
  assertEquals(resultado.itens[0].canonical_fatura_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
  assertEquals(resultado.itens[0].emusys_fatura_id, '9007199254740993');
  assertEquals(resultado.itens[0].emusys_matricula_id, '9007199254740995');
  assertEquals(resultado.itens[0].emusys_contrato_id, '9007199254740997');
  assertEquals(resultado.itens[0].status, 'aberta');
  assertEquals(resultado.itens[0].source_missing, false);
  assertEquals(resultado.manifesto.status, 'ok');
  assertEquals(resultado.manifesto.is_fresh, true);
});

Deno.test('data de corte omitida usa a data efetiva publicada pela RPC', async () => {
  const resultado = await prepararExportacaoInadimplenciaCanonica(payload(), {
    unidadeId: UNIDADE_CG,
    asOfDate: null,
    agoraMs: AGORA_MS,
  });

  assertEquals(resultado.manifesto.as_of_date, '2026-08-16');
});

Deno.test('v3 partial fresco nao visita nem exporta unknown_invoices', async () => {
  const reconciliationWithTrap = reconciliation({
    status: 'pending',
    source_missing_count: 2,
    source_missing_open_count: 2,
    invalid_identity_invoice_count: 1,
    validation_issue_count: 1,
  });
  Object.defineProperty(reconciliationWithTrap, 'unknown_invoices', {
    enumerable: true,
    get() {
      throw new Error('unknown_invoices nao pode ser visitado');
    },
  });

  const resultado = await prepararExportacaoInadimplenciaCanonica(payload({
    status: 'partial',
    reconciliation: reconciliationWithTrap,
  }), contexto());

  assertEquals(resultado.itens.length, 1);
  assertEquals(resultado.manifesto.source_missing_count, 2);
  assertEquals(resultado.manifesto.invalid_identity_invoice_count, 1);
  assertEquals('unknown_invoices' in resultado.manifesto, false);
});

Deno.test('partial bloqueado e estados stale ou incomplete sao rejeitados', async () => {
  const bloqueados = [
    payload({
      status: 'partial',
      operational: {
        collection_allowed: false,
        collection_scope: 'blocked',
        consumer_must_apply_collection_grace: true,
        block_reasons: ['manual_block'],
      },
    }),
    payload({
      status: 'stale',
      operational: {
        collection_allowed: false,
        collection_scope: 'blocked',
        consumer_must_apply_collection_grace: true,
        block_reasons: ['stale_competencia'],
      },
      items: [],
    }),
    payload({
      status: 'incomplete',
      operational: {
        collection_allowed: false,
        collection_scope: 'blocked',
        consumer_must_apply_collection_grace: true,
        block_reasons: ['duplicate_confirmed_fatura'],
      },
      items: [],
    }),
  ];

  for (const bloqueado of bloqueados) {
    await assertRejects(
      () => prepararExportacaoInadimplenciaCanonica(bloqueado, contexto()),
      Error,
      'leitura canonica indisponivel',
    );
  }
});

Deno.test('contrato v3 rejeita versao, politica e gate divergentes', async () => {
  const invalidos = [
    payload({ schema_version: 2 }),
    payload({ policy: { delinquency_rule: 'd_plus_1', collection_grace_days: 2 } }),
    payload({ policy: { delinquency_rule: 'd_plus_0', collection_grace_days: 1 } }),
    payload({
      operational: {
        collection_allowed: true,
        collection_scope: 'blocked',
        consumer_must_apply_collection_grace: true,
        block_reasons: [],
      },
    }),
    payload({
      operational: {
        collection_allowed: true,
        collection_scope: 'confirmed_only',
        consumer_must_apply_collection_grace: false,
        block_reasons: [],
      },
    }),
  ];

  for (const invalido of invalidos) {
    await assertRejects(
      () => prepararExportacaoInadimplenciaCanonica(invalido, contexto()),
      Error,
      'leitura canonica indisponivel',
    );
  }
});

Deno.test('fresh_until invalido, ausente com competencia e fronteira agora maior ou igual bloqueiam', async () => {
  const invalidos = [
    payload({ freshness: { competencias_necessarias: 1, competencias_frescas: 1, competencias_stale: 0, fresh_until: 'invalido' } }),
    payload({ freshness: { competencias_necessarias: 1, competencias_frescas: 1, competencias_stale: 0, fresh_until: null } }),
  ];

  for (const invalido of invalidos) {
    await assertRejects(
      () => prepararExportacaoInadimplenciaCanonica(invalido, contexto()),
      Error,
      'leitura canonica indisponivel',
    );
  }

  await assertRejects(
    () => prepararExportacaoInadimplenciaCanonica(payload(), contexto(Date.parse(FRESH_UNTIL))),
    Error,
    'leitura canonica indisponivel',
  );
});

Deno.test('fresh_until nulo e permitido somente sem competencias necessarias e sem divida', async () => {
  const resultado = await prepararExportacaoInadimplenciaCanonica(payload({
    freshness: {
      competencias_necessarias: 0,
      competencias_frescas: 0,
      competencias_stale: 0,
      fresh_until: null,
    },
    totals: {
      total_faturas: 0,
      total_matriculas: 0,
      total_original: 0,
      total_atualizado: 0,
      maior_atraso: 0,
    },
    items: [],
  }), contexto());

  assertEquals(resultado.itens, []);
  assertEquals(resultado.manifesto.fresh_until, null);
  assertEquals(resultado.manifesto.is_fresh, true);
  assertEquals(resultado.manifesto.confirmed_invoice_count, 0);
});

Deno.test('manifesto partial publica metadados completos e hash estavel para qualquer ordem', async () => {
  const segundoItem = item({
    canonical_fatura_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa0',
    emusys_fatura_id: '9007199254740999',
    emusys_matricula_id: '9007199254741001',
    emusys_contrato_id: null,
    valor_original: 100,
    valor_atualizado: 102.37,
  });
  const partial = payload({
    status: 'partial',
    reconciliation: reconciliation({
      status: 'pending',
      source_missing_count: 2,
      source_missing_open_count: 1,
      source_missing_other_count: 1,
      invalid_identity_invoice_count: 1,
      contact_resolution_pending_count: 1,
      validation_issue_count: 3,
    }),
    totals: {
      total_faturas: 2,
      total_matriculas: 2,
      total_original: 547,
      total_atualizado: 559.95,
      maior_atraso: 11,
    },
    items: [item(), segundoItem],
  });
  const invertido = payload({
    ...partial,
    items: [segundoItem, item()],
  });

  const primeiro = await prepararExportacaoInadimplenciaCanonica(partial, contexto());
  const segundo = await prepararExportacaoInadimplenciaCanonica(invertido, contexto());

  assertEquals(primeiro.manifesto, {
    modo: 'inadimplencia',
    schema_version: 3,
    status: 'partial',
    fonte: 'sync_run_items',
    unidade_id: UNIDADE_CG,
    as_of_date: '2026-08-16',
    avaliado_em: '2026-08-16T11:31:00.000Z',
    collection_allowed: true,
    collection_scope: 'confirmed_only',
    fresh_until: FRESH_UNTIL,
    delinquency_rule: 'd_plus_0',
    collection_grace_days: 2,
    collection_grace_applied: false,
    confirmed_invoice_count: 2,
    source_missing_count: 2,
    invalid_identity_invoice_count: 1,
    contact_resolution_pending_count: 1,
    validation_issue_count: 3,
    is_fresh: true,
    totals: {
      total_faturas: 2,
      total_matriculas: 2,
      total_original: 547,
      total_atualizado: 559.95,
      maior_atraso: 11,
    },
    manifest_hash: primeiro.manifesto.manifest_hash,
  });
  assertEquals(primeiro.manifesto.manifest_hash, segundo.manifesto.manifest_hash);
  assertEquals(
    primeiro.itens.map((linha) => linha.canonical_fatura_id),
    ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa0', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'],
  );
});

Deno.test('ids textuais grandes sao preservados e identificador numerico inseguro e rejeitado', async () => {
  const textual = await prepararExportacaoInadimplenciaCanonica(payload(), contexto());
  assertEquals(textual.itens[0].emusys_fatura_id, '9007199254740993');
  assertEquals(textual.itens[0].emusys_matricula_id, '9007199254740995');

  await assertRejects(
    () => prepararExportacaoInadimplenciaCanonica(payload({
      items: [item({ emusys_fatura_id: Number('9007199254740993') })],
    }), contexto()),
    Error,
    'identificador numerico inseguro',
  );
});

Deno.test('item fora do universo confirmado nunca e exportado', async () => {
  for (const alteracao of [
    { status: 'paga' },
    { source_missing: true },
  ]) {
    await assertRejects(
      () => prepararExportacaoInadimplenciaCanonica(payload({
        items: [item(alteracao)],
      }), contexto()),
      Error,
      'leitura canonica indisponivel',
    );
  }
});
