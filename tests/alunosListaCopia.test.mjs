/**
 * LAPE-42 — cópia da Lista de Alunos em memória ("mostra o que tem, atualiza por trás").
 *
 * Roda a função REAL (compilada do .ts com esbuild), não uma cópia — mesmo padrão de
 * tests/comunidadeWaContato.test.mjs. O que se prova aqui é o que a cópia NUNCA pode fazer:
 * afirmar situação financeira, vazar entre unidades/usuários, crescer sem limite, ir para storage.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'alunos-lista-copia-'));
const saida = join(dir, 'alunosListaCopia.mjs');
execFileSync('npx', ['esbuild', 'src/lib/alunosListaCopia.ts', '--format=esm', `--outfile=${saida}`], {
  stdio: 'pipe', shell: process.platform === 'win32',
});
const lib = await import(pathToFileURL(saida).href);
test.after(() => rmSync(dir, { recursive: true, force: true }));
test.beforeEach(() => lib.descartarCopiasListaAlunos());

const vazia = { turmas: [], kpis: {}, professores: [], cursos: [], tiposMatricula: [], salas: [], horarios: [] };

test('a copia nunca afirma inadimplencia -- nem "devendo" nem "em dia", nem no 2o curso', () => {
  const chave = lib.chaveCopiaListaAlunos('u1', 'todos', '2026-09-01', '2026-09-30');
  lib.gravarCopiaListaAlunos(chave, {
    ...vazia,
    alunos: [
      { id: 1, nome: 'Ana', inadimplente_emusys: true, _inadimplencia_valor_atualizado: 400, _inadimplencia_total_faturas: 2,
        outros_cursos: [{ id: 2, inadimplente_emusys: false, _inadimplencia_atualizado_em: '2026-09-24' }] },
      { id: 3, nome: 'Bia', inadimplente_emusys: false },
    ],
  });
  const copia = lib.lerCopiaListaAlunos(chave);
  for (const a of copia.alunos) {
    assert.equal(a.inadimplente_emusys, undefined, 'false afirmaria "em dia" sem leitura que sustente');
    assert.equal(a._inadimplencia_total_faturas, 0);
    assert.equal(a._inadimplencia_valor_atualizado, 0);
  }
  assert.equal(copia.alunos[0].outros_cursos[0].inadimplente_emusys, undefined);
  assert.equal(copia.alunos[0].outros_cursos[0]._inadimplencia_atualizado_em, null);
  assert.equal(copia.alunos[0].nome, 'Ana', 'o resto da linha continua');
});

test('gravar nao muda o objeto que esta na tela', () => {
  const aluno = { id: 1, inadimplente_emusys: true };
  lib.gravarCopiaListaAlunos(lib.chaveCopiaListaAlunos('u1', 'x', 'a', 'b'), { ...vazia, alunos: [aluno] });
  assert.equal(aluno.inadimplente_emusys, true);
});

test('a chave separa usuario, unidade e periodo', () => {
  const base = lib.chaveCopiaListaAlunos('u1', 'cg', '2026-09-01', '2026-09-30');
  lib.gravarCopiaListaAlunos(base, { ...vazia, alunos: [{ id: 1 }] });
  assert.equal(lib.lerCopiaListaAlunos(lib.chaveCopiaListaAlunos('u2', 'cg', '2026-09-01', '2026-09-30')), null, 'outro login');
  assert.equal(lib.lerCopiaListaAlunos(lib.chaveCopiaListaAlunos('u1', 'barra', '2026-09-01', '2026-09-30')), null, 'outra unidade');
  assert.equal(lib.lerCopiaListaAlunos(lib.chaveCopiaListaAlunos('u1', 'cg', '2026-08-01', '2026-08-31')), null, 'outro periodo');
  assert.ok(lib.lerCopiaListaAlunos(base));
});

test('sem usuario nao ha copia -- nem grava nem le', () => {
  assert.equal(lib.chaveCopiaListaAlunos(null, 'cg', 'a', 'b'), null);
  lib.gravarCopiaListaAlunos(null, { ...vazia, alunos: [{ id: 1 }] });
  assert.equal(lib.totalCopiasListaAlunos(), 0);
  assert.equal(lib.lerCopiaListaAlunos(null), null);
});

test('copia velha demais e descartada: melhor o spinner do que 1 hora de atraso', () => {
  const chave = lib.chaveCopiaListaAlunos('u1', 'cg', 'a', 'b');
  lib.gravarCopiaListaAlunos(chave, { ...vazia, alunos: [{ id: 1 }] }, 0);
  assert.ok(lib.lerCopiaListaAlunos(chave, lib.IDADE_MAXIMA_COPIA_MS));
  assert.equal(lib.lerCopiaListaAlunos(chave, lib.IDADE_MAXIMA_COPIA_MS + 1), null);
  assert.equal(lib.totalCopiasListaAlunos(), 0);
});

test('memoria limitada: guarda so as ultimas combinacoes, descartando a menos usada', () => {
  for (let i = 0; i < lib.MAX_COPIAS + 3; i++) {
    lib.gravarCopiaListaAlunos(lib.chaveCopiaListaAlunos('u1', `un${i}`, 'a', 'b'), { ...vazia, alunos: [] });
  }
  assert.equal(lib.totalCopiasListaAlunos(), lib.MAX_COPIAS);
  assert.equal(lib.lerCopiaListaAlunos(lib.chaveCopiaListaAlunos('u1', 'un0', 'a', 'b')), null);
  assert.ok(lib.lerCopiaListaAlunos(lib.chaveCopiaListaAlunos('u1', `un${lib.MAX_COPIAS + 2}`, 'a', 'b')));
});

test('logout descarta tudo', () => {
  lib.gravarCopiaListaAlunos(lib.chaveCopiaListaAlunos('u1', 'cg', 'a', 'b'), { ...vazia, alunos: [{ id: 1 }] });
  lib.descartarCopiasListaAlunos();
  assert.equal(lib.totalCopiasListaAlunos(), 0);
});

test('dado pessoal NUNCA vai para storage do navegador (LGPD/OWASP)', () => {
  const semComentarios = (arquivo) => readFileSync(arquivo, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const arquivo of ['src/lib/alunosListaCopia.ts', 'src/lib/alunosListaCopiaSessao.ts']) {
    assert.doesNotMatch(semComentarios(arquivo), /localStorage|sessionStorage|indexedDB/i, arquivo);
  }
});

test('o logout esta ligado ao descarte', () => {
  const fonte = readFileSync('src/lib/alunosListaCopiaSessao.ts', 'utf8');
  assert.match(fonte, /SIGNED_OUT[\s\S]*descartarCopiasListaAlunos\(\)/);
  assert.match(readFileSync('src/components/App/Alunos/AlunosPage.tsx', 'utf8'), /import '@\/lib\/alunosListaCopiaSessao'/);
});

test('a tela grava com a chave DOS DADOS, nunca com a chave da tela', () => {
  // Ao trocar de unidade existe um render com a chave nova e a lista velha.
  const pagina = readFileSync('src/components/App/Alunos/AlunosPage.tsx', 'utf8');
  assert.match(pagina, /gravarCopiaListaAlunos\(chaveDosDados,/);
});
