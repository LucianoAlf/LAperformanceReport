// Regras da aba Fideliza+ no celular (LAPE-32).
//
// A tela do computador tem uma MATRIZ métrica × dupla que custa 38% da tela a
// 390px; a do telefone troca o eixo e abre na dupla da unidade. O que este
// teste trava são as decisões que separam uma coisa da outra — e, sobretudo,
// a promessa de que o placar do computador não mudou.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import esbuild from 'esbuild';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

// Compila com a API do esbuild, nunca `spawnSync` de `npx.cmd` (Node 22 no
// Windows recusa com EINVAL). O que roda aqui é o código real.
const lib = await (async () => {
  const { outputFiles } = await esbuild.build({
    entryPoints: [join(RAIZ, 'src/lib/fidelizaMobile.ts')],
    bundle: true,
    format: 'esm',
    write: false,
  });
  const arquivo = join(mkdtempSync(join(tmpdir(), 'fideliza-')), 'fidelizaMobile.mjs');
  writeFileSync(arquivo, outputFiles[0].text);
  return import(pathToFileURL(arquivo).href);
})();

const {
  METRICAS_FIDELIZA,
  META_LOJINHA_PADRAO,
  metaLojinhaDaUnidade,
  lerMetrica,
  lerMetricas,
  posicaoNaTrilha,
  duplaDaUnidade,
  ordenarPodio,
  formatarMeta,
  textoDoQueFalta,
} = lib;

const CG = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const BARRA = '368d47f5-2d88-4475-bc14-ba084a9a348e';
const RECREIO = '95553e96-971b-4590-a6eb-0201d013c14d';

// Config real, medida em produção em 25/09/2026.
const CONFIG = {
  metas: {
    churn_maximo: 4,
    inadimplencia_maxima: 1,
    renovacao_minima: 90,
    reajuste_minimo: 7,
    lojinha_campo_grande: 5000,
    lojinha_recreio: 3000,
    lojinha_barra: 3000,
  },
  pontuacao: { churn: 25, inadimplencia: 20, renovacao: 25, reajuste: 15, lojinha: 15 },
};

function farmer(unidade_id, apelidos, metricas, pontuacao, extra = {}) {
  return { unidade_id, farmers: { apelidos }, metricas, pontuacao, ...extra };
}

const DUDA = farmer(
  BARRA,
  'Duda & Arthur',
  { churn_rate: 4.8, inadimplencia_pct: 0, taxa_renovacao: 83, reajuste_medio: 9.5, vendas_lojinha: 2580 },
  { churn: 0, inadimplencia: 20, renovacao: 0, reajuste: 15, lojinha: 0, bonus: 20, penalidades: 0, total: 55 },
);

test('as cinco métricas do programa, na ordem do desktop', () => {
  assert.deepEqual(
    METRICAS_FIDELIZA.map((m) => m.chave),
    ['churn', 'inadimplencia', 'renovacao', 'reajuste', 'lojinha'],
  );
  // A direção é o que decide verde × vermelho: trocar uma inverte o placar.
  assert.deepEqual(
    METRICAS_FIDELIZA.map((m) => m.direcao),
    ['menor', 'menor', 'maior', 'maior', 'maior'],
  );
});

test('meta de lojinha é por unidade, e unidade desconhecida cai no padrão', () => {
  assert.equal(metaLojinhaDaUnidade(CONFIG.metas, CG), 5000);
  assert.equal(metaLojinhaDaUnidade(CONFIG.metas, BARRA), 3000);
  assert.equal(metaLojinhaDaUnidade(CONFIG.metas, RECREIO), 3000);
  assert.equal(metaLojinhaDaUnidade(CONFIG.metas, 'unidade-que-nao-existe'), META_LOJINHA_PADRAO);
});

test('meta ZERO cai no padrão — o comportamento do desktop, preservado de propósito', () => {
  // O desktop fazia `metas[chave] || 3000`. Trocar por `??` mudaria o placar
  // de quem zerasse a meta na tela de Configurações.
  const metas = { ...CONFIG.metas, lojinha_barra: 0 };
  assert.equal(metaLojinhaDaUnidade(metas, BARRA), META_LOJINHA_PADRAO);
});

test('`bateu` usa a mesma comparação de calcularPontuacao, inclusive na igualdade', () => {
  const exato = farmer(
    BARRA,
    'x',
    { churn_rate: 4, inadimplencia_pct: 1, taxa_renovacao: 90, reajuste_medio: 7, vendas_lojinha: 3000 },
    undefined,
  );
  // `<=` e `>=`: valor IGUAL à meta bate. Com `<`/`>` as cinco reprovariam.
  for (const leitura of lerMetricas(exato, CONFIG)) {
    assert.equal(leitura.bateu, true, `${leitura.chave} deveria bater na igualdade`);
    assert.equal(leitura.falta, 0);
  }
});

