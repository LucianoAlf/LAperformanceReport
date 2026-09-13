# Dashboard mobile — etapa 2 do LA Report mobile

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** portar o Dashboard (`/app`, rota index) para o shell mobile, na mesma ordem de seções do desktop, reusando os dados e os componentes que já existem.

**Architecture:** a lógica de busca do `DashboardPage` (estados, fetches, derivações — linhas 138–742) sai para `useDashboardDados()`. Desktop e mobile passam a consumir o mesmo hook, com os mesmos nomes de variável, então o JSX do desktop fica byte a byte intocado. A tela mobile é um arquivo novo em `src/mobile/telas/`, escolhida na própria rota por um `DashboardResponsivo` — assim ela nasce dentro do `<Outlet />` e enxerga o contexto de unidade e competência que o shell entrega.

**Tech Stack:** React 19, React Router 7, TypeScript 5.8, Tailwind (CDN), Recharts (via `EvolutionChart`/`FunnelChart`), testes `node --test` sobre contrato de fonte.

**Spec:** [`docs/superpowers/specs/2026-09-12-versao-mobile-la-report-design.md`](../specs/2026-09-12-versao-mobile-la-report-design.md) — arquétipo 6 (Gráfico), §7.

**Plano anterior (etapa 1, concluída):** [`2026-09-12-mobile-etapa1-menu-shell.md`](2026-09-12-mobile-etapa1-menu-shell.md)

## Global Constraints

- **O desktop não muda de comportamento.** `AppLayout.tsx` não é editado. O JSX do `DashboardPage` (hoje das linhas 744 a 1379) não ganha nem perde um caractere — a extração move só o que está acima do `return (`.
- **Fonte única de dados:** nenhuma consulta ao Supabase é reescrita. A tela mobile lê `useDashboardDados()`; reimplementar um KPI no mobile é o defeito que este plano existe para evitar.
- **Ordem das seções = ordem do desktop** (decisão do Hugo, 12/09): período → Gestão → Comercial → Professores → Alertas → Gráficos → Por unidade.
- **Ciano é exclusivo de CONTROLES** — navegação, filtro, abas (spec §6). A cor de ícone dentro
  de cartão de KPI não é controle: os `variant` vêm copiados verbatim do desktop, `cyan` incluso,
  para a mesma métrica não mudar de cor entre as duas telas.
- **Alvo de toque ≥ 44px** em tudo que é clicável.
- **Nada de PWA:** sem manifest, sem service worker, sem prompt de instalação.
- **Branch `feat/versao-mobile`, local.** Sem push, sem merge na main.
- Todo arquivo de teste novo entra no script `test` do `package.json` no mesmo commit.

---

### Task 1: Extrair `useDashboardDados`

**Files:**
- Create: `src/hooks/useDashboardDados.ts`
- Modify: `src/components/App/Dashboard/DashboardPage.tsx` (só acima do `return (`)
- Test: `tests/dashboardDadosContrato.test.mjs`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `useDashboardDados(): DashboardDados` — objeto com **exatamente** estas chaves, com os mesmos nomes que o JSX do desktop já usa:
  `loading, alertas, dadosGestao, fonteKpisAlunos, dadosComercial, dadosProfessores, evolucaoAlunos, funilComercial, resumoUnidades, metas, labelPeriodo, unidade, competencia, anosDisponiveis, setTipo, setAno, setMes, setTrimestre, setSemestre, setDataInicio, setDataFim, leadsComercialV2, loadingLeadsComercialV2, errorLeadsComercialV2, healthScoreV3Enabled, healthScoreV3Loading, healthScoreV3Period, healthScoreV3Summary, taxaExpMatLiberada, taxaExpMatSemBase, modalMatriculas, setModalMatriculas, modalEvasoes, setModalEvasoes, modalExperimentais, setModalExperimentais, modalConversao, setModalConversao, dadosModalMatriculas, dadosModalEvasoes, dadosModalExperimentais, dadosModalConversao, carregandoModal, fetchMatriculas, fetchEvasoes, fetchExperimentais, fetchConversao`

