import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260801013000_pesquisa_evasao_backfill_telefone_julho_2026.sql',
);
const runbookPath = resolve(
  repoRoot,
  'docs/runbooks/pesquisa-evasao-subprojeto-a-rollout.md',
);

const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, 'utf8')
  : '';
const runbook = readFileSync(runbookPath, 'utf8');

test('migration faz backfill governado de exatamente 23 saidas de julho', () => {
  assert.ok(migration, 'migration versionada do backfill ausente');
  assert.match(
    migration,
    /add\s+column\s+if\s+not\s+exists\s+telefone_snapshot_origem\s+text/i,
  );
  assert.match(migration, /comment\s+on\s+column\s+public\.movimentacoes_admin\.telefone_snapshot_origem/i);
  assert.match(migration, /cadastro_atual_backfill_2026_07/g);
  assert.match(migration, /m\.tipo\s+in\s*\(\s*'evasao'\s*,\s*'nao_renovacao'\s*\)/i);
  assert.match(migration, /m\.data\s*>=\s*date\s*'2026-07-01'/i);
  assert.match(migration, /m\.data\s*<\s*date\s*'2026-08-01'/i);
  assert.match(migration, /nullif\s*\(\s*btrim\s*\(\s*m\.telefone_snapshot\s*\)\s*,\s*''\s*\)\s+is\s+null/i);
  assert.match(
    migration,
    /coalesce\s*\(\s*nullif\s*\(\s*btrim\s*\(\s*a\.whatsapp\s*\)\s*,\s*''\s*\)\s*,\s*nullif\s*\(\s*btrim\s*\(\s*a\.telefone\s*\)\s*,\s*''\s*\)\s*\)/i,
  );
  assert.match(migration, /a\.id\s*=\s*m\.aluno_id/i);
  assert.match(migration, /is_movimentacao_admin_retencao_valida\s*\(\s*m\.id\s*\)\s+is\s+true/i);
  assert.match(migration, /v_candidatas\s*<>\s*23/i);
  assert.match(migration, /v_atualizadas\s*<>\s*23/i);
  assert.doesNotMatch(migration, /responsavel_telefone/i);
});

test('migration nunca sobrescreve snapshot e marca a origem recuperada', () => {
  assert.match(
    migration,
    /set\s+telefone_snapshot\s*=\s*coalesce[\s\S]*?telefone_snapshot_origem\s*=\s*'cadastro_atual_backfill_2026_07'/i,
  );
  assert.match(
    migration,
    /where[\s\S]*?nullif\s*\(\s*btrim\s*\(\s*m\.telefone_snapshot\s*\)\s*,\s*''\s*\)\s+is\s+null/i,
  );
  assert.match(migration, /get\s+diagnostics\s+v_atualizadas\s*=\s*row_count/i);
  assert.match(migration, /raise\s+exception[\s\S]*23/i);
});

test('runbook registra decisao, justificativa e corrige o diagnostico cadastral', () => {
  assert.match(runbook, /backfill controlado[\s\S]*julho\/?2026/i);
  assert.match(runbook, /contato recente/i);
  assert.match(runbook, /baixa probabilidade de troca[\s\S]*30\s+dias/i);
  assert.match(runbook, /necessidade operacional[\s\S]*fila[\s\S]*agosto/i);
  assert.match(runbook, /23[\s\S]*cadastro_atual_backfill_2026_07/i);
  assert.match(runbook, /12[\s\S]*responsavel_telefone/i);
  assert.match(runbook, /3312[\s\S]*aluno_id[\s\S]*nulo[\s\S]*1532/i);
  assert.match(runbook, /diferen[cç]a[\s\S]*caixa[\s\S]*Oliveira/i);
  assert.doesNotMatch(runbook, /13 sa[ií]das[\s\S]*n[aã]o possuem nenhum contato/i);
  assert.match(runbook, /217 movimentações[\s\S]*32\s+cancelamentos[\s\S]*5\s+não renovações/i);
  assert.match(runbook, /concentra[cç][aã]o[\s\S]*primeira semana[\s\S]*ciclo de renova[cç][aã]o/i);
  assert.doesNotMatch(runbook, /lan[cç]amento[s]? de movimenta[cç][oõ]es? incomplet/i);
});
