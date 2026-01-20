# 📋 AUDITORIA COMPLETA - SISTEMA DE METAS

## Data: 19 de Janeiro de 2026
## Sistema: LA Music Performance Report 2026

---

## 1. AUDITORIA DO BANCO DE DADOS (SUPABASE)

### 1.1 Tabela `metas` - Estrutura

**Existem DUAS estruturas diferentes no código:**

#### Estrutura A - Definida em `database.types.ts` (Antiga/Legada)
```typescript
metas: {
  Row: {
    id: string
    unidade_id: string
    ano: number
    meta_alunos: number
    meta_matriculas_mes: number
    meta_evasoes_max: number
    meta_churn: number
    meta_renovacao: number
    meta_ticket: number
    meta_permanencia: number
    meta_inadimplencia: number
    meta_faturamento: number
    created_at: string
    updated_at: string
  }
}
```
- **Formato:** Colunas fixas para cada tipo de meta
- **Granularidade:** Por unidade + ano (sem mês)
- **Problema:** Não suporta metas mensais

#### Estrutura B - Usada em `MetasPage.tsx` (Nova/Atual)
```typescript
interface Meta {
  id: number;
  ano: number;
  mes: number;
  unidade_id: string;
  tipo: string;  // 'matriculas', 'leads', 'experimentais', etc.
  valor: number;
  created_at?: string;
}
```
- **Formato:** Flexível com campo `tipo`
- **Granularidade:** Por unidade + ano + mês + tipo
- **Vantagem:** Suporta qualquer tipo de meta

### 1.2 SQL de Criação Esperado (Estrutura B)
```sql
CREATE TABLE metas (
  id SERIAL PRIMARY KEY,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  unidade_id UUID REFERENCES unidades(id),
  tipo VARCHAR(50) NOT NULL,
  valor DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ano, mes, unidade_id, tipo)
);

-- Índices
CREATE INDEX idx_metas_ano ON metas(ano);
CREATE INDEX idx_metas_unidade ON metas(unidade_id);
CREATE INDEX idx_metas_tipo ON metas(tipo);
```

### 1.3 Tabelas Relacionadas
- ❌ `metas_tipos` - **NÃO EXISTE** (tipos são hardcoded no frontend)
- ❌ `metas_historico` - **NÃO EXISTE**
- ❌ Nenhuma outra tabela com "meta" no nome

### 1.4 Views que Usam Metas
- ❌ **NENHUMA VIEW** usa a tabela metas atualmente
- ⚠️ Não existe view `vw_realizado_vs_meta` ou similar

---

## 2. AUDITORIA DO FRONTEND

### 2.1 Estrutura de Pastas

```
src/
├── components/
│   ├── App/
│   │   ├── Metas/
│   │   │   ├── MetasPage.tsx      ← Página principal de metas
│   │   │   └── index.ts
│   │   ├── Dashboard/
│   │   ├── Layout/
│   │   └── ...
│   ├── GestaoMensal/              ← Analytics
│   │   ├── GestaoMensalPage.tsx
│   │   ├── TabGestao.tsx
│   │   ├── TabComercialNew.tsx
│   │   └── TabProfessoresNew.tsx
│   └── ui/
│       ├── KPICard.tsx            ← Componente de KPI
│       ├── MetaProgress.tsx       ← Barra de progresso de meta
│       └── ...
├── hooks/
│   ├── useMetas.ts                ← Hook principal de metas
│   ├── useSupabase.ts             ← Hook genérico (inclui metas)
│   └── useSupabaseMutations.ts    ← Mutations de metas
└── types/
    └── database.types.ts          ← Tipos do banco
```

### 2.2 Página de Metas (`MetasPage.tsx`)

**Localização:** `src/components/App/Metas/MetasPage.tsx`

**Funcionalidades:**
- ✅ Carrega metas do banco por ano
- ✅ Exibe tabela inline editável por unidade
- ✅ Salva alterações no banco (com botão)
- ⚠️ Botão "Salvar" só aparece quando há alterações
- ⚠️ Filtro de unidade local (redundante com header)

**Tipos de Meta Hardcoded (9 tipos):**
```typescript
const TIPOS_META = [
  { id: 'matriculas', label: 'Matrículas', icon: Users },
  { id: 'leads', label: 'Leads', icon: TrendingUp },
  { id: 'experimentais', label: 'Experimentais', icon: TrendingUp },
  { id: 'renovacoes', label: 'Renovações', icon: RefreshCw },
  { id: 'evasoes_max', label: 'Evasões (máx)', icon: TrendingDown },
  { id: 'faturamento', label: 'Faturamento', icon: DollarSign },
  { id: 'ticket_medio', label: 'Ticket Médio', icon: DollarSign },
  { id: 'taxa_conversao', label: 'Taxa Conversão (%)', icon: TrendingUp },
  { id: 'taxa_renovacao', label: 'Taxa Renovação (%)', icon: RefreshCw },
];
```

