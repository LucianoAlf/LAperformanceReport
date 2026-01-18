# 🏗️ ARQUITETURA FRONTEND V2 - LA Performance Report
## Baseado no Super Folha System (Benchmark)

> **Data:** 18/01/2026  
> **Objetivo:** Reorganizar o frontend usando o padrão cockpit com abas

---

## 1. NOVA ESTRUTURA DE PASTAS

```
src/
├── components/
│   ├── UI/                          # Componentes base reutilizáveis
│   │   ├── index.ts                 # Export barrel
│   │   ├── Card.tsx
│   │   ├── Badge.tsx
│   │   ├── Modal.tsx
│   │   ├── CustomSelect.tsx
│   │   ├── Tooltip.tsx
│   │   ├── ConfirmDialog.tsx
│   │   ├── AlertDialog.tsx
│   │   ├── LoadingSpinner.tsx
│   │   ├── ErrorState.tsx
│   │   └── CellInput.tsx            # Input inline editável
│   │
│   ├── DashboardWidgets/            # KPIs e gráficos
│   │   ├── index.ts
│   │   ├── KPICard.tsx
│   │   ├── DistributionChart.tsx
│   │   └── EvolutionChart.tsx
│   │
│   ├── Layout/                      # Layout principal
│   │   ├── index.ts
│   │   ├── AppLayout.tsx            # Layout com sidebar + main
│   │   ├── AppSidebar.tsx           # Sidebar enxuta (4-5 itens)
│   │   └── AppHeader.tsx            # Header com seletor de mês
│   │
│   ├── GestaoMensal/                # Página cockpit principal
│   │   ├── index.ts
│   │   ├── GestaoMensalPage.tsx     # Container com abas
│   │   ├── TabDashboard.tsx         # Aba: visão geral
│   │   ├── TabComercial.tsx         # Aba: leads, exp, matrículas
│   │   ├── TabRetencao.tsx          # Aba: evasões, renovações
│   │   ├── TabProfessores.tsx       # Aba: rankings, performance
│   │   └── UnidadeFilter.tsx        # Filtro de unidade
│   │
│   ├── Entrada/                     # Formulários de entrada
│   │   └── ... (manter existente)
│   │
│   └── Auth/                        # Autenticação
│       └── ... (manter existente)
│
├── hooks/
│   ├── useGestaoMensal.ts           # Hook para dados da gestão mensal
│   ├── useComercialData.ts          # (manter)
│   ├── useEvasoesData.ts            # (manter)
│   └── useProfessoresData.ts        # Novo: dados de professores
│
├── types/
│   ├── database.types.ts            # Tipos do Supabase
│   └── gestao.types.ts              # Tipos da gestão mensal
│
└── lib/
    ├── supabase.ts                  # Cliente Supabase
    └── utils.ts                     # Utilitários (cn, formatCurrency, etc.)
```

---

## 2. NOVA SIDEBAR (ENXUTA)

```tsx
// 4-5 itens principais (como Super Folha)
const modules = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'gestao', label: 'Gestão Mensal', icon: BarChart3 },      // COCKPIT PRINCIPAL
  { id: 'entrada', label: 'Entrada de Dados', icon: PlusCircle },
  { id: 'metas', label: 'Metas', icon: Target },
  { id: 'config', label: 'Configurações', icon: Settings },
];
```

---

## 3. PÁGINA GESTÃO MENSAL (COCKPIT)

### 3.1 Estrutura de Abas

```tsx
const tabs = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'comercial', label: 'Comercial', icon: TrendingUp },
  { id: 'retencao', label: 'Retenção', icon: TrendingDown },
  { id: 'professores', label: 'Professores', icon: Users },
];
```

### 3.2 Layout da Página

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER: Gestão Mensal                    Mês: [Janeiro 2026 ▼] │
├─────────────────────────────────────────────────────────────────┤
│  TABS: [Dashboard] [Comercial] [Retenção] [Professores]         │
├─────────────────────────────────────────────────────────────────┤
│  FILTRO: [Consolidado] [Campo Grande] [Recreio] [Barra]         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CONTEÚDO DA ABA ATIVA                                          │
│  (KPIs, gráficos, tabelas inline)                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. COMPONENTES A CRIAR

### 4.1 KPICard (baseado no Super Folha)

