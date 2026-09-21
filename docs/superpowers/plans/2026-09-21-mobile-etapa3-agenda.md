# Agenda mobile (etapa 3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dar à Agenda uma tela própria de celular — lista cronológica com trilho de professores e troca de dia por arrasto — sem alterar uma linha do comportamento desktop.

**Architecture:** a bifurcação acontece DENTRO de `AgendaPage`, no ponto onde hoje nasce a `AgendaTimeline`, e não na rota. É o padrão do `AlunosPage`, não o do `DashboardResponsivo`: a Agenda tem quatro visões (professor, sala, chamada, calendário) e só duas serão portadas nesta etapa — bifurcar na rota tiraria as outras duas do celular. A `AgendaMobile` não busca dado nenhum: recebe por props o que a `AgendaPage` já calculou (aulas filtradas, presença, dia, navegação). Toda a lógica que dá para testar sem DOM sai para funções puras em `src/lib/`.

**Tech Stack:** React 19, TypeScript 5.8, Tailwind via Play CDN, `node --test` com asserções sobre o texto-fonte (sem jsdom), date-fns.

**Spec:** [`docs/superpowers/specs/2026-09-12-versao-mobile-la-report-design.md`](../specs/2026-09-12-versao-mobile-la-report-design.md) — esta etapa realiza o arquétipo 2 (§7) e obedece à §8 (degradar, não bloquear) e à §6 (ciano é exclusivo de navegação).

**Decisão de desenho que este plano executa:** registrada em LAPE-32 (nota de 21/09/2026) e visível no mockup navegável `https://claude.ai/artifact/TDQn2F5nHU9Ec2d7jXzFuQ`, artboard `OpcaoC`. Eixo = hora; pessoa = trilho de chips; dia troca por arrasto.

---

## Global Constraints

- **O desktop não muda de comportamento.** `AgendaTimeline`, `AgendaCard`, `AgendaDrawer`, `ChamadaView` e `CalendarioEscolar` não são editados. A única edição em `AgendaPage.tsx` é a inserção do ramo mobile e do aviso por aba.
- **`src/lib/agenda.ts` só recebe acréscimo.** Nenhuma função existente muda de assinatura ou de corpo — ela tem 20+ consumidores no desktop.
- **`useAgendaDia` só recebe acréscimo** ao objeto de retorno. Nada que o desktop já lê pode mudar de tipo, de nome ou de momento de atualização.
- **A tela mobile não consulta o banco.** Nada de `supabase`, nada de `.rpc(` em `src/mobile/telas/agenda/`. Os dados chegam por props.
- **Ciano é exclusivo de navegação** (§6 do spec). O chip de filtro ligado é pílula clara sólida; a data usa setas; nenhum dos dois é ciano.
- **Alvo de toque ≥ 44px** em todo controle.
- **`npm run build` NÃO type-checa** (é `vite build`, com `noUnusedLocals` desligado). `npx tsc -p tsconfig.ci.json` tem **336 erros pré-existentes** — o portão é *saída idêntica antes e depois*, nunca "zero erros".
- **`npm test` não roda direto** (o `pretest` exige Docker). Rodar a chave `"test"` do `package.json` diretamente. Há **1 falha pré-existente alheia**: `faturasAlunosPage`.
- **Todo teste novo entra na chave `"test"` do `package.json`** no mesmo commit. Teste que não está na lista nunca roda.
- Português nos identificadores e comentários; comentário explica *por que*, nunca *o quê*.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/agenda.ts` (modificar) | Ganha `colisoesDeSala` — pura, sem React |
| `src/lib/swipeDia.ts` (criar) | Máquina de estado do arrasto: pura, sem DOM, sem React |
| `src/hooks/useAgendaDia.ts` (modificar) | Ganha `lerDoCache(data)`, aditivo |
| `src/mobile/telas/agenda/LinhaAula.tsx` (criar) | Um cartão de aula na lista |
| `src/mobile/telas/agenda/AgendaMobile.tsx` (criar) | A tela: trilho de chips, palco de 3 dias, gesto, lista |
| `src/components/App/Agenda/AgendaPage.tsx` (modificar) | Ramo mobile + aviso por aba |
| `src/mobile/abasPortadas.ts` (modificar) | `/app/agenda` com as visões portadas |
| `tests/agendaColisaoSala.test.mjs` (criar) | Executa `colisoesDeSala` de verdade |
| `tests/swipeDia.test.mjs` (criar) | Executa a máquina de gesto de verdade |
| `tests/mobileAgendaTela.test.mjs` (criar) | Contrato da tela |
| `tests/mobileAgendaLigada.test.mjs` (criar) | Bifurcação e faixa por aba |

---

## Task 1: `colisoesDeSala` — a colisão que o desktop não mostra

**Contexto para quem implementa:** `resumoSobreposicao`, que já existe no arquivo, responde outra pergunta — "quantas aulas simultâneas há neste conjunto" — e é usada por trilho já agrupado. Passar o dia inteiro para ela devolveria "4 aulas às 11:00", que é a escola funcionando, não um problema. A função nova agrupa por sala e só acusa quando duas aulas **da mesma sala** se sobrepõem no tempo.

**Files:**
- Modify: `src/lib/agenda.ts` (acrescentar ao fim; não tocar em nada existente)
- Test: `tests/agendaColisaoSala.test.mjs`

**Interfaces:**
- Consome: `minutosDeHHMM` (já existe no mesmo arquivo)
- Produz: `colisoesDeSala(aulas: AulaColidivel[]): Map<string, string>` — a chave é `aula.chave`, o valor é o texto pronto para a tela. Tarefa 4 e Tarefa 5 consomem.

**A regra, por extenso** (as quatro exclusões são decisão de negócio, não detalhe técnico):
1. **Aula cancelada não colide** — ela não ocupa a sala. Mesma razão pela qual `resumoSobreposicao` filtra `!cancelada`.
2. **Sala nula não colide** — "sem sala" não é uma sala; duas aulas sem sala não disputam nada.
3. **Aula sem aluno vinculado COLIDE** — o horário está reservado de todo jeito, e essa é justamente a aula que alguém vai querer remanejar.
4. **Encostar não é sobrepor** — uma aula que termina às 09:50 e outra que começa às 09:50 não colidem. O corte é `inicioA < fimB && inicioB < fimA`.

- [ ] **Step 1: escrever o teste que falha**

Criar `tests/agendaColisaoSala.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { colisoesDeSala } from '../src/lib/agenda.ts';

// Fabrica enxuta: so os campos que a funcao le.
const aula = (chave, sala, inicio, minutos, extra = {}) => ({
  chave,
  sala_nome: sala,
  hora_inicio: inicio,
  duracao_minutos: minutos,
  cancelada: false,
  ...extra,
});

