# 🔍 AUDITORIA COMPLETA DO BACKEND - LA Performance Report

## Data: 04/02/2026
## Objetivo: Mapear TODAS as tabelas, views, triggers e functions do sistema

---

# PARTE 1: TABELAS DO SISTEMA

## 1.1 Tabelas Mestras (Cadastros Base)

| Tabela | Descrição | Trigger | Atualização |
|--------|-----------|---------|-------------|
| `professores` | Cadastro de professores | `trg_professores_updated_at` | Automático |
| `cursos` | Cadastro de cursos | `trg_cursos_updated_at` | Automático |
| `canais_origem` | Canais de captação (Instagram, etc) | - | Manual |
| `motivos_saida` | Motivos de evasão | - | Manual |
| `formas_pagamento` | Formas de pagamento | - | Manual |
| `tipos_matricula` | Tipos (Regular, Bolsista, etc) | - | Manual |
| `tipos_saida` | Tipos de saída (Interrompido, etc) | - | Manual |
| `unidades` | Unidades (CG, REC, BAR) | - | Manual |

## 1.2 Tabelas Core (Dados Operacionais)

| Tabela | Descrição | Trigger | Campos Calculados |
|--------|-----------|---------|-------------------|
| `alunos` | **TABELA PRINCIPAL** | `trg_alunos_calcular_campos` | `idade_atual`, `classificacao`, `tempo_permanencia_meses` |
| `leads` | Leads comerciais | - | - |
| `evasoes` | Histórico de evasões | - | - |
| `evasoes_v2` | Evasões normalizadas | - | - |
| `renovacoes` | Histórico de renovações | - | - |
| `movimentacoes` | Movimentações de alunos | - | - |
| `movimentacoes_admin` | Movimentações do Administrativo | `tr_sync_evasao`, `tr_sync_renovacao` | - |

## 1.3 Tabelas de Histórico/Snapshot

| Tabela | Descrição | Como é Populada | Frequência |
|--------|-----------|-----------------|------------|
| `dados_mensais` | Snapshot mensal de KPIs | **MANUAL/BATCH** | Mensal |
| `dados_comerciais` | Dados comerciais mensais | Manual | Mensal |

---

# PARTE 2: VIEWS DO SISTEMA

## 2.1 Views de KPIs em Tempo Real

### `vw_kpis_gestao_mensal`
**Fonte:** Tabela `alunos` (tempo real) + `dados_mensais` (histórico)

| Campo | Fonte | Tempo Real? |
|-------|-------|-------------|
| `total_alunos_ativos` | `alunos WHERE status='ativo'` | ✅ SIM |
| `total_alunos_pagantes` | `alunos WHERE status='ativo'` | ✅ SIM |
| `ticket_medio` | `AVG(valor_parcela) FROM alunos` | ✅ SIM |
| `mrr` | `SUM(valor_parcela) FROM alunos` | ✅ SIM |
| `tempo_permanencia_medio` | `AVG(AGE(data_matricula)) FROM alunos` | ✅ SIM |
| `ltv_medio` | Calculado de `alunos` | ✅ SIM |
| `novas_matriculas` | ❌ `dados_mensais` | ❌ NÃO |
| `evasoes` | ❌ `dados_mensais` | ❌ NÃO |
| `churn_rate` | ❌ `dados_mensais` | ❌ NÃO |
| `inadimplencia_pct` | ❌ `dados_mensais` | ❌ NÃO |

### `vw_kpis_comercial_mensal`
**Fonte:** Tabelas `leads` e `alunos` (tempo real)

| Campo | Fonte | Tempo Real? |
|-------|-------|-------------|
| `total_leads` | `COUNT(*) FROM leads` | ✅ SIM |
| `experimentais_agendadas` | `COUNT(*) FROM leads WHERE status='experimental_agendada'` | ✅ SIM |
| `experimentais_realizadas` | `COUNT(*) FROM leads WHERE status='experimental_realizada'` | ✅ SIM |
| `novas_matriculas` | `COUNT(*) FROM alunos WHERE data_matricula` | ✅ SIM |
| `taxa_conversao_*` | Calculado | ✅ SIM |
| `faturamento_novos` | `SUM(valor_parcela) FROM alunos` | ✅ SIM |
| `ticket_medio_novos` | `AVG(valor_parcela) FROM alunos` | ✅ SIM |

### `vw_kpis_retencao_mensal`
**Fonte:** Tabelas `evasoes_v2` e `renovacoes` (tempo real)

