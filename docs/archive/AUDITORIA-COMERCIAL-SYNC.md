# 🔍 AUDITORIA COMPLETA - PÁGINA COMERCIAL

## 📋 RESUMO EXECUTIVO

**Data:** 27/01/2026  
**Status:** ✅ **IMPLEMENTADO E TESTADO COM SUCESSO**  
**Solução:** Opção 2.5 - Triggers em Tempo Real + Validação Diária

---

## ✅ IMPLEMENTAÇÃO CONCLUÍDA

### **O que foi implementado:**

1. **Triggers em Tempo Real:**
   - `tr_sync_leads_comerciais` → Sincroniza `leads_diarios` → `dados_comerciais`
   - `tr_sync_leads_origem` → Sincroniza `leads_diarios` → `origem_leads`
   - Disparam em INSERT, UPDATE e DELETE

2. **Colunas Auxiliares em `dados_comerciais`:**
   - `soma_passaportes`, `qtd_matriculas_passaporte`
   - `soma_parcelas`, `qtd_matriculas_parcela`
   - Permitem cálculo incremental de médias (O(1) em vez de O(n))

3. **Funções de Validação Diária:**
   - `consolidar_dados_comerciais_mes(ano, mes)` - Recalcula do zero
   - `consolidar_origem_leads_mes(ano, mes)` - Recalcula origem_leads

4. **Lógica LAMK vs EMLA:**
   - LA Music Kids (LAMK): `aluno_idade <= 11`
   - LA Music School (EMLA): `aluno_idade > 11` ou NULL

### **Testes Executados:**
- ✅ INSERT de leads → `dados_comerciais.total_leads` atualizado
- ✅ DELETE de leads → Valor subtraído corretamente
- ✅ INSERT de matrícula LAMK → `novas_matriculas_lamk` incrementado
- ✅ Ticket médio calculado incrementalmente

### **Dados Consolidados (Jan/2026):**
| Unidade | Leads | Exp | Matrículas | LAMK | EMLA | Ticket Pass | Ticket Parc |
|---------|-------|-----|------------|------|------|-------------|-------------|
| Barra | 5 | 0 | 1 | 0 | 1 | R$ 600 | R$ 497 |
| Recreio | 0 | 0 | 1 | 0 | 1 | R$ 450 | R$ 497 |

---

## 📊 PROBLEMA ORIGINAL (RESOLVIDO)

---

## ❌ PROBLEMA IDENTIFICADO

### **DESCONEXÃO TOTAL ENTRE SISTEMAS**

A página **Comercial** tem o **MESMO PROBLEMA** do Administrativo: dados salvos em tabela isolada que **NÃO alimenta** os comparativos históricos.

```
❌ FLUXO ATUAL (QUEBRADO):

Hunters digitam no Comercial
         ↓
   leads_diarios (tabela isolada)
         ↓
    🚫 NÃO INTEGRA 🚫
         ↓
   dados_comerciais / origem_leads
         ↓
   Analytics / Comparativos
```

---

## 📊 ANÁLISE DETALHADA

### **1. Onde os Dados São Salvos**

**Página Comercial** (`ComercialPage.tsx`) salva em:
- **Tabela:** `leads_diarios`
- **Operações:** INSERT, UPDATE, DELETE
- **Tipos de registro:**
  - Leads (quantidade de leads recebidos)
  - Experimentais (aulas experimentais agendadas/realizadas)
  - Visitas (visitas agendadas)
  - Matrículas (conversões)

**Dados em `leads_diarios`:**
- Total: 5 registros
- Período: 22/01/2026 a 23/01/2026
- **Apenas dados de 2026** (sem histórico)

### **2. Onde os Comparativos Buscam Dados**

**Analytics - Aba Comercial** (`TabComercialNew.tsx`) busca comparativos de:

**Mês Anterior:**
```typescript
.from('dados_comerciais')
.eq('competencia', `${anoMesAnterior}-${mesAnterior}-01`)
```

**Ano Anterior:**
```typescript
.from('dados_comerciais')
.eq('competencia', `${ano - 1}-${mes}-01`)
```

**Também busca de `dados_mensais`** para matrículas:
```typescript
.from('dados_mensais')
.select('novas_matriculas, ticket_medio')
```

