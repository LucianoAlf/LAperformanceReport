/// <reference lib="deno.ns" />

import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import * as inadimplencia from './inadimplenciaCanonica.ts';

const {
  INADIMPLENCIA_CANONICA_LOADING,
  indexarInadimplenciaPorMatricula,
  montarAlertasInadimplenciaCanonica,
  normalizarInadimplenciaCanonica,
  podeCobrarInadimplenciaCanonica,
} = inadimplencia;

const item = (overrides: Record<string, unknown> = {}) => ({
  canonical_fatura_id: '10000000-0000-0000-0000-000000000001',
  unidade_id: '11111111-1111-1111-1111-111111111111',
  emusys_fatura_id: '1001',
  emusys_matricula_id: '2001',
  data_vencimento: '2026-08-10',
  dias_atraso: 5,
  valor_original: 100,
  valor_atualizado: 102.17,
  sync_completed_at: '2026-08-15T18:00:00Z',
  ...overrides,
});

const basePayload = (overrides: Record<string, unknown> = {}) => ({
  schema_version: 2,
  status: 'ok',
  avaliado_em: '2026-08-15T18:01:00Z',
  freshness: {
    competencias_stale: 0,
    ultimo_sync_mais_antigo: '2026-08-15T18:00:00Z',
    fresh_until: '2026-08-15T19:00:00Z',
  },
  reconciliation: {
    source_missing_count: 0,
    source_missing_open_count: 0,
    source_missing_other_count: 0,
    duplicate_fatura_count: 0,
    invalid_identity_invoice_count: 0,
    validation_issue_count: 0,
  },
  totals: {
    total_faturas: 1,
    total_matriculas: 1,
    total_original: 100,
    total_atualizado: 102.17,
    maior_atraso: 5,
  },
  items: [item()],
  ...overrides,
});

const payloadV2 = (overrides: Record<string, unknown> = {}) => basePayload(overrides);

const payloadV3 = (overrides: Record<string, unknown> = {}) => basePayload({
  schema_version: 3,
  status: 'partial',
  operational: {
    collection_allowed: true,
    collection_scope: 'confirmed_only',
    block_reasons: [],
  },
  reconciliation: {
    source_missing_count: 1,
    source_missing_open_count: 1,
    source_missing_other_count: 0,
    duplicate_fatura_count: 0,
    invalid_identity_invoice_count: 0,
    validation_issue_count: 0,
  },
  ...overrides,
});

Deno.test('v3 partial fresco preserva itens confirmados e permite cobranca', () => {
  const result = normalizarInadimplenciaCanonica(payloadV3());

  assertEquals(result.status, 'partial');
  assertEquals(result.collectionAllowed, true);
  assertEquals(result.collectionScope, 'confirmed_only');
  assertEquals(result.blockReasons, []);
  assertEquals(result.items.length, 1);
  assertEquals(result.sourceMissingOpenCount, 1);
  assertEquals(result.sourceMissingOtherCount, 0);
  assertEquals(podeCobrarInadimplenciaCanonica(result, new Date('2026-08-15T18:30:00Z')), true);
});

Deno.test('partial fresco expira localmente sem refetch e bloqueia agregadores', () => {
  const result = normalizarInadimplenciaCanonica(payloadV3());
  const agoraExpirado = new Date('2026-08-15T19:00:00.001Z');

  assertEquals(podeCobrarInadimplenciaCanonica(result, agoraExpirado), false);
  assertEquals(indexarInadimplenciaPorMatricula(result, agoraExpirado), new Map());
  assertEquals(montarAlertasInadimplenciaCanonica(result, [], agoraExpirado), {
    alertas: [],
    totalAtivos: 0,
    semCadastroAtivo: 0,
  });
});

Deno.test('no instante exato de freshUntil, a cobranca fica bloqueada', () => {
  const result = normalizarInadimplenciaCanonica(payloadV3());

  assertEquals(podeCobrarInadimplenciaCanonica(result, new Date('2026-08-15T19:00:00Z')), false);
});