- [ ] **Step 1: Escrever o teste de contrato (falha)**

`tests/dashboardDadosContrato.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hook = readFileSync(new URL('../src/hooks/useDashboardDados.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/components/App/Dashboard/DashboardPage.tsx', import.meta.url), 'utf8');

// As chaves que o JSX do desktop consome. Se o hook parar de devolver
// qualquer uma, a tela quebra em runtime — aqui quebra no teste.
const CHAVES = [
  'loading', 'alertas', 'dadosGestao', 'fonteKpisAlunos', 'dadosComercial',
  'dadosProfessores', 'evolucaoAlunos', 'funilComercial', 'resumoUnidades',
  'metas', 'labelPeriodo', 'unidade', 'competencia', 'anosDisponiveis',
  'setTipo', 'setAno', 'setMes', 'setTrimestre', 'setSemestre',
  'setDataInicio', 'setDataFim', 'leadsComercialV2', 'loadingLeadsComercialV2',
  'errorLeadsComercialV2', 'healthScoreV3Enabled', 'healthScoreV3Loading',
  'healthScoreV3Period', 'healthScoreV3Summary', 'taxaExpMatLiberada',
  'taxaExpMatSemBase', 'modalMatriculas', 'setModalMatriculas', 'modalEvasoes',
  'setModalEvasoes', 'modalExperimentais', 'setModalExperimentais',
  'modalConversao', 'setModalConversao', 'dadosModalMatriculas',
  'dadosModalEvasoes', 'dadosModalExperimentais', 'dadosModalConversao',
  'carregandoModal', 'fetchMatriculas', 'fetchEvasoes', 'fetchExperimentais',
  'fetchConversao',
];

test('o hook declara a interface DashboardDados com todas as chaves do JSX', () => {
  const bloco = hook.match(/export interface DashboardDados \{([\s\S]*?)\n\}/);
  assert.ok(bloco, 'faltou `export interface DashboardDados`');
  for (const chave of CHAVES) {
    assert.match(bloco[1], new RegExp(`\\n\\s*${chave}[?:]`), `interface sem a chave ${chave}`);
  }
});

test('o DashboardPage consome o hook em vez de buscar por conta propria', () => {
  assert.match(page, /useDashboardDados\(\)/, 'a pagina nao chama o hook');
  // A busca saiu da pagina: nenhum fetch/consulta pode ter ficado para tras.
  assert.doesNotMatch(page, /supabase\s*\n?\s*\.from\(/, 'sobrou consulta ao Supabase na pagina');
  assert.doesNotMatch(page, /\buseEffect\(/, 'sobrou useEffect na pagina');
});

test('o JSX do desktop nao foi reescrito: as 13 chamadas de KPICard continuam la', () => {
  const kpis = page.match(/<KPICard\b/g) ?? [];
  assert.equal(kpis.length, 13, `esperava 13 KPICard, achei ${kpis.length}`);
  // Rotulos que provam que os KPIs sao os mesmos, nao "equivalentes".
  for (const rotulo of ['Pagantes', 'Ticket Médio Parcelas', 'Taxa Exp→Mat',
                        'Ticket Médio Passaporte', 'Média Alunos/Turma']) {
    assert.ok(page.includes(rotulo), `sumiu o KPI "${rotulo}" do desktop`);
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

`node --test tests/dashboardDadosContrato.test.mjs`
Esperado: FAIL — `useDashboardDados.ts` não existe.

- [ ] **Step 3: Mover a lógica**

Esta etapa é **mover, não reescrever**. Recorte do `DashboardPage.tsx`:

1. Mova para `src/hooks/useDashboardDados.ts` — **todos com `export`**, porque as Tasks 4 e 5 os
   importam — os `interface`/`type` locais (`DadosGestao`, `DadosComercial`, `DadosProfessores`,
   `ResumoUnidade`, `Alerta`, `FonteKPIAlunosState`, `OutletContextType`), os imports que só eles usam, **tudo entre a linha do primeiro `const [alertas, ...]` e a linha imediatamente anterior ao `if (loading)`**, mais as duas consts `taxaExpMatLiberada` / `taxaExpMatSemBase`.
2. Embrulhe numa função `export function useDashboardDados(): DashboardDados` e devolva um objeto com as chaves da lista de Interfaces acima — **os mesmos nomes das variáveis locais**, nada renomeado.
3. Declare `export interface DashboardDados` com essas chaves.
4. No `DashboardPage`, ponha no topo do componente:

```tsx
const {
  loading, alertas, dadosGestao, fonteKpisAlunos, dadosComercial, dadosProfessores,
  evolucaoAlunos, funilComercial, resumoUnidades, metas, labelPeriodo, unidade,
  competencia, anosDisponiveis, setTipo, setAno, setMes, setTrimestre, setSemestre,
  setDataInicio, setDataFim, leadsComercialV2, loadingLeadsComercialV2,
  errorLeadsComercialV2, healthScoreV3Enabled, healthScoreV3Loading,
  healthScoreV3Period, healthScoreV3Summary, taxaExpMatLiberada, taxaExpMatSemBase,
  modalMatriculas, setModalMatriculas, modalEvasoes, setModalEvasoes,
  modalExperimentais, setModalExperimentais, modalConversao, setModalConversao,
  dadosModalMatriculas, dadosModalEvasoes, dadosModalExperimentais,
  dadosModalConversao, carregandoModal, fetchMatriculas, fetchEvasoes,
  fetchExperimentais, fetchConversao,
} = useDashboardDados();
```

   Mantenha `useSetPageTitle(...)` na página (é apresentação, não dado).

   ⚠️ **Limpe os imports que ficaram órfãos** no `DashboardPage`: `useState`, `useEffect`,
   `useMemo`, `useOutletContext`, `useAuth`, `supabase` e os helpers que só o fetch usava saem
   junto com a lógica. Import não usado quebra o `npm run build` por `noUnusedLocals` — e é o
   sinal mais confiável de que algo ficou para trás por engano.

5. **Não toque em nada a partir do `if (loading) {`.** Se o `git diff` mostrar qualquer hunk abaixo dessa linha, a extração está errada — refaça.

⚠️ `taxaExpMatLiberada`/`taxaExpMatSemBase` hoje são calculados **depois** do early return de loading. No hook eles são calculados sempre; são derivados puros de `dadosComercial`, então o valor não muda — só passam a existir mais cedo.

⚠️ O hook lê `useOutletContext()` por dentro. Isso é o que faz mobile e desktop funcionarem sem parâmetro: os dois layouts entregam o mesmo contrato, travado por `tests/mobileContratoOutletContext.test.mjs` desde a etapa 1.

- [ ] **Step 4: Rodar o teste e o build**

```
node --test tests/dashboardDadosContrato.test.mjs
npm run build
```
Esperado: PASS nos 3 testes; build sem erro de tipo.

- [ ] **Step 5: Ligar no `npm test` e commitar**

Acrescente `tests/dashboardDadosContrato.test.mjs` ao script `test` do `package.json`.

```bash
git add src/hooks/useDashboardDados.ts src/components/App/Dashboard/DashboardPage.tsx tests/dashboardDadosContrato.test.mjs package.json
git commit -m "refactor(dashboard): logica de busca vira useDashboardDados"
```

---

### Task 2: Tooltip do KPICard funciona no toque

**Files:**
- Modify: `src/components/ui/KPICard.tsx`
- Test: `tests/kpiCardTooltipToque.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces: `KPICard` com o `?` acionável por clique, sem perder o hover do desktop.

**Por que:** o tooltip é `opacity-0 invisible group-hover:opacity-100`. No celular não há hover: o `?` aparece e nunca abre. São 13 tooltips carregando regra de negócio ("evasões: deduplicado por aluno/mês"; "média alunos/turma: projetos e bandas não entram"). A spec §7 diz que o texto de ajuda carrega a regra **no ponto da decisão** — some no mobile é perder a regra.

- [ ] **Step 1: Escrever o teste (falha)**

`tests/kpiCardTooltipToque.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fonte = readFileSync(new URL('../src/components/ui/KPICard.tsx', import.meta.url), 'utf8');

test('o tooltip abre por clique, nao so por hover', () => {
  assert.match(fonte, /const \[tooltipAberto, setTooltipAberto\] = useState\(false\)/);
  // O clique no "?" nao pode disparar o onClick do cartao (drill-down).
  assert.match(fonte, /stopPropagation\(\)/, 'o clique no ? precisa parar a propagacao');
});

test('o hover do desktop continua valendo', () => {
  assert.match(fonte, /group-hover:opacity-100/, 'o hover do desktop foi removido');
});

test('o ? e um botao de 44px com rotulo acessivel, nao um span mudo', () => {
  const botao = fonte.match(/<button[\s\S]*?>/);
  assert.ok(botao, 'o ? nao virou <button>');
  assert.match(botao[0], /aria-label="Explicação do indicador"/);
  assert.match(botao[0], /min-h-\[44px\]/);
  assert.match(botao[0], /min-w-\[44px\]/);
});

test('o useState foi importado — o KPICard nao importava nada de react', () => {
  assert.match(fonte, /import \{[^}]*useState[^}]*\} from 'react'/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

`node --test tests/kpiCardTooltipToque.test.mjs` → FAIL.

- [ ] **Step 3: Implementar**

No `KPICard`, acrescente `import { useState } from 'react';` (hoje o arquivo não importa nada de
`react`) e troque o `<span className="relative group">` que embrulha o `HelpCircle` por um botão
com estado:

```tsx
const [tooltipAberto, setTooltipAberto] = useState(false);
```

```tsx
{tooltip && (
  <span className="relative group inline-flex">
    <button
      type="button"
      aria-label="Explicação do indicador"
      aria-expanded={tooltipAberto}
      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center -m-3"
      onClick={(e) => { e.stopPropagation(); setTooltipAberto((v) => !v); }}
    >
      <HelpCircle size={12} className="text-slate-500 hover:text-slate-300 cursor-help flex-shrink-0" />
    </button>
    <span className={cn(
      "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 whitespace-normal w-[220px] text-center transition-all duration-200 z-50 shadow-xl pointer-events-none",
      tooltipAberto ? "opacity-100 visible" : "opacity-0 invisible",
      "group-hover:opacity-100 group-hover:visible",
    )}>
      {tooltip}
    </span>
  </span>
)}
```

⚠️ O `stopPropagation` não é detalhe: 4 dos 13 cartões têm `onClick` de drill-down (Matrículas, Evasões, Experimentais). Sem ele, tocar no `?` abriria o modal.

⚠️ O `-m-3` mantém o alvo de 44px sem empurrar o layout do desktop — a área cresce para fora, o ícone fica do mesmo tamanho no mesmo lugar.

- [ ] **Step 4: Rodar testes e build**

```
node --test tests/kpiCardTooltipToque.test.mjs
npm run build
```

- [ ] **Step 5: Ligar no `npm test` e commitar**

```bash
git add src/components/ui/KPICard.tsx tests/kpiCardTooltipToque.test.mjs package.json
git commit -m "feat(kpi): tooltip do KPICard abre por toque, sem perder o hover"
```

---

### Task 3: Blocos de KPI da tela mobile

**Files:**
- Create: `src/mobile/telas/dashboard/SecaoKPIs.tsx`
- Test: `tests/mobileDashboardSecaoKpis.test.mjs`

**Interfaces:**
- Consumes: `KPICard` (Task 2).
- Produces: `<SecaoKPIs titulo icone corIcone>{children}</SecaoKPIs>` — cabeçalho de seção + grade de 2 colunas.

- [ ] **Step 1: Escrever o teste (falha)**

`tests/mobileDashboardSecaoKpis.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fonte = readFileSync(new URL('../src/mobile/telas/dashboard/SecaoKPIs.tsx', import.meta.url), 'utf8');

test('a grade e de 2 colunas — 5 colunas do desktop nao cabem em 390px', () => {
  assert.match(fonte, /grid-cols-2/);
  assert.doesNotMatch(fonte, /grid-cols-[45]/, 'grade larga do desktop vazou para o mobile');
});

test('o cabecalho da secao repete o vocabulario do desktop (uppercase, slate-400)', () => {
  assert.match(fonte, /uppercase/);
  assert.match(fonte, /text-slate-400/);
});
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL (arquivo não existe).

- [ ] **Step 3: Implementar**

```tsx
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface SecaoKPIsProps {
  titulo: string;
  icone: LucideIcon;
  corIcone: string;
  children: ReactNode;
}

/**
 * Cabecalho + grade de KPIs de uma secao do Dashboard mobile.
 *
 * Duas colunas: o KPICard em `size="sm"` fica com ~180px em tela de 390px,
 * que e onde o numero ainda se le de relance. Uma coluna so transformaria
 * os 13 indicadores em rolagem longa demais para "dar uma olhada".
 */
export function SecaoKPIs({ titulo, icone: Icone, corIcone, children }: SecaoKPIsProps) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Icone className={`h-4 w-4 ${corIcone}`} />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{titulo}</h3>
      </div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </section>
  );
}

export default SecaoKPIs;
```

⚠️ `corIcone` entra por prop justamente para a cor ser decisão de quem monta a tela (Task 5), não
deste componente — se a leitura no aparelho pedir outra paleta, muda-se numa linha.

- [ ] **Step 4: Rodar testes e build.**

- [ ] **Step 5: Ligar no `npm test` e commitar**

```bash
git commit -m "feat(mobile): secao de KPIs em duas colunas"
```

---

### Task 4: Cartões por unidade e alertas

**Files:**
- Create: `src/mobile/telas/dashboard/CartaoUnidade.tsx`
- Create: `src/mobile/telas/dashboard/ListaAlertas.tsx`
- Test: `tests/mobileDashboardUnidadesAlertas.test.mjs`

**Interfaces:**
- Consumes: os tipos `ResumoUnidade` e `Alerta` de `@/hooks/useDashboardDados` (Task 1).
- Produces: `<CartaoUnidade dados={resumo} />` e `<ListaAlertas alertas={alertas} />`.

- [ ] **Step 1: Escrever o teste (falha)**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cartao = readFileSync(new URL('../src/mobile/telas/dashboard/CartaoUnidade.tsx', import.meta.url), 'utf8');
const alertas = readFileSync(new URL('../src/mobile/telas/dashboard/ListaAlertas.tsx', import.meta.url), 'utf8');

test('a tabela de 5 colunas virou cartao — sem <table> no mobile', () => {
  assert.doesNotMatch(cartao, /<table|<thead|<tbody/, 'tabela do desktop vazou para o mobile');
});

test('o cartao mostra os 4 numeros da tabela, nenhum a menos', () => {
  for (const campo of ['alunos_ativos', 'alunos_pagantes', 'ticket_medio', 'faturamento_previsto']) {
    assert.ok(cartao.includes(campo), `sumiu ${campo} do cartao de unidade`);
  }
});

test('dinheiro passa por formatCurrency, nunca por toLocaleString solto', () => {
  assert.match(cartao, /formatCurrency\(/);
});

test('lista de alertas some quando nao ha alerta — nao mostra caixa vazia', () => {
  assert.match(alertas, /alertas\.length === 0[\s\S]{0,80}return null/);
});
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**

`CartaoUnidade.tsx`:

```tsx
import { formatCurrency } from '@/lib/utils';
import type { ResumoUnidade } from '@/hooks/useDashboardDados';

/**
 * A tabela "Resumo por Unidade" tem 5 colunas — em 390px ela so existiria
 * rolando para o lado. Cada unidade vira um cartao com os mesmos 4 numeros.
 */
export function CartaoUnidade({ dados }: { dados: ResumoUnidade }) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-3">
      <p className="mb-2 font-medium text-white">{dados.unidade}</p>
      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Ativos</dt>
          <dd className="tabular-nums text-slate-200">{dados.alunos_ativos}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Pagantes</dt>
          <dd className="tabular-nums text-slate-200">{dados.alunos_pagantes}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Ticket médio</dt>
          <dd className="tabular-nums text-slate-200">{formatCurrency(dados.ticket_medio)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Faturamento previsto</dt>
          <dd className="tabular-nums font-medium text-emerald-400">{formatCurrency(dados.faturamento_previsto)}</dd>
        </div>
      </dl>
    </div>
  );
}

export default CartaoUnidade;
```

`ListaAlertas.tsx`: cabeçalho com o contador e uma linha por alerta (ícone por `tipo`, título, descrição em `text-xs`). Sem alerta, `return null` — caixa vazia dizendo "nenhum alerta" ocupa a dobra sem informar.

- [ ] **Step 4: Rodar testes e build.**

- [ ] **Step 5: Ligar no `npm test` e commitar**

```bash
git commit -m "feat(mobile): cartoes por unidade e lista de alertas"
```

---

### Task 5: A tela `DashboardMobile`

**Files:**
- Create: `src/mobile/telas/DashboardMobile.tsx`
- Test: `tests/mobileDashboardTela.test.mjs`

**Interfaces:**
- Consumes: `useDashboardDados` (T1), `SecaoKPIs` (T3), `CartaoUnidade`/`ListaAlertas` (T4), e os já existentes `KPICard`, `EvolutionChart`, `FunnelChart`, `CompetenciaFilter`, `ModalDetalheKPI`.
- Produces: `export function DashboardMobile()` — default export também.

- [ ] **Step 1: Escrever o teste (falha)**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fonte = readFileSync(new URL('../src/mobile/telas/DashboardMobile.tsx', import.meta.url), 'utf8');

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
});

