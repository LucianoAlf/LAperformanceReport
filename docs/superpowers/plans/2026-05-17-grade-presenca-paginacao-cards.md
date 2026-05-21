# Grade de Presença — Paginação e Redesign de Cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar paginação de 30 itens e redesenhar os cards da Grade de Presença no PresencaTab.

**Architecture:** Mudança client-side em um único arquivo. O array `presencasDoDiaFiltradas` já existe em memória — basta fatiar por página e reescrever o JSX do card. Nenhuma query nova, nenhum hook novo.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, date-fns, Lucide icons

---

## Arquivos afetados

| Arquivo | O que muda |
|---|---|
| `src/components/App/Alunos/SucessoCliente/PresencaTab.tsx` | Único arquivo: estado de paginação, computed slice, controles de UI, redesign do card |

---

### Task 1: Adicionar estado de paginação e computed slice

**Files:**
- Modify: `src/components/App/Alunos/SucessoCliente/PresencaTab.tsx`

- [ ] **Step 1: Adicionar constante de página e estado**

Após a linha `const LOGS_POR_PAGINA = 10;` (linha 75), adicionar:

```ts
const PRESENCA_POR_PAGINA = 30;
```

Após o bloco de estado `viewMode` (linha 104), adicionar:

```ts
const [paginaPresenca, setPaginaPresenca] = useState(1);
```

- [ ] **Step 2: Adicionar computed slice paginado**

Após o `useMemo` de `presencasDoDiaFiltradas` (linha 282), adicionar:

```ts
// Slice paginado dos cards de presença do dia
const presencasDoDiaPaginadas = useMemo(() => {
  const inicio = (paginaPresenca - 1) * PRESENCA_POR_PAGINA;
  return presencasDoDiaFiltradas.slice(inicio, inicio + PRESENCA_POR_PAGINA);
}, [presencasDoDiaFiltradas, paginaPresenca]);

const totalPaginasPresenca = Math.ceil(presencasDoDiaFiltradas.length / PRESENCA_POR_PAGINA);
```

- [ ] **Step 3: Resetar página ao mudar filtros**

Localizar onde `filtroData` é setado (onChange do input de data, linha ~376) e adicionar reset:

```tsx
onChange={(e) => { setFiltroData(e.target.value); setPaginaPresenca(1); }}
```

Localizar onde `filtroTipoRegistro` é setado (os três botões Todas/Turma/Individual, linhas ~392-407) e adicionar `setPaginaPresenca(1)` em cada onClick:

```tsx
onClick={() => { setFiltroTipoRegistro('todas'); setPaginaPresenca(1); }}
// ...
onClick={() => { setFiltroTipoRegistro('turma'); setPaginaPresenca(1); }}
// ...
onClick={() => { setFiltroTipoRegistro('individual'); setPaginaPresenca(1); }}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/App/Alunos/SucessoCliente/PresencaTab.tsx
git commit -m "feat: adicionar estado de paginacao e slice para grade de presenca"
```

---

### Task 2: Substituir array no map e redesenhar o card

**Files:**
- Modify: `src/components/App/Alunos/SucessoCliente/PresencaTab.tsx`

- [ ] **Step 1: Trocar o array do map de cards**

Localizar (linha ~478):
```tsx
{presencasDoDiaFiltradas.map((p, i) => (
```

Substituir por:
```tsx
{presencasDoDiaPaginadas.map((p, i) => (
```

- [ ] **Step 2: Redesenhar o card interno**

Localizar o `<div>` interno do card (começa em `<div className={`rounded-lg p-3 border cursor-default...`}>`):

Substituir o conteúdo interno do card (mantendo o wrapper externo com as classes de cor e o Tooltip) por:

```tsx
{/* Linha 1: Nome + Badge status */}
<div className="flex items-center justify-between gap-2 mb-1.5">
  <p className="text-sm font-medium text-slate-200 truncate flex-1">{p.aluno_nome}</p>
  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
    p.status === 'presente'
      ? 'bg-emerald-500/20 text-emerald-400'
      : 'bg-red-500/20 text-red-400'
  }`}>
    {p.status === 'presente' ? 'Presente' : 'Ausente'}
  </span>
</div>

{/* Linha 2: Tipo + Horário + Nº aula + Duração */}
<div className="flex items-center gap-1.5 mb-1">
  {p.tipo && (
    <span className={`text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${
      p.tipo === 'turma'
        ? 'bg-blue-500/20 text-blue-400'
        : 'bg-cyan-500/20 text-cyan-400'
    }`}>
      {p.tipo === 'turma' ? 'T' : 'I'}
    </span>
  )}
  {p.horario_aula && (
    <span className="text-xs text-slate-400">{p.horario_aula.slice(0, 5)}</span>
  )}
  {p.nr_da_aula && (
    <span className="text-xs text-slate-500">· Aula #{p.nr_da_aula}</span>
  )}
  {p.duracao_minutos && (
    <span className="text-xs text-slate-500">· {p.duracao_minutos} min</span>
  )}
