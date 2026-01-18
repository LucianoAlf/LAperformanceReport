# 📋 ESPECIFICAÇÃO COMPLETA DO FRONTEND
## LA Performance Report - Sistema de Gestão 2026

> **Data:** 18/01/2026  
> **Objetivo:** Documentar TODA a estrutura do frontend com os 75 KPIs

---

## 1. ESTRUTURA FINAL DA SIDEBAR

```
SISTEMA
├── 🏠 Dashboard (página inicial)
├── 📊 Gestão Mensal (cockpit 2026 - 4 abas)
├── ➕ Entrada de Dados
├── 🎯 Metas
├── ⚙️ Configurações

PLANILHAS (entrada rápida de dados)
├── 📈 Comercial (Hunters)
├── 📉 Retenção (Farmers)
├── 👨‍🏫 Professores (NOVO)
├── 📷 Snapshot Diário

HISTÓRICO
├── 📁 Apresentações 2025
    ├── Gestão 2025
    ├── Comercial 2025
    └── Retenção 2025

ADMIN (só para admins)
└── 👥 Gerenciar Usuários
```

---

## 2. DETALHAMENTO DE CADA PÁGINA

### 2.1 Dashboard (Página Inicial)
**Rota:** `/app`  
**Objetivo:** Visão geral rápida + ações do dia

**Conteúdo:**
- Saudação + data
- 4 KPIs principais (Alunos, Matrículas, Ticket, Churn)
- Alertas Ativos (últimos 30 dias)
- Ações Rápidas (botões para formulários)
- Resumo por Unidade (tabela)

**Status:** ✅ Já existe e funciona bem

---

### 2.2 Gestão Mensal (Cockpit Principal 2026)
**Rota:** `/app/gestao-mensal`  
**Objetivo:** Análise completa dos 75 KPIs em 4 abas

#### Aba 1: Dashboard (Visão Geral)
| # | KPI | Tipo | Visualização |
|---|-----|------|--------------|
| 1 | Alunos Ativos | Entrada | KPI Card |
| 2 | Alunos Pagantes | Calculado | KPI Card |
| 3 | Ticket Médio | Calculado | KPI Card |
| 4 | Churn Rate | Calculado | KPI Card |
| 5 | Tempo de Permanência | Calculado | KPI Card |
| 6 | LTV Médio | Calculado | KPI Card |
| 7 | Faturamento Previsto | Calculado | KPI Card |
| 8 | Inadimplência % | Entrada | KPI Card |
| 9 | MRR (Receita Recorrente) | Calculado | KPI Card |
| 10 | ARR (Receita Anual) | Calculado | KPI Card |
| - | Evolução Mensal | - | Gráfico Linha |
| - | Distribuição por Unidade | - | Gráfico Pizza |
| - | Resumo por Unidade | - | Tabela |

#### Aba 2: Comercial (Hunters)
| # | KPI | Tipo | Visualização |
|---|-----|------|--------------|
| 11 | Leads (Mês) | Entrada | KPI Card |
| 12 | Leads por Canal | Calculado | Gráfico Barras |
| 13 | Experimentais Agendadas | Entrada | KPI Card |
| 14 | Experimentais Realizadas | Entrada | KPI Card |
| 15 | Taxa Show-up | Calculado | KPI Card |
| 16 | Matrículas (Mês) | Entrada | KPI Card |
| 17 | Taxa Conversão Geral | Calculado | KPI Card |
| 18 | Taxa Conversão por Canal | Calculado | Tabela |
| 19 | Taxa Conversão por Professor | Calculado | Tabela |
| 20 | Faturamento Novo | Calculado | KPI Card |
| 21 | Ticket Médio Novos | Calculado | KPI Card |
| 22 | Leads Arquivados | Entrada | KPI Card |
| 23 | Motivos Arquivamento | Calculado | Gráfico Pizza |
| 24 | Motivos Não Matrícula | Calculado | Gráfico Pizza |
| 25 | Matrículas Passaporte | Entrada | KPI Card |
| 26 | Faturamento Passaportes | Calculado | KPI Card |
| 27 | Cursos Mais Procurados | Calculado | Gráfico Barras |
| 28 | Horários Mais Procurados | Calculado | Gráfico Barras |
| - | Funil de Conversão | - | Gráfico Funil |
| - | Evolução Mensal | - | Gráfico Linha |
| - | Ranking Matriculadores | - | Tabela com Medalhas |

