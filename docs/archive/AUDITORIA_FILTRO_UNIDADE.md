# Auditoria de Filtragem por Unidade - Dashboard

## Data: 04/02/2026

## Problema Identificado
Usuários de unidade (ex: Barra) estavam vendo dados consolidados de TODAS as unidades (897 alunos) em vez de apenas sua unidade (195 alunos).

**Criticidade: ALTA** - Vazamento de informações entre unidades.

---

## Auditoria do DashboardPage.tsx

### Queries Analisadas e Status:

| Linha | Query/View | Filtro Antes | Filtro Depois | Status |
|-------|-----------|--------------|---------------|--------|
| 136-148 | `vw_dashboard_unidade` (setDados) | ❌ NÃO | ✅ SIM | **CORRIGIDO** |
| 151-158 | `vw_alertas_inteligentes` | ✅ SIM | ✅ SIM | OK |
| 173-182 | `vw_kpis_gestao_mensal` | ✅ SIM | ✅ SIM | OK |
| 185-196 | `dados_mensais` (histórico gestão) | ✅ SIM | ✅ SIM | OK |
| 246-258 | `vw_kpis_comercial_historico` | ✅ SIM | ✅ SIM | OK |
| 262-278 | `dados_comerciais` (mês atual) | ✅ SIM | ✅ SIM | OK |
| 320-328 | `professores` + `professores_unidades` | ✅ SIM | ✅ SIM | OK |
| 331-339 | `vw_turmas_implicitas` + `professores_performance` | ✅ SIM | ✅ SIM | OK |
| 423-436 | `dados_mensais` (evolução 12 meses) | ❌ NÃO | ✅ SIM | **CORRIGIDO** |
| 457-479 | `vw_dashboard_unidade` (resumoUnidades - atual) | ❌ NÃO | ✅ SIM | **CORRIGIDO** |
| 484-528 | `unidades` + `dados_mensais` (histórico) | ❌ NÃO | ✅ SIM | **CORRIGIDO** |
| 531-551 | `vw_dashboard_unidade` (fallback) | ❌ NÃO | ✅ SIM | **CORRIGIDO** |

---

## Correções Aplicadas

### 1. Query Principal do Dashboard (linha 136-148)
```typescript
// ANTES
const { data: dashboardData } = await supabase
  .from('vw_dashboard_unidade')
  .select('*');

// DEPOIS
let dashboardQuery = supabase
  .from('vw_dashboard_unidade')
  .select('*');

if (unidade !== 'todos') {
  dashboardQuery = dashboardQuery.eq('unidade_id', unidade);
}

const { data: dashboardData } = await dashboardQuery;
```

### 2. Evolução de Alunos (linha 423-436)
```typescript
// ANTES
const { data: evolucaoData } = await supabase
  .from('dados_mensais')
  .select('ano, mes, alunos_pagantes')
  .gte('ano', ano - 1)
  .order('ano', { ascending: true })
  .order('mes', { ascending: true });

// DEPOIS
let evolucaoQuery = supabase
  .from('dados_mensais')
  .select('ano, mes, alunos_pagantes, unidade_id')
  .gte('ano', ano - 1)
  .order('ano', { ascending: true })
  .order('mes', { ascending: true });

if (unidade !== 'todos') {
  evolucaoQuery = evolucaoQuery.eq('unidade_id', unidade);
}

const { data: evolucaoData } = await evolucaoQuery;
```

### 3. Resumo por Unidade - Período Atual (linha 457-479)
```typescript
// ANTES
const { data: dashboardUnidades } = await supabase
  .from('vw_dashboard_unidade')
  .select('*');

// DEPOIS
let resumoQuery = supabase
  .from('vw_dashboard_unidade')
  .select('*');

if (unidade !== 'todos') {
  resumoQuery = resumoQuery.eq('unidade_id', unidade);
}

const { data: dashboardUnidades } = await resumoQuery;
```

### 4. Resumo por Unidade - Período Histórico (linha 484-528)
- Adicionado filtro em `unidades` query
- Adicionado filtro em `dados_mensais` query

### 5. Resumo por Unidade - Fallback (linha 531-551)
- Adicionado filtro na query de fallback

---

## Como o Filtro Funciona

1. **`filtroAtivo`** vem do `OutletContext` (definido em `AppLayout.tsx`)
2. Para **admins**: `filtroAtivo` = UUID da unidade selecionada no dropdown OU 'todos' (consolidado)
3. Para **usuários de unidade**: `filtroAtivo` = UUID da sua unidade (fixo)
4. A variável `unidade` é definida como `filtroAtivo || 'todos'`
5. Todas as queries verificam `if (unidade !== 'todos')` antes de aplicar o filtro

---

## Validação

Para validar as correções:

1. Login como usuário de unidade (ex: barra@lamusic.com.br)
2. Verificar no Dashboard:
   - **Alunos Ativos**: deve mostrar apenas da Barra (~195)
   - **Gráfico Evolução**: escala deve ser menor (~0-240)
   - **Tabela Resumo**: deve mostrar apenas Barra
   - **Alertas**: apenas alertas da Barra

3. Login como admin (admin@lamusic.com.br)
4. Verificar que:
   - Com "Consolidado" selecionado: mostra todas as unidades
   - Com unidade específica: mostra apenas aquela unidade

---

## Outras Páginas Auditadas

| Página | Status | Observação |
|--------|--------|------------|
| Analytics (TabGestao) | ✅ OK | Já tinha filtro correto |
| Comercial | ✅ OK | Já tinha filtro correto |
| Professores | ✅ OK | Já tinha filtro correto |
| Alunos | ✅ OK | Já tinha filtro correto |

---

## Autor
Cascade AI - Auditoria de Segurança
