# AUDITORIA DE KPIs - ABA GESTÃO
**Data:** 22/01/2026  
**Objetivo:** Mapear todos os KPIs da aba Gestão e identificar se os lançamentos da página Administrativa cobrem todas as necessidades

---

## 📊 SUB-ABA: ALUNOS

### KPIs Principais
| KPI | Fonte de Dados Atual | Coberto pela Pág. Administrativa? | Status |
|-----|---------------------|-----------------------------------|--------|
| **Total Alunos Ativos** | `vw_kpis_gestao_mensal.total_alunos_ativos` | ❌ NÃO | ⚠️ **LACUNA** - Vem de `alunos.status = 'ativo'` |
| **Alunos Pagantes** | `vw_kpis_gestao_mensal.total_alunos_pagantes` | ❌ NÃO | ⚠️ **LACUNA** - Vem de `alunos.tipo_aluno` |
| **LA Music Kids** | `vw_kpis_gestao_mensal.total_la_kids` | ❌ NÃO | ⚠️ **LACUNA** - Vem de `alunos.faixa_etaria` |
| **LA Music School** | `vw_kpis_gestao_mensal.total_la_adultos` | ❌ NÃO | ⚠️ **LACUNA** - Vem de `alunos.faixa_etaria` |
| **Banda** | `vw_kpis_gestao_mensal.total_banda` | ❌ NÃO | ⚠️ **LACUNA** - Vem de `matriculas.tipo = 'banda'` |
| **Novas Matrículas** | `vw_kpis_gestao_mensal.novas_matriculas` | ❌ NÃO | ⚠️ **LACUNA** - Vem de `matriculas` (página Comercial) |
| **Evasões** | `vw_kpis_gestao_mensal.evasoes` | ✅ SIM | ✅ **OK** - Modal Evasão |
| **Saldo Líquido** | Calculado (Matrículas - Evasões) | ⚠️ PARCIAL | ⚠️ Só evasões cobertas |
| **Bolsistas Integrais** | `vw_kpis_gestao_mensal.total_bolsistas_integrais` | ❌ NÃO | ⚠️ **LACUNA** - Vem de `alunos.tipo_aluno` |
| **Bolsistas Parciais** | `vw_kpis_gestao_mensal.total_bolsistas_parciais` | ❌ NÃO | ⚠️ **LACUNA** - Vem de `alunos.tipo_aluno` |

### Gráficos
| Gráfico | Fonte de Dados | Coberto? | Status |
|---------|---------------|----------|--------|
| **Distribuição por Unidade** | `alunos` agrupado por `unidade_id` | ❌ NÃO | ⚠️ **LACUNA** |
| **Evolução Mensal** | Histórico de `alunos`, `evasoes`, `matriculas` | ⚠️ PARCIAL | Só evasões |
| **Ranking de Professores (Matrículas)** | `matriculas` + `professores` | ❌ NÃO | ⚠️ **LACUNA** |
| **Ranking de Evasões por Professor** | `evasoes_v2` + `professores` | ✅ SIM | ✅ Modal Evasão tem professor |

---

## 💰 SUB-ABA: FINANCEIRO

### KPIs Principais
| KPI | Fonte de Dados Atual | Coberto pela Pág. Administrativa? | Status |
|-----|---------------------|-----------------------------------|--------|
| **Ticket Médio** | `vw_kpis_gestao_mensal.ticket_medio` | ⚠️ PARCIAL | ⚠️ Renovações têm valor, mas falta base completa |
| **MRR** | `vw_kpis_gestao_mensal.mrr` | ❌ NÃO | ⚠️ **LACUNA** - Calculado de `alunos.valor_parcela` |
| **ARR** | MRR × 12 | ❌ NÃO | ⚠️ **LACUNA** - Depende do MRR |
| **LTV Médio** | `vw_kpis_gestao_mensal.ltv_medio` | ❌ NÃO | 🚨 **CRÍTICO** - Precisa tempo de permanência! |
| **Faturamento Previsto** | Ticket Médio × Alunos Pagantes | ❌ NÃO | ⚠️ **LACUNA** |
| **Faturamento Realizado** | Previsto - Inadimplência | ❌ NÃO | ⚠️ **LACUNA** |
| **Inadimplência %** | `vw_kpis_gestao_mensal.inadimplencia_pct` | ❌ NÃO | ⚠️ **LACUNA** - Vem de `alunos.inadimplente` |
| **Reajuste Médio %** | `vw_kpis_gestao_mensal.reajuste_pct` | ✅ SIM | ✅ **OK** - Modal Renovação calcula reajuste |