Deno.test('stale, incomplete, error e loading falham fechados sem itens acionaveis', () => {
  const error = normalizarInadimplenciaCanonica(payloadV3({
    status: 'error',
    error: 'falha_sql',
    operational: {
      collection_allowed: false,
      collection_scope: 'blocked',
      block_reasons: ['invalid_invoice_identity'],
    },
    items: [],
  }));
  const states = [
    normalizarInadimplenciaCanonica(payloadV3({
      status: 'stale',
      operational: {
        collection_allowed: false,
        collection_scope: 'blocked',
        block_reasons: ['stale_competencia'],
      },
      items: [],
    })),
    normalizarInadimplenciaCanonica(payloadV3({
      status: 'incomplete',
      operational: {
        collection_allowed: false,
        collection_scope: 'blocked',
        block_reasons: ['duplicate_confirmed_fatura'],
      },
      items: [],
    })),
    error,
    INADIMPLENCIA_CANONICA_LOADING,
  ];

  for (const state of states) {
    assertEquals(podeCobrarInadimplenciaCanonica(state), false);
    assertEquals(state.collectionAllowed, false);
    assertEquals(state.collectionScope, 'blocked');
    assertEquals(state.items, []);
    assertEquals(indexarInadimplenciaPorMatricula(state), new Map());
    assertEquals(montarAlertasInadimplenciaCanonica(state, []), {
      alertas: [],
      totalAtivos: 0,
      semCadastroAtivo: 0,
    });
  }

  assertEquals([
    error.collectionAllowed,
    error.collectionScope,
    error.blockReasons,
    error.sourceMissingCount,
    error.sourceMissingOpenCount,
    error.sourceMissingOtherCount,
  ], [false, 'blocked', [], 0, 0, 0]);
});

Deno.test('v3 invalido falha fechado quando operational ou seu contrato e invalido', () => {
  const invalidos = [
    payloadV3({ operational: undefined }),
    payloadV3({ operational: { collection_allowed: 'true', collection_scope: 'confirmed_only', block_reasons: [] } }),
    payloadV3({ operational: { collection_allowed: true, collection_scope: 'all', block_reasons: [] } }),
    payloadV3({ operational: { collection_allowed: true, collection_scope: 'confirmed_only', block_reasons: ['desconhecido'] } }),
    payloadV3({
      status: 'ok',
      operational: { collection_allowed: false, collection_scope: 'blocked', block_reasons: [] },
    }),
  ];

  for (const invalido of invalidos) {
    const result = normalizarInadimplenciaCanonica(invalido);
    assertEquals(result.status, 'error');
    assertEquals(result.items, []);
    assertEquals(result.collectionAllowed, false);
    assertStringIncludes(result.erro ?? '', 'Resposta invalida');
  }
});

Deno.test('v3 bloqueado com itens e resposta invalida e nao retem cobranca', () => {
  const result = normalizarInadimplenciaCanonica(payloadV3({
    status: 'stale',
    operational: {
      collection_allowed: false,
      collection_scope: 'blocked',
      block_reasons: ['stale_competencia'],
    },
  }));

  assertEquals(result.status, 'error');
  assertEquals(result.items, []);
  assertEquals(result.collectionAllowed, false);
});

Deno.test('rollout v2 mantem somente ok permitido e nunca sintetiza partial', () => {
  const ok = normalizarInadimplenciaCanonica(payloadV2());
  const incomplete = normalizarInadimplenciaCanonica(payloadV2({ status: 'incomplete' }));
  const stale = normalizarInadimplenciaCanonica(payloadV2({ status: 'stale' }));

  assertEquals([ok.status, ok.collectionAllowed, ok.collectionScope], ['ok', true, 'confirmed_only']);
  assertEquals([incomplete.status, incomplete.collectionAllowed, incomplete.collectionScope, incomplete.items], [
    'incomplete', false, 'blocked', [],
  ]);
  assertEquals([stale.status, stale.collectionAllowed, stale.collectionScope, stale.items], [
    'stale', false, 'blocked', [],
  ]);
});