test('KPICard no mobile usa size="sm"', () => {
  const cartoes = fonte.match(/<KPICard[\s\S]*?\/>/g) ?? [];
  for (const cartao of cartoes) {
    assert.match(cartao, /size="sm"/, `KPICard sem size="sm":\n${cartao.slice(0, 120)}`);
  }
});

test('os cartoes por unidade so aparecem no consolidado', () => {
  assert.match(fonte, /unidade === 'todos'[\s\S]{0,400}CartaoUnidade/);
});

test('o drill-down reusa o ModalDetalheKPI do desktop', () => {
  assert.match(fonte, /ModalDetalheKPI/);
});
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**

Monte a tela lendo `useDashboardDados()` e desestruturando as mesmas chaves. Estrutura, de cima para baixo:

1. `<CompetenciaFilter ... />` numa faixa de largura cheia (⚠️ é o mesmo componente do desktop; se no aparelho ele não couber, vira task própria — não reescrever agora).
2. Faixa de fonte dos KPIs de alunos (`fonteKpisAlunos`), quando houver.
3. `<SecaoKPIs titulo="Gestão" icone={BarChart3} corIcone="text-sky-400">` com os 4 KPIs de Gestão.
4. `<SecaoKPIs titulo="Comercial" icone={TrendingUp} corIcone="text-violet-400">` com os 4 de Comercial.
5. `<SecaoKPIs titulo="Professores" icone={Award} corIcone="text-amber-400">` com os 5 de Professores.
6. `<ListaAlertas alertas={alertas} />`.
7. Evolução de Alunos Ativos (12 meses) — `EvolutionChart`, largura cheia.
8. Funil Comercial — `FunnelChart`.
9. `{unidade === 'todos' && resumoUnidades.map((u) => <CartaoUnidade key={u.unidade_id} dados={u} />)}`.
10. Os 4 `ModalDetalheKPI`, iguais aos do desktop.