</div>

{/* Linha 3: Curso */}
{p.curso_nome && (
  <p className="text-xs text-blue-400 truncate mb-1">{p.curso_nome}</p>
)}

{/* Linha 4: Professor + Sala */}
{(p.professor_nome || p.sala_nome) && (
  <p className="text-xs text-slate-500 truncate">
    {p.professor_nome && `Prof.: ${p.professor_nome}`}
    {p.professor_nome && p.sala_nome && ' · '}
    {p.sala_nome}
  </p>
)}
```

Atualizar o padding do wrapper de `p-3` para `p-3.5`:
```tsx
className={`rounded-lg p-3.5 border cursor-default ${...}`}
```

- [ ] **Step 3: Verificar visualmente no browser**

Abrir `http://localhost:5175/app/alunos`, ir em Sucesso do Cliente → Presença, selecionar uma data com registros. Confirmar que os cards mostram as 4 linhas corretamente.

- [ ] **Step 4: Commit**

```bash
git add src/components/App/Alunos/SucessoCliente/PresencaTab.tsx
git commit -m "feat: redesenhar cards da grade de presenca com hierarquia visual"
```

---

### Task 3: Adicionar controles de paginação

**Files:**
- Modify: `src/components/App/Alunos/SucessoCliente/PresencaTab.tsx`

- [ ] **Step 1: Adicionar ChevronLeft e ChevronRight ao import de ícones**

Os ícones `ChevronLeft` e `ChevronRight` já estão importados (linha 7). Confirmar que estão na lista — se não, adicionar:

```tsx
import {
  CalendarDays, Search, Loader2, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, Check, X, AlertCircle, Users, Filter,
  LayoutGrid, List
} from 'lucide-react';
```

- [ ] **Step 2: Adicionar controles de paginação após o grid de cards**

Localizar o fechamento do bloco `viewMode === 'cards'` (após o `</div>` que fecha o grid `grid-cols-3`). Adicionar logo depois, ainda dentro do `<>` do bloco `viewMode === 'cards'`:

```tsx
{/* Paginação */}
{totalPaginasPresenca > 1 && (
  <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-700/50">
    <span className="text-xs text-slate-500">
      Mostrando {(paginaPresenca - 1) * PRESENCA_POR_PAGINA + 1}–{Math.min(paginaPresenca * PRESENCA_POR_PAGINA, presencasDoDiaFiltradas.length)} de {presencasDoDiaFiltradas.length} registros
    </span>
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7 border-slate-600"
        onClick={() => setPaginaPresenca(p => Math.max(1, p - 1))}
        disabled={paginaPresenca === 1}
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </Button>
      <span className="text-xs text-slate-400 min-w-[80px] text-center">
        Página {paginaPresenca} de {totalPaginasPresenca}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7 border-slate-600"
        onClick={() => setPaginaPresenca(p => Math.min(totalPaginasPresenca, p + 1))}
        disabled={paginaPresenca === totalPaginasPresenca}
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </Button>
    </div>
  </div>
)}
```

- [ ] **Step 3: Verificar paginação no browser**

Com uma data que tenha mais de 30 registros (ex: 16/05/2026 com 209), confirmar:
- Página 1 mostra registros 1–30
- Botão "Anterior" está desabilitado na página 1
- Clicar "Próxima" avança para página 2 (31–60)
- Label "Mostrando X–Y de Z" atualiza corretamente
- Mudar data ou filtro de tipo volta para página 1

- [ ] **Step 4: Commit e push**

```bash
git add src/components/App/Alunos/SucessoCliente/PresencaTab.tsx
git commit -m "feat: adicionar paginacao de 30 itens na grade de presenca"
git push
```

---

## Self-Review

**Spec coverage:**
- ✅ 30 cards por página → `PRESENCA_POR_PAGINA = 30` + slice em Task 1
- ✅ Reset ao mudar `filtroData` → Task 1 Step 3
- ✅ Reset ao mudar `filtroTipoRegistro` → Task 1 Step 3
- ✅ Controles ← Anterior | Página X de Y | Próxima → → Task 3
- ✅ Label "Mostrando X–Y de Z" → Task 3
- ✅ Card linha 1: nome + badge status → Task 2
- ✅ Card linha 2: tipo + horário + nº aula + duração → Task 2
- ✅ Card linha 3: curso em azul → Task 2
- ✅ Card linha 4: professor + sala, condicional → Task 2
- ✅ Padding p-3 → p-3.5 → Task 2
- ✅ Modo tabela não alterado → não tocado em nenhuma task
- ✅ Grade semanal por aluno não alterada → não tocada em nenhuma task

**Placeholders:** nenhum encontrado.

**Type consistency:** `presencasDoDiaPaginadas` e `totalPaginasPresenca` definidos em Task 1 e consumidos em Tasks 2 e 3. `PRESENCA_POR_PAGINA` definido em Task 1 e usado em Tasks 1 e 3. Consistente.