test('quem bateu tem falta zero; quem não bateu tem a distância na unidade da métrica', () => {
  const leituras = lerMetricas(DUDA, CONFIG);
  const porChave = Object.fromEntries(leituras.map((l) => [l.chave, l]));

  assert.equal(porChave.churn.bateu, false);
  assert.ok(Math.abs(porChave.churn.falta - 0.8) < 1e-9, 'churn 4,8 contra meta 4 = 0,8 a baixar');

  assert.equal(porChave.renovacao.bateu, false);
  assert.equal(porChave.renovacao.falta, 7, 'renovação 83 contra meta 90 = faltam 7');

  assert.equal(porChave.lojinha.bateu, false);
  assert.equal(porChave.lojinha.falta, 420, 'lojinha 2580 contra meta 3000 = faltam 420');

  assert.equal(porChave.inadimplencia.bateu, true);
  assert.equal(porChave.inadimplencia.falta, 0);
});

test('os pontos vêm do hook, nunca recalculados aqui', () => {
  const leituras = lerMetricas(DUDA, CONFIG);
  const porChave = Object.fromEntries(leituras.map((l) => [l.chave, l]));
  // `pontos` espelha o que `calcularPontuacao` gravou; `pontosPossiveis` é o
  // valor de tabela. Somar os dois a partir de `bateu` seria a segunda
  // implementação do placar.
  assert.equal(porChave.churn.pontos, 0);
  assert.equal(porChave.churn.pontosPossiveis, 25);
  assert.equal(porChave.inadimplencia.pontos, 20);
  assert.equal(porChave.reajuste.pontos, 15);
});

test('dupla sem pontuação calculada não inventa pontos', () => {
  const cru = farmer(BARRA, 'x', DUDA.metricas, undefined);
  for (const l of lerMetricas(cru, CONFIG)) assert.equal(l.pontos, 0);
});

test('a trilha põe a marca da meta e o valor na mesma escala', () => {
  // Métrica de SUBIR abaixo da meta: barra antes da marca.
  const abaixo = posicaoNaTrilha(83, 90);
  assert.ok(abaixo.preenchidoPct < abaixo.marcaPct);

  // Métrica de BAIXAR acima da meta: barra depois da marca.
  const acima = posicaoNaTrilha(4.8, 4);
  assert.ok(acima.preenchidoPct > acima.marcaPct);

  // 🔴 Churn ZERO é o melhor resultado possível. Num "percentual da meta"
  // ele daria barra cheia ou vazia enganosa; aqui dá barra vazia ANTES da
  // marca, que é o que a marca existe para distinguir.
  const zero = posicaoNaTrilha(0, 4);
  assert.equal(zero.preenchidoPct, 0);
  assert.ok(zero.marcaPct > 0 && zero.marcaPct < 100);
});

test('a trilha nunca vaza nem divide por zero', () => {
  // Valor muito acima da meta estica a escala em vez de transbordar.
  const estourado = posicaoNaTrilha(40, 4);
  assert.ok(estourado.preenchidoPct <= 100 && estourado.marcaPct <= 100);
  assert.ok(estourado.preenchidoPct >= estourado.marcaPct);

  // Meta 0 é valor legítimo (`inadimplencia_maxima` pode ser zerada).
  for (const p of [posicaoNaTrilha(0, 0), posicaoNaTrilha(5, 0)]) {
    assert.ok(Number.isFinite(p.preenchidoPct) && Number.isFinite(p.marcaPct));
    assert.ok(p.preenchidoPct <= 100);
  }

  // Entrada podre não produz NaN na folha de estilo.
  const podre = posicaoNaTrilha(Number.NaN, Number.POSITIVE_INFINITY);
  assert.ok(Number.isFinite(podre.preenchidoPct) && Number.isFinite(podre.marcaPct));
});

test('a dupla sai da UNIDADE, e o Consolidado não elege ninguém', () => {
  const todas = [DUDA, farmer(CG, 'Mayra & Jhon', DUDA.metricas, DUDA.pontuacao)];
  assert.equal(duplaDaUnidade(todas, BARRA)?.farmers.apelidos, 'Duda & Arthur');
  // 🔴 `null` no Consolidado: eleger a primeira colocada como "a sua" diria
  // ao admin um fato que ninguém afirmou.
  assert.equal(duplaDaUnidade(todas, null), null);
  assert.equal(duplaDaUnidade(todas, undefined), null);
  assert.equal(duplaDaUnidade(todas, RECREIO), null, 'unidade sem dupla não devolve outra');
});

