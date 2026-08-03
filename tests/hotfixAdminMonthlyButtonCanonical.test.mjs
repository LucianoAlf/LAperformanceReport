import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/components/App/Administrativo/ModalRelatorio.tsx', import.meta.url),
  'utf8',
);

const lib = await readFile(
  new URL('../src/lib/fallbackCompetenciaRelatorio.ts', import.meta.url),
  'utf8',
);

const start = source.indexOf('async function gerarRelatorioMensal()');
const end = source.indexOf('async function obterDadosRelatorioAvulsoAdministrativo()', start);
const gerarRelatorioMensal = source.slice(start, end);

test('botao mensal administrativo usa somente o produtor canonico do servidor', () => {
  assert.ok(start >= 0 && end > start, 'função mensal administrativa não encontrada');
  // A chamada à edge mora em solicitarRelatorioMensalComFallback desde que o
  // fallback de competência passou a ser compartilhado com a tela comercial.
  // O que este guard protege continua igual: o texto vem do servidor, a tela
  // não remonta relatório no cliente.
  assert.match(gerarRelatorioMensal, /solicitarRelatorioMensalComFallback\(/);
  assert.match(gerarRelatorioMensal, /modo:\s*'dry_run_mensal_admin'/);
  assert.doesNotMatch(gerarRelatorioMensal, /\.from\('metas_kpi'\)/);
  assert.doesNotMatch(gerarRelatorioMensal, /let texto\s*=/);
});

test('o produtor canonico continua sendo a edge, agora pela lib compartilhada', () => {
  assert.match(lib, /functions\.invoke\('relatorio-admin-whatsapp'/);
  assert.doesNotMatch(lib, /\.from\('metas_kpi'\)/);
});

test('hotfix administrativo não antecipa a troca do botão comercial', () => {
  assert.doesNotMatch(source, /dry_run_mensal_comercial/);
});
