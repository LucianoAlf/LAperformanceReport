# 📊 RELATÓRIO EXECUTIVO - PÁGINA ANALYTICS

## Sistema de Gestão LA Music School 2026
**Data de Geração:** 19 de Janeiro de 2026  
**Versão:** 1.0  
**Autor:** Equipe de Desenvolvimento

---

## 📋 SUMÁRIO EXECUTIVO

A página **Analytics** (anteriormente "Gestão Mensal") é o coração analítico do Sistema de Gestão 2026 da LA Music School. Esta página consolida **mais de 70 KPIs e gráficos** distribuídos em **3 abas principais** e **10 sub-abas**, oferecendo uma visão 360° do negócio.

### Estrutura da Página

```
📊 ANALYTICS
├── 📈 Aba Gestão
│   ├── 👥 Sub-aba Alunos
│   ├── 💰 Sub-aba Financeiro
│   └── 🔄 Sub-aba Retenção
├── 📊 Aba Comercial
│   ├── 📞 Sub-aba Leads
│   ├── 🎸 Sub-aba Experimentais
│   └── ✅ Sub-aba Matrículas
└── 👨‍🏫 Aba Professores
    ├── 👁️ Sub-aba Visão Geral
    ├── 🎯 Sub-aba Conversão
    ├── 🔄 Sub-aba Retenção
    └── ⭐ Sub-aba Qualidade
```

---

## 🏗️ ARQUITETURA TÉCNICA

### Stack Tecnológico

| Camada | Tecnologia |
|--------|------------|
| **Frontend** | React 18 + TypeScript |
| **Estilização** | Tailwind CSS + shadcn/ui |
| **Gráficos** | Recharts |
| **Ícones** | Lucide React |
| **Backend** | Supabase (PostgreSQL) |
| **Autenticação** | Supabase Auth |

### Arquivos Principais

| Arquivo | Descrição | Linhas |
|---------|-----------|--------|
| `GestaoMensalPage.tsx` | Container principal com abas | ~162 |
| `TabGestao.tsx` | Aba Gestão (Alunos, Financeiro, Retenção) | ~1.429 |
| `TabComercialNew.tsx` | Aba Comercial (Leads, Experimentais, Matrículas) | ~967 |
| `TabProfessoresNew.tsx` | Aba Professores (Visão Geral, Conversão, Retenção, Qualidade) | ~833 |

---

## 🗄️ ESTRUTURA DO BANCO DE DADOS

### Tabelas Principais

#### 1. `alunos`
Tabela central com todos os alunos matriculados.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | Identificador único |
| `nome` | TEXT | Nome completo |
| `email` | TEXT | E-mail |
| `telefone` | TEXT | Telefone |
| `data_nascimento` | DATE | Data de nascimento |
| `idade_atual` | INTEGER | Idade calculada |
| `data_matricula` | DATE | Data da matrícula |
| `status` | TEXT | ativo, inativo, evadido |
| `unidade_id` | UUID | FK para unidades |
| `curso_id` | INTEGER | FK para cursos |
| `professor_atual_id` | INTEGER | FK para professores |
| `professor_experimental_id` | INTEGER | Professor da aula experimental |
| `valor_parcela` | DECIMAL | Valor mensal |
| `valor_passaporte` | DECIMAL | Valor do passaporte |
| `canal_origem_id` | INTEGER | FK para canais_origem |

#### 2. `professores`
Cadastro de professores.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | SERIAL | Identificador único |
| `nome` | TEXT | Nome completo |
| `email` | TEXT | E-mail |
| `ativo` | BOOLEAN | Status ativo/inativo |
| `nps_medio` | DECIMAL | NPS médio do professor |
| `media_alunos_turma` | DECIMAL | Média de alunos por turma |
| `unidade_id` | UUID | FK para unidades |

#### 3. `unidades`
Unidades da escola.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | Identificador único |
| `nome` | TEXT | Nome da unidade |
| `ativo` | BOOLEAN | Status |

**Unidades Cadastradas:**
- Campo Grande (`2ec861f6-023f-4d7b-9927-3960ad8c2a92`)
- Recreio (`95553e96-971b-4590-a6eb-0201d013c14d`)
- Barra (`368d47f5-2d88-4475-bc14-ba084a9a348e`)

#### 4. `leads_diarios`
Leads captados diariamente.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | SERIAL | Identificador único |
| `data` | DATE | Data do lead |
| `nome` | TEXT | Nome do lead |
| `telefone` | TEXT | Telefone |
| `email` | TEXT | E-mail |
| `canal_origem_id` | INTEGER | FK para canais_origem |
| `curso_id` | INTEGER | FK para cursos |
| `unidade_id` | UUID | FK para unidades |
| `status` | TEXT | novo, agendado, matriculado, arquivado |
| `data_experimental` | DATE | Data da aula experimental |
| `professor_experimental_id` | INTEGER | FK para professores |
| `compareceu` | BOOLEAN | Se compareceu à experimental |
| `matriculou` | BOOLEAN | Se matriculou |
| `motivo_arquivamento_id` | INTEGER | FK para motivos |
| `motivo_nao_matricula_id` | INTEGER | FK para motivos |

