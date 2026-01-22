# MAPEAMENTO DE ORIGEM DOS DADOS - PÁGINA ADMINISTRATIVA
**Data:** 22/01/2026  
**Objetivo:** Documentar de onde vêm os dados exibidos na página Administrativa e como são alimentados

---

## 📊 RESUMO DO MÊS - ORIGEM DOS DADOS

### 1. **Alunos Ativos** (904)
**Origem:** `vw_kpis_gestao_mensal.total_alunos_ativos`  
**Fonte Primária:** Tabela `alunos` com `status = 'ativo'`  
**Onde é alimentado:** 
- ❌ **NÃO é alimentado pela página Administrativa**
- ✅ Alimentado pela **página Comercial** ao criar novas matrículas
- ✅ Alimentado por **processo manual/importação** de alunos existentes

**Fluxo:**
```
Página Comercial (Matrícula) → Tabela alunos → vw_kpis_gestao_mensal
```

---

### 2. **Pagantes** (904)
**Origem:** `vw_kpis_gestao_mensal.total_alunos_pagantes`  
**Fonte Primária:** Tabela `alunos` com `tipo_aluno IN ('pagante', 'pagante_2_curso')`  
**Onde é alimentado:**
- ❌ **NÃO é alimentado pela página Administrativa**
- ✅ Alimentado pela **página Comercial** ao criar matrículas
- ✅ Campo `tipo_aluno` definido no cadastro do aluno

**Fluxo:**
```
Página Comercial (Matrícula) → alunos.tipo_aluno = 'pagante' → vw_kpis_gestao_mensal
```

---

### 3. **Matrículas Ativas** (0)
**Origem:** `vw_kpis_gestao_mensal.total_matriculas`  
**Fonte Primária:** Tabela `matriculas` com `ativa = true`  
**Onde é alimentado:**
- ❌ **NÃO é alimentado pela página Administrativa**
- ✅ Alimentado pela **página Comercial** ao registrar matrículas
- ✅ Inclui: BANDA + 2º Curso + Matrículas regulares

**Fluxo:**
```
Página Comercial (Matrícula) → Tabela matriculas → vw_kpis_gestao_mensal
```

**Composição:**
- Matrículas regulares (LAMK + EMLA)
- Matrículas em Banda (`tipo = 'banda'`)
- Matrículas de 2º curso (`segundo_curso = true`)

---

### 4. **Bolsistas** (0)
**Origem:** `vw_kpis_gestao_mensal.total_bolsistas_integrais + total_bolsistas_parciais`  
**Fonte Primária:** Tabela `alunos` com `tipo_aluno IN ('bolsista_integral', 'bolsista_parcial')`  
**Onde é alimentado:**
- ❌ **NÃO é alimentado pela página Administrativa**
- ❌ **NÃO é alimentado pela página Comercial**
- ⚠️ **LACUNA CRÍTICA:** Não há interface para registrar bolsistas!

**Status Atual:** 🚨 **SEM FONTE DE DADOS**

**Soluções Possíveis:**
1. Adicionar campo `tipo_aluno` no modal de matrícula da página Comercial
2. Criar página/modal separado para gestão de bolsistas
3. Permitir edição do `tipo_aluno` na tabela de alunos

---

### 5. **Trancados** (0)
**Origem:** `vw_kpis_gestao_mensal.total_trancados`  
**Fonte Primária:** Tabela `alunos` com `status = 'trancado'`  
**Onde é alimentado:**
- ❌ **NÃO é alimentado pela página Administrativa**
- ❌ **NÃO é alimentado pela página Comercial**
- ⚠️ **LACUNA CRÍTICA:** Não há interface para registrar trancamentos!

**Status Atual:** 🚨 **SEM FONTE DE DADOS**

**Soluções Possíveis:**
1. Criar modal "Trancamento" na página Administrativa
2. Adicionar aba "Trancamentos" no Detalhamento do Mês
3. Atualizar `alunos.status = 'trancado'` quando registrado