### Gráficos
| Gráfico | Fonte de Dados | Coberto? | Status |
|---------|---------------|----------|--------|
| **Evolução do MRR** | Histórico de `dados_mensais.mrr` | ❌ NÃO | ⚠️ **LACUNA** |
| **Previsto vs Realizado** | `dados_mensais` | ❌ NÃO | ⚠️ **LACUNA** |
| **Receita por Unidade (MRR)** | `alunos` agrupado | ❌ NÃO | ⚠️ **LACUNA** |
| **Evolução da Inadimplência** | Histórico de `dados_mensais.inadimplencia` | ❌ NÃO | ⚠️ **LACUNA** |
| **Evolução do Ticket Médio** | Histórico de `dados_mensais.ticket_medio` | ⚠️ PARCIAL | Renovações ajudam |
| **Reajustes Aplicados** | Histórico de renovações | ✅ SIM | ✅ Modal Renovação |

---

## 🔄 SUB-ABA: RETENÇÃO

### KPIs Principais
| KPI | Fonte de Dados Atual | Coberto pela Pág. Administrativa? | Status |
|-----|---------------------|-----------------------------------|--------|
| **Cancelamentos** | `vw_kpis_retencao_mensal.cancelamentos` | ✅ SIM | ✅ Modal Evasão (tipo: interrompido) |
| **Não Renovações** | `vw_kpis_retencao_mensal.nao_renovacoes` | ✅ SIM | ✅ Modal Não Renovação |
| **Total Evasões** | Cancelamentos + Não Renovações | ✅ SIM | ✅ Ambos modais cobrem |
| **Churn Rate** | (Evasões / Alunos Ativos) × 100 | ⚠️ PARCIAL | Evasões OK, mas Alunos Ativos não |
| **MRR Perdido** | Soma dos valores das evasões | ⚠️ PARCIAL | 🚨 **CRÍTICO** - Falta valor_parcela nas evasões! |
| **Renovações** | `vw_kpis_retencao_mensal.renovacoes` | ✅ SIM | ✅ Modal Renovação |
| **Taxa Renovação %** | (Renovações / Renovações Previstas) × 100 | ✅ SIM | ✅ OK |
| **Aviso Prévio** | `vw_kpis_retencao_mensal.aviso_previo` | ✅ SIM | ✅ Modal Aviso Prévio |
| **Tempo Permanência** | Média de meses que alunos ficam | ❌ NÃO | 🚨 **CRÍTICO** - Falta no modal! |
| **NPS Evasões** | Nota média das evasões | ❌ NÃO | ⚠️ **LACUNA** - Não tem campo de NPS |

### Gráficos
| Gráfico | Fonte de Dados | Coberto? | Status |
|---------|---------------|----------|--------|
| **Evolução do Churn Rate** | Histórico de `dados_mensais.churn_rate` | ⚠️ PARCIAL | Evasões OK |
| **Evolução da Taxa de Renovação** | Histórico de `renovacoes` | ✅ SIM | ✅ OK |
| **Evolução: Matrículas vs Evasões** | Histórico de ambos | ⚠️ PARCIAL | Só evasões |
| **Motivos de Não Renovação** | `nao_renovacoes.motivo` | ✅ SIM | ✅ Modal tem motivo |
| **Motivos de Cancelamento** | `evasoes_v2.motivo` | ✅ SIM | ✅ Modal Evasão tem motivo |

---

## 🚨 LACUNAS CRÍTICAS IDENTIFICADAS

### 1. **TEMPO DE PERMANÊNCIA (LTV)**
**Problema:** O modal de Evasão NÃO registra quanto tempo o aluno ficou na escola.

**Impacto:**
- ❌ Impossível calcular **LTV Médio** corretamente
- ❌ Impossível calcular **Tempo de Permanência** real
- ❌ Gráficos de retenção ficam imprecisos