#### 5. `evasoes_v2`
Registro de evasões.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | SERIAL | Identificador único |
| `aluno_id` | UUID | FK para alunos |
| `data_evasao` | DATE | Data da evasão |
| `tipo_saida_id` | INTEGER | 1=interrompido, 2=não renovou, 3=aviso prévio |
| `motivo_saida_id` | INTEGER | FK para motivos |
| `professor_id` | INTEGER | FK para professores |
| `curso_id` | INTEGER | FK para cursos |
| `unidade_id` | UUID | FK para unidades |
| `valor_parcela` | DECIMAL | MRR perdido |

#### 6. `dados_mensais`
Fechamento mensal consolidado por unidade.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | SERIAL | Identificador único |
| `ano` | INTEGER | Ano |
| `mes` | INTEGER | Mês (1-12) |
| `unidade_id` | UUID | FK para unidades |
| `alunos_ativos` | INTEGER | Total de alunos ativos |
| `alunos_pagantes` | INTEGER | Alunos pagantes |
| `novas_matriculas` | INTEGER | Matrículas do mês |
| `evasoes` | INTEGER | Evasões do mês |
| `ticket_medio` | DECIMAL | Ticket médio parcelas |
| `ticket_medio_passaporte` | DECIMAL | Ticket médio passaporte |
| `faturamento_estimado` | DECIMAL | MRR |
| `faturamento_passaporte` | DECIMAL | Faturamento passaportes |
| `churn_rate` | DECIMAL | Taxa de churn % |
| `taxa_renovacao` | DECIMAL | Taxa de renovação % |
| `tempo_permanencia` | DECIMAL | Tempo médio em meses |
| `inadimplencia` | DECIMAL | % de inadimplência |

**Dados Históricos Disponíveis:** Jan/2024 a Dez/2025 (24 meses)

#### 7. `dados_comerciais`
Dados comerciais mensais consolidados.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | SERIAL | Identificador único |
| `competencia` | DATE | Data no formato YYYY-MM-01 |
| `unidade` | TEXT | Nome da unidade |
| `total_leads` | INTEGER | Total de leads |
| `aulas_experimentais` | INTEGER | Experimentais realizadas |
| `novas_matriculas_total` | INTEGER | Total de matrículas |
| `novas_matriculas_lamk` | INTEGER | Matrículas LA Kids |
| `novas_matriculas_emla` | INTEGER | Matrículas LA School |
| `ticket_medio_parcelas` | DECIMAL | Ticket médio parcelas |
| `ticket_medio_passaporte` | DECIMAL | Ticket médio passaporte |
| `faturamento_passaporte` | DECIMAL | Faturamento passaportes |

**Dados Históricos Disponíveis:** Jan/2025 a Dez/2025 (12 meses)

#### 8. `professores_performance`
Performance anual dos professores.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | SERIAL | Identificador único |
| `professor` | TEXT | Nome do professor |
| `ano` | INTEGER | Ano de referência |
| `unidade_id` | UUID | FK para unidades |
| `experimentais` | INTEGER | Total de experimentais |
| `matriculas` | INTEGER | Total de matrículas |
| `taxa_conversao` | DECIMAL | Taxa de conversão % |
| `renovacoes` | INTEGER | Total de renovações |
| `contratos_vencer` | INTEGER | Contratos que venceram |
| `taxa_renovacao` | DECIMAL | Taxa de renovação % |
| `evasoes` | INTEGER | Total de evasões |

**Dados Históricos Disponíveis:** 2025

---

### Views Materializadas

#### 1. `vw_kpis_gestao_mensal`
KPIs de gestão em tempo real.

| Coluna | Descrição |
|--------|-----------|
| `unidade_id` | ID da unidade |
| `unidade_nome` | Nome da unidade |
| `total_alunos_ativos` | Alunos com status ativo |
| `total_alunos_pagantes` | Alunos com valor_parcela > 0 |
| `total_bolsistas_integrais` | Alunos com valor_parcela = 0 |
| `total_bolsistas_parciais` | Alunos com desconto |
| `total_banda` | Alunos de banda |
| `ticket_medio` | Média de valor_parcela |
| `mrr` | Monthly Recurring Revenue |
| `arr` | Annual Recurring Revenue |
| `tempo_permanencia_medio` | Média em meses |
| `ltv_medio` | Lifetime Value médio |
| `inadimplencia_pct` | % de inadimplência |
| `faturamento_previsto` | MRR total |
| `faturamento_realizado` | Faturamento - inadimplência |
| `churn_rate` | Taxa de churn |
| `total_evasoes` | Evasões do período |

**Atualização:** Tempo real (dados atuais da tabela alunos)

#### 2. `vw_kpis_retencao_mensal`
KPIs de retenção em tempo real.

