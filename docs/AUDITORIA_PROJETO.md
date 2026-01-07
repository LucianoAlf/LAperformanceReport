# RELATÓRIO DE AUDITORIA - DASHBOARD LA MUSIC
**Data:** 07 de Janeiro de 2026

---

## 1. RESUMO EXECUTIVO

| Métrica | Valor |
|---------|-------|
| **Total de arquivos src/** | 40+ |
| **Total de componentes** | 28 |
| **Total de hooks customizados** | 6 |
| **Total de tabelas no Supabase** | 11 |
| **Total de views** | 4 |
| **Total de functions/RPCs** | 12 |
| **Framework** | Vite + React 19 + TypeScript |
| **Biblioteca de gráficos** | Recharts 3.6 |
| **Estado do projeto** | Produção - 2 módulos funcionais (Gestão e Comercial) |

---

## 2. ESTRUTURA DE ARQUIVOS

```
d:\2026\LA-performance-report\
├── 📄 App.tsx                    # Componente principal (137KB) - Módulo Gestão
├── 📄 index.tsx                  # Entry point
├── 📄 index.html                 # HTML + Tailwind config
├── 📄 constants.tsx              # Constantes e dados estáticos
├── 📄 types.ts                   # Tipos globais (UnitData, Meta2026, Theme)
├── 📄 package.json               # Dependências
├── 📄 vite.config.ts             # Configuração Vite
├── 📄 tsconfig.json              # Configuração TypeScript
├── 📄 vercel.json                # Deploy Vercel
├── 📁 docs/
│   └── 📄 AUDITORIA_PROJETO.md   # Este arquivo
├── 📁 public/                    # Assets estáticos (logos)
└── 📁 src/
    ├── 📄 index.css              # Estilos globais + Tailwind
    ├── 📄 vite-env.d.ts          # Tipos Vite
    ├── 📁 lib/
    │   └── 📄 supabase.ts        # Cliente Supabase
    ├── 📁 types/
    │   ├── 📄 database.types.ts  # Tipos do banco de dados
    │   ├── 📄 comercial.ts       # Tipos do módulo Comercial
    │   └── 📄 speech.d.ts        # Tipos Web Speech API
    ├── 📁 hooks/
    │   ├── 📄 useSupabase.ts     # Hooks de leitura (Gestão)
    │   ├── 📄 useSupabaseMutations.ts # Hooks de escrita
    │   ├── 📄 useComercialData.ts    # Hook principal Comercial
    │   ├── 📄 useProfessoresData.ts  # Ranking professores
    │   ├── 📄 useCursosData.ts       # Ranking cursos
    │   └── 📄 useOrigemData.ts       # Origem dos leads
    └── 📁 components/
        ├── 📄 Metas2026.tsx          # Componente de metas
        ├── 📄 LearningsTimeline.tsx  # Timeline aprendizados
        ├── 📄 LearningsKPIs.tsx      # KPIs aprendizados
        ├── 📄 LearningsResponsaveis.tsx # Responsáveis
        ├── 📁 ui/
        │   ├── 📄 Typography.tsx     # Componentes de texto
        │   └── 📄 index.ts           # Exports
        ├── 📁 Jarvis/                # Assistente de voz (experimental)
        │   ├── 📄 Jarvis.tsx
        │   ├── 📄 JarvisOrb.tsx
        │   └── 📄 index.ts
        └── 📁 Comercial/             # ⭐ MÓDULO COMERCIAL COMPLETO
            ├── 📄 index.ts
            ├── 📄 ComercialDashboard.tsx    # Container principal
            ├── 📄 SidebarComercial.tsx      # Navegação lateral
            ├── 📄 PageSwitcher.tsx          # Troca Gestão/Comercial
            ├── 📄 ChartTooltip.tsx          # Tooltip customizado
            ├── 📄 ComercialInicio.tsx       # Página inicial
            ├── 📄 ComercialVisaoGeral.tsx   # Visão geral KPIs
            ├── 📄 ComercialFunil.tsx        # Funil de conversão
            ├── 📄 ComercialProfessores.tsx  # Ranking professores
            ├── 📄 ComercialCursos.tsx       # Ranking cursos
            ├── 📄 ComercialOrigem.tsx       # Origem dos leads
            ├── 📄 ComercialRanking.tsx      # Ranking unidades
            ├── 📄 ComercialSazonalidade.tsx # Análise sazonal
            ├── 📄 ComercialFinanceiro.tsx   # Dados financeiros
            ├── 📄 ComercialAlertas.tsx      # Alertas e insights
            └── 📄 ComercialMetas.tsx        # Metas 2026
```

---

## 3. BANCO DE DADOS SUPABASE

### 3.1 Tabelas Principais

#### TABELA: `unidades`
**Registros:** 3 | **RLS:** Habilitado
```
CAMPOS:
  - id (uuid) PK
  - nome (varchar) UNIQUE - "Campo Grande", "Recreio", "Barra"
  - codigo (varchar) UNIQUE - "cg", "recreio", "barra"
  - cor_primaria (varchar) - Cor hex da unidade
  - ativo (boolean) - Se está ativa
  - created_at (timestamptz)
  - updated_at (timestamptz)
```

#### TABELA: `dados_mensais`
**Registros:** 108 (36 meses × 3 unidades) | **RLS:** Habilitado
```
CAMPOS:
  - id (uuid) PK
  - unidade_id (uuid) FK → unidades.id
  - ano (integer) CHECK 2020-2030
  - mes (integer) CHECK 1-12
  - alunos_pagantes (integer)
  - novas_matriculas (integer)
  - evasoes (integer)
  - churn_rate (numeric)
  - ticket_medio (numeric)
  - taxa_renovacao (numeric)
  - tempo_permanencia (integer)
  - inadimplencia (numeric)
  - reajuste_parcelas (numeric)
  - faturamento_estimado (numeric) GENERATED
  - saldo_liquido (integer) GENERATED
  - created_at, updated_at (timestamptz)

ÍNDICES:
  - idx_dados_mensais_ano
  - idx_dados_mensais_ano_mes
  - idx_dados_mensais_unidade_ano
  - dados_mensais_unidade_id_ano_mes_key (UNIQUE)
```

#### TABELA: `dados_comerciais`
**Registros:** 36 (12 meses × 3 unidades) | **RLS:** Desabilitado
```
CAMPOS:
  - id (integer) PK
  - competencia (date) - "2025-01-01", "2025-02-01", etc.
  - unidade (varchar) - "Campo Grande", "Recreio", "Barra"
  - total_leads (integer)
  - aulas_experimentais (integer)
  - novas_matriculas_total (integer)
  - novas_matriculas_lamk (integer)
  - novas_matriculas_emla (integer)
  - ticket_medio_parcelas (numeric)
  - ticket_medio_passaporte (numeric)
  - faturamento_passaporte (numeric)
  - created_at, updated_at (timestamptz)

ÍNDICES:
  - idx_dados_comerciais_comp_unid
  - dados_comerciais_competencia_unidade_key (UNIQUE)
```

#### TABELA: `professores_experimentais`
**Registros:** 284 | **RLS:** Desabilitado
```
CAMPOS:
  - id (integer) PK
  - competencia (date)
  - unidade (varchar)
  - professor (varchar)
  - quantidade (integer)
  - created_at (timestamptz)

ÍNDICES:
  - idx_prof_exp_comp_unid
  - professores_experimentais_competencia_unidade_professor_key (UNIQUE)
```

#### TABELA: `cursos_matriculados`
**Registros:** 236 | **RLS:** Desabilitado
```
CAMPOS:
  - id (integer) PK
  - competencia (date)
  - unidade (varchar)
  - curso (varchar)
  - quantidade (integer)
  - created_at (timestamptz)

ÍNDICES:
  - idx_cursos_comp_unid
  - cursos_matriculados_competencia_unidade_curso_key (UNIQUE)
```

#### TABELA: `origem_leads`
**Registros:** 215 | **RLS:** Desabilitado
```
CAMPOS:
  - id (integer) PK
  - competencia (date)
  - unidade (varchar)
  - canal (varchar) - "Instagram", "Google", "Indicação", etc.
  - tipo (varchar) - "lead", "experimental", "matricula"
  - quantidade (integer)
  - created_at (timestamptz)

ÍNDICES:
  - idx_origem_comp_unid
  - origem_leads_competencia_unidade_canal_tipo_key (UNIQUE)
```

#### TABELA: `metas`
**Registros:** 6 (2 anos × 3 unidades) | **RLS:** Habilitado
```
CAMPOS:
  - id (uuid) PK
  - unidade_id (uuid) FK → unidades.id
  - ano (integer)
  - meta_alunos (integer)
  - meta_matriculas_mes (integer)
  - meta_evasoes_max (integer)
  - meta_churn (numeric)
  - meta_renovacao (numeric)
  - meta_ticket (numeric)
  - meta_permanencia (integer)
  - meta_inadimplencia (numeric)
  - meta_faturamento (numeric)
  - created_at, updated_at (timestamptz)
```

#### TABELA: `metas_comerciais`
**Registros:** 4 | **RLS:** Desabilitado
```
CAMPOS:
  - id (integer) PK
  - ano (integer)
  - unidade (varchar)
  - meta_leads (integer)
  - meta_experimentais (integer)
  - meta_matriculas (integer)
  - meta_taxa_conversao (numeric)
  - meta_ticket_medio (numeric)
  - created_at, updated_at (timestamptz)
```

#### TABELA: `anotacoes`
**Registros:** 0 | **RLS:** Habilitado
```
CAMPOS:
  - id (uuid) PK
  - unidade_id (uuid) FK → unidades.id
  - ano, mes (integer)
  - tipo (varchar) - "alerta", "insight", "acao"
  - titulo (varchar)
  - descricao (text)
  - cor (varchar)
  - resolvido (boolean)
  - created_at, updated_at (timestamptz)
```

#### TABELA: `dashboard_config`
**Registros:** 6 | **RLS:** Habilitado
```
CAMPOS:
  - id (uuid) PK
  - chave (varchar) UNIQUE
  - valor (jsonb)
  - descricao (text)
  - created_at, updated_at (timestamptz)
```

#### TABELA: `audit_log`
**Registros:** 169 | **RLS:** Habilitado
```
CAMPOS:
  - id (uuid) PK
  - tabela (varchar)
  - registro_id (uuid)
  - acao (varchar) - "INSERT", "UPDATE", "DELETE"
  - dados_antigos (jsonb)
  - dados_novos (jsonb)
  - usuario (varchar)
  - created_at (timestamptz)
```

### 3.2 Views

| View | Descrição |
|------|-----------|
| `vw_consolidado_anual` | KPIs consolidados por ano |
| `vw_unidade_anual` | KPIs por unidade e ano |
| `vw_sazonalidade` | Dados mensais para análise sazonal |
| `vw_ranking_unidades` | Ranking de performance das unidades |

### 3.3 Functions/RPCs

| Function | Parâmetros | Descrição |
|----------|------------|-----------|
| `get_kpis_consolidados` | p_ano | KPIs consolidados do grupo |
| `get_kpis_unidade` | p_unidade_codigo, p_ano | KPIs de uma unidade |
| `get_comparativo_anos` | p_ano_atual, p_ano_anterior | Comparativo entre anos |
| `get_heatmap_data` | p_ano, p_metrica | Dados para heatmap |
| `get_heatmap_totais` | p_ano, p_metrica | Totais para heatmap |
| `get_metas_vs_realizado` | - | Metas vs realizado |
| `upsert_dados_mensais` | múltiplos | Inserir/atualizar dados mensais |
| `upsert_metas` | múltiplos | Inserir/atualizar metas |
| `update_updated_at` | - | Trigger para updated_at |
| `audit_dados_mensais` | - | Trigger de auditoria |
| `audit_metas` | - | Trigger de auditoria |
| `calcular_variacao` | - | Cálculo de variação % |

---

## 4. HOOKS CUSTOMIZADOS

### Hook: `useSupabase.ts` (Módulo Gestão)

| Hook | Função | Retorna |
|------|--------|---------|
| `useUnidades()` | Busca unidades ativas | `{ data, loading, error }` |
| `useKpisConsolidados(ano)` | KPIs consolidados via RPC | `{ data, loading, error }` |
| `useKpisUnidade(codigo, ano)` | KPIs de uma unidade via RPC | `{ data, loading, error }` |
| `useComparativoAnos(atual, anterior)` | Comparativo via RPC | `{ data, loading, error }` |
| `useHeatmapData(ano, metrica)` | Dados para heatmap | `{ data, totais, loading, error }` |
| `useDadosMensais(ano?, unidadeId?)` | Dados mensais completos | `{ data, loading, error }` |
| `useMetas(ano?)` | Metas por ano | `{ data, loading, error }` |
| `useConsolidadoAnual()` | View consolidado anual | `{ data, loading, error }` |
| `useUnidadeAnual(ano?)` | View unidade anual | `{ data, loading, error }` |
| `useSazonalidade(ano)` | View sazonalidade | `{ data, loading, error }` |

### Hook: `useComercialData.ts` (Módulo Comercial)

| Hook | Função | Retorna |
|------|--------|---------|
| `useComercialData(ano, unidade)` | Dados comerciais + KPIs calculados | `{ dados, dadosMensais, dadosPorUnidade, kpis, metas, loading, error, refetch }` |
| `useUnidadeData(unidade, ano)` | Dados de uma unidade específica | `{ dados, loading }` |

### Hook: `useProfessoresData.ts`

| Hook | Função | Retorna |
|------|--------|---------|
| `useProfessoresData(ano, unidade)` | Ranking de professores por experimentais | `{ professores, loading }` |

### Hook: `useCursosData.ts`

| Hook | Função | Retorna |
|------|--------|---------|
| `useCursosData(ano, unidade)` | Ranking de cursos por matrículas | `{ cursos, loading }` |

### Hook: `useOrigemData.ts`

| Hook | Função | Retorna |
|------|--------|---------|
| `useOrigemData(ano, unidade)` | Origem dos leads com percentual | `{ origem, loading }` |

### Hook: `useSupabaseMutations.ts`

| Função | Descrição |
|--------|-----------|
| `updateDadosMensais(id, updates)` | Atualiza dados mensais |
| `upsertDadosMensais(params)` | Upsert via RPC |
| `updateMeta(id, updates)` | Atualiza metas |
| `upsertMeta(params)` | Upsert metas |
| `createAnotacao(anotacao)` | Cria anotação |
| `updateAnotacao(id, updates)` | Atualiza anotação |
| `deleteAnotacao(id)` | Deleta anotação |

---

## 5. TIPOS TYPESCRIPT

### Arquivo: `types.ts` (Raiz)

```typescript
interface UnitData {
  id: string;
  name: string;
  alunosDez: number;
  matriculasAno: number;
  evasoesAno: number;
  churnMedio: number;
  renovacaoMedia: number;
  ticketMedio: number;
  permanenciaMeses: number;
  inadimplencia: number;
  faturamentoMes: number;
  color: string;
  bgColor: string;
  evolution: { month, alunos, matriculas, evasoes }[];
}

interface Meta2026 {
  alunos: number;
  churn: string;
  renovacao: string;
  ticket: string;
  matriculas: number;
  inadimplencia: string;
  faturamento: string;
}

type Theme = 'dark' | 'light';
type MetricType = 'alunos' | 'matriculas' | 'evasoes' | 'churn' | 'ticket';
```

### Arquivo: `src/types/comercial.ts`

```typescript
interface DadosComerciais { ... }      // Dados da tabela dados_comerciais
interface ProfessorExperimental { ... } // Dados de professores
interface CursoMatriculado { ... }      // Dados de cursos
interface OrigemLead { ... }            // Dados de origem
interface MetaComercial { ... }         // Metas comerciais
interface KPIsComerciais { ... }        // KPIs calculados
interface DadosMensais { ... }          // Dados processados por mês
interface DadosUnidade { ... }          // Dados processados por unidade

type UnidadeComercial = 'Consolidado' | 'Campo Grande' | 'Recreio' | 'Barra';

type SecaoComercial = 
  | 'inicio' | 'visao-geral' | 'funil' | 'professores' 
  | 'cursos' | 'origem' | 'ranking' | 'sazonalidade' 
  | 'financeiro' | 'alertas' | 'metas';

const MESES_ABREV = ['Jan', 'Fev', ...];
const CORES_UNIDADES = { 'Campo Grande': '#06b6d4', ... };
const CORES_COMERCIAL = { primary: '#10b981', ... };
```

### Arquivo: `src/types/database.types.ts`

```typescript
interface Database {
  public: {
    Tables: {
      unidades: { Row, Insert, Update }
      dados_mensais: { Row, Insert, Update }
      metas: { Row, Insert, Update }
      anotacoes: { Row, Insert, Update }
      dashboard_config: { Row, Insert, Update }
    }
    Views: {
      vw_consolidado_anual: { Row }
      vw_unidade_anual: { Row }
      vw_sazonalidade: { Row }
    }
    Functions: {
      get_kpis_consolidados: { Args, Returns }
      get_kpis_unidade: { Args, Returns }
      get_comparativo_anos: { Args, Returns }
      get_heatmap_data: { Args, Returns }
      get_heatmap_totais: { Args, Returns }
    }
  }
}
```

---

## 6. NAVEGAÇÃO E FLUXO

### Arquitetura de Navegação

```
┌─────────────────────────────────────────────────────────────┐
│                        App.tsx                               │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │   Sidebar       │    │         Main Content            │ │
│  │   (Gestão)      │    │                                 │ │
│  │                 │    │   Scroll único com seções:      │ │
│  │  - Início       │    │   - cover (Início)              │ │
│  │  - Visão Geral  │    │   - overview (Visão Geral)      │ │
│  │  - Evolução     │    │   - evolution (Evolução)        │ │
│  │  - Análise      │    │   - units (Análise)             │ │
│  │  - Comparativo  │    │   - comparison (Comparativo)    │ │
│  │  - Sazonalidade │    │   - seasonality (Sazonalidade)  │ │
│  │  - Metas 2025   │    │   - goals2025 (Metas 2025)      │ │
│  │  - Reflexões    │    │   - reflections (Reflexões)     │ │
│  │  - Alertas      │    │   - alerts (Alertas)            │ │
│  │  - Metas 2026   │    │   - goals2026 (Metas 2026)      │ │
│  │  - Aprendizados │    │   - learnings (Aprendizados)    │ │
│  │  - Encerramento │    │   - closing (Encerramento)      │ │
│  │                 │    │                                 │ │
│  │ ┌─────────────┐ │    │                                 │ │
│  │ │ PageSwitcher│ │    │                                 │ │
│  │ │ [Gestão]    │ │    │                                 │ │
│  │ │ [Comercial] │ │    │                                 │ │
│  │ └─────────────┘ │    │                                 │ │
│  └─────────────────┘    └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ currentPage === 'comercial'
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  ComercialDashboard.tsx                      │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │ SidebarComercial│    │         Main Content            │ │
│  │                 │    │                                 │ │
│  │  - Início       │    │   Scroll único com seções:      │ │
│  │  - Visão Geral  │    │   - inicio                      │ │
│  │  - Funil        │    │   - visao-geral                 │ │
│  │  - Professores  │    │   - funil                       │ │
│  │  - Cursos       │    │   - professores                 │ │
│  │  - Origem       │    │   - cursos                      │ │
│  │  - Ranking      │    │   - origem                      │ │
│  │  - Sazonalidade │    │   - ranking                     │ │
│  │  - Financeiro   │    │   - sazonalidade                │ │
│  │  - Alertas      │    │   - financeiro                  │ │
│  │  - Metas 2026   │    │   - alertas                     │ │
│  │                 │    │   - metas                       │ │
│  │ ┌─────────────┐ │    │                                 │ │
│  │ │ PageSwitcher│ │    │                                 │ │
│  │ │ [Gestão]    │ │    │                                 │ │
│  │ │ [Comercial] │ │    │                                 │ │
│  │ └─────────────┘ │    │                                 │ │
│  └─────────────────┘    └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Mecanismo de Navegação

- **Tipo:** Estado React (sem React Router)
- **Scroll:** IntersectionObserver para detectar seção ativa
- **Sidebar:** Fixa à esquerda (w-64/w-72)
- **Troca de módulo:** `handlePageChange()` reseta seção para 'cover'/'inicio'

---

## 7. PADRÕES IDENTIFICADOS

### 7.1 Nomenclatura

| Tipo | Padrão | Exemplo |
|------|--------|---------|
| Componentes | PascalCase | `ComercialVisaoGeral.tsx` |
| Hooks | camelCase com `use` | `useComercialData.ts` |
| Tipos | PascalCase | `DadosComerciais` |
| Constantes | SCREAMING_SNAKE | `CORES_UNIDADES` |
| Arquivos de tipo | kebab-case | `database.types.ts` |

### 7.2 Estrutura de Componente

```tsx
// Imports
import { useState, useEffect } from 'react';
import { Icon } from 'lucide-react';
import { useHook } from '../../hooks/useHook';

// Interface de Props (se necessário)
interface Props {
  ano: number;
  unidade: UnidadeComercial;
  onAnoChange: (ano: number) => void;
}

// Componente
export function NomeComponente({ ano, unidade, onAnoChange }: Props) {
  const { dados, loading } = useHook(ano, unidade);
  
  return (
    <div className="p-8">
      {/* Conteúdo */}
    </div>
  );
}