Deno.test('contagens source missing abertas e outras nao entram nos totais ou indice financeiro', () => {
  const result = normalizarInadimplenciaCanonica(payloadV3({
    reconciliation: {
      source_missing_count: 3,
      source_missing_open_count: 1,
      source_missing_other_count: 2,
      duplicate_fatura_count: 0,
      invalid_identity_invoice_count: 0,
      validation_issue_count: 0,
    },
  }));

  assertEquals([result.sourceMissingCount, result.sourceMissingOpenCount, result.sourceMissingOtherCount], [3, 1, 2]);
  assertEquals([result.totalFaturas, result.totalOriginal, result.totalAtualizado], [1, 100, 102.17]);
  assertEquals(indexarInadimplenciaPorMatricula(result, new Date('2026-08-15T18:30:00Z')).get(
    '11111111-1111-1111-1111-111111111111|2001',
  ), {
    faturas: 1,
    valorAtualizado: 102.17,
    maiorAtraso: 5,
    ultimoSync: '2026-08-15T18:00:00Z',
  });
});

Deno.test('erro escalar SQL v3 preserva identificador e falha fechado', () => {
  const result = normalizarInadimplenciaCanonica(payloadV3({
    status: 'error',
    error: 'unsupported_invoice_status',
    operational: {
      collection_allowed: false,
      collection_scope: 'blocked',
      block_reasons: ['invalid_invoice_identity'],
    },
    items: [],
  }));

  assertEquals(result.status, 'error');
  assertEquals(result.erro, 'unsupported_invoice_status');
  assertEquals(result.items, []);
  assertEquals(result.collectionAllowed, false);
});

Deno.test('timestamp de expiracao invalido falha fechado', () => {
  const result = normalizarInadimplenciaCanonica(payloadV3({
    freshness: {
      competencias_stale: 0,
      ultimo_sync_mais_antigo: '2026-08-15T18:00:00Z',
      fresh_until: 'nao-e-uma-data',
    },
  }));

  assertEquals(podeCobrarInadimplenciaCanonica(result), false);
});

Deno.test('alerta operacional preserva a chave exata unidade e matricula em estado permitido', () => {
  const state = normalizarInadimplenciaCanonica(payloadV3({
    items: [
      item(),
      item({
        canonical_fatura_id: '10000000-0000-0000-0000-000000000002',
        emusys_fatura_id: '1002',
        valor_original: 50,
        valor_atualizado: 51.1,
        dias_atraso: 7,
        sync_completed_at: '2026-08-15T18:05:00Z',
      }),
    ],
    totals: {
      total_faturas: 2,
      total_matriculas: 1,
      total_original: 150,
      total_atualizado: 153.27,
      maior_atraso: 7,
    },
  }));

  const resultado = montarAlertasInadimplenciaCanonica(state, [{
    id: 10,
    nome: 'Aluno Principal',
    unidade_id: '11111111-1111-1111-1111-111111111111',
    emusys_matricula_id: '2001',
    status: 'ativo',
    arquivado_em: null,
    is_segundo_curso: false,
    telefone: '5521888888888',
    professor: { id: 7, nome: 'Professor Principal' },
    curso: { nome: 'Piano' },
  }], new Date('2026-08-15T18:30:00Z'));

  assertEquals(resultado.alertas, [{
    aluno_id: 10,
    aluno_nome: 'Aluno Principal',
    whatsapp: '5521888888888',
    unidade_id: '11111111-1111-1111-1111-111111111111',
    emusys_matricula_id: '2001',
    valor_atualizado: 153.27,
    total_faturas: 2,
    professor_id: 7,
    professor_nome: 'Professor Principal',
    instrumento: 'Piano',
    dias_atraso: 7,
    ultimo_sync: '2026-08-15T18:05:00Z',
  }]);
  assert(resultado.totalAtivos === 1);
});