| Coluna | Descrição |
|--------|-----------|
| `unidade_id` | ID da unidade |
| `total_evasoes` | Total de evasões |
| `evasoes_interrompidas` | Cancelamentos (tipo 1) |
| `avisos_previos` | Avisos prévios (tipo 3) |
| `mrr_perdido` | MRR perdido com evasões |
| `renovacoes_realizadas` | Renovações efetivadas |
| `nao_renovacoes` | Não renovações (tipo 2) |
| `renovacoes_pendentes` | Contratos a vencer |
| `taxa_renovacao` | % de renovação |

#### 3. `vw_kpis_comercial_historico`
KPIs comerciais históricos consolidados.

| Coluna | Descrição |
|--------|-----------|
| `ano` | Ano |
| `mes` | Mês |
| `unidade_id` | ID da unidade |
| `total_leads` | Total de leads |
| `experimentais_realizadas` | Experimentais realizadas |
| `novas_matriculas` | Novas matrículas |
| `novas_matriculas_lamk` | Matrículas LA Kids |
| `novas_matriculas_emla` | Matrículas LA School |
| `ticket_medio_parcelas` | Ticket médio parcelas |
| `ticket_medio_passaporte` | Ticket médio passaporte |
| `faturamento_passaporte` | Faturamento passaportes |

**Dados:** Consolidados de dados_comerciais

#### 4. `vw_kpis_professor_mensal`
KPIs de professores em tempo real.

| Coluna | Descrição |
|--------|-----------|
| `professor_id` | ID do professor |
| `professor_nome` | Nome |
| `unidade_id` | ID da unidade |
| `ano` | Ano |
| `mes` | Mês |
| `carteira_alunos` | Alunos ativos do professor |
| `ticket_medio` | Ticket médio dos alunos |
| `media_alunos_turma` | Média de alunos por turma |

#### 5. `vw_kpis_professor_completo`
KPIs completos de professores (carteira atual).

| Coluna | Descrição |
|--------|-----------|
| `professor_id` | ID do professor |
| `professor_nome` | Nome |
| `unidade_id` | ID da unidade |
| `carteira_alunos` | Total de alunos ativos |
| `ticket_medio` | Ticket médio |
| `media_alunos_turma` | Média alunos/turma |
| `nps_medio` | NPS médio |
| `media_presenca` | Presença média % |
| `taxa_faltas` | Taxa de faltas % |

#### 6. `vw_kpis_professor_historico`
KPIs históricos de professores.

| Coluna | Descrição |
|--------|-----------|
| `professor_id` | ID do professor |
| `professor_nome` | Nome |
| `unidade_id` | ID da unidade |
| `ano` | Ano |
| `mes` | Mês |
| `carteira_alunos` | Carteira estimada |
| `ticket_medio` | Ticket médio |
| `matriculas` | Matrículas do mês |
| `nps_medio` | NPS médio |
| `media_alunos_turma` | Média alunos/turma |

#### 7. `vw_dashboard_unidade`
Resumo por unidade para Dashboard.

| Coluna | Descrição |
|--------|-----------|
| `unidade` | Nome da unidade |
| `alunos_ativos` | Total de alunos ativos |
| `alunos_pagantes` | Alunos pagantes |
| `ticket_medio` | Ticket médio |
| `faturamento_previsto` | MRR |
| `tempo_medio_permanencia` | Tempo médio em meses |

#### 8. `vw_alertas`
Alertas automáticos do sistema.

| Coluna | Descrição |
|--------|-----------|
| `tipo` | Tipo do alerta |
| `unidade` | Unidade afetada |
| `descricao` | Descrição do alerta |
| `valor` | Valor relacionado |

---

### Tabelas Auxiliares

#### `cursos`
| id | nome |
|----|------|
| 1 | Violão |
| 2 | Guitarra |
| 3 | Bateria |
| 4 | Teclado |
| 5 | Canto |
| 6 | Baixo |
| ... | ... |

#### `canais_origem`
| id | nome |
|----|------|
| 1 | Instagram |
| 2 | Facebook |
| 3 | Google |
| 4 | Indicação |
| 5 | Fachada |
| ... | ... |

#### `motivos_arquivamento`
| id | nome |
|----|------|
| 1 | Sem interesse |
| 2 | Preço |
| 3 | Horário |
| 4 | Distância |
| ... | ... |

#### `motivos_nao_matricula`
| id | nome |
|----|------|
| 1 | Preço |
| 2 | Horário |
| 3 | Não gostou da aula |
| ... | ... |

#### `motivos_saida`
| id | nome |
|----|------|
| 1 | Financeiro |
| 2 | Mudança |
| 3 | Falta de tempo |
| 4 | Não gostou |
| ... | ... |

#### `tipos_saida`
| id | nome |
|----|------|
| 1 | Interrompido (Cancelamento) |
| 2 | Não Renovou |
| 3 | Aviso Prévio |

---

