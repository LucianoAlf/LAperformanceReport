/// <reference lib="deno.ns" />

import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  INADIMPLENCIA_CANONICA_LOADING,
  indexarInadimplenciaPorMatricula,
  montarAlertasInadimplenciaCanonica,
  normalizarInadimplenciaCanonica,
  podeCobrarInadimplenciaCanonica,
} from './inadimplenciaCanonica.ts';

const unidadeA = '11111111-1111-1111-1111-111111111111';
const unidadeB = '22222222-2222-2222-2222-222222222222';
const freshUntil = '2026-08-15T19:00:00Z';

const item = (overrides: Record<string, unknown> = {}) => ({
  canonical_fatura_id: '10000000-0000-0000-0000-000000000001',
  unidade_id: unidadeA,
  emusys_fatura_id: '1001',
  emusys_matricula_id: '2001',
  data_vencimento: '2026-08-10',
  dias_atraso: 5,
  valor_original: 100,
  valor_atualizado: 102.17,
  sync_completed_at: '2026-08-15T18:00:00Z',
  ...overrides,
});

const zeroTotals = {
  total_faturas: 0,
  total_matriculas: 0,
  total_original: 0,
  total_atualizado: 0,
  maior_atraso: 0,
};

const oneItemTotals = {
  total_faturas: 1,
  total_matriculas: 1,
  total_original: 100,
  total_atualizado: 102.17,
  maior_atraso: 5,
};

const cleanReconciliation = {
  source_missing_count: 0,
  source_missing_open_count: 0,
  source_missing_other_count: 0,
  duplicate_fatura_count: 0,
  invalid_identity_invoice_count: 0,
  validation_issue_count: 0,
};

const partialReconciliation = {
  ...cleanReconciliation,
  source_missing_count: 1,
  source_missing_open_count: 1,
};

const fresh = (overrides: Record<string, unknown> = {}) => ({
  competencias_stale: 0,
  ultimo_sync_mais_antigo: '2026-08-15T18:00:00Z',
  fresh_until: freshUntil,
  ...overrides,
});

const payloadV2 = (overrides: Record<string, unknown> = {}) => ({
  schema_version: 2,
  status: 'ok',
  avaliado_em: '2026-08-15T18:01:00Z',
  freshness: fresh(),
  reconciliation: cleanReconciliation,
  totals: oneItemTotals,
  items: [item()],
  ...overrides,
});

const payloadV3 = (overrides: Record<string, unknown> = {}) => ({
  schema_version: 3,
  status: 'partial',
  avaliado_em: '2026-08-15T18:01:00Z',
  operational: {
    collection_allowed: true,
    collection_scope: 'confirmed_only',
    block_reasons: [],
  },
  freshness: fresh(),
  reconciliation: partialReconciliation,
  totals: oneItemTotals,
  items: [item()],
  ...overrides,
});

const blockedV3 = (
  status: 'stale' | 'incomplete' | 'error',
  overrides: Record<string, unknown> = {},
) => {
  const facts = status === 'stale'
    ? {
      freshness: fresh({ competencias_stale: 1 }),
      reconciliation: cleanReconciliation,
      block_reasons: ['stale_competencia'],
    }
    : status === 'incomplete'
    ? {
      freshness: fresh(),
      reconciliation: { ...cleanReconciliation, duplicate_fatura_count: 1 },
      block_reasons: ['duplicate_confirmed_fatura'],
    }
    : {
      freshness: fresh(),
      reconciliation: {
        ...cleanReconciliation,
        invalid_identity_invoice_count: 1,
        validation_issue_count: 1,
      },
      block_reasons: ['invalid_invoice_identity'],
      error: 'unsupported_invoice_status',
    };

  return payloadV3({
    status,
    operational: {
      collection_allowed: false,
      collection_scope: 'blocked',
      block_reasons: facts.block_reasons,
    },
    freshness: facts.freshness,
    reconciliation: facts.reconciliation,
    totals: zeroTotals,
    items: [],
    ...facts,
    ...overrides,
  });
};

