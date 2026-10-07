// Regras da Lojinha no celular (LAPE-32).
//
// A tabela do computador já vira cartão aqui, mas empilha as NOVE colunas como
// nove linhas: 326px por produto, 20 produtos, 6.520px. O que este teste trava
// é o que separa a linha da ficha — e a promessa de que o computador continua
// filtrando a mesma lista.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import esbuild from 'esbuild';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const lib = await (async () => {
  const { outputFiles } = await esbuild.build({
    entryPoints: [join(RAIZ, 'src/lib/lojinhaMobile.ts')],
    bundle: true,
    format: 'esm',
    write: false,
  });
  const arquivo = join(mkdtempSync(join(tmpdir(), 'lojinha-')), 'lojinhaMobile.mjs');
  writeFileSync(arquivo, outputFiles[0].text);
  return import(pathToFileURL(arquivo).href);
})();

const {
  nivelDeEstoque,
  produtoPassaNoFiltro,
  filtrarProdutos,
  contarChips,
  formatarPreco,
  subtituloDoProduto,
  fichaDoProduto,
  SUBABAS_NO_COMPUTADOR,
} = lib;

function prod(over = {}) {
  return {
    id: 1,
    nome: 'Azul Music Style · G',
    sku: 'PROD-0012',
    preco: 50,
    custo: 22,
    categoria_id: 3,
    estoque_minimo: 5,
    comissao_especial: null,
    ativo: true,
    estoque_total: 7,
    variacoes_count: 0,
    loja_categorias: { id: 3, nome: 'Camisetas', icone: '👕' },
    ...over,
  };
}

const SEM_FILTRO = { busca: '', categoria_id: null, status: 'todos' };

test('nível de estoque separa "acabou" de "está acabando"', () => {
  // 🔴 Os dois pedem reposição, mas só o `sem` impede a venda que está
  // acontecendo agora, no balcão.
  assert.equal(nivelDeEstoque(prod({ estoque_total: 0 })), 'sem');
  assert.equal(nivelDeEstoque(prod({ estoque_total: 3, estoque_minimo: 5 })), 'baixo');
  assert.equal(nivelDeEstoque(prod({ estoque_total: 7, estoque_minimo: 5 })), 'ok');
  // Igual ao mínimo NÃO é baixo — a mesma comparação do desktop (`<`).
  assert.equal(nivelDeEstoque(prod({ estoque_total: 5, estoque_minimo: 5 })), 'ok');
  // Estoque ausente é zero, não "ok": produto sem saldo lido não pode nascer verde.
  assert.equal(nivelDeEstoque(prod({ estoque_total: undefined })), 'sem');
  // Negativo (estorno furado) conta como sem estoque, nunca como baixo.
  assert.equal(nivelDeEstoque(prod({ estoque_total: -2 })), 'sem');
});

test('a busca cobre nome E sku, sem diferenciar maiúscula', () => {
  const p = prod();
  assert.equal(produtoPassaNoFiltro(p, { ...SEM_FILTRO, busca: 'azul' }), true);
  assert.equal(produtoPassaNoFiltro(p, { ...SEM_FILTRO, busca: 'AZUL' }), true);
  assert.equal(produtoPassaNoFiltro(p, { ...SEM_FILTRO, busca: 'prod-0012' }), true);
  assert.equal(produtoPassaNoFiltro(p, { ...SEM_FILTRO, busca: 'baqueta' }), false);
  // Produto sem SKU não pode explodir na busca.
  assert.equal(produtoPassaNoFiltro(prod({ sku: null }), { ...SEM_FILTRO, busca: 'azul' }), true);
  assert.equal(produtoPassaNoFiltro(prod({ sku: null }), { ...SEM_FILTRO, busca: 'prod' }), false);
});