## 📈 ABA GESTÃO

### Visão Geral
A aba Gestão é responsável por apresentar os KPIs operacionais e financeiros da escola, divididos em 3 sub-abas.

### Sub-aba: Alunos

#### KPIs Principais (5 cards)

| KPI | Fonte | Cálculo |
|-----|-------|---------|
| **Total Alunos Ativos** | `vw_kpis_gestao_mensal` | `SUM(total_alunos_ativos)` |
| **Alunos Pagantes** | `vw_kpis_gestao_mensal` | `SUM(total_alunos_pagantes)` |
| **LA Music Kids** | `alunos` | `COUNT(*) WHERE idade_atual <= 11 AND status = 'ativo'` |
| **LA Music School** | `alunos` | `COUNT(*) WHERE idade_atual >= 12 AND status = 'ativo'` |
| **Bolsistas** | `vw_kpis_gestao_mensal` | `SUM(total_bolsistas_integrais + total_bolsistas_parciais)` |

#### KPIs Secundários (4 cards)

| KPI | Fonte | Cálculo |
|-----|-------|---------|
| **Novas Matrículas** | `dados_mensais` | `SUM(novas_matriculas)` |
| **Evasões** | `dados_mensais` | `SUM(evasoes)` |
| **Saldo Líquido** | Calculado | `novas_matriculas - evasoes` |
| **Alunos Banda** | `vw_kpis_gestao_mensal` | `SUM(total_banda)` |

#### Gráficos

1. **Distribuição LA Kids vs LA School**
   - Tipo: Donut Chart
   - Dados: `alunos` filtrado por idade

2. **Matrículas por Curso**
   - Tipo: Bar Chart Horizontal
   - Dados: `alunos` agrupado por `cursos.nome`

3. **Matrículas por Professor**
   - Tipo: Ranking Table
   - Dados: `alunos` agrupado por `professores.nome`

4. **Evolução de Alunos (12 meses)**
   - Tipo: Line Chart
   - Dados: `dados_mensais` últimos 12 meses

#### Comparativos Históricos
- **vs Mês Anterior:** Busca de `dados_mensais` do mês anterior
- **vs Ano Anterior:** Busca de `dados_mensais` do mesmo mês do ano anterior

---

### Sub-aba: Financeiro

#### KPIs Principais (5 cards)

| KPI | Fonte | Cálculo |
|-----|-------|---------|
| **Ticket Médio** | `vw_kpis_gestao_mensal` | `AVG(ticket_medio)` |
| **MRR** | `vw_kpis_gestao_mensal` | `SUM(mrr)` |
| **ARR** | `vw_kpis_gestao_mensal` | `SUM(arr)` |
| **LTV Médio** | `vw_kpis_gestao_mensal` | `AVG(ltv_medio)` |
| **Tempo Permanência** | `vw_kpis_gestao_mensal` | `AVG(tempo_permanencia_medio)` |

#### KPIs Secundários (4 cards)

| KPI | Fonte | Cálculo |
|-----|-------|---------|
| **Faturamento Previsto** | `vw_kpis_gestao_mensal` | `SUM(faturamento_previsto)` |
| **Faturamento Realizado** | `vw_kpis_gestao_mensal` | `SUM(faturamento_realizado)` |
| **Inadimplência R$** | Calculado | `faturamento_previsto - faturamento_realizado` |
| **Inadimplência %** | `vw_kpis_gestao_mensal` | `AVG(inadimplencia_pct)` |

#### Gráficos

1. **Evolução MRR (12 meses)**
   - Tipo: Area Chart
   - Dados: `dados_mensais.faturamento_estimado`

2. **Previsto vs Realizado**
   - Tipo: Bar Chart Comparativo
   - Dados: `dados_mensais`

3. **Receita por Unidade**
   - Tipo: Donut Chart
   - Dados: `vw_kpis_gestao_mensal` agrupado por unidade

4. **Evolução Inadimplência (12 meses)**
   - Tipo: Line Chart
   - Dados: `dados_mensais.inadimplencia`

5. **Evolução Ticket Médio (12 meses)**
   - Tipo: Line Chart
   - Dados: `dados_mensais.ticket_medio`

---

### Sub-aba: Retenção

#### KPIs Principais (4 cards)

| KPI | Fonte | Cálculo |
|-----|-------|---------|
| **Churn Rate** | `vw_kpis_gestao_mensal` | `AVG(churn_rate)` |
| **Taxa Renovação** | `vw_kpis_retencao_mensal` | `AVG(taxa_renovacao)` |
| **Total Evasões** | `vw_kpis_retencao_mensal` | `SUM(total_evasoes)` |
| **MRR Perdido** | `vw_kpis_retencao_mensal` | `SUM(mrr_perdido)` |

#### KPIs Secundários (4 cards)