#### Aba 3: Retenção (Farmers)
| # | KPI | Tipo | Visualização |
|---|-----|------|--------------|
| 29 | Evasões (Mês) | Entrada | KPI Card |
| 30 | Evasões Interrompidas | Entrada | KPI Card |
| 31 | Avisos Prévios | Entrada | KPI Card |
| 32 | Transferências | Entrada | KPI Card |
| 33 | Taxa Evasão | Calculado | KPI Card |
| 34 | MRR Perdido | Calculado | KPI Card |
| 35 | Motivos de Saída | Calculado | Gráfico Pizza |
| 36 | Evasões por Professor | Calculado | Tabela |
| 37 | Evasões por Curso | Calculado | Tabela |
| 38 | Renovações Realizadas | Entrada | KPI Card |
| 39 | Não Renovações | Entrada | KPI Card |
| 40 | Taxa Renovação | Calculado | KPI Card |
| 41 | Taxa Não Renovação | Calculado | KPI Card |
| 42 | Renovações Pendentes | Calculado | KPI Card |
| 43 | Renovações Atrasadas | Calculado | KPI Card |
| 44 | Cancelamentos (Mês) | Entrada | KPI Card |
| 45 | Taxa Cancelamento | Calculado | KPI Card |
| 46 | Motivos Cancelamento | Calculado | Gráfico Pizza |
| - | Evolução Evasões | - | Gráfico Linha |
| - | Ranking Churn (Professores) | - | Tabela com Medalhas |
| - | Vencimentos Próximos | - | Tabela Alerta |

#### Aba 4: Professores (Educadores)
| # | KPI | Tipo | Visualização |
|---|-----|------|--------------|
| 47 | Total Professores Ativos | Calculado | KPI Card |
| 48 | Carteira Média | Calculado | KPI Card |
| 49 | Ticket Médio por Professor | Calculado | KPI Card |
| 50 | Média Presença Alunos | Entrada | KPI Card |
| 51 | Taxa Faltas | Calculado | KPI Card |
| 52 | Experimentais por Professor | Calculado | Tabela |
| 53 | Matrículas por Professor | Calculado | Tabela |
| 54 | Taxa Conversão por Professor | Calculado | Tabela |
| 55 | Evasões por Professor | Calculado | Tabela |
| 56 | MRR Perdido por Professor | Calculado | Tabela |
| 57 | Renovações por Professor | Calculado | Tabela |
| 58 | Não Renovações por Professor | Calculado | Tabela |
| 59 | Taxa Renovação por Professor | Calculado | Tabela |
| 60 | Taxa Não Renovação por Professor | Calculado | Tabela |
| 61 | Taxa Cancelamento por Professor | Calculado | Tabela |
| 62 | Ranking Matriculador | Calculado | Tabela com Medalhas |
| 63 | Ranking Renovador | Calculado | Tabela com Medalhas |
| 64 | Ranking Churn | Calculado | Tabela com Medalhas |
| 65 | NPS Médio | Entrada | KPI Card |
| 66 | Média Alunos por Turma | Entrada | KPI Card |
| - | Performance Completa | - | Tabela Detalhada |
| - | Comparativo Unidades | - | Gráfico Barras |

---

### 2.3 Entrada de Dados
**Rota:** `/app/entrada`  
**Objetivo:** Menu de formulários para registro

**Conteúdo:**
- Novo Lead
- Aula Experimental
- Nova Matrícula
- Registrar Evasão
- Renovação
- Aviso Prévio
- Cadastro de Alunos

**Status:** ✅ Já existe

---

### 2.4 Metas
**Rota:** `/app/metas`  
**Objetivo:** Definir e acompanhar metas mensais

**Conteúdo:**
| KPI | Meta | Atual | % | Status |
|-----|------|-------|---|--------|
| Matrículas | 30 | 25 | 83% | 🟡 |
| Evasões | 10 | 8 | 80% | 🟢 |
| Renovações | 50 | 45 | 90% | 🟢 |
| ... | ... | ... | ... | ... |

**Funcionalidades:**
- CRUD de metas por mês/unidade
- Barra de progresso visual
- Alertas de metas em risco

**Status:** ❌ Não implementado

---

### 2.5 Configurações
**Rota:** `/app/config`  
**Objetivo:** Gerenciar tabelas mestras

**Conteúdo:**
- Unidades
- Cursos
- Canais de Origem
- Motivos de Saída
- Tipos de Saída
- Tipos de Matrícula
- Motivos de Arquivamento
- Horários