test('"estoque baixo" do filtro INCLUI o zerado — como no computador', () => {
  // ⚠️ Mudar isto alteraria o número que a tela do computador mostra.
  const f = { ...SEM_FILTRO, status: 'estoque_baixo' };
  assert.equal(produtoPassaNoFiltro(prod({ estoque_total: 0 }), f), true);
  assert.equal(produtoPassaNoFiltro(prod({ estoque_total: 3, estoque_minimo: 5 }), f), true);
  assert.equal(produtoPassaNoFiltro(prod({ estoque_total: 9, estoque_minimo: 5 }), f), false);
});

test('status e categoria recortam de forma independente', () => {
  const ativo = prod({ id: 1, ativo: true, categoria_id: 3 });
  const inativo = prod({ id: 2, ativo: false, categoria_id: 4 });
  const lista = [ativo, inativo];

  assert.deepEqual(filtrarProdutos(lista, { ...SEM_FILTRO, status: 'ativos' }).map(p => p.id), [1]);
  assert.deepEqual(filtrarProdutos(lista, { ...SEM_FILTRO, status: 'inativos' }).map(p => p.id), [2]);
  assert.deepEqual(filtrarProdutos(lista, { ...SEM_FILTRO, categoria_id: 4 }).map(p => p.id), [2]);
  assert.deepEqual(filtrarProdutos(lista, SEM_FILTRO).map(p => p.id), [1, 2]);
});

test('os chips contam sobre a lista INTEIRA, e não se sobrepõem', () => {
  const lista = [
    prod({ id: 1, estoque_total: 0 }),
    prod({ id: 2, estoque_total: 0 }),
    prod({ id: 3, estoque_total: 2, estoque_minimo: 5 }),
    prod({ id: 4, estoque_total: 9, estoque_minimo: 5 }),
    prod({ id: 5, estoque_total: 9, ativo: false }),
  ];
  const c = contarChips(lista);
  assert.equal(c.todos, 5);
  assert.equal(c.semEstoque, 2);
  // 🔴 `estoqueBaixo` NÃO soma o zerado aqui, ao contrário do filtro: os dois
  // chips ficam lado a lado, e contagens que se sobrepõem sem explicação
  // fazem o leitor somar errado.
  assert.equal(c.estoqueBaixo, 1);
  assert.equal(c.inativos, 1);
});

test('preço sem centavos quando é redondo, com centavos quando não é', () => {
  assert.match(formatarPreco(50), /^R\$\s?50$/);
  assert.match(formatarPreco(49.9), /49,90/);
  assert.match(formatarPreco(1240), /1\.240/);
});

test('o subtítulo omite a categoria ausente em vez de escrever um traço', () => {
  // ⚠️ `toLocaleString('pt-BR')` separa `R$` do número com espaço NÃO
  // SEPARÁVEL (U+00A0), não com espaço comum — comparar contra um literal
  // digitado à mão reprova um valor certo, com as duas strings idênticas na
  // mensagem de erro. Por isso o assert é por regex tolerante ao espaço.
  assert.match(subtituloDoProduto(prod()), /^R\$\s?50 · Camisetas$/);
  const semCat = subtituloDoProduto(prod({ loja_categorias: null }));
  assert.doesNotMatch(semCat, /—/, '"R$ 50 · —" gasta espaço para dizer que não sabe');
  assert.match(semCat, /R\$\s?50/);
  // Categoria só de espaços conta como ausente.
  assert.doesNotMatch(subtituloDoProduto(prod({ loja_categorias: { nome: '   ' } })), /·/);
});

test('🔴 a ficha carrega TUDO que saiu da linha — nada some em silêncio', () => {
  const linhas = fichaDoProduto(prod());
  const rotulos = linhas.map((l) => l.rotulo);
  // Cada coluna da tabela do computador que a linha não exibe mais precisa
  // reaparecer aqui. Sem este assert, "simplificar a linha" vira "perder dado".
  for (const esperado of ['SKU', 'Categoria', 'Variações', 'Comissão', 'Status', 'Custo']) {
    assert.ok(rotulos.includes(esperado), `a ficha deixou de mostrar ${esperado}`);
  }
  // Nenhum valor pode sair como "undefined" na tela.
  for (const l of linhas) {
    assert.equal(typeof l.valor, 'string');
    assert.doesNotMatch(l.valor, /undefined|null|NaN/);
  }
});