**Copie os `label`, `tooltip`, `value`, `target`, `format`, `variant`, `inverterCor` e `onClick` de cada KPI verbatim do `DashboardPage.tsx`** — acrescente só `size="sm"`. Um `tooltip` reescrito com outras palavras vira uma segunda versão da regra de negócio.

⚠️ Envolva a tela em `<div className="space-y-4 pb-2">`. A barra inferior já reserva a safe-area; padding extra aqui empurraria o conteúdo sem motivo.

- [ ] **Step 4: Rodar testes e build.**

- [ ] **Step 5: Ligar no `npm test` e commitar**

```bash
git commit -m "feat(mobile): tela do Dashboard"
```

---

### Task 6: Ligar a tela na rota

**Files:**
- Create: `src/components/App/Dashboard/DashboardResponsivo.tsx`
- Modify: `src/router.tsx` (uma linha: o `element` da rota index)
- Modify: `src/mobile/rotasPortadas.ts` (`ROTAS_PORTADAS = ['/app']`)
- Test: `tests/mobileDashboardLigado.test.mjs`

**Interfaces:**
- Consumes: `DashboardMobile` (T5), `useIsMobile` (etapa 1), `DashboardPage`.
- Produces: `DashboardResponsivo` — escolhe a tela pelo mesmo corte de 1023px do shell.