**Solução:**
```typescript
// Adicionar no ModalEvasao.tsx:
- tempo_permanencia_meses: number (campo obrigatório)
- data_matricula: date (para calcular automaticamente)
```

**Cálculo Correto do LTV:**
```
LTV = Ticket Médio × Tempo de Permanência (meses)
```

Atualmente, o sistema usa uma média genérica. Com o campo `tempo_permanencia_meses`, teremos dados reais!

---

### 2. **VALOR DA PARCELA NAS EVASÕES (MRR Perdido)**
**Problema:** O modal de Evasão NÃO registra o valor da parcela do aluno que evadiu.

**Impacto:**
- ❌ Impossível calcular **MRR Perdido** com precisão
- ❌ Impossível calcular impacto financeiro das evasões

**Solução:**
```typescript
// Adicionar no ModalEvasao.tsx:
- valor_parcela: number (campo obrigatório)
```

---

### 3. **DADOS DE ALUNOS ATIVOS**
**Problema:** A página Administrativa NÃO alimenta a base de alunos ativos.

**Impacto:**
- ❌ KPIs de "Total Alunos Ativos", "Pagantes", "Kids", "Adultos" não são atualizados
- ❌ Churn Rate fica impreciso (precisa do denominador)

**Solução:**
- A tabela `alunos` precisa ser alimentada pela página de **Matrículas** (Comercial)
- A página Administrativa só registra **movimentações** (renovações, evasões, avisos)

---

### 4. **DADOS FINANCEIROS BASE**
**Problema:** MRR, Ticket Médio, Inadimplência vêm da tabela `alunos`, não da página Administrativa.

**Impacto:**
- ⚠️ A página Administrativa ajuda (renovações atualizam valores), mas não é a fonte primária

**Solução:**
- Manter a tabela `alunos` como fonte de verdade
- Renovações devem **atualizar** `alunos.valor_parcela` quando aprovadas

---

## ✅ O QUE A PÁGINA ADMINISTRATIVA COBRE BEM

1. ✅ **Renovações** - Completo (data, valores, reajuste, forma pagamento)
2. ✅ **Não Renovações** - Completo (data, aluno, motivo, professor)
3. ✅ **Avisos Prévios** - Completo (data, mês saída, valor, motivo)
4. ✅ **Evasões** - Parcial (falta tempo permanência e valor parcela)
5. ✅ **Motivos** - Todos os modais capturam motivos
6. ✅ **Relatórios WhatsApp** - 5 tipos diferentes

---

## 📋 AÇÕES NECESSÁRIAS

### PRIORIDADE ALTA 🚨
1. **Adicionar campo `tempo_permanencia_meses` no Modal de Evasão**
   - Campo numérico obrigatório
   - Label: "Tempo na escola (meses)"
   - Usado para calcular LTV real

2. **Adicionar campo `valor_parcela` no Modal de Evasão**
   - Campo monetário obrigatório
   - Label: "Valor da Parcela (R$)"
   - Usado para calcular MRR Perdido

3. **Atualizar tabela `movimentacoes_admin`**
   - Adicionar coluna `tempo_permanencia_meses INTEGER`
   - Adicionar coluna `valor_parcela_evasao DECIMAL(10,2)`

### PRIORIDADE MÉDIA ⚠️
4. **Integrar Renovações com tabela `alunos`**
   - Quando renovação for aprovada, atualizar `alunos.valor_parcela`
   - Manter histórico de valores

5. **Adicionar campo NPS (opcional) no Modal de Evasão**
   - Nota de 0 a 10
   - "Qual a probabilidade de recomendar a escola?"

### PRIORIDADE BAIXA 📝
6. **Documentar fluxo de dados**
   - Criar diagrama mostrando origem de cada KPI
   - Documentar dependências entre tabelas

---

## 🎯 CONCLUSÃO

A página Administrativa cobre **bem** as movimentações de retenção (renovações, avisos, não renovações), mas tem **2 lacunas críticas**:

1. 🚨 **Falta tempo de permanência** → Impede cálculo correto do LTV
2. 🚨 **Falta valor da parcela nas evasões** → Impede cálculo do MRR Perdido

Sem esses campos, os KPIs mais importantes da aba **Retenção** e **Financeiro** ficam imprecisos.

**Recomendação:** Implementar os campos faltantes ANTES de colocar a página em produção.
