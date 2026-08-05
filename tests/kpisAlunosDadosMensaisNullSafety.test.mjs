import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const hook = read('src/hooks/useKPIsAlunosCanonicos.ts');
const databaseTypes = read('src/types/database.types.ts');
const analytics = read('src/components/GestaoMensal/TabGestao.tsx');
const administrativo = read('src/components/App/Administrativo/AdministrativoPage.tsx');
const modalRelatorio = read('src/components/App/Administrativo/ModalRelatorio.tsx');

const camposAusentesNoHistorico = [
  'matriculasBaseAlunosAtivos',
  'alunosComSegundoCurso',
  'matriculasSegundoCursoExtras',
  'matriculasCoral',
  'bolsistasIntegraisRegulares',
  'bolsistasIntegraisSegundoCurso',
  'kids',
  'school',
  'semClassificacao',
  'reajustesValidos',
];

function trechoEntre(source, inicio, fim) {
  const start = source.indexOf(inicio);
  const end = source.indexOf(fim, start + inicio.length);
  assert.notEqual(start, -1, `inicio ausente: ${inicio}`);
  assert.notEqual(end, -1, `fim ausente: ${fim}`);
  return source.slice(start, end);
}

test('mapper de dados_mensais nao consulta colunas inexistentes no schema tipado', () => {
  const rowType = trechoEntre(databaseTypes, 'dados_mensais: {', 'Insert:');
  const colunas = new Set([...rowType.matchAll(/^\s{10}([a-z0-9_]+):/gm)].map(([, campo]) => campo));
  const mapper = trechoEntre(hook, 'function mapDadosMensais', 'export function consolidarKPIsAlunosCanonicos');
  const acessos = [...mapper.matchAll(/row\.([a-zA-Z0-9_]+)/g)].map(([, campo]) => campo);
  const aliasesPermitidos = new Set(['unidades', 'unidade_nome']);
  const inexistentes = [...new Set(acessos.filter(campo => !colunas.has(campo) && !aliasesPermitidos.has(campo)))];

  assert.deepEqual(inexistentes, [], `mapper consulta colunas ausentes: ${inexistentes.join(', ')}`);
});

test('campos sem coluna historica propagam null e nunca zero inventado', () => {
  const mapper = trechoEntre(hook, 'function mapDadosMensais', 'export function consolidarKPIsAlunosCanonicos');
  for (const campo of camposAusentesNoHistorico) {
    assert.match(mapper, new RegExp(`${campo}:\\s*null\\b`), `${campo} deve ser null em dados_mensais`);
  }

  assert.doesNotMatch(
    mapper,
    /matriculasBaseAlunosAtivos:\s*n\(row\.matriculas_base_alunos_ativos\)\s*\|\|\s*n\(row\.alunos_ativos\)/,
    'matriculas base nao pode fingir que equivale a alunos ativos'
  );
});

test('consolidacao preserva desconhecido em vez de somar null como zero', () => {
  const consolidacao = trechoEntre(hook, 'export function consolidarKPIsAlunosCanonicos', 'export async function fetchKPIsAlunosCanonicos');
  for (const campo of camposAusentesNoHistorico) {
    if (campo === 'reajustesValidos') {
      assert.match(consolidacao, /const totalReajustesValidos\s*=\s*somarCampoCompleto\(rows,\s*row\s*=>\s*row\.reajustesValidos\)/);
      assert.match(consolidacao, /reajustesValidos:\s*totalReajustesValidos/);
      continue;
    }
    assert.match(
      consolidacao,
      new RegExp(`${campo}:\\s*somarCampoCompleto\\(rows,\\s*row\\s*=>\\s*row\\.${campo}\\)`),
      `${campo} deve usar soma completa null-safe`
    );
  }
});

test('Analytics renderiza ausencia historica como traco, sem percentual zero', () => {
  assert.match(analytics, /function valorKpiOuTraco\([^)]*number\s*\|\s*null/);
  assert.match(analytics, /value=\{valorKpiOuTraco\(dados\.total_la_kids\)\}/);
  assert.match(analytics, /value=\{valorKpiOuTraco\(dados\.total_la_adultos\)\}/);
  assert.doesNotMatch(analytics, /dados\.total_la_kids\s*\+\s*dados\.total_la_adultos/);
});

test('Administrativo preserva campos historicos desconhecidos na consolidacao e na tela', () => {
  assert.match(administrativo, /function somarCampoCompleto/);
  assert.match(administrativo, /function valorKpiOuTraco/);
  assert.match(administrativo, /const matriculasBaseAlunosAtivos = somarCampoCompleto/);
  assert.match(administrativo, /const bolsistasIntegraisRegulares = somarCampoCompleto/);
  assert.match(administrativo, /subvalue=\{`\$\{valorKpiOuTraco\(resumo\?\.matriculas_base_alunos_ativos\)\}/);
  assert.doesNotMatch(
    administrativo,
    /matriculas_base_alunos_ativos:\s*\(acc\.matriculas_base_alunos_ativos\s*\|\|\s*0\)/
  );
});

test('Relatorio administrativo nao inventa detalhamento ausente', () => {
  assert.match(modalRelatorio, /function somarCampoCompleto/);
  assert.match(modalRelatorio, /function formatarNumeroOpcional/);
  assert.match(modalRelatorio, /const matriculasBaseAlunosAtivos = somarCampoCompleto/);
  assert.match(modalRelatorio, /const bolsistasIntegraisRegulares = somarCampoCompleto/);
  assert.match(modalRelatorio, /Detalhamento indisponivel no historico/);
  assert.doesNotMatch(
    modalRelatorio,
    /const baseAlunos = resumoBase\?\.matriculas_base_alunos_ativos \|\| resumoBase\?\.alunos_ativos \|\| 0/
  );
});
