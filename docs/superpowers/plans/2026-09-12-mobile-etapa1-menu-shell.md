# Versão mobile — Etapa 1: menu e shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao LA Report um shell mobile navegável — barra inferior, menu completo e cabeçalho — sem alterar uma linha do comportamento desktop.

**Architecture:** Um `ResponsiveLayout` novo escolhe entre `AppLayout` (intocado) e `MobileLayout` (novo) pelo breakpoint. As decisões — qual shell, quais itens de menu aparecem — moram em módulos puros de `src/lib/`, testáveis sem DOM. A lista de menu vira fonte única consumida pelos dois shells.

**Tech Stack:** React 19, React Router 7, TypeScript 5.8, Vite 6, Tailwind (CDN), lucide-react. Testes: `node --test` com `.test.mjs`, Node 22.20 (type stripping importa `.ts` direto).

**Spec:** [`docs/superpowers/specs/2026-09-12-versao-mobile-la-report-design.md`](../specs/2026-09-12-versao-mobile-la-report-design.md)

**Task:** LAPE-32 · **Branch:** `feat/versao-mobile` (local, sem push)

## Global Constraints

- **O desktop não pode mudar de comportamento.** `AppLayout.tsx` não é editado neste plano. `AppSidebar.tsx` é editado apenas para trocar duas constantes locais por um import — o JSX de render não muda.
- **Fase 1 sem PWA.** Nenhum `manifest.json`, nenhum service worker, nenhum `beforeinstallprompt`, nenhum ícone de instalação. Qualquer tarefa que peça isso está fora deste plano.
- **Breakpoint:** mobile é `max-width: 1023px`. Constante única em `src/lib/shellMobile.ts`, nunca repetida em componente.
- **Ciano (`cyan-400`/`#00d4ff`) é exclusivo de navegação.** Filtro ativo usa pílula clara sólida (`bg-slate-200 text-slate-950`). Nunca ciano em filtro.
- **`env(safe-area-inset-bottom)`** é obrigatório na barra inferior.
- **Módulo em `src/lib/` testado por import direto não pode ter import de runtime com alias `@/`** — o type stripping do Node não resolve o alias. `import type` é permitido (é apagado).
- **Português** em variáveis, funções e comentários, seguindo o repo.
- **Commits:** `git -c user.name="Luciano" -c user.email="lucianoalf.la@gmail.com" commit`. Nunca `push` neste plano.

---

### Task 1: Regra de visibilidade do menu (decisão pura)

Hoje a regra de quem vê cada módulo está espalhada dentro de `AppSidebar.tsx` como três `useState`/constantes soltas. O mobile precisa da mesma regra — e copiá-la criaria duas fontes de verdade, o defeito que gerou as duplicatas de renovação neste repo.

**Files:**
- Create: `src/lib/menuVisibilidade.ts`
- Test: `tests/mobileMenuVisibilidade.test.mjs`

**Interfaces:**
- Consumes: nada (primeira tarefa)
- Produces:
  - `type RegraVisibilidade = 'sempre' | 'admin' | 'campanhas' | 'trafego_pago'`
  - `interface ContextoVisibilidade { isAdmin: boolean; campanhasVisivel: boolean; trafegoPagoVisivel: boolean }`
  - `itemVisivel(regra: RegraVisibilidade | undefined, ctx: ContextoVisibilidade): boolean`
  - `filtrarVisiveis<T extends { visibilidade?: RegraVisibilidade }>(itens: T[], ctx: ContextoVisibilidade): T[]`

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/mobileMenuVisibilidade.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { itemVisivel, filtrarVisiveis } from '../src/lib/menuVisibilidade.ts';

const TODOS = { isAdmin: true, campanhasVisivel: true, trafegoPagoVisivel: true };
const NENHUM = { isAdmin: false, campanhasVisivel: false, trafegoPagoVisivel: false };

test('itemVisivel', async (t) => {
  await t.test('item sem regra e visivel para todo mundo', () => {
    assert.equal(itemVisivel(undefined, NENHUM), true);
    assert.equal(itemVisivel('sempre', NENHUM), true);
  });

  await t.test('admin: so quem e admin ve', () => {
    assert.equal(itemVisivel('admin', TODOS), true);
    assert.equal(itemVisivel('admin', NENHUM), false);
  });

  await t.test('campanhas e trafego seguem a flag de cada um, nao o admin', () => {
    // Trafego Pago e custo de midia: a regra e lista fixa de e-mail, resolvida
    // fora daqui. Ser admin NAO da acesso.
    const soCampanhas = { isAdmin: true, campanhasVisivel: true, trafegoPagoVisivel: false };
    assert.equal(itemVisivel('campanhas', soCampanhas), true);
    assert.equal(itemVisivel('trafego_pago', soCampanhas), false);
  });

  await t.test('regra desconhecida NAO aparece — fail-closed', () => {
    // Item novo com regra mal escrita nao pode vazar modulo sensivel.
    // Some da tela, mas avisa no console para nao sumir em silencio.
    assert.equal(itemVisivel('financeiro_secreto', TODOS), false);
  });
});

