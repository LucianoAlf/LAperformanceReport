# Bandas — Calendário Mensal de Eventos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma visão mensal de eventos à aba Bandas, coerente com o calendário de Projetos, sem alterar backend nem degradar a lista existente.

**Architecture:** A lógica pura de grade, agrupamento, recorte e filtro viverá em um módulo `.mjs` testável pelo Node 22. Um componente React isolado renderizará o calendário e o painel do dia; `EventosTab` continuará dono dos dados, modais e ações RPC, alternando entre a lista atual e o novo componente.

**Tech Stack:** React 19, TypeScript, date-fns 4, Tailwind/design system existente, Node `node:test`, Vite.

---

## Estrutura de arquivos

- Create `src/components/App/Bandas/eventosBandasCalendario.mjs`: regras puras de data e coleção.
- Create `src/components/App/Bandas/CalendarioEventosBandas.tsx`: grade mensal e painel do dia.
- Modify `src/components/App/Bandas/EventosTab.tsx`: toggle, fonte única, filtro local e callbacks.
- Modify `src/components/App/Bandas/ModalEventoBanda.tsx`: data inicial opcional na criação.
- Create `tests/bandasCalendarioMensal.test.mjs`: testes executáveis da lógica pura.
- Create `tests/bandasCalendarioFrontend.test.mjs`: contrato de integração do frontend.

### Task 1: Regras puras do calendário

**Files:**
- Create: `tests/bandasCalendarioMensal.test.mjs`
- Create: `src/components/App/Bandas/eventosBandasCalendario.mjs`

- [ ] **Step 1: Write the failing test**

Criar `tests/bandasCalendarioMensal.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  agruparEventosPorDia,
  construirGradeMes,
  filtrarEventosDaLista,
  limitarEventosDoDia,
} from '../src/components/App/Bandas/eventosBandasCalendario.mjs';

const evento = (id, data_inicio) => ({ evento_id: id, data_inicio });

test('agosto de 2026 ocupa seis semanas de domingo a sábado', () => {
  const dias = construirGradeMes(new Date(2026, 7, 15));
  assert.equal(dias.length, 42);
  assert.deepEqual(
    [dias[0].getFullYear(), dias[0].getMonth(), dias[0].getDate()],
    [2026, 6, 26],
  );
  assert.deepEqual(
    [dias.at(-1).getFullYear(), dias.at(-1).getMonth(), dias.at(-1).getDate()],
    [2026, 8, 5],
  );
});

test('eventos são agrupados no dia local e ordenados pelo início', () => {
  const cedo = evento(1, new Date(2026, 7, 25, 9).toISOString());
  const tarde = evento(2, new Date(2026, 7, 25, 18).toISOString());
  const grupos = agruparEventosPorDia([tarde, cedo]);
  const chave = [2026, '08', '25'].join('-');
  assert.deepEqual(grupos.get(chave)?.map((item) => item.evento_id), [1, 2]);
});

test('lista oculta somente eventos anteriores à referência', () => {
  const agora = new Date(2026, 7, 25, 12);
  const passado = evento(1, new Date(2026, 7, 25, 11, 59).toISOString());
  const futuro = evento(2, new Date(2026, 7, 25, 12, 1).toISOString());
  assert.deepEqual(
    filtrarEventosDaLista([passado, futuro], false, agora).map((item) => item.evento_id),
    [2],
  );
  assert.deepEqual(
    filtrarEventosDaLista([passado, futuro], true, agora).map((item) => item.evento_id),
    [1, 2],
  );
});

test('célula mostra três chips e informa o restante', () => {
  const resultado = limitarEventosDoDia([1, 2, 3, 4, 5]);
  assert.deepEqual(resultado.visiveis, [1, 2, 3]);
  assert.equal(resultado.restantes, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test tests/bandasCalendarioMensal.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` because the calendar module does not yet exist.

- [ ] **Step 3: Write minimal implementation**

Criar `src/components/App/Bandas/eventosBandasCalendario.mjs`:

```js
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

export const MAX_EVENTOS_POR_DIA = 3;

export function construirGradeMes(mes) {
  const inicioMes = startOfMonth(mes);
  const fimMes = endOfMonth(mes);
  return eachDayOfInterval({
    start: startOfWeek(inicioMes, { weekStartsOn: 0 }),
    end: endOfWeek(fimMes, { weekStartsOn: 0 }),
  });
}

export function chaveDiaLocal(valor) {
  const data = typeof valor === 'string' ? parseISO(valor) : valor;
  return format(data, 'yyyy-MM-dd');
}

export function agruparEventosPorDia(eventos) {
  const grupos = new Map();
  for (const item of [...eventos].sort(
    (a, b) => parseISO(a.data_inicio).getTime() - parseISO(b.data_inicio).getTime(),
  )) {
    const chave = chaveDiaLocal(item.data_inicio);
    const grupo = grupos.get(chave) ?? [];
    grupo.push(item);
    grupos.set(chave, grupo);
  }
  return grupos;
}

export function filtrarEventosDaLista(eventos, mostrarPassados, agora) {
  if (mostrarPassados) return eventos;
  return eventos.filter((item) => parseISO(item.data_inicio).getTime() >= agora.getTime());
}

export function limitarEventosDoDia(eventos, limite = MAX_EVENTOS_POR_DIA) {
  return {
    visiveis: eventos.slice(0, limite),
    restantes: Math.max(0, eventos.length - limite),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node --test tests/bandasCalendarioMensal.test.mjs
```