test('duas aulas da MESMA sala no mesmo horario colidem — mesmo com professores diferentes', () => {
  // O caso que o desktop agrupado por professor nao mostra: as duas ficam em
  // trilhos separados, cada uma sozinha no seu, e nenhuma se sobrepoe la.
  const r = colisoesDeSala([
    aula('a', 'Sala 2', '11:00', 50),
    aula('b', 'Sala 2', '11:00', 50),
  ]);
  assert.equal(r.size, 2);
  assert.match(r.get('a'), /Sala 2/);
  assert.match(r.get('b'), /Sala 2/);
});

test('salas diferentes no mesmo horario nao colidem', () => {
  const r = colisoesDeSala([
    aula('a', 'Sala 1', '11:00', 50),
    aula('b', 'Sala 2', '11:00', 50),
  ]);
  assert.equal(r.size, 0);
});

test('encostar nao e sobrepor: 09:00-09:50 e 09:50-10:40 convivem', () => {
  const r = colisoesDeSala([
    aula('a', 'Sala 1', '09:00', 50),
    aula('b', 'Sala 1', '09:50', 50),
  ]);
  assert.equal(r.size, 0);
});

test('sobreposicao parcial colide', () => {
  const r = colisoesDeSala([
    aula('a', 'Sala 1', '09:00', 50),
    aula('b', 'Sala 1', '09:40', 50),
  ]);
  assert.equal(r.size, 2);
});

test('aula cancelada nao ocupa a sala — nem colide, nem faz colidir', () => {
  const r = colisoesDeSala([
    aula('a', 'Sala 1', '11:00', 50, { cancelada: true }),
    aula('b', 'Sala 1', '11:00', 50),
  ]);
  assert.equal(r.size, 0);
});

test('sem sala nao colide: "sem sala" nao e uma sala', () => {
  const r = colisoesDeSala([
    aula('a', null, '11:00', 50),
    aula('b', null, '11:00', 50),
  ]);
  assert.equal(r.size, 0);
});

test('aula sem aluno vinculado COLIDE — o horario esta reservado do mesmo jeito', () => {
  const r = colisoesDeSala([
    aula('a', 'Sala 1', '15:00', 50, { qtd_alunos: 0 }),
    aula('b', 'Sala 1', '15:00', 50, { qtd_alunos: 1 }),
  ]);
  assert.equal(r.size, 2);
});

test('tres na mesma sala: todas as tres sao marcadas', () => {
  const r = colisoesDeSala([
    aula('a', 'Sala 1', '11:00', 50),
    aula('b', 'Sala 1', '11:10', 50),
    aula('c', 'Sala 1', '11:20', 50),
  ]);
  assert.equal(r.size, 3);
});

test('dia inteiro sem colisao devolve mapa vazio — nao null', () => {
  const r = colisoesDeSala([aula('a', 'Sala 1', '09:00', 50)]);
  assert.equal(r.size, 0);
});

test('lista vazia nao quebra', () => {
  assert.equal(colisoesDeSala([]).size, 0);
});
```

- [ ] **Step 2: rodar e ver falhar**

```bash
node --test tests/agendaColisaoSala.test.mjs
```

Esperado: falha na importação — `colisoesDeSala` não existe.

- [ ] **Step 3: implementar**

Acrescentar ao FIM de `src/lib/agenda.ts`:

```ts
export type AulaColidivel = {
  chave: string;
  sala_nome: string | null;
  hora_inicio: string;
  duracao_minutos: number;
  cancelada: boolean;
};

/**
 * Aulas que disputam a MESMA sala no mesmo horario, com o texto pronto para a
 * linha.
 *
 * Existe porque a grade do desktop nao mostra este caso: agrupada por
 * professor, a aula de Teclado da Bia e a de Guitarra do Ramon — as duas na
 * Sala 2 as 11:00 — ficam em trilhos separados, cada uma sozinha no seu, e
 * `resumoSobreposicao` (que opera DENTRO de um trilho) nao ve nada. A colisao
 * so aparece ao trocar o agrupamento para Sala, ou seja, depende do modo em
 * que a pessoa esta. Na lista do celular nao ha modo: ela e dita em toda linha.
 *
 * ⚠️ Nao usar `resumoSobreposicao` para isto. Ela responde "quantas aulas
 * simultaneas ha neste conjunto", e sobre o dia inteiro devolveria 4 as 11:00
 * — a escola funcionando, nao um problema.
 *
 * Cancelada nao ocupa sala; sala nula nao e sala; aula sem aluno ocupa (o
 * horario esta reservado, e e justamente a que alguem vai querer remanejar).
 */
export function colisoesDeSala(aulas: AulaColidivel[]): Map<string, string> {
  const ocupantes = aulas.filter((a) => !a.cancelada && a.sala_nome !== null);
  const marcadas = new Map<string, string>();

  for (const a of ocupantes) {
    const inicioA = minutosDeHHMM(a.hora_inicio);
    const fimA = inicioA + a.duracao_minutos;

    const colide = ocupantes.some((b) => {
      if (b.chave === a.chave) return false;
      if (b.sala_nome !== a.sala_nome) return false;
      const inicioB = minutosDeHHMM(b.hora_inicio);
      // Estrito nas duas pontas: terminar as 09:50 e comecar as 09:50 e o
      // intervalo normal entre aulas, nao um conflito.
      return inicioA < inicioB + b.duracao_minutos && inicioB < fimA;
    });

    if (colide) marcadas.set(a.chave, `${a.sala_nome} tem outra aula neste horário`);
  }

  return marcadas;
}
```

- [ ] **Step 4: rodar e ver passar**

```bash
node --test tests/agendaColisaoSala.test.mjs
```

Esperado: 10 testes passando.

- [ ] **Step 5: registrar o teste e commitar**

Acrescentar `tests/agendaColisaoSala.test.mjs` à chave `"test"` do `package.json`.

```bash
git add src/lib/agenda.ts tests/agendaColisaoSala.test.mjs package.json
git commit -m "feat(agenda): colisoesDeSala — a disputa de sala que a grade por professor nao mostra"
```

**Estado esperado ao término:** `colisoesDeSala` exportada e testada; nenhuma função existente de `src/lib/agenda.ts` tocada (conferir com `git diff --stat`, que deve mostrar só acréscimo).

---

## Task 2: `swipeDia` — a máquina do gesto, sem DOM

**Contexto:** a parte que faz o arrasto parecer nativo não é a animação, é o **travamento de eixo**: os primeiros 10px decidem se aquele arrasto é rolagem vertical ou troca de dia, e essa decisão não é revista até soltar. Reavaliar `|dx| > |dy|` a cada movimento — que é o jeito óbvio — faz o painel tremer em arrastos diagonais. Isolar isso numa máquina pura permite testar as seis regras sem navegador.

**Files:**
- Create: `src/lib/swipeDia.ts`
- Test: `tests/swipeDia.test.mjs`

**Interfaces:**
- Produz: `EstadoSwipe`, `swipeInicial`, `aoPressionar`, `aoMover`, `aoSoltar`, `LIMIAR_EIXO_PX`, `LIMIAR_TROCA_FRACAO`. Tarefa 5 consome.

**As seis regras:**
1. Zona morta de **10px**: abaixo disso nenhum eixo foi decidido e nada se move.
2. Eixo decidido **uma vez** e congelado até soltar.
3. Eixo `y` → a máquina ignora tudo; a rolagem nativa segue.
4. Confirmação em **25% da largura**; abaixo disso volta ao lugar.
5. **Resistência de 25%** nas pontas — o dedo anda, o painel quase não.
6. Soltar sempre zera `dx`; `indice` só muda quando a regra 4 passou.

- [ ] **Step 1: escrever o teste que falha**

Criar `tests/swipeDia.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  swipeInicial,
  aoPressionar,
  aoMover,
  aoSoltar,
  LIMIAR_EIXO_PX,
  LIMIAR_TROCA_FRACAO,
} from '../src/lib/swipeDia.ts';

