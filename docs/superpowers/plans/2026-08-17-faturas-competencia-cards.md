# Faturas de Alunos — competência mensal e cards-filtro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer `/app/faturas` respeitar uma única competência mensal, remover filtros redundantes e transformar os cards em filtros acessíveis da lista.

**Architecture:** O `AppLayout` continua dono da unidade e da competência. A página sincroniza deep links com esse contexto, chama a RPC existente em modo `competencia` e mantém busca/curso/pagamento como filtros locais. A RPC e o banco não mudam; a revisão é de escopo do consumidor e hierarquia da interface.

**Tech Stack:** React 18, TypeScript, React Router, Supabase RPC, shadcn/Radix Select, Tailwind CSS, Lucide React, Node test runner.

---

## Estrutura de arquivos

- `src/components/App/Layout/AppLayout.tsx`: expõe o setter de unidade no contexto para deep links autorizados alinharem o cabeçalho.
- `src/components/ui/CompetenciaFilter.tsx`: permite restringir os tipos apresentados sem criar um seletor financeiro paralelo.
- `src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx`: resolve escopo autenticado, período mensal, cards-filtro, ações operacionais e ícones.
- `tests/faturasAlunosFinanceirasFrontend.test.mjs`: protege o contrato visual e o recorte mensal.
- `tests/faturasAlunosPage.test.mjs`: protege autorização e ausência de leitura direta de espelhos.

### Task 1: Fixar a regressão de competência e unidade

**Files:**
- Modify: `tests/faturasAlunosFinanceirasFrontend.test.mjs`
- Modify: `tests/faturasAlunosPage.test.mjs`

- [ ] **Step 1: Escrever testes que falham no estado atual**

Adicionar asserções que exigem modo mensal, contexto global e remoção dos
seletores duplicados:

```js
test('faturas usa a competencia mensal do layout e nunca nasce em janela de tres meses', () => {
  const page = read('src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx');

  assert.match(page, /modoPeriodo\s*=\s*['"]competencia['"]/);
  assert.match(page, /context\?\.competencia/);
  assert.doesNotMatch(page, /value=\{competenciaParam\?\.value\s*\?\?\s*['"]janela_3['"]\}/);
  assert.doesNotMatch(page, /Últimas 3 competências/);
});

test('unidade vem do escopo autenticado e nao existe seletor local duplicado', () => {
  const page = read('src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx');

  assert.match(page, /useAuth\(\)/);
  assert.match(page, /isAdmin/);
  assert.match(page, /unidadeId/);
  assert.doesNotMatch(page, /<SelectItem value="todos">Todas as unidades<\/SelectItem>/);
});
```

- [ ] **Step 2: Executar e comprovar a falha**

Run:

```powershell
node --test tests/faturasAlunosFinanceirasFrontend.test.mjs tests/faturasAlunosPage.test.mjs
```

Expected: FAIL nas novas asserções de `modoPeriodo`, contexto e seletor de
unidade.

- [ ] **Step 3: Commitar apenas os testes vermelhos**

```powershell
git add tests/faturasAlunosFinanceirasFrontend.test.mjs tests/faturasAlunosPage.test.mjs
git commit -m "test(faturas): fixar competencia mensal e escopo de unidade"
```

### Task 2: Reutilizar o filtro global em modo mensal

**Files:**
- Modify: `src/components/ui/CompetenciaFilter.tsx`
- Modify: `src/components/App/Layout/AppLayout.tsx`
- Test: `tests/faturasAlunosFinanceirasFrontend.test.mjs`

- [ ] **Step 1: Permitir tipos restritos no componente global**

Adicionar a propriedade opcional:

```ts
interface CompetenciaFilterProps {
  // propriedades existentes
  tiposPermitidos?: TipoCompetencia[];
}
```

Filtrar `TIPOS` e ocultar o seletor de tipo quando houver apenas um:

```tsx
const tiposVisiveis = tiposPermitidos?.length
  ? TIPOS.filter((tipo) => tiposPermitidos.includes(tipo.id))
  : TIPOS;

{tiposVisiveis.length > 1 && (
  <div className="bg-slate-800/50 p-1 rounded-lg inline-flex gap-1">
    {tiposVisiveis.map((tipo) => /* botão existente */)}
  </div>
)}
```

- [ ] **Step 2: Expor a troca de unidade no contexto do layout**

Alterar o contexto do `Outlet`:

```tsx
<Outlet context={{
  filtroAtivo,
  unidadeSelecionada,
  setUnidadeSelecionada,
  competencia,
  setPeriodoLabel,
}} />
```

- [ ] **Step 3: Executar os testes de layout e filtros**

Run:

```powershell
node --test tests/faturasAlunosFinanceirasFrontend.test.mjs tests/faturasAlunosPage.test.mjs
```

Expected: PASS para os contratos existentes do cabeçalho e do design system.

- [ ] **Step 4: Commitar a extensão aditiva**

```powershell
git add src/components/ui/CompetenciaFilter.tsx src/components/App/Layout/AppLayout.tsx
git commit -m "feat(layout): expor filtros globais para faturas mensais"
```

