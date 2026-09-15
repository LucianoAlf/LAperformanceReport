/**
 * LAPE-34 — o rótulo do contato que está na comunidade WhatsApp.
 *
 * Roda a função REAL (compilada do .ts com esbuild), não uma cópia — cópia provaria o
 * teste, não o código. Mesmo padrão de tests/bolsistaEBandaForaDosKpis.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'comunidade-wa-'));
const saida = join(dir, 'comunidadeWaContato.mjs');
execFileSync('npx', ['esbuild', 'src/lib/comunidadeWaContato.ts', '--format=esm', `--outfile=${saida}`], {
  stdio: 'pipe', shell: process.platform === 'win32',
});
const lib = await import(pathToFileURL(saida).href);
test.after(() => rmSync(dir, { recursive: true, force: true }));

test('o numero que esta nos DOIS campos nao vira um chute', () => {
  // 31% dos casos reais. Afirmar "responsavel" aqui seria inventar o que o cadastro
  // nao diz -- e o mesmo motivo de sem_captura nao virar "fora" na LAPE-33.
  assert.equal(lib.rotuloDeQuem('aluno_e_responsavel'), 'do aluno e do responsável');
  assert.equal(lib.rotuloDeQuemCurto('aluno_e_responsavel'), 'aluno/resp.');
});

test('cada origem tem rotulo proprio', () => {
  assert.equal(lib.rotuloDeQuem('aluno'), 'do aluno');
  assert.equal(lib.rotuloDeQuem('responsavel'), 'do responsável');
  assert.equal(lib.rotuloDeQuem('contato_extra'), 'de um contato cadastrado');
});

test('origem ausente NAO se disfarca de aluno', () => {
  // Cair no ramo de 'aluno' por omissao faria a tela afirmar que o proprio aluno esta
  // no grupo quando ninguem sabe de quem e o numero.
  for (const vazio of [null, undefined, 'qualquer_coisa']) {
    assert.equal(lib.rotuloDeQuem(vazio), 'de origem não identificada');
  }
  assert.equal(lib.rotuloDeQuemCurto(null), '—');
});

test('parentesco "proprio" nao vira ruido ao lado do nome do aluno', () => {
  assert.equal(lib.nomeDoContato({ nome: 'Luciano Peres', parentesco: 'proprio' }), 'Luciano Peres');
  assert.equal(lib.nomeDoContato({ nome: 'Luciano Peres', parentesco: 'PROPRIO' }), 'Luciano Peres');
  assert.equal(lib.nomeDoContato({ nome: 'Maria', parentesco: 'mãe' }), 'Maria (mãe)');
});

test('sem nome cadastrado devolve null em vez de inventar dono', () => {
  assert.equal(lib.nomeDoContato({ nome: null, parentesco: 'mãe' }), null);
  assert.equal(lib.nomeDoContato({ nome: '   ', parentesco: 'mãe' }), null);
});

test('a linha da ficha junta telefone, de quem e nome', () => {
  assert.equal(
    lib.descreverContato({ telefone: '(21) 99999-0000', de_quem: 'responsavel', nome: 'Maria', parentesco: 'mãe' }),
    '(21) 99999-0000 · do responsável · Maria (mãe)',
  );
});

test('a linha nao deixa buraco quando falta telefone', () => {
  assert.equal(
    lib.descreverContato({ telefone: null, de_quem: 'aluno', nome: null, parentesco: null }),
    'do aluno',
  );
});

test('contatos_no_grupo aceita jsonb ja parseado e string', () => {
  const esperado = [{ telefone: '(21) 1', de_quem: 'aluno', nome: null, parentesco: null }];
  assert.deepEqual(lib.normalizarContatos([{ telefone: '(21) 1', de_quem: 'aluno' }]), esperado);
  assert.deepEqual(lib.normalizarContatos('[{"telefone":"(21) 1","de_quem":"aluno"}]'), esperado);
});

test('payload torto NAO derruba a Lista', () => {
  // A view pode mudar; a coluna nao pode explodir no meio da tela por causa disso.
  for (const torto of [null, undefined, 'nao e json', 42, {}, [null, 'x', 7]]) {
    assert.deepEqual(lib.normalizarContatos(torto), []);
  }
});

test('de_quem desconhecido no payload vira null, nunca passa cru para a tela', () => {
  const [c] = lib.normalizarContatos([{ telefone: '(21) 1', de_quem: 'sindico' }]);
  assert.equal(c.de_quem, null);
  assert.equal(lib.rotuloDeQuem(c.de_quem), 'de origem não identificada');
});
