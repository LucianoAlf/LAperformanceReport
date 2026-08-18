import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arquivo = path.join(raiz, 'supabase', 'functions', 'sync-matriculas-emusys', 'index.ts');
const fonte = await readFile(arquivo, 'utf8');

// ⚠️ REESCRITO em 2026-08-18 por decisão do Alf: fato do Emusys entra no cadastro DIRETO.
// A versão anterior deste arquivo (PR #163) exigia o oposto — que o sync separasse o patch
// por domínio e empurrasse grade/valor/contrato para filas de aprovação. Isso foi vetado: a
// fila fazia o cadastro divergir do Emusys por dias (caso Bernardo/Isabela Bolzani, que
// trocaram de professor e continuaram exibindo o antigo). Fila é para dúvida, não para dado
// que já existe no Emusys.

test('o que vem do Emusys é aplicado direto em alunos, sem passar por fila', () => {
  assert.match(fonte, /\.from\('alunos'\)\s*\n\s*\.update\(\{ \.\.\.patchEmusys/);
  assert.match(fonte, /resumo\.aplicados\+\+/);
  assert.match(fonte, /modo: 'aplicacao_direta'/);
  // auto_preview foi aposentado: não pode voltar a ser criado
  assert.doesNotMatch(fonte, /tipo:\s*'auto_preview'/);
  assert.doesNotMatch(fonte, /tipo_divergencia:\s*'auto_preview',\s*campo/);
});

test('as duas guardas que tornam a aplicação direta segura continuam de pé', () => {
  // 1. decisão humana explícita ("Manter LA Report") vira trava e nunca entra no patch
  assert.match(fonte, /if \(vNovo == null \|\| fixadosEfetivos\.has\(campo\)\) return;/);
  // 2. valor só é aplicado com payload sadio; corrompido vai para a fila humana
  assert.match(fonte, /if \(!financeiro\.bloqueiaValorAutomatico && parcelaComercial != null && parcelaComercial >= 0\)/);
  assert.match(fonte, /tipo:\s*'valor_divergente'/);
});

test('continua humano só o que o sistema não sabe responder', () => {
  // identidade ambígua: aplicar vincularia a pessoa errada
  assert.match(fonte, /tipo:\s*'ambiguo'/);
  assert.match(fonte, /tipo:\s*'classificacao_divergente'/);
  assert.match(fonte, /tipo:\s*'disciplina_nao_mapeada'/);
});

test('toda aplicação deixa trilha de auditoria com de/para', () => {
  assert.match(fonte, /evento: 'sync_matriculas_aplicacao_direta', acao: 'aplicado'/);
  assert.match(fonte, /evento: 'sync_matriculas_aplicacao_direta', acao: 'erro'/);
  assert.match(fonte, /diffs: \{ \.\.\.\(r\.diffsAplicar \|\| \{\}\), \.\.\.\(r\.detalhes\?\.diffs \?\? \{\}\) \}/);
});

test('o objeto local é atualizado após aplicar, para não reabrir divergência do próprio valor', () => {
  assert.match(fonte, /Object\.assign\(a, patchEmusys\)/);
  assert.match(fonte, /const jaSincronizado = atributosSincronizados\.get\(a\.id\)/);
});

test('foto e Instagram usam o sync cadastral canônico, sem virar pendência de grade', () => {
  const inicio = fonte.indexOf('function gerarPatchCadastroCanonicoEmusys');
  const fim = fonte.indexOf('async function aplicarPatchAtributosEmusys');
  const gerador = inicio >= 0 && fim > inicio ? fonte.slice(inicio, fim) : '';

  assert.match(gerador, /'foto_url'/);
  assert.match(gerador, /'instagram'/);
  assert.match(gerador, /instagram_nao_possui/);
});

test('o sync operacional também executa a fase B sem inferir ausência', () => {
  assert.match(fonte, /const alunosForaDoPayloadOperacional = new Set<number>\(\);/);
  assert.match(
    fonte,
    /reconciliar\([\s\S]*?decisoesCanonicasPorMatricula,[\s\S]*?escopo === 'completo',[\s\S]*?\)/,
  );

  const inicioOperacional = fonte.indexOf('// ─── A6b. Reconciliação de ausentes');
  const inicioFaseB = fonte.indexOf('// ─── B2. Decisões canônicas');
  const blocoOperacional = inicioOperacional >= 0 && inicioFaseB > inicioOperacional
    ? fonte.slice(inicioOperacional, inicioFaseB)
    : '';
  assert.doesNotMatch(blocoOperacional, /return new Response/);
});