### **3. Tabelas Históricas**

| Tabela | Período | Registros | Alimentada por leads_diarios? |
|--------|---------|-----------|-------------------------------|
| `dados_comerciais` | 2025-01 a 2025-12 | 36 | ❌ **NÃO** |
| `origem_leads` | 2025-01 a 2025-12 | 523 | ❌ **NÃO** |
| `dados_mensais` | 2023-01 a 2025-12 | 108 | ❌ **NÃO** |
| `leads_diarios` | 2026-01 | 5 | ✅ Tabela atual |

### **4. Triggers Existentes**

```sql
-- Apenas 1 trigger em leads_diarios:
set_updated_at_leads_diarios → UPDATE → update_updated_at_column()
```

**Resultado:** ❌ **NÃO HÁ SINCRONIZAÇÃO AUTOMÁTICA**

---

## 🔍 COMPARAÇÃO: COMERCIAL vs ADMINISTRATIVO

| Aspecto | Administrativo | Comercial |
|---------|----------------|-----------|
| **Tabela Atual** | `movimentacoes_admin` | `leads_diarios` |
| **Tabela Histórica 1** | `evasoes` | `dados_comerciais` |
| **Tabela Histórica 2** | `renovacoes` | `origem_leads` |
| **Problema** | ❌ Desconexão | ❌ Desconexão |
| **Comparativos Funcionam?** | ❌ NÃO | ❌ NÃO |
| **Solução Aplicada** | ✅ Triggers criados | ⏳ Pendente |

---

## 📈 IMPACTO NOS COMPARATIVOS

### **Cards Afetados no Analytics - Comercial:**

1. **Total Leads**
   - Comparativo vs Mês Anterior: ❌ Não funciona
   - Comparativo vs Ano Anterior: ❌ Não funciona

2. **Experimentais Realizadas**
   - Comparativo vs Mês Anterior: ❌ Não funciona
   - Comparativo vs Ano Anterior: ❌ Não funciona

3. **Novas Matrículas**
   - Comparativo vs Mês Anterior: ⚠️ Parcial (usa `dados_mensais`)
   - Comparativo vs Ano Anterior: ⚠️ Parcial (usa `dados_mensais`)

4. **Ticket Médio Passaporte**
   - Comparativo vs Mês Anterior: ❌ Não funciona
   - Comparativo vs Ano Anterior: ❌ Não funciona

5. **Ticket Médio Parcela**
   - Comparativo vs Mês Anterior: ❌ Não funciona
   - Comparativo vs Ano Anterior: ❌ Não funciona

---

## 🎯 DADOS QUE PRECISAM SER SINCRONIZADOS

### **De `leads_diarios` para `dados_comerciais`:**

| Campo em leads_diarios | Campo em dados_comerciais | Agregação |
|------------------------|---------------------------|-----------|
| `tipo='lead'` | `total_leads` | SUM(quantidade) |
| `tipo='experimental'` | `aulas_experimentais` | SUM(quantidade) |
| `tipo='matricula'` | `novas_matriculas_total` | SUM(quantidade) |
| `valor_passaporte` | `ticket_medio_passaporte` | AVG(valor_passaporte) |
| `valor_parcela` | `ticket_medio_parcelas` | AVG(valor_parcela) |
| `valor_passaporte` | `faturamento_passaporte` | SUM(valor_passaporte) |

### **De `leads_diarios` para `origem_leads`:**

| Campo em leads_diarios | Campo em origem_leads | Agregação |
|------------------------|----------------------|-----------|
| `canal_origem_id` | `canal` | GROUP BY |
| `tipo` | `tipo` | GROUP BY |
| `quantidade` | `quantidade` | SUM(quantidade) |

---

## ⚠️ COMPLEXIDADE DA SOLUÇÃO

### **Diferenças em relação ao Administrativo:**

1. **Agregação Mensal:**
   - Administrativo: Sincronização direta (1 renovação = 1 registro)
   - Comercial: **Precisa agregar dados diários em totais mensais**

2. **Múltiplas Tabelas Destino:**
   - Administrativo: 2 tabelas (`evasoes`, `renovacoes`)
   - Comercial: **3 tabelas** (`dados_comerciais`, `origem_leads`, `dados_mensais`)