| Campo | Fonte | Tempo Real? |
|-------|-------|-------------|
| `total_evasoes` | `COUNT(*) FROM evasoes_v2` | ✅ SIM |
| `evasoes_por_motivo` | `evasoes_v2` | ✅ SIM |
| `evasoes_por_professor` | `evasoes_v2` | ✅ SIM |
| `renovacoes_previstas` | `renovacoes` | ✅ SIM |
| `renovacoes_realizadas` | `renovacoes` | ✅ SIM |
| `taxa_renovacao` | Calculado | ✅ SIM |
| `mrr_perdido` | `SUM(valor_parcela) FROM evasoes_v2` | ✅ SIM |

### `vw_dashboard_unidade`
**Fonte:** Tabela `alunos` (tempo real) + `dados_mensais` (histórico)

| Campo | Fonte | Tempo Real? |
|-------|-------|-------------|
| `alunos_ativos` | `alunos WHERE status='ativo'` | ✅ SIM |
| `alunos_pagantes` | `alunos WHERE status='ativo'` | ✅ SIM |
| `ticket_medio` | `AVG(valor_parcela) FROM alunos` | ✅ SIM |
| `mrr` | `SUM(valor_parcela) FROM alunos` | ✅ SIM |
| `matriculas_mes` | ❌ `dados_mensais` | ❌ NÃO |
| `evasoes_mes` | ❌ `dados_mensais` | ❌ NÃO |
| `churn_rate` | ❌ `dados_mensais` | ❌ NÃO |

## 2.2 Views Auxiliares

| View | Descrição | Fonte |
|------|-----------|-------|
| `vw_alunos_ativos` | Alunos ativos com dados completos | `alunos` |
| `vw_contagem_alunos` | Contagem por unidade/classificação | `alunos` |
| `vw_ltv_unidade` | LTV por unidade | `alunos` |
| `vw_turmas_implicitas` | Turmas por professor | `alunos` |
| `vw_alertas_inteligentes` | Alertas de KPIs | Múltiplas |

---

# PARTE 3: TRIGGERS DO SISTEMA

## 3.1 Triggers de Cálculo Automático

| Trigger | Tabela | Função | O que faz |
|---------|--------|--------|-----------|
| `trg_alunos_calcular_campos` | `alunos` | `calcular_campos_aluno()` | Calcula `idade_atual`, `classificacao`, `tempo_permanencia_meses` |
| `trg_professores_updated_at` | `professores` | `update_updated_at_column()` | Atualiza `updated_at` |
| `trg_cursos_updated_at` | `cursos` | `update_updated_at_column()` | Atualiza `updated_at` |

## 3.2 Triggers de Sincronização

| Trigger | Tabela | Função | O que faz |
|---------|--------|--------|-----------|
| `tr_sync_evasao` | `movimentacoes_admin` | `sync_evasao_to_historico()` | Sincroniza evasões para tabela `evasoes` |
| `tr_sync_renovacao` | `movimentacoes_admin` | `sync_renovacao_to_historico()` | Sincroniza renovações para tabela `renovacoes` |

---

# PARTE 4: FUNCTIONS/RPCs DO SISTEMA

| Function | Parâmetros | Retorno | Descrição |
|----------|------------|---------|-----------|
| `calcular_campos_aluno()` | - | TRIGGER | Calcula campos automáticos do aluno |
| `update_updated_at_column()` | - | TRIGGER | Atualiza timestamp |
| `sync_evasao_to_historico()` | - | TRIGGER | Sincroniza evasões |
| `sync_renovacao_to_historico()` | - | TRIGGER | Sincroniza renovações |
| `get_kpis_evolucao_mensal()` | `p_unidade_id`, `p_meses` | TABLE | Evolução de KPIs |
| `get_dados_relatorio_gerencial()` | `p_unidade_id`, `p_ano`, `p_mes` | JSONB | Dados para relatório |
| `get_dados_comercial_ia()` | `p_unidade_id` | JSONB | Dados para IA comercial |
| `get_retencao_insights()` | `p_unidade_id`, `p_mes` | JSONB | Insights de retenção |

---

# PARTE 5: FLUXO DE DADOS

## 5.1 Fluxo de Matrícula

```
[Formulário de Matrícula]
       ↓
[INSERT INTO alunos] ← data_matricula = data selecionada
       ↓
[TRIGGER: trg_alunos_calcular_campos]
       ↓
[Calcula: idade_atual, classificacao, tempo_permanencia_meses]
       ↓
[Views são atualizadas AUTOMATICAMENTE]
       ↓
✅ vw_kpis_comercial_mensal → novas_matriculas (TEMPO REAL)
✅ vw_kpis_gestao_mensal → total_alunos_ativos (TEMPO REAL)
✅ vw_dashboard_unidade → alunos_ativos (TEMPO REAL)
```