const L = 390;
const TOTAL = 3;
const opcoes = { largura: L, total: TOTAL };

// Aplica uma sequencia de movimentos a partir de um toque em (0, 0).
function arrastar(estado, pontos) {
  let e = aoPressionar(estado, { x: 0, y: 0 });
  for (const p of pontos) e = aoMover(e, p, opcoes);
  return e;
}

test('zona morta: abaixo de 10px nenhum eixo e decidido e nada se move', () => {
  const e = arrastar({ ...swipeInicial, indice: 1 }, [{ x: 6, y: 4 }]);
  assert.equal(e.eixo, null);
  assert.equal(e.dx, 0);
  assert.equal(LIMIAR_EIXO_PX, 10);
});

test('movimento horizontal decide eixo x e o painel segue o dedo', () => {
  const e = arrastar({ ...swipeInicial, indice: 1 }, [{ x: 40, y: 5 }]);
  assert.equal(e.eixo, 'x');
  assert.equal(e.dx, 40);
});

test('movimento vertical decide eixo y e a maquina nao move nada', () => {
  const e = arrastar({ ...swipeInicial, indice: 1 }, [{ x: 5, y: 40 }]);
  assert.equal(e.eixo, 'y');
  assert.equal(e.dx, 0);
});

test('o eixo NAO e reavaliado no meio do arrasto', () => {
  // Comeca vertical e depois vira muito horizontal: se a maquina reavaliasse,
  // o painel comecaria a deslizar no meio da rolagem. E o tremor diagonal.
  const e = arrastar({ ...swipeInicial, indice: 1 }, [
    { x: 4, y: 30 },
    { x: 200, y: 32 },
  ]);
  assert.equal(e.eixo, 'y');
  assert.equal(e.dx, 0);
});

test('decidido x, continua x mesmo que o dedo desca muito depois', () => {
  const e = arrastar({ ...swipeInicial, indice: 1 }, [
    { x: 30, y: 2 },
    { x: 35, y: 300 },
  ]);
  assert.equal(e.eixo, 'x');
  assert.equal(e.dx, 35);
});

test('resistencia de 25% na primeira ponta', () => {
  const e = arrastar({ ...swipeInicial, indice: 0 }, [{ x: 100, y: 0 }]);
  assert.equal(e.dx, 25);
});

test('resistencia de 25% na ultima ponta', () => {
  const e = arrastar({ ...swipeInicial, indice: TOTAL - 1 }, [{ x: -100, y: 0 }]);
  assert.equal(e.dx, -25);
});

test('no meio nao ha resistencia em nenhum sentido', () => {
  assert.equal(arrastar({ ...swipeInicial, indice: 1 }, [{ x: 100, y: 0 }]).dx, 100);
  assert.equal(arrastar({ ...swipeInicial, indice: 1 }, [{ x: -100, y: 0 }]).dx, -100);
});

test('soltar abaixo do limiar volta ao mesmo dia', () => {
  const quase = Math.floor(L * LIMIAR_TROCA_FRACAO) - 1;
  const e = aoSoltar(arrastar({ ...swipeInicial, indice: 1 }, [{ x: -quase, y: 0 }]), opcoes);
  assert.equal(e.indice, 1);
  assert.equal(e.dx, 0);
  assert.equal(e.eixo, null);
});

test('soltar acima do limiar para a esquerda avanca um dia', () => {
  const passa = Math.ceil(L * LIMIAR_TROCA_FRACAO) + 1;
  const e = aoSoltar(arrastar({ ...swipeInicial, indice: 1 }, [{ x: -passa, y: 0 }]), opcoes);
  assert.equal(e.indice, 2);
  assert.equal(e.dx, 0);
});

test('soltar acima do limiar para a direita volta um dia', () => {
  const passa = Math.ceil(L * LIMIAR_TROCA_FRACAO) + 1;
  const e = aoSoltar(arrastar({ ...swipeInicial, indice: 1 }, [{ x: passa, y: 0 }]), opcoes);
  assert.equal(e.indice, 0);
});

test('arrasto vertical longo nunca troca o dia', () => {
  const e = aoSoltar(arrastar({ ...swipeInicial, indice: 1 }, [{ x: 2, y: 400 }]), opcoes);
  assert.equal(e.indice, 1);
});

test('a ponta nao passa nem com arrasto enorme', () => {
  const e = aoSoltar(arrastar({ ...swipeInicial, indice: 0 }, [{ x: 900, y: 0 }]), opcoes);
  assert.equal(e.indice, 0);
});

test('aoMover sem aoPressionar e ignorado', () => {
  // Um pointermove pode chegar sem o down correspondente (ponteiro entrou na
  // area com o botao ja pressionado). Isso nao pode mover nada.
  const e = aoMover({ ...swipeInicial, indice: 1 }, { x: 200, y: 0 }, opcoes);
  assert.equal(e.dx, 0);
  assert.equal(e.arrastando, false);
});

test('aoSoltar sem arrasto nenhum e inofensivo', () => {
  const e = aoSoltar({ ...swipeInicial, indice: 1 }, opcoes);
  assert.equal(e.indice, 1);
  assert.equal(e.dx, 0);
});
```

- [ ] **Step 2: rodar e ver falhar**

```bash
node --test tests/swipeDia.test.mjs
```

Esperado: falha na importação.

- [ ] **Step 3: implementar**

Criar `src/lib/swipeDia.ts`:

```ts
/** Abaixo disto o arrasto ainda nao declarou intencao. */
export const LIMIAR_EIXO_PX = 10;

