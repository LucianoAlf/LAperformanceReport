# PLANO: Filtros de Período nas Páginas Operacionais
**Data:** 22/01/2026  
**Objetivo:** Adicionar filtros de período (Mês, Trimestre, Semestre, Ano) nas páginas Comercial, Administrativa, Alunos e Professores

---

## 📊 AUDITORIA DO BANCO DE DADOS

### **Tabelas Principais e Campos de Data**

| Página | Tabela Principal | Campo de Data | Range Disponível | Total Registros |
|--------|------------------|---------------|------------------|-----------------|
| **Comercial** | `leads_diarios` | `data` | 2026-01-22 → 2026-01-22 | 1 |
| **Administrativa** | `movimentacoes_admin` | `data` | Sem dados ainda | 0 |
| **Alunos** | `alunos` | `data_matricula` | 2018-05-03 → 2025-12-19 | 904 |
| **Professores** | `professores` | `created_at` | N/A | N/A |

### **Views Disponíveis para Consulta Histórica**

✅ **vw_kpis_gestao_mensal** - KPIs mensais consolidados (ano, mes, unidade_id)  
✅ **dados_mensais** - Dados históricos mensais (ano, mes, unidade_id, 108 registros)  
✅ **alunos_historico** - Histórico de alunos (snapshots mensais)

---

## 🎯 ESTRATÉGIA DE IMPLEMENTAÇÃO

### **Decisão: Dados a partir de Janeiro/2026**

**Justificativa:**
- ✅ Sistema está em produção desde janeiro/2026
- ✅ Dados anteriores podem estar inconsistentes ou incompletos
- ✅ Foco em dados operacionais recentes e confiáveis
- ✅ Evita complexidade de migração de dados históricos

**Exceção:**
- Página **Alunos** pode mostrar histórico completo (tem dados desde 2018)
- Outras páginas: **janeiro/2026 em diante**

---

## 🔧 IMPLEMENTAÇÃO TÉCNICA

### **1. Componente de Filtro de Período (Reutilizável)**

Criar componente `PeriodFilter.tsx` baseado no filtro do Dashboard/Analytics:

```tsx
interface PeriodFilterProps {
  selectedPeriod: 'mes' | 'trim' | 'sem' | 'ano';
  selectedYear: number;
  selectedMonth: number;
  onPeriodChange: (period: 'mes' | 'trim' | 'sem' | 'ano') => void;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  minYear?: number; // Padrão: 2026
}
```

**Funcionalidades:**
- Botões: Mês, Trim, Sem, Ano
- Dropdown de Ano (2026, 2027, 2028...)
- Dropdown de Mês (Jan, Fev, Mar...)
- Cálculo automático de range de datas

---

### **2. Página Comercial**

**Tabela:** `leads_diarios`  
**Campo:** `data`  
**Filtro SQL:**

```sql
-- Mês
WHERE data >= '2026-01-01' AND data <= '2026-01-31'

-- Trimestre (Q1 = Jan-Mar)
WHERE data >= '2026-01-01' AND data <= '2026-03-31'

-- Semestre (S1 = Jan-Jun)
WHERE data >= '2026-01-01' AND data <= '2026-06-30'

-- Ano
WHERE data >= '2026-01-01' AND data <= '2026-12-31'
```

**Mudanças Necessárias:**
1. Adicionar estado `periodFilter` (mes, trim, sem, ano)
2. Adicionar estado `selectedYear` e `selectedMonth`
3. Atualizar query `loadData()` para usar range dinâmico
4. Adicionar componente `PeriodFilter` no header da página

**Impacto:**
- ✅ Permite ver leads/experimentais/matrículas de meses anteriores
- ✅ Facilita análise de tendências
- ✅ Comparação entre períodos

---

### **3. Página Administrativa**

**Tabela:** `movimentacoes_admin`  
**Campo:** `data`  
**Filtro SQL:** (mesmo padrão da Comercial)

**Mudanças Necessárias:**
1. Substituir dropdown de competência por `PeriodFilter`
2. Atualizar query `loadData()` para usar range dinâmico
3. Manter lógica de KPIs da view `vw_kpis_gestao_mensal`

**Impacto:**
- ✅ Permite ver renovações/evasões de períodos anteriores
- ✅ Análise de churn por trimestre/semestre
- ✅ Comparação de LTV entre períodos

---

### **4. Página Alunos**

**Tabela:** `alunos`  
**Campo:** `data_matricula` ou `status` (para filtrar ativos/inativos)  
**Estratégia:** Mostrar alunos **ativos no período selecionado**

**Filtro SQL:**

```sql
-- Alunos que estavam ativos no período
WHERE (
  data_matricula <= '2026-01-31' -- Matriculado antes do fim do período
  AND (
    data_saida IS NULL -- Ainda ativo
    OR data_saida >= '2026-01-01' -- Saiu depois do início do período
  )
)
```

**Mudanças Necessárias:**
1. Adicionar `PeriodFilter` no header
2. Atualizar query para filtrar alunos ativos no período
3. Adicionar indicador visual de período selecionado

**Impacto:**
- ✅ Ver snapshot de alunos em qualquer mês
- ✅ Análise de crescimento/redução da base
- ✅ Comparação entre períodos

---

### **5. Página Professores**

