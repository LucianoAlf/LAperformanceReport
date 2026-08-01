import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/components/App/Administrativo/ModalRelatorio.tsx', import.meta.url),
  'utf8',
);

const start = source.indexOf('async function gerarRelatorioMensal()');
const end = source.indexOf('async function obterDadosRelatorioAvulsoAdministrativo()', start);
const gerarRelatorioMensal = source.slice(start, end);

test('botao mensal administrativo usa somente o produtor canonico do servidor', () => {
  assert.ok(start >= 0 && end > start, 'função mensal administrativa não encontrada');
  assert.match(gerarRelatorioMensal, /functions\.invoke\('relatorio-admin-whatsapp'/);
  assert.match(gerarRelatorioMensal, /modo:\s*'dry_run_mensal_admin'/);
  assert.doesNotMatch(gerarRelatorioMensal, /\.from\('metas_kpi'\)/);
  assert.doesNotMatch(gerarRelatorioMensal, /let texto\s*=/);
});

test('hotfix administrativo não antecipa a troca do botão comercial', () => {
  assert.doesNotMatch(source, /dry_run_mensal_comercial/);
});
