import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260801023000_pesquisa_evasao_backfill_telefone_responsavel_julho_2026.sql',
);
const edgePath = resolve(
  repoRoot,
  'supabase/functions/enviar-pesquisa-evasao/index.ts',
);
const runbookPath = resolve(
  repoRoot,
  'docs/runbooks/pesquisa-evasao-subprojeto-a-rollout.md',
);
const specPath = resolve(
  repoRoot,
  'docs/superpowers/specs/2026-07-30-pesquisa-evasao-v2-mapa-sinais-design.md',
);
const typesPath = resolve(
  repoRoot,
  'src/components/App/SucessoCliente/pesquisaEvasao.types.ts',
);
const tabPath = resolve(
  repoRoot,
  'src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx',
);

const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, 'utf8')
  : '';
const edge = readFileSync(edgePath, 'utf8');
const runbook = readFileSync(runbookPath, 'utf8');
const spec = readFileSync(specPath, 'utf8');
const types = readFileSync(typesPath, 'utf8');
const tab = readFileSync(tabPath, 'utf8');

const idsPreenchimento = [
  3221, 3234, 3235, 3236, 3303, 3307,
  3309, 3310, 3368, 3389, 3390, 3400,
];

test('migration recupera somente os 12 telefones vazios de responsavel aprovados', () => {
  assert.ok(migration, 'migration versionada do backfill de responsavel ausente');
  for (const id of idsPreenchimento) {
    assert.match(migration, new RegExp(`\\b${id}\\b`));
  }
  assert.match(migration, /v_candidatas_preenchimento\s*<>\s*12/i);
  assert.match(migration, /v_atualizadas_preenchimento\s*<>\s*12/i);
  assert.match(migration, /m\.tipo\s+in\s*\(\s*'evasao'\s*,\s*'nao_renovacao'\s*\)/i);
  assert.match(migration, /m\.data\s*>=\s*date\s*'2026-07-01'/i);
  assert.match(migration, /m\.data\s*<\s*date\s*'2026-08-01'/i);
  assert.match(migration, /nullif\s*\(\s*btrim\s*\(\s*m\.telefone_snapshot\s*\)\s*,\s*''\s*\)\s+is\s+null/i);
  assert.match(migration, /is_movimentacao_admin_retencao_valida\s*\(\s*m\.id\s*\)\s+is\s+true/i);
});

test('migration troca somente os 4 snapshots de menor vindos do primeiro backfill', () => {
  for (const id of [3305, 3311, 3334, 3367]) {
    assert.match(migration, new RegExp(`\\b${id}\\b`));
  }
  assert.match(migration, /v_candidatas_substituicao\s*<>\s*4/i);
  assert.match(migration, /v_atualizadas_substituicao\s*<>\s*4/i);
  assert.match(migration, /telefone_snapshot_origem\s*=\s*'cadastro_atual_backfill_2026_07'/i);
  assert.match(migration, /cadastro_responsavel_backfill_2026_07/i);
  assert.match(migration, /responsavel_telefone/i);
  assert.match(migration, /data_nascimento[\s\S]*<\s*18/i);
});

test('migration vincula 3312 ao aluno 1532 com proveniencia manual confirmada', () => {
  assert.match(migration, /\b3312\b[\s\S]*\b1532\b/i);
  assert.match(migration, /set[\s\S]*aluno_id\s*=\s*1532/i);
  assert.match(migration, /cadastro_responsavel_vinculo_manual_alf_2026_08/i);
  assert.match(migration, /emusys_student_id[\s\S]*3460/i);
  assert.match(migration, /lower\s*\([\s\S]*aluno_nome[\s\S]*lower\s*\([\s\S]*a\.nome/i);
  assert.match(migration, /not\s+exists[\s\S]*m_outra[\s\S]*aluno_id\s*=\s*1532/i);
});

test('novas saidas de menores capturam somente o telefone do responsavel', () => {
  assert.match(
    migration,
    /create\s+or\s+replace\s+function\s+public\.capturar_telefone_snapshot_movimentacao_retencao\s*\(\s*\)/i,
  );
  assert.match(
    migration,
    /when[\s\S]*data_nascimento[\s\S]*<\s*18[\s\S]*then\s+nullif\s*\(\s*btrim\s*\(\s*a\.responsavel_telefone/i,
  );
});

test('preview de menor usa nome, telefone e template do responsavel', () => {
  assert.match(edge, /const\s+publico\s*=\s*alunoEhMenor\s*\(\s*aluno\.data_nascimento\s*\)[\s\S]*?\?\s*['"]responsavel['"]/i);
  assert.match(edge, /publico\s*===\s*['"]responsavel['"][\s\S]*?aluno\.responsavel_nome\?\.trim\s*\(\s*\)/i);
  assert.match(edge, /\.eq\s*\(\s*['"]publico['"]\s*,\s*publico\s*\)/i);
  assert.match(edge, /responsavel_telefone/i);
  assert.match(edge, /resolverDestinoPesquisaPorPublico[\s\S]*publico[\s\S]*telefoneResponsavel\s*:\s*aluno\.responsavel_telefone/i);
});

test('RPC e UI bloqueiam menor sem responsavel apto ou com snapshot divergente', () => {
  for (const codigo of [
    'responsavel_sem_nome',
    'responsavel_sem_telefone',
    'responsavel_telefone_invalido',
    'telefone_responsavel_divergente',
  ]) {
    assert.match(migration, new RegExp(codigo));
    assert.match(types, new RegExp(codigo));
    assert.match(tab, new RegExp(codigo));
  }
});

test('spec e runbook registram a decisao permanente de Alf', () => {
  assert.match(runbook, /12[\s\S]*cadastro_responsavel_backfill_2026_07/i);
  assert.match(runbook, /3312[\s\S]*Pedro[\s\S]*Gabriel Michel Oliveira[\s\S]*1532/i);
  assert.match(runbook, /decis[aã]o (?:permanente )?d[eo] Alf[\s\S]*menor[\s\S]*respons[aá]vel/i);
  assert.match(spec, /decis[aã]o (?:permanente )?d[eo] Alf[\s\S]*menor[\s\S]*respons[aá]vel/i);
  assert.doesNotMatch(runbook, /13 sa[ií]das[\s\S]*n[aã]o possuem nenhum contato/i);
});