| KPI | Fonte | Cálculo |
|-----|-------|---------|
| **Renovações** | `vw_kpis_retencao_mensal` | `SUM(renovacoes_realizadas)` |
| **Não Renovações** | `vw_kpis_retencao_mensal` | `SUM(nao_renovacoes)` |
| **Cancelamentos** | `vw_kpis_retencao_mensal` | `SUM(evasoes_interrompidas)` |
| **Avisos Prévios** | `vw_kpis_retencao_mensal` | `SUM(avisos_previos)` |

#### Gráficos

1. **Evolução Churn Rate (12 meses)**
   - Tipo: Line Chart
   - Dados: `dados_mensais.churn_rate`

2. **Evolução Taxa Renovação (12 meses)**
   - Tipo: Line Chart
   - Dados: `dados_mensais.taxa_renovacao`

3. **Evasões por Professor**
   - Tipo: Ranking Table
   - Dados: `evasoes_v2` agrupado por professor

4. **Evasões por Curso**
   - Tipo: Bar Chart
   - Dados: `evasoes_v2` agrupado por curso

5. **Motivos de Não Renovação**
   - Tipo: Donut Chart
   - Dados: `evasoes_v2` WHERE tipo_saida_id = 2

6. **Motivos de Cancelamento**
   - Tipo: Donut Chart
   - Dados: `evasoes_v2` WHERE tipo_saida_id = 1

---

## 📊 ABA COMERCIAL

### Visão Geral
A aba Comercial apresenta o funil de vendas completo, desde a captação de leads até a conversão em matrículas.

### Lógica de Dados Históricos vs Atual

```typescript
// Detectar se é período histórico
const isHistorico = ano < currentYear || (ano === currentYear && mesFinal < currentMonth);

if (isHistorico) {
  // Usar vw_kpis_comercial_historico
} else {
  // Usar leads_diarios + alunos (tempo real)
}
```

---

### Sub-aba: Leads

#### KPIs Principais (4 cards)

| KPI | Fonte (Histórico) | Fonte (Atual) | Cálculo |
|-----|-------------------|---------------|---------|
| **Total Leads** | `vw_kpis_comercial_historico` | `leads_diarios` | `SUM(total_leads)` |
| **Leads Ativos** | N/A | `leads_diarios` | `COUNT(*) WHERE status != 'arquivado'` |
| **Leads Arquivados** | N/A | `leads_diarios` | `COUNT(*) WHERE status = 'arquivado'` |
| **Taxa Lead→Exp** | Calculado | Calculado | `(experimentais / leads) * 100` |

#### Gráficos

1. **Leads por Canal de Origem**
   - Tipo: Donut Chart
   - Dados Histórico: `origem_leads` WHERE tipo = 'leads'
   - Dados Atual: `leads_diarios` agrupado por `canais_origem.nome`

2. **Leads por Curso**
   - Tipo: Bar Chart
   - Dados: `leads_diarios` agrupado por `cursos.nome`

3. **Motivos de Arquivamento**
   - Tipo: Donut Chart
   - Dados: `leads_diarios` agrupado por `motivos_arquivamento.nome`

---

### Sub-aba: Experimentais

#### KPIs Principais (4 cards)

| KPI | Fonte (Histórico) | Fonte (Atual) | Cálculo |
|-----|-------------------|---------------|---------|
| **Experimentais Marcadas** | `vw_kpis_comercial_historico` | `leads_diarios` | `COUNT(*) WHERE data_experimental IS NOT NULL` |
| **Experimentais Realizadas** | `vw_kpis_comercial_historico` | `leads_diarios` | `COUNT(*) WHERE compareceu = true` |
| **Faltaram** | N/A | `leads_diarios` | `COUNT(*) WHERE compareceu = false` |
| **Taxa Show-up** | Calculado | Calculado | `(realizadas / marcadas) * 100` |

#### KPI Adicional

| KPI | Cálculo |
|-----|---------|
| **Taxa Conversão Exp→Mat** | `(matriculas / experimentais) * 100` |

#### Gráficos

1. **Experimentais por Professor**
   - Tipo: Ranking Table
   - Dados Histórico: `experimentais_professor_mensal`
   - Dados Atual: `leads_diarios` agrupado por professor

2. **Experimentais por Canal**
   - Tipo: Donut Chart
   - Dados Histórico: `origem_leads` WHERE tipo = 'experimentais'
   - Dados Atual: `leads_diarios` agrupado por canal

---

### Sub-aba: Matrículas

#### KPIs Principais (4 cards)

| KPI | Fonte (Histórico) | Fonte (Atual) | Cálculo |
|-----|-------------------|---------------|---------|
| **Novas Matrículas** | `vw_kpis_comercial_historico` | `alunos` | `COUNT(*) WHERE data_matricula no período` |
| **Matrículas LA Kids** | `vw_kpis_comercial_historico` | `alunos` | `COUNT(*) WHERE idade_atual <= 11` |
| **Matrículas LA School** | `vw_kpis_comercial_historico` | `alunos` | `COUNT(*) WHERE idade_atual >= 12` |
| **Ticket Médio Passaporte** | `vw_kpis_comercial_historico` | `dados_mensais` | `AVG(ticket_medio_passaporte)` |