const blockedV2 = (
  status: 'stale' | 'incomplete' | 'error',
  overrides: Record<string, unknown> = {},
) => payloadV2({
  status,
  totals: zeroTotals,
  items: [],
  error: status === 'error' ? 'unsupported_invoice_status' : undefined,
  ...overrides,
});

const assertLocalError = (payload: unknown) => {
  const result = normalizarInadimplenciaCanonica(payload);
  assertEquals(result.status, 'error');
  assertEquals(result.collectionAllowed, false);
  assertEquals(result.collectionScope, 'blocked');
  assertEquals(result.blockReasons, []);
  assertEquals(result.items, []);
  assertEquals([
    result.totalFaturas,
    result.totalMatriculas,
    result.totalOriginal,
    result.totalAtualizado,
    result.maiorAtraso,
    result.sourceMissingCount,
    result.sourceMissingOpenCount,
    result.sourceMissingOtherCount,
    result.duplicateFaturaCount,
    result.invalidIdentityInvoiceCount,
    result.validationIssueCount,
  ], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assertStringIncludes(result.erro ?? '', 'Resposta invalida');
};

Deno.test('v3 partial fresco preserva somente itens confirmados e permite cobranca', () => {
  const result = normalizarInadimplenciaCanonica(payloadV3());

  assertEquals([result.status, result.collectionAllowed, result.collectionScope, result.blockReasons], [
    'partial', true, 'confirmed_only', [],
  ]);
  assertEquals(result.avaliadoEm, '2026-08-15T18:01:00Z');
  assertEquals(result.items.length, 1);
  assertEquals([result.sourceMissingCount, result.sourceMissingOpenCount, result.sourceMissingOtherCount], [1, 1, 0]);
  assertEquals(podeCobrarInadimplenciaCanonica(result, new Date('2026-08-15T18:30:00Z')), true);
});

Deno.test('shape real v3 aceita error null em partial e ok fresco sem divida', () => {
  const partial = normalizarInadimplenciaCanonica(payloadV3({ error: null }));
  const ok = normalizarInadimplenciaCanonica(payloadV3({
    status: 'ok',
    error: null,
    reconciliation: cleanReconciliation,
    totals: zeroTotals,
    items: [],
    freshness: fresh({ fresh_until: null }),
  }));

  assertEquals([partial.status, partial.collectionAllowed, partial.items.length], ['partial', true, 1]);
  assertEquals([ok.status, ok.collectionAllowed, ok.freshUntil, ok.items], ['ok', true, null, []]);
});

Deno.test('v3 preserva diagnosticos de identidade sem inferir faturas por validation issues', () => {
  const semMetadata = normalizarInadimplenciaCanonica(blockedV3('incomplete', {
    reconciliation: {
      ...cleanReconciliation,
      invalid_identity_invoice_count: 1,
      validation_issue_count: 0,
    },
    operational: {
      collection_allowed: false,
      collection_scope: 'blocked',
      block_reasons: ['invalid_invoice_identity'],
    },
  }));
  const multiplasIssues = normalizarInadimplenciaCanonica(blockedV3('incomplete', {
    reconciliation: {
      ...cleanReconciliation,
      invalid_identity_invoice_count: 1,
      validation_issue_count: 2,
    },
    operational: {
      collection_allowed: false,
      collection_scope: 'blocked',
      block_reasons: ['invalid_invoice_identity'],
    },
  }));

  assertEquals([semMetadata.status, semMetadata.invalidIdentityInvoiceCount, semMetadata.validationIssueCount], [
    'incomplete', 1, 0,
  ]);
  assertEquals([multiplasIssues.status, multiplasIssues.invalidIdentityInvoiceCount, multiplasIssues.validationIssueCount], [
    'incomplete', 1, 2,
  ]);
});

Deno.test('v3 stale preserva somente o diagnostico SQL conhecido de erro', () => {
  const stale = normalizarInadimplenciaCanonica(blockedV3('stale', {
    error: 'unsupported_invoice_status',
  }));

  assertEquals([stale.status, stale.collectionAllowed, stale.collectionScope, stale.items, stale.erro], [
    'stale', false, 'blocked', [], 'unsupported_invoice_status',
  ]);
  assertLocalError(blockedV3('stale', { error: 'erro_desconhecido' }));
});

Deno.test('freshUntil expira localmente e a igualdade da fronteira falha fechada', () => {
  const result = normalizarInadimplenciaCanonica(payloadV3());

  assertEquals(podeCobrarInadimplenciaCanonica(result, new Date(freshUntil)), false);
  assertEquals(podeCobrarInadimplenciaCanonica(result, new Date('2026-08-15T19:00:00.001Z')), false);
  assertEquals(indexarInadimplenciaPorMatricula(result, new Date('2026-08-15T19:00:00.001Z')), new Map());
  assertEquals(montarAlertasInadimplenciaCanonica(result, [], new Date('2026-08-15T19:00:00.001Z')), {
    alertas: [], totalAtivos: 0, semCadastroAtivo: 0,
  });
});

Deno.test('stale, incomplete, error e loading falham fechados e nao expoem itens acionaveis', () => {
  const sqlError = normalizarInadimplenciaCanonica(blockedV3('error'));
  const states = [
    normalizarInadimplenciaCanonica(blockedV3('stale')),
    normalizarInadimplenciaCanonica(blockedV3('incomplete')),
    sqlError,
    normalizarInadimplenciaCanonica(null, { message: 'RPC indisponivel' }),
    INADIMPLENCIA_CANONICA_LOADING,
  ];

  for (const state of states) {
    assertEquals(podeCobrarInadimplenciaCanonica(state), false);
    assertEquals(state.collectionAllowed, false);
    assertEquals(state.collectionScope, 'blocked');
    assertEquals(state.items, []);
    assertEquals(indexarInadimplenciaPorMatricula(state), new Map());
    assertEquals(montarAlertasInadimplenciaCanonica(state, []), {
      alertas: [], totalAtivos: 0, semCadastroAtivo: 0,
    });
  }

  assertEquals(sqlError.erro, 'unsupported_invoice_status');
  assertEquals([
    sqlError.totalFaturas,
    sqlError.totalOriginal,
    sqlError.sourceMissingCount,
    sqlError.blockReasons,
  ], [0, 0, 0, []]);
});

Deno.test('v3 valida operational, status, error e reasons contraditorios de forma fail closed', () => {
  const invalidos = [
    payloadV3({ operational: undefined }),
    payloadV3({ operational: { collection_allowed: 'true', collection_scope: 'confirmed_only', block_reasons: [] } }),
    payloadV3({ operational: { collection_allowed: true, collection_scope: 'all', block_reasons: [] } }),
    payloadV3({ operational: { collection_allowed: true, collection_scope: 'confirmed_only', block_reasons: ['desconhecido'] } }),
    payloadV3({ operational: { collection_allowed: true, collection_scope: 'confirmed_only', block_reasons: ['stale_competencia'] } }),
    payloadV3({ error: 'unsupported_invoice_status' }),
    payloadV3({ error: { code: 'unsupported_invoice_status' } }),
    blockedV3('error', { error: 'outro_erro_sql' }),
    blockedV3('stale', { freshness: fresh({ competencias_stale: 0 }) }),
    blockedV3('incomplete', { status: 'partial' }),
    blockedV3('stale', {
      freshness: fresh({ competencias_stale: 1 }),
      reconciliation: { ...cleanReconciliation, duplicate_fatura_count: 1 },
      operational: {
        collection_allowed: false,
        collection_scope: 'blocked',
        block_reasons: ['stale_competencia'],
      },
    }),
  ];

  for (const invalido of invalidos) assertLocalError(invalido);
});

Deno.test('v3 rejeita o item inteiro para UUID, ids, datas, numeros e sync invalidos', () => {
  const invalidos: Record<string, unknown>[] = [
    { canonical_fatura_id: 'nao-uuid' },
    { unidade_id: 'nao-uuid' },
    { emusys_fatura_id: 1001 },
    { emusys_fatura_id: '  ' },
    { emusys_matricula_id: null },
    { emusys_matricula_id: 2001 },
    { data_vencimento: '2026-02-30' },
    { data_vencimento: '2026-8-10' },
    { dias_atraso: '5' },
    { dias_atraso: true },
    { dias_atraso: -1 },
    { dias_atraso: 1.5 },
    { valor_original: '100' },
    { valor_original: true },
    { valor_original: -1 },
    { valor_atualizado: '102.17' },
    { valor_atualizado: -1 },
    { sync_completed_at: '2026-08-15T18:00:00' },
    { sync_completed_at: '2026-02-30T18:00:00Z' },
    { sync_completed_at: 'nao-e-data' },
  ];

  for (const overrides of invalidos) assertLocalError(payloadV3({ items: [item(overrides)] }));
});

Deno.test('v3 exige freshness explicito e timestamp absoluto para qualquer divida confirmada', () => {
  const semFreshUntil = payloadV3();
  delete ((semFreshUntil.freshness as Record<string, unknown>).fresh_until);

  const invalidos = [
    semFreshUntil,
    payloadV3({ freshness: fresh({ fresh_until: null }) }),
    payloadV3({ freshness: fresh({ fresh_until: '2026-08-15T19:00:00' }) }),
    payloadV3({ freshness: fresh({ fresh_until: '2026-08-15' }) }),
    payloadV3({ freshness: fresh({ fresh_until: '2026-02-30T19:00:00Z' }) }),
    payloadV3({ freshness: fresh({ fresh_until: 'nao-e-data' }) }),
  ];

  for (const invalido of invalidos) assertLocalError(invalido);
});

Deno.test('v3 ok sem divida aceita freshUntil null explicitamente e continua permitido', () => {
  const result = normalizarInadimplenciaCanonica(payloadV3({
    status: 'ok',
    reconciliation: cleanReconciliation,
    totals: zeroTotals,
    items: [],
    freshness: fresh({ fresh_until: null }),
  }));

  assertEquals([result.status, result.collectionAllowed, result.freshUntil, result.items], [
    'ok', true, null, [],
  ]);
  assertEquals(podeCobrarInadimplenciaCanonica(result), true);
});

Deno.test('v3 valida totais e reconciliacao contra itens e fontes antes de liberar', () => {
  const invalidos = [
    payloadV3({ totals: { ...oneItemTotals, total_faturas: 2 } }),
    payloadV3({ totals: { ...oneItemTotals, total_matriculas: 2 } }),
    payloadV3({ totals: { ...oneItemTotals, total_original: 99.99 } }),
    payloadV3({ totals: { ...oneItemTotals, maior_atraso: 4 } }),
    payloadV3({ totals: { ...oneItemTotals, total_faturas: '1' } }),
    payloadV3({ totals: { ...oneItemTotals, total_original: true } }),
    payloadV3({ totals: { ...oneItemTotals, total_atualizado: -1 } }),
    payloadV3({ reconciliation: { ...partialReconciliation, source_missing_other_count: 1 } }),
    payloadV3({ reconciliation: { ...partialReconciliation, source_missing_count: '1' } }),
    blockedV3('error', {
      reconciliation: {
        ...cleanReconciliation,
        invalid_identity_invoice_count: 0,
        validation_issue_count: 1,
      },
      operational: {
        collection_allowed: false,
        collection_scope: 'blocked',
        block_reasons: [],
      },
    }),
    blockedV3('stale', { totals: oneItemTotals }),
    blockedV3('stale', { items: [item()] }),
  ];

  for (const invalido of invalidos) assertLocalError(invalido);
});

Deno.test('v2 conserva apenas snapshots internamente coerentes e bloqueados limpos', () => {
  const ok = normalizarInadimplenciaCanonica(payloadV2());
  const stale = normalizarInadimplenciaCanonica(blockedV2('stale'));
  const incomplete = normalizarInadimplenciaCanonica(blockedV2('incomplete'));
  const error = normalizarInadimplenciaCanonica(blockedV2('error'));

  assertEquals([ok.status, ok.collectionAllowed, ok.collectionScope], ['ok', true, 'confirmed_only']);
  assertEquals([stale.status, stale.items, stale.totalFaturas], ['stale', [], 0]);
  assertEquals([incomplete.status, incomplete.items, incomplete.totalFaturas], ['incomplete', [], 0]);
  assertEquals([error.status, error.erro, error.items, error.totalFaturas], [
    'error', 'unsupported_invoice_status', [], 0,
  ]);

  assertLocalError(blockedV2('stale', { totals: oneItemTotals }));
  assertLocalError(blockedV2('incomplete', { items: [item()] }));
  assertLocalError(blockedV2('error', { totals: oneItemTotals }));
  assertLocalError(payloadV2({ totals: { ...oneItemTotals, total_atualizado: 1 } }));
});

Deno.test('v2 ok exige reconciliacao limpa e freshness valido para qualquer divida', () => {
  const semFreshness = payloadV2();
  delete (semFreshness as Record<string, unknown>).freshness;
  const zeroDebt = normalizarInadimplenciaCanonica(payloadV2({
    totals: zeroTotals,
    items: [],
    freshness: fresh({ fresh_until: null }),
  }));
  const invalidos = [
    semFreshness,
    payloadV2({ freshness: fresh({ fresh_until: null }) }),
    payloadV2({ freshness: fresh({ competencias_stale: 1 }) }),
    payloadV2({ reconciliation: { ...cleanReconciliation, duplicate_fatura_count: 1 } }),
    payloadV2({
      reconciliation: {
        ...cleanReconciliation,
        invalid_identity_invoice_count: 1,
        validation_issue_count: 0,
      },
    }),
    payloadV2({
      reconciliation: {
        ...cleanReconciliation,
        source_missing_count: 1,
        source_missing_other_count: 1,
      },
    }),
  ];

  assertEquals([zeroDebt.status, zeroDebt.collectionAllowed, zeroDebt.freshUntil, zeroDebt.items], [
    'ok', true, null, [],
  ]);
  for (const invalido of invalidos) assertLocalError(invalido);
});

Deno.test('v3 rejeita dinheiro sem centavos seguros e soma que excede safe integer', () => {
  const limiteIndividual = payloadV3({
    items: [item({ valor_original: Number.MAX_VALUE, valor_atualizado: Number.MAX_VALUE })],
    totals: { ...oneItemTotals, total_original: Number.MAX_VALUE, total_atualizado: Number.MAX_VALUE },
  });
  const tresCasas = payloadV3({
    items: [item({ valor_original: 0.001, valor_atualizado: 0.001 })],
    totals: { ...oneItemTotals, total_original: 0.001, total_atualizado: 0.001 },
  });
  const fracaoMicroscopica = payloadV3({
    items: [item({ valor_original: 1.00000000001, valor_atualizado: 1.00000000001 })],
    totals: { ...oneItemTotals, total_original: 1.00000000001, total_atualizado: 1.00000000001 },
  });
  const metadeMaximoSeguro = 45_035_996_273_704.96;
  const overflow = payloadV3({
    items: [
      item({ valor_original: metadeMaximoSeguro, valor_atualizado: metadeMaximoSeguro }),
      item({
        canonical_fatura_id: '10000000-0000-0000-0000-000000000002',
        emusys_fatura_id: '1002',
        valor_original: metadeMaximoSeguro,
        valor_atualizado: metadeMaximoSeguro,
      }),
    ],
    totals: {
      total_faturas: 2,
      total_matriculas: 1,
      total_original: metadeMaximoSeguro * 2,
      total_atualizado: metadeMaximoSeguro * 2,
      maior_atraso: 5,
    },
  });

  assertLocalError(limiteIndividual);
  assertLocalError(tresCasas);
  assertLocalError(fracaoMicroscopica);
  assertLocalError(overflow);
});

Deno.test('source missing nao entra no dinheiro e a mesma matricula em unidades distintas gera chaves independentes', () => {
  const itemB = item({
    canonical_fatura_id: '10000000-0000-0000-0000-000000000002',
    unidade_id: unidadeB,
    emusys_fatura_id: '1002',
    valor_original: 50,
    valor_atualizado: 51.1,
    dias_atraso: 7,
    sync_completed_at: '2026-08-15T17:30:00Z',
  });
  const result = normalizarInadimplenciaCanonica(payloadV3({
    items: [item(), itemB],
    totals: {
      total_faturas: 2,
      total_matriculas: 2,
      total_original: 150,
      total_atualizado: 153.27,
      maior_atraso: 7,
    },
    reconciliation: {
      ...partialReconciliation,
      source_missing_count: 3,
      source_missing_open_count: 1,
      source_missing_other_count: 2,
    },
  }));
  const index = indexarInadimplenciaPorMatricula(result, new Date('2026-08-15T18:30:00Z'));

  assertEquals([result.totalFaturas, result.totalOriginal, result.totalAtualizado], [2, 150, 153.27]);
  assertEquals(index.size, 2);
  assertEquals(index.get(`${unidadeA}|2001`)?.valorAtualizado, 102.17);
  assertEquals(index.get(`${unidadeB}|2001`)?.valorAtualizado, 51.1);
});

Deno.test('indice escolhe sync mais recente por epoch e alerta preserva a chave unidade matricula', () => {
  const second = item({
    canonical_fatura_id: '10000000-0000-0000-0000-000000000002',
    emusys_fatura_id: '1002',
    valor_original: 50,
    valor_atualizado: 51.1,
    dias_atraso: 7,
    sync_completed_at: '2026-08-15T17:30:00Z',
  });
  const first = item({ sync_completed_at: '2026-08-15T18:00:00+02:00' });
  const state = normalizarInadimplenciaCanonica(payloadV3({
    items: [first, second],
    totals: {
      total_faturas: 2,
      total_matriculas: 1,
      total_original: 150,
      total_atualizado: 153.27,
      maior_atraso: 7,
    },
  }));
  const agora = new Date('2026-08-15T18:30:00Z');

  assertEquals(indexarInadimplenciaPorMatricula(state, agora).get(`${unidadeA}|2001`), {
    faturas: 2,
    valorAtualizado: 153.27,
    maiorAtraso: 7,
    ultimoSync: '2026-08-15T17:30:00Z',
  });

  const alertas = montarAlertasInadimplenciaCanonica(state, [{
    id: 10,
    nome: 'Aluno Principal',
    unidade_id: unidadeA,
    emusys_matricula_id: '2001',
    status: 'ativo',
    arquivado_em: null,
    telefone: '5521888888888',
    professor: { id: 7, nome: 'Professor Principal' },
    curso: { nome: 'Piano' },
  }, {
    id: 20,
    nome: 'Aluno Curso Extra',
    unidade_id: unidadeA,
    emusys_matricula_id: '2001',
    status: 'ativo',
    arquivado_em: null,
    is_segundo_curso: true,
    professor: { id: 8, nome: 'Professor Extra' },
    curso: { nome: 'Canto' },
  }], agora);

  assertEquals(alertas.alertas[0]?.ultimo_sync, '2026-08-15T17:30:00Z');
  assertEquals(alertas.alertas[0]?.unidade_id, unidadeA);
  assertEquals(alertas.alertas[0]?.aluno_id, 10);
  assert(alertas.totalAtivos === 1);
});