**Fluxo de Salvamento:**
```
1. Usuário edita valor na célula
2. Valor vai para Map `editedMetas` (memória)
3. Botão "Salvar Metas" aparece
4. Ao clicar, faz upsert no banco
5. Recarrega dados
```

### 2.3 Componente KPICard

**Localização:** `src/components/ui/KPICard.tsx`

**Props Relevantes para Metas:**
```typescript
interface KPICardProps {
  value: string | number;
  target?: number;              // ✅ JÁ EXISTE prop de meta!
  format?: 'number' | 'currency' | 'percent';
  // ...
}
```

**Funcionalidade de Meta Existente:**
```typescript
// Linha 114 - Calcula progresso
const metaPercent = target && typeof value === 'number' 
  ? (value / target) * 100 
  : null;

// Linha 115-121 - Cor automática
const getMetaColor = () => {
  if (!metaPercent) return 'bg-slate-600';
  if (metaPercent >= 100) return 'bg-emerald-500';  // 🟢 Atingida
  if (metaPercent >= 80) return 'bg-cyan-500';      // 🔵 Quase
  if (metaPercent >= 50) return 'bg-amber-500';     // 🟡 Atenção
  return 'bg-rose-500';                              // 🔴 Crítico
};
```

**Barra de Progresso (apenas size='lg'):**
```typescript
// Linha 272-286
{target && metaPercent !== null && size === 'lg' && (
  <div className="mt-3">
    <div className="flex justify-between text-[10px] text-slate-500 mb-1">
      <span>Meta: {formatValue(target, format)}</span>
      <span>{metaPercent.toFixed(0)}%</span>
    </div>
    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
      <div 
        className={cn("h-full rounded-full", getMetaColor())}
        style={{ width: `${Math.min(metaPercent, 100)}%` }}
      />
    </div>
  </div>
)}
```

**⚠️ PROBLEMA:** A barra só aparece quando `size === 'lg'`, mas a maioria dos KPIs usa `size='md'`.

### 2.4 Componente MetaProgress

**Localização:** `src/components/ui/MetaProgress.tsx`

**Componente standalone para barra de progresso:**
```typescript
interface MetaProgressProps {
  current: number;
  target: number;
  label?: string;
  showPercentage?: boolean;
  showValues?: boolean;
  format?: 'number' | 'currency' | 'percent';
  color?: 'cyan' | 'green' | 'red' | 'yellow' | 'auto';
  size?: 'sm' | 'md' | 'lg';
}
```

**⚠️ PROBLEMA:** Este componente existe mas NÃO está sendo usado em lugar nenhum!

### 2.5 Hook useMetas

**Localização:** `src/hooks/useMetas.ts`

**Funcionalidades:**
- ✅ Busca metas do banco
- ✅ Busca dados realizados (matrículas, leads, etc.)
- ✅ Calcula progresso e status
- ✅ Gera alertas automáticos

**Interface de Retorno:**
```typescript
interface UseMetasResult {
  metas: Meta[];
  progresso: ProgressoMeta[];
  alertas: AlertaMeta[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

interface ProgressoMeta {
  tipo: string;
  label: string;
  meta: number;
  realizado: number;
  percentual: number;
  projecao: number;
  status: 'atingida' | 'em_andamento' | 'atrasada' | 'critica';
}
```

**Dados Realizados que Busca:**
- ✅ Matrículas (tabela `alunos`)
- ✅ Leads (tabela `leads`)
- ✅ Experimentais (tabela `leads` com status)
- ✅ Renovações (tabela `renovacoes`)
- ✅ Evasões (tabela `evasoes_v2`)
- ❌ Faturamento (não implementado)
- ❌ Ticket Médio (não implementado)
- ❌ Taxas (não implementado)

**⚠️ PROBLEMA:** Hook existe mas NÃO está sendo usado na Analytics!

---

## 3. RESPOSTAS ÀS PERGUNTAS ESPECÍFICAS

### 1. A tabela `metas` existe no Supabase?
**SIM**, existe com estrutura flexível (tipo, valor, mes).

### 2. A página de Metas já salva dados?
**SIM**, mas com botão manual (não é auto-save).
- Edições ficam em memória (`editedMetas` Map)
- Botão "Salvar Metas" faz upsert no banco
- Feedback: `alert('Metas salvas com sucesso!')`

### 3. Qual é o formato dos dados de metas?
```
unidade_id + ano + mes + tipo = valor único
```
Exemplo:
| unidade_id | ano | mes | tipo | valor |
|------------|-----|-----|------|-------|
| uuid-cg | 2026 | 1 | matriculas | 50 |
| uuid-cg | 2026 | 1 | leads | 200 |
| uuid-rec | 2026 | 1 | matriculas | 40 |