**CONCLUSÃO MATRÍCULA:** ✅ Matrículas são refletidas em tempo real nas views comerciais e de gestão.

## 5.2 Fluxo de Evasão

```
[Formulário de Evasão (Administrativo)]
       ↓
[INSERT INTO movimentacoes_admin]
       ↓
[TRIGGER: tr_sync_evasao]
       ↓
[INSERT INTO evasoes] ← Sincronizado automaticamente
       ↓
[UPDATE alunos SET status='evadido', data_saida=...]
       ↓
[Views são atualizadas AUTOMATICAMENTE]
       ↓
✅ vw_kpis_retencao_mensal → total_evasoes (TEMPO REAL)
✅ vw_kpis_gestao_mensal → total_alunos_ativos (TEMPO REAL)
```

**CONCLUSÃO EVASÃO:** ✅ Evasões são refletidas em tempo real.

## 5.3 Fluxo de Renovação

```
[Formulário de Renovação (Administrativo)]
       ↓
[INSERT INTO movimentacoes_admin]
       ↓
[TRIGGER: tr_sync_renovacao]
       ↓
[INSERT INTO renovacoes] ← Sincronizado automaticamente
       ↓
[Views são atualizadas AUTOMATICAMENTE]
       ↓
✅ vw_kpis_retencao_mensal → renovacoes_realizadas (TEMPO REAL)
```

**CONCLUSÃO RENOVAÇÃO:** ✅ Renovações são refletidas em tempo real.

## 5.4 Fluxo de Leads

```
[Formulário de Lead (Comercial)]
       ↓
[INSERT INTO leads] ← data_contato = data selecionada
       ↓
[Views são atualizadas AUTOMATICAMENTE]
       ↓
✅ vw_kpis_comercial_mensal → total_leads (TEMPO REAL)
```

**CONCLUSÃO LEADS:** ✅ Leads são refletidos em tempo real.

---

# PARTE 6: ANÁLISE DA TABELA `dados_mensais`

## 6.1 O que é `dados_mensais`?

É uma tabela de **snapshot histórico** que armazena KPIs consolidados por mês. Ela é usada para:
- Comparativos históricos (mês anterior, ano anterior)
- Gráficos de evolução (12 meses)
- Análise de sazonalidade

## 6.2 Como é populada?

**ATENÇÃO:** Não encontrei trigger ou função que popula `dados_mensais` automaticamente.

Possibilidades:
1. **Processo batch mensal** - Executado manualmente no final do mês
2. **Dados importados** - Migrados de sistema anterior
3. **Função não mapeada** - Pode existir em outro lugar

## 6.3 Impacto

| View/Componente | Usa `dados_mensais`? | Impacto se vazio |
|-----------------|---------------------|------------------|
| `vw_kpis_gestao_mensal` | SIM (novas_matriculas, evasoes) | Mostra 0 |
| `vw_dashboard_unidade` | SIM (matriculas_mes, evasoes_mes) | Mostra 0 |
| `get_kpis_evolucao_mensal()` | SIM | Gráfico vazio |
| `vw_kpis_comercial_mensal` | NÃO | ✅ Funciona |
| `vw_kpis_retencao_mensal` | NÃO | ✅ Funciona |

---

# PARTE 7: CONCLUSÕES

## ✅ O QUE FUNCIONA EM TEMPO REAL

1. **Alunos Ativos** - Calculado diretamente de `alunos WHERE status='ativo'`
2. **Ticket Médio** - Calculado diretamente de `alunos`
3. **MRR** - Calculado diretamente de `alunos`
4. **Leads** - Calculado diretamente de `leads`
5. **Matrículas (Comercial)** - Calculado de `alunos` via `vw_kpis_comercial_mensal`
6. **Evasões (Retenção)** - Calculado de `evasoes_v2` via `vw_kpis_retencao_mensal`
7. **Renovações** - Calculado de `renovacoes` via `vw_kpis_retencao_mensal`

## ⚠️ O QUE DEPENDE DE `dados_mensais`

1. **Matrículas no Dashboard** - `vw_dashboard_unidade.matriculas_mes`
2. **Evasões no Dashboard** - `vw_dashboard_unidade.evasoes_mes`
3. **Churn Rate** - `vw_kpis_gestao_mensal.churn_rate`
4. **Inadimplência** - `vw_kpis_gestao_mensal.inadimplencia_pct`
5. **Gráfico de Evolução** - `get_kpis_evolucao_mensal()`