**Tabela:** `professores`  
**Estratégia:** Mostrar professores **ativos** (não precisa filtro de período)

**Alternativa:** Se quiser histórico de turmas/alunos por professor:
- Usar `alunos.professor_id` + `data_matricula`
- Mostrar quantos alunos o professor tinha em cada período

**Mudanças Necessárias:**
1. Avaliar se faz sentido filtro de período
2. Se sim: mostrar histórico de alunos por professor
3. Se não: manter como está (apenas lista de professores ativos)

**Decisão:** ⚠️ **Aguardar feedback do usuário**

---

## 📅 CÁLCULO DE RANGES DE DATA

### **Função Utilitária**

```typescript
export function getDateRange(
  period: 'mes' | 'trim' | 'sem' | 'ano',
  year: number,
  month: number
): { startDate: string; endDate: string } {
  
  if (period === 'mes') {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0); // Último dia do mês
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0]
    };
  }
  
  if (period === 'trim') {
    const trimestre = Math.ceil(month / 3);
    const startMonth = (trimestre - 1) * 3;
    const endMonth = startMonth + 2;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, endMonth + 1, 0);
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0]
    };
  }
  
  if (period === 'sem') {
    const semestre = month <= 6 ? 1 : 2;
    const startMonth = semestre === 1 ? 0 : 6;
    const endMonth = semestre === 1 ? 5 : 11;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, endMonth + 1, 0);
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0]
    };
  }
  
  // Ano
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`
  };
}
```

---

## 🎨 UI/UX - COMPONENTE DE FILTRO

### **Layout (baseado no Dashboard)**

```
┌─────────────────────────────────────────────────┐
│  [Mês] [Trim] [Sem] [Ano]   [2026 ▼]  [Jan ▼]  │
└─────────────────────────────────────────────────┘
```

**Comportamento:**
1. Botão ativo: gradiente roxo (como no Dashboard)
2. Botões inativos: cinza
3. Dropdown de mês: desabilitado se período = Ano
4. Ao mudar período: recarrega dados automaticamente

---

## 📋 CHECKLIST DE IMPLEMENTAÇÃO

### **Fase 1: Componente Reutilizável**
- [ ] Criar `src/components/ui/PeriodFilter.tsx`
- [ ] Criar `src/lib/dateRangeUtils.ts` com função `getDateRange()`
- [ ] Testar componente isoladamente

### **Fase 2: Página Comercial**
- [ ] Adicionar estados de período (period, year, month)
- [ ] Integrar `PeriodFilter` no header
- [ ] Atualizar `loadData()` para usar range dinâmico
- [ ] Testar com dados de janeiro/2026

### **Fase 3: Página Administrativa**
- [ ] Substituir dropdown de competência por `PeriodFilter`
- [ ] Atualizar `loadData()` para usar range dinâmico
- [ ] Atualizar query de KPIs para período selecionado
- [ ] Testar com dados de janeiro/2026

### **Fase 4: Página Alunos**
- [ ] Adicionar `PeriodFilter` no header
- [ ] Atualizar query para filtrar alunos ativos no período
- [ ] Adicionar indicador de período selecionado
- [ ] Testar com dados históricos (2018-2025)

### **Fase 5: Página Professores**
- [ ] Avaliar necessidade de filtro de período
- [ ] Se necessário: implementar histórico de alunos por professor
- [ ] Testar funcionalidade

### **Fase 6: Testes Finais**
- [ ] Testar navegação entre períodos
- [ ] Testar filtro de unidade + filtro de período
- [ ] Testar performance com grandes volumes
- [ ] Validar com usuários

---

## ⚠️ CONSIDERAÇÕES IMPORTANTES

### **1. Performance**
- Queries com range de data são eficientes (índices existem)
- Evitar consultas de períodos muito longos (> 1 ano)
- Usar paginação se necessário

### **2. Dados Históricos**
- **Comercial/Administrativa:** Janeiro/2026 em diante
- **Alunos:** Histórico completo disponível (2018-2025)
- **Professores:** Apenas ativos (sem histórico)

### **3. Compatibilidade**
- Manter retrocompatibilidade com código existente
- Período padrão: Mês atual
- Não quebrar funcionalidades existentes

### **4. Migração Gradual**
- Implementar página por página
- Testar cada página antes de prosseguir
- Coletar feedback dos usuários

---

## 🚀 PRÓXIMOS PASSOS

1. **Validar plano com usuário**
2. **Criar componente PeriodFilter**
3. **Implementar na Página Comercial** (piloto)
4. **Testar e validar**
5. **Replicar para outras páginas**

---

## 📊 RESUMO EXECUTIVO

**O que será implementado:**
- Filtros de período (Mês, Trim, Sem, Ano) nas páginas operacionais
- Componente reutilizável baseado no Dashboard
- Dados a partir de janeiro/2026 (exceto Alunos)

**Benefícios:**
- ✅ Consulta de dados históricos sem sair da página
- ✅ Análise de tendências e comparações
- ✅ Melhor experiência do usuário
- ✅ Sem necessidade de novas tabelas/views

**Impacto:**
- ⚡ Baixo risco (usa estrutura existente)
- 🎯 Alto valor (funcionalidade muito solicitada)
- 🚀 Implementação gradual e segura
