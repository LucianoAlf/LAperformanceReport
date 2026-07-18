import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260718230000_fatia3b_reconciliacao_frescor_faturas.sql',
  import.meta.url,
);
const syncUrl = new URL('../supabase/functions/sync-faturas-emusys/index.ts', import.meta.url);
const exportUrl = new URL('../supabase/functions/export-contas-receber/index.ts', import.meta.url);
const refreshUrl = new URL('../supabase/functions/refresh-contas-receber/index.ts', import.meta.url);
const sharedSyncUrl = new URL('../supabase/functions/_shared/faturasSync.ts', import.meta.url);
const sharedExportUrl = new URL('../supabase/functions/_shared/contasReceberExport.ts', import.meta.url);
const configUrl = new URL('../supabase/config.toml', import.meta.url);

const readIfPresent = (url) => existsSync(url) ? readFileSync(url, 'utf8') : '';

test('migration versionada cria runs, snapshots, eventos e baseline legado auditado', () => {
  assert.ok(existsSync(migrationUrl), 'migration versionada da Fatia 3b deve existir');
  const sql = readIfPresent(migrationUrl);

  assert.match(sql, /create table(?: if not exists)? public\.sync_runs/i);
  assert.match(sql, /create table(?: if not exists)? public\.sync_run_items/i);
  assert.match(sql, /create table(?: if not exists)? public\.emusys_fatura_source_events/i);
  assert.match(sql, /run_type[^\n]+baseline/i);
  assert.match(sql, /from public\.emusys_faturas/i);
  assert.match(sql, /snapshot_complete/i);
});

test('mutex global, timeout e transicoes separadas sao garantidos no banco', () => {
  const sql = readIfPresent(migrationUrl);

  assert.match(sql, /create unique index[\s\S]+where status = 'running'/i);
  assert.match(sql, /start_financeiro_sync_run/i);
  assert.match(sql, /publish_financeiro_sync_run/i);
  assert.match(sql, /fail_financeiro_sync_run/i);
  assert.match(sql, /stale/i);
  assert.match(sql, /before update or delete[\s\S]+sync_run_items/i);
});

test('publicacao atomica aplica sanidade e override auditado somente por service_role', () => {
  const sql = readIfPresent(migrationUrl);

  assert.match(sql, /v_missing_count\s*>\s*20/i);
  assert.match(sql, /v_missing_count[\s\S]+0\.05/i);
  assert.match(sql, /sync_run_overrides/i);
  assert.match(sql, /service_role/i);
  assert.match(sql, /override_reason/i);
  assert.match(sql, /source_missing_reason/i);
});

test('sync coleta tres unidades antes de publicar e registra falha fora da publicacao', () => {
  const source = readIfPresent(syncUrl);

  assert.match(source, /start_financeiro_sync_run/);
  assert.match(source, /publish_financeiro_sync_run/);
  assert.match(source, /fail_financeiro_sync_run/);
  assert.match(source, /Object\.entries\(UNIDADES\)/);
  assert.doesNotMatch(source, /\.from\('emusys_faturas'\)[\s\S]{0,160}\.upsert\(/);
});

test('coletor compartilhado torna paginacao, ids, datas, rate limit e 429 testaveis', () => {
  assert.ok(existsSync(sharedSyncUrl), 'modulo compartilhado do coletor deve existir');
  const source = readIfPresent(sharedSyncUrl);

  assert.match(source, /REQUEST_INTERVAL_MS\s*=\s*1(?:0\d\d|1\d\d\d|200)/);
  assert.match(source, /Retry-After/i);
  assert.match(source, /tem_mais/);
  assert.match(source, /cursor[^\n]+repetid/i);
  assert.match(source, /pagina vazia/i);
  assert.match(source, /identificador[^\n]+invalid/i);
  assert.match(source, /data[^\n]+invalid/i);
  assert.match(source, /duplicad/i);
});

test('refresh interno retorna run e export le somente o snapshot completo exato', () => {
  assert.ok(existsSync(refreshUrl), 'endpoint refresh-contas-receber deve existir');
  const refresh = readIfPresent(refreshUrl);
  const exporter = readIfPresent(exportUrl);

  assert.match(refresh, /sync_run_id/);
  assert.match(refresh, /competencia/i);
  assert.match(exporter, /sync_run_id/);
  assert.match(exporter, /snapshot_complete/);
  assert.match(exporter, /\.from\('sync_run_items'\)/);
  assert.doesNotMatch(exporter, /\.from\('emusys_faturas'\)/);
});

test('refresh de uma competencia declara snapshot completo no contrato de resposta', () => {
  const refresh = readIfPresent(refreshUrl);

  assert.match(refresh, /snapshot_complete/);
  assert.match(refresh, /resultado[^\n]+snapshot_complete|snapshot_complete[^\n]+resultado/);
});

test('export publica o ultimo run completo e honra require_latest', () => {
  const exporter = readIfPresent(exportUrl);
  const sharedExport = readIfPresent(sharedExportUrl);

  assert.match(sharedExport, /latest_complete_sync_run_id/);
  assert.match(exporter, /require_latest/);
  assert.match(exporter, /run solicitado nao e o ultimo snapshot completo/i);
});

test('export sem sync_run_id seleciona o ultimo snapshot live completo da competencia', () => {
  const exporter = readIfPresent(exportUrl);

  assert.match(exporter, /\.eq\('run_type',\s*'live'\)/);
  assert.match(exporter, /\.eq\('status',\s*'succeeded'\)/);
  assert.match(exporter, /\.eq\('snapshot_complete',\s*true\)/);
  assert.match(exporter, /\.order\('completed_at',\s*\{\s*ascending:\s*false\s*\}\)/);
  assert.doesNotMatch(exporter, /sync_run_id UUID obrigatorio/);
});

test('cron atual e anterior e endpoints internos usam Vault sem segredo versionado', () => {
  const sql = readIfPresent(migrationUrl);
  const config = readIfPresent(configUrl);

  assert.match(sql, /vault\.decrypted_secrets/);
  assert.match(sql, /refresh-contas-receber/);
  assert.match(sql, /cron\.schedule/);
  assert.match(sql, /competencias[^\n]+atual[^\n]+anterior/i);
  assert.doesNotMatch(sql, /SYNC_FATURAS_ADMIN_TOKEN\s*[:=]\s*['"][^'"]+/i);
  assert.match(config, /\[functions\.refresh-contas-receber\]/);
});
