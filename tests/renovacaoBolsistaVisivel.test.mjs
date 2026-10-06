// Renovação de bolsista e banda APARECE na tela, marcada, mas não entra na taxa.
//
// CASO (Jhon, ADM CG, 02/10/2026): "os 7 alunos que estão faltando são: Vitória
// Vivia, Elisete, Lavynea, Leticia…". Estavam no banco — a tela os escondia de
// todas as abas de renovação (filtrarRetencaoCanonica), e a equipe concluiu que
// faltavam. Tentando "consertar", criou duas cópias da Leticia pelo modal.
//
// A regra do Alf (27/08) continua: bolsista e banda não contam na taxa nem no
// total. O que muda é só a VISIBILIDADE. Por isso `motivoForaDosKpis` tem de ser
// o inverso exato de `contaNosKpis` — se as duas divergirem, a tela lista como
// "não entra" uma linha que o número conta (ou o contrário).
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const lib = await (async () => {
  const { code } = await esbuild.transform(readFileSync('src/lib/atividadesExtras.ts', 'utf8'), {
    loader: 'ts',
    format: 'esm',
  });
  const arquivo = path.join(mkdtempSync(path.join(tmpdir(), 'rbv-')), 'atividadesExtras.mjs');
  writeFileSync(arquivo, code, 'utf8');
  return import(pathToFileURL(arquivo).href);
})();

const { motivoForaDosKpis, contaNosKpis } = lib;

const linhas = {
  regular: { tipo: 'renovacao', cursos: { nome: 'Canto' }, alunos: { tipo_matricula_id: 1 } },
  segundoCurso: { tipo: 'renovacao', cursos: { nome: 'Canto' }, alunos: { tipo_matricula_id: 2 } },
  bolsistaIntegral: { tipo: 'renovacao', cursos: { nome: 'Guitarra' }, alunos: { tipo_matricula_id: 3 } },
  bolsistaParcial: { tipo: 'renovacao', cursos: { nome: 'Piano' }, alunos: { tipo_matricula_id: 4 } },
  bandaPorTipo: { tipo: 'renovacao', cursos: { nome: 'Bateria' }, alunos: { tipo_matricula_id: 5 } },
  bandaPorCurso: { tipo: 'renovacao', cursos: { nome: 'Minha Banda Para Sempre', is_projeto_banda: true }, alunos: { tipo_matricula_id: 1 } },
  // Leticia/CG: bolsista E banda. Banda vence — é o curso que a tira da taxa.
  bandaEBolsista: { tipo: 'renovacao', cursos: { nome: 'Minha Banda Para Sempre', is_projeto_banda: true }, alunos: { tipo_matricula_id: 3 } },
  bolsistaPorCodigo: { tipo: 'renovacao', cursos: { nome: 'Canto' }, alunos: { tipos_matricula: { codigo: 'BOLSISTA_INT' } } },
  semAluno: { tipo: 'renovacao', curso_nome: 'Canto', alunos: null },
};

test('regular e segundo curso entram na taxa', () => {
  assert.equal(motivoForaDosKpis(linhas.regular), null);
  assert.equal(motivoForaDosKpis(linhas.segundoCurso), null);
});

test('bolsista integral e parcial ficam marcados como bolsista', () => {
  assert.equal(motivoForaDosKpis(linhas.bolsistaIntegral), 'bolsista');
  assert.equal(motivoForaDosKpis(linhas.bolsistaParcial), 'bolsista');
  assert.equal(motivoForaDosKpis(linhas.bolsistaPorCodigo), 'bolsista');
});

test('banda por tipo ou por curso fica marcada como banda, e banda vence bolsista', () => {
  assert.equal(motivoForaDosKpis(linhas.bandaPorTipo), 'banda');
  assert.equal(motivoForaDosKpis(linhas.bandaPorCurso), 'banda');
  assert.equal(motivoForaDosKpis(linhas.bandaEBolsista), 'banda');
});

test('sem aluno vinculado continua contando (fail-open)', () => {
  assert.equal(motivoForaDosKpis(linhas.semAluno), null);
});

test('é o inverso exato de contaNosKpis', () => {
  for (const [nome, linha] of Object.entries(linhas)) {
    assert.equal(motivoForaDosKpis(linha) === null, contaNosKpis(linha), nome);
  }
});