**Por que a bifurcação fica na rota, e não no `MobileLayout`:** a tela precisa do
`Outlet context` (filtro de unidade e competência), e `useOutletContext()` só resolve
para quem o `<Outlet />` renderiza. Uma tela montada ao lado do Outlet receberia
`undefined` e o `useDashboardDados` perderia unidade e período — que é justamente o que
faz as RPCs recusarem com 403 "unidade fora do escopo".

O `ResponsiveLayout` continua sendo o único ponto que bifurca o **shell**; isto bifurca a
**tela**, e é uma linha por módulo portado.

- [ ] **Step 1: Escrever o teste (falha)**

`tests/mobileDashboardLigado.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const responsivo = readFileSync(new URL('../src/components/App/Dashboard/DashboardResponsivo.tsx', import.meta.url), 'utf8');
const router = readFileSync(new URL('../src/router.tsx', import.meta.url), 'utf8');
const rotas = readFileSync(new URL('../src/mobile/rotasPortadas.ts', import.meta.url), 'utf8');

test('a rota index passou a apontar para o DashboardResponsivo', () => {
  assert.match(router, /index: true,\s*
\s*element: <DashboardResponsivo \/>/);
});

test('o Dashboard mobile entra por lazy — nao pesa no bundle do desktop', () => {
  assert.match(responsivo, /lazy\(\(\) => import\('@\/mobile\/telas\/DashboardMobile'\)\)/);
  assert.match(responsivo, /<Suspense/);
});

test('a escolha usa o mesmo corte do shell, nao um breakpoint proprio', () => {
  assert.match(responsivo, /useIsMobile\(\)/);
  assert.doesNotMatch(responsivo, /matchMedia|innerWidth|1023|1024/,
    'breakpoint duplicado: a decisao tem que vir de useIsMobile');
});

test('o desktop continua recebendo o DashboardPage intacto', () => {
  assert.match(responsivo, /if \(!isMobile\) return <DashboardPage \/>/);
});

test('a faixa de aviso sumiu do Dashboard e continua nos outros 17 modulos', () => {
  assert.match(rotas, /ROTAS_PORTADAS[^=]*=\s*\['\/app'\]/);
});

test('a rota so entra na lista com a tela ligada no router — uma fonte, um commit', () => {
  const lista = rotas.match(/ROTAS_PORTADAS[^=]*=\s*\[([^\]]*)\]/);
  assert.ok(lista, 'nao achei ROTAS_PORTADAS');
  const declaradas = [...lista[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  // Hoje so o Dashboard. Ao portar o proximo modulo, este teste obriga a
  // ligar a tela no router no mesmo commit em que a faixa some.
  assert.deepEqual(declaradas, ['/app']);
  assert.match(router, /DashboardResponsivo/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

`node --test tests/mobileDashboardLigado.test.mjs` → FAIL.

- [ ] **Step 3: Implementar**

`src/components/App/Dashboard/DashboardResponsivo.tsx`:

```tsx
import { lazy, Suspense } from 'react';