// Export default
export default NomeComponente;
```

### 7.3 Padrão de Cores por Módulo

| Módulo | Cor Primária | Cor Secundária | Classe Tailwind |
|--------|--------------|----------------|-----------------|
| **Gestão** | Cyan (#00d4ff) | Pink (#ff3366) | `accent-cyan`, `accent-pink` |
| **Comercial** | Emerald (#10b981) | Teal (#14b8a6) | `emerald-500`, `teal-500` |

### 7.4 Padrão de Cards

```tsx
<div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
  <h3 className="text-lg font-semibold text-white mb-6">Título</h3>
  {/* Conteúdo */}
</div>
```

### 7.5 Padrão de Gráficos (Recharts)

```tsx
<ResponsiveContainer width="100%" height="100%">
  <BarChart data={data}>
    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
    <XAxis dataKey="name" stroke="#94a3b8" />
    <YAxis stroke="#94a3b8" />
    <Tooltip 
      cursor={{fill: '#1e293b'}}
      content={<ChartTooltip />}
    />
    <Bar dataKey="value" fill="#00d4ff" radius={[4, 4, 0, 0]} />
  </BarChart>
</ResponsiveContainer>
```

---

## 8. DEPENDÊNCIAS

### package.json

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.89.0",
    "lucide-react": "^0.562.0",
    "react": "^19.2.3",
    "react-dom": "^19.2.3",
    "recharts": "^3.6.0"
  },
  "devDependencies": {
    "@types/node": "^22.14.0",
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "~5.8.2",
    "vite": "^6.2.0"
  }
}
```

