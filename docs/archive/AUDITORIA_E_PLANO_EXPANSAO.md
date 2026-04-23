# 🔍 AUDITORIA COMPLETA + PLANO DE EXPANSÃO (REVISADO)
## LA Music Performance Report 2026

> **Data:** 18/01/2026 (Revisão 2)  
> **Autor:** Auditoria Técnica  
> **Status:** Documento de Referência para Expansão  
> **Total KPIs Especificados:** 75 (44 entrada + 31 calculados)

---

## 📋 ÍNDICE

1. [Resumo Executivo](#1-resumo-executivo)
2. [Auditoria do Banco de Dados](#2-auditoria-do-banco-de-dados)
3. [Auditoria dos 75 KPIs](#3-auditoria-dos-75-kpis)
4. [Auditoria do Frontend](#4-auditoria-do-frontend)
5. [Gap Analysis Detalhado](#5-gap-analysis-detalhado)
6. [Plano de Expansão em Fases](#6-plano-de-expansão-em-fases)
7. [Cronograma Sugerido](#7-cronograma-sugerido)

---

## 1. RESUMO EXECUTIVO

### Visão Geral dos 75 KPIs

| Categoria | Entrada Manual | Cálculo Automático | Total | Implementado BD | Implementado FE |
|-----------|:--------------:|:------------------:|:-----:|:---------------:|:---------------:|
| **Gestão/Retenção** | 18 | 12 | 30 | 22 (73%) | 8 (27%) |
| **Comercial** | 16 | 8 | 24 | 14 (58%) | 6 (25%) |
| **Professor** | 10 | 11 | 21 | 8 (38%) | 5 (24%) |
| **TOTAL** | **44** | **31** | **75** | **44 (59%)** | **19 (25%)** |

### Status Geral
- 🟢 **Banco de Dados:** 59% dos campos existem nas tabelas
- 🟡 **Views:** 33 views criadas, mas faltam agregações específicas
- 🔴 **Frontend:** Apenas 25% dos KPIs exibidos em dashboards

---

## 1. AUDITORIA DO BANCO DE DADOS

### 1.1 Tabelas Existentes vs Documento

| Tabela | Doc. Especifica | Existe no BD | Registros | Status |
|--------|:---------------:|:------------:|:---------:|:------:|
| `unidades` | ✅ | ✅ | 3 | ✅ OK |
| `professores` | ✅ | ✅ | 44 | ✅ OK |
| `cursos` | ✅ | ✅ | 16 | ✅ OK |
| `canais_origem` | ✅ | ✅ | 9 | ✅ OK |
| `motivos_saida` | ✅ | ✅ | 12 | ✅ OK |
| `tipos_saida` | ✅ | ✅ | 3 | ⚠️ Falta TRANSFERENCIA |
| `tipos_matricula` | ✅ | ✅ | 5 | ✅ OK |
| `formas_pagamento` | ✅ | ✅ | 5 | ✅ OK |
| `motivos_arquivamento` | ✅ | ❌ | - | 🔴 CRIAR |
| `horarios` | ✅ | ❌ | - | 🔴 CRIAR |
| `alunos` | ✅ | ✅ | 911 | ✅ OK |
| `evasoes` (histórico) | ✅ | ✅ | 619 | ✅ Read-only |
| `evasoes_v2` | ✅ | ✅ | 0 | ✅ OK (nova) |
| `renovacoes` | ✅ | ✅ | 0 | ✅ OK |
| `leads_diarios` | ✅ | ✅ | 0 | ✅ OK |
| `relatorios_diarios` | ✅ | ✅ | 0 | ✅ OK |
| `metas` | ✅ | ✅ | 7 | ✅ OK |
| `audit_log` | ✅ | ✅ | 174 | ✅ OK |

### 1.2 Campos Faltantes nas Tabelas

#### Tabela `tipos_matricula`
| Campo Doc. | Existe | Status |
|------------|:------:|:------:|
| `entra_ltv` | ❌ | 🔴 ADICIONAR |
| `entra_churn` | ❌ | 🔴 ADICIONAR |

#### Tabela `evasoes_v2`
| Campo Doc. | Existe | Status |
|------------|:------:|:------:|
| `curso_id` | ❌ | 🔴 ADICIONAR |
| `nps_saida` | ❌ | 🔴 ADICIONAR |

#### Tabela `relatorios_diarios`
| Campo Doc. | Existe | Status |
|------------|:------:|:------:|
| `ticket_medio_atual` | ✅ | ✅ OK |
| `alunos_pagantes` (GENERATED) | ❌ | 🟡 Implementar como coluna calculada |

### 1.3 Views Existentes (33 views)

| View | Propósito | Status |
|------|-----------|:------:|
| `vw_kpis_mensais` | KPIs consolidados por mês | ✅ Existe |
| `vw_dashboard_unidade` | Dashboard por unidade | ✅ Existe |
| `vw_alertas` | Alertas automáticos | ✅ Existe |
| `vw_metas_vs_realizado` | Comparativo metas | ✅ Existe |
| `vw_projecao_metas` | Projeção de metas | ✅ Existe |
| `vw_ranking_unidades` | Ranking entre unidades | ✅ Existe |
| `vw_ranking_professores_evasoes` | Ranking churn professor | ✅ Existe |
| `vw_ranking_professores_retencao` | Ranking renovação professor | ✅ Existe |
| `vw_performance_professor_experimental` | Conversão por professor | ✅ Existe |
| `vw_funil_conversao_mensal` | Funil comercial | ✅ Existe |
| `vw_leads_por_canal` | Leads por canal | ✅ Existe |
| `vw_matriculas_por_canal` | Matrículas por canal | ✅ Existe |
| `vw_evasoes_motivos` | Evasões por motivo | ✅ Existe |
| `vw_evasoes_professores` | Evasões por professor | ✅ Existe |
| `vw_ltv_por_unidade` | LTV por unidade | ✅ Existe |
| `vw_sazonalidade` | Análise sazonal | ✅ Existe |

### 1.4 Views Faltantes (do documento)

| View | Propósito | Prioridade |
|------|-----------|:----------:|
| `vw_kpis_professor` | KPIs completos por professor | 🔴 Alta |
| `vw_analise_canal` | ROI por canal de origem | 🟡 Média |
| `vw_analise_motivo_saida` | Análise detalhada de motivos | 🟡 Média |

### 1.5 Funções/Triggers Faltantes

| Função | Propósito | Status |
|--------|-----------|:------:|
| `fn_projecao_meta()` | Calcular projeção de meta | 🔴 CRIAR |
| `calc_percentual_reajuste()` | Trigger para renovações | 🔴 CRIAR |

---

## 2. AUDITORIA DO FRONTEND

### 2.1 Componentes Existentes

#### Sistema Principal (`/app/*`)
| Componente | Rota | Status |
|------------|------|:------:|
| `DashboardPage` | `/app` | ✅ Básico |
| `PlanilhaComercial` | `/app/comercial` | ✅ Implementado |
| `PlanilhaRetencao` | `/app/retencao` | ✅ Implementado |
| `SnapshotDiario` | `/app/snapshot` | ✅ Implementado |
| `EntradaMenu` | `/app/entrada` | ✅ Existe |
| `FormLead` | `/app/entrada/lead` | ✅ Existe |
| `FormMatricula` | `/app/entrada/matricula` | ✅ Existe |
| `FormEvasao` | `/app/entrada/evasao` | ✅ Existe |
| `FormRenovacao` | `/app/entrada/renovacao` | ✅ Existe |
| `GerenciarUsuarios` | `/app/admin/usuarios` | ✅ Existe |

#### Apresentações (Dashboards Analíticos)
| Componente | Propósito | Status |
|------------|-----------|:------:|
| `ComercialDashboard` | Dashboard comercial completo | ✅ 10+ páginas |
| `RetencaoDashboard` | Dashboard retenção completo | ✅ 10+ páginas |

### 2.2 KPIs Implementados no Frontend

#### Dashboard Principal (`DashboardPage`)
| KPI | Implementado | Fonte |
|-----|:------------:|-------|
| Alunos Ativos | ✅ | `vw_dashboard_unidade` |
| Alunos Pagantes | ✅ | `vw_dashboard_unidade` |
| Ticket Médio | ✅ | `vw_dashboard_unidade` |
| Faturamento Previsto | ✅ | `vw_dashboard_unidade` |
| Alertas | ✅ | `vw_alertas` |

#### Comercial (`useComercialData`)
| KPI | Implementado | Fonte |
|-----|:------------:|-------|
| Total Leads | ✅ | `dados_comerciais` |
| Experimentais | ✅ | `dados_comerciais` |
| Novas Matrículas | ✅ | `dados_comerciais` |
| Taxa Conversão Lead→Exp | ✅ | Calculado |
| Taxa Conversão Exp→Mat | ✅ | Calculado |
| Faturamento Passaportes | ✅ | `dados_comerciais` |

#### Retenção (`useEvasoesData`)
| KPI | Implementado | Fonte |
|-----|:------------:|-------|
| Total Evasões | ✅ | `evasoes` |
| MRR Perdido | ✅ | Calculado |
| Churn Rate | ✅ | Calculado |
| Motivo Principal | ✅ | Agregado |
| Professor Crítico | ✅ | Agregado |

#### Professor (`useProfessoresPerformance`)
| KPI | Implementado | Fonte |
|-----|:------------:|-------|
| Experimentais por Professor | ✅ | `professores_performance` |
| Matrículas por Professor | ✅ | `professores_performance` |
| Taxa Conversão | ✅ | `professores_performance` |
| Evasões por Professor | ✅ | `professores_performance` |
| Taxa Renovação | ✅ | `professores_performance` |
| Score de Saúde | ✅ | Calculado |
| Nível de Risco | ✅ | Calculado |

### 2.3 KPIs NÃO Implementados no Frontend

| KPI | Categoria | Prioridade |
|-----|-----------|:----------:|
| LTV (Lifetime Value) | Gestão | 🔴 Alta |
| Tempo Permanência Médio | Gestão | 🔴 Alta |
| Inadimplência (R$ e %) | Gestão | 🔴 Alta |
| Renovações Previstas/Pendentes | Retenção | 🔴 Alta |
| Taxa de Renovação | Retenção | 🔴 Alta |
| MRR Perdido por Professor | Professor | 🟡 Média |
| Ticket Médio por Professor | Professor | 🟡 Média |
| Ranking Matriculador | Professor | 🟡 Média |
| Ranking Renovador | Professor | 🟡 Média |
| Ranking Churn (invertido) | Professor | 🟡 Média |
| NPS de Saída | Retenção | 🟢 Baixa |
| Taxa de Presença | Professor | 🟢 Baixa |

### 2.4 Funcionalidades Faltantes

| Funcionalidade | Categoria | Prioridade |
|----------------|-----------|:----------:|
| **KPI Cards Dinâmicos** | Dashboard | 🔴 Alta |
| **Comparativo Meta vs Realizado** | Dashboard | 🔴 Alta |
| **Projeção de Meta** | Dashboard | 🔴 Alta |
| **Alertas Inteligentes** | Dashboard | 🔴 Alta |
| **Gráfico de Tendência** | Dashboard | 🟡 Média |
| **Filtro por Período** | Global | 🟡 Média |
| **Exportar Relatório PDF** | Relatórios | 🟡 Média |
| **Gamificação entre Unidades** | Ranking | 🟢 Baixa |
| **Notificações Push** | Sistema | 🟢 Baixa |

---

## 3. GAP ANALYSIS

### 3.1 Resumo de Gaps

| Área | Especificado | Implementado | Gap |
|------|:------------:|:------------:|:---:|
| **Tabelas BD** | 18 | 16 | 2 |
| **Views BD** | 4 novas | 33 existentes | +29 ✅ |
| **KPIs Gestão** | 30 | 12 | 18 |
| **KPIs Comercial** | 24 | 10 | 14 |
| **KPIs Professor** | 21 | 8 | 13 |
| **Componentes UI** | - | 56 | - |

### 3.2 Priorização de Gaps

#### 🔴 CRÍTICO (Implementar Primeiro)
1. Criar tabelas `motivos_arquivamento` e `horarios`
2. Adicionar campos faltantes em `tipos_matricula` e `evasoes_v2`
3. Criar tipo de saída `TRANSFERENCIA`
4. Implementar KPI Cards no Dashboard principal
5. Implementar LTV e Tempo de Permanência
6. Implementar Comparativo Meta vs Realizado

#### 🟡 IMPORTANTE (Fase 2)
1. Criar view `vw_kpis_professor` completa
2. Implementar Projeção de Meta
3. Implementar Inadimplência
4. Criar Rankings de Professor
5. Implementar Filtros avançados

#### 🟢 DESEJÁVEL (Fase 3)
1. NPS de Saída
2. Gamificação
3. Exportação PDF
4. Notificações

---

## 4. PLANO DE EXPANSÃO EM FASES

### FASE 1: FUNDAÇÃO (2 semanas)
**Objetivo:** Corrigir gaps críticos no banco e criar dashboard funcional

#### 1.1 Banco de Dados
```sql
-- Criar tabelas faltantes
CREATE TABLE motivos_arquivamento (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO motivos_arquivamento (nome) VALUES
  ('Não respondeu'), ('Desistiu'), ('Fora do perfil'),
  ('Preço'), ('Horário incompatível'), ('Distância'), ('Outro');

CREATE TABLE horarios (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(20) NOT NULL,
  hora_inicio TIME,
  hora_fim TIME,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO horarios (nome, hora_inicio, hora_fim) VALUES
  ('Manhã', '08:00', '12:00'),
  ('Tarde', '12:00', '18:00'),
  ('Noite', '18:00', '22:00');

-- Adicionar tipo de saída TRANSFERENCIA
INSERT INTO tipos_saida (codigo, nome, descricao) 
VALUES ('TRANSFERENCIA', 'Transferência', 'Mudou de unidade');

-- Adicionar campos em tipos_matricula
ALTER TABLE tipos_matricula 
ADD COLUMN entra_ltv BOOLEAN DEFAULT true,
ADD COLUMN entra_churn BOOLEAN DEFAULT true;

UPDATE tipos_matricula SET entra_ltv = false, entra_churn = false 
WHERE codigo IN ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA');

-- Adicionar campos em evasoes_v2
ALTER TABLE evasoes_v2 
ADD COLUMN curso_id INTEGER REFERENCES cursos(id),
ADD COLUMN nps_saida DECIMAL(3,1);
```

#### 1.2 Frontend - Dashboard Principal Renovado

**Componentes a criar:**
- `KPICard.tsx` - Card reutilizável com variantes
- `KPIGrid.tsx` - Grid responsivo de KPIs
- `MetaProgress.tsx` - Barra de progresso com meta
- `TrendIndicator.tsx` - Indicador de tendência
- `AlertBanner.tsx` - Banner de alertas

**Layout do Dashboard:**
```
┌─────────────────────────────────────────────────────────────┐
│  HEADER: Filtros (Unidade, Período) + Busca                │
├─────────────────────────────────────────────────────────────┤
│  KPI CARDS (4 principais)                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Alunos   │ │ Ticket   │ │ Churn    │ │ LTV      │       │
│  │ Ativos   │ │ Médio    │ │ Rate     │ │          │       │
│  │ 911      │ │ R$ 450   │ │ 3.2%     │ │ R$ 5.4k  │       │
│  │ ▲ +12    │ │ ▲ +5%    │ │ ▼ -0.3%  │ │ ▲ +8%   │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
├─────────────────────────────────────────────────────────────┤
│  META vs REALIZADO (3 cards)                                │
│  ┌──────────────────┐ ┌──────────────────┐ ┌─────────────┐ │
│  │ Matrículas       │ │ Faturamento      │ │ Renovações  │ │
│  │ ████████░░ 80%   │ │ ██████░░░░ 60%   │ │ █████████░  │ │
│  │ 24/30 meta       │ │ R$ 180k/300k     │ │ 45/50       │ │
│  └──────────────────┘ └──────────────────┘ └─────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  GRÁFICOS (2 colunas)                                       │
│  ┌─────────────────────────┐ ┌─────────────────────────┐   │
│  │ Evolução Mensal         │ │ Funil de Conversão      │   │
│  │ (Line Chart)            │ │ (Funnel Chart)          │   │
│  └─────────────────────────┘ └─────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  ALERTAS + AÇÕES RÁPIDAS                                    │
│  ⚠️ 3 renovações pendentes esta semana                      │
│  ⚠️ Churn acima da meta em Campo Grande                     │
└─────────────────────────────────────────────────────────────┘
```

---

### FASE 2: KPIs AVANÇADOS (2 semanas)
**Objetivo:** Implementar todos os KPIs do documento

#### 2.1 Novos Hooks
- `useLTV.ts` - Cálculo de LTV com regras de negócio
- `useInadimplencia.ts` - Cálculo de inadimplência
- `useRenovacoes.ts` - Gestão de renovações
- `useProjecaoMeta.ts` - Projeção automática

#### 2.2 Novas Views no Banco
```sql
-- View completa de KPIs por Professor
CREATE OR REPLACE VIEW vw_kpis_professor_completo AS
WITH carteira AS (
  SELECT professor_atual_id, COUNT(*) as qtd_alunos, AVG(valor_parcela) as ticket_medio
  FROM alunos WHERE status = 'ativo' GROUP BY professor_atual_id
),
experimentais AS (
  SELECT professor_experimental_id, COUNT(*) as total
  FROM leads_diarios WHERE tipo = 'experimental_realizada'
  GROUP BY professor_experimental_id
),
matriculas AS (
  SELECT professor_experimental_id, COUNT(*) as total
  FROM leads_diarios WHERE tipo = 'matricula'
  GROUP BY professor_experimental_id
),
evasoes AS (
  SELECT professor_id, COUNT(*) as total, SUM(valor_parcela) as mrr_perdido
  FROM evasoes_v2 GROUP BY professor_id
),
renovacoes AS (
  SELECT professor_id, 
    COUNT(*) FILTER (WHERE status = 'realizada') as realizadas,
    COUNT(*) FILTER (WHERE status = 'nao_renovada') as nao_renovadas
  FROM renovacoes GROUP BY professor_id
)
SELECT 
  p.id, p.nome, p.unidade_id,
  COALESCE(c.qtd_alunos, 0) as carteira_alunos,
  COALESCE(c.ticket_medio, 0) as ticket_medio,
  COALESCE(e.total, 0) as experimentais,
  COALESCE(m.total, 0) as matriculas,
  CASE WHEN e.total > 0 THEN ROUND((m.total::decimal / e.total) * 100, 2) ELSE 0 END as taxa_conversao,
  COALESCE(ev.total, 0) as evasoes,
  COALESCE(ev.mrr_perdido, 0) as mrr_perdido,
  COALESCE(r.realizadas, 0) as renovacoes,
  COALESCE(r.nao_renovadas, 0) as nao_renovacoes,
  CASE WHEN r.realizadas + r.nao_renovadas > 0 
    THEN ROUND((r.realizadas::decimal / (r.realizadas + r.nao_renovadas)) * 100, 2) 
    ELSE 0 END as taxa_renovacao,
  RANK() OVER (ORDER BY CASE WHEN e.total > 0 THEN (m.total::decimal / e.total) ELSE 0 END DESC) as ranking_matriculador,
  RANK() OVER (ORDER BY CASE WHEN r.realizadas + r.nao_renovadas > 0 THEN (r.realizadas::decimal / (r.realizadas + r.nao_renovadas)) ELSE 0 END DESC) as ranking_renovador,
  RANK() OVER (ORDER BY COALESCE(ev.total, 0) ASC) as ranking_churn
FROM professores p
LEFT JOIN carteira c ON p.id = c.professor_atual_id
LEFT JOIN experimentais e ON p.id = e.professor_experimental_id
LEFT JOIN matriculas m ON p.id = m.professor_experimental_id
LEFT JOIN evasoes ev ON p.id = ev.professor_id
LEFT JOIN renovacoes r ON p.id = r.professor_id
WHERE p.ativo = true;
```

#### 2.3 Componentes de Ranking
- `RankingTable.tsx` - Tabela com ranking e medalhas
- `RankingCard.tsx` - Card de posição no ranking
- `PodiumChart.tsx` - Gráfico de pódio (top 3)

---

### FASE 3: METAS E OKRs (2 semanas)
**Objetivo:** Sistema completo de gestão de metas

#### 3.1 Tela de Gestão de Metas
- CRUD de metas por período (mensal, trimestral, anual)
- Definição de metas por unidade
- Histórico de metas

#### 3.2 Dashboard de OKRs
```
┌─────────────────────────────────────────────────────────────┐
│  OKRs DO TRIMESTRE                                          │
├─────────────────────────────────────────────────────────────┤
│  O1: Crescer base de alunos em 15%                          │
│  ├─ KR1: 30 matrículas/mês ████████░░ 80%                  │
│  ├─ KR2: Churn < 3% ██████████ 100% ✅                      │
│  └─ KR3: NPS > 8.5 ███████░░░ 70%                          │
│                                                             │
│  O2: Aumentar faturamento em 20%                            │
│  ├─ KR1: Ticket médio R$ 500 ██████░░░░ 60%                │
│  └─ KR2: Inadimplência < 2% █████████░ 90%                 │
└─────────────────────────────────────────────────────────────┘
```

#### 3.3 Alertas de Tendência
- 🟢 No caminho (projeção >= meta)
- 🟡 Atenção (projeção entre 80-99% da meta)
- 🔴 Crítico (projeção < 80% da meta)

---

### FASE 4: RELATÓRIOS E EXPORTAÇÃO (1 semana)
**Objetivo:** Relatórios profissionais e exportação

#### 4.1 Relatórios
- Relatório Mensal Consolidado (PDF)
- Relatório por Unidade (PDF)
- Relatório de Professor (PDF)
- Exportação para Excel

#### 4.2 Automação WhatsApp
- Relatório diário automático
- Alertas de meta em risco
- Resumo semanal

---

### FASE 5: GAMIFICAÇÃO E UX (1 semana)
**Objetivo:** Engajamento e experiência do usuário

#### 5.1 Gamificação
- Ranking entre unidades com troféus
- Badges de conquistas
- Streak de dias preenchidos
- Leaderboard de professores

#### 5.2 UX Improvements
- Onboarding para novos usuários
- Tooltips educativos nos KPIs
- Modo escuro/claro
- Atalhos de teclado

---

## 5. CRONOGRAMA SUGERIDO

```
JANEIRO 2026
├── Semana 3 (20-24): FASE 1 - Banco de Dados
├── Semana 4 (27-31): FASE 1 - Dashboard Principal

FEVEREIRO 2026
├── Semana 1 (03-07): FASE 2 - KPIs Avançados (Parte 1)
├── Semana 2 (10-14): FASE 2 - KPIs Avançados (Parte 2)
├── Semana 3 (17-21): FASE 3 - Metas e OKRs
├── Semana 4 (24-28): FASE 3 - Dashboard OKRs

MARÇO 2026
├── Semana 1 (03-07): FASE 4 - Relatórios
├── Semana 2 (10-14): FASE 5 - Gamificação
├── Semana 3 (17-21): Testes e Ajustes
├── Semana 4 (24-28): Deploy e Treinamento
```

---

## 6. MÉTRICAS DE SUCESSO

| Métrica | Atual | Meta Fase 1 | Meta Final |
|---------|:-----:|:-----------:|:----------:|
| KPIs no Dashboard | 5 | 12 | 30+ |
| Tempo de carregamento | 3s | 2s | <1s |
| Cobertura de dados | 60% | 80% | 95% |
| Adoção pela equipe | - | 70% | 95% |
| Preenchimento diário | - | 80% | 95% |

---

## 7. RISCOS E MITIGAÇÕES

| Risco | Probabilidade | Impacto | Mitigação |
|-------|:-------------:|:-------:|-----------|
| Resistência da equipe | Média | Alto | Treinamento + UX intuitiva |
| Dados inconsistentes | Alta | Médio | Validações + alertas |
| Performance lenta | Baixa | Alto | Índices + cache |
| Escopo creep | Alta | Médio | Fases bem definidas |

---

## 8. PRÓXIMOS PASSOS IMEDIATOS

1. ✅ Aprovar este plano com stakeholders
2. 🔲 Executar scripts SQL da Fase 1
3. 🔲 Criar branch `feature/dashboard-v2`
4. 🔲 Implementar componentes base de KPI
5. 🔲 Testar com dados reais

---

*Documento gerado em 18/01/2026 - Auditoria Técnica LA Music Performance Report*
