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
  const esperado = [{ telefone: '(21) 1', de_quem: 'aluno', nome: null, parentesco: null, nomes: [] }];
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

// ── O MESMO NÚMERO com DOIS cadastros (22/09/2026) ────────────────────────────────
// Até aqui a view escolhia UM dos dois pela ordem física do plano — sorteio: o mesmo
// aluno exibia ora o próprio nome, ora o da mãe, e mudava sozinho quando o plano mudava.
// Medido: 391 telefones com 2 nomes concorrentes, 371 deles no par aluno + responsável.

test('numero com dois cadastros declara OS DOIS, nunca escolhe um', () => {
  assert.equal(
    lib.nomeDoContato({
      nome: 'Jacqueline dos Santos Silva',
      parentesco: 'responsavel',
      nomes: [
        { nome: 'Anna Luísa dos Santos Guimarães', parentesco: 'proprio' },
        { nome: 'Jacqueline dos Santos Silva', parentesco: 'responsavel' },
      ],
    }),
    'Anna Luísa dos Santos Guimarães e Jacqueline dos Santos Silva (responsavel)',
  );
});

test('um cadastro so continua saindo exatamente como antes', () => {
  assert.equal(
    lib.nomeDoContato({ nome: 'Maria', parentesco: 'mãe', nomes: [{ nome: 'Maria', parentesco: 'mãe' }] }),
    'Maria (mãe)',
  );
  // 'proprio' segue sem rótulo: repetir o nome do aluno ao lado dele não acrescenta nada.
  assert.equal(
    lib.nomeDoContato({ nome: 'Melissa', parentesco: 'proprio', nomes: [{ nome: 'Melissa', parentesco: 'proprio' }] }),
    'Melissa',
  );
});

test('sem a lista, cai nos campos soltos — consumidor antigo nao quebra', () => {
  assert.equal(lib.nomeDoContato({ nome: 'Maria', parentesco: 'mãe' }), 'Maria (mãe)');
  assert.equal(lib.nomeDoContato({ nome: null, parentesco: null }), null);
  assert.equal(lib.nomeDoContato({ nome: 'Ana', parentesco: null, nomes: null }), 'Ana');
});

test('lista torta NAO derruba a tela nem inventa nome', () => {
  for (const torto of [null, undefined, 'nao e json', 42, {}, [null, 'x', 7], [{ parentesco: 'mae' }]]) {
    assert.deepEqual(lib.normalizarNomesCadastrados(torto), []);
  }
  // nome vazio é descartado: melhor não exibir que exibir " (mae)" sozinho.
  assert.deepEqual(lib.normalizarNomesCadastrados([{ nome: '   ', parentesco: 'mae' }]), []);
});

test('normalizarNomesCadastrados aceita jsonb parseado e string', () => {
  const esperado = [{ nome: 'Ana', parentesco: 'mae' }];
  assert.deepEqual(lib.normalizarNomesCadastrados([{ nome: 'Ana', parentesco: 'mae' }]), esperado);
  assert.deepEqual(lib.normalizarNomesCadastrados('[{"nome":"Ana","parentesco":"mae"}]'), esperado);
});

test('o resultado NAO depende da ordem em que o banco devolveu (era o sorteio)', () => {
  const a = [{ nome: 'Anna', parentesco: 'proprio' }, { nome: 'Jacqueline', parentesco: 'responsavel' }];
  const b = [{ nome: 'Jacqueline', parentesco: 'responsavel' }, { nome: 'Anna', parentesco: 'proprio' }];
  // A ordem muda o texto, mas NENHUM nome some — que era o defeito: um dos dois sumia.
  for (const lista of [a, b]) {
    const saida = lib.nomeDoContato({ nome: lista[0].nome, parentesco: lista[0].parentesco, nomes: lista });
    assert.ok(saida.includes('Anna'), 'perdeu o nome do aluno');
    assert.ok(saida.includes('Jacqueline'), 'perdeu o nome do responsavel');
  }
});