### Bibliotecas Principais

| Biblioteca | Versão | Uso |
|------------|--------|-----|
| React | 19.2.3 | Framework UI |
| Vite | 6.2.0 | Build tool |
| TypeScript | 5.8.2 | Tipagem |
| Supabase JS | 2.89.0 | Backend/DB |
| Recharts | 3.6.0 | Gráficos |
| Lucide React | 0.562.0 | Ícones |
| Tailwind CSS | (via CDN) | Estilização |

---

## 9. CONFIGURAÇÕES

### Supabase (`src/lib/supabase.ts`)

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
```

### Variáveis de Ambiente (`.env.local`)

```
VITE_SUPABASE_URL=https://ouqwbbermlzqqvtqwlul.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### Tailwind (via `index.html`)

```javascript
tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        grotesk: ['Space Grotesk', 'sans-serif'],
      },
      colors: {
        'accent-cyan': '#00d4ff',
        'accent-pink': '#ff3366',
        'accent-green': '#00cc66',
        'accent-yellow': '#ffaa00',
      }
    }
  }
}
```

---

## 10. RECOMENDAÇÕES PARA PRÓXIMA FASE (Retenção/Evasão)

### 10.1 Nova Tabela Sugerida: `evasoes`

```sql
CREATE TABLE evasoes (
  id SERIAL PRIMARY KEY,
  competencia DATE NOT NULL,
  unidade VARCHAR NOT NULL,
  aluno_id VARCHAR,
  nome_aluno VARCHAR,
  curso VARCHAR,
  motivo_categoria VARCHAR,  -- "Financeiro", "Mudança", "Insatisfação", etc.
  motivo_detalhe TEXT,
  tempo_permanencia INTEGER, -- meses
  ticket_medio NUMERIC,
  data_matricula DATE,
  data_evasao DATE,
  professor_principal VARCHAR,
  tentativa_retencao BOOLEAN DEFAULT false,
  retencao_sucesso BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX idx_evasoes_comp_unid ON evasoes(competencia, unidade);
CREATE INDEX idx_evasoes_motivo ON evasoes(motivo_categoria);
CREATE INDEX idx_evasoes_curso ON evasoes(curso);
```

