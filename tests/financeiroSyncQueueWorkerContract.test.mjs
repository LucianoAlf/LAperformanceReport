import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260816195000_financeiro_sync_queue_worker.sql',
  import.meta.url,
);
const syncUrl = new URL('../supabase/functions/sync-faturas-emusys/index.ts', import.meta.url);

test('worker cron reprocessa a fila financeira com backoff e token técnico do Vault', () => {
  assert.ok(existsSync(migrationUrl), 'migration do worker financeiro deve existir');
  const source = readFileSync(migrationUrl, 'utf8');

  assert.match(source, /cron\.schedule\s*\(/i);
  assert.match(source, /sync-faturas-fila-worker/i);
  assert.match(source, /['"]\* \* \* \* \*['"]/i);
  assert.match(source, /functions\/v1\/sync-faturas-emusys/i);
  assert.match(source, /supabase_anon_key/i);
  assert.match(source, /sync_matriculas_admin_token/i);
  assert.match(source, /mode['"]\s*[,=:]\s*['"]worker['"]/i);
  assert.doesNotMatch(source, /include_backlog/i);
  assert.match(source, /trigger_source['"]\s*[,=:]\s*['"]cron_financeiro_sync_worker['"]/i);
  assert.doesNotMatch(source, /projeto-alertas-whatsapp|enviar-mensagem|sol_caixa/i);
});

test('worker do cron pode drenar a fila sem re-enfileirar backlog', () => {
  const source = readFileSync(syncUrl, 'utf8');

  assert.match(
    source,
    /workerAuthorized\s*=\s*access\.isServiceRole\s*\|\|\s*access\.requestedBy\s*===\s*['"]sync_admin_token['"]/i,
  );
});
