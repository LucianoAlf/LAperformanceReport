import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260816013455_financeiro_sync_queue.sql',
  import.meta.url,
);

const sql = () => existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '';

test('fila financeira duravel tem estados, unicidade ativa e claim nao bloqueante', () => {
  assert.ok(existsSync(migrationUrl), 'migration da fila financeira deve existir');
  const source = sql();

  assert.match(source, /create table public\.financeiro_sync_queue/i);
  assert.match(source, /pending[\s\S]*running[\s\S]*retry_wait[\s\S]*succeeded[\s\S]*failed/i);
  assert.match(source, /financeiro_sync_queue_competencia_active_uniq/i);
  assert.match(source, /financeiro_sync_queue_one_running_uniq/i);
  assert.match(source, /for update skip locked/i);
  assert.match(source, /lease_expires_at/i);
});

test('fila expoe enqueue, backlog, claim, retry, conclusao e falha somente ao service role', () => {
  const source = sql();
  for (const rpc of [
    'enqueue_financeiro_sync_competencias',
    'enqueue_financeiro_sync_backlog',
    'claim_financeiro_sync_job',
    'retry_financeiro_sync_job',
    'complete_financeiro_sync_job',
    'fail_financeiro_sync_job',
  ]) {
    assert.match(source, new RegExp(`create or replace function public\\.${rpc}`, 'i'));
  }

  assert.match(source, /auth\.role\(\)[^;]+service_role/is);
  assert.match(source, /revoke all[\s\S]+from public, anon, authenticated/i);
  assert.match(source, /grant execute[\s\S]+to service_role/i);
});

test('backlog usa o ultimo snapshot completo e inclui janela atual, anterior e seguinte', () => {
  const source = sql();

  assert.match(source, /distinct on\s*\(\s*sr\.competencia\s*\)/i);
  assert.match(source, /snapshot_complete\s*=\s*true/i);
  assert.match(source, /unidades_concluidas\s*=\s*3/i);
  assert.match(source, /i\.status\s*=\s*'aberta'/i);
  assert.match(source, /i\.source_missing\s+is\s+true/i);
  assert.match(source, /interval\s+'1 month'/i);
  assert.match(source, /interval\s+'-1 month'|interval\s+'1 month'[\s\S]+-/i);
});

test('retry persiste Retry-After e backoff exponencial limitado', () => {
  const source = sql();

  assert.match(source, /p_retry_after_seconds/i);
  assert.match(source, /next_attempt_at/i);
  assert.match(source, /power\s*\(\s*2/i);
  assert.match(source, /least\s*\(\s*3600/i);
  assert.match(source, /greatest\s*\(/i);
  assert.match(source, /max_attempts/i);
});

test('migration neutraliza somente os tres crons diretos e nao liga outro', () => {
  const source = sql();

  for (const job of [
    'sync-faturas-competencia-atual',
    'sync-faturas-competencia-anterior',
    'sync-faturas-competencia-seguinte',
  ]) {
    assert.match(source, new RegExp(job));
  }
  assert.match(source, /cron\.unschedule/i);
  assert.doesNotMatch(source, /cron\.schedule\s*\(/i);
});