#### KPIs Financeiros (3 cards)

| KPI | Cálculo |
|-----|---------|
| **Faturamento Passaportes** | `SUM(valor_passaporte)` |
| **Faturamento Parcelas** | `matriculas * ticket_medio_parcela` |
| **Projeção Mensal** | `faturamento_parcelas * 12` |

#### Gráficos

1. **Matrículas por Curso**
   - Tipo: Bar Chart
   - Dados Histórico: `cursos_matriculados`
   - Dados Atual: `alunos` agrupado por curso

2. **Matrículas por Canal de Origem**
   - Tipo: Donut Chart
   - Dados: `alunos` agrupado por `canais_origem.nome`

3. **Matrículas por Professor**
   - Tipo: Ranking Table
   - Dados: `alunos` agrupado por `professores.nome`

4. **Distribuição por Faixa Etária**
   - Tipo: Donut Chart
   - Dados: LA Kids vs LA School

5. **Motivos de Não Matrícula**
   - Tipo: Donut Chart
   - Dados: `leads_diarios` agrupado por `motivos_nao_matricula.nome`

---

## 👨‍🏫 ABA PROFESSORES

### Visão Geral
A aba Professores apresenta KPIs individuais e rankings de performance dos professores.

### Lógica de Dados

```typescript
// Fontes de dados
const viewName = isCurrentPeriod ? 'vw_kpis_professor_mensal' : 'vw_kpis_professor_historico';

// Dados de carteira atual
const qualidadeData = await supabase.from('vw_kpis_professor_completo').select('*');

// Dados de performance (conversão e retenção)
const performanceData = await supabase.from('professores_performance').select('*').eq('ano', ano);
```

---

### Sub-aba: Visão Geral

#### KPIs Principais (5 cards)

| KPI | Fonte | Cálculo |
|-----|-------|---------|
| **Total Professores** | `vw_kpis_professor_completo` | `COUNT(*) WHERE carteira_alunos > 0` |
| **Total Alunos** | `vw_kpis_professor_completo` | `SUM(carteira_alunos)` |
| **Média de Alunos** | Calculado | `total_alunos / total_professores` |
| **Média Alunos/Turma** | `vw_kpis_professor_completo` | `AVG(media_alunos_turma)` |
| **Ticket Médio** | `vw_kpis_professor_completo` | `AVG(ticket_medio)` |

#### Rankings

1. **Ranking - Mais Alunos**
   - Tipo: Ranking Table Collapsible
   - Dados: Professores ordenados por `carteira_alunos DESC`

2. **Ranking - Maior Ticket Médio**
   - Tipo: Ranking Table Collapsible
   - Dados: Professores ordenados por `ticket_medio DESC`

---

### Sub-aba: Conversão

#### KPIs Principais (4 cards)

| KPI | Fonte | Cálculo |
|-----|-------|---------|
| **Experimentais** | `professores_performance` | `SUM(experimentais)` |
| **Matrículas** | `professores_performance` | `SUM(matriculas)` |
| **Taxa Conversão** | Calculado | `(matriculas / experimentais) * 100` |
| **Melhor Professor** | Calculado | Professor com maior taxa de conversão |

#### Rankings

1. **Ranking Professores Matriculadores**
   - Tipo: Ranking Table Collapsible
   - Dados: Professores ordenados por `matriculas DESC`

2. **Ranking Melhor Taxa de Conversão**
   - Tipo: Ranking Table Collapsible
   - Dados: Professores ordenados por `taxa_conversao DESC`

---

### Sub-aba: Retenção

#### KPIs Principais (4 cards)

| KPI | Fonte | Cálculo |
|-----|-------|---------|
| **Renovações** | `professores_performance` | `SUM(renovacoes)` |
| **Não Renovações** | Calculado | `SUM(contratos_vencer - renovacoes)` |
| **Evasões (Churn)** | `professores_performance` | `SUM(evasoes)` |
| **MRR Perdido** | `evasoes_v2` | `SUM(valor_parcela)` |

#### Cálculo da Taxa de Renovação

```typescript
const renovacoes = performanceData.reduce((acc, p) => acc + (p.renovacoes || 0), 0);
const contratosVencer = performanceData.reduce((acc, p) => acc + (p.contratos_vencer || 0), 0);
const taxaRenovacao = contratosVencer > 0 ? (renovacoes / contratosVencer) * 100 : 0;
```

**Exemplo Nov/2025:**
- Renovações: 553
- Contratos a Vencer: 690
- Taxa: 553/690 = **80.1%**

#### Rankings

1. **Ranking Renovadores**
   - Tipo: Ranking Table Collapsible
   - Dados: Professores ordenados por `taxa_renovacao DESC`

2. **Menor Churn (Melhor Retenção)**
   - Tipo: Ranking Table Collapsible
   - Dados: Professores ordenados por `evasoes ASC`

