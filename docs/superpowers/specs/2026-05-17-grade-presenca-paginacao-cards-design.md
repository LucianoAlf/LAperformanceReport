# Grade de Presença — Paginação e Redesign de Cards

**Data:** 2026-05-17  
**Arquivo alvo:** `src/components/App/Alunos/SucessoCliente/PresencaTab.tsx`  
**Escopo:** Modo "Grade de Presença" (filtroData ativo, viewMode = 'cards')

---

## Contexto

A Grade de Presença exibe todos os registros de presença de uma data selecionada. Com 200+ registros por dia, todos os cards são renderizados de uma vez, causando lentidão e dificultando a leitura. Os cards atuais são compactos demais — comprimem nome, tipo, horário, curso e turma numa única linha.

---

## Mudanças

### 1. Paginação (client-side)

- **30 cards por página**
- Estado: `paginaPresenca` (número, default 1)
- Fonte de dados: `presencasDoDiaFiltradas` (já calculada, sem nova query)
- Fatiamento: `presencasDoDiaFiltradas.slice((paginaPresenca - 1) * 30, paginaPresenca * 30)`
- Reset para página 1 ao mudar `filtroData` ou `filtroTipoRegistro`
- Controles de paginação abaixo da grid:
  - Botão `← Anterior` (desabilitado na página 1)
  - Label `Página X de Y`
  - Botão `Próxima →` (desabilitado na última página)
  - Label secundário: `Mostrando X–Y de Z registros`

### 2. Redesign do card (viewMode = 'cards')

Estrutura visual do card (4 linhas):

```
┌─────────────────────────────────────┐
│ Laura Turques Tavares    ✓ Presente │  linha 1: nome + badge status
│ [T] 08:00 · Aula #3 · 50 min       │  linha 2: tipo + horário + nº + duração
│ Musicalização para Bebês            │  linha 3: curso (azul)
│ Prof.: Ana Silva  ·  Sala 1        │  linha 4: professor + sala (cinza)
└─────────────────────────────────────┘
```

**Detalhes por linha:**

- **Linha 1:** `aluno_nome` (font-medium, truncate) + badge `Presente` (emerald) ou `Ausente` (red) no canto direito — substituindo o ícone atual
- **Linha 2:** badge tipo `[T]`/`[I]` + `horario_aula` + `· Aula #nr_da_aula` (se existir) + `· duracao_minutos min` (se existir) — tudo em text-xs slate-400
- **Linha 3:** `curso_nome` em text-xs blue-400 (linha própria, não espremida com turma)
- **Linha 4:** `Prof.: professor_nome · sala_nome` em text-xs slate-500 — só renderiza se ao menos um existir

**Bordas/fundo:** mantém padrão atual (emerald para presente, red para ausente)  
**Padding:** p-3 → p-3.5 (ligeiro aumento)  
**Tooltip:** mantido como está (já tem detalhes extras)

---

## O que NÃO muda

- Modo tabela (`viewMode = 'tabela'`) — sem alteração
- Grade semanal por aluno (`alunoSelecionado`) — sem alteração
- Log de sincronização — sem alteração
- Queries / hooks — sem alteração
- Filtros existentes (data, tipo de registro) — sem alteração

---

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `src/components/App/Alunos/SucessoCliente/PresencaTab.tsx` | Adicionar estado `paginaPresenca`, fatiar array, redesenhar card, adicionar controles de paginação |
