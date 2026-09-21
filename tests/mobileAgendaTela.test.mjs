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
  // O rotulo deixou de ser "Ver todos os professores": o filtro que esvazia a
  // tela pode ter vindo da busca ou da categoria, herdadas do desktop, e o
  // botao precisa cobrir qualquer um deles.
  assert.match(tela, /Limpar filtros/);
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

test('o rotulo do dia vem em portugues, de fonte unica', async () => {
  // 🔴 O cabecalho saiu em INGLES em producao ("Monday, 21/09"): o default do
  // date-fns e en-US e `format()` sem o terceiro argumento nao avisa nada.
  const { rotuloDiaCurto } = await import('../src/lib/agenda.ts');
  assert.equal(rotuloDiaCurto('2026-09-21'), 'Segunda, 21/09');
  assert.equal(rotuloDiaCurto('2026-09-20'), 'Domingo, 20/09');
  // "-feira" sai: 4 caracteres numa barra de 375px sem acrescentar nada.
  assert.doesNotMatch(rotuloDiaCurto('2026-09-22'), /feira/);
  // Data invalida devolve a string crua em vez de derrubar a pagina: `format`
  // lanca RangeError, e no corpo de um componente isso mata a tela inteira.
  assert.equal(rotuloDiaCurto('nao-e-data'), 'nao-e-data');
});

test('nenhuma data com TEXTO e formatada na tela sem locale', () => {
  // A trava que faltava. Qualquer padrao com nome de dia (EEE) ou de mes (MMM)
  // precisa do locale; sem ele sai em ingles e ninguem percebe ate abrir a
  // tela. Padroes numericos ('yyyy-MM-dd') nao tem texto e ficam de fora.
  const comTexto = [...tela.matchAll(/format\([^)]*?['"`]([^'"`]*(?:EEE|MMM)[^'"`]*)['"`][^)]*\)/g)];
  for (const achado of comTexto) {
    assert.match(
      achado[0],
      /locale/,
      `format com texto e sem locale sairia em ingles: ${achado[0]}`,
    );
  }
});

test('o trilho vem ordenado por VOLUME, nao alfabeticamente', async () => {
  // Em ordem alfabetica, os 3 chips visiveis sao os que comecam em A — o que
  // nao tem relacao com a chance de serem procurados.
  const { professoresPorVolume } = await import('../src/lib/agenda.ts');
  const r = professoresPorVolume([
    { professor_nome: 'Zoe Prado' },
    { professor_nome: 'Ana Lima' },
    { professor_nome: 'Zoe Prado' },
    { professor_nome: 'Zoe Prado' },
    { professor_nome: 'Bia Nogueira' },
    { professor_nome: 'Bia Nogueira' },
  ]);
  assert.deepEqual(r, [
    { nome: 'Zoe Prado', qtd: 3 },
    { nome: 'Bia Nogueira', qtd: 2 },
    { nome: 'Ana Lima', qtd: 1 },
  ]);
});

test('empate desempata por nome — a ordem nao pode dancar entre renderizacoes', async () => {
  const { professoresPorVolume } = await import('../src/lib/agenda.ts');
  const r = professoresPorVolume([
    { professor_nome: 'Bruno' },
    { professor_nome: 'Ana' },
  ]);
  assert.deepEqual(r.map((p) => p.nome), ['Ana', 'Bruno']);
});

test('aula sem professor nao vira chip fantasma', async () => {
  const { professoresPorVolume } = await import('../src/lib/agenda.ts');
  assert.deepEqual(professoresPorVolume([{ professor_nome: null }]), []);
});

test('a lista inteira de professores fica a um toque, com busca', () => {
  // Com dezenas de professores no Consolidado, o trilho mostrava ~3 e escondia
  // o resto atras de rolagem horizontal as cegas.
  assert.match(tela, /professoresFiltrados/, 'a folha precisa filtrar por busca');
  assert.match(tela, /aria-label="Buscar professor"/);
  assert.match(tela, /role="dialog"/, 'a lista inteira abre em folha');
  // O botao fica FORA do contêiner rolavel: um atalho que so aparece depois de
  // arrastar ate o fim do trilho nao e atalho.
  assert.match(tela, /\{professores\.length > 3 && \(/);
  assert.match(tela, /aria-haspopup="dialog"/);
});