### 10.2 Novo Hook Sugerido: `useEvasoesData.ts`

```typescript
export function useEvasoesData(ano: number, unidade: UnidadeComercial) {
  // Buscar evasões
  // Agrupar por motivo
  // Calcular métricas de retenção
  return { evasoes, porMotivo, porCurso, porProfessor, loading, error };
}
```

### 10.3 Novos Componentes Sugeridos

```
src/components/Retencao/
├── RetencaoDashboard.tsx      # Container principal
├── RetencaoVisaoGeral.tsx     # KPIs de retenção
├── RetencaoMotivos.tsx        # Análise por motivo
├── RetencaoCursos.tsx         # Evasão por curso
├── RetencaoProfessores.tsx    # Evasão por professor
├── RetencaoTendencias.tsx     # Tendências temporais
├── RetencaoAcoes.tsx          # Ações de retenção
└── SidebarRetencao.tsx        # Navegação
```

### 10.4 Integração Sugerida

- Adicionar "Retenção" como terceiro módulo no `PageSwitcher`
- Seguir mesmo padrão de cores (sugestão: `rose-500` / `red-500`)
- Usar mesmo padrão de scroll único com IntersectionObserver
- Reutilizar `ChartTooltip` e padrões de cards existentes

---

## 11. PONTOS DE ATENÇÃO