```tsx
interface KPICardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subvalue?: string;
  trend?: 'up' | 'down';
  trendValue?: string;
  variant?: 'default' | 'cyan' | 'emerald' | 'violet' | 'amber' | 'rose';
}
```

### 4.2 CellInput (edição inline)

```tsx
interface CellInputProps {
  value: number;
  onSave: (val: number) => Promise<void>;
  disabled?: boolean;
  colorClass?: string;
}
```

### 4.3 UnidadeFilter

```tsx
interface UnidadeFilterProps {
  value: 'todos' | 'cg' | 'rec' | 'bar';
  onChange: (value: string) => void;
}
```

---

## 5. MAPEAMENTO DE ABAS → KPIs

### Aba Dashboard (Visão Geral)
| KPI | Fonte |
|-----|-------|
| Alunos Ativos | `alunos` WHERE status = 'ativo' |
| Alunos Pagantes | `alunos` WHERE tipo_matricula.entra_ltv = true |
| Ticket Médio | AVG(valor_parcela) |
| Churn Rate | `vw_dashboard_unidade` |
| LTV Médio | ticket_medio * permanencia_media |
| Inadimplência | `dados_mensais` |

### Aba Comercial (Hunters)
| KPI | Fonte |
|-----|-------|
| Leads (Mês) | `leads_diarios` tipo = 'lead' |
| Experimentais | `leads_diarios` tipo = 'experimental_realizada' |
| Matrículas | `leads_diarios` tipo = 'matricula' |
| Taxa Conversão | matriculas / experimentais * 100 |
| Faturamento Novo | SUM(valor_parcela) das matrículas |

### Aba Retenção (Farmers)
| KPI | Fonte |
|-----|-------|
| Evasões (Mês) | `evasoes_v2` |
| Renovações | `renovacoes` status = 'realizada' |
| Não Renovações | `renovacoes` status = 'nao_renovada' |
| Taxa Renovação | renovadas / (renovadas + nao_renovadas) * 100 |
| MRR Perdido | SUM(valor_parcela) das evasões |

### Aba Professores (Educadores)
| KPI | Fonte |
|-----|-------|
| Carteira Média | `vw_kpis_professor_completo` |
| Taxa Conversão | `vw_kpis_professor_completo` |
| Taxa Renovação | `vw_kpis_professor_completo` |
| Ranking Matriculador | `vw_kpis_professor_completo` |
| Ranking Churn | `vw_kpis_professor_completo` |

---

## 6. DEPENDÊNCIAS (MANTER EXISTENTES)

O LA Performance Report já usa:
- ✅ `lucide-react` - ícones
- ✅ `recharts` - gráficos
- ✅ `@supabase/supabase-js` - backend
- ✅ `react-router-dom` - rotas (diferente do Super Folha)
- ✅ `tailwindcss` - estilos
- ✅ `shadcn/ui` - componentes base

**Diferença:** O LA usa shadcn/ui + router, enquanto Super Folha usa Radix puro + state local. Vamos manter shadcn/ui mas adotar o padrão de abas do Super Folha.

---

## 7. ORDEM DE IMPLEMENTAÇÃO

### Fase 2A: Componentes Base (1-2h)
1. Criar `src/components/UI/KPICard.tsx`
2. Criar `src/components/UI/CellInput.tsx`
3. Criar `src/components/UI/UnidadeFilter.tsx`
4. Criar `src/lib/utils.ts` (cn, formatCurrency, parseBRL)

### Fase 2B: Página Gestão Mensal (2-3h)
1. Criar `src/components/GestaoMensal/GestaoMensalPage.tsx`
2. Implementar sistema de abas (Desktop + Mobile)
3. Implementar filtro de unidade
4. Criar abas: Dashboard, Comercial, Retenção, Professores

### Fase 2C: Reorganizar Sidebar (1h)
1. Simplificar sidebar para 4-5 itens
2. Remover seção "Planilhas" (vai para abas)
3. Atualizar rotas

### Fase 2D: Integrar Dados (2h)
1. Criar hooks para cada aba
2. Conectar com views do Supabase
3. Implementar cálculos de variação

---

## 8. PRÓXIMO PASSO

Começar pela **Fase 2A**: criar os componentes base (`KPICard`, `CellInput`, `UnidadeFilter`) que serão usados em todas as abas.

---

*Documento aprovado para implementação em 18/01/2026*