**Status:** ❌ Não implementado

---

### 2.6 Planilhas (Entrada Rápida)

#### Comercial (Hunters)
**Rota:** `/app/comercial`  
**Status:** ✅ Já existe

#### Retenção (Farmers)
**Rota:** `/app/retencao`  
**Status:** ✅ Já existe

#### Professores (NOVO)
**Rota:** `/app/professores`  
**Objetivo:** Registrar dados de professores

**Campos:**
- Professor
- Unidade
- Mês/Ano
- NPS Médio
- Média Alunos por Turma
- Média Presença
- Observações

**Status:** ❌ Não implementado

#### Snapshot Diário
**Rota:** `/app/snapshot`  
**Status:** ✅ Já existe

---

### 2.7 Apresentações 2025 (Histórico)
**Rota:** `/app/apresentacoes-2025`  
**Objetivo:** Preservar dashboards históricos de 2025

**Estrutura:** Página com 3 abas (cockpit)
- Aba 1: Gestão 2025
- Aba 2: Comercial 2025
- Aba 3: Retenção 2025

**Conteúdo:** Componentes existentes (App.tsx, ComercialDashboard, RetencaoDashboard)

**Status:** ⚠️ Existe mas precisa reorganizar

---

## 3. COMPONENTES NECESSÁRIOS

### 3.1 Componentes de Visualização
| Componente | Descrição | Status |
|------------|-----------|--------|
| KPICard | Card com ícone, valor, tendência | ✅ Criado |
| KPICardMeta | Card com barra de progresso | ❌ Criar |
| DistributionChart | Gráfico pizza | ❌ Criar |
| EvolutionChart | Gráfico linha temporal | ❌ Criar |
| BarChartHorizontal | Gráfico barras horizontal | ❌ Criar |
| FunnelChart | Funil de conversão | ❌ Criar |
| RankingTable | Tabela com medalhas | ❌ Criar |
| AlertTable | Tabela com alertas coloridos | ❌ Criar |

### 3.2 Componentes de Entrada
| Componente | Descrição | Status |
|------------|-----------|--------|
| CellInput | Input inline editável | ✅ Criado |
| UnidadeFilter | Filtro de unidade | ✅ Criado |
| MesSelector | Seletor de mês/ano | ❌ Criar |
| MetaForm | Formulário de metas | ❌ Criar |

---

## 4. ORDEM DE IMPLEMENTAÇÃO

### Fase 2A: Limpar e Organizar (1 dia)
1. Reorganizar sidebar conforme estrutura definida
2. Criar página Apresentações 2025 com abas
3. Remover links antigos

### Fase 2B: Completar Gestão Mensal (3 dias)
1. Criar componentes de gráficos
2. Implementar TODOS os KPIs da aba Dashboard
3. Implementar TODOS os KPIs da aba Comercial
4. Implementar TODOS os KPIs da aba Retenção
5. Implementar TODOS os KPIs da aba Professores

### Fase 2C: Planilha de Professores (1 dia)
1. Criar componente PlanilhaProfessores
2. Adicionar rota e link na sidebar

### Fase 2D: Página de Metas (2 dias)
1. Criar CRUD de metas
2. Implementar visualização com progresso
3. Alertas de metas em risco

### Fase 2E: Página de Configurações (1 dia)
1. CRUD para cada tabela mestra
2. Interface de gerenciamento

### Fase 2F: Relatórios (2 dias)
1. Exportação PDF
2. Exportação Excel
3. Relatório WhatsApp (já existe no Snapshot)

---

## 5. RESUMO DOS 75 KPIs

| Categoria | Total | Cards | Gráficos | Tabelas |
|-----------|-------|-------|----------|---------|
| Gestão/Dashboard | 10 | 10 | 2 | 1 |
| Comercial | 18 | 12 | 4 | 3 |
| Retenção | 18 | 14 | 3 | 3 |
| Professores | 20 | 4 | 1 | 4 |
| **TOTAL** | **66** | **40** | **10** | **11** |

*Nota: Alguns KPIs aparecem em múltiplas visualizações (card + tabela)*

---

## 6. PRÓXIMOS PASSOS

Aguardando aprovação do usuário para:
1. ✅ Confirmar estrutura da sidebar
2. ✅ Confirmar que Apresentações 2025 ficam como histórico
3. ✅ Confirmar ordem de implementação
4. ▶️ Iniciar Fase 2A

---

*Documento criado em 18/01/2026*