test('filtrarVisiveis preserva a ordem e devolve os mesmos objetos', () => {
  const itens = [
    { path: '/app', visibilidade: 'sempre' },
    { path: '/app/trafego-pago', visibilidade: 'trafego_pago' },
    { path: '/app/alunos' },
    { path: '/app/automacoes', visibilidade: 'admin' },
  ];
  const r = filtrarVisiveis(itens, { isAdmin: false, campanhasVisivel: false, trafegoPagoVisivel: false });
  assert.deepEqual(r.map((i) => i.path), ['/app', '/app/alunos']);
  assert.equal(r[0], itens[0], 'devolve a referencia original, nao uma copia');
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
node --test tests/mobileMenuVisibilidade.test.mjs
```

Esperado: FALHA com `Cannot find module '../src/lib/menuVisibilidade.ts'`.

- [ ] **Step 3: Implementar**

Criar `src/lib/menuVisibilidade.ts`:

```ts
/**
 * Regra de quem enxerga cada item do menu — fonte unica.
 *
 * Existe porque a sidebar e o shell mobile precisam da MESMA regra: duplicar
 * faria modulo novo aparecer num menu e nao no outro.
 */

export type RegraVisibilidade = 'sempre' | 'admin' | 'campanhas' | 'trafego_pago';

export interface ContextoVisibilidade {
  isAdmin: boolean;
  /** `campanhas_config.visibilidade_global` (ou o e-mail de dev) */
  campanhasVisivel: boolean;
  /** lista fixa de e-mail — custo de midia e sensivel */
  trafegoPagoVisivel: boolean;
}

export function itemVisivel(
  regra: RegraVisibilidade | undefined,
  ctx: ContextoVisibilidade,
): boolean {
  if (regra === undefined || regra === 'sempre') return true;
  if (regra === 'admin') return ctx.isAdmin;
  if (regra === 'campanhas') return ctx.campanhasVisivel;
  if (regra === 'trafego_pago') return ctx.trafegoPagoVisivel;

  // Fail-closed: regra que ninguem implementou nao pode vazar modulo sensivel.
  // Mas sumir em silencio e o pior dos mundos — por isso o aviso.
  console.warn(`[menu] regra de visibilidade desconhecida: ${String(regra)} — item ocultado`);
  return false;
}

export function filtrarVisiveis<T extends { visibilidade?: RegraVisibilidade }>(
  itens: T[],
  ctx: ContextoVisibilidade,
): T[] {
  return itens.filter((item) => itemVisivel(item.visibilidade, ctx));
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

```bash
node --test tests/mobileMenuVisibilidade.test.mjs
```

Esperado: PASSA, 6 subtestes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/menuVisibilidade.ts tests/mobileMenuVisibilidade.test.mjs
git -c user.name="Luciano" -c user.email="lucianoalf.la@gmail.com" commit -m "feat(mobile): regra unica de visibilidade do menu

Fail-closed em regra desconhecida, com aviso no console: item novo mal
configurado nao pode vazar Trafego Pago nem Campanhas, e sumir em
silencio e pior que sumir avisando.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Fonte única dos itens de menu

A lista de 18 itens está declarada dentro de `AppSidebar.tsx` como duas constantes locais (`menuItems` e `operacional`, linhas 75-96). O mobile precisa da mesma lista.

⚠️ **A sidebar usa `item.icon` como componente React** (`const Icon = item.icon`). Por isso a lista fica num `.tsx` que importa `lucide-react`, e o render da sidebar **não muda uma linha** — só de onde a lista vem. A regra pura (Task 1) fica separada justamente para ser testável sem carregar React.

**Files:**
- Create: `src/lib/menuItems.tsx`
- Modify: `src/components/App/Layout/AppSidebar.tsx` (remover as constantes locais das linhas 75-96, importar do novo módulo)
- Test: `tests/mobileMenuFonteUnica.test.mjs`

**Interfaces:**
- Consumes: `RegraVisibilidade` de `src/lib/menuVisibilidade.ts`
- Produces:
  - `interface ItemMenu { path: string; label: string; labelCurto?: string; icon: LucideIcon; end?: boolean; visibilidade?: RegraVisibilidade }`
  - `const MENU_PRINCIPAL: ItemMenu[]` (4 itens)
  - `const MENU_OPERACIONAL: ItemMenu[]` (14 itens)
  - `const ROTAS_BARRA_INFERIOR: readonly string[]` = `['/app', '/app/alunos', '/app/agenda', '/app/administrativo']`

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/mobileMenuFonteUnica.test.mjs`. Este é teste de **contrato de fonte** (o padrão do repo para arquivos que carregam React), porque importar `.tsx` com lucide-react no `node --test` puxaria a árvore inteira do React:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ler = (p) => readFileSync(p, 'utf8');
const itens = ler('src/lib/menuItems.tsx');
const sidebar = ler('src/components/App/Layout/AppSidebar.tsx');

const PATHS_ESPERADOS = [
  '/app', '/app/gestao-mensal', '/app/metas', '/app/config',
  '/app/pre-atendimento', '/app/campanhas', '/app/trafego-pago', '/app/comercial',
  '/app/agenda', '/app/administrativo', '/app/alunos', '/app/bandas',
  '/app/faturas', '/app/sucesso-aluno', '/app/professores', '/app/time',
  '/app/salas', '/app/projetos',
];

test('menuItems concentra os 18 modulos do menu', () => {
  for (const p of PATHS_ESPERADOS) {
    assert.match(itens, new RegExp(`path: '${p.replace(/\//gu, '\\/')}'`, 'u'), `falta ${p}`);
  }
});

test('itens sensiveis declaram a regra de visibilidade', () => {
  assert.match(itens, /path: '\/app\/campanhas'[\s\S]{0,220}?visibilidade: 'campanhas'/u);
  assert.match(itens, /path: '\/app\/trafego-pago'[\s\S]{0,220}?visibilidade: 'trafego_pago'/u);
});

test('a barra inferior aprovada: Inicio, Alunos, Agenda, Administrativo', () => {
  assert.match(
    itens,
    /ROTAS_BARRA_INFERIOR[\s\S]{0,200}'\/app'[\s\S]{0,80}'\/app\/alunos'[\s\S]{0,80}'\/app\/agenda'[\s\S]{0,80}'\/app\/administrativo'/u,
  );
});

test('AppSidebar LE a fonte unica em vez de declarar a propria lista', () => {
  assert.match(sidebar, /from '@\/lib\/menuItems'/u, 'sidebar precisa importar a fonte unica');
  // As constantes locais tem que ter sumido, senao voltamos a ter duas verdades.
  assert.doesNotMatch(sidebar, /^const menuItems = \[/mu);
  assert.doesNotMatch(sidebar, /^const operacional = \[/mu);
});

test('o render da sidebar continua resolvendo o icone como componente', () => {
  // Guarda de nao-regressao: se isto sumir, o icone virou string e o desktop quebrou.
  assert.match(sidebar, /const Icon = item\.icon/u);
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
node --test tests/mobileMenuFonteUnica.test.mjs
```

Esperado: FALHA — `ENOENT` em `src/lib/menuItems.tsx`.

- [ ] **Step 3: Criar a fonte única**

Criar `src/lib/menuItems.tsx`. Copiar os ícones exatamente como estão importados hoje em `AppSidebar.tsx` (conferir a lista de imports do lucide no topo daquele arquivo antes de escrever):

```tsx
import {
  LayoutDashboard, BarChart3, Target, Settings,
  Phone, Megaphone, MousePointerClick, Briefcase, CalendarClock,
  ClipboardList, Users, Guitar, ReceiptText, Heart, GraduationCap,
  Building2, FolderKanban,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { RegraVisibilidade } from './menuVisibilidade';

export interface ItemMenu {
  path: string;
  label: string;
  /** usado na barra inferior, onde nao cabe "Administrativo" */
  labelCurto?: string;
  icon: LucideIcon;
  end?: boolean;
  visibilidade?: RegraVisibilidade;
}

export const MENU_PRINCIPAL: ItemMenu[] = [
  { path: '/app', label: 'Dashboard', labelCurto: 'Início', icon: LayoutDashboard, end: true },
  { path: '/app/gestao-mensal', label: 'Analytics', icon: BarChart3 },
  { path: '/app/metas', label: 'Metas', icon: Target },
  { path: '/app/config', label: 'Configurações', labelCurto: 'Config', icon: Settings },
];

export const MENU_OPERACIONAL: ItemMenu[] = [
  { path: '/app/pre-atendimento', label: 'Pré-Atendimento', labelCurto: 'Pré-At.', icon: Phone },
  { path: '/app/campanhas', label: 'Campanhas', icon: Megaphone, visibilidade: 'campanhas' },
  { path: '/app/trafego-pago', label: 'Tráfego Pago', labelCurto: 'Tráfego', icon: MousePointerClick, visibilidade: 'trafego_pago' },
  { path: '/app/comercial', label: 'Comercial', icon: Briefcase },
  { path: '/app/agenda', label: 'Agenda', icon: CalendarClock },
  { path: '/app/administrativo', label: 'Administrativo', labelCurto: 'Admin', icon: ClipboardList },
  { path: '/app/alunos', label: 'Alunos', icon: Users },
  { path: '/app/bandas', label: 'Bandas', icon: Guitar },
  { path: '/app/faturas', label: 'Faturas', icon: ReceiptText },
  { path: '/app/sucesso-aluno', label: 'Sucesso do Aluno', labelCurto: 'Sucesso', icon: Heart },
  { path: '/app/professores', label: 'Professores', labelCurto: 'Profs.', icon: GraduationCap },
  { path: '/app/time', label: 'Time', icon: Users },
  { path: '/app/salas', label: 'Salas', icon: Building2 },
  { path: '/app/projetos', label: 'Projetos', icon: FolderKanban },
];

/**
 * Os 4 destinos de um toque na barra inferior (decisao do Hugo, 12/09/2026).
 * Serve ADM, secretaria e coordenacao — o maior grupo de uso.
 * Os outros 14 modulos ficam a dois toques, no "Mais".
 */
export const ROTAS_BARRA_INFERIOR: readonly string[] = [
  '/app',
  '/app/alunos',
  '/app/agenda',
  '/app/administrativo',
];
```

- [ ] **Step 4: Fazer a sidebar ler da fonte única**

Em `src/components/App/Layout/AppSidebar.tsx`:

1. Apagar as duas constantes locais (hoje nas linhas 75-96): o bloco `const menuItems = [...]` e o bloco `const operacional = [...]`.
2. Acrescentar o import, junto dos outros imports do topo:

```tsx
import { MENU_PRINCIPAL as menuItems, MENU_OPERACIONAL as operacional } from '@/lib/menuItems';
```

O alias evita tocar em qualquer outro ponto do arquivo — todo o JSX que usa `menuItems.map(...)` e `operacional.map(...)` continua igual.

3. Remover do import do `lucide-react` no topo apenas os ícones que ficaram sem uso após a remoção das listas. ⚠️ **Conferir um a um**: vários desses ícones também são usados no rodapé da sidebar e no cabeçalho (ex.: `TrendingUp`, `ChevronRight`, `ChevronLeft`). Rodar `npx tsc --noEmit` no Step 5 pega o que sobrar.

- [ ] **Step 5: Rodar teste e typecheck**

```bash
node --test tests/mobileMenuFonteUnica.test.mjs
npx tsc --noEmit
```

Esperado: teste PASSA (5 casos); `tsc` sem erro. Se `tsc` reclamar de import não usado, remover o ícone correspondente do import da sidebar.

- [ ] **Step 6: Conferir o desktop na tela**

```bash
npm run dev
```

Abrir `http://localhost:5175/app`, logar, e verificar: os 18 itens aparecem na sidebar, nos mesmos grupos, com os mesmos ícones; colapsar/expandir funciona; o badge de Campanhas continua aparecendo.

⚠️ **Este passo não é opcional.** É a única verificação de que o desktop não regrediu, e os testes deste repo são de contrato de fonte — eles não renderizam nada.

- [ ] **Step 7: Commit**

```bash
git add src/lib/menuItems.tsx src/components/App/Layout/AppSidebar.tsx tests/mobileMenuFonteUnica.test.mjs
git -c user.name="Luciano" -c user.email="lucianoalf.la@gmail.com" commit -m "refactor(menu): lista de modulos vira fonte unica em src/lib/menuItems

A sidebar declarava a lista dentro dela. O shell mobile precisa da MESMA
lista — copiar faria modulo novo aparecer num menu e nao no outro.

O render nao muda: os itens seguem carregando o icone como componente
React, e a sidebar so troca de onde a lista vem (import com alias, para
nao tocar o JSX).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Decisão de shell (pura) e hook de viewport

**Files:**
- Create: `src/lib/shellMobile.ts`
- Create: `src/hooks/useIsMobile.ts`
- Test: `tests/mobileShellDecisao.test.mjs`

**Interfaces:**
- Consumes: nada
- Produces:
  - `const LARGURA_MAXIMA_MOBILE = 1023`
  - `const MEDIA_QUERY_MOBILE = '(max-width: 1023px)'`
  - `ehLarguraMobile(largura: number): boolean`
  - `resolverShell(p: { larguraMobile: boolean; flagDesligada?: boolean; override?: string | null }): 'mobile' | 'desktop'`
  - `useIsMobile(): boolean` (hook)

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/mobileShellDecisao.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LARGURA_MAXIMA_MOBILE, MEDIA_QUERY_MOBILE, ehLarguraMobile, resolverShell,
} from '../src/lib/shellMobile.ts';

test('o corte e 1023px: iPad retrato e mobile, iPad paisagem nao', () => {
  assert.equal(LARGURA_MAXIMA_MOBILE, 1023);
  assert.equal(MEDIA_QUERY_MOBILE, '(max-width: 1023px)');
  assert.equal(ehLarguraMobile(390), true, 'iPhone');
  assert.equal(ehLarguraMobile(768), true, 'iPad retrato');
  assert.equal(ehLarguraMobile(1023), true, 'ultimo pixel mobile');
  assert.equal(ehLarguraMobile(1024), false, 'iPad paisagem ja e desktop');
  assert.equal(ehLarguraMobile(1920), false);
});

test('resolverShell', async (t) => {
  await t.test('sem flag e sem override, decide pela largura', () => {
    assert.equal(resolverShell({ larguraMobile: true }), 'mobile');
    assert.equal(resolverShell({ larguraMobile: false }), 'desktop');
  });

  await t.test('kill switch vence a largura — e o rollback sem revert', () => {
    assert.equal(resolverShell({ larguraMobile: true, flagDesligada: true }), 'desktop');
  });

  await t.test('override manual vence tudo, para testar no proprio aparelho', () => {
    assert.equal(resolverShell({ larguraMobile: false, override: 'mobile' }), 'mobile');
    assert.equal(resolverShell({ larguraMobile: true, override: 'desktop' }), 'desktop');
    // Kill switch e decisao de operacao: nem o override o contraria.
    assert.equal(resolverShell({ larguraMobile: true, flagDesligada: true, override: 'mobile' }), 'desktop');
  });

  await t.test('override com lixo e ignorado, nao quebra', () => {
    assert.equal(resolverShell({ larguraMobile: true, override: 'banana' }), 'mobile');
    assert.equal(resolverShell({ larguraMobile: true, override: null }), 'mobile');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
node --test tests/mobileShellDecisao.test.mjs
```

Esperado: FALHA — módulo não encontrado.

- [ ] **Step 3: Implementar a decisão pura**

Criar `src/lib/shellMobile.ts`:

```ts
/**
 * Qual shell renderizar. Decisao pura, separada do hook, para ser testavel
 * sem DOM — e para o corte existir em UM lugar so.
 */

/** iPad retrato (768) entra no shell mobile; paisagem (1024) fica no desktop. */
export const LARGURA_MAXIMA_MOBILE = 1023;

export const MEDIA_QUERY_MOBILE = `(max-width: ${LARGURA_MAXIMA_MOBILE}px)`;

export function ehLarguraMobile(largura: number): boolean {
  return largura <= LARGURA_MAXIMA_MOBILE;
}

export interface EntradaShell {
  larguraMobile: boolean;
  /** kill switch de operacao (VITE_MOBILE_SHELL=off): desliga para todo mundo */
  flagDesligada?: boolean;
  /** localStorage 'shell-override': 'mobile' | 'desktop', para testar no aparelho */
  override?: string | null;
}

export function resolverShell({ larguraMobile, flagDesligada, override }: EntradaShell): 'mobile' | 'desktop' {
  // O kill switch vem primeiro de proposito: e o rollback sem redeploy de
  // codigo, e nao pode ser contornado por override de ninguem.
  if (flagDesligada) return 'desktop';
  if (override === 'mobile') return 'mobile';
  if (override === 'desktop') return 'desktop';
  return larguraMobile ? 'mobile' : 'desktop';
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
node --test tests/mobileShellDecisao.test.mjs
```

Esperado: PASSA, 6 casos.

- [ ] **Step 5: Implementar o hook**

Criar `src/hooks/useIsMobile.ts`:

```ts
import { useEffect, useState } from 'react';

import { MEDIA_QUERY_MOBILE } from '@/lib/shellMobile';

/**
 * Acompanha o viewport com listener — nao le so na montagem.
 *
 * Ler uma vez e o bug classico: quem gira o aparelho, redimensiona a janela
 * ou abre a aba ja estreita fica com o shell errado ate dar refresh.
 */
export function useIsMobile(): boolean {
  const [ehMobile, setEhMobile] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(MEDIA_QUERY_MOBILE).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(MEDIA_QUERY_MOBILE);
    const aoMudar = (e: MediaQueryListEvent) => setEhMobile(e.matches);
    setEhMobile(mql.matches);
    mql.addEventListener('change', aoMudar);
    return () => mql.removeEventListener('change', aoMudar);
  }, []);

  return ehMobile;
}
```

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```

Esperado: sem erro.

- [ ] **Step 7: Commit**

```bash
git add src/lib/shellMobile.ts src/hooks/useIsMobile.ts tests/mobileShellDecisao.test.mjs
git -c user.name="Luciano" -c user.email="lucianoalf.la@gmail.com" commit -m "feat(mobile): decisao de shell com corte em 1023px e kill switch

O corte mora numa constante unica: iPad retrato entra no mobile, paisagem
fica no desktop. O kill switch vem antes de qualquer override — e o
rollback que nao depende de revert nem de deploy de codigo.

useIsMobile usa listener em vez de ler so na montagem: sem isso, quem
gira o aparelho fica com o shell errado ate dar refresh.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: MobileLayout e o contrato do Outlet context

A peça que mais pode quebrar coisa: se o shell mobile entregar um objeto de contexto diferente do desktop, **toda página quebra ao ser aberta no celular**, porque cada uma faz `useOutletContext()` esperando aquelas chaves.

**Files:**
- Create: `src/mobile/MobileLayout.tsx`
- Create: `src/mobile/MobileHeader.tsx`
- Test: `tests/mobileContratoOutletContext.test.mjs`

**Interfaces:**
- Consumes: `useIsMobile` (Task 3); `useUnidadeFiltro`, `useCompetenciaFiltro` (já existem)
- Produces:
  - `MobileLayout` — componente, entrega `{ filtroAtivo, unidadeSelecionada, setUnidadeSelecionada, competencia, setPeriodoLabel }` no `Outlet context`
  - `MobileHeader` — props `{ unidadeNome: string | null; onAbrirUnidades: () => void; iniciais: string }`. Sem prop `titulo`: ele lê o `PageTitleContext` por conta própria, como o `AppHeader` faz.

- [ ] **Step 1: Escrever o teste de contrato que falha**

Criar `tests/mobileContratoOutletContext.test.mjs`. Ele compara as chaves entregues pelos dois layouts:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ler = (p) => readFileSync(p, 'utf8');

/** Extrai as chaves de `context={{ ... }}` do JSX do Outlet. */
function chavesDoContexto(fonte, arquivo) {
  const m = fonte.match(/<Outlet\s+context=\{\{([\s\S]*?)\}\}/u);
  assert.ok(m, `${arquivo}: nao achei <Outlet context={{...}}>`);
  return m[1]
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (p.includes(':') ? p.slice(0, p.indexOf(':')) : p).trim())
    .sort();
}

test('o shell mobile entrega EXATAMENTE o mesmo contexto que o desktop', () => {
  const desktop = chavesDoContexto(ler('src/components/App/Layout/AppLayout.tsx'), 'AppLayout');
  const mobile = chavesDoContexto(ler('src/mobile/MobileLayout.tsx'), 'MobileLayout');

  assert.deepEqual(
    mobile,
    desktop,
    'divergir aqui quebra TODA pagina ao ser aberta no celular — cada uma faz useOutletContext() esperando estas chaves',
  );
  // Guarda contra o teste passar vazio dos dois lados.
  assert.ok(desktop.length >= 5, `esperava 5+ chaves, achei ${desktop.length}`);
});

test('o AppLayout do desktop segue intocado por este plano', () => {
  const desktop = ler('src/components/App/Layout/AppLayout.tsx');
  assert.match(desktop, /marginLeft: isSidebarCollapsed \? '96px' : '256px'/u);
  assert.doesNotMatch(desktop, /mobile/iu, 'AppLayout nao deve conhecer o shell mobile');
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
node --test tests/mobileContratoOutletContext.test.mjs
```

Esperado: FALHA — `ENOENT` em `src/mobile/MobileLayout.tsx`.

- [ ] **Step 3: Criar o cabeçalho**

Criar `src/mobile/MobileHeader.tsx`:

⚠️ O título vem do `PageTitleContext`, lido **dentro** do `MobileHeader` — igual ao
`AppHeader` do desktop ([AppHeader.tsx:21](src/components/App/Layout/AppHeader.tsx)).
Não pode ser lido no `MobileLayout`: é ele quem monta o `PageTitleProvider`, e um
componente não enxerga o provider que ele próprio renderiza.

```tsx
import { ChevronDown } from 'lucide-react';

import { usePageTitle } from '@/contexts/PageTitleContext';

interface Props {
  unidadeNome: string | null;
  onAbrirUnidades: () => void;
  iniciais: string;
}

/**
 * Cabecalho compacto (56px). O seletor de unidade fica sempre a vista:
 * sem ele, todo numero na tela e ambiguo entre as tres unidades.
 */
export function MobileHeader({ unidadeNome, onAbrirUnidades, iniciais }: Props) {
  const { pageTitle } = usePageTitle();
  const titulo = pageTitle?.titulo || 'LA Report';

  return (
    <header className="flex h-14 flex-none items-center gap-2 border-b border-slate-800 bg-slate-900 px-3">
      <h1 className="min-w-0 flex-1 truncate font-grotesk text-base font-bold text-slate-50">
        {titulo}
      </h1>

      <button
        type="button"
        onClick={onAbrirUnidades}
        className="flex flex-none items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
      >
        <span className="max-w-[92px] truncate">{unidadeNome ?? 'Consolidado'}</span>
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </button>

      <span
        className="grid h-7 w-7 flex-none place-items-center rounded-full bg-gradient-to-br from-purple-500 to-cyan-400 text-[10px] font-bold text-white"
        aria-hidden="true"
      >
        {iniciais}
      </span>
    </header>
  );
}

export default MobileHeader;
```

- [ ] **Step 4: Criar o MobileLayout**

Criar `src/mobile/MobileLayout.tsx`. ⚠️ **A ordem e os nomes das chaves do `context` têm que bater com `AppLayout.tsx` linha a linha** — abrir aquele arquivo e copiar:

```tsx
import { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { PageTitleProvider } from '@/contexts/PageTitleContext';
import { useCompetenciaFiltro } from '@/hooks/useCompetenciaFiltro';
import { useUnidadeFiltro } from '@/hooks/useUnidadeFiltro';
import { MobileHeader } from './MobileHeader';

function iniciaisDoNome(nome: string | null | undefined): string {
  if (!nome) return '?';
  const partes = nome.trim().split(/\s+/u);
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase() || '?';
}

export function MobileLayout() {
  const { unidadeSelecionada, setUnidadeSelecionada, filtroAtivo, unidadesDisponiveis } = useUnidadeFiltro();
  const competencia = useCompetenciaFiltro();
  const { usuario } = useAuth();

  const [periodoLabelOverride, setPeriodoLabelOverride] = useState<string | null>(null);
  const setPeriodoLabel = useCallback((label: string | null) => setPeriodoLabelOverride(label), []);

  const unidadeNome =
    unidadesDisponiveis.find((u) => u.id === unidadeSelecionada)?.nome ?? null;

  return (
    <PageTitleProvider>
      <div className="flex h-[100dvh] flex-col bg-slate-950">
        <MobileHeader
          unidadeNome={unidadeNome}
          onAbrirUnidades={() => { /* Task 6 liga a folha de unidades */ }}
          iniciais={iniciaisDoNome(usuario?.nome ?? usuario?.email ?? null)}
        />

        <main className="min-h-0 flex-1 overflow-y-auto p-3">
          <Outlet context={{ filtroAtivo, unidadeSelecionada, setUnidadeSelecionada, competencia, setPeriodoLabel }} />
        </main>
      </div>
    </PageTitleProvider>
  );
}

export default MobileLayout;
```

⚠️ `h-[100dvh]` e não `h-screen`: no Safari do iPhone, `100vh` é maior que a área visível e empurra a barra inferior para fora da tela.

⚠️ Conferir em `AuthContext` os nomes reais dos campos do `usuario` (`nome`? `email`?) antes de rodar — ajustar se divergir.

- [ ] **Step 5: Rodar teste e typecheck**

```bash
node --test tests/mobileContratoOutletContext.test.mjs
npx tsc --noEmit
```

Esperado: os dois PASSAM. Se o teste de contexto falhar apontando chaves diferentes, **corrigir o MobileLayout** — nunca o AppLayout.

- [ ] **Step 6: Commit**

```bash
git add src/mobile/MobileLayout.tsx src/mobile/MobileHeader.tsx tests/mobileContratoOutletContext.test.mjs
git -c user.name="Luciano" -c user.email="lucianoalf.la@gmail.com" commit -m "feat(mobile): MobileLayout com o mesmo contrato de Outlet do desktop

Divergir nas chaves do context quebraria TODA pagina ao ser aberta no
celular — por isso virou teste, comparando as chaves dos dois layouts.
O teste tambem trava que o AppLayout nao foi tocado.

h-[100dvh] e nao h-screen: no Safari do iPhone, 100vh e maior que a area
visivel e empurraria a barra inferior para fora da tela.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Barra inferior

**Files:**
- Create: `src/mobile/MobileBottomNav.tsx`
- Modify: `src/mobile/MobileLayout.tsx` (montar a barra abaixo do `<main>`)
- Test: `tests/mobileBarraInferior.test.mjs`

**Interfaces:**
- Consumes: `MENU_PRINCIPAL`, `MENU_OPERACIONAL`, `ROTAS_BARRA_INFERIOR`, `ItemMenu` (Task 2)
- Produces: `MobileBottomNav` — props `{ onAbrirMais: () => void }`

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/mobileBarraInferior.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const nav = readFileSync('src/mobile/MobileBottomNav.tsx', 'utf8');

test('reserva a safe-area do iPhone', () => {
  // Sem isto a barra fica atras do traco de home. Nao e coisa de PWA, e do aparelho.
  assert.match(nav, /env\(safe-area-inset-bottom\)/u);
});

test('monta os destinos a partir da fonte unica, sem lista propria', () => {
  assert.match(nav, /ROTAS_BARRA_INFERIOR/u);
  assert.doesNotMatch(nav, /path: '\/app\/alunos'/u, 'a barra nao declara itens — le de menuItems');
});

test('ciano marca navegacao ativa', () => {
  assert.match(nav, /isActive[\s\S]{0,200}cyan-400/u);
});

test('alvo de toque tem no minimo 44px de altura', () => {
  // Diretriz iOS e WCAG. Abaixo disso a barra erra o dedo.
  assert.match(nav, /min-h-\[44px\]/u);
});

test('o botao Mais existe e nao e um NavLink', () => {
  // "Mais" abre uma folha, nao navega — se virar rota, o voltar do celular quebra.
  assert.match(nav, /onAbrirMais/u);
  assert.match(nav, /<button[\s\S]{0,400}onAbrirMais/u);
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
node --test tests/mobileBarraInferior.test.mjs
```

Esperado: FALHA — `ENOENT`.

- [ ] **Step 3: Implementar**

Criar `src/mobile/MobileBottomNav.tsx`:

```tsx
import { MoreHorizontal } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { MENU_OPERACIONAL, MENU_PRINCIPAL, ROTAS_BARRA_INFERIOR, type ItemMenu } from '@/lib/menuItems';

const TODOS: ItemMenu[] = [...MENU_PRINCIPAL, ...MENU_OPERACIONAL];

/** Os 4 destinos fixos, na ordem declarada na fonte unica. */
const DESTINOS: ItemMenu[] = ROTAS_BARRA_INFERIOR
  .map((path) => TODOS.find((i) => i.path === path))
  .filter((i): i is ItemMenu => Boolean(i));

interface Props {
  onAbrirMais: () => void;
}

export function MobileBottomNav({ onAbrirMais }: Props) {
  return (
    <nav
      className="grid flex-none grid-cols-5 border-t border-slate-800 bg-slate-900 px-1 pt-1.5"
      style={{ paddingBottom: 'calc(0.375rem + env(safe-area-inset-bottom))' }}
      aria-label="Navegação principal"
    >
      {DESTINOS.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            className={({ isActive }) =>
              `flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                isActive ? 'text-cyan-400' : 'text-slate-500'
              }`
            }
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span className="text-[9.5px] font-medium leading-none">
              {item.labelCurto ?? item.label}
            </span>
          </NavLink>
        );
      })}

      <button
        type="button"
        onClick={onAbrirMais}
        className="flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
        <span className="text-[9.5px] font-medium leading-none">Mais</span>
      </button>
    </nav>
  );
}

export default MobileBottomNav;
```

- [ ] **Step 4: Montar no layout**

Em `src/mobile/MobileLayout.tsx`: importar `MobileBottomNav`, criar o estado `const [maisAberto, setMaisAberto] = useState(false);` e inserir **depois** do `</main>`:

```tsx
<MobileBottomNav onAbrirMais={() => setMaisAberto(true)} />
```

- [ ] **Step 5: Rodar teste e typecheck**

```bash
node --test tests/mobileBarraInferior.test.mjs
npx tsc --noEmit
```

Esperado: PASSAM (5 casos).

- [ ] **Step 6: Commit**

```bash
git add src/mobile/MobileBottomNav.tsx src/mobile/MobileLayout.tsx tests/mobileBarraInferior.test.mjs
git -c user.name="Luciano" -c user.email="lucianoalf.la@gmail.com" commit -m "feat(mobile): barra inferior com os 4 destinos aprovados

Inicio, Alunos, Agenda, Administrativo — lidos da fonte unica, sem lista
propria. 'Mais' e botao, nao rota: virar rota quebraria o voltar do
celular.

safe-area-inset-bottom e alvo de 44px sao requisito de aparelho, nao
enfeite.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Folha "Mais" com os 18 módulos

**Files:**
- Create: `src/mobile/MobileMaisSheet.tsx`
- Modify: `src/mobile/MobileLayout.tsx` (montar a folha)
- Test: `tests/mobileMaisSheet.test.mjs`

**Interfaces:**
- Consumes: `filtrarVisiveis`, `ContextoVisibilidade` (Task 1); `MENU_PRINCIPAL`, `MENU_OPERACIONAL` (Task 2)
- Produces: `MobileMaisSheet` — props `{ aberto: boolean; onFechar: () => void }`

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/mobileMaisSheet.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sheet = readFileSync('src/mobile/MobileMaisSheet.tsx', 'utf8');

test('usa a regra unica de visibilidade, nao reimplementa', () => {
  assert.match(sheet, /filtrarVisiveis/u);
  assert.doesNotMatch(sheet, /visibilidade_global/u, 'a consulta de flag nao mora aqui');
});

test('mantem os dois grupos da sidebar', () => {
  assert.match(sheet, /MENU_PRINCIPAL/u);
  assert.match(sheet, /MENU_OPERACIONAL/u);
  assert.match(sheet, /Principal/u);
  assert.match(sheet, /Operacional/u);
});

test('grade de 4 colunas e safe-area', () => {
  assert.match(sheet, /grid-cols-4/u);
  assert.match(sheet, /env\(safe-area-inset-bottom\)/u);
});

test('fecha no Esc e tem rotulo de dialogo', () => {
  assert.match(sheet, /'Escape'/u);
  assert.match(sheet, /role="dialog"/u);
  assert.match(sheet, /aria-modal/u);
});

test('navegar fecha a folha', () => {
  // Sem isto a folha fica por cima da tela nova.
  assert.match(sheet, /onClick=\{onFechar\}/u);
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
node --test tests/mobileMaisSheet.test.mjs
```

Esperado: FALHA — `ENOENT`.

- [ ] **Step 3: Implementar**

Criar `src/mobile/MobileMaisSheet.tsx`:

```tsx
import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { MENU_OPERACIONAL, MENU_PRINCIPAL, type ItemMenu } from '@/lib/menuItems';
import { filtrarVisiveis, type ContextoVisibilidade } from '@/lib/menuVisibilidade';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  /** as flags vem de quem ja as consulta — a folha nao vai ao banco */
  contexto: ContextoVisibilidade;
}

function Grupo({ titulo, itens, onFechar }: { titulo: string; itens: ItemMenu[]; onFechar: () => void }) {
  if (itens.length === 0) return null;
  return (
    <>
      <h3 className="mb-2 mt-3 text-[9.5px] font-bold uppercase tracking-widest text-slate-500">
        {titulo}
      </h3>
      <div className="grid grid-cols-4 gap-x-1 gap-y-2.5">
        {itens.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              onClick={onFechar}
              className="flex flex-col items-center gap-1 rounded-lg py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-slate-700 bg-slate-800">
                <Icon className="h-[17px] w-[17px] text-slate-400" aria-hidden="true" />
              </span>
              <span className="max-w-full text-center text-[8.5px] font-medium leading-tight text-slate-400">
                {item.labelCurto ?? item.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </>
  );
}

export function MobileMaisSheet({ aberto, onFechar, contexto }: Props) {
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto, onFechar]);

  if (!aberto) return null;

  const principal = filtrarVisiveis(MENU_PRINCIPAL, contexto);
  const operacional = filtrarVisiveis(MENU_OPERACIONAL, contexto);

  return (
    <>
      <button
        type="button"
        aria-label="Fechar menu"
        onClick={onFechar}
        className="fixed inset-0 z-40 bg-slate-950/70"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Todos os módulos"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[84%] overflow-y-auto rounded-t-2xl border-t border-slate-800 bg-slate-900 px-3 pt-2"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-slate-700" aria-hidden="true" />
        <h2 className="font-grotesk text-sm font-bold text-slate-50">Todos os módulos</h2>
        <p className="text-[10.5px] text-slate-500">O que você abre direto fica na barra de baixo</p>

        <Grupo titulo="Principal" itens={principal} onFechar={onFechar} />
        <Grupo titulo="Operacional" itens={operacional} onFechar={onFechar} />
      </div>
    </>
  );
}

export default MobileMaisSheet;
```

- [ ] **Step 4: Montar no layout e alimentar o contexto de visibilidade**

Em `src/mobile/MobileLayout.tsx`:

1. Importar `MobileMaisSheet` e `useBadgeAutomacoes` não é necessário aqui.
2. Resolver as flags do mesmo jeito que a sidebar faz hoje — copiar de `AppSidebar.tsx` o `useEffect` que lê `campanhas_config.visibilidade_global` e a constante `TRAFEGO_PAGO_EMAILS`:

```tsx
const TRAFEGO_PAGO_EMAILS = ['hugo@gmail.com', 'lucianoalf.la@gmail.com'];
const DEV_EMAIL = 'hugo@lamusic.com.br';

const [campanhasVisivel, setCampanhasVisivel] = useState(false);
useEffect(() => {
  const isDev = usuario?.email === DEV_EMAIL;
  supabase.from('campanhas_config').select('visibilidade_global').single()
    .then(({ data }) => setCampanhasVisivel(isDev || data?.visibilidade_global === true));
}, [usuario?.email]);

const contextoVisibilidade = {
  isAdmin,
  campanhasVisivel,
  trafegoPagoVisivel: TRAFEGO_PAGO_EMAILS.includes((usuario?.email ?? '').toLowerCase()),
};
```

3. Renderizar depois da barra:

```tsx
<MobileMaisSheet aberto={maisAberto} onFechar={() => setMaisAberto(false)} contexto={contextoVisibilidade} />
```

⚠️ `isAdmin` vem de `useAuth()` — acrescentar à desestruturação existente.

📌 **Pendência consciente:** a lista de e-mails e a consulta de flag ficam duplicadas entre `AppSidebar` e `MobileLayout` nesta etapa. Unificá-las num `useMenuVisibilidade()` é trabalho da etapa 2 — anotar em LAPE-32 ao concluir esta tarefa.

- [ ] **Step 5: Rodar teste e typecheck**

```bash
node --test tests/mobileMaisSheet.test.mjs
npx tsc --noEmit
```

Esperado: PASSAM (5 casos).

- [ ] **Step 6: Commit**

```bash
git add src/mobile/MobileMaisSheet.tsx src/mobile/MobileLayout.tsx tests/mobileMaisSheet.test.mjs
git -c user.name="Luciano" -c user.email="lucianoalf.la@gmail.com" commit -m "feat(mobile): folha Mais com os 18 modulos

Grade de 4 colunas nos mesmos grupos da sidebar, para quem conhece o
desktop nao reaprender nada. Visibilidade pela regra unica: Campanhas,
Trafego Pago e Automacoes respeitam o que ja valia.

Navegar fecha a folha — senao ela fica por cima da tela nova.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Bifurcação no router

Só agora o shell mobile entra em produção. Até aqui nada do que foi construído é alcançável — de propósito: cada peça foi testada isolada antes de ser ligada.

**Files:**
- Create: `src/components/App/Layout/ResponsiveLayout.tsx`
- Modify: `src/components/App/Layout/index.ts`
- Modify: `src/router.tsx` (uma linha)
- Test: `tests/mobileBifurcacaoRouter.test.mjs`

**Interfaces:**
- Consumes: `useIsMobile`, `resolverShell` (Task 3); `MobileLayout` (Task 4)
- Produces: `ResponsiveLayout` — componente sem props

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/mobileBifurcacaoRouter.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ler = (p) => readFileSync(p, 'utf8');
const responsive = ler('src/components/App/Layout/ResponsiveLayout.tsx');
const router = ler('src/router.tsx');

test('o router monta o ResponsiveLayout, nao mais o AppLayout direto', () => {
  assert.match(router, /<ResponsiveLayout \/>/u);
  assert.doesNotMatch(router, /element: <AppLayout \/>/u);
});

test('a bifurcacao usa a decisao pura, sem reimplementar o corte', () => {
  assert.match(responsive, /resolverShell/u);
  assert.match(responsive, /useIsMobile/u);
  assert.doesNotMatch(responsive, /1023/u, 'o corte mora em shellMobile.ts, nao aqui');
});

test('o kill switch e o override ALIMENTAM resolverShell, nao ficam soltos', () => {
  // Casar so a string deixaria o teste verde com a env citada num comentario.
  assert.match(responsive, /flagDesligada[\s\S]{0,90}VITE_MOBILE_SHELL/u);
  assert.match(responsive, /getItem\('shell-override'\)/u);
  assert.match(responsive, /resolverShell\(\{[\s\S]{0,220}flagDesligada[\s\S]{0,220}override/u);
});

test('a bifurcacao RENDERIZA os dois shells conforme a decisao', () => {
  // Nao basta o nome aparecer no arquivo: um import solto passaria, e o
  // teste diria "os dois shells existem" com a bifurcacao quebrada.
  assert.match(responsive, /shell === 'mobile'\s*\?\s*<MobileLayout \/>\s*:\s*<AppLayout \/>/u);
});
```

⚠️ Estes dois testes foram endurecidos depois que o mesmo padrão de asserção frouxa foi reprovado nas tarefas 5 e 6: casar uma string que aparece em qualquer lugar do arquivo não prova comportamento. O critério é o de sempre — **quebrar o comportamento tem que fazer o teste falhar**.

- [ ] **Step 2: Rodar e ver falhar**

```bash
node --test tests/mobileBifurcacaoRouter.test.mjs
```

Esperado: FALHA — `ENOENT` em `ResponsiveLayout.tsx`.

- [ ] **Step 3: Implementar a bifurcação**

Criar `src/components/App/Layout/ResponsiveLayout.tsx`:

```tsx
import { useIsMobile } from '@/hooks/useIsMobile';
import { resolverShell } from '@/lib/shellMobile';
import { MobileLayout } from '@/mobile/MobileLayout';
import { AppLayout } from './AppLayout';

/**
 * Unico ponto onde se decide qual shell renderizar.
 *
 * O AppLayout nao sabe que isto existe — e o que mantem o desktop intocado.
 */
export function ResponsiveLayout() {
  const ehMobile = useIsMobile();

  const flagDesligada = import.meta.env.VITE_MOBILE_SHELL === 'off';

  let override: string | null = null;
  try {
    override = localStorage.getItem('shell-override');
  } catch {
    // Navegador com storage bloqueado (aba anonima, cookies barrados).
    // Sem override e o comportamento normal — nao e erro.
    override = null;
  }

  const shell = resolverShell({ larguraMobile: ehMobile, flagDesligada, override });

  return shell === 'mobile' ? <MobileLayout /> : <AppLayout />;
}

export default ResponsiveLayout;
```

- [ ] **Step 4: Exportar e ligar no router**

Em `src/components/App/Layout/index.ts`, acrescentar:

```ts
export { ResponsiveLayout } from './ResponsiveLayout';
```

Em `src/router.tsx`:

1. Trocar o import `import { AppLayout } from './components/App/Layout';` por
   `import { ResponsiveLayout } from './components/App/Layout';`
2. Trocar `element: <AppLayout />,` por `element: <ResponsiveLayout />,` (uma ocorrência, dentro de `path: '/app'`).

- [ ] **Step 5: Ligar os testes do mobile ao `npm test`**

⚠️ Os 6 arquivos de teste criados nesta etapa **não estão no script `test` do `package.json`** — então `npm test` não os executa, e o Step 6 abaixo seria uma verificação vazia quanto a este trabalho. É o mesmo defeito que o `CLAUDE.md` já registra: `tests/agradecimentoEvasao.test.mjs` ficou fora do `npm test` e seus 19 testes nunca rodaram no fluxo normal.

Acrescentar ao final da lista de arquivos do script `"test"` em `package.json`:

```
tests/mobileMenuVisibilidade.test.mjs tests/mobileMenuFonteUnica.test.mjs tests/mobileShellDecisao.test.mjs tests/mobileContratoOutletContext.test.mjs tests/mobileBarraInferior.test.mjs tests/mobileMaisSheet.test.mjs
```

⚠️ `tests/mobileAvisoNaoOtimizado.test.mjs` entra na Task 8, que é quem o cria.

- [ ] **Step 6: Rodar a suíte toda e o typecheck**

```bash
node --test tests/mobileBifurcacaoRouter.test.mjs
npx tsc --noEmit
npm test
```

Esperado: os testes novos passam e **a suíte existente continua verde**. Se `npm test` falhar em algo alheio ao mobile, conferir se já falhava antes (`git stash` + rodar + `git stash pop`) antes de sair consertando.

- [ ] **Step 6: Ver funcionando nos dois tamanhos**

```bash
npm run dev
```

1. `http://localhost:5175/app` numa janela larga → **sidebar do desktop**, idêntica a antes.
2. Estreitar a janela abaixo de 1024px **sem recarregar** → troca para o shell mobile na hora. Isso prova que o listener funciona.
3. Voltar a alargar → volta para o desktop.
4. No DevTools, `localStorage.setItem('shell-override','mobile')` e recarregar → shell mobile mesmo numa janela larga.
5. Limpar com `localStorage.removeItem('shell-override')`.

- [ ] **Step 7: Commit**

```bash
git add src/components/App/Layout/ResponsiveLayout.tsx src/components/App/Layout/index.ts src/router.tsx tests/mobileBifurcacaoRouter.test.mjs
git -c user.name="Luciano" -c user.email="lucianoalf.la@gmail.com" commit -m "feat(mobile): ligar o shell mobile pelo ResponsiveLayout

router.tsx troca uma linha; o AppLayout segue sem saber que existe shell
mobile — e o que mantem o desktop intocado.

Kill switch por VITE_MOBILE_SHELL=off (rollback sem revert) e override
por localStorage para testar no proprio aparelho. Leitura do storage em
try/catch: aba anonima nao pode virar tela branca.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Faixa "tela ainda não adaptada"

Com o shell ligado, os 17 módulos ainda não portados renderizam dentro dele. Eles funcionam (rolam para o lado), mas nada explica por que estão diferentes das telas adaptadas.

**Files:**
- Create: `src/mobile/rotasPortadas.ts`
- Create: `src/mobile/AvisoNaoOtimizado.tsx`
- Modify: `src/mobile/MobileLayout.tsx`
- Test: `tests/mobileAvisoNaoOtimizado.test.mjs`

**Interfaces:**
- Consumes: nada de tarefas anteriores
- Produces:
  - `const ROTAS_PORTADAS: readonly string[]` — vazio nesta etapa
  - `rotaFoiPortada(pathname: string, portadas?: readonly string[]): boolean`
  - `AvisoNaoOtimizado` — componente sem props

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/mobileAvisoNaoOtimizado.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { rotaFoiPortada } from '../src/mobile/rotasPortadas.ts';

test('rotaFoiPortada', async (t) => {
  await t.test('rota nao listada nao foi portada', () => {
    assert.equal(rotaFoiPortada('/app/comercial', []), false);
  });

  await t.test('casa a rota exata', () => {
    assert.equal(rotaFoiPortada('/app/agenda', ['/app/agenda']), true);
  });

  await t.test('sub-rota herda o estado da rota portada', () => {
    // /app/campanhas/123 e a mesma tela de /app/campanhas.
    assert.equal(rotaFoiPortada('/app/campanhas/42', ['/app/campanhas']), true);
  });

  await t.test('nao casa por prefixo de texto solto', () => {
    // '/app/alunos-arquivados' NAO e sub-rota de '/app/alunos'.
    assert.equal(rotaFoiPortada('/app/alunos-arquivados', ['/app/alunos']), false);
  });

  await t.test('a raiz /app so casa com ela mesma', () => {
    assert.equal(rotaFoiPortada('/app', ['/app']), true);
    assert.equal(rotaFoiPortada('/app/alunos', ['/app']), false);
  });
});

test('nesta etapa nenhuma rota foi portada ainda', () => {
  const fonte = readFileSync('src/mobile/rotasPortadas.ts', 'utf8');
  assert.match(fonte, /ROTAS_PORTADAS[^=]*=\s*\[\s*\]/u, 'a etapa 1 entrega o shell, nenhuma tela');
});

test('a faixa avisa sem bloquear', () => {
  const aviso = readFileSync('src/mobile/AvisoNaoOtimizado.tsx', 'utf8');
  assert.match(aviso, /ainda não adaptada/u);
  // Bloquear tiraria acesso que a equipe tem hoje em 17 modulos de uma vez.
  assert.doesNotMatch(aviso, /abra no computador/iu);
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
node --test tests/mobileAvisoNaoOtimizado.test.mjs
```

Esperado: FALHA — módulo não encontrado.

- [ ] **Step 3: Implementar**

Criar `src/mobile/rotasPortadas.ts`:

```ts
/**
 * Rotas que ja ganharam tela mobile propria.
 *
 * Cresce uma linha por modulo portado. Enquanto a rota nao esta aqui, o
 * shell mostra a tela do desktop com a faixa de aviso — degradar, nunca
 * bloquear: a equipe usa tudo, todo dia, e hoje essas telas ja abrem.
 */
export const ROTAS_PORTADAS: readonly string[] = [];

/** A raiz do app e a rota index (Dashboard) — suas "sub-rotas" sao outros modulos. */
const RAIZ_APP = '/app';

export function rotaFoiPortada(pathname: string, portadas: readonly string[] = ROTAS_PORTADAS): boolean {
  return portadas.some((rota) => {
    if (pathname === rota) return true;
    // Portar o Dashboard nao pode apagar a faixa de Alunos, Agenda e mais 15.
    if (rota === RAIZ_APP) return false;
    return pathname.startsWith(`${rota}/`);
  });
}
```

Criar `src/mobile/AvisoNaoOtimizado.tsx`:

```tsx
import { Flag } from 'lucide-react';

/**
 * Faixa de degradacao. Some sozinha quando a rota entra em ROTAS_PORTADAS,
 * e serve de lista de pendencias visivel para quem usa.
 */
export function AvisoNaoOtimizado() {
  return (
    <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2">
      <Flag className="h-3.5 w-3.5 flex-none text-amber-400" aria-hidden="true" />
      <p className="text-[10.5px] leading-snug text-amber-400">
        <strong className="font-semibold text-slate-50">Tela ainda não adaptada.</strong>{' '}
        Funciona, mas rola para o lado.
      </p>
    </div>
  );
}

export default AvisoNaoOtimizado;
```

- [ ] **Step 4: Montar no layout**

Em `src/mobile/MobileLayout.tsx`, importar `useLocation` de `react-router-dom`, `rotaFoiPortada` e `AvisoNaoOtimizado`, e dentro do `<main>`, antes do `<Outlet>`:

```tsx
{!rotaFoiPortada(location.pathname) && <AvisoNaoOtimizado />}
```

com `const location = useLocation();` junto dos outros hooks.

⚠️ O `<main>` precisa de `overflow-x-auto` para a tela larga rolar para o lado sem empurrar o `body`. Conferir que a classe está lá.

- [ ] **Step 5: Rodar teste e typecheck**

```bash
node --test tests/mobileAvisoNaoOtimizado.test.mjs
npx tsc --noEmit
```

Esperado: PASSAM (7 casos).

- [ ] **Step 6: Commit**

```bash
git add src/mobile/rotasPortadas.ts src/mobile/AvisoNaoOtimizado.tsx src/mobile/MobileLayout.tsx tests/mobileAvisoNaoOtimizado.test.mjs
git -c user.name="Luciano" -c user.email="lucianoalf.la@gmail.com" commit -m "feat(mobile): faixa de tela ainda nao adaptada

Degradar, nao bloquear: a equipe usa tudo todo dia e essas telas ja abrem
hoje. Bloquear tiraria acesso em 17 modulos de uma vez.

rotaFoiPortada casa a rota exata e sub-rotas, mas nao prefixo de texto
solto — /app/alunos-arquivados nao e sub-rota de /app/alunos.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Verificação no aparelho de verdade

Os testes deste repo são de contrato de fonte — **nenhum renderiza nada**. Esta tarefa é a única prova de que o shell funciona, e não pode ser pulada.

**Files:** nenhum (verificação)

- [ ] **Step 1: Subir o dev server acessível na rede**

```bash
npm run dev
```

O `vite.config.ts` já tem `host: '0.0.0.0'`. Descobrir o IP da máquina:

```bash
ipconfig | grep -A2 "Wi-Fi" | grep IPv4
```

- [ ] **Step 2: Abrir no celular, na mesma Wi-Fi**

`http://<ip>:5175/app`

⚠️ Não vai instalar nem registrar service worker — IP local não é secure context, e a fase 1 não tem PWA de qualquer forma. O que se testa aqui é layout, toque e rolagem.

- [ ] **Step 3: Percorrer a lista**

- [ ] Barra inferior visível, **acima** do traço de home do iPhone (prova do `safe-area-inset`)
- [ ] Os 4 destinos navegam e o ativo fica ciano
- [ ] "Mais" abre a folha; os 18 módulos aparecem nos dois grupos
- [ ] Tocar num módulo navega **e fecha a folha**
- [ ] Tocar no fundo escuro fecha sem navegar
- [ ] Seletor de unidade visível no cabeçalho, com o nome truncado sem quebrar a linha
- [ ] Faixa âmbar aparece em todas as rotas (nenhuma foi portada ainda)
- [ ] Tela larga (ex.: Comercial) rola **para o lado**, e a página não rola de lado junto
- [ ] Girar o aparelho para paisagem não quebra o layout
- [ ] Nenhum módulo restrito aparece para quem não deve vê-lo — conferir com um login não-admin

- [ ] **Step 4: Conferir o desktop uma última vez**

Na máquina, janela larga: sidebar igual à de antes, 18 itens, colapsar/expandir, badge de Campanhas. **Se algo mudou aqui, é regressão** — o desktop tinha que ficar idêntico.

- [ ] **Step 5: Registrar o resultado**

Anotar em LAPE-32 o que passou e o que não passou, com o modelo de aparelho testado. Item que falhou vira tarefa da etapa 2 — não se conserta fora do plano.

---

## Self-Review

**Cobertura da spec:**

| Seção da spec | Tarefa |
|---|---|
| §3 shell paralelo + `ResponsiveLayout` | 7 |
| §3 detecção de viewport com listener | 3 |
| §4 contrato do `Outlet context` | 4 |
| §5 barra inferior aprovada | 5 |
| §5 "Mais" com 18 módulos e visibilidade | 1, 2, 6 |
| §5 fonte única do menu | 2 |
| §5 `safe-area-inset` | 5, 6, 9 |
| §6 vocabulário visual (ciano só navegação) | 5 |
| §8 degradar, não bloquear | 8 |
| §10 kill switch | 3, 7 |
| §11 teste no aparelho | 9 |

**Fora desta etapa, por desenho:** §7 (os 6 arquétipos) é a etapa 2 em diante — esta entrega o shell, nenhuma tela. §2 fase 2 (PWA) não entra.

**Pendências conscientes anotadas no plano:**
- Task 6 duplica a lista de e-mails do Tráfego Pago e a consulta de `campanhas_config` entre `AppSidebar` e `MobileLayout`. Unificar num `useMenuVisibilidade()` é etapa 2.
- O seletor de unidade do cabeçalho tem `onAbrirUnidades` sem folha nesta etapa (Task 4) — a folha de unidades entra junto com o Dashboard, que é a primeira tela que precisa trocar de unidade para valer.
