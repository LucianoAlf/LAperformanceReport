import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const migrationsDir = path.join(root, 'supabase', 'migrations');
const syncUrl = path.join(root, 'supabase', 'functions', 'sync-faturas-emusys', 'index.ts');

function schedulerMigration() {
  const migrationName = fs.readdirSync(migrationsDir)
    .filter((name) => /_financeiro_sync_agendador_v1\.sql$/u.test(name))
    .sort()
    .at(-1);
  assert.ok(migrationName, 'migration do agendador financeiro v1 ausente');
  return fs.readFileSync(path.join(migrationsDir, migrationName), 'utf8');
}

test('agendador financeiro produz snapshots recorrentes na fila unica', () => {
  const source = schedulerMigration();

  assert.match(source, /financeiro-sync-atual-15m/i);
  assert.match(source, /3,18,33,48\s+\*\s+\*\s+\*\s+\*/i);
  assert.match(source, /cron_financeiro_current_15m/i);

  assert.match(source, /financeiro-sync-anteriores-60m/i);
  assert.match(source, /7\s+\*\s+\*\s+\*\s+\*/i);
  assert.match(source, /interval\s+'1 month'/i);
  assert.match(source, /interval\s+'2 months'/i);
  assert.match(source, /cron_financeiro_previous_60m/i);

  assert.match(source, /financeiro-sync-backlog-2h/i);
  assert.match(source, /11\s+\*\/2\s+\*\s+\*\s+\*/i);
  assert.match(source, /include_backlog['"]?\s*,\s*true/i);
  assert.match(source, /cron_financeiro_backlog_2h/i);

  assert.match(source, /functions\/v1\/sync-faturas-emusys/i);
  assert.match(source, /x-sync-token/i);
  assert.doesNotMatch(source, /sol_caixa|enviar-mensagem|projeto-alertas-whatsapp/i);
});

test('prioridades preservam refresh manual a frente da rotina e backlog', () => {
  const source = fs.readFileSync(syncUrl, 'utf8');

  assert.match(source, /cron_financeiro_current_15m/i);
  assert.match(source, /cron_financeiro_previous_60m/i);
  assert.match(source, /p_priority\s*:\s*priorityForFinanceiroTrigger/i);
  assert.match(source, /internal_refresh/i);
  assert.match(source, /return\s+50/i);
  assert.match(source, /return\s+100/i);
  assert.match(source, /return\s+150/i);
});

test('prazo de frescor acompanha a cadencia de cada produtor da fila', () => {
  const source = fs.readFileSync(syncUrl, 'utf8');

  assert.match(source, /function\s+staleTimeoutSecondsForFinanceiroTrigger/i);
  assert.match(source, /case\s+'cron_financeiro_current_15m':[\s\S]{0,120}return\s+1800/i);
  assert.match(source, /case\s+'cron_financeiro_previous_60m':[\s\S]{0,120}return\s+4500/i);
  assert.match(source, /case\s+'cron_financeiro_backlog_2h':[\s\S]{0,120}return\s+7200/i);
  assert.match(source, /p_stale_timeout_seconds\s*:\s*staleTimeoutSecondsForFinanceiroTrigger\(job\.trigger_source\)/i);
});
