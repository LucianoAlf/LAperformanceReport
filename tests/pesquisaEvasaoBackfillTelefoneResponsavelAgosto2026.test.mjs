import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260801174500_pesquisa_evasao_backfill_telefone_responsavel_agosto_2026.sql',
);
const triggerPath = resolve(
  repoRoot,
  'supabase/migrations/20260801023000_pesquisa_evasao_backfill_telefone_responsavel_julho_2026.sql',
);
const runbookPath = resolve(
  repoRoot,
  'docs/runbooks/pesquisa-evasao-subprojeto-a-rollout.md',
);

const readOptional = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';
const migration = readOptional(migrationPath);
const triggerMigration = readFileSync(triggerPath, 'utf8');
const runbook = readFileSync(runbookPath, 'utf8');

test('backfill de agosto falha fechado sobre as dez movimentacoes conhecidas', () => {
  assert.ok(migration, 'migration de agosto ainda não existe');
  assert.match(migration, /v_expected_ids\s+integer\[\]\s*:=\s*array\s*\[\s*3473\s*,\s*3475\s*,\s*3476\s*,\s*3477\s*,\s*3480\s*,\s*3483\s*,\s*3484\s*,\s*3485\s*,\s*3486\s*,\s*3488\s*\]/i);
  assert.match(migration, /v_total\s*<>\s*10/i);
  assert.match(migration, /raise\s+exception[\s\S]*conjunto[\s\S]*mudou/i);
  assert.match(migration, /get\s+diagnostics\s+v_atualizadas\s*=\s*row_count/i);
  assert.match(migration, /v_atualizadas\s*<>\s*10/i);
});

test('backfill de agosto usa responsável do menor sem tocar julho nem sobrescrever snapshot', () => {
  assert.match(migration, /m\.data\s*>=\s*date\s*'2026-08-01'/i);
  assert.doesNotMatch(migration, /m\.data\s*>=\s*date\s*'2026-07-01'/i);
  assert.match(migration, /m\.tipo\s+in\s*\(\s*'evasao'\s*,\s*'nao_renovacao'\s*\)/i);
  assert.match(migration, /is_movimentacao_admin_retencao_valida\s*\(\s*m\.id\s*\)/i);
  assert.match(migration, /nullif\s*\(\s*btrim\s*\(\s*m\.telefone_snapshot\s*\)\s*,\s*''\s*\)\s+is\s+null/i);
  assert.match(migration, /extract\s*\(\s*year\s+from\s+age\s*\(\s*m\.data\s*,\s*a\.data_nascimento\s*\)\s*\)\s*::\s*integer\s*<\s*18/i);
  assert.match(migration, /nullif\s*\(\s*btrim\s*\(\s*a\.responsavel_telefone\s*\)\s*,\s*''\s*\)\s+is\s+not\s+null/i);
  assert.match(migration, /telefone_snapshot\s*=\s*nullif\s*\(\s*btrim\s*\(\s*a\.responsavel_telefone\s*\)/i);
  assert.match(migration, /telefone_snapshot_origem\s*=\s*'cadastro_responsavel_backfill_2026_08'/i);
});

test('trigger atual já captura responsável de toda nova saída de menor', () => {
  assert.match(triggerMigration, /create\s+or\s+replace\s+function\s+public\.capturar_telefone_snapshot_movimentacao_retencao/i);
  assert.match(triggerMigration, /age\s*\(\s*coalesce\s*\(\s*new\.data\s*,\s*current_date\s*\)\s*,\s*a\.data_nascimento\s*\)/i);
  assert.match(triggerMigration, /then\s+nullif\s*\(\s*btrim\s*\(\s*a\.responsavel_telefone\s*\)/i);
});

test('runbook registra a janela de causa raiz e a proveniência de agosto', () => {
  assert.match(runbook, /janela[\s\S]*trigger original[\s\S]*13:04:36/i);
  assert.match(runbook, /cadastro_responsavel_backfill_2026_08/i);
  assert.match(runbook, /10\s+saídas|dez\s+saídas/i);
  assert.match(runbook, /novas saídas de menores[\s\S]*responsavel_telefone/i);
});