### Task 3: Tornar competência e unidade canônicas na página

**Files:**
- Modify: `src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx`
- Test: `tests/faturasAlunosFinanceirasFrontend.test.mjs`
- Test: `tests/faturasAlunosPage.test.mjs`

- [ ] **Step 1: Consumir autenticação e contexto completo**

Definir o contexto e o modo fixo:

```ts
type FaturasOutletContext = {
  filtroAtivo: string | null;
  unidadeSelecionada: UnidadeId;
  setUnidadeSelecionada?: (value: string | null) => void;
  competencia?: ReturnType<typeof useCompetenciaFiltro>;
};

const { isAdmin, unidadeId, loading: authLoading } = useAuth();
const context = useOutletContext<FaturasOutletContext>();
const modoPeriodo = 'competencia' as const;
```

Resolver unidade sem permitir escalada por URL:

```ts
const unidadeConsulta = isAdmin
  ? (context?.filtroAtivo ?? 'todos')
  : unidadeId;
const unidadePronta = !authLoading && (isAdmin || Boolean(unidadeConsulta));
```

- [ ] **Step 2: Sincronizar competência de URL e filtro global**

Usar o parâmetro válido como inicialização e, depois, manter ano/mês no mesmo
objeto de competência:

```ts
const competenciaGlobal = context?.competencia;
const competenciaParam = competenciaValida(searchParams.get('competencia'));
const ano = competenciaParam?.year ?? competenciaGlobal?.filtro.ano ?? competenciaPadrao.year;
const mes = competenciaParam?.month ?? competenciaGlobal?.filtro.mes ?? competenciaPadrao.month;

const selecionarCompetencia = (nextAno: number, nextMes: number) => {
  competenciaGlobal?.setTipo('mensal');
  competenciaGlobal?.setAno(nextAno);
  competenciaGlobal?.setMes(nextMes);
  setFiltro('competencia', `${nextAno}-${String(nextMes).padStart(2, '0')}-01`);
};
```

O efeito de hidratação aplica deep link válido ao contexto e remove `unidade`
da URL depois que um admin o transferir para o seletor global. Não-admin ignora
o parâmetro.

- [ ] **Step 3: Mover competência para `PageFilterBar`**

Renderizar no topo:

```tsx
<PageFilterBar className="gap-3">
  <CompetenciaFilter
    filtro={{ ...competenciaGlobal.filtro, tipo: 'mensal', ano, mes }}
    range={competenciaGlobal.range}
    anosDisponiveis={competenciaGlobal.anosDisponiveis}
    tiposPermitidos={['mensal']}
    onTipoChange={() => competenciaGlobal.setTipo('mensal')}
    onAnoChange={(nextAno) => selecionarCompetencia(nextAno, mes)}
    onMesChange={(nextMes) => selecionarCompetencia(ano, nextMes)}
    onTrimestreChange={competenciaGlobal.setTrimestre}
    onSemestreChange={competenciaGlobal.setSemestre}
  />
  <button type="button" onClick={refreshNow}>Atualizar agora</button>
</PageFilterBar>
```

Remover da linha da tabela os selects de unidade e competência.

- [ ] **Step 4: Evitar consulta consolidada durante carregamento de auth**

Antes de chamar a RPC, manter `FATURAS_FINANCEIRAS_LOADING` enquanto
`unidadePronta` for falso. O array de dependências deve conter
`unidadePronta` e `unidadeConsulta`.

- [ ] **Step 5: Executar os testes vermelhos**

Run:

```powershell
node --test tests/faturasAlunosFinanceirasFrontend.test.mjs tests/faturasAlunosPage.test.mjs tests/faturasAlunosFinanceirasAdapter.test.mjs
```

Expected: PASS; a chamada continua usando a RPC, agora sempre em
`competencia`.

- [ ] **Step 6: Commitar a correção de escopo**

```powershell
git add src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx tests/faturasAlunosFinanceirasFrontend.test.mjs tests/faturasAlunosPage.test.mjs
git commit -m "fix(faturas): respeitar competencia mensal e unidade autenticada"
```

### Task 4: Substituir abas duplicadas por cards-filtro

**Files:**
- Modify: `src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx`
- Test: `tests/faturasAlunosFinanceirasFrontend.test.mjs`

- [ ] **Step 1: Escrever o teste da hierarquia visual**

```js
test('cards sao os filtros principais e acoes operacionais ficam separadas', () => {
  const page = read('src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx');

  assert.doesNotMatch(page, /<PageTabs/);
  assert.match(page, /aria-pressed=\{active\}/);
  assert.match(page, /Cobrar agora D\+2/);
  assert.match(page, /Reconciliação financeira/);
  assert.match(page, /Canceladas/);
});
```

- [ ] **Step 2: Executar e comprovar a falha**

Run:

```powershell
node --test tests/faturasAlunosFinanceirasFrontend.test.mjs
```

Expected: FAIL porque `PageTabs` ainda existe e os cards não expõem seleção.

- [ ] **Step 3: Tornar `MetricCard` selecionável e acessível**

