import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// O working tree guarda .tsx em CRLF no Windows; normalizar deixa os regex
// previsiveis independente do fim de linha (padrao dos demais tests/mobile*).
const fonte = readFileSync(new URL('../src/mobile/telas/DashboardMobile.tsx', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

const desktop = readFileSync(
  new URL('../src/components/App/Dashboard/DashboardPage.tsx', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');

/**
 * Um <KPICard ... /> inteiro, normalizado para comparacao entre as duas telas.
 *
 * - `dataTour` e ancora do tour de onboarding do desktop, nao e dado;
 * - `size="sm"` e o UNICO acrescimo que a Task 5 autoriza no mobile;
 * - o colapso de espaco em branco absorve a indentacao (o desktop aninha os
 *   cartoes mais fundo). Nenhum literal destes cartoes tem espaco duplo ou
 *   quebra de linha interna, entao o colapso nao mascara diferenca de texto.
 */
function normalizarCartao(bloco) {
  return bloco
    .replace(/\s*dataTour="[^"]*"/g, '')
    .replace(/\s*size="sm"/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cartoesDe(arquivo) {
  return (arquivo.match(/<KPICard[\s\S]*?\/>/g) ?? []).map(normalizarCartao);
}

const cartoesMobile = cartoesDe(fonte);
const cartoesDesktop = cartoesDe(desktop);

test('le o mesmo hook do desktop — nao reimplementa KPI nenhum', () => {
  assert.match(fonte, /useDashboardDados\(\)/);
  assert.doesNotMatch(fonte, /supabase/, 'a tela mobile nao pode consultar o banco por conta propria');
  assert.doesNotMatch(fonte, /\.rpc\(/, 'a tela mobile nao pode chamar RPC por conta propria');
});

test('as secoes seguem a ordem do desktop', () => {
  // Ancoras UNICAS. Procurar a palavra solta nao serve: "Comercial" casa com
  // `dadosComercial` na desestruturacao do topo, e o teste reprovaria toda
  // implementacao correta.
  const ordem = [
    ['Gestão', /titulo="Gestão"/],
    ['Comercial', /titulo="Comercial"/],
    ['Professores', /titulo="Professores"/],
    ['Alertas', /<ListaAlertas/],
    ['Evolução de Alunos', /Evolução de Alunos Ativos/],
    ['Funil Comercial', /Funil Comercial/],
    ['Por unidade', /<CartaoUnidade/],
  ];
  let cursor = -1;
  for (const [nome, marcador] of ordem) {
    const achado = fonte.match(marcador);
    assert.ok(achado, `faltou a secao "${nome}"`);
    const pos = achado.index;
    assert.ok(pos > cursor, `"${nome}" esta fora da ordem do desktop`);
    cursor = pos;
  }
});

test('os 13 KPIs do desktop estao todos na tela mobile', () => {
  const kpis = fonte.match(/<KPICard\b/g) ?? [];
  assert.equal(kpis.length, 13, `esperava 13 KPICard no mobile, achei ${kpis.length}`);
  // O desktop e a fonte do numero: se ele ganhar/perder um KPI, este teste
  // avisa em vez de congelar o 13 como folclore.
  const noDesktop = desktop.match(/<KPICard\b/g) ?? [];
  assert.equal(noDesktop.length, 13, `o desktop mudou de numero de KPIs (${noDesktop.length}) — reavaliar a tela mobile`);
});

test('cada secao leva a mesma quantidade de KPIs do desktop (4 Gestao / 4 Comercial / 5 Professores)', () => {
  // Sem isto, 13 cartoes todos empilhados numa secao so passariam no teste
  // de contagem acima.
  const esperado = { 'Gestão': 4, 'Comercial': 4, 'Professores': 5 };
  const secoes = [...fonte.matchAll(/<SecaoKPIs\s+titulo="([^"]+)"[\s\S]*?<\/SecaoKPIs>/g)];
  assert.equal(secoes.length, 3, `esperava 3 <SecaoKPIs>, achei ${secoes.length}`);
  let somados = 0;
  for (const [bloco, titulo] of secoes) {
    const qtd = (bloco.match(/<KPICard\b/g) ?? []).length;
    assert.equal(qtd, esperado[titulo], `a secao "${titulo}" tem ${qtd} KPIs, esperava ${esperado[titulo]}`);
    somados += qtd;
  }
  // Prova que nenhum KPICard ficou solto FORA das tres secoes.
  assert.equal(somados, 13, `${13 - somados} KPICard estao fora de <SecaoKPIs>`);
});

test('KPICard no mobile usa size="sm"', () => {
  const cartoes = fonte.match(/<KPICard[\s\S]*?\/>/g) ?? [];
  // Sem esta contagem o `for` abaixo passa VAZIO quando o regex nao casa
  // nada — o teste do brief aprovaria um arquivo sem KPICard nenhum.
  assert.equal(cartoes.length, 13, `esperava 13 blocos <KPICard .../>, extrai ${cartoes.length}`);
  for (const cartao of cartoes) {
    assert.match(cartao, /size="sm"/, `KPICard sem size="sm":\n${cartao.slice(0, 120)}`);
  }
});

test('os 13 cartoes sao copia VERBATIM do desktop — so muda o size', () => {
  // A protecao central da task: label, tooltip, value, target, format,
  // variant, inverterCor, subvalue e onClick vindos do desktop, sem uma
  // segunda versao da regra de negocio (ver CLAUDE.md, "Regras Importantes").
  assert.equal(cartoesDesktop.length, 13, 'nao consegui extrair os 13 cartoes do desktop');
  assert.equal(cartoesMobile.length, 13, 'nao consegui extrair os 13 cartoes do mobile');
  for (let i = 0; i < 13; i += 1) {
    assert.equal(
      cartoesMobile[i],
      cartoesDesktop[i],
      `o KPI #${i + 1} do mobile difere do desktop\n\nmobile:\n${cartoesMobile[i]}\n\ndesktop:\n${cartoesDesktop[i]}`,
    );
  }
});

test('os 13 tooltips sao identicos aos do desktop', () => {
  // Redundante com o teste acima de proposito: quando um tooltip e reescrito,
  // esta falha nomeia o que quebrou. Tooltip reescrito "com outras palavras"
  // e uma segunda versao da regra de negocio.
  const tooltipsDe = (cartoes) => cartoes.map((c) => {
    const achado = c.match(/ tooltip=([\s\S]*?) value=/);
    assert.ok(achado, `cartao sem tooltip antes de value:\n${c.slice(0, 140)}`);
    return achado[1];
  });
  assert.deepEqual(tooltipsDe(cartoesMobile), tooltipsDe(cartoesDesktop));
});

test('os cartoes por unidade so aparecem no consolidado', () => {
  // O brief pedia /unidade === 'todos'[\s\S]{0,400}CartaoUnidade/, que passa
  // com o CartaoUnidade renderizado SEM guarda nenhuma desde que algum outro
  // uso de `unidade === 'todos'` caia perto no arquivo — e os quatro modais
  // usam exatamente essa expressao. Aqui a prova e estrutural: a expressao
  // JSX aberta pela guarda ainda esta ABERTA quando o cartao aparece.
  const usos = [...fonte.matchAll(/<CartaoUnidade\b/g)];
  assert.equal(usos.length, 1, `esperava 1 uso de <CartaoUnidade>, achei ${usos.length}`);
  const idx = usos[0].index;

  const GUARDA = "{unidade === 'todos' &&";
  const inicio = fonte.slice(0, idx).lastIndexOf(GUARDA);
  assert.ok(inicio !== -1, `nao achei a guarda \`${GUARDA}\` antes do <CartaoUnidade>`);

  // Contagem de chaves a partir da guarda: se a profundidade voltar a zero
  // antes do cartao, a guarda fechou antes e o cartao esta solto na arvore.
  let profundidade = 0;
  for (let i = inicio; i < idx; i += 1) {
    if (fonte[i] === '{') profundidade += 1;
    else if (fonte[i] === '}') profundidade -= 1;
    assert.ok(
      profundidade > 0,
      `a guarda \`${GUARDA}\` fecha antes do <CartaoUnidade> — o cartao nao esta guardado`,
    );
  }
  assert.match(
    fonte.slice(inicio, idx),
    /resumoUnidades\s*\.\s*map/,
    'o bloco guardado nao mapeia resumoUnidades',
  );
});

test('o drill-down reusa os 4 ModalDetalheKPI do desktop', () => {
  // `assert.match(fonte, /ModalDetalheKPI/)` (do brief) passa so com o import.
  const modais = fonte.match(/<ModalDetalheKPI\b/g) ?? [];
  assert.equal(modais.length, 4, `esperava 4 <ModalDetalheKPI>, achei ${modais.length}`);
  const noDesktop = desktop.match(/<ModalDetalheKPI\b/g) ?? [];
  assert.equal(modais.length, noDesktop.length, 'o mobile tem numero de modais diferente do desktop');
});
