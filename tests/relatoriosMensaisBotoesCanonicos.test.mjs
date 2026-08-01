import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const edge = read('supabase/functions/relatorio-admin-whatsapp/index.ts');
const admin = read('src/components/App/Administrativo/ModalRelatorio.tsx');
const comercial = read('src/components/App/Comercial/ComercialPage.tsx');

test('edge gera os dois mensais a partir do snapshot fechado', () => {
  assert.match(edge, /dry_run_mensal_admin/);
  assert.match(edge, /dry_run_mensal_comercial/);
  assert.match(edge, /get_relatorio_mensal_canonico_v1/);
  assert.match(edge, /formatarRelatorioAdminMensalCanonico/);
  assert.match(edge, /formatarRelatorioComercialMensalCanonico/);
});

test('botao administrativo usa exclusivamente o produtor mensal canonico', () => {
  const body = admin.slice(
    admin.indexOf('async function gerarRelatorioMensal()'),
    admin.indexOf('async function obterDadosRelatorioAvulsoAdministrativo()'),
  );
  assert.match(body, /dry_run_mensal_admin/);
  assert.doesNotMatch(body, /\.from\(/);
  assert.doesNotMatch(body, /buscarDadosMensaisAdministrativos/);
});

test('botao comercial usa exclusivamente o produtor mensal canonico', () => {
  const body = comercial.slice(
    comercial.indexOf('const gerarRelatorioMensal = async () =>'),
    comercial.indexOf('const gerarRelatorioMatriculas = async () =>'),
  );
  assert.match(body, /dry_run_mensal_comercial/);
  assert.doesNotMatch(body, /\.from\(/);
  assert.doesNotMatch(body, /buscarMatriculasAlunos/);
  assert.doesNotMatch(body, /buscarTaxaExpMatCanonica/);
});