3. **Cálculos Complexos:**
   - Administrativo: Percentual de reajuste
   - Comercial: **Médias, somas, agrupamentos por canal/curso**

### **Abordagens Possíveis:**

#### **OPÇÃO 1: Consolidação Mensal Automática** ⭐ RECOMENDADA
- Criar função que roda automaticamente no fim do mês
- Agrega dados de `leads_diarios` do mês
- Insere/atualiza em `dados_comerciais` e `origem_leads`
- **Vantagem:** Dados consolidados, performance melhor
- **Desvantagem:** Comparativos só funcionam após fechamento do mês

#### **OPÇÃO 2: Triggers em Tempo Real**
- Trigger após INSERT/UPDATE/DELETE em `leads_diarios`
- Recalcula totais mensais e atualiza tabelas históricas
- **Vantagem:** Dados sempre atualizados
- **Desvantagem:** Performance (recalcula a cada inserção)

#### **OPÇÃO 3: View Materializada**
- Criar view materializada que agrega `leads_diarios`
- Refresh automático ou manual
- **Vantagem:** Flexibilidade
- **Desvantagem:** Complexidade de manutenção

---

## 🚨 RECOMENDAÇÃO

### **Implementar OPÇÃO 1: Consolidação Mensal**

**Por quê:**
1. ✅ Alinha com o modelo de negócio (fechamento mensal)
2. ✅ Performance superior (não recalcula a cada lead)
3. ✅ Dados consolidados e confiáveis
4. ✅ Facilita auditoria e correções

**Como:**
1. Criar função `consolidar_comercial_mensal(ano, mes)`
2. Agregar dados de `leads_diarios` do mês
3. Inserir/atualizar em `dados_comerciais` e `origem_leads`
4. Agendar execução automática (cron job ou scheduled function)
5. Permitir execução manual para correções

---

## 📝 PRÓXIMOS PASSOS

### **1. Decisão do Usuário**
- Escolher abordagem (Opção 1, 2 ou 3)
- Definir quando implementar

### **2. Implementação**
- Criar função de consolidação
- Criar triggers (se Opção 2)
- Testar com dados de 2026

### **3. Migração de Dados Históricos**
- Verificar se há dados em `leads_diarios` de 2025
- Se sim, consolidar retroativamente

### **4. Validação**
- Testar comparativos no Analytics
- Verificar se dados aparecem corretamente

---

## 📊 ESTRUTURA DE DADOS

### **leads_diarios (Tabela Atual)**
```sql
- id: integer
- unidade_id: uuid
- data: date
- tipo: varchar (lead, experimental, visita, matricula)
- canal_origem_id: integer
- curso_id: integer
- quantidade: integer
- valor_passaporte: numeric
- valor_parcela: numeric
- ... (28 campos totais)
```

### **dados_comerciais (Tabela Histórica)**
```sql
- id: integer
- competencia: date (formato: YYYY-MM-01)
- unidade: varchar
- total_leads: integer
- aulas_experimentais: integer
- novas_matriculas_total: integer
- ticket_medio_parcelas: numeric
- ticket_medio_passaporte: numeric
- faturamento_passaporte: numeric
```

### **origem_leads (Tabela Histórica)**
```sql
- id: integer
- competencia: date (formato: YYYY-MM-01)
- unidade: varchar
- canal: varchar
- tipo: varchar
- quantidade: integer
```

---

## ✅ CONCLUSÃO

**Status:** ❌ **PROBLEMA CONFIRMADO**

A página Comercial tem **exatamente o mesmo problema** do Administrativo:
- Dados salvos em tabela isolada (`leads_diarios`)
- **NÃO alimenta** tabelas históricas (`dados_comerciais`, `origem_leads`)
- **Comparativos NÃO funcionam** (mês anterior, ano anterior)

**Solução:** Implementar consolidação mensal automática para sincronizar `leads_diarios` → `dados_comerciais` + `origem_leads`.

---

**Auditoria realizada por:** Windsurf Cascade AI  
**Data:** 27/01/2026  
**Próxima ação:** Aguardar decisão do usuário sobre qual abordagem implementar