/** Fracao da largura que confirma a troca de dia. */
export const LIMIAR_TROCA_FRACAO = 0.25;

/** Quanto do movimento sobra quando nao ha para onde ir. */
const RESISTENCIA_NA_PONTA = 0.25;

export interface EstadoSwipe {
  indice: number;
  dx: number;
  arrastando: boolean;
  /** null = ainda nao decidido. Decidido UMA vez, vale ate soltar. */
  eixo: 'x' | 'y' | null;
  origem: { x: number; y: number };
}

export interface OpcoesSwipe {
  largura: number;
  total: number;
}

export const swipeInicial: EstadoSwipe = {
  indice: 0,
  dx: 0,
  arrastando: false,
  eixo: null,
  origem: { x: 0, y: 0 },
};

export function aoPressionar(estado: EstadoSwipe, ponto: { x: number; y: number }): EstadoSwipe {
  return { ...estado, arrastando: true, dx: 0, eixo: null, origem: ponto };
}

/**
 * O coracao do gesto: o eixo e decidido UMA vez, depois da zona morta, e nao
 * volta a ser avaliado ate soltar.
 *
 * Reavaliar `|dx| > |dy|` a cada movimento e o jeito obvio e produz tremor: num
 * arrasto diagonal o painel alterna entre rolar e deslizar, e quem usa nao
 * sabe nomear o defeito — so sente que esta ruim.
 */
export function aoMover(
  estado: EstadoSwipe,
  ponto: { x: number; y: number },
  { total }: OpcoesSwipe,
): EstadoSwipe {
  // pointermove pode chegar sem o down correspondente (o ponteiro entrou na
  // area ja pressionado). Sem esta guarda o painel saltaria do nada.
  if (!estado.arrastando) return estado;

  const dx = ponto.x - estado.origem.x;
  const dy = ponto.y - estado.origem.y;

  let eixo = estado.eixo;
  if (eixo === null) {
    if (Math.abs(dx) < LIMIAR_EIXO_PX && Math.abs(dy) < LIMIAR_EIXO_PX) return estado;
    eixo = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  }
  if (eixo !== 'x') return { ...estado, eixo, dx: 0 };

  const naPonta = (estado.indice === 0 && dx > 0) || (estado.indice === total - 1 && dx < 0);
  return { ...estado, eixo, dx: naPonta ? dx * RESISTENCIA_NA_PONTA : dx };
}

export function aoSoltar(estado: EstadoSwipe, { largura, total }: OpcoesSwipe): EstadoSwipe {
  const confirmou = estado.eixo === 'x' && Math.abs(estado.dx) > largura * LIMIAR_TROCA_FRACAO;
  const passo = confirmou ? (estado.dx < 0 ? 1 : -1) : 0;
  const indice = Math.max(0, Math.min(total - 1, estado.indice + passo));
  return { ...estado, indice, dx: 0, arrastando: false, eixo: null };
}
```

- [ ] **Step 4: rodar e ver passar**

```bash
node --test tests/swipeDia.test.mjs
```

Esperado: 15 testes passando.

- [ ] **Step 5: registrar e commitar**

Acrescentar `tests/swipeDia.test.mjs` à chave `"test"` do `package.json`.

```bash
git add src/lib/swipeDia.ts tests/swipeDia.test.mjs package.json
git commit -m "feat(agenda): maquina do arrasto de dia com travamento de eixo"
```

---

## Task 3: `lerDoCache` — o vizinho já está ali, só não era alcançável

**Contexto:** o palco mostra três dias lado a lado para que o de baixo apareça durante o arrasto. Mas `useAgendaDia` só devolve as aulas do dia ATUAL — os vizinhos já estão no cache interno (o `prefetch` os traz 300ms após a carga) e não há como lê-los de fora. Sem isso o painel que entra ficaria em branco justamente durante a animação, que é quando ele é visto.

**Files:**
- Modify: `src/hooks/useAgendaDia.ts` (somente acréscimo ao retorno)

**Interfaces:**
- Produz: `lerDoCache(data: string): AgendaDiaV2 | undefined`. Tarefa 5 consome.

- [ ] **Step 1: implementar**

Acrescentar antes do `return` de `useAgendaDia`:

```ts
  /**
   * Le um dia ja adiantado pelo `prefetch`, sem disparar busca nenhuma.
   *
   * O palco do celular monta tres dias lado a lado para que o vizinho apareca
   * DURANTE o arrasto. Sem esta porta, o painel que entra ficaria em branco
   * exatamente no instante em que ele e olhado — o dado ja estava em memoria e
   * nao havia como alcanca-lo de fora.
   *
   * Devolve `undefined` quando o dia ainda nao foi adiantado; quem chama mostra
   * esqueleto. Nunca busca: o custo tem de ser zero para o desktop, que nao usa.
   */
  const lerDoCache = useCallback(
    (dataAlvo: string) => cacheRef.current.get(chaveDoCache(dataAlvo, unidadeId)),
    [unidadeId],
  );
```

E acrescentar `lerDoCache` ao objeto retornado, no fim:

```ts
  return { aulas, presenca, carregando, erro, frescor, recarregar: buscar, prefetch, lerDoCache };
```

- [ ] **Step 2: provar que o desktop não mudou**

```bash
git diff src/hooks/useAgendaDia.ts
```

Esperado: só linhas acrescentadas (`+`), nenhuma removida ou alterada além da linha do `return`, que apenas ganha uma chave no fim.

- [ ] **Step 3: rodar a suíte inteira e comparar com a baseline**

```bash
node --test $(node -e "console.log(require('./package.json').scripts.test.replace('node --test ',''))")
```

Esperado: mesmo resultado de antes — a falha pré-existente de `faturasAlunosPage` e nada mais.

- [ ] **Step 4: commitar**

```bash
git add src/hooks/useAgendaDia.ts
git commit -m "feat(agenda): expor lerDoCache para o palco de 3 dias do celular"
```

---

## Task 4: `LinhaAula` — o cartão da lista

**Contexto:** a linha tem ~350px de largura contra os 88px do cartão do desktop. Isso permite algo que a grade não permite: **dois fatos ao mesmo tempo**. `estadoDaAula` (em `AgendaCard.tsx`) é uma cascata com `return` — cancelada > experimental > reagendada > andamento — então uma aula experimental que está acontecendo agora sai violeta e perde o "agora", porque uma borda esquerda só codifica uma coisa. Aqui a borda carrega a exceção e um selo separado carrega o "agora".

**Files:**
- Create: `src/mobile/telas/agenda/LinhaAula.tsx`
- Test: coberto por `tests/mobileAgendaTela.test.mjs` (Tarefa 5)

**Interfaces:**
- Consome: `AulaAgenda` de `@/hooks/useAgendaDia`; `aulaEmAndamento`, `aulaJaOcorreu` de `@/lib/agenda`
- Produz: `<LinhaAula aula data agora colisao onAbrir />`

- [ ] **Step 1: implementar**

```tsx
import { AlertTriangle } from 'lucide-react';