Expected: 4 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```powershell
git add tests/bandasCalendarioMensal.test.mjs src/components/App/Bandas/eventosBandasCalendario.mjs
git commit -m "test(bandas): define regras do calendário mensal"
```

### Task 2: Preseleção segura da data no modal

**Files:**
- Create: `tests/bandasCalendarioFrontend.test.mjs`
- Modify: `src/components/App/Bandas/ModalEventoBanda.tsx`

- [ ] **Step 1: Write the failing contract**

Criar `tests/bandasCalendarioFrontend.test.mjs`:

```js
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const modal = read('src/components/App/Bandas/ModalEventoBanda.tsx');

test('modal aceita data inicial apenas na criação e edição prevalece', () => {
  assert.match(modal, /dataInicial\?: Date \| null/);
  assert.match(modal, /evento \? new Date\(evento\.data_inicio\) : dataInicial \? new Date\(dataInicial\) : undefined/);
  assert.match(modal, /\[aberto, evento, unidadeAtual, dataInicial\]/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test tests/bandasCalendarioFrontend.test.mjs
```

Expected: FAIL because `dataInicial` is not part of the current modal contract.

- [ ] **Step 3: Implement the optional prop**

Em `ModalEventoBanda.tsx`, ampliar a interface e a assinatura:

```ts
interface ModalEventoBandaProps {
  aberto: boolean;
  evento: EventoBanda | null;
  dataInicial?: Date | null;
  unidadeAtual: string;
  bandas: BandaResumo[];
  onClose: () => void;
  onSalvo: () => void;
}

export function ModalEventoBanda({
  aberto,
  evento,
  dataInicial = null,
  unidadeAtual,
  bandas,
  onClose,
  onSalvo,
}: ModalEventoBandaProps) {
```

Na reinicialização do formulário, substituir somente a atribuição da data:

```ts
setData(
  evento
    ? new Date(evento.data_inicio)
    : dataInicial
      ? new Date(dataInicial)
      : undefined,
);
```

E atualizar a dependência do efeito para:

```ts
}, [aberto, evento, unidadeAtual, dataInicial]);
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node --test tests/bandasCalendarioFrontend.test.mjs
```

Expected: 1 test passes, 0 fail.

- [ ] **Step 5: Commit**

```powershell
git add tests/bandasCalendarioFrontend.test.mjs src/components/App/Bandas/ModalEventoBanda.tsx
git commit -m "feat(bandas): aceita data inicial no modal de evento"
```

### Task 3: Componente mensal e painel do dia

**Files:**
- Modify: `tests/bandasCalendarioFrontend.test.mjs`
- Create: `src/components/App/Bandas/CalendarioEventosBandas.tsx`

- [ ] **Step 1: Extend the failing contract**

Acrescentar ao teste:

```js
const calendarioPath = 'src/components/App/Bandas/CalendarioEventosBandas.tsx';
const calendario = existsSync(path.join(root, calendarioPath)) ? read(calendarioPath) : '';

test('calendário mensal oferece navegação, hoje, grade e painel do dia', () => {
  assert.match(calendario, /subMonths\(mesAtual, 1\)/);
  assert.match(calendario, /addMonths\(mesAtual, 1\)/);
  assert.match(calendario, />Hoje</);
  assert.match(calendario, /grid-cols-7/);
  assert.match(calendario, /Agenda do dia/);
});

test('interações de dia e evento permanecem separadas', () => {
  assert.match(calendario, /onCriarEvento\(dia\)/);
  assert.match(calendario, /event\.stopPropagation\(\)/);
  assert.match(calendario, /onAbrirEvento\(evento\)/);
  assert.match(calendario, /restantes > 0/);
  assert.match(calendario, /setDiaSelecionado\(dia\)/);
});

test('painel expõe as ações existentes para eventos agendados', () => {
  assert.match(calendario, /onCancelarEvento\(evento\)/);
  assert.match(calendario, /onRemoverEvento\(evento\)/);
  assert.match(calendario, /evento\.status === 'agendado'/);
});

test('calendário não introduz cores hexadecimais', () => {
  assert.doesNotMatch(calendario, /#[\da-f]{3,8}/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test tests/bandasCalendarioFrontend.test.mjs
```