test('a ficha lida com produto cru sem inventar valor', () => {
  const linhas = fichaDoProduto({
    id: 9, nome: 'x', preco: 10, estoque_minimo: 0, ativo: false,
  });
  const mapa = Object.fromEntries(linhas.map((l) => [l.rotulo, l.valor]));
  assert.equal(mapa['SKU'], '—');
  assert.equal(mapa['Categoria'], '—');
  assert.equal(mapa['Variações'], '—');
  assert.equal(mapa['Comissão'], 'Padrão');
  assert.equal(mapa['Custo'], '—');
  assert.equal(mapa['Status'], 'Inativo');
});

test('comissão especial aparece com o número, não só "especial"', () => {
  const mapa = Object.fromEntries(fichaDoProduto(prod({ comissao_especial: 12 })).map((l) => [l.rotulo, l.valor]));
  assert.match(mapa['Comissão'], /12/);
  // Zero é um percentual válido e não pode virar "Padrão".
  const zero = Object.fromEntries(fichaDoProduto(prod({ comissao_especial: 0 })).map((l) => [l.rotulo, l.valor]));
  assert.match(zero['Comissão'], /0/);
});

// ---------------------------------------------------------------------------
// 🔴 A promessa desta frente: o computador não muda.
// ---------------------------------------------------------------------------

test('o computador filtra pela MESMA função, sem predicado próprio', () => {
  const tab = readFileSync(join(RAIZ, 'src/components/App/Lojinha/TabProdutos.tsx'), 'utf8');
  assert.match(tab, /filtrarProdutos\(produtos, filtros\)/);
  // O `filter` inline não pode ressuscitar ao lado da fonte única: as duas
  // telas filtram a mesma lista e o celular exibe a CONTAGEM nos chips.
  const semComentarios = tab.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(
    semComentarios,
    /produtos\.filter\(\s*\(p\)\s*=>\s*\{/,
    'voltou a existir um predicado de filtro próprio na tela do computador',
  );
});

test('a tela mobile não busca dado nem abre modal próprio', () => {
  const tela = readFileSync(join(RAIZ, 'src/mobile/telas/lojinha/ProdutosMobile.tsx'), 'utf8');
  for (const fonte of [/\bfetch\s*\(/, /\.rpc\s*\(/, /\bsupabase\b/, /use\w*Query\b/]) {
    assert.doesNotMatch(tela, fonte, `a tela ganhou fonte de dados própria (${fonte})`);
  }
  // Os modais são os do computador, alcançados por callback.
  assert.doesNotMatch(tela, /<ModalProduto|<ModalEntradaLote/);
  assert.match(tela, /onEditar|onNovo/);
});

test('🔴 os modais ficam FORA da bifurcação, senão somem no celular', () => {
  const tab = readFileSync(join(RAIZ, 'src/components/App/Lojinha/TabProdutos.tsx'), 'utf8');
  const iBifurca = tab.indexOf('{ehCelular ? (');
  const iFecha = tab.indexOf('{/* Modais */}');
  const iModal = tab.indexOf('<ModalProduto');
  assert.ok(iBifurca > 0 && iFecha > iBifurca, 'a bifurcação sumiu da tela de produtos');
  assert.ok(iModal > iFecha, 'o ModalProduto caiu para dentro do ramo do desktop');
});

test('a tela declara o que ficou no computador, em vez de omitir', () => {
  assert.deepEqual([...SUBABAS_NO_COMPUTADOR], ['Comissões', 'Configurações']);
  const tela = readFileSync(join(RAIZ, 'src/mobile/telas/lojinha/ProdutosMobile.tsx'), 'utf8');
  assert.match(tela, /SUBABAS_NO_COMPUTADOR/, 'a tela parou de dizer o que ficou de fora');
});