import type { AulaAgenda } from '@/hooks/useAgendaDia';
import { aulaEmAndamento, aulaJaOcorreu, minutosAgora } from '@/lib/agenda';
import { cn } from '@/lib/utils';

/**
 * A EXCECAO da aula — a mesma cascata de `estadoDaAula` do desktop, com uma
 * diferenca deliberada: "acontecendo agora" NAO entra aqui.
 *
 * No desktop os dois disputam a mesma borda de 3px e so um pode vencer, entao
 * uma experimental em andamento sai violeta e o "agora" se perde. A linha tem
 * 350px: a borda carrega a excecao e o selo carrega o agora, sem disputa.
 */
type Excecao = 'cancelada' | 'experimental' | 'reagendada' | 'vago' | null;

function excecaoDaAula(aula: AulaAgenda): Excecao {
  if (aula.cancelada) return 'cancelada';
  if (aula.categoria === 'experimental') return 'experimental';
  if (aula.reagendada) return 'reagendada';
  if (aula.alunos.length === 0) return 'vago';
  return null;
}

// Mesmas cores do AgendaCard: a pessoa alterna entre celular e computador no
// mesmo dia, e uma segunda paleta faria violeta querer dizer duas coisas.
const BORDA: Record<string, string> = {
  cancelada: 'border-l-rose-400 bg-rose-500/10 opacity-70',
  experimental: 'border-l-violet-400 bg-violet-500/15',
  reagendada: 'border-l-amber-400 bg-amber-500/15',
  vago: 'border-dashed border-l-slate-500 bg-slate-800/60',
  normal: 'border-l-slate-600 bg-slate-800',
};

const TEXTO_EXCECAO: Record<string, string> = {
  cancelada: 'text-rose-300',
  experimental: 'text-violet-300',
  reagendada: 'text-amber-300',
  vago: 'text-slate-400',
};

interface Props {
  aula: AulaAgenda;
  /** Dia exibido, 'yyyy-MM-dd'. Necessario para saber se a aula ja passou. */
  data: string;
  agora: Date;
  /** O dia exibido e hoje? Fora disso nada pode estar "acontecendo agora". */
  ehHoje: boolean;
  /** Texto de colisao de sala, de `colisoesDeSala`. */
  colisao?: string;
  onAbrir: (aula: AulaAgenda) => void;
}

export function LinhaAula({ aula, data, agora, ehHoje, colisao, onAbrir }: Props) {
  const excecao = excecaoDaAula(aula);
  // ⚠️ `aulaEmAndamento` recebe MINUTOS, nao a data — e `null` quando o dia
  // exibido nao e hoje. Passar a data aqui nao compila.
  const emAndamento = aulaEmAndamento(aula, ehHoje ? minutosAgora(agora) : null);
  const jaOcorreu = aulaJaOcorreu(data, aula.hora_fim, agora);

  const quem = aula.alunos.length === 1
    ? aula.alunos[0].nome
    : aula.alunos.length > 1
      ? `${aula.alunos[0].nome} +${aula.alunos.length - 1}`
      : aula.turma_nome ?? 'sem aluno vinculado';

  const detalhe = [aula.sala_nome ?? 'sem sala', quem]
    .filter(Boolean)
    .join(' · ');

  const legendaExcecao = excecao === 'reagendada' && aula.hora_original
    ? `reagendada · era ${aula.hora_original}`
    : excecao === 'cancelada'
      ? 'cancelada'
      : excecao === 'experimental'
        ? 'experimental'
        : excecao === 'vago'
          ? 'sem aluno vinculado'
          : null;

  return (
    <div className={cn('flex gap-2.5', jaOcorreu && !emAndamento && 'opacity-45')}>
      <div className="w-[50px] flex-shrink-0 pt-2 text-right">
        <div className="text-[13px] font-semibold tabular-nums text-slate-300">
          {aula.hora_inicio.slice(0, 5)}
        </div>
        <div className="text-[10.5px] text-slate-400">{aula.duracao_minutos} min</div>
      </div>

      <button
        type="button"
        onClick={() => onAbrir(aula)}
        className={cn(
          'min-h-[44px] min-w-0 flex-1 rounded-[10px] border border-l-[3px] border-slate-700 px-3 py-2.5 text-left',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400',
          BORDA[excecao ?? 'normal'],
          emAndamento && excecao === null && 'border-l-emerald-500 bg-emerald-500/10',
        )}
      >
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 truncate text-[13.5px] font-semibold text-slate-100">
            {aula.curso_nome ?? 'Aula'} · {aula.professor_nome ?? 'sem professor'}
          </span>
          {emAndamento && (
            <span className="flex-shrink-0 rounded-full border border-emerald-500/50 px-1.5 text-[10px] font-bold text-emerald-300">
              AGORA
            </span>
          )}
        </div>

        {legendaExcecao && (
          <div className={cn('mt-0.5 text-[12px]', TEXTO_EXCECAO[excecao ?? 'normal'])}>
            {legendaExcecao}
          </div>
        )}

        <div className="mt-0.5 truncate text-[12px] text-slate-400">{detalhe}</div>

        {colisao && (
          <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            {colisao}
          </div>
        )}
      </button>
    </div>
  );
}

export default LinhaAula;
```

- [ ] **Step 2: commitar**

```bash
git add src/mobile/telas/agenda/LinhaAula.tsx
git commit -m "feat(agenda): linha de aula do celular — excecao e 'agora' deixam de disputar a mesma borda"
```

---

## Task 5: `AgendaMobile` — trilho, palco e gesto

**Files:**
- Create: `src/mobile/telas/agenda/AgendaMobile.tsx`
- Test: `tests/mobileAgendaTela.test.mjs`

**Interfaces:**
- Consome: `swipeDia` (Tarefa 2), `colisoesDeSala` (Tarefa 1), `LinhaAula` (Tarefa 4), `lerDoCache` (Tarefa 3)
- Produz: `<AgendaMobile aulas data hoje onTrocarDia lerDoCache filtros onFiltrar onAbrir />` — Tarefa 6 monta

**Regras que o teste vai cobrir:**
- A tela não fala com o banco.
- O gesto vive só no corpo; o trilho de chips tem rolagem própria.
- O eixo vem de `swipeDia`, não de comparação local.
- `prefers-reduced-motion` desliga a translação.
- As setas continuam existindo.
- Dia sem aula para o professor filtrado mostra o chip aceso e explica.

- [ ] **Step 1: escrever o teste que falha**

Criar `tests/mobileAgendaTela.test.mjs`:

```js
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
```

- [ ] **Step 2: rodar e ver falhar**

```bash
node --test tests/mobileAgendaTela.test.mjs
```

- [ ] **Step 3: implementar `AgendaMobile.tsx`**

```tsx
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, format, parseISO } from 'date-fns';