Expected: the modal test passes and the four calendar tests fail because the component does not exist.

- [ ] **Step 3: Implement the calendar component**

Criar `CalendarioEventosBandas.tsx` com este contrato público:

```ts
interface CalendarioEventosBandasProps {
  eventos: EventoBanda[];
  onCriarEvento: (data: Date) => void;
  onAbrirEvento: (evento: EventoBanda) => void;
  onCancelarEvento: (evento: EventoBanda) => void;
  onRemoverEvento: (evento: EventoBanda) => void;
}
```

O componente deve:

```ts
const [mesAtual, setMesAtual] = useState(() => startOfMonth(new Date()));
const [diaSelecionado, setDiaSelecionado] = useState(() => new Date());
const eventosPorDia = useMemo(() => agruparEventosPorDia(eventos), [eventos]);
const dias = useMemo(() => construirGradeMes(mesAtual), [mesAtual]);
const eventosSelecionados = eventosPorDia.get(chaveDiaLocal(diaSelecionado)) ?? [];
```

Renderizar uma grade `lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]`. O cartão da
grade contém a toolbar com `subMonths(mesAtual, 1)`, `addMonths(mesAtual, 1)` e
`Hoje`, o título com `format(mesAtual, 'MMMM yyyy', { locale: ptBR })`, os sete
dias da semana e as células retornadas por `construirGradeMes`.

Cada célula é um `div` com `role="button"`, `tabIndex={0}`, handler de clique e
teclado para `onCriarEvento(dia)`. O botão do número do dia chama apenas
`setDiaSelecionado(dia)` e interrompe propagação. Cada chip é um `button` que
interrompe propagação e chama `onAbrirEvento(evento)`.

Usar `limitarEventosDoDia(eventosNoDia)` e, se `restantes > 0`, renderizar um
botão `+{restantes}` que seleciona o dia. Cancelado recebe `opacity-60
line-through`; realizado usa o variant visual de sucesso; ensaio/show usam
ícones e variants semânticos diferentes, sem `style` ou hexadecimal.

O painel `Agenda do dia` lista todos os eventos selecionados. Cada item chama
`onAbrirEvento`; quando `evento.status === 'agendado'`, também mostra botões
Editar, Cancelar e Excluir que chamam, respectivamente, `onAbrirEvento(evento)`,
`onCancelarEvento(evento)` e `onRemoverEvento(evento)` com propagação
interrompida. Usar os componentes `Button` e `Badge` existentes.

- [ ] **Step 4: Run contract and build**

Run:

```powershell
node --test tests/bandasCalendarioMensal.test.mjs tests/bandasCalendarioFrontend.test.mjs
npm run build
```

Expected: 9 tests pass and Vite exits with code 0.

- [ ] **Step 5: Commit**

```powershell
git add tests/bandasCalendarioFrontend.test.mjs src/components/App/Bandas/CalendarioEventosBandas.tsx
git commit -m "feat(bandas): cria calendário mensal de eventos"
```

### Task 4: Integrar toggle, fonte única e ações

**Files:**
- Modify: `tests/bandasCalendarioFrontend.test.mjs`
- Modify: `src/components/App/Bandas/EventosTab.tsx`

- [ ] **Step 1: Extend the failing contract**

Acrescentar:

```js
const eventosTab = read('src/components/App/Bandas/EventosTab.tsx');

test('aba abre em calendário, persiste o toggle e busca toda a história uma vez', () => {
  assert.match(eventosTab, /bandas_eventos_visualizacao/);
  assert.match(eventosTab, /return saved === 'lista' \? 'lista' : 'calendario'/);
  assert.match(eventosTab, /useBandaEventos\(unidadeAtual, null\)/);
  assert.match(eventosTab, /filtrarEventosDaLista\(eventos, mostrarPassados, agoraReferencia\)/);
});

test('switch de passados fica exclusivo da lista e calendário recebe os callbacks atuais', () => {
  assert.match(eventosTab, /visualizacao === 'lista'[\s\S]*?mostrar-passados/);
  assert.match(eventosTab, /<CalendarioEventosBandas/);
  assert.match(eventosTab, /onCancelarEvento=\{setEventoCancelando\}/);
  assert.match(eventosTab, /onRemoverEvento=\{setEventoRemovendo\}/);
});

test('criação por dia e Novo evento não compartilham data residual', () => {
  assert.match(eventosTab, /setDataInicial\(data \? new Date\(data\) : null\)/);
  assert.match(eventosTab, /dataInicial=\{dataInicial\}/);
  assert.match(eventosTab, /setDataInicial\(null\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test tests/bandasCalendarioFrontend.test.mjs
```

