// LAPE-19 — a Conciliacao deixa de cobrar a mesma pessoa uma vez por curso.
// Plano: docs/superpowers/plans/2026-09-01-anamnese-por-pessoa.md (Task 6)
//
// A anamnese e da pessoa: uma pessoa sem anamnese com 3 cursos geraria 3 tarefas
// identicas na fila da Conciliacao. Hoje ha 0 pendencias desse tipo em aberto --
// isto e blindagem, nao conserto.
//
// Roda a funcao REAL do index.ts da edge (transpilada por esbuild), nao confere texto.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const mod = await (async () => {
  const fonte = readFileSync('supabase/functions/sync-matriculas-emusys/index.ts', 'utf8');

  // Recorta o bloco puro: das constantes de tipo ate o fim do deduplicador.
  const inicio = fonte.indexOf('const TIPOS_ATRIBUTO_POR_ALUNO');
  assert.ok(inicio > -1, 'TIPOS_ATRIBUTO_POR_ALUNO deve existir no index.ts');
  const marcaFim = fonte.indexOf('async function persistirDivergenciasAtributos');
  assert.ok(marcaFim > inicio, 'persistirDivergenciasAtributos deve vir depois do bloco');

  const trecho = fonte.slice(inicio, marcaFim)
    + '\nexport { chaveAtributo, deduplicarDivergenciasAtributos };\n';

  const { code } = await esbuild.transform(trecho, { loader: 'ts', format: 'esm' });
  const arquivo = path.join(mkdtempSync(path.join(tmpdir(), 'dedup-')), 'dedupe.mjs');
  writeFileSync(arquivo, code);
  return import(pathToFileURL(arquivo).href);
})();

const linhaAnamnese = (aluno_id, emusys_student_id, unidade_id = 'u1') => ({
  aluno_id,
  emusys_student_id,
  unidade_id,
  emusys_matricula_id: `m${aluno_id}`,
  tipo_divergencia: 'anamnese_pendente',
  campo: 'anamnese_preenchida',
});

test('a mesma pessoa com 3 cursos gera UMA pendencia de anamnese, nao tres', () => {
  const saida = mod.deduplicarDivergenciasAtributos([
    linhaAnamnese(10, '99'),
    linhaAnamnese(11, '99'),
    linhaAnamnese(12, '99'),
  ]);
  assert.equal(saida.length, 1);
});

test('pessoas diferentes continuam gerando pendencias separadas', () => {
  const saida = mod.deduplicarDivergenciasAtributos([
    linhaAnamnese(10, '99'),
    linhaAnamnese(12, '98'),
  ]);
  assert.equal(saida.length, 2);
});

test('o mesmo id do Emusys em unidades diferentes NAO e a mesma pessoa', () => {
  // 91 emusys_student_id se repetem entre unidades, os 91 com nomes diferentes.
  const saida = mod.deduplicarDivergenciasAtributos([
    linhaAnamnese(10, '99', 'u1'),
    linhaAnamnese(20, '99', 'u2'),
  ]);
  assert.equal(saida.length, 2);
});

test('sem id do Emusys, cai no comportamento antigo (por matricula) e nao funde estranhos', () => {
  const saida = mod.deduplicarDivergenciasAtributos([
    linhaAnamnese(10, ''),
    linhaAnamnese(11, ''),
  ]);
  assert.equal(saida.length, 2);
});

test('os outros tipos por aluno seguem deduplicados por aluno, nao por pessoa', () => {
  // foto_ausente e do cadastro daquela matricula: fundir por pessoa esconderia
  // a segunda linha, que tem foto propria a preencher.
  const foto = (aluno_id) => ({
    aluno_id, emusys_student_id: '99', unidade_id: 'u1', emusys_matricula_id: `m${aluno_id}`,
    tipo_divergencia: 'foto_ausente', campo: 'foto_url',
  });
  assert.equal(mod.deduplicarDivergenciasAtributos([foto(10), foto(11)]).length, 2);
});
