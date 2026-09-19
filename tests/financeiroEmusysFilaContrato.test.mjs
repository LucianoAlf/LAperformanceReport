import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260919160000_financeiro_emusys_frescor_fila.sql',
  import.meta.url,
);
const faturasUrl = new URL('../supabase/functions/sync-faturas-emusys/index.ts', import.meta.url);
const source = () => existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '';

test('fila de varredura é durável, serial e limitada a três retries', () => {
  assert.ok(existsSync(migrationUrl), 'migration da fila do espelho financeiro ausente');
  const sql = source();

  assert.match(sql, /create table public\.sync_financeiro_emusys_queue/i);
  assert.match(sql, /pending[\s\S]*running[\s\S]*retry_wait[\s\S]*succeeded[\s\S]*failed/i);
  assert.match(sql, /max_retries[^\n]+default\s+3/i);
  assert.match(sql, /sync_financeiro_emusys_queue_one_running_uniq/i);
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /lease_expires_at/i);
  assert.match(sql, /interval\s+'30 minutes'/i);
  assert.match(sql, /pg_advisory_xact_lock[\s\S]*emusys-api-global-claim/i);
});

test('RPCs de enqueue, claim, retry, complete e fail são restritas a service_role', () => {
  const sql = source();
  for (const rpc of [
    'enqueue_sync_financeiro_emusys_job',
    'claim_sync_financeiro_emusys_job',
    'retry_sync_financeiro_emusys_job',
    'complete_sync_financeiro_emusys_job',
    'fail_sync_financeiro_emusys_job',
  ]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${rpc}`, 'i'));
  }
  assert.match(sql, /auth\.role\(\)[^;]+service_role/is);
  assert.match(sql, /revoke all[\s\S]+from public, anon, authenticated/i);
  assert.match(sql, /grant execute[\s\S]+to service_role/i);
  assert.match(sql, /DIA_CORRENTE_NAO_ENCERRADO/i);
});

test('claim de faturas compartilha mutex e cede prioridade à varredura de lançamentos', () => {
  const sql = source();
  assert.match(sql, /create or replace function public\.claim_financeiro_sync_job/i);
  assert.match(sql, /pg_advisory_xact_lock[\s\S]*sync_financeiro_emusys_queue/is);
  assert.match(sql, /status\s+in\s*\(\s*'pending'\s*,\s*'running'\s*,\s*'retry_wait'\s*\)/i);
  assert.match(sql, /time\s+'08:45'[\s\S]*time\s+'11:00'/i);
});

test('pagas no mes persiste em fila propria e e retomada pelo worker', () => {
  const sql = source();
  const edge = readFileSync(faturasUrl, 'utf8');
  assert.match(sql, /create table public\.sync_faturas_pagas_mes_queue/i);
  for (const rpc of [
    'enqueue_sync_faturas_pagas_mes_jobs',
    'claim_sync_faturas_pagas_mes_job',
    'retry_sync_faturas_pagas_mes_job',
    'complete_sync_faturas_pagas_mes_job',
    'fail_sync_faturas_pagas_mes_job',
  ]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${rpc}`, 'i'));
    assert.match(edge, new RegExp(rpc, 'i'));
  }
  assert.match(sql, /sync_faturas_pagas_mes_queue_one_running_uniq/i);
  assert.match(sql, /values\s*\(\s*'cg'\s*\)\s*,\s*\(\s*'barra'\s*\)\s*,\s*\(\s*'recreio'\s*\)/i);
  assert.match(edge, /mode\s*===\s*['"]worker['"][\s\S]*processarProximoPagasMes/is);
  assert.match(edge, /WORKER_BUDGET_MS\s*=\s*100\s*\*\s*1000/i);
  assert.match(edge, /rpcFilaPagasAusente[\s\S]*return\s+null/is);
});

test('agenda reserva financeiro, isola pagas no mês e instala semanal', () => {
  const sql = source();

  assert.match(sql, /sync-financeiro-emusys-cg-principal[\s\S]*'5 9 \* \* \*'/i);
  assert.match(sql, /sync-financeiro-emusys-recreio-principal[\s\S]*'15 9 \* \* \*'/i);
  assert.match(sql, /sync-financeiro-emusys-barra-principal[\s\S]*'25 9 \* \* \*'/i);
  assert.match(sql, /sync-financeiro-emusys-fila-worker[\s\S]*'\* \* \* \* \*'/i);
  assert.match(sql, /sync-financeiro-emusys-semanal[\s\S]*'0 4 \* \* 0'/i);

  assert.match(sql, /sync-faturas-fila-worker[\s\S]*'\* 0-8,11-23 \* \* \*'/i);
  assert.match(sql, /financeiro-sync-atual-15m[\s\S]*'3,18,33,48 0-4,6-8,11-23 \* \* \*'/i);
  assert.match(sql, /financeiro-sync-anteriores-60m[\s\S]*'7 0-4,6-8,11-23 \* \* \*'/i);
  assert.match(sql, /financeiro-sync-backlog-2h[\s\S]*'11 0,2,4,6,8,12,14,16,18,20,22 \* \* \*'/i);
  assert.match(sql, /sync-faturas-pagas-no-mes-diario[\s\S]*'0 5 \* \* \*'/i);
  assert.match(sql, /extract\(isodow[\s\S]*UTC[\s\S]*extract\(hour[\s\S]*=\s*4/i);
});

test('jobs únicos recuperam jul-set, fecham 19/09 após a virada e enfileiram faturas jan-mai', () => {
  const sql = source();

  assert.match(sql, /financeiro-emusys-recovery-jul-set-20260920[\s\S]*'0 1 20 9 \*'/i);
  assert.match(sql, /2026-07-01[\s\S]*2026-09-18/i);
  assert.match(sql, /financeiro-emusys-recovery-close-20260920[\s\S]*'5 3 20 9 \*'/i);
  assert.match(sql, /backfill-faturas-jan-mai-20260920[\s\S]*'30 3 20 9 \*'/i);
  for (const competencia of ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01']) {
    assert.match(sql, new RegExp(competencia));
  }
  assert.match(sql, /backfill_super_folha_dre_2026/i);
  assert.match(sql, /cron\.unschedule\s*\(/i);
});

test('migration invalida completo prematuro sem mudar formato das tabelas exportadas', () => {
  const sql = source();
  assert.match(sql, /update public\.financeiro_emusys_varredura_dias[\s\S]*status\s*=\s*'erro'[\s\S]*concluido_em\s*=\s*null/is);
  assert.match(sql, /DIA_CORRENTE_NAO_ENCERRADO/i);
  assert.doesNotMatch(sql, /alter table public\.financeiro_emusys_[a-z_]+[\s\S]{0,100}(add|drop|alter)\s+column/i);
});

test('edge de faturas respeita a fila de lançamentos em pagas_no_mes e antes do claim', () => {
  const edge = readFileSync(faturasUrl, 'utf8');
  assert.match(edge, /function\s+varreduraFinanceiroEmusysAtiva/i);
  assert.match(edge, /from\(['"]sync_financeiro_emusys_queue['"]\)/i);
  assert.match(edge, /mode\s*===\s*['"]pagas_no_mes['"][\s\S]*enqueue_sync_faturas_pagas_mes_jobs/is);
  assert.match(edge, /varreduraFinanceiroEmusysAtiva[\s\S]*claim_financeiro_sync_job/is);
  assert.match(edge, /backfill_super_folha_dre_2026[\s\S]{0,160}return\s+50/i);
});
