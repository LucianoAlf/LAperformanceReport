import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  CATEGORIAS_COM_IDENTIDADE,
  exigeIdentidade,
  lancamentoCego,
  origemDoLancamento,
} from '../src/lib/caixaIdentidade.ts';

// Medido em 08/09/2026 no caixa de producao: a Sol grava fatura_id em 88% do que lanca
// (61 de 69 em setembro) e o lancamento manual do app em 19% (3 de 16) — porque o
// formulario nao tem o campo. Em agosto o caminho humano moveu R$ 87.342,98 contra
// R$ 46.531,58 da Sol, praticamente todo cego.
//
// Sem a identidade nao da para ligar o caixa ao DRE: entrada COM fatura ja entrou pelo
// sync do Emusys (repetir seria inventar R$ 130 mil de faturamento) e entrada SEM fatura
// e receita nova que hoje nao tem porta nenhuma. A distincao e o mecanismo inteiro.

test('origem separa Sol de humano pelo criado_por', () => {
  assert.equal(origemDoLancamento('sol-agente:grupo:5521995507831'), 'sol');
  assert.equal(origemDoLancamento('Mayra Alves'), 'humano');
  assert.equal(origemDoLancamento('migracao:reparo-lote-incompleto'), 'migracao');
  assert.equal(origemDoLancamento(null), 'desconhecida');
  assert.equal(origemDoLancamento(''), 'desconhecida');
});

// Nome de pessoa que comeca com "sol" nao pode virar lancamento da Sol: o prefixo real
// tem os dois pontos. "Solange Costa" e humano.
test('nome que comeca com sol nao vira lancamento da Sol', () => {
  assert.equal(origemDoLancamento('Solange Costa da Silva'), 'humano');
  assert.equal(origemDoLancamento('Solano'), 'humano');
});

test('so entrada de parcela, passaporte e lojinha pede identidade', () => {
  assert.deepEqual([...CATEGORIAS_COM_IDENTIDADE].sort(), ['lojinha', 'parcela', 'passaporte']);
  assert.equal(exigeIdentidade('entrada', 'parcela'), true);
  assert.equal(exigeIdentidade('entrada', 'passaporte'), true);
  assert.equal(exigeIdentidade('entrada', 'lojinha'), true);
  assert.equal(exigeIdentidade('entrada', 'outro'), false);
  // saida nunca tem fatura de aluno: retirada, seguranca e despesa ficam de fora
  assert.equal(exigeIdentidade('saida', 'lojinha'), false);
  assert.equal(exigeIdentidade('saida', 'retirada'), false);
});

test('cego e a entrada que pede identidade e nao tem', () => {
  assert.equal(lancamentoCego({ tipo: 'entrada', categoria: 'parcela', fatura_id: null }), true);
  assert.equal(lancamentoCego({ tipo: 'entrada', categoria: 'parcela', fatura_id: 'uuid' }), false);
  assert.equal(lancamentoCego({ tipo: 'saida', categoria: 'retirada', fatura_id: null }), false);
  assert.equal(lancamentoCego({ tipo: 'entrada', categoria: 'outro', fatura_id: null }), false);
});

// A lojinha nao tem fatura no Emusys quase nunca — ela PEDE a identidade para o dia em
// que tiver, mas ficar sem nao pode travar o balcao. Travar o formulario e como se
// produz lancamento de R$ 0,01 para passar da validacao.
test('sem identidade nao bloqueia: cego e aviso, nao erro', () => {
  const form = readFileSync(
    new URL('../src/components/App/Administrativo/CaixaFinanceiro/CaixaMovimentacaoForm.tsx', import.meta.url),
    'utf8',
  );
  const submit = form.match(/async function handleSubmit[\s\S]*?\n {2}\}/)?.[0] ?? '';
  assert.notEqual(submit, '', 'handleSubmit nao encontrado');
  assert.doesNotMatch(submit, /fatura|aluno/i, 'submit nao pode recusar por falta de identidade');
});

test('o tipo do insert carrega fatura_id e aluno_id', () => {
  const tipos = readFileSync(new URL('../src/types/caixa.ts', import.meta.url), 'utf8');
  const input = tipos.match(/export interface NovaCaixaMovimentacaoInput \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.notEqual(input, '', 'NovaCaixaMovimentacaoInput nao encontrada');
  assert.match(input, /fatura_id\?: string \| null;/);
  assert.match(input, /aluno_id\?: number \| null;/);
});

// useCaixaDiario faz `...input` no insert: se o tipo carrega, o banco recebe. O teste
// existe para que ninguem troque o spread por uma lista de campos e perca os dois em
// silencio — foi assim que eles ficaram de fora desde o comeco.
test('o insert do caixa continua espalhando o input inteiro', () => {
  const hook = readFileSync(new URL('../src/hooks/useCaixaDiario.ts', import.meta.url), 'utf8');
  const insert = hook.match(/\.from\('caixa_movimentacoes'\)\s*\n\s*\.insert\(\{[\s\S]*?\}\)/)?.[0] ?? '';
  assert.notEqual(insert, '', 'insert do caixa nao encontrado');
  assert.match(insert, /\.\.\.input,/);
});

test('o formulario oferece o seletor de fatura na entrada que pede identidade', () => {
  const form = readFileSync(
    new URL('../src/components/App/Administrativo/CaixaFinanceiro/CaixaMovimentacaoForm.tsx', import.meta.url),
    'utf8',
  );
  assert.match(form, /exigeIdentidade/);
  assert.match(form, /faturaId/);
  assert.match(form, /alunoId/);
});
