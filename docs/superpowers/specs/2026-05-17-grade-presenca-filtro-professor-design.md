# Grade de Presença — Filtro por Professor

**Data:** 2026-05-17  
**Arquivo alvo:** `src/components/App/Alunos/SucessoCliente/PresencaTab.tsx`  
**Escopo:** Modo "Grade de Presença" (filtroData ativo)

---

## Contexto

A Grade de Presença já possui filtros por data e por tipo de registro (Todas/Turma/Individual). O usuário quer filtrar também por professor, para ver só as aulas de um professor específico no dia selecionado.

---

## Mudanças

### 1. Estado

```ts
const [filtroProfessor, setFiltroProfessor] = useState('');
```

Reset para `''` ao mudar `filtroData` (no onChange do input de data).

### 2. Lista de professores derivada

```ts
const professoresDisponiveis = useMemo(() => {
  const nomes = presencasDoDia
    .map(p => p.professor_nome)
    .filter((n): n is string => !!n);
  return [...new Set(nomes)].sort();
}, [presencasDoDia]);
```

Sem query nova — deriva dos dados já carregados.

### 3. Filtragem

O `useMemo` de `presencasDoDiaFiltradas` ganha condição adicional:

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

`setPaginaPresenca(1)` ao mudar `filtroProfessor`.

### 4. UI

`<select>` estilizado posicionado na barra de filtros após os botões Todas/Turma/Individual.

- Aparece **somente quando `filtroData` está preenchido**
- Primeira opção: `"Todos os professores"` (value `''`)
- Demais opções: `professoresDisponiveis` em ordem A→Z
- Mesma aparência do input de data: `h-7 px-2 text-xs bg-slate-700/50 border border-slate-600 rounded-md text-slate-200`

```tsx
{filtroData && (
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

---

## O que NÃO muda

- Modo tabela (`viewMode = 'tabela'`) — sem alteração
- Grade semanal por aluno (`alunoSelecionado`) — sem alteração
- Log de sincronização — sem alteração
- Qualquer query ou hook — sem alteração

---

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `src/components/App/Alunos/SucessoCliente/PresencaTab.tsx` | Novo estado, novo useMemo derivado, atualizar useMemo de filtragem, adicionar select na UI |
