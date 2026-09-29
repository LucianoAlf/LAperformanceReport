// Regras da aba ESTOQUE da Lojinha — computador e celular (LAPE-32).
//
// Trava três coisas: que o agrupamento extraído da `TabEstoque` dá o MESMO
// resultado do código antigo (inclusive a ordem, que não é a que parece), e os
// dois defeitos do computador consertados em 29/09/2026 — a busca que não
// buscava e o título que dizia "Barra" para todo mundo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import esbuild from 'esbuild';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const le = (p) => readFileSync(join(RAIZ, p), 'utf8').replace(/\r\n/g, '\n');

const lib = await (async () => {
  const { outputFiles } = await esbuild.build({
    entryPoints: [join(RAIZ, 'src/lib/lojinhaEstoque.ts')],
    bundle: true,
    format: 'esm',
    write: false,
  });
  const arquivo = join(mkdtempSync(join(tmpdir(), 'estoque-')), 'lojinhaEstoque.mjs');
  writeFileSync(arquivo, outputFiles[0].text);
  return import(pathToFileURL(arquivo).href);
})();

const { agruparEstoque, filtrarEstoquePorBusca, tituloDaUnidade, nivelDaVariacao } = lib;

// O reduce que morava na `TabEstoque` até 29/09/2026, copiado sem mudar nada.
const agruparComoAntes = (estoque) =>
  Object.values(
    estoque.reduce((acc, e) => {
      const key = e.produto_id;
      if (!acc[key]) {
        acc[key] = {
          produto_id: e.produto_id,
          produto_nome: e.loja_produtos?.nome || '',
          icone: e.loja_produtos?.loja_categorias?.icone || '📦',
          variacoes: [],
        };
      }
      acc[key].variacoes.push({
        variacao_id: e.variacao_id,
        variacao_nome: e.loja_variacoes?.nome || null,
        quantidade: e.quantidade,
        minimo: e.loja_produtos?.estoque_minimo || 5,
        ultima_mov: e.updated_at,
      });
      return acc;
    }, {}),
  );

// Chega ordenado por NOME, como a consulta pede — e com os ids fora de ordem.
const LINHAS = [
  { produto_id: 42, variacao_id: 1, quantidade: 0, updated_at: '2026-09-01', loja_produtos: { nome: 'Afinador', estoque_minimo: 3 } },
  { produto_id: 7, variacao_id: 2, quantidade: 11, updated_at: '2026-09-02', loja_produtos: { nome: 'Camiseta', estoque_minimo: null }, loja_variacoes: { nome: 'P' } },
  { produto_id: 7, variacao_id: 3, quantidade: 2, updated_at: '2026-09-03', loja_produtos: { nome: 'Camiseta', estoque_minimo: null }, loja_variacoes: { nome: 'GG' } },
  { produto_id: 19, variacao_id: null, quantidade: 4, updated_at: null, loja_produtos: { nome: 'Palheta', estoque_minimo: 10, loja_categorias: { icone: '🎸' } } },
];

test('🔴 o agrupamento extraído é IDÊNTICO ao reduce antigo — ordem incluída', () => {
  // A consulta pede ordem alfabética, mas o `Object.values` reordena chaves
  // numéricas, e o computador sempre exibiu por id. A 1ª versão da extração
  // devolvia ordem alfabética e teria mudado o desktop; foi esta comparação
  // que pegou.
  assert.deepEqual(agruparEstoque(LINHAS), agruparComoAntes(LINHAS));
  assert.deepEqual(
    agruparEstoque(LINHAS).map((g) => g.produto_nome),
    ['Camiseta', 'Palheta', 'Afinador'],
  );
});

test('🔴 a busca encontra — pelo produto ou pela variação', () => {
  const grupos = agruparEstoque(LINHAS);
  assert.deepEqual(filtrarEstoquePorBusca(grupos, 'palh').map((g) => g.produto_nome), ['Palheta']);
  assert.deepEqual(filtrarEstoquePorBusca(grupos, 'PALH').map((g) => g.produto_nome), ['Palheta']);
  // "GG" acha a camiseta, e a camiseta vem com TODAS as variações: cortar o P
  // esconderia justamente o tamanho que dá para oferecer no lugar.
  const gg = filtrarEstoquePorBusca(grupos, 'gg');
  assert.deepEqual(gg.map((g) => g.produto_nome), ['Camiseta']);
  assert.equal(gg[0].variacoes.length, 2);
  assert.equal(filtrarEstoquePorBusca(grupos, 'violino').length, 0);
});

test('busca vazia ou só espaço devolve a lista inteira, na mesma ordem', () => {
  const grupos = agruparEstoque(LINHAS);
  assert.deepEqual(filtrarEstoquePorBusca(grupos, ''), grupos);
  assert.deepEqual(filtrarEstoquePorBusca(grupos, '   '), grupos);
});

test('🔴 o título diz a unidade de verdade — nunca "Barra" por padrão', () => {
  assert.equal(tituloDaUnidade('todos', null), 'Consolidado');
  assert.equal(tituloDaUnidade('uuid-cg', 'Campo Grande'), 'Campo Grande');
  // Sem o nome, não inventa uma unidade que ninguém escolheu.
  assert.equal(tituloDaUnidade('uuid-cg', null), 'Unidade');
  assert.equal(tituloDaUnidade('uuid-cg', '  '), 'Unidade');
  assert.notEqual(tituloDaUnidade('uuid-cg', null), 'Barra');
});

test('o nível da variação usa a régua da coluna Status do computador', () => {
  assert.equal(nivelDaVariacao({ quantidade: 0, minimo: 5 }), 'zerado');
  assert.equal(nivelDaVariacao({ quantidade: 4, minimo: 5 }), 'atencao');
  assert.equal(nivelDaVariacao({ quantidade: 5, minimo: 5 }), 'ok');
});

const tab = le('src/components/App/Lojinha/TabEstoque.tsx');

test('🔴 o computador usa as regras — busca ligada, título sem nome fixo', () => {
  assert.doesNotMatch(tab, /'Barra'/u, 'nome de unidade escrito fixo no título');
  assert.match(tab, /tituloDaUnidade\(unidadeId, nomeUnidade\)/u);
  assert.match(tab, /filtrarEstoquePorBusca\(estoqueAgrupado, busca\)/u, 'a caixa de busca voltou a ser decorativa');
  assert.match(tab, /agruparEstoque\(estoque\)/u);
  assert.doesNotMatch(tab, /estoque\.reduce\(/u, 'segunda cópia do agrupamento');
});

test('o nome da unidade vem do banco e a falha não é muda', () => {
  const bloco = tab.slice(tab.indexOf('const { data: unidade'), tab.indexOf('setNomeUnidade(unidade'));
  assert.ok(bloco.length > 0, 'a consulta do nome da unidade sumiu');
  assert.match(bloco, /error: erroUnidade/u);
  assert.match(bloco, /console\.error\(`\[TabEstoque\] nome da unidade \$\{unidadeId\}/u);
});

test('busca sem resultado diz que não achou — senão parece quebrada', () => {
  assert.match(tab, /Nenhum produto ou variação com/u);
});