**Campos Necessários:**
- Data do trancamento
- Aluno
- Professor
- Motivo
- Previsão de retorno (opcional)

---

### 6. **Novos no Mês** (0)
**Origem:** `vw_kpis_gestao_mensal.novas_matriculas`  
**Fonte Primária:** Tabela `matriculas` com `data >= início_do_mês AND data <= fim_do_mês`  
**Onde é alimentado:**
- ❌ **NÃO é alimentado pela página Administrativa**
- ✅ **SIM, alimentado pela página Comercial!**
- ✅ Cada matrícula registrada no Comercial incrementa este contador

**Fluxo:**
```
Página Comercial → Botão "Matrícula" → Preenche modal → 
Salva em `matriculas` → Conta como "Novo no Mês"
```

**Integração:** ✅ **JÁ ESTÁ INTEGRADO!**

---

## 🔄 LANÇAMENTO RÁPIDO - O QUE ALIMENTA

### ✅ **Renovação** (0)
**Alimenta:** Tabela `movimentacoes_admin` com `tipo = 'renovacao'`  
**Impacto nos KPIs:**
- Atualiza `alunos.valor_parcela` (quando aprovado)
- Incrementa contador de renovações realizadas
- Calcula reajuste médio

---

### ✅ **Não Renovação** (0)
**Alimenta:** Tabela `movimentacoes_admin` com `tipo = 'nao_renovacao'`  
**Impacto nos KPIs:**
- Incrementa contador de não renovações
- Usado para calcular taxa de renovação

---

### ✅ **Aviso Prévio** (0)
**Alimenta:** Tabela `movimentacoes_admin` com `tipo = 'aviso_previo'`  
**Impacto nos KPIs:**
- Incrementa contador de avisos prévios
- Calcula perda potencial de MRR

---

### ✅ **Evasão** (0)
**Alimenta:** Tabela `movimentacoes_admin` com `tipo = 'evasao'`  
**Impacto nos KPIs:**
- Incrementa contador de evasões
- Calcula MRR Perdido (com novo campo `valor_parcela_evasao`)
- Calcula LTV real (com novo campo `tempo_permanencia_meses`)
- Usado para calcular Churn Rate

---

## 🚨 LACUNAS CRÍTICAS IDENTIFICADAS

### 1. **TRANCAMENTOS**
**Problema:** Não há como registrar trancamentos no sistema.

**Impacto:**
- KPI "Trancados" sempre mostra 0
- Impossível acompanhar alunos que pausaram temporariamente
- Perda de visibilidade sobre retenção

**Solução Recomendada:**
Criar **Modal de Trancamento** na página Administrativa com:
- Data do trancamento
- Aluno
- Professor
- Motivo
- Previsão de retorno
- Atualiza `alunos.status = 'trancado'`

**Adicionar Aba "Trancamentos"** no Detalhamento do Mês.

---

### 2. **BOLSISTAS**
**Problema:** Não há como registrar/editar bolsistas no sistema.

**Impacto:**
- KPI "Bolsistas" sempre mostra 0
- Impossível diferenciar alunos pagantes de bolsistas
- Relatórios financeiros imprecisos

**Solução Recomendada:**
Adicionar campo `tipo_aluno` no **Modal de Matrícula** (Comercial) com opções:
- Pagante
- Bolsista Integral
- Bolsista Parcial
- Não Pagante

Ou criar **Modal de Gestão de Bolsistas** separado.

---

### 3. **MATRÍCULAS ATIVAS (Detalhamento)**
**Problema:** Não há visibilidade sobre as matrículas ativas no Detalhamento.

**Impacto:**
- Impossível ver lista de alunos matriculados
- Impossível ver distribuição por curso/professor
- Falta transparência sobre a base ativa

**Solução Recomendada:**
Adicionar **Aba "Matrículas Ativas"** no Detalhamento com:
- Lista de todas as matrículas ativas
- Filtros por curso, professor, tipo
- Informações: aluno, curso, professor, valor, data início

