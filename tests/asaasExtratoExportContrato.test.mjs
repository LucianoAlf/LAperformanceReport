import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const exportSource = readFileSync(
  new URL('../supabase/functions/export-financeiro-asaas-extrato/index.ts', import.meta.url),
  'utf8',
);
const syncSource = readFileSync(
  new URL('../supabase/functions/sync-asaas-emusys/index.ts', import.meta.url),
  'utf8',
);

test('export usa o segredo compartilhado do Super Folha', () => {
  assert.match(exportSource, /x-super-folha-sync-secret/);
  assert.match(exportSource, /SUPER_FOLHA_FINANCEIRO_SECRET/);
  assert.match(exportSource, /SUPER_FOLHA_CONTAS_RECEBER_SECRET/);
});

test('export limita o intervalo a um ano por chamada', () => {
  assert.match(exportSource, /INTERVALO_MAXIMO_DIAS\s*=\s*366/);
});

test('export nao devolve payload por padrao, so com incluir_payload', () => {
  assert.match(exportSource, /incluir_payload\s*===\s*true/);
  assert.match(exportSource, /incluirPayload\s*\?\s*\{\s*payload:\s*i\.payload\s*\}\s*:\s*\{\}/);
});

test('export devolve varredura, convenios, totais_por_tipo, controle e itens', () => {
  for (const chave of ['varredura', 'convenios', 'totais_por_tipo', 'controle', 'itens']) {
    assert.match(exportSource, new RegExp(`\\b${chave}\\b`));
  }
});

test('itens do export levam tracking completo', () => {
  for (const campo of ['primeira_vez_visto', 'ultima_vez_visto', 'alterado_em', 'sumiu_em']) {
    assert.match(exportSource, new RegExp(`\\b${campo}\\b`));
  }
});

test('sync nao trata dia com erro como vazio e marca quebra de balance', () => {
  assert.match(syncSource, /balance_quebras/);
  assert.match(syncSource, /varredura_dias/);
});

test('fila do extrato Asaas tem claim e renovacao de lease como as demais', () => {
  assert.match(syncSource, /attempt_count/);
  assert.match(syncSource, /claim_sync_asaas_extrato_job/);
  assert.match(syncSource, /renew_sync_asaas_extrato_job_lease/);
});