import type { AgendaDiaV2, AulaAgenda } from '@/hooks/useAgendaDia';
import {
  colisoesDeSala,
  filtrarAulas,
  iniciaisDoNome,
  minutosAgora,
  minutosDeHHMM,
  opcoesDoCampo,
  type FiltrosAgenda,
} from '@/lib/agenda';
import { aoMover, aoPressionar, aoSoltar, swipeInicial, type EstadoSwipe } from '@/lib/swipeDia';
import { cn } from '@/lib/utils';

import { LinhaAula } from './LinhaAula';

interface Props {
  /**
   * Aulas do dia atual SEM filtro. A tela aplica `filtrarAulas` nos tres
   * paineis — os vizinhos vem de `lerDoCache`, que devolve o dia cru, entao
   * filtrar aqui e o que mantem os tres sob a mesma regra.
   */
  aulasDoDia: AulaAgenda[];
  data: string;
  hoje: string;
  onTrocarDia: (novaData: string) => void;
  lerDoCache: (data: string) => AgendaDiaV2 | undefined;
  filtros: FiltrosAgenda;
  onFiltrar: (filtros: FiltrosAgenda) => void;
  onAbrir: (aula: AulaAgenda) => void;
}

const DELTAS = [-1, 0, 1] as const;

export function AgendaMobile({
  aulasDoDia,
  data,
  hoje,
  onTrocarDia,
  lerDoCache,
  filtros,
  onFiltrar,
  onAbrir,
}: Props) {
  // O palco comeca ancorado no do meio: ha sempre um dia de cada lado.
  const [swipe, setSwipe] = useState<EstadoSwipe>({ ...swipeInicial, indice: 1 });
  const [reancorando, setReancorando] = useState(false);
  const [agora, setAgora] = useState(() => new Date());

  // Medida, nao fixa: o limiar de troca e uma fracao da largura real, e chutar
  // 390 erraria em telas de 360 e 430.
  const palcoRef = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  useLayoutEffect(() => {
    const el = palcoRef.current;
    if (!el) return;
    const observador = new ResizeObserver(([entrada]) => setLargura(entrada.contentRect.width));
    observador.observe(el);
    setLargura(el.clientWidth);
    return () => observador.disconnect();
  }, []);

  // Relogio de minuto em minuto: a regua do agora e o selo AGORA mudam nessa
  // resolucao. O segundo a segundo do desktop existe para a regua deslizar
  // sobre a grade; aqui ela so muda de posicao na lista quando vira o minuto.
  const ehHoje = data === hoje;
  useEffect(() => {
    if (!ehHoje) return;
    const id = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(id);
  }, [ehHoje]);

  const opcoesSwipe = useMemo(() => ({ largura: largura || 390, total: 3 }), [largura]);

  const paineis = useMemo(
    () =>
      DELTAS.map((delta) => {
        const dataPainel = format(addDays(parseISO(data), delta), 'yyyy-MM-dd');
        // `undefined` = ainda nao adiantado pelo prefetch. Nunca colapsar para
        // [] aqui: "nao carregou" e "nao tem aula" sao coisas diferentes, e
        // colapsar faria o painel anunciar um domingo vazio que talvez tenha
        // dez aulas.
        const cru = delta === 0 ? aulasDoDia : lerDoCache(dataPainel)?.aulas;
        return { delta, data: dataPainel, cru };
      }),
    [data, aulasDoDia, lerDoCache],
  );

  const professores = useMemo(() => opcoesDoCampo(aulasDoDia, 'professor_nome'), [aulasDoDia]);

  const pressionar = useCallback((e: PointerEvent<HTMLDivElement>) => {
    setSwipe((s) => aoPressionar(s, { x: e.clientX, y: e.clientY }));
  }, []);

  const mover = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      setSwipe((s) => aoMover(s, { x: e.clientX, y: e.clientY }, opcoesSwipe));
    },
    [opcoesSwipe],
  );

  const soltar = useCallback(() => {
    setSwipe((s) => aoSoltar(s, opcoesSwipe));
  }, [opcoesSwipe]);

  /**
   * A troca de dia so acontece DEPOIS que a animacao termina.
   *
   * Trocar a data no `aoSoltar` faria o conteudo se remontar sob o painel que
   * ainda esta deslizando — o dia novo apareceria antes de chegar ao lugar.
   * Entao o palco anima ate 0 ou 2, e aqui, no fim da transicao, o pai troca a
   * data e o indice volta para 1.
   *
   * ⚠️ O reancoramento e um salto de W pixels e PRECISA acontecer sem
   * transicao: com ela ligada, o palco voltaria deslizando e a troca de dia
   * apareceria duas vezes. O duplo requestAnimationFrame existe para religar a
   * transicao so depois que o quadro do salto ja foi pintado — um rAF so ainda
   * cai no mesmo quadro.
   */
  const aoFimDaTransicao = useCallback(() => {
    if (swipe.indice === 1) return;
    const delta = swipe.indice - 1;
    setReancorando(true);
    onTrocarDia(format(addDays(parseISO(data), delta), 'yyyy-MM-dd'));
    setSwipe((s) => ({ ...s, indice: 1 }));
    requestAnimationFrame(() => requestAnimationFrame(() => setReancorando(false)));
  }, [swipe.indice, data, onTrocarDia]);

  const escolherProfessor = (nome: string | null) => onFiltrar({ ...filtros, professor: nome });

  const semTransicao = swipe.arrastando || reancorando;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-shrink-0 items-center gap-2.5 px-4 pb-3">
        <button
          type="button"
          aria-label="Dia anterior"
          onClick={() => onTrocarDia(format(addDays(parseISO(data), -1), 'yyyy-MM-dd'))}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[10px] border border-slate-700 bg-slate-800 text-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-[15px] font-bold tabular-nums text-slate-100">
            {format(parseISO(data), "EEEE, dd/MM")}
          </div>
          <div className="text-[11px] text-slate-400">{ehHoje ? 'hoje' : ''}</div>
        </div>
        <button
          type="button"
          aria-label="Próximo dia"
          onClick={() => onTrocarDia(format(addDays(parseISO(data), 1), 'yyyy-MM-dd'))}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[10px] border border-slate-700 bg-slate-800 text-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* chip — trilho de professores. Rola no proprio eixo; o gesto de dia
          vive so no palco, abaixo. Ligado e pilula clara solida: ciano e
          exclusivo de navegacao (§6 do spec). */}
      <div className="flex flex-shrink-0 gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
        <button
          type="button"
          aria-pressed={filtros.professor === null}
          onClick={() => escolherProfessor(null)}
          className={cn(
            'inline-flex min-h-[40px] flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[12.5px]',
            filtros.professor === null
              ? 'border-slate-500 bg-slate-200 font-bold text-slate-900'
              : 'border-slate-700 bg-slate-800 font-semibold text-slate-300',
          )}
        >
          Todos · {aulasDoDia.length}
        </button>
        {professores.map((nome) => {
          const ativo = filtros.professor === nome;
          const qtd = aulasDoDia.filter((a) => a.professor_nome === nome).length;
          return (
            <button
              key={nome}
              type="button"
              aria-pressed={ativo}
              onClick={() => escolherProfessor(ativo ? null : nome)}
              className={cn(
                'inline-flex min-h-[40px] flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px]',
                ativo
                  ? 'border-slate-500 bg-slate-200 font-bold text-slate-900'
                  : 'border-slate-700 bg-slate-800 font-semibold text-slate-300',
              )}
            >
              <span
                className={cn(
                  'inline-flex h-5 w-5 items-center justify-center rounded-full text-[8.5px] font-bold',
                  ativo ? 'bg-slate-400 text-slate-900' : 'bg-slate-700 text-slate-300',
                )}
              >
                {iniciaisDoNome(nome)}
              </span>
              {nome.split(' ')[0]} · {qtd}
            </button>
          );
        })}
      </div>

      <div
        ref={palcoRef}
        className="min-h-0 flex-1 overflow-hidden [touch-action:pan-y]"
        onPointerDown={pressionar}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
      >
        <div
          className={cn(
            'flex h-full w-[300%] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none',
            semTransicao ? 'transition-none' : 'transition-transform duration-[260ms]',
          )}
          style={{ transform: `translateX(calc(${-swipe.indice * (100 / 3)}% + ${swipe.dx}px))` }}
          onTransitionEnd={aoFimDaTransicao}
        >
          {paineis.map((painel) => (
            <PainelDoDia
              key={painel.data}
              data={painel.data}
              cru={painel.cru}
              filtros={filtros}
              agora={agora}
              ehHoje={painel.data === hoje}
              onAbrir={onAbrir}
              onLimparFiltro={() => escolherProfessor(null)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface PainelProps {
  data: string;
  cru: AulaAgenda[] | undefined;
  filtros: FiltrosAgenda;
  agora: Date;
  ehHoje: boolean;
  onAbrir: (aula: AulaAgenda) => void;
  onLimparFiltro: () => void;
}

function PainelDoDia({ data, cru, filtros, agora, ehHoje, onAbrir, onLimparFiltro }: PainelProps) {
  const lista = useMemo(() => (cru ? filtrarAulas(cru, filtros) : []), [cru, filtros]);
  const colisoes = useMemo(() => colisoesDeSala(cru ?? []), [cru]);

  // A regua entra ANTES da primeira aula que ainda nao comecou. Sem nenhuma,
  // o dia ja acabou e ela nao e desenhada.
  const minutos = ehHoje ? minutosAgora(agora) : null;
  const iRegua =
    minutos === null ? -1 : lista.findIndex((a) => minutosDeHHMM(a.hora_inicio) > minutos);

  if (cru === undefined) {
    return (
      <div className="w-1/3 flex-shrink-0 space-y-2 overflow-y-auto px-4 pb-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-[10px] bg-slate-800" />
        ))}
      </div>
    );
  }

  if (lista.length === 0) {
    const porFiltro = (cru?.length ?? 0) > 0;
    return (
      <div className="w-1/3 flex-shrink-0 overflow-y-auto px-6 pt-12 text-center">
        <div className="text-[14px] font-semibold text-slate-300">
          {porFiltro
            ? `${filtros.professor} não tem aula neste dia`
            : 'Sem aulas neste dia'}
        </div>
        {porFiltro && (
          <>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-400">
              O dia tem {cru.length} aulas de outros professores. O filtro continua ligado.
            </p>
            <button
              type="button"
              onClick={onLimparFiltro}
              className="mt-3.5 min-h-[44px] rounded-[10px] border border-slate-700 bg-slate-800 px-4 text-[13px] font-semibold text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
            >
              Ver todos os professores
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-1/3 flex-shrink-0 flex-col gap-2 overflow-y-auto px-4 pb-4">
      {lista.map((aula, k) => (
        <div key={aula.chave}>
          {k === iRegua && (
            <div className="mb-2.5 flex items-center gap-2">
              <span className="text-[11px] font-bold tabular-nums text-emerald-300">
                {String(Math.floor((minutos ?? 0) / 60)).padStart(2, '0')}:
                {String((minutos ?? 0) % 60).padStart(2, '0')}
              </span>
              <span className="h-px flex-1 bg-emerald-500" />
            </div>
          )}
          <LinhaAula
            aula={aula}
            data={data}
            agora={agora}
            ehHoje={ehHoje}
            colisao={colisoes.get(aula.chave)}
            onAbrir={onAbrir}
          />
        </div>
      ))}
    </div>
  );
}

export default AgendaMobile;
```

⚠️ **`colisoesDeSala` recebe `cru`, não `lista`.** A colisão é um fato do dia, não do recorte: filtrando pela Bia, a aula dela na Sala 2 continua disputando com a do Ramon, que o filtro escondeu. Calcular sobre a lista filtrada faria o aviso sumir justamente quando ele é mais útil.

- [ ] **Step 4: rodar e ver passar**

```bash
node --test tests/mobileAgendaTela.test.mjs
```

- [ ] **Step 5: registrar e commitar**

Acrescentar `tests/mobileAgendaTela.test.mjs` à chave `"test"`.

```bash
git add src/mobile/telas/agenda/AgendaMobile.tsx tests/mobileAgendaTela.test.mjs package.json
git commit -m "feat(agenda): tela de celular com trilho de professores e troca de dia por arrasto"
```

---

## Task 6: ligar na AgendaPage, com faixa por aba

**Contexto:** a Agenda tem quatro visões e esta etapa porta duas. Marcar `/app/agenda` em `ROTAS_PORTADAS` apagaria a faixa âmbar das outras duas — exatamente o erro cometido com Alunos em 14/09 e revertido no mesmo dia. O mecanismo certo já existe: `abasPortadas.ts`.

⚠️ **`ROTAS_PORTADAS` não muda.** `tests/mobileDashboardLigado.test.mjs` afirma `deepEqual(declaradas, ['/app'])` e deve continuar passando — se ele quebrar, a rota foi para o lugar errado.

**Files:**
- Modify: `src/mobile/abasPortadas.ts`
- Modify: `src/components/App/Agenda/AgendaPage.tsx`
- Test: `tests/mobileAgendaLigada.test.mjs`

- [ ] **Step 1: escrever o teste que falha**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { abaFoiPortada, rotaTemFaixaPorAba } from '../src/mobile/abasPortadas.ts';

const le = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const pagina = le('../src/components/App/Agenda/AgendaPage.tsx');
const rotas = le('../src/mobile/rotasPortadas.ts');

test('as visoes portadas sao professor e sala — chamada e calendario continuam avisando', () => {
  assert.equal(abaFoiPortada('/app/agenda', 'professor'), true);
  assert.equal(abaFoiPortada('/app/agenda', 'sala'), true);
  assert.equal(abaFoiPortada('/app/agenda', 'chamada'), false);
  assert.equal(abaFoiPortada('/app/agenda', 'calendario'), false);
});

test('a Agenda usa faixa POR ABA, e nao entra em ROTAS_PORTADAS', () => {
  assert.equal(rotaTemFaixaPorAba('/app/agenda'), true);
  // Entrar aqui apagaria a faixa de Chamada e Calendario de uma vez — o erro
  // de 14/09 com Alunos, revertido no mesmo dia.
  assert.doesNotMatch(rotas, /'\/app\/agenda'/);
});

test('a pagina decide pelo MESMO hook do shell', () => {
  assert.match(pagina, /import\s*\{\s*useShellMobile\s*\}\s*from\s*'@\/hooks\/useShellMobile'/);
  assert.match(pagina, /useShellMobile\(\)\s*===\s*'mobile'/);
  assert.doesNotMatch(pagina, /useIsMobile/, 'a pagina le a largura por conta propria');
});

test('o aviso aparece so nas visoes nao portadas', () => {
  assert.match(pagina, /ehCelular\s*&&\s*!abaFoiPortada\('\/app\/agenda',\s*visao\)/);
});

test('o ramo mobile vem ANTES do curto-circuito de dia vazio', () => {
  // Dia sem aula ainda precisa do palco para deslizar. Se o "Nenhuma aula
  // neste dia" vier antes, o arrasto morre justamente no domingo.
  const vazio = pagina.indexOf('Nenhuma aula neste dia');
  const mobile = pagina.indexOf('<AgendaMobile');
  assert.ok(mobile > -1, 'AgendaMobile nao foi montada');
  assert.ok(mobile < vazio, 'o ramo mobile precisa vir antes do curto-circuito de dia vazio');
});

test('a AgendaMobile entra por lazy — o desktop nao paga o bundle dela', () => {
  assert.match(pagina, /lazy\(\(\)\s*=>\s*import\('@\/mobile\/telas\/agenda\/AgendaMobile'\)\)/);
});

test('o desktop continua recebendo a AgendaTimeline intacta', () => {
  assert.match(pagina, /<AgendaTimeline/);
  assert.match(pagina, /agruparPor=\{agruparPor\}/);
});
```

- [ ] **Step 2: rodar e ver falhar**

- [ ] **Step 3: implementar**

Em `src/mobile/abasPortadas.ts`:

```ts
export const ROTAS_COM_FAIXA_POR_ABA: readonly string[] = ['/app/alunos', '/app/agenda'];

export const ABAS_PORTADAS: Readonly<Record<string, readonly string[]>> = {
  '/app/alunos': ['lista'],
  // Chamada e Calendário seguem abrindo no desktop, com a faixa. A grade do
  // dia é o que esta etapa portou.
  '/app/agenda': ['professor', 'sala'],
};
```

Em `AgendaPage.tsx`: importar `useShellMobile`, `abaFoiPortada`, `AvisoNaoOtimizado` e a `AgendaMobile` por `lazy`; declarar `const ehCelular = useShellMobile() === 'mobile';`; renderizar o aviso quando a visão não foi portada; e inserir o ramo mobile **antes** do `aulas.length === 0`:

```tsx
      ) : ehCelular && !ehChamada && !ehCalendario ? (
        <Suspense fallback={<div className="p-8 text-center text-sm text-slate-400">Carregando…</div>}>
          <AgendaMobile
            aulasDoDia={todasAsAulas}
            data={data}
            hoje={hoje}
            onTrocarDia={irPara}
            lerDoCache={lerDoCache}
            filtros={filtros}
            onFiltrar={setFiltros}
            onAbrir={setSelecionada}
          />
        </Suspense>
      ) : aulas.length === 0 ? (
```

- [ ] **Step 4: rodar e ver passar**

- [ ] **Step 5: provar que o desktop não mudou**

```bash
npx tsc -p tsconfig.ci.json 2>&1 | wc -l    # tem de bater com a baseline (336 erros)
node --test $(node -e "console.log(require('./package.json').scripts.test.replace('node --test ',''))")
```

Esperado: `tsc` com saída idêntica à baseline; suíte com a única falha pré-existente de `faturasAlunosPage`.

- [ ] **Step 6: commitar**

```bash
git add src/mobile/abasPortadas.ts src/components/App/Agenda/AgendaPage.tsx tests/mobileAgendaLigada.test.mjs package.json
git commit -m "feat(agenda): ligar a tela de celular na grade do dia, com faixa por visao"
```

---

## Estado esperado ao término do plano

1. `/app/agenda` abre no celular com lista cronológica, trilho de professores e troca de dia por arrasto.
2. Chamada e Calendário continuam abrindo, com a faixa âmbar — ninguém perdeu acesso.
3. `ROTAS_PORTADAS` continua `['/app']`.
4. `npx tsc -p tsconfig.ci.json` com saída idêntica à baseline.
5. Suíte com a única falha pré-existente alheia.
6. `git diff` em `AgendaTimeline.tsx`, `AgendaCard.tsx`, `AgendaDrawer.tsx`, `ChamadaView` e `CalendarioEscolar.tsx`: **vazio**.

## Fora de escopo

- Visão semanal e cancelar/reagendar pelo celular (fase 2 da Agenda, já declarada pendente no CLAUDE.md).
- Chamada e Calendário no celular — cada uma é um arquétipo próprio.
- `AgendaDrawer` adaptado: no celular ele abre como está. Vira folha de tela cheia numa etapa posterior.
