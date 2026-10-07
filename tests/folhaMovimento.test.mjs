import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const le = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const hook = le('../src/mobile/useFolhaAnimada.ts');
const casca = le('../src/mobile/FolhaMobile.tsx');
const nav = le('../src/mobile/MobileBottomNav.tsx');
const css = le('../src/index.css');
// O bloco do movimento em si — declarado em CSS proprio, e nao em utilitario
// do Tailwind, porque aqui o Tailwind e' o Play CDN e gera regra em tempo de
// execucao (ver o teste da primeira abertura, abaixo).
const bloco = css.slice(css.indexOf('.folha-veu {'));

// Tira comentarios antes de procurar: varios deles CITAM a armadilha que o
// assert proibe, e sem o corte o comentario reprovaria o codigo certo.
const semComentarios = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|[^:])\/\/.*$/gmu, '$1');

test('🔴 so anima `transform` e `opacity` — nunca propriedade de layout', () => {
  // Estas duas entram apenas na composicao do quadro: o navegador desloca uma
  // textura pronta, sem refazer layout nem pintura. `height`/`top`/`bottom`
  // recalculariam o layout 60 vezes por segundo — e' de onde vem a fama de
  // animacao travada.
  const propriedades = [...bloco.matchAll(/transition:\s*([a-z-]+)/gu)].map((m) => m[1]);
  assert.ok(propriedades.length >= 3, 'faltam transicoes declaradas');
  for (const prop of propriedades) {
    assert.ok(
      ['transform', 'opacity', 'none'].includes(prop),
      `transition: ${prop} sai da composicao e volta ao layout`,
    );
  }
  assert.doesNotMatch(bloco, /transition:\s*all/u, '`all` anima tudo, layout incluso');
});

test('🔴 nada de `backdrop-blur` no veu', () => {
  // Desfoque e' recalculado a cada quadro sobre tudo que esta atras: o efeito
  // mais caro num telefone intermediario, e o unico capaz de travar isto.
  assert.doesNotMatch(bloco, /backdrop-filter/u);
  assert.doesNotMatch(semComentarios(casca), /backdrop-blur|backdrop-filter/u);
});

