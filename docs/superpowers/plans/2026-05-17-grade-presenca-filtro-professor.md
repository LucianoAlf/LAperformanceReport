# Grade de Presença — Filtro por Professor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um `<select>` de professor na barra de filtros da Grade de Presença que filtra os cards do dia por professor.

**Architecture:** Mudança client-side em um único arquivo. A lista de professores é derivada de `presencasDoDia` já em memória. O `useMemo` de `presencasDoDiaFiltradas` ganha uma condição extra. O select aparece só quando `filtroData` está preenchido.

**Tech Stack:** React 19, TypeScript, Tailwind CSS

---

## Arquivos afetados

| Arquivo | O que muda |
|---|---|
| `src/components/App/Alunos/SucessoCliente/PresencaTab.tsx` | Novo estado, novo useMemo derivado, atualizar useMemo de filtragem, adicionar select na UI, reset ao mudar data |

---

### Task 1: Filtro de professor (estado + lógica + UI)

**Files:**
- Modify: `src/components/App/Alunos/SucessoCliente/PresencaTab.tsx`

- [ ] **Step 1: Adicionar estado `filtroProfessor`**

Após a linha `const [paginaPresenca, setPaginaPresenca] = useState(1);` (linha 106), adicionar:

```ts
const [filtroProfessor, setFiltroProfessor] = useState('');
```

- [ ] **Step 2: Resetar `filtroProfessor` ao mudar data**

Localizar o onChange do input de data (linha ~386):
```tsx
onChange={(e) => { setFiltroData(e.target.value); setPaginaPresenca(1); }}
```

Substituir por:
```tsx
onChange={(e) => { setFiltroData(e.target.value); setPaginaPresenca(1); setFiltroProfessor(''); }}
```

- [ ] **Step 3: Adicionar useMemo de professores disponíveis**

Após o `useMemo` de `presencasDoDiaFiltradas` (linha ~284), adicionar:

```ts
// Professores únicos do dia para o select de filtro
const professoresDisponiveis = useMemo(() => {
  const nomes = presencasDoDia
    .map(p => p.professor_nome)
    .filter((n): n is string => !!n);
  return [...new Set(nomes)].sort();
}, [presencasDoDia]);
```

- [ ] **Step 4: Atualizar useMemo de `presencasDoDiaFiltradas` para incluir filtro de professor**

Localizar (linha ~281):
```ts
const presencasDoDiaFiltradas = useMemo(() => {
  if (filtroTipoRegistro === 'todas') return presencasDoDia;
  return presencasDoDia.filter(p => p.tipo === filtroTipoRegistro);
}, [presencasDoDia, filtroTipoRegistro]);
```

Substituir por:
```ts
const presencasDoDiaFiltradas = useMemo(() => {
  let resultado = presencasDoDia;
  if (filtroTipoRegistro !== 'todas') {
    resultado = resultado.filter(p => p.tipo === filtroTipoRegistro);
  }
  if (filtroProfessor !== '') {
    resultado = resultado.filter(p => p.professor_nome === filtroProfessor);
  }
  return resultado;
}, [presencasDoDia, filtroTipoRegistro, filtroProfessor]);
```

- [ ] **Step 5: Adicionar select de professor na barra de filtros**

Localizar o fechamento do `<div>` dos filtros (linha ~418, após o grupo de botões Todas/Turma/Individual). Adicionar logo após o `</div>` do grupo de botões, ainda dentro do `<div className="flex flex-wrap items-center gap-3 mb-4">`:

```tsx
{/* Filtro professor */}
{filtroData && professoresDisponiveis.length > 0 && (
  <select
    value={filtroProfessor}
    onChange={(e) => { setFiltroProfessor(e.target.value); setPaginaPresenca(1); }}
    className="h-7 px-2 text-xs bg-slate-700/50 border border-slate-600 rounded-md text-slate-200 focus:outline-none focus:border-violet-500"
  >
    <option value="">Todos os professores</option>
    {professoresDisponiveis.map(nome => (
      <option key={nome} value={nome}>{nome}</option>
    ))}
  </select>
)}
```

- [ ] **Step 6: Commit e push**

```bash
git add src/components/App/Alunos/SucessoCliente/PresencaTab.tsx
git commit -m "feat: adicionar filtro por professor na grade de presenca"
git push
```

---

## Self-Review

**Spec coverage:**
- ✅ Estado `filtroProfessor` default `''` → Step 1
- ✅ Reset ao mudar `filtroData` → Step 2
- ✅ Lista derivada de `presencasDoDia`, sem query nova → Step 3
- ✅ Filtragem aplicada em `presencasDoDiaFiltradas` → Step 4
- ✅ `setPaginaPresenca(1)` ao mudar professor → Step 5
- ✅ Select aparece só quando `filtroData` preenchido → Step 5 (condicional `filtroData &&`)
- ✅ Primeira opção "Todos os professores" (value `''`) → Step 5
- ✅ Professores em ordem A→Z → Step 3 (`.sort()`)
- ✅ Estilo consistente com input de data → Step 5 (mesmas classes)

**Placeholders:** nenhum.

**Type consistency:** `filtroProfessor` é `string` em todos os usos. `professoresDisponiveis` é `string[]`. Consistente.
