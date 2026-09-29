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

// ---------------------------------------------------------------------------
// A tela do celular
// ---------------------------------------------------------------------------

const { rotuloPilula, rotuloTipoMovimentacao, ALERTAS_VISIVEIS } = lib;
const cel = le('src/mobile/telas/lojinha/EstoqueMobile.tsx');
const semComentarios = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/gu, '').replace(/(^|[^:])\/\/.*$/gmu, '$1');

test('🔴 a ordem é a do computador: repor primeiro, lista inteira depois', () => {
  const c = semComentarios(cel);
  const repor = c.indexOf('Precisa repor');
  const lista = c.indexOf('Estoque — {tituloUnidade}');
  const movs = c.indexOf('Ver movimentações recentes');
  assert.ok(repor > 0 && lista > 0 && movs > 0, 'um dos três blocos sumiu');
  assert.ok(repor < lista && lista < movs, 'a ordem dos blocos mudou');
});

test('🔴 a lista vem INTEIRA — nenhum recorte escondendo produto', () => {
  // Quem abriu a aba para conferir um produto que não está acabando não pode
  // ter de desligar um filtro para achá-lo. O único corte é a busca digitada.
  const c = semComentarios(cel);
  assert.match(c, /filtrarEstoquePorBusca\(grupos, busca\)/u);
  assert.doesNotMatch(c, /useState<[^>]*>\(['"]repor|soRepor|apenasBaixo|filtroNivel/u);
});

test('🔴 as movimentações ficam atrás de um toque, na casca comum', () => {
  const c = semComentarios(cel);
  assert.match(c, /const \[verMovimentacoes, setVerMovimentacoes\] = useState\(false\)/u, 'tem de nascer fechado');
  assert.match(c, /<FolhaMobile[\s\S]*?aberto=\{verMovimentacoes\}/u);
});

test('nada da tabela do computador sumiu: o que sai da linha mora na ficha', () => {
  // Colunas do computador: ícone, produto, variação, estoque, mínimo, status,
  // última mov. A linha mostra as 4 primeiras (variação+estoque na pílula,
  // status na cor); a ficha tem as outras.
  const ficha = cel.slice(cel.indexOf('function FichaEstoque'), cel.indexOf('const CLASSE_TIPO'));
  assert.match(ficha, /Mínimo \{v\.minimo\}/u);
  assert.match(ficha, /formatarDataMov\(v\.ultima_mov\)/u);
  assert.match(ficha, /ROTULO_NIVEL\[nivel\]/u);
  // E as 6 colunas das movimentações: data, produto, tipo, qtd, saldo, por.
  const movs = cel.slice(cel.indexOf('function ListaMovimentacoes'));
  for (const campo of ['formatarDataMov(m.created_at)', 'loja_produtos?.nome', 'rotuloTipoMovimentacao(m.tipo)', 'm.quantidade', 'm.saldo_apos', 'colaboradores?.apelido']) {
    assert.ok(movs.includes(campo), `coluna ${campo} sumiu das movimentações`);
  }
});

test('🔴 a tela não busca nem escreve — recebe e devolve por callback', () => {
  const c = semComentarios(cel);
  assert.doesNotMatch(c, /supabase|functions\.invoke|\.from\(/u);
  const tab = le('src/components/App/Lojinha/TabEstoque.tsx');
  assert.match(tab, /onAlertar=\{handleEnviarAlerta\}/u, 'o celular precisa do MESMO envio de alerta');
  assert.match(tab, /onAlertarTodos=\{handleEnviarTodosAlertas\}/u);
  assert.match(tab, /onEntradaLote=\{\(\) => setModalEntradaLote\(true\)\}/u);
});

test('🔴 o modal de entrada fica FORA da bifurcação', () => {
  // Bifurcar antes dele deixaria o botão "Entrada em lote" mudo no telefone.
  const tab = le('src/components/App/Lojinha/TabEstoque.tsx');
  const fimDaBifurcacao = tab.indexOf('        </>\n      )}');
  assert.ok(fimDaBifurcacao > 0);
  assert.ok(tab.indexOf('<ModalEntradaLote') > fimDaBifurcacao, 'o modal entrou num dos ramos');
});

test('o título do celular lê a mesma regra do computador', () => {
  const tab = le('src/components/App/Lojinha/TabEstoque.tsx');
  assert.match(tab, /tituloUnidade=\{tituloDaUnidade\(unidadeId, nomeUnidade\)\}/u);
});

test('alvos de toque têm 44px no elemento que recebe o toque', () => {
  const c = semComentarios(cel);
  const botoes = [...c.matchAll(/<button[\s\S]*?className=(?:"([^"]*)"|\{cn\(\s*'([^']*)')/gu)].map((m) => m[1] ?? m[2]);
  assert.ok(botoes.length >= 5, 'faltam botões');
  for (const classes of botoes) assert.match(classes, /min-h-\[44px\]/u, `botão sem alvo: ${classes.slice(0, 50)}`);
  assert.match(c, /<input[\s\S]*?min-h-\[44px\]/u, 'a busca é tocada no input, não na caixa');
});

test('pílula e tipo usam os textos do computador', () => {
  assert.equal(rotuloPilula({ variacao_nome: 'GG', quantidade: 0 }), 'GG 0');
  assert.equal(rotuloPilula({ variacao_nome: null, quantidade: 4 }), '4 un');
  assert.equal(rotuloTipoMovimentacao('entrada'), 'Entrada');
  assert.equal(rotuloTipoMovimentacao('venda'), 'Venda');
  assert.equal(rotuloTipoMovimentacao('estorno'), 'Estorno');
  assert.equal(rotuloTipoMovimentacao('ajuste'), 'Ajuste');
  assert.equal(rotuloTipoMovimentacao('qualquer'), 'Ajuste');
  // O computador mostra 5 alertas. O celular também — e diz quantos ficaram.
  assert.equal(ALERTAS_VISIVEIS, 5);
  assert.match(cel, /E mais \{alertasOcultos\}/u);
  assert.match(le('src/components/App/Lojinha/TabEstoque.tsx'), /alertas\.slice\(0, 5\)/u);
});

test('a Lojinha segue FORA das abas portadas — o Histórico de Vendas não foi adaptado', () => {
  // Marcar a aba inteira apagaria a faixa âmbar dele: o erro de Alunos em 14/09.
  const abas = le('src/mobile/abasPortadas.ts');
  assert.doesNotMatch(abas, /'lojinha'/u);
});

// ---------------------------------------------------------------------------
// Estoque zerado no Consolidado (aba Produtos)
// ---------------------------------------------------------------------------

const { escopoDoEstoque, somarEstoquePorProduto } = lib;
const produtosTab = le('src/components/App/Lojinha/TabProdutos.tsx');

test('🔴 o Consolidado soma a rede — não pede uma unidade chamada "todos"', () => {
  assert.deepEqual(escopoDoEstoque('todos'), { tipo: 'rede' });
  assert.deepEqual(escopoDoEstoque('uuid-cg'), { tipo: 'unidade', unidadeId: 'uuid-cg' });
  // Sem unidade ainda carregada NÃO consulta: as policies deixam qualquer
  // usuário logado ler todas as unidades, e o recorte é só da tela.
  assert.deepEqual(escopoDoEstoque(null), { tipo: 'aguardando' });
  assert.deepEqual(escopoDoEstoque(''), { tipo: 'aguardando' });
});

test('a soma junta variações e unidades do mesmo produto', () => {
  const t = somarEstoquePorProduto([
    { produto_id: 1, quantidade: 3 },
    { produto_id: 1, quantidade: 4 },
    { produto_id: 2, quantidade: 0 },
    { produto_id: 1, quantidade: null },
  ]);
  assert.equal(t.get(1), 7);
  assert.equal(t.get(2), 0);
  assert.equal(t.get(3), undefined);
});

test('🔴 a aba Produtos faz UMA consulta de estoque, não uma por produto', () => {
  assert.doesNotMatch(produtosTab, /'todos' \? unidadeId : unidadeId/u, 'o ternário de ramos iguais voltou');
  assert.doesNotMatch(produtosTab, /prods\.map\(async/u, 'uma consulta por produto de novo');
  assert.match(produtosTab, /escopoDoEstoque\(unidadeId\)/u);
  assert.match(produtosTab, /somarEstoquePorProduto\(estoque \?\? \[\]\)/u);
  assert.match(produtosTab, /if \(escopo\.tipo !== 'aguardando'\)/u, 'sem unidade carregada consultaria a rede inteira');
});

test('🔴 falha no estoque aparece — não vira "estoque zero" em silêncio', () => {
  const bloco = produtosTab.slice(produtosTab.indexOf('const { data: estoque, error: erroEstoque }'));
  assert.match(bloco, /if \(erroEstoque\)/u);
  assert.match(bloco, /console\.error\(`\[TabProdutos\] estoque/u);
  assert.match(bloco, /toast\.error\(/u);
  // O `tsc` do projeto não checa tipos (para nos erros de sintaxe de dois
  // arquivos alheios), e foi assim que um `toast` sem import passou em
  // 29/09/2026. Este assert é a trava que o compilador não está sendo.
  assert.match(produtosTab, /^import \{ toast \} from 'sonner';$/mu, 'toast usado sem import');
});