test('🔴 o desmonte e por RELOGIO, nunca por `onTransitionEnd`', () => {
  // Com `prefers-reduced-motion` a transicao e' apagada, transicao que nao
  // existe nunca termina, e o evento jamais dispararia: a folha ficaria
  // montada para sempre. Mesma armadilha medida no palco da Agenda em 21/09.
  const corpo = semComentarios(hook);
  assert.doesNotMatch(corpo, /onTransitionEnd|transitionend/u);
  assert.match(corpo, /setTimeout\(/u, 'sem relogio nao ha saida animada');
  assert.match(corpo, /clearTimeout\(/u, 'timer sem limpeza vaza entre aberturas');
});

test('🔴 ha um quadro na posicao fechada antes de abrir', () => {
  // Montar ja' com a classe final faz o navegador considerar aquele o primeiro
  // estado conhecido — e transicao exige DOIS. Sem isto a folha aparece de uma
  // vez, que e' exatamente o defeito a corrigir, e nenhum outro assert pegaria.
  const corpo = semComentarios(hook);
  assert.match(corpo, /requestAnimationFrame\(/u);
  assert.match(corpo, /cancelAnimationFrame\(/u);
  assert.match(
    corpo,
    /const \[entrou, setEntrou\] = useState\(false\)/u,
    'comecar em `true` mata a entrada da folha que ja nasce aberta',
  );
});

test('🔴 o guard de `prefers-reduced-motion` e ESCOPADO, nunca universal', () => {
  // A receita usual (`*, *::before { transition-duration: .01ms !important }`)
  // congelaria os 438 `animate-spin` do aplicativo: para quem tem "reduzir
  // movimento" ligado, toda espera exibiria um circulo PARADO — o que nao e'
  // menos movimento, e' a tela dizendo que travou. E seria mudanca visivel no
  // desktop, que esta frente nao faz.
  const guard = css.slice(css.indexOf('@media (prefers-reduced-motion'));
  assert.ok(guard.length > 0, 'a preferencia do sistema nao e respeitada');
  const seletores = guard.slice(0, guard.indexOf('transition: none'));
  assert.doesNotMatch(seletores, /(^|[\s,{])\*/u, 'seletor universal apaga o app inteiro');
  for (const classe of ['.folha-veu', '.folha-painel', '.folha-toque']) {
    assert.ok(guard.includes(classe), `${classe} nao respeita a preferencia`);
  }
  // E nenhum OUTRO bloco global pode ter entrado junto.
  assert.equal(
    [...css.matchAll(/@media \(prefers-reduced-motion/gu)].length,
    1,
    'mais de um guard: um deles vai ser o global',
  );
});

test('🔴 o veu para de segurar o toque durante a saida', () => {
  // Na saida a folha ja sumiu da vista. Um veu invisivel capturando o toque
  // por 180ms seria uma tela morta sem nenhuma explicacao.
  const veu = bloco.slice(0, bloco.indexOf('.folha-painel'));
  assert.match(veu, /pointer-events:\s*none/u, 'veu invisivel segurando o toque');
  assert.match(veu, /data-entrou='1'[\s\S]*?pointer-events:\s*auto/u, 'aberto tem de aceitar o toque');
});

test('🔴 a barra de baixo responde ao toque nos CINCO alvos', () => {
  // As rotas sao lazy: entre o toque e a tela aparecer nao havia sinal nenhum,
  // e "errei o alvo?" ficava indistinguivel de "esta carregando?".
  const corpo = semComentarios(nav);
  const usos = [...corpo.matchAll(/CLASSES_TOQUE/gu)].length;
  assert.equal(usos, 3, 'sao 2 aplicacoes (NavLink + botao Mais) e 1 import');
  assert.doesNotMatch(corpo, /transition-transform/u, 'a regra mora no `CLASSES_TOQUE`');
  // O alvo de toque nao pode ter encolhido para caber a animacao.
  assert.match(corpo, /min-h-\[44px\]/u);
});

test('🔴 nenhuma folha do shell escreve `transition` por conta propria', () => {
  // A casca estava copiada em SEIS lugares; seis transicoes soltas dariam seis
  // duracoes que se separam com o tempo — e a folha e' o gesto mais repetido
  // do celular. Quem precisa do movimento importa do `useFolhaAnimada`.
  const dir = new URL('../src/mobile/', import.meta.url);
  for (const arquivo of readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
    const src = semComentarios(le(`../src/mobile/${arquivo}`));
    const declara = /transition-(transform|opacity)|duration-\[\d+ms\]/u.test(src);
    if (!declara) continue;
    assert.ok(
      /classesPainel|classesVeu|CLASSES_TOQUE/u.test(src),
      `${arquivo} escreve a transicao a mao em vez de usar a fonte unica`,
    );
  }
});

test('🔴 a duracao do CSS e a do relogio do desmonte batem', () => {
  // Se um mudar sem o outro, a folha some antes de terminar de sair — ou fica
  // montada depois de ja ter sumido.
  const doCss = [...bloco.matchAll(/transition:\s*\w+\s+(\d+)ms/gu)].map((m) => Number(m[1]));
  assert.deepEqual([...new Set(doCss)].sort((a, b) => a - b), [90, 180], 'folha 180ms, toque 90ms');
  assert.match(hook, /DURACAO_FOLHA_MS = 180/u, 'o relogio do desmonte tem de seguir a folha');
});

test('🔴 o movimento NAO depende de classe gerada em tempo de execucao', () => {
  // Medido em 29/09: este app serve o Tailwind pelo Play CDN, que gera regra
  // varrendo o DOM. Um elemento montado com uma classe de valor arbitrario
  // inedita ficava SEM a regra no quadro seguinte — a folha nasceria ABERTA e
  // so' entao correria ate a fechada, ou seja, desceria em vez de subir,
  // justamente na primeira abertura do dia.
  for (const [arquivo, src] of [['useFolhaAnimada.ts', hook], ['FolhaMobile.tsx', casca], ['MobileBottomNav.tsx', nav]]) {
    assert.doesNotMatch(
      semComentarios(src),
      /duration-\[|translate-y-\[|active:scale-\[|motion-reduce:/u,
      `${arquivo} depende de utilitario gerado em tempo de execucao`,
    );
  }
  assert.match(hook, /CLASSE_VEU = 'folha-veu'/u);
  assert.match(hook, /CLASSE_PAINEL = 'folha-painel'/u);
  assert.match(hook, /CLASSES_TOQUE = 'folha-toque'/u);
});