test('o pódio ordena por pontos e desempata de forma determinística', () => {
  const a = farmer(BARRA, 'a', DUDA.metricas, { ...DUDA.pontuacao, total: 70 });
  const b = farmer(CG, 'b', DUDA.metricas, { ...DUDA.pontuacao, total: 70 });
  const c = farmer(RECREIO, 'c', DUDA.metricas, { ...DUDA.pontuacao, total: 95 });

  assert.deepEqual(ordenarPodio([a, b, c]).map((f) => f.farmers.apelidos), ['c', 'b', 'a']);
  // Empate resolvido pelo id: a ordem não pode dançar entre renderizações.
  assert.deepEqual(ordenarPodio([b, a]).map((f) => f.farmers.apelidos), ['b', 'a']);
  assert.deepEqual(ordenarPodio([a, b]).map((f) => f.farmers.apelidos), ['b', 'a']);
  // Não mutila a lista de entrada.
  const entrada = [a, c];
  ordenarPodio(entrada);
  assert.equal(entrada[0].farmers.apelidos, 'a');
});

test('o texto do que falta traz o VERBO, porque a direção muda a ação', () => {
  const porChave = Object.fromEntries(lerMetricas(DUDA, CONFIG).map((l) => [l.chave, l]));

  // 🔴 "0,8 ponto" sozinho não distingue "estou acima" de "estou abaixo".
  assert.match(textoDoQueFalta(porChave.churn), /baixar/);
  assert.match(textoDoQueFalta(porChave.renovacao), /faltam/);
  assert.match(textoDoQueFalta(porChave.lojinha), /R\$/);
  assert.equal(textoDoQueFalta(porChave.inadimplencia), null, 'métrica batida não pede ação');
});

test('a meta é escrita com o sinal da direção', () => {
  const porChave = Object.fromEntries(lerMetricas(DUDA, CONFIG).map((l) => [l.chave, l]));
  assert.match(formatarMeta(porChave.churn), /^≤ /);
  assert.match(formatarMeta(porChave.renovacao), /^≥ /);
});

// ---------------------------------------------------------------------------
// 🔴 A promessa desta frente: o computador não muda.
// ---------------------------------------------------------------------------

test('o hook do desktop lê a meta de lojinha da fonte única, sem mapa próprio', () => {
  const hook = readFileSync(join(RAIZ, 'src/hooks/useFidelizaPrograma.ts'), 'utf8');
  assert.match(hook, /metaLojinhaDaUnidade\(metas, farmer\.unidade_id\)/);
  // O mapa antigo não pode ressuscitar ao lado do novo.
  assert.doesNotMatch(
    hook.replace(/\/\/[^\n]*/g, ''),
    /UNIDADE_LOJINHA_MAP\s*[:=]/,
    'o mapa UUID→meta voltou a existir no hook',
  );
});

test('a tela mobile não reimplementa o placar nem busca dados próprios', () => {
  const tela = readFileSync(
    join(RAIZ, 'src/mobile/telas/administrativo/FidelizaMobile.tsx'),
    'utf8',
  );
  // Fonte de dados própria é o defeito que a bifurcação existe para evitar:
  // a tela recebe tudo por props de quem já buscou.
  for (const fonte of [/\bfetch\s*\(/, /\.rpc\s*\(/, /\bsupabase\b/, /use\w*Query\b/]) {
    assert.doesNotMatch(tela, fonte, `a tela ganhou fonte de dados própria (${fonte})`);
  }
  // Aritmética de pontos: só o hook a faz.
  assert.doesNotMatch(tela, /pontos_churn|bonus\s*\+=|criterios_batidos\s*=/);
});

test('dupla sozinha na lista não ganha medalha — a posição não existe ali', () => {
  const tela = readFileSync(
    join(RAIZ, 'src/mobile/telas/administrativo/FidelizaMobile.tsx'),
    'utf8',
  );
  // 🔴 Com unidade escolhida a RPC devolve só aquela dupla (medido: Barra
  // sozinha, 52 pts, quando o Recreio tem 66). A medalha sai do índice no
  // array, então uma linha única viria com 🥇 e afirmaria liderança que
  // ninguém mediu. O pódio precisa do guarda de tamanho.
  assert.match(tela, /podio\.length > 1 &&/);
  // E a tela precisa DIZER por que a comparação sumiu, nunca omitir calada.
  assert.match(tela, /comparação com as outras duplas fica no Consolidado/);
});

test('só a sub-aba Ranking foi portada — Penalidades e Configurações seguem com a faixa', () => {
  const abas = readFileSync(join(RAIZ, 'src/mobile/abasPortadas.ts'), 'utf8');
  const administrativo = abas.match(/'\/app\/administrativo':\s*\[([^\]]*)\]/);
  assert.ok(administrativo, 'a linha do Administrativo sumiu de ABAS_PORTADAS');
  assert.match(administrativo[1], /'fideliza'/);
});
