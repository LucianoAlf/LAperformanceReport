import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tab = readFileSync(
  resolve(repoRoot, 'src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx'),
  'utf8',
);
const types = readFileSync(
  resolve(repoRoot, 'src/components/App/SucessoCliente/pesquisaEvasao.types.ts'),
  'utf8',
);
const migration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260801143000_pesquisa_evasao_prosodia_v2.sql'),
  'utf8',
);

test('fila distingue snapshot ausente de divergência real do responsável', () => {
  assert.match(types, /'telefone_snapshot_ausente'/);
  assert.match(
    migration,
    /when\s+is_menor\s+and\s+telefone_normalizado\s+is\s+null\s+then\s+'telefone_snapshot_ausente'[\s\S]*?telefone_normalizado\s+is\s+distinct\s+from\s+responsavel_telefone_normalizado/i,
  );
  assert.match(tab, /case\s+'telefone_snapshot_ausente'[\s\S]*?Contato da saída não registrado/);
  assert.match(tab, /case\s+'telefone_responsavel_divergente'[\s\S]*?Contato da saída difere do responsável/);
});

test('problema técnico de snapshot não manda corrigir cadastro do aluno', () => {
  const blocoCorrecaoCadastro = tab.match(
    /\[\s*'sem_aluno'[\s\S]*?\]\s*\.includes\(evadido\.bloqueio_codigo\s*\|\|\s*''\)[\s\S]*?Corrigir no cadastro do aluno/,
  )?.[0] ?? '';

  assert.ok(blocoCorrecaoCadastro, 'bloco de orientação cadastral não localizado');
  assert.doesNotMatch(blocoCorrecaoCadastro, /telefone_snapshot_ausente/);
  assert.doesNotMatch(blocoCorrecaoCadastro, /telefone_responsavel_divergente/);
});