## 🔧 RECOMENDAÇÃO

Para que o Dashboard mostre matrículas e evasões em tempo real, as views `vw_dashboard_unidade` e `vw_kpis_gestao_mensal` precisam ser atualizadas para calcular esses campos diretamente das tabelas `alunos` e `evasoes_v2`, em vez de buscar de `dados_mensais`.

**Exemplo de correção para `vw_dashboard_unidade`:**
```sql
-- Substituir:
COALESCE(dm.novas_matriculas, 0) as matriculas_mes

-- Por:
COALESCE((
  SELECT COUNT(*) FROM alunos 
  WHERE unidade_id = u.id 
    AND EXTRACT(YEAR FROM data_matricula) = EXTRACT(YEAR FROM CURRENT_DATE)
    AND EXTRACT(MONTH FROM data_matricula) = EXTRACT(MONTH FROM CURRENT_DATE)
), 0) as matriculas_mes
```

---

# PARTE 8: PRÓXIMOS PASSOS (SEM EXECUTAR)

1. **Verificar se existe processo de consolidação de `dados_mensais`** - Pode estar em outro lugar
2. **Decidir estratégia:**
   - Opção A: Manter `dados_mensais` e criar processo de consolidação
   - Opção B: Atualizar views para calcular tudo em tempo real
3. **Testar com dados reais** - Cadastrar matrícula e verificar se aparece nos KPIs

---

# PARTE 9: GAPS IDENTIFICADOS

## ⚠️ GAP 1: View `vw_kpis_comercial_historico` não encontrada

**Problema:** O código referencia `vw_kpis_comercial_historico` em:
- `DashboardPage.tsx` (linha 254)
- `useDadosHistoricos.ts` (linha 67)
- `TabComercialNew.tsx`

Mas essa view **NÃO EXISTE** nos arquivos de migração.

**Impacto:** Pode causar erro 404 ou dados vazios no Dashboard para períodos históricos.

**Verificar:** Se a view foi criada diretamente no banco de dados Supabase.

## ⚠️ GAP 2: `dados_mensais` depende de processo manual

**Problema:** A tabela `dados_mensais` é usada por várias views mas não é populada automaticamente.

**Campos afetados:**
- `novas_matriculas` em `vw_dashboard_unidade`
- `evasoes` em `vw_dashboard_unidade`
- `churn_rate` em `vw_kpis_gestao_mensal`
- Gráfico de evolução (12 meses)

**Solução:** As views `vw_kpis_comercial_mensal` e `vw_kpis_retencao_mensal` já calculam esses dados em tempo real. O Dashboard poderia usar essas views em vez de `dados_mensais`.

## ✅ O QUE ESTÁ FUNCIONANDO CORRETAMENTE

1. **Matrículas em tempo real** - `vw_kpis_comercial_mensal` calcula `novas_matriculas` diretamente de `alunos`
2. **Evasões em tempo real** - `vw_kpis_retencao_mensal` calcula de `evasoes_v2`
3. **Leads em tempo real** - `vw_kpis_comercial_mensal` calcula de `leads`
4. **Alunos ativos em tempo real** - Todas as views calculam de `alunos WHERE status='ativo'`
5. **Triggers de sincronização** - Evasões e renovações são sincronizadas automaticamente
6. **Trigger de cálculo de aluno** - `idade_atual`, `classificacao`, `tempo_permanencia_meses` são calculados automaticamente

---

# PARTE 10: RECOMENDAÇÕES (SEM EXECUTAR)

## Opção A: Atualizar views para usar dados em tempo real

Modificar `vw_dashboard_unidade` e `vw_kpis_gestao_mensal` para calcular `novas_matriculas` e `evasoes` diretamente das tabelas, em vez de buscar de `dados_mensais`.

**Prós:** Dados sempre em tempo real
**Contras:** Pode impactar performance em queries pesadas

## Opção B: Criar processo de consolidação automática

Criar uma função que consolida dados em `dados_mensais` automaticamente quando há INSERT em `alunos` ou `evasoes_v2`.

**Prós:** Mantém arquitetura atual
**Contras:** Mais complexo de manter

## Opção C: Usar views existentes no Dashboard

O Dashboard já usa `vw_kpis_comercial_mensal` para dados comerciais. Poderia usar essa mesma view para matrículas no período atual.

**Prós:** Sem alterações no banco
**Contras:** Requer ajuste no frontend

---

## Autor
Cascade AI - Auditoria Completa do Backend