### ⚠️ Inconsistências Identificadas

1. **RLS inconsistente:** Algumas tabelas têm RLS habilitado (`dados_mensais`, `metas`), outras não (`dados_comerciais`, `professores_experimentais`)

2. **Padrão de unidade:** `dados_mensais` usa `unidade_id` (FK), `dados_comerciais` usa `unidade` (string)

3. **App.tsx muito grande:** 137KB com ~2665 linhas - considerar componentização

4. **Dados estáticos em `constants.tsx`:** Alguns dados que poderiam vir do banco estão hardcoded

5. **Jarvis experimental:** Componentes vazios (`Jarvis-fixed.tsx`, `Jarvis-new.tsx`)

### ✅ Pontos Positivos

1. **Tipagem completa:** TypeScript bem configurado com tipos para DB
2. **Hooks bem organizados:** Separação clara de responsabilidades
3. **Padrões visuais consistentes:** Cores, cards, gráficos padronizados
4. **Auditoria no banco:** Triggers de audit_log funcionando
5. **Índices otimizados:** Bons índices para queries frequentes

---

## 12. DIAGRAMA DE ARQUITETURA

```
┌─────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (Vite + React)                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │   App.tsx    │  │  Comercial   │  │  Retenção    │  (futuro)     │
│  │   (Gestão)   │  │  Dashboard   │  │  Dashboard   │               │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │
│         │                 │                 │                        │
│         └────────────┬────┴────────────────┘                        │
│                      │                                               │
│              ┌───────▼───────┐                                       │
│              │    Hooks      │                                       │
│              │ useSupabase   │                                       │
│              │ useComercial  │                                       │
│              │ useEvasoes    │ (futuro)                              │
│              └───────┬───────┘                                       │
│                      │                                               │
└──────────────────────┼───────────────────────────────────────────────┘
                       │
                       │ Supabase Client
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        SUPABASE (PostgreSQL)                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │  unidades   │  │dados_mensais│  │dados_comerc.│                  │
│  │  (3 rows)   │  │ (108 rows)  │  │  (36 rows)  │                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                  │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │professores  │  │   cursos    │  │origem_leads │                  │
│  │ (284 rows)  │  │ (236 rows)  │  │ (215 rows)  │                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                  │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │   metas     │  │metas_comerc.│  │  evasoes    │  (futuro)        │
│  │  (6 rows)   │  │  (4 rows)   │  │ (619 rows)  │                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                  │
│                                                                      │
│  ┌─────────────────────────────────────────────────┐                │
│  │                    VIEWS                         │                │
│  │  vw_consolidado_anual | vw_unidade_anual        │                │
│  │  vw_sazonalidade      | vw_ranking_unidades     │                │
│  └─────────────────────────────────────────────────┘                │
│                                                                      │
│  ┌─────────────────────────────────────────────────┐                │
│  │                   FUNCTIONS                      │                │
│  │  get_kpis_consolidados | get_kpis_unidade       │                │
│  │  get_comparativo_anos  | get_heatmap_data       │                │
│  │  upsert_dados_mensais  | upsert_metas           │                │
│  └─────────────────────────────────────────────────┘                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

**Fim do Relatório de Auditoria**

*Gerado automaticamente em 07/01/2026*
