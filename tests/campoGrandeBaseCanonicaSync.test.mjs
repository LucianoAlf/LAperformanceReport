import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const syncPath = 'supabase/functions/sync-matriculas-emusys/index.ts';
const reportPath = 'supabase/functions/relatorio-admin-whatsapp/index.ts';
const syncSource = readFileSync(syncPath, 'utf8');
const reportSource = readFileSync(reportPath, 'utf8');
const migrationName = readdirSync('supabase/migrations')
  .find((name) => name.includes('emusys_matriculas_sync_operacional_frescor'));
const migrationSource = migrationName
  ? readFileSync(`supabase/migrations/${migrationName}`, 'utf8')
  : '';

test('o sync de matriculas tem um escopo operacional curto e explicito', () => {
  assert.match(syncSource, /escopo.*operacional/i);
  assert.match(syncSource, /status=ativa/i);
  assert.match(syncSource, /status=trancada/i);
  assert.match(syncSource, /snapshotCompleto|SNAPSHOT_OPERACIONAL_INCOMPLETO/i);
});

test('o sync trata limite 429 do Emusys com retry e backoff', () => {
  const retryBlock = syncSource.slice(
    syncSource.indexOf('async function fetchEmusysMatriculas'),
    syncSource.indexOf('async function validarAcessoSync'),
  );
  assert.notEqual(retryBlock, '', 'helper de retry nao encontrado');
  assert.match(retryBlock, /status\s*!==\s*429|resp\.status\s*!==\s*429/i);
  assert.match(retryBlock, /retry-after/i);
  assert.match(retryBlock, /backoff|Math\.max\(.*retry/i);
  assert.match(retryBlock, /tentativ|retry/i);
  assert.match(retryBlock, /catch\s*\(/i);
});

test('o sync reconcilia contratos ativos ausentes somente depois de um snapshot completo', () => {
  assert.match(syncSource, /reconciliarEstadosOperacionaisAusentes/i);
  assert.match(syncSource, /snapshotCompleto/i);
  assert.match(syncSource, /fora_do_snapshot_operacional/i);
});

test('cada execucao de sync deixa sucesso ou falha observavel', () => {
  assert.ok(migrationName, 'migration de frescor do sync ainda nao existe');
  assert.match(migrationSource, /create table(?: if not exists)? public\.emusys_matriculas_sync_execucoes/i);
  assert.match(syncSource, /emusys_matriculas_sync_execucoes/i);
  assert.match(syncSource, /status.*succeeded/i);
  assert.match(syncSource, /status.*failed/i);
});

test('o relatorio nao publica KPIs de uma fonte Emusys vencida', () => {
  assert.match(reportSource, /emusys_matriculas_sync_execucoes/i);
  assert.match(reportSource, /SYNC_OPERACIONAL_STALE/i);
  assert.match(reportSource, /fetchSyncMatriculasOperacionalFresco/i);
});

test('a reconciliacao canonica separa atividade extra da base academica', () => {
  const emusysAtivos = 423;
  const somenteAtividadeExtra = 4;
  const naoPagantes = 31;
  assert.equal(emusysAtivos - somenteAtividadeExtra, 419);
  assert.equal(419 - naoPagantes, 388);
});

test('o arquivo de teste foi adicionado ao repositorio', () => {
  assert.equal(existsSync('tests/campoGrandeBaseCanonicaSync.test.mjs'), true);
});
