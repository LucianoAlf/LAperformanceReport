import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runbook = readFileSync(
  resolve(repoRoot, 'docs/runbooks/pesquisa-evasao-subprojeto-a-rollout.md'),
  'utf8',
);

const legacyTestIds = [
  '5edc499f-4a91-4ebb-a291-0f052bc16351',
  '416624a9-2d74-4c26-a083-c6aadba21bf2',
  '718fa72e-ca51-4995-960f-575bb00c2b0e',
  '1b918f39-c528-431d-9d7d-3d9160982e6a',
  '61ebbbd0-a8e8-4e77-99ee-d4ff9bcc6f03',
  '147a6632-fccb-4089-9ae0-13db822d7bf9',
];

test('runbook exige postflight dos seis legados como modo teste em producao', () => {
  assert.match(
    runbook,
    /ordem de rollout em produ[cç][aã]o[\s\S]*conferir o backfill dos seis testes/i,
  );
  for (const id of legacyTestIds) {
    assert.match(runbook, new RegExp(id, 'i'));
  }
  assert.match(
    runbook,
    /os seis legados est[aã]o com `modo_teste = true`/i,
  );
  assert.match(
    runbook,
    /Se a contagem n[aã]o for seis, parar/i,
  );
});

test('runbook define o ensaio descartavel sem dados nem segredos', () => {
  assert.match(runbook, /ambiente[\s\S]*descart[aá]vel/i);
  assert.match(runbook, /schema-only/i);
  assert.match(runbook, /verify-pesquisa-evasao-schema\.sql/i);
  assert.match(runbook, /sem dados/i);
  assert.match(runbook, /sem (?:dados ou )?segredos/i);
  assert.match(runbook, /destru[ií]do[\s\S]*ao final|destru[ií]do ao final/i);
});