---

### Sub-aba: Qualidade

#### KPIs Principais (3 cards)

| KPI | Fonte | Cálculo |
|-----|-------|---------|
| **NPS Médio** | `vw_kpis_professor_completo` | `AVG(nps_medio)` |
| **Presença Média** | `vw_kpis_professor_completo` | `AVG(media_presenca)` |
| **Média Alunos/Turma** | `vw_kpis_professor_completo` | `AVG(media_alunos_turma)` |

#### Rankings

1. **Ranking NPS**
   - Tipo: Ranking Table Collapsible
   - Dados: Professores ordenados por `nps_medio DESC`
   - **Status:** Aguardando integração com Emusys

2. **Ranking Média Alunos/Turma**
   - Tipo: Ranking Table Collapsible
   - Dados: Professores ordenados por `media_alunos_turma DESC`
   - **Status:** Aguardando integração com Emusys

---

## 🔔 SISTEMA DE ALERTAS

### View: `vw_alertas`

O sistema gera alertas automáticos baseados em regras de negócio:

| Tipo | Condição | Exemplo |
|------|----------|---------|
| **Churn Alto** | `churn_rate > 5%` | "Churn de 6.2% na unidade Campo Grande" |
| **Inadimplência** | `inadimplencia_pct > 10%` | "Inadimplência de 12% na unidade Recreio" |
| **Queda Matrículas** | `matriculas < media_3_meses * 0.7` | "Queda de 35% nas matrículas" |
| **Renovação Baixa** | `taxa_renovacao < 70%` | "Taxa de renovação de 65%" |

---

## 📅 FILTROS DE COMPETÊNCIA

### Hook: `useCompetenciaFiltro`

O sistema suporta 4 tipos de filtro temporal:

| Tipo | Descrição | Range |
|------|-----------|-------|
| **Mensal** | Mês específico | `mesInicio = mesFim = mes` |
| **Trimestral** | Q1, Q2, Q3, Q4 | `mesInicio = primeiro_mes_trimestre`, `mesFim = ultimo_mes_trimestre` |
| **Semestral** | 1º ou 2º semestre | `mesInicio = 1 ou 7`, `mesFim = 6 ou 12` |
| **Anual** | Ano completo | `mesInicio = 1`, `mesFim = 12` |

### Interface

```typescript
interface CompetenciaFiltro {
  tipo: 'mensal' | 'trimestral' | 'semestral' | 'anual';
  ano: number;
  mes: number;
  trimestre: 1 | 2 | 3 | 4;
  semestre: 1 | 2;
}

interface CompetenciaRange {
  startDate: string;  // "2025-01-01"
  endDate: string;    // "2025-12-31"
  meses: number[];    // [1, 2, 3, ...]
  label: string;      // "Q4 2025" ou "Dez/2025"
  ano: number;
  mesInicio: number;
  mesFim: number;
}
```

---

## 🔄 COMPARATIVOS HISTÓRICOS

Todas as abas suportam comparativos com:

1. **Mês Anterior**
   - Cálculo: `mes - 1` (ou `12` se `mes = 1`)
   - Fonte: `dados_mensais` ou `dados_comerciais`

2. **Mesmo Mês do Ano Anterior**
   - Cálculo: `ano - 1`, mesmo `mes`
   - Fonte: `dados_mensais` ou `dados_comerciais`

### Exibição

```
┌─────────────────────────────────┐
│  902                            │
│  Total Alunos                   │
│  ▲ +4.2% vs Out/25              │
│  ▲ +8.5% vs Nov/24              │
└─────────────────────────────────┘
```

---

## 📊 DADOS HISTÓRICOS DISPONÍVEIS

### Resumo por Tabela

| Tabela | Período | Registros |
|--------|---------|-----------|
| `dados_mensais` | Jan/2024 - Dez/2025 | ~72 (3 unidades × 24 meses) |
| `dados_comerciais` | Jan/2025 - Dez/2025 | ~36 (3 unidades × 12 meses) |
| `professores_performance` | 2025 | ~42 professores |
| `experimentais_professor_mensal` | 2025 | ~500 registros |
| `experimentais_mensal_unidade` | 2025 | ~36 registros |
| `origem_leads` | 2025 | ~200 registros |
| `cursos_matriculados` | 2025 | ~150 registros |

### Exemplo de Dados (Nov/2025 - Consolidado)

| Métrica | Valor |
|---------|-------|
| **Alunos Ativos** | 902 |
| **Alunos Pagantes** | 902 |
| **Ticket Médio** | R$ 435,73 |
| **MRR** | R$ 393.028,46 |
| **Churn Rate** | 4.2% |
| **Taxa Renovação** | 80.1% |
| **Leads** | 486 |
| **Experimentais** | 80 |
| **Matrículas** | 46 |
| **Taxa Conversão** | 57.5% |
| **Total Professores** | 40 |
| **Média Alunos/Prof** | 22.6 |

---

## 🎨 COMPONENTES UI

