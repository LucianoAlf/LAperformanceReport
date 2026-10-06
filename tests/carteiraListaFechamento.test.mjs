/**
 * Lista da carteira do professor em mês fechado = os nomes do próprio fechamento.
 *
 * Caso que originou (05/10/2026): Gabriel Antony/Barra, Set/2026 — cabeçalho "47 alunos"
 * de setembro e lista de HOJE ao expandir (o Jairo, que em setembro era do Erick, aparecia;
 * a Liv, que estava no número, não).
 *
 * Roda a função REAL (compilada do .ts com esbuild), não uma cópia.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'carteira-fechamento-'));
const saida = join(dir, 'carteiraProfessorDetalheCanonica.mjs');
execFileSync('npx', ['esbuild', 'src/lib/carteiraProfessorDetalheCanonica.ts', '--format=esm', `--outfile=${saida}`], {
  stdio: 'pipe', shell: process.platform === 'win32',
});
const lib = await import(pathToFileURL(saida).href);
test.after(() => rmSync(dir, { recursive: true, force: true }));

const setembro = { ano: 2026, mes: 9, dataInicio: '2026-09-01', dataFim: '2026-09-30' };
const linha = { unidade_id: 'u', unidade_nome: 'Barra', aluno_id: 1, aluno_nome: 'Liv', emusys_aluno_id: '1077', curso_id: 40, curso_nome: 'MPpi', status_matricula: 'ativa', dia_semana: null, horario: null };

test('mês civil exato usa o fechamento; trimestre e intervalo livre não', () => {
  // Mesmo critério de v_periodo_mensal na RPC canônica: o total só vem do fechamento
  // quando o período é um mês civil. Divergir aqui faria lista e total discordarem.
  assert.equal(lib.periodoEhMesUnico(setembro), true);
  assert.equal(lib.periodoEhMesUnico({ ano: 2026, mes: 2, dataInicio: '2026-02-01', dataFim: '2026-02-28' }), true);
  assert.equal(lib.periodoEhMesUnico({ ano: 2026, mes: 9, dataInicio: '2026-09-01', dataFim: '2026-11-30' }), false);
  assert.equal(lib.periodoEhMesUnico({ ano: 2026, mes: 9, dataInicio: '2026-09-05', dataFim: '2026-09-30' }), false);
  assert.equal(lib.periodoEhMesUnico(null), false);
});

test('mês sem fechamento (mês corrente) segue a carteira de hoje, sem aviso', () => {
  const r = lib.decidirListaCarteira({ fechado: false, carteira_alunos: null, pessoas_regulares: 0, linhas: [] }, setembro);
  assert.deepEqual(r, { origem: 'atual', aviso: null });
});

test('fechamento sem nomes gravados mostra a de hoje, mas AVISA', () => {
  // jun/2026: total lançado pela coordenação, sem detalhe. Mostrar a lista de hoje
  // calada faria ela parecer a de junho.
  const r = lib.decidirListaCarteira({ fechado: true, carteira_alunos: 47, pessoas_regulares: 0, linhas: [] }, setembro);
  assert.equal(r.origem, 'atual');
  assert.match(r.aviso, /não gravou os nomes/);
  assert.match(r.aviso, /setembro\/2026/);
});

test('fechamento com nomes que fecham com o total: lista do fechamento, sem aviso', () => {
  const r = lib.decidirListaCarteira({ fechado: true, carteira_alunos: 47, pessoas_regulares: 47, linhas: [linha] }, setembro);
  assert.deepEqual(r, { origem: 'fechamento', aviso: null });
});

test('fechamento cujos nomes não fecham com o total: usa os nomes e declara a diferença', () => {
  // jul/ago 2026: 15 professores com total capturado antes de a carteira excluir banda.
  const r = lib.decidirListaCarteira({ fechado: true, carteira_alunos: 30, pessoas_regulares: 28, linhas: [linha] }, setembro);
  assert.equal(r.origem, 'fechamento');
  assert.match(r.aviso, /registrou 30 alunos, mas gravou 28 nomes/);
});

test('a tela passa o período para a lista e para o modal', () => {
  const tab = readFileSync('src/components/App/Professores/TabCarteiraProfessores.tsx', 'utf8');
  const modal = readFileSync('src/components/App/Professores/ModalCarteiraProfessor.tsx', 'utf8');
  assert.match(tab, /periodo:\s*periodoCarteira/);
  assert.match(tab, /periodo=\{periodoCarteira\}/);
  assert.match(modal, /unidadeId: unidadeAtual,\s*periodo,/);
});
