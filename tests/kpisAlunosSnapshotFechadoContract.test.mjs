import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const hook = readFileSync(
  new URL('../src/hooks/useKPIsAlunosCanonicos.ts', import.meta.url),
  'utf8'
);

function trechoEntre(source, inicio, fim) {
  const start = source.indexOf(inicio);
  const end = source.indexOf(fim, start + inicio.length);
  assert.notEqual(start, -1, `inicio ausente: ${inicio}`);
  assert.notEqual(end, -1, `fim ausente: ${fim}`);
  return source.slice(start, end);
}

test('fonte fechada explicita snapshot versionado no contrato', () => {
  assert.match(hook, /export type FonteKPIAlunos\s*=\s*[^;]*'snapshot'/);
  assert.match(hook, /snapshotId\?:\s*string\s*\|\s*null/);
  assert.match(hook, /snapshotVersao\?:\s*number\s*\|\s*null/);
  assert.match(hook, /snapshotStatus\?:\s*string\s*\|\s*null/);
});

test('leitor busca somente snapshots finais de alunos e escolhe maior versao', () => {
  const leitor = trechoEntre(hook, 'async function fetchSnapshotsAlunosExecutivo', 'function mapDadosMensais');
  assert.match(leitor, /from\(['"]fechamento_mensal_snapshots['"]\)/);
  assert.match(leitor, /eq\(['"]dominio['"],\s*['"]alunos_executivo['"]\)/);
  assert.match(leitor, /in\(['"]status['"],\s*\[['"]fechado['"],\s*['"]retificado['"]\]\)/);
  assert.match(leitor, /order\(['"]versao['"],\s*\{\s*ascending:\s*false\s*\}\)/);
  assert.match(leitor, /const chave\s*=\s*chaveSnapshot/);
  assert.match(leitor, /if\s*\(!maisRecentes\.has\(chave\)\)/);
});

test('mapper do snapshot cobre os campos ausentes no legado sem inventar zero', () => {
  const mapper = trechoEntre(hook, 'function mapSnapshotAlunosExecutivo', 'async function fetchSnapshotsAlunosExecutivo');
  const pares = {
    matriculasBaseAlunosAtivos: 'matriculas_base_alunos_ativos',
    alunosComSegundoCurso: 'alunos_com_2_curso',
    matriculasSegundoCursoExtras: 'matriculas_2_curso_extras',
    matriculasCoral: 'matriculas_coral',
    bolsistasIntegraisRegulares: 'bolsistas_integrais_regulares',
    bolsistasIntegraisSegundoCurso: 'bolsistas_integrais_segundo_curso',
    kids: 'alunos_kids',
    school: 'alunos_school',
    semClassificacao: 'alunos_sem_classificacao',
    reajustesValidos: 'reajustes_validos',
  };

  for (const [destino, origem] of Object.entries(pares)) {
    assert.match(
      mapper,
      new RegExp(`${destino}:\\s*nNullable\\(payload\\.${origem}\\)`),
      `${destino} deve vir do payload versionado`
    );
  }
});

test('competencia fechada tenta snapshot antes do fallback legado', () => {
  const fetcher = trechoEntre(hook, 'export async function fetchKPIsAlunosCanonicos', 'export function emptyKPIsAlunosCanonicos');
  const snapshot = fetcher.indexOf('fetchSnapshotsAlunosExecutivo');
  const legado = fetcher.indexOf("from('dados_mensais')");
  assert.ok(snapshot >= 0, 'fetcher precisa consultar snapshots');
  assert.ok(legado > snapshot, 'dados_mensais deve ser somente fallback posterior ao snapshot');
  assert.match(hook, /fonte:\s*['"]snapshot['"]/);
});

test('consolidado usa o snapshot consolidado oficial e preserva as linhas por unidade', () => {
  const montagem = trechoEntre(hook, 'function montarKPIsDeSnapshots', 'function mapDadosMensais');
  const aplicacao = trechoEntre(hook, 'function aplicarTotaisDoSnapshotConsolidado', 'function montarKPIsDeSnapshots');
  assert.match(montagem, /snapshotConsolidado/);
  assert.match(aplicacao, /porUnidade:\s*rowsUnidade/);
  assert.match(montagem, /aplicarTotaisDoSnapshotConsolidado/);
});

test('painel de gestao nao sobrepoe MRR canonico com financeiro de faturas', () => {
  assert.doesNotMatch(hook, /fetchFinanceiroFaturasEmusys/);
  assert.doesNotMatch(hook, /aplicarFinanceiroFaturasPeriodo/);
  assert.doesNotMatch(hook, /hasFinanceiroFaturas/);
});
