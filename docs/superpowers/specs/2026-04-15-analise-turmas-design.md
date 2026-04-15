# Spec: Aba Análise de Turmas — Sucesso do Cliente

**Data:** 2026-04-15
**Status:** Draft v2

## Objetivo

Nova aba "Análise de Turmas" no módulo Sucesso do Cliente. Visão analítica de presença por turma para coordenação e administração.

## Período

Mês atual como padrão, com seletor de mês/ano.

## Estrutura

### Componentes

| Arquivo | Responsabilidade |
|---------|-----------------|
| `AnaliseTurmasTab.tsx` | Componente da aba (em `SucessoCliente/`) |
| `useAnaliseTurmas.ts` | Hook de data fetching (em `hooks/`) |
| RPC `rpc_analise_turmas` | Agregação server-side no PostgreSQL |

### Registro da aba

Em `TabSucessoAluno.tsx`:
- Adicionar `'analise'` ao union type do estado `subAba`
- Botão na barra de tabs (ícone: `BarChart3`)
- Renderizar `<AnaliseTurmasTab />` condicionalmente

## Data: RPC server-side

Volume de dados (~2k-10k rows/mês) torna inviável fetch client-side pelo limite de 1000 rows do PostgREST. Solução: RPC que retorna dados pré-agregados.

### `rpc_analise_turmas(p_unidade_id uuid, p_ano int, p_mes int)`

Retorna JSON com 3 seções:

```sql
-- Parâmetros opcionais: p_unidade_id = NULL para consolidado ("todos")
-- Período: 1º ao último dia do mês p_ano/p_mes
-- Filtros globais: cancelada IS NOT TRUE, tipo IN ('turma','individual')
-- Registros com aula_emusys_id IS NULL são excluídos (orphans legados)
-- Registros tipo='ensaio' são excluídos
```

**Retorno:**

```jsonc
{
  "kpis": {
    "total_aulas": 142,        // COUNT DISTINCT aulas tipo='turma', cancelada != true
    "presenca_geral_pct": 78.5, // presentes/total WHERE tipo='individual'
    "turmas_criticas": 3,       // turmas com presença < 60%
    "alunos_risco": 8           // alunos com 3+ faltas consecutivas
  },
  "turmas": [
    {
      "turma_nome": "MpB_Sá_08",
      "curso_nome": "Musicalização para Bebês T",
      "professor_nome": "Pedro Sérgio",    // do registro individual (mais frequente)
      "horario": "Sáb 08:00",             // dia da semana + hora extraídos do data_hora_inicio mais frequente
      "qtd_alunos": 3,                     // COUNT DISTINCT aluno_id
      "qtd_aulas": 6,                      // COUNT aulas tipo='turma'
      "presenca_pct": 66.7,
      "presenca_anterior_pct": 72.0,       // mês anterior (null se não existir)
      "alunos": [                          // detalhamento por aluno
        { "nome": "Laura Turques", "presentes": 2, "total": 6, "pct": 33.3, "ultima_presenca": "2026-04-11" }
      ]
    }
  ],
  "alunos_risco": [
    {
      "nome": "Laura Turques",
      "turma_nome": "MpB_Sá_08",
      "curso_nome": "Musicalização para Bebês T",
      "faltas_seguidas": 4,                // consecutivas por sessão de aula (não dias corridos)
      "ultima_presenca": "2026-03-15"
    }
  ]
}
```

### Regras de cálculo

**Faltas consecutivas:**
- Consecutivas = sessões de aula do aluno (não dias corridos). Se o aluno tem aula Ter/Qui e falta Ter e Qui = 2 consecutivas.
- Filtrar por `tipo='individual'` (presença real).
- Aulas canceladas (`cancelada = true`) são ignoradas (não quebram nem contam na sequência).
- Limite: top 20 ordenado por faltas_seguidas DESC.

**Professor da turma:**
- Usar `professor_nome` do registro `tipo='individual'` mais frequente para aquela turma no período (MODE).

**Horário da turma:**
- Extrair dia da semana + hora de `data_hora_inicio` mais frequente. Formato: "Sáb 08:00".

**Tendência (mês anterior):**
- Se a turma não existia no mês anterior: `presenca_anterior_pct = null` → mostrar badge "Nova" no frontend.
- Se existia: calcular % presença do mês anterior com mesma lógica.

**Unidade consolidada (`'todos'`):**
- Quando `p_unidade_id IS NULL`, omitir filtro de unidade. A RPC agrega todas as unidades.

## Seções do componente

### Seção 1: KPIs (cards no topo)

4 cards inline (mesma estética dos KPIs da PresencaTab):

| KPI | Valor | Cor |
|-----|-------|-----|
| Total de Aulas | `kpis.total_aulas` | violet |
| % Presença Geral | `kpis.presenca_geral_pct` | verde/amarelo/vermelho por threshold |
| Turmas Críticas | `kpis.turmas_criticas` | vermelho se > 0 |
| Alunos em Risco | `kpis.alunos_risco` | vermelho se > 0 |

### Seção 2: Tabela de Turmas (ranking)

Tabela ordenável, default: presença ASC (piores primeiro).

| Coluna | Ordenável |
|--------|-----------|
| Turma | Sim |
| Curso | Sim |
| Professor | Sim |
| Horário | Sim |
| Alunos | Sim |
| Aulas | Sim |
| % Presença (com barra visual) | Sim (default) |
| Tendência (seta + delta) | Não |

**Visual:**
- Barra de progresso: verde ≥80%, amarelo ≥60%, vermelho <60%
- Tendência: ↑ verde (melhorou), ↓ vermelho (piorou), — cinza (estável ±2%), "Nova" badge se null
- Row expansível: clicar mostra alunos da turma (mini tabela: Nome, Presenças, Faltas, %, Última presença)

### Seção 3: Alunos em Risco

Tabela simples (top 20):

| Coluna |
|--------|
| Aluno |
| Turma |
| Curso |
| Faltas seguidas |
| Última presença |

Ordenado por faltas seguidas DESC.

## Hook: useAnaliseTurmas

```typescript
function useAnaliseTurmas(unidadeAtual: UnidadeId, ano: number, mes: number): {
  loading: boolean;
  data: AnaliseTurmasData | null;
  refetch: () => void;
}
```

Chama `supabase.rpc('rpc_analise_turmas', { p_unidade_id, p_ano: ano, p_mes: mes })`.
- Quando `unidadeAtual === 'todos'`, passa `p_unidade_id: null`.
- Sorting da tabela de turmas é client-side (dados já agregados, ~50 turmas max).

## Padrões seguidos

- Hook customizado para data fetching (sem React Query)
- Tailwind + dark mode (slate-800/50, violet accents)
- Variáveis em português
- RPC para queries complexas (padrão existente: `get_kpis_consolidados`)

## Fora de escopo

- Heatmap de presença por horário
- Exportação Excel/PDF
- Notificações automáticas
- Alteração na edge function de sync
- Index em `(unidade_id, data_aula)` — avaliar se necessário após implementação
