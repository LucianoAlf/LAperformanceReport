import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const webhookPath = join(process.cwd(), 'supabase', 'functions', 'processar-matricula-emusys', 'index.ts');
const syncPath = join(process.cwd(), 'supabase', 'functions', 'sync-matriculas-emusys', 'index.ts');
const sharedPath = join(process.cwd(), 'supabase', 'functions', '_shared', 'emusys-cadastro-canonico.ts');

const webhook = readFileSync(webhookPath, 'utf8');
const sync = readFileSync(syncPath, 'utf8');
const shared = readFileSync(sharedPath, 'utf8');

/**
 * Recorta o corpo de uma funcao pelo balanceamento de chaves.
 * Regex nao serve aqui: os arquivos tem CRLF e blocos aninhados, entao
 * `[\s\S]*?
}` casa cedo demais ou nao casa nada.
 */
function corpoDaFuncao(source, assinatura) {
  const inicio = source.indexOf(assinatura);
  if (inicio === -1) return '';
  let i = source.indexOf('{', inicio);
  if (i === -1) return '';
  let profundidade = 0;
  for (let j = i; j < source.length; j += 1) {
    if (source[j] === '{') profundidade += 1;
    else if (source[j] === '}') {
      profundidade -= 1;
      if (profundidade === 0) return source.slice(inicio, j + 1);
    }
  }
  return '';
}

const blocoAplicacao = corpoDaFuncao(webhook, 'async function aplicarAlteracaoNoCadastro');

test('matricula_alterada escreve de fato no cadastro', async (t) => {
  await t.test('o handler chama a aplicacao antes de qualquer outra coisa', () => {
    assert.match(
      webhook,
      /async function handleMatriculaAlterada[\s\S]*?aplicarAlteracaoNoCadastro\(supabase, p\)/u,
      'handleMatriculaAlterada precisa aplicar a alteracao no cadastro',
    );
  });

  await t.test('faz UPDATE em alunos', () => {
    const bloco = blocoAplicacao;
    assert.ok(bloco, 'aplicarAlteracaoNoCadastro deve existir');
    assert.match(bloco, /\.from\('alunos'\)[\s\S]*?\.update\(/u, 'precisa escrever em alunos');
    assert.match(bloco, /\.eq\('unidade_id', p\.unidadeId\)/u, 'o UPDATE tem de ser escopado por unidade');
  });

  await t.test('nao escreve quando nao ha o que mudar', () => {
    const bloco = blocoAplicacao;
    assert.match(
      bloco,
      /Object\.keys\(patch\)\.length === 0[\s\S]*?return resultado/u,
      'patch vazio tem de sair antes do UPDATE — senao toda alteracao vira escrita inutil',
    );
  });

  await t.test('respeita decisao humana e nao reativa aluno fora da operacao', () => {
    const bloco = blocoAplicacao;
    assert.match(bloco, /carregarCamposFixados/u, 'campos fixados precisam ser consultados');
    assert.match(
      bloco,
      /\['evadido', 'inativo'\]\.includes/u,
      'aluno evadido/inativo nao pode ser reativado por webhook de alteracao',
    );
  });

  await t.test('nunca derruba o webhook', () => {
    const bloco = blocoAplicacao;
    assert.match(bloco, /catch \(erro: any\)/u, 'erro na escrita nao pode derrubar o processamento do evento');
  });

  await t.test('NAO escreve valor financeiro', () => {
    const bloco = blocoAplicacao;
    for (const campo of ['valor_parcela', 'valor_cheio', 'desconto_fixo', 'desconto_condicional']) {
      assert.equal(
        bloco.includes(campo),
        false,
        `${campo} nao pode ser escrito pelo webhook: a regua financeira depende de campos que o payload nao tem`,
      );
    }
  });
});

test('a regra de derivacao e UMA SO nos dois caminhos de escrita', async (t) => {
  // Esta e a barreira contra o padrao que causou as duplicatas de renovacao:
  // duas fontes de escrita com regras proprias para o mesmo campo.

  await t.test('webhook e sync importam o mesmo modulo', () => {
    assert.match(webhook, /from '\.\.\/_shared\/emusys-cadastro-canonico\.ts'/u);
    assert.match(sync, /from '\.\.\/_shared\/emusys-cadastro-canonico\.ts'/u);
  });

  await t.test('nenhum dos dois reimplementa a comparacao ou o parsing localmente', () => {
    for (const [nome, source] of [['webhook', webhook], ['sync', sync]]) {
      assert.doesNotMatch(
        source,
        /^function valoresIguaisParaCampo\s*\(/mu,
        `${nome} nao pode ter copia local de valoresIguaisParaCampo`,
      );
      assert.doesNotMatch(
        source,
        /^function parseDiaDeTurma\s*\(/mu,
        `${nome} nao pode ter copia local de parseDiaDeTurma`,
      );
      assert.doesNotMatch(
        source,
        /^function parseHorarioDeTurma\s*\(/mu,
        `${nome} nao pode ter copia local de parseHorarioDeTurma`,
      );
      assert.doesNotMatch(
        source,
        /^function devePreservarCursoBase\s*\(/mu,
        `${nome} nao pode ter copia local de devePreservarCursoBase`,
      );
    }
  });

  await t.test('o sync passa o curso_id, nao o objeto aluno, para devePreservarCursoBase', () => {
    // A assinatura compartilhada recebe o curso. Passar o objeto faz Number(obj) = NaN,
    // a comparacao com o id de Musicalizacao Preparatoria falha em silencio e o curso
    // do aluno passa a ser sobrescrito pela disciplina interna da grade.
    assert.match(sync, /devePreservarCursoBase\(a\.curso_id,/u);
    assert.doesNotMatch(sync, /devePreservarCursoBase\(a,/u);
  });

  await t.test('dia e horario saem do nome_turma nos dois lados', () => {
    assert.match(
      shared,
      /parseDiaDeTurma[\s\S]*?nome_turma|nome_turma[\s\S]*?parseDiaDeTurma/u,
      'a derivacao de dia/horario tem de partir do nome_turma, unico campo que a API tambem entrega',
    );
  });
});

test('o modulo compartilhado documenta as fronteiras que nao pode cruzar', async (t) => {
  await t.test('deixa explicito que financeiro fica fora', () => {
    assert.match(shared, /O QUE ESTE MÓDULO NÃO FAZ/u);
    assert.match(shared, /Financeiro continua exclusivo do sync/u);
  });

  await t.test('carregarCamposFixados falha fechado', () => {
    const bloco = corpoDaFuncao(shared, 'export async function carregarCamposFixados');
    assert.match(
      bloco,
      /if \(error\) throw error/u,
      'erro ao ler campos fixados nao pode virar "nenhum campo fixado" — isso sobrescreveria decisao humana',
    );
  });

  await t.test('profMap de jornada nao serve para cadastro', () => {
    assert.match(
      shared,
      /nunca use o de jornada para escrever[\s\S]*?professor_atual_id/iu,
      'a distincao entre profMap e profMapJornada precisa estar escrita',
    );
  });
});
