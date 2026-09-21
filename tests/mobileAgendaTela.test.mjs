import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const le = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tela = le('../src/mobile/telas/agenda/AgendaMobile.tsx');
const linha = le('../src/mobile/telas/agenda/LinhaAula.tsx');

test('a tela nao consulta o banco — os dados chegam por props', () => {
  for (const [nome, fonte] of [['AgendaMobile', tela], ['LinhaAula', linha]]) {
    assert.doesNotMatch(fonte, /supabase/, `${nome} fala com o banco`);
    assert.doesNotMatch(fonte, /\.rpc\(/, `${nome} chama RPC`);
    assert.doesNotMatch(fonte, /useAgendaDia\(/, `${nome} monta o hook por conta propria`);
  }
});

test('o gesto vem da maquina pura — nao de uma comparacao local de eixo', () => {
  assert.match(tela, /from\s+'@\/lib\/swipeDia'/);
  assert.match(tela, /aoPressionar\(/);
  assert.match(tela, /aoMover\(/);
  assert.match(tela, /aoSoltar\(/);
  // Reimplementar o travamento de eixo aqui seria uma segunda versao da regra,
  // e e justamente a regra que produz o tremor quando esta errada.
  assert.doesNotMatch(
    tela,
    /Math\.abs\(\s*dx\s*\)\s*>\s*Math\.abs\(\s*dy\s*\)/,
    'a tela reimplementou a decisao de eixo',
  );
});

test('o handler de arrasto fica no CORPO, nao num contêiner que engloba o trilho', () => {
  // O trilho de chips rola no mesmo eixo. Se o mesmo elemento capturar os dois,
  // escolher um professor viraria troca de dia.
  const corpo = tela.match(/onPointerDown=\{[\s\S]{0,400}?\}/);
  assert.ok(corpo, 'nao achei onPointerDown');
  // touch-action: pan-y devolve a rolagem vertical ao navegador e reserva o
  // horizontal para nos. Sem isso o gesto briga com o scroll nativo.
  assert.match(tela, /touch-action:\s*pan-y|touch-pan-y/);
});

test('o trilho de chips tem rolagem propria', () => {
  assert.match(tela, /overflow-x-auto/);
});

test('as setas de dia continuam — o arrasto nunca e o unico caminho', () => {
  assert.match(tela, /aria-label="Dia anterior"/);
  assert.match(tela, /aria-label="Próximo dia"/);
});

test('prefers-reduced-motion desliga a translacao', () => {
  assert.match(tela, /motion-reduce:transition-none|prefers-reduced-motion/);
});

test('durante o arrasto nao ha transicao — o painel segue o dedo 1:1', () => {
  // Com transicao ligada durante o arrasto o painel fica "borrachudo",
  // chegando atrasado em relacao ao dedo. E o reancoramento e um salto de uma
  // largura inteira: com transicao, a troca de dia apareceria duas vezes.
  assert.match(tela, /swipe\.arrastando\s*\|\|\s*reancorando/);
  assert.match(tela, /semTransicao\s*\?\s*'transition-none'/);
});

test('o reancoramento religa a transicao so no quadro seguinte', () => {
  // Um requestAnimationFrame so ainda cai no mesmo quadro do salto, e a
  // transicao voltaria a tempo de anima-lo.
  assert.match(
    tela,
    /requestAnimationFrame\(\(\)\s*=>\s*requestAnimationFrame\(/,
    'o duplo rAF do reancoramento sumiu',
  );
});

test('ciano continua exclusivo de navegacao (§6 do spec)', () => {
  // O chip ligado e pilula clara solida; a data usa setas. Ciano so aparece
  // como anel de foco, nunca como marca de filtro.
  const blocoChip = tela.match(/\/\* chip[\s\S]{0,1800}/);
  assert.ok(blocoChip, 'o bloco do trilho de chips precisa do marcador /* chip');
  assert.doesNotMatch(blocoChip[0], /bg-cyan/, 'filtro ligado nao pode usar ciano');
});

test('a colisao de sala vem da funcao unica, nao de um calculo na tela', () => {
  assert.match(tela, /colisoesDeSala\(/);
  assert.doesNotMatch(tela, /duracao_minutos\s*\+/, 'a tela recalculou sobreposicao por conta propria');
});

test('a colisao e calculada sobre o dia CRU, nunca sobre a lista filtrada', () => {
  // Filtrando pela Bia, a aula dela na Sala 2 continua disputando com a do
  // Ramon — que o filtro escondeu. Calcular sobre a lista filtrada faria o
  // aviso sumir exatamente quando ele e mais util.
  assert.match(tela, /colisoesDeSala\(cru\s*\?\?\s*\[\]\)/);
});

test('dia sem aula do professor filtrado explica e oferece saida — nao some com o filtro', () => {
  assert.match(tela, /não tem aula neste dia|nao tem aula neste dia/);
  assert.match(tela, /Ver todos/);
});

test('o palco monta os 3 dias e o vizinho vem do cache, nunca de busca nova', () => {
  assert.match(tela, /lerDoCache\(/);
});

test('o reancoramento e por RELOGIO, nunca por onTransitionEnd', () => {
  // 🔴 Defeito real, achado na revisao da Task 5 e originado no plano:
  // `motion-reduce:transition-none` apaga a transicao para quem pede menos
  // animacao, e transicao que nao existe nunca termina. Com `onTransitionEnd`
  // o reancoramento nao acontecia e o dia NUNCA trocava por arrasto — o palco
  // ficava travado no vizinho com a data errada no cabecalho.
  // A proibicao vale para o CODIGO, nao para a prosa: o comentario que explica
  // a armadilha cita `onTransitionEnd` de proposito, e deve continuar citando.
  // Mesmo corte de tests/mobileDashboardLigado.test.mjs.
  const semComentarios = tela
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ 	]*\/\/.*$/gm, '');
  assert.doesNotMatch(
    semComentarios,
    /onTransitionEnd/,
    'onTransitionEnd nao dispara sob prefers-reduced-motion: o dia nunca trocaria',
  );
  assert.match(tela, /setTimeout\(/, 'o reancoramento precisa de relogio proprio');
  // Timeout sem limpeza vaza: trocar de dia pelas setas no meio da animacao,
  // ou desmontar a tela, deixaria um reancoramento agendado para um estado que
  // ja nao existe.
  assert.match(tela, /clearTimeout\(/, 'o timeout do reancoramento precisa de clearTimeout');
});

test('a duracao da troca vive numa constante, nao repetida a mao', () => {
  // O relogio e a transicao do JSX precisam falar da mesma duracao; dois
  // numeros soltos divergem no primeiro ajuste.
  assert.match(tela, /DURACAO_TROCA_MS\s*=\s*260/);
  assert.match(tela, /duration-\[260ms\]/);
});