// ── "Fora" nao pode ser dito para quem nao tem telefone (22/09/2026) ─────────────
// "Fora" AFIRMA que a pessoa nao esta no grupo. Sem nenhum telefone cadastrado nao ha
// numero para procurar, logo nao se sabe. Medido: 53 alunos, 10 ativos.

test('sem telefone e "nao sei", nunca uma resposta sobre estar no grupo', () => {
  assert.equal(lib.estadoEhIndeterminado('sem_telefone_cadastrado'), true);
  assert.equal(lib.estadoEhIndeterminado('sem_captura'), true);
  assert.equal(lib.estadoEhIndeterminado('captura_desatualizada'), true);
  assert.equal(lib.estadoEhIndeterminado('sem_grupo_configurado'), true);
  // estes DOIS sao resposta, nao duvida:
  assert.equal(lib.estadoEhIndeterminado('na_comunidade'), false);
  assert.equal(lib.estadoEhIndeterminado('fora_da_comunidade'), false);
});

test('a tela NUNCA escreve "Fora" para quem nao tem telefone', () => {
  const exp = lib.explicarEstadoComunidade('sem_telefone_cadastrado');
  assert.equal(exp.rotulo, 'Sem telefone');
  assert.ok(!/fora/i.test(exp.rotulo), 'o rotulo nao pode afirmar que esta fora');
  assert.ok(!/fora/i.test(exp.motivo), 'o motivo nao pode afirmar que esta fora');
  // e tem de dizer qual e a pendencia, senao vira so mais um traco sem acao
  assert.ok(/cadastr/i.test(exp.motivo), 'o motivo precisa apontar o cadastro do contato');
});

test('cada "nao sei" explica a SUA causa - nao sao o mesmo problema', () => {
  const motivos = ['sem_telefone_cadastrado', 'sem_captura', 'captura_desatualizada', 'sem_grupo_configurado']
    .map((e) => lib.explicarEstadoComunidade(e).motivo);
  assert.equal(new Set(motivos).size, 4, 'dois estados com o mesmo texto escondem a causa');
});

test('estado com resposta nao ganha explicacao de duvida', () => {
  assert.equal(lib.explicarEstadoComunidade('na_comunidade'), null);
  assert.equal(lib.explicarEstadoComunidade('fora_da_comunidade'), null);
  assert.equal(lib.explicarEstadoComunidade(null), null);
  assert.equal(lib.explicarEstadoComunidade(undefined), null);
});

// ── o badge diz fora DE QUE (22/09/2026) ────────────────────────────────────────
// "Fora" sozinho, numa linha que ja tem status, contrato e inadimplencia, e lido como
// "fora da escola". Fonte unica para coluna e ficha nao divergirem.

test('o rotulo diz "Fora da comunidade", nunca so "Fora"', () => {
  assert.equal(lib.rotuloEstadoComunidade('fora_da_comunidade'), 'Fora da comunidade');
});

test('o rotulo de cada "nao sei" sai da MESMA fonte que explica o motivo', () => {
  for (const estado of ['sem_telefone_cadastrado', 'sem_captura', 'captura_desatualizada', 'sem_grupo_configurado']) {
    assert.equal(lib.rotuloEstadoComunidade(estado), lib.explicarEstadoComunidade(estado).rotulo,
      `${estado}: o rotulo divergiu da explicacao`);
  }
  // sem telefone continua sem afirmar que esta fora
  assert.ok(!/fora/i.test(lib.rotuloEstadoComunidade('sem_telefone_cadastrado')));
});

test('na_comunidade NAO tem rotulo fixo - o texto dele carrega o nome do grupo', () => {
  assert.equal(lib.rotuloEstadoComunidade('na_comunidade'), null);
  assert.equal(lib.rotuloEstadoComunidade(null), null);
  assert.equal(lib.rotuloEstadoComunidade(undefined), null);
});
