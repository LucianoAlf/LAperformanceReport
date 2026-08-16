/// <reference lib="deno.ns" />

import { assertEquals } from 'jsr:@std/assert@1';
import {
  indexarInadimplenciaPorMatricula,
  normalizarInadimplenciaCanonica,
} from './inadimplenciaCanonica.ts';

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

const payload = (overrides: Record<string, unknown> = {}) => ({
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

Deno.test('normalizador falha fechado e descarta itens de snapshot stale', () => {
  const result = normalizarInadimplenciaCanonica(payload({ status: 'stale' }));
  assertEquals(result.status, 'stale');
  assertEquals(result.items, []);

  const failed = normalizarInadimplenciaCanonica(null, { message: 'RPC indisponivel' });
  assertEquals(failed.status, 'error');
  assertEquals(failed.items, []);
  assertEquals(failed.erro, 'RPC indisponivel');
});

Deno.test('indice agrega faturas e valor corrigido por unidade e matricula', () => {
  const state = normalizarInadimplenciaCanonica(payload({
    totals: {
      total_faturas: 2,
      total_matriculas: 1,
      total_original: 150,
      total_atualizado: 153.27,
      maior_atraso: 7,
    },
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
  }));

  assertEquals(indexarInadimplenciaPorMatricula(state).get(
    '11111111-1111-1111-1111-111111111111|2001',
  ), {
    faturas: 2,
    valorAtualizado: 153.27,
    maiorAtraso: 7,
    ultimoSync: '2026-08-15T18:05:00Z',
  });
});

Deno.test('resposta incompleta preserva apenas os itens explicitamente confirmados', () => {
  const result = normalizarInadimplenciaCanonica(payload({
    status: 'incomplete',
    reconciliation: {
      source_missing_count: 1,
      duplicate_fatura_count: 0,
      invalid_identity_invoice_count: 0,
      validation_issue_count: 0,
    },
  }));
  assertEquals(result.status, 'incomplete');
  assertEquals(result.sourceMissingCount, 1);
  assertEquals(result.items.length, 1);
});