### 4. Os KPIs da Analytics já recebem metas?
**NÃO!** O componente `KPICard` tem a prop `target`, mas:
- Nenhum KPI da Analytics passa essa prop
- O hook `useMetas` não é usado na Analytics
- Não há conexão entre metas e KPIs

### 5. Existe view/função que calcula realizado vs meta?
**NÃO** no banco. Existe apenas no hook `useMetas.ts` (frontend).

### 6. Quais são os tipos de meta cadastrados?
**9 tipos hardcoded:**
1. `matriculas` - Matrículas
2. `leads` - Leads
3. `experimentais` - Experimentais
4. `renovacoes` - Renovações
5. `evasoes_max` - Evasões (máximo)
6. `faturamento` - Faturamento
7. `ticket_medio` - Ticket Médio
8. `taxa_conversao` - Taxa Conversão (%)
9. `taxa_renovacao` - Taxa Renovação (%)

---

## 4. DIAGRAMA DE RELACIONAMENTO

### Estado Atual (Desconectado)
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Tabela metas   │     │   MetasPage     │     │    Analytics    │
│  (Supabase)     │────▶│   (Frontend)    │     │    (KPIs)       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │                       │                       │
        ▼                       ▼                       ▼
   Salva/Carrega          Edita metas            Exibe KPIs
   via upsert             inline                 SEM metas
                                                      ❌
```

### Estado Desejado (Conectado)
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Tabela metas   │────▶│   useMetas()    │────▶│    Analytics    │
│  (Supabase)     │     │   (Hook)        │     │    (KPIs)       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │                       │                       │
        ▼                       ▼                       ▼
   Armazena metas         Calcula                Exibe KPIs
   por tipo/mês           realizado vs meta      COM barra de
                          + alertas              progresso 🟢🟡🔴
```

---

## 5. PROBLEMAS IDENTIFICADOS

| # | Problema | Severidade | Impacto |
|---|----------|------------|---------|
| 1 | **Filtro de unidade redundante** | Média | UX confusa |
| 2 | **3 tabelas por unidade** | Média | Ocupa espaço |
| 3 | **Apenas 9 tipos de meta** | Alta | Não cobre 70+ KPIs |
| 4 | **Não usa filtro do header** | Média | Inconsistência |
| 5 | **Sem abas Gestão/Comercial/Professores** | Alta | Não segue Analytics |
| 6 | **Botão Salvar escondido** | Baixa | Pode confundir |
| 7 | **KPIs não recebem metas** | Crítica | Feature não funciona |
| 8 | **Barra só aparece em size='lg'** | Alta | Maioria não vê |
| 9 | **MetaProgress não usado** | Média | Código morto |
| 10 | **useMetas não usado na Analytics** | Crítica | Desconectado |

---

## 6. RECOMENDAÇÕES

### Fase 1 - Correções Imediatas
1. ✅ Remover filtro de unidade local (usar header)
2. ✅ Mostrar apenas 1 tabela (baseada no filtro global)
3. ✅ Adicionar abas: Gestão, Comercial, Professores
4. ✅ Expandir tipos de meta para cobrir mais KPIs

### Fase 2 - Integração com Analytics
1. ✅ Usar hook `useMetas` na Analytics
2. ✅ Passar prop `target` para KPICard
3. ✅ Habilitar barra de progresso em todos os tamanhos
4. ✅ Adicionar indicadores visuais (🟢🟡🔴)

### Fase 3 - Melhorias
1. ✅ Auto-save com debounce
2. ✅ View no banco para realizado vs meta
3. ✅ Alertas na Dashboard
4. ✅ Histórico de alterações

---

## 7. ARQUIVOS PARA MODIFICAR

| Arquivo | Ação |
|---------|------|
| `MetasPage.tsx` | Redesenhar com abas e filtro global |
| `KPICard.tsx` | Habilitar barra em todos os tamanhos |
| `TabGestao.tsx` | Integrar useMetas |
| `TabComercialNew.tsx` | Integrar useMetas |
| `TabProfessoresNew.tsx` | Integrar useMetas |
| `useMetas.ts` | Expandir tipos e cálculos |
| `database.types.ts` | Atualizar interface Meta |

---

## 8. PRÓXIMOS PASSOS

Aguardando confirmação do usuário sobre:

1. **Filtro de Unidade:** Usar apenas o do header global?
2. **Estrutura de Abas:** 3 abas igual Analytics?
3. **Seleção de KPIs:** Checkbox ou todos visíveis?
4. **Salvamento:** Botão manual ou auto-save?
5. **Metas Consolidadas:** Soma das unidades ou meta separada?

---

*Auditoria gerada em 19/01/2026*
*Sistema: LA Music Performance Report 2026*
