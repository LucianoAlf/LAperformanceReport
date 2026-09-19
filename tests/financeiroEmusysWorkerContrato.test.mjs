import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const syncUrl = new URL('../supabase/functions/sync-financeiro-emusys/index.ts', import.meta.url);
const source = readFileSync(syncUrl, 'utf8');
const httpSource = readFileSync(
  new URL('../supabase/functions/_shared/financeiroEmusysHttp.ts', import.meta.url),
  'utf8',
);

test('worker expõe modos duráveis e usa todas as RPCs da fila', () => {
  for (const mode of ['enqueue_daily', 'enqueue_weekly', 'enqueue_range', 'worker']) {
    assert.match(source, new RegExp(`['"]${mode}['"]`));
  }
  for (const rpc of [
    'enqueue_sync_financeiro_emusys_job',
    'claim_sync_financeiro_emusys_job',
    'retry_sync_financeiro_emusys_job',
    'complete_sync_financeiro_emusys_job',
    'fail_sync_financeiro_emusys_job',
  ]) {
    assert.match(source, new RegExp(`['"]${rpc}['"]`));
  }
});

test('429 e 5xx são tipados sem sleep exponencial dentro da função', () => {
  assert.match(source, /financeiroEmusysHttp\.ts/i);
  assert.match(source, /EmusysFinanceiroHttpError/i);
  assert.match(`${source}\n${httpSource}`, /EMUSYS_HTTP_429/i);
  assert.match(`${source}\n${httpSource}`, /EMUSYS_HTTP_5XX/i);
  assert.doesNotMatch(source, /10000\s*\*\s*2\s*\*\*/i);
  assert.doesNotMatch(source, /recuo\s+exponencial/i);
  assert.doesNotMatch(source, /await\s+espera\s*\(\s*recuo/i);
});

test('dias completos voltam para a fila de processamento e hoje é recusado', () => {
  assert.match(source, /validarJanelaEncerrada/i);
  assert.match(source, /janelaRotinaDiaria/i);
  assert.match(source, /const\s+diasJanela\s*=\s*resumoJanela/i);
  assert.doesNotMatch(source, /completosSet/i);
  assert.doesNotMatch(source, /filter\s*\(\s*\(dia\)\s*=>\s*!completos/i);
});

test('erro interrompe a unidade, persiste resumo e 429 agenda mais 30 minutos', () => {
  assert.match(source, /registrarErroResumo/i);
  assert.match(source, /retry_sync_financeiro_emusys_job/i);
  assert.match(source, /erro\.codigo\s*===\s*['"]EMUSYS_HTTP_429['"]/i);
  assert.match(source, /p_retry_after_seconds/i);
  assert.match(source, /queueStatus\s*===\s*['"]retry_wait['"]\s*\?\s*202\s*:\s*500/i);
  assert.match(source, /throw\s+erro/i);
});

test('execução sem catálogo preserva catalogos_erro', () => {
  assert.match(source, /if\s*\(comCatalogos\)[\s\S]{0,300}catalogos_erro/i);
});