Expected: calendar and modal tests pass; integration tests fail against the current list-only tab.

- [ ] **Step 3: Integrate the two views**

Em `EventosTab.tsx`:

```ts
type VisualizacaoEventos = 'lista' | 'calendario';

const [visualizacao, setVisualizacao] = useState<VisualizacaoEventos>(() => {
  const saved = localStorage.getItem('bandas_eventos_visualizacao');
  return saved === 'lista' ? 'lista' : 'calendario';
});
const [agoraReferencia] = useState(() => new Date());
const [dataInicial, setDataInicial] = useState<Date | null>(null);
const { eventos, loading, recarregar } = useBandaEventos(unidadeAtual, null);
const eventosLista = useMemo(
  () => filtrarEventosDaLista(eventos, mostrarPassados, agoraReferencia),
  [eventos, mostrarPassados, agoraReferencia],
);

useEffect(() => {
  localStorage.setItem('bandas_eventos_visualizacao', visualizacao);
}, [visualizacao]);
```

Centralizar abertura e fechamento:

```ts
function abrirCriacao(data?: Date) {
  setEventoEditando(null);
  setDataInicial(data ? new Date(data) : null);
  setModalAberto(true);
}

function abrirEdicao(evento: EventoBanda) {
  setDataInicial(null);
  setEventoEditando(evento);
  setModalAberto(true);
}

function fecharModal() {
  setModalAberto(false);
  setEventoEditando(null);
  setDataInicial(null);
}
```

Adicionar o segmented toggle com `List` e `CalendarDays`, usando `Button`
`variant="ghost"`, `aria-pressed`, rótulos `Lista`/`Calendário` e o mesmo
container `bg-slate-700/30 rounded-lg p-1` de `ListaBandasTab`. Renderizar o
switch apenas quando `visualizacao === 'lista'`.

Preservar o JSX existente da lista, trocando somente `eventos` por
`eventosLista`. Para a outra visão:

```tsx
<CalendarioEventosBandas
  eventos={eventos}
  onCriarEvento={abrirCriacao}
  onAbrirEvento={abrirEdicao}
  onCancelarEvento={setEventoCancelando}
  onRemoverEvento={setEventoRemovendo}
/>
```

Passar `dataInicial={dataInicial}` ao modal, usar `fecharModal` em `onClose` e,
em `onSalvo`, chamar `fecharModal()` antes de `recarregar()`.

- [ ] **Step 4: Run focused tests and build**

Run:

```powershell
node --test tests/bandasCalendarioMensal.test.mjs tests/bandasCalendarioFrontend.test.mjs
npm run build
```

Expected: 12 tests pass and Vite exits with code 0.

- [ ] **Step 5: Commit**

```powershell
git add tests/bandasCalendarioFrontend.test.mjs src/components/App/Bandas/EventosTab.tsx
git commit -m "feat(bandas): alterna lista e calendário de eventos"
```

### Task 5: Polimento, acessibilidade e validação real

**Files:**
- Modify: `src/components/App/Bandas/CalendarioEventosBandas.tsx`
- Modify: `src/components/App/Bandas/EventosTab.tsx`
- Verify: all files from Tasks 1–4

- [ ] **Step 1: Run focused automated verification**

```powershell
node --test tests/bandasCalendarioMensal.test.mjs tests/bandasCalendarioFrontend.test.mjs
npm run build
git diff --check
```

Expected: all focused tests pass, Vite exits 0 and diff check prints nothing.

- [ ] **Step 2: Run the full clean baseline**

```powershell
npm test
```

Expected: 371 tests pass, 0 fail, in addition to the focused calendar tests.

- [ ] **Step 3: Validate in a real browser**

In `/app/bandas?tab=eventos`, validate:

1. Calendar is the default on a clean preference.
2. Toggle changes views without a second RPC or loss of data.
3. Previous, next and Today navigate correctly.
4. Empty day opens creation with that date.
5. Chip opens editing and does not open creation.
6. `+N` selects the day and the panel lists every event.
7. Cancel/delete actions open the existing confirmations.
8. List and its past-events switch keep the prior behavior.
9. Unit changes refresh the same calendar source.
10. Desktop and narrow viewport remain usable; console has no errors.

- [ ] **Step 4: Review the patch and commit final polish**

```powershell
git status --short
git diff --stat origin/main...HEAD
git diff --check
git add src/components/App/Bandas tests docs/superpowers/plans/2026-08-25-bandas-calendario-mensal.md
git commit -m "feat(bandas): finaliza calendário mensal de eventos"
```

Se não houver polimento adicional, não criar commit vazio. Reportar branch,
commits, testes, build, evidência de navegador e que não houve push, merge ou
deploy.