Adicionar `active` e `disabled`, aplicar `aria-pressed`, `aria-disabled`, ring e
contraste ativo. Os cinco cards principais continuam mapeando os totais da RPC.

- [ ] **Step 4: Criar a faixa operacional compacta**

Renderizar três botões após os cards:

```tsx
<OperationalViewButton id="cobranca_d2" label="Cobrar agora D+2" />
<OperationalViewButton id="reconciliacao" label="Reconciliação financeira" />
<OperationalViewButton id="canceladas" label="Canceladas" />
```

`cobranca_d2` fica desabilitado quando `!state.collectionAllowed`. Remover o
import e o uso de `PageTabs`.

- [ ] **Step 5: Executar os testes da interface**

Run:

```powershell
node --test tests/faturasAlunosFinanceirasFrontend.test.mjs tests/faturasAlunosPage.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commitar a simplificação**

```powershell
git add src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx tests/faturasAlunosFinanceirasFrontend.test.mjs
git commit -m "refactor(faturas): usar cards como filtros da lista"
```

### Task 5: Diferenciar visualmente as formas de pagamento

**Files:**
- Modify: `src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx`
- Modify: `tests/faturasAlunosFinanceirasFrontend.test.mjs`

- [ ] **Step 1: Escrever o teste de classificação visual**

```js
test('formas de pagamento possuem icones semanticamente distintos', () => {
  const page = read('src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx');

  for (const icon of ['QrCode', 'CreditCard', 'Barcode', 'FileCheck2', 'Banknote', 'Landmark', 'CircleHelp']) {
    assert.match(page, new RegExp(icon));
  }
  assert.match(page, /normalizarFormaPagamento/);
});
```

- [ ] **Step 2: Executar e comprovar a falha**

Run:

```powershell
node --test tests/faturasAlunosFinanceirasFrontend.test.mjs
```

Expected: FAIL para os novos ícones.

- [ ] **Step 3: Implementar a classificação sem alterar a fonte**

Normalizar acentos e mapear o texto preservado pelo Emusys:

```ts
function normalizarFormaPagamento(value: string | null) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function iconeFormaPagamento(value: string | null) {
  const nome = normalizarFormaPagamento(value);
  if (nome.includes('pix')) return QrCode;
  if (nome.includes('cartao') || nome.includes('recorrente')) return CreditCard;
  if (nome.includes('boleto')) return Barcode;
  if (nome.includes('cheque')) return FileCheck2;
  if (nome.includes('dinheiro')) return Banknote;
  if (nome.includes('transfer')) return Landmark;
  return CircleHelp;
}
```

Usar o componente retornado no badge; manter o texto e `rotuloFormaPagamento`.

- [ ] **Step 4: Executar o teste**

Run:

```powershell
node --test tests/faturasAlunosFinanceirasFrontend.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commitar os ícones**

```powershell
git add src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx tests/faturasAlunosFinanceirasFrontend.test.mjs
git commit -m "feat(faturas): diferenciar meios de pagamento por icone"
```

### Task 6: Verificação integral e publicação

**Files:**
- Verify: repository test suite
- Verify: production browser `/app/faturas`

- [ ] **Step 1: Rodar testes focados**

```powershell
node --test tests/faturasAlunosFinanceirasFrontend.test.mjs tests/faturasAlunosFinanceirasAdapter.test.mjs tests/faturasAlunosPage.test.mjs tests/faturasAlunosFinanceiroContract.test.mjs
```

Expected: todos PASS.

- [ ] **Step 2: Rodar suíte completa**

```powershell
npm test
```

Expected: zero falhas.

- [ ] **Step 3: Rodar build**

```powershell
npm run build
```

Expected: exit code 0; apenas warnings já conhecidos de chunks, se persistirem.

- [ ] **Step 4: Conferir o diff e segurança do escopo**

```powershell
git diff --check main...HEAD
git status --short
```

Confirmar que não há migration, alteração nas RPCs da Sol nem leitura direta
de tabelas financeiras no browser.

- [ ] **Step 5: Integrar e publicar**

Fazer push da branch, fast-forward de `main` somente após os gates verdes e
push de `main`. Confirmar o commit remoto antes do browser.

- [ ] **Step 6: Validar em browser autenticado**

Na rota `/app/faturas`:

1. Ago/2026 mostra somente vencimentos/competência de agosto;
2. total consolidado de agosto corresponde a R$ 405.660,34 no snapshot de
   referência, ou a um valor novo explicado por timestamp posterior;
3. Barra agosto corresponde a R$ 107.776,44 no snapshot de referência, ou a
   um valor novo explicado por timestamp posterior;
4. mudar para julho remove linhas de agosto e junho;
5. cards filtram a tabela sem linha duplicada de abas;
6. usuário operacional não vê seletor local de unidade;
7. ícones de Pix, cartão, boleto e cheque são distintos;
8. console permanece sem erros após reload.

- [ ] **Step 7: Registrar a entrega**

Informar branch, commits, hash de `main`, testes, build, timestamp da fonte e
qualquer diferença entre o snapshot de referência e a validação final.