### KPICard
Card padrão para exibição de KPIs.

```typescript
interface KPICardProps {
  icon: LucideIcon;
  label: string;
  value: number | string;
  subvalue?: string;
  format?: 'number' | 'currency' | 'percent';
  variant?: 'cyan' | 'emerald' | 'violet' | 'amber' | 'rose';
  comparativoMesAnterior?: { valor: number; label: string };
  comparativoAnoAnterior?: { valor: number; label: string };
}
```

### RankingTableCollapsible
Tabela de ranking com acordeon.

```typescript
interface RankingTableCollapsibleProps {
  data: { id: number; nome: string; valor: number; subvalor?: string }[];
  title: string;
  valorLabel: string;
  topCount?: number; // Quantos mostrar antes de colapsar
  valorFormatter?: (value: number) => string;
}
```

### EvolutionChart
Gráfico de linha para evolução temporal.

```typescript
interface EvolutionChartProps {
  data: { name: string; [key: string]: string | number }[];
  lines: { dataKey: string; color: string; name: string }[];
  title?: string;
  yAxisFormatter?: (value: number) => string;
}
```

### FunnelChart
Gráfico de funil comercial.

```typescript
interface FunnelChartProps {
  steps: { label: string; value: number; color: string; subLabel?: string }[];
  title?: string;
}
```

### DistributionChart
Gráfico de distribuição (donut/pie).

```typescript
interface DistributionChartProps {
  data: { name: string; value: number }[];
  title?: string;
  colors?: string[];
}
```

---

## 🔐 SEGURANÇA E PERMISSÕES

### Row Level Security (RLS)

Todas as tabelas possuem RLS habilitado:

```sql
-- Exemplo: alunos
ALTER TABLE alunos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem ver alunos"
ON alunos FOR SELECT
TO authenticated
USING (true);
```

### Roles

| Role | Permissões |
|------|------------|
| `admin` | CRUD completo em todas as tabelas |
| `gestor` | SELECT em todas as tabelas, INSERT/UPDATE em leads e evasões |
| `professor` | SELECT apenas dos próprios alunos |

---

## 🚀 PERFORMANCE

### Otimizações Implementadas

1. **Views Materializadas**
   - `vw_kpis_gestao_mensal` - Refresh automático
   - `vw_kpis_professor_completo` - Refresh automático

2. **Índices**
   ```sql
   CREATE INDEX idx_alunos_status ON alunos(status);
   CREATE INDEX idx_alunos_unidade ON alunos(unidade_id);
   CREATE INDEX idx_alunos_data_matricula ON alunos(data_matricula);
   CREATE INDEX idx_leads_data ON leads_diarios(data);
   CREATE INDEX idx_evasoes_data ON evasoes_v2(data_evasao);
   ```

3. **Lazy Loading**
   - Gráficos carregados sob demanda
   - Rankings com paginação (acordeon)

4. **Caching**
   - React Query para cache de requisições
   - Memoização de cálculos pesados

---

## 📝 NOTAS DE IMPLEMENTAÇÃO

### Campos Pendentes de Integração

| Campo | Tabela | Status |
|-------|--------|--------|
| `media_alunos_turma` | `professores` | Aguardando Emusys |
| `nps_medio` | `professores` | Aguardando Emusys |
| `media_presenca` | `professores` | Aguardando Emusys |
| `taxa_faltas` | `professores` | Aguardando Emusys |

### Regras de Negócio Importantes

1. **Ticket Médio**
   - Inclui TODOS os alunos pagantes (pagos + inadimplentes)
   - Não exclui inadimplentes do cálculo

2. **Taxa de Renovação**
   - `renovacoes / contratos_vencer * 100`
   - Contratos a vencer = renovações + não renovações

3. **Churn Rate**
   - `evasoes / alunos_ativos_inicio_mes * 100`
   - Considera apenas evasões efetivas (não avisos prévios)

4. **LTV**
   - `ticket_medio * tempo_permanencia_medio`

---

## 📈 ROADMAP FUTURO

### Curto Prazo (Q1 2026)
- [ ] Integração com Emusys (NPS, presença, turmas)
- [ ] Dashboard de metas vs realizado
- [ ] Alertas por e-mail

### Médio Prazo (Q2-Q3 2026)
- [ ] Previsão de churn com ML
- [ ] Análise de cohort
- [ ] Exportação de relatórios PDF

### Longo Prazo (Q4 2026)
- [ ] App mobile para gestores
- [ ] Integração com WhatsApp Business
- [ ] BI avançado com Metabase

---

## 📞 SUPORTE

**Equipe de Desenvolvimento**
- Repositório: `LA-performance-report`
- Stack: React + TypeScript + Supabase
- Ambiente: Vercel (produção)

---

*Documento gerado automaticamente em 19/01/2026*
*Versão do Sistema: 2.0.0*
*Total de KPIs: 70+*
*Total de Gráficos: 25+*
*Total de Rankings: 12*
