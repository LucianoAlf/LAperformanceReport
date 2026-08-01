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
const driftAudit = readFileSync(
  resolve(repoRoot, 'docs/auditorias/2026-07-31-drift-main-plano-a.md'),
  'utf8',
);
const supabaseConfig = readFileSync(
  resolve(repoRoot, 'supabase/config.toml'),
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

test('runbook registra a prova final e a destruicao do descartavel', () => {
  assert.match(runbook, /didpawhgvkarzntvktzu/i);
  assert.match(runbook, /ddl-evasao-final-a78ea2/i);
  assert.match(runbook, /1\.151 vers[oõ]es/i);
  assert.match(
    runbook,
    /20260730170000[\s\S]*20260730173000[\s\S]*20260730180100/i,
  );
  assert.match(runbook, /backfill ignorado: pesquisa_evasao vazia/i);
  assert.match(runbook, /seed[\s\S]*duas vezes[\s\S]*fingerprint/i);
  assert.match(runbook, /verify-pesquisa-evasao-schema\.sql[\s\S]*rollback/i);
  assert.match(runbook, /zero projetos[\s\S]*ddl-evasao-final/i);
  assert.match(runbook, /tihdmpdlimgmozsfjmwu[\s\S]*destru[ií]do/i);
});

test('auditoria da main preserva os dois gateways e prova que o ensaio nao ficou defasado', () => {
  assert.match(
    supabaseConfig,
    /\[functions\.enviar-pesquisa-evasao\]\s*verify_jwt\s*=\s*true/i,
  );
  assert.match(
    supabaseConfig,
    /\[functions\.sync-presenca-emusys\][\s\S]{0,240}verify_jwt\s*=\s*false/i,
  );
  assert.match(driftAudit, /4e2584a775b59c5e5a4ee5c6d99233af3d1dd93a/i);
  assert.match(driftAudit, /55 commits/i);
  assert.match(driftAudit, /19 migrations[\s\S]*j[aá]\s+estavam em produ[cç][aã]o/i);
  assert.match(driftAudit, /3 migrations[\s\S]*n[aã]o est[aã]o em produ[cç][aã]o/i);
  assert.match(driftAudit, /1\.151[\s\S]*20260731200406/i);
  assert.match(driftAudit, /didpawhgvkarzntvktzu[\s\S]*n[aã]o[\s\S]*defasad/i);
  assert.match(driftAudit, /7 falhas[\s\S]*origin\/main[\s\S]*n[aã]o s[aã]o regress[aã]o/i);
  for (const path of [
    '.claude/memory/integracao-infra.md',
    'docs/MAPA-INTEGRACAO-EMUSYS.md',
    'docs/MAPA-SISTEMA.md',
    'docs/METRICAS.md',
    'supabase/config.toml',
  ]) {
    assert.ok(driftAudit.includes(path), `sobreposicao ausente: ${path}`);
  }
});