---

## 📋 PROPOSTA: NOVAS ABAS NO DETALHAMENTO

### **Estrutura Atual:**
```
Detalhamento do Mês
├── Renovações (0)
├── Avisos Prévios (0)
└── Evasões (0)
```

### **Estrutura Proposta:**
```
Detalhamento do Mês
├── Renovações (0)
├── Avisos Prévios (0)
├── Evasões (0)
├── 🆕 Trancamentos (0)      ← NOVA
└── 🆕 Matrículas Ativas (0) ← NOVA (opcional)
```

---

## 🔄 FLUXO COMPLETO DE DADOS

### **Página Comercial → Alimenta:**
1. ✅ Alunos Ativos (via matrículas)
2. ✅ Pagantes (via matrículas)
3. ✅ Novos no Mês (via matrículas)
4. ✅ Matrículas Ativas (via matrículas)
5. ⚠️ Bolsistas (se adicionar campo `tipo_aluno`)

### **Página Administrativa → Alimenta:**
1. ✅ Renovações
2. ✅ Não Renovações
3. ✅ Avisos Prévios
4. ✅ Evasões (com LTV e MRR Perdido)
5. ❌ Trancamentos (FALTA IMPLEMENTAR)

### **Sem Interface (Manual/Importação):**
1. ⚠️ Bolsistas (se não adicionar no Comercial)
2. ⚠️ Trancados (se não adicionar no Administrativo)

---

## ✅ RESUMO EXECUTIVO

| KPI | Origem | Alimentado Por | Status |
|-----|--------|----------------|--------|
| **Alunos Ativos** | `alunos.status = 'ativo'` | Página Comercial | ✅ OK |
| **Pagantes** | `alunos.tipo_aluno = 'pagante'` | Página Comercial | ✅ OK |
| **Novos no Mês** | `matriculas` do mês | Página Comercial | ✅ OK |
| **Matrículas Ativas** | `matriculas.ativa = true` | Página Comercial | ✅ OK |
| **Bolsistas** | `alunos.tipo_aluno = 'bolsista_*'` | ❌ SEM INTERFACE | 🚨 LACUNA |
| **Trancados** | `alunos.status = 'trancado'` | ❌ SEM INTERFACE | 🚨 LACUNA |
| **Renovações** | `movimentacoes_admin` | Página Administrativa | ✅ OK |
| **Avisos Prévios** | `movimentacoes_admin` | Página Administrativa | ✅ OK |
| **Evasões** | `movimentacoes_admin` | Página Administrativa | ✅ OK |

---

## 🎯 AÇÕES RECOMENDADAS (Prioridade)

### **ALTA PRIORIDADE** 🚨
1. **Implementar Modal de Trancamento**
   - Adicionar na página Administrativa
   - Criar aba "Trancamentos" no Detalhamento
   - Atualizar `alunos.status`

2. **Implementar Gestão de Bolsistas**
   - Adicionar campo `tipo_aluno` no modal de Matrícula (Comercial)
   - Ou criar modal separado de Bolsistas

### **MÉDIA PRIORIDADE** ⚠️
3. **Adicionar Aba "Matrículas Ativas"**
   - Visibilidade sobre base ativa
   - Filtros e detalhamento

### **BAIXA PRIORIDADE** 📝
4. **Documentar Processos**
   - Manual de uso para equipe
   - Fluxo de preenchimento

---

## 📞 PERGUNTAS PARA O USUÁRIO

1. **Trancamentos:** Vocês precisam registrar trancamentos? Com que frequência isso acontece?
2. **Bolsistas:** Como vocês controlam bolsistas hoje? Planilha? Outro sistema?
3. **Matrículas Ativas:** Precisa de uma aba para ver todas as matrículas ativas ou só os KPIs são suficientes?
4. **Prioridade:** Qual das lacunas é mais crítica para vocês: Trancamentos ou Bolsistas?