import { useIsMobile } from '@/hooks/useIsMobile';
import DashboardPage from './DashboardPage';

/**
 * Escolhe a tela do Dashboard pelo mesmo corte que escolhe o shell.
 *
 * Fica na rota, e nao no MobileLayout, porque a tela precisa do Outlet
 * context (unidade + competencia): quem nasce fora do <Outlet /> le
 * `undefined` em useOutletContext e perde os dois.
 */
const DashboardMobile = lazy(() => import('@/mobile/telas/DashboardMobile'));

export function DashboardResponsivo() {
  const isMobile = useIsMobile();
  if (!isMobile) return <DashboardPage />;
  return (
    <Suspense fallback={(
      <div className="flex h-40 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-cyan-500" />
      </div>
    )}>
      <DashboardMobile />
    </Suspense>
  );
}

export default DashboardResponsivo;
```

No `router.tsx`: importe `DashboardResponsivo` (mesmo padrão de import do `DashboardPage`
que já está lá) e troque

```tsx
index: true,
element: <DashboardPage />,
```

por

```tsx
index: true,
element: <DashboardResponsivo />,
```

Em `src/mobile/rotasPortadas.ts`, troque o array vazio por `['/app']`. O corpo de
`rotaFoiPortada` **não muda** — a regra do `RAIZ_APP` (portar o Dashboard não apaga a
faixa de Alunos, Agenda e mais 15) já está lá e é justamente o caso que se realiza agora.

- [ ] **Step 4: Rodar a suíte inteira e o build**

```
npm test
npm run build
```
Esperado: toda a suíte passando (incluindo `mobileAvisoNaoOtimizado`, que prova que os
outros 17 módulos continuam com a faixa) e build sem erro.

- [ ] **Step 5: Ligar no `npm test` e commitar**

```bash
git add src/components/App/Dashboard/DashboardResponsivo.tsx src/router.tsx src/mobile/rotasPortadas.ts tests/mobileDashboardLigado.test.mjs package.json
git commit -m "feat(mobile): ligar o Dashboard mobile na rota index"
```

---

## Verificação no aparelho (não delegável)

Os testes deste repositório checam contrato de fonte — nenhum renderiza nada. Depois da Task 6, confira no celular, em ordem de risco:

1. **Tocar no `?` de um KPI com drill-down** (Matrículas, Evasões, Experimentais): o tooltip abre e o modal **não**.
2. **Tocar no cartão de Matrículas**: o `ModalDetalheKPI` abre e a tabela dele rola para o lado sem empurrar a página.
3. **Trocar o período** pelo `CompetenciaFilter` — é o candidato mais provável a não caber em 390px.
4. **Consolidado (admin)**: os 3 cartões de unidade aparecem; com unidade escolhida, somem.
5. **Girar o aparelho** no iPad: cruzar 1023px troca o shell e perde o estado da página.
