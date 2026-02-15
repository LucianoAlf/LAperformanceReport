# AUDITORIA COMPLETA — LA Music Report
## Data: 15/02/2026

---

## 📊 RESUMO EXECUTIVO

### Problemas Críticos Identificados:

| # | Problema | Impacto | Prioridade |
|---|----------|---------|------------|
| 1 | **Janeiro/2026 NÃO EXISTE em `dados_mensais`** | Dashboard/Analytics mostram dados zerados para Jan/2026 | 🔴 CRÍTICO |
| 2 | **16 views usam CURRENT_DATE** | Não funcionam para períodos históricos | 🔴 CRÍTICO |
| 3 | **4 views usam `evasoes_legacy`** (tabela antiga) | Dados desatualizados/inconsistentes | 🟠 ALTO |
| 4 | **6 views usam `evasoes` sem especificar** | Podem estar usando tabela errada | 🟠 ALTO |
| 5 | **`dados_mensais` Fev/2026 desatualizado** | Divergência entre dados reais e registrados | 🟡 MÉDIO |
| 6 | **Campo Grande e Recreio sem evasões em Fev/2026** | KPIs de churn zerados | 🟡 MÉDIO |

---

## 📁 INVENTÁRIO DO BANCO DE DADOS

### Tabelas Principais (Fontes de Verdade):

| Tabela | Registros | Descrição | Usado por |
|--------|-----------|-----------|-----------|
| `alunos` | ~1000+ | Cadastro de alunos ativos/inativos | Views, KPIs, Dashboard |
| `evasoes_v2` | 677 | Evasões (nova, com histórico migrado) | vw_kpis_retencao_mensal, vw_kpis_gestao_mensal |
| `evasoes_legacy` | 677 | Evasões (antiga, backup) | ⚠️ 4 views ainda usam |
| `renovacoes` | ~50 | Renovações de contrato | vw_kpis_retencao_mensal |
| `movimentacoes_admin` | ~100 | Lançamentos administrativos | AdministrativoPage |
| `leads` | ~500+ | Leads comerciais | ComercialPage, vw_kpis_comercial_mensal |
| `dados_mensais` | 111 | Snapshot mensal (histórico) | Fallback para views |
| `dados_comerciais` | ~30 | Dados comerciais consolidados | Dashboard (fallback) |

### Tabelas Legado (NÃO USAR):

| Tabela | Status | Substituída por |
|--------|--------|-----------------|
| `evasoes_legacy` | BACKUP | `evasoes_v2` |
| `movimentacoes` | VAZIA | `movimentacoes_admin` |
| `turmas` | VAZIA | `turmas_explicitas` |
| `relatorios_diarios` | VAZIA | Nunca usada |

---

## 📋 ANÁLISE DE VIEWS

### Views com CURRENT_DATE (⚠️ SÓ FUNCIONAM PARA MÊS ATUAL):

| View | Usa CURRENT_DATE | Fonte Evasões | Usa dados_mensais |
|------|------------------|---------------|-------------------|
| `vw_alertas` | ✅ SIM | - | NÃO |
| `vw_alertas_inteligentes` | ✅ SIM | evasoes_legacy ⚠️ | SIM |
| `vw_dashboard_unidade` | ✅ SIM | evasoes_v2 ✅ | SIM |
| `vw_farmer_aniversariantes_hoje` | ✅ SIM | - | NÃO |
| `vw_farmer_checklist_alertas` | ✅ SIM | - | NÃO |
| `vw_farmer_novos_matriculados` | ✅ SIM | - | NÃO |
| `vw_farmer_renovacoes_proximas` | ✅ SIM | - | NÃO |
| `vw_kpis_comercial_mensal` | ✅ SIM | - | NÃO |
| `vw_kpis_gestao_mensal` | ✅ SIM | evasoes_v2 ✅ | SIM |
| `vw_kpis_professor_mensal` | ✅ SIM | evasoes_v2 ✅ | NÃO |
| `vw_kpis_retencao_mensal` | ✅ SIM | evasoes_v2 ✅ | NÃO |
| `vw_movimentacoes_recentes` | ✅ SIM | - | NÃO |
| `vw_professores_performance_atual` | ✅ SIM | evasoes_legacy ⚠️ | NÃO |
| `vw_renovacoes_pendentes` | ✅ SIM | - | NÃO |
| `vw_renovacoes_proximas` | ✅ SIM | - | NÃO |
| `vw_taxa_crescimento_professor` | ✅ SIM | evasoes_v2 ✅ | NÃO |

### Views que usam tabela ERRADA de evasões:

| View | Fonte Atual | Deveria Usar |
|------|-------------|--------------|
| `vw_alertas_inteligentes` | evasoes_legacy | evasoes_v2 |
| `vw_evasoes_motivos` | evasoes_legacy | evasoes_v2 |
| `vw_evasoes_resumo` | evasoes_legacy | evasoes_v2 |
| `vw_professores_performance_atual` | evasoes_legacy | evasoes_v2 |
| `vw_consolidado_anual` | evasoes (?) | evasoes_v2 |
| `vw_kpis_mensais` | evasoes (?) | evasoes_v2 |
| `vw_metas_vs_realizado` | evasoes (?) | evasoes_v2 |
| `vw_projecao_metas` | evasoes (?) | evasoes_v2 |
| `vw_ranking_professores_evasoes` | evasoes (?) | evasoes_v2 |
| `vw_sazonalidade` | evasoes (?) | evasoes_v2 |
| `vw_totais_unidade_performance` | evasoes (?) | evasoes_v2 |
| `vw_unidade_anual` | evasoes (?) | evasoes_v2 |

---

## 📱 MAPEAMENTO FRONTEND → FONTES DE DADOS

### DashboardPage.tsx

| KPI/Seção | Fonte Principal | Fallback | Problema |
|-----------|-----------------|----------|----------|
| Gestão (mês atual) | `vw_kpis_gestao_mensal` | - | ✅ OK |
| Gestão (histórico) | `dados_mensais` | - | ⚠️ Jan/2026 não existe |
| Comercial | `vw_kpis_comercial_mensal` | `dados_comerciais` | ⚠️ CURRENT_DATE |
| Professores | `professores` + `vw_turmas_implicitas` | - | ✅ OK |
| Alertas | `vw_alertas_inteligentes` | - | ⚠️ Usa evasoes_legacy |
| Resumo Unidades | `vw_dashboard_unidade` | - | ⚠️ CURRENT_DATE |

### AdministrativoPage.tsx

| KPI/Seção | Fonte Principal | Fallback | Problema |
|-----------|-----------------|----------|----------|
| Resumo do Mês | `alunos` (queries diretas) | - | ✅ OK |
| Movimentações | `movimentacoes_admin` | - | ✅ OK |
| KPIs Retenção | `vw_kpis_retencao_mensal` | - | ⚠️ CURRENT_DATE |
| Renovações | `movimentacoes_admin` WHERE tipo='renovacao' | - | ✅ OK |
| Evasões | `movimentacoes_admin` WHERE tipo='evasao' | - | ✅ OK |

### ComercialPage.tsx

| KPI/Seção | Fonte Principal | Fallback | Problema |
|-----------|-----------------|----------|----------|
| Leads | `leads` | - | ✅ OK |
| Experimentais | `leads` WHERE status LIKE 'experimental%' | - | ✅ OK |
| Matrículas | `leads` WHERE status IN ('matriculado','convertido') | - | ✅ OK |
| Resumo Acumulado | `leads` (agregação) | - | ✅ OK |

### GestaoMensalPage.tsx (Analytics)

| Aba | Fonte Principal | Fallback | Problema |
|-----|-----------------|----------|----------|
| TabGestao > Alunos | `alunos` + `vw_kpis_gestao_mensal` | `dados_mensais` | ⚠️ CURRENT_DATE |
| TabGestao > Financeiro | `alunos` (ticket, MRR) | `dados_mensais` | ✅ OK |
| TabGestao > Retenção | `vw_kpis_retencao_mensal` | - | ⚠️ CURRENT_DATE |
| TabComercial | `leads` | `dados_comerciais` | ✅ OK |
| TabProfessores | `vw_kpis_professor_mensal` | - | ⚠️ CURRENT_DATE |

---

## 🔢 DIVERGÊNCIAS IDENTIFICADAS

### dados_mensais vs Dados Reais (Fev/2026):

| Unidade | Campo | dados_mensais | Real | Divergência |
|---------|-------|---------------|------|-------------|
| Barra | alunos_pagantes | 219 | 218 | -1 |
| Barra | novas_matriculas | 12 | 37 | **-25** ⚠️ |
| Barra | evasoes | 15 | 18 | **-3** |
| Campo Grande | alunos_pagantes | 465 | 462 | -3 |
| Campo Grande | evasoes | 0 | 0 | ✅ OK |
| Recreio | alunos_pagantes | 316 | 309 | -7 |
| Recreio | novas_matriculas | 26 | 66 | **-40** ⚠️ |
| Recreio | evasoes | 0 | 8 | **-8** ⚠️ |

### Janeiro/2026 — DADOS FALTANDO:

| Tabela | Barra | Campo Grande | Recreio |
|--------|-------|--------------|---------|
| `dados_mensais` | ❌ NÃO EXISTE | ❌ NÃO EXISTE | ❌ NÃO EXISTE |
| `evasoes_v2` | 19 ✅ | ? | ? |
| `renovacoes` | 10 ✅ | ? | ? |
| `leads` | 0 ❌ | ? | ? |
| `alunos` (matriculados) | 24 ✅ | ? | ? |

---

## 🔧 PLANO DE CORREÇÃO

### FASE 1: Corrigir Views que usam tabela errada (URGENTE)

```sql
-- Views a corrigir (trocar evasoes_legacy/evasoes por evasoes_v2):
-- 1. vw_alertas_inteligentes
-- 2. vw_evasoes_motivos
-- 3. vw_evasoes_resumo
-- 4. vw_professores_performance_atual
-- 5. vw_consolidado_anual
-- 6. vw_kpis_mensais
-- 7. vw_metas_vs_realizado
-- 8. vw_projecao_metas
-- 9. vw_ranking_professores_evasoes
-- 10. vw_sazonalidade
-- 11. vw_totais_unidade_performance
-- 12. vw_unidade_anual
```

### FASE 2: Inserir dados_mensais Janeiro/2026

```sql
-- Inserir registros para Janeiro/2026 nas 3 unidades
-- Valores a serem coletados do relatório administrativo
```

### FASE 3: Atualizar dados_mensais Fevereiro/2026

```sql
-- Corrigir divergências identificadas
-- Barra: matriculas 12→37, evasoes 15→18
-- Recreio: matriculas 26→66, evasoes 0→8
```

### FASE 4: Criar Views parametrizadas (sem CURRENT_DATE)

Opções:
1. **RPCs parametrizadas** — recebem ano/mês como parâmetro
2. **Views com filtro no frontend** — WHERE ano = X AND mes = Y
3. **Fallback para dados_mensais** — quando view não retorna dados

### FASE 5: Validação Visual com Chrome DevTools

Verificar cada página com filtro de Janeiro/2026:
- [ ] Dashboard
- [ ] Analytics > Gestão > Alunos
- [ ] Analytics > Gestão > Financeiro
- [ ] Analytics > Gestão > Retenção
- [ ] Analytics > Comercial
- [ ] Analytics > Professores
- [ ] Administrativo
- [ ] Comercial
- [ ] Alunos

---

## 📊 CONTAGENS REAIS VERIFICADAS

### Janeiro/2026 — Barra:

| Fonte | Contagem |
|-------|----------|
| evasoes_v2 | 19 |
| renovacoes | 10 |
| leads | 0 |
| alunos (matriculados jan) | 24 |
| alunos (ativos total) | 244 |
| movimentacoes_admin (evasao) | 19 |
| movimentacoes_admin (renovacao) | 10 |
| movimentacoes_admin (aviso_previo) | 11 |
| movimentacoes_admin (trancamento) | 1 |

### Fevereiro/2026 — Todas Unidades:

| Unidade | evasoes_v2 | renovacoes | leads | matriculas | alunos_ativos |
|---------|------------|------------|-------|------------|---------------|
| Barra | 18 | 12 | 87 | 37 | 244 |
| Campo Grande | 0 | 0 | 181 | 21 | 464 |
| Recreio | 8 | 17 | 75 | 66 | 365 |

---

## ✅ PRÓXIMOS PASSOS

1. **APROVAR** este plano de auditoria
2. **EXECUTAR** Fase 1 (corrigir views)
3. **EXECUTAR** Fase 2 (inserir dados_mensais Jan/2026)
4. **EXECUTAR** Fase 3 (atualizar dados_mensais Fev/2026)
5. **VALIDAR** visualmente com Chrome DevTools
6. **DOCUMENTAR** regras de negócio unificadas

---

## 🔍 VALIDAÇÃO VISUAL (Chrome DevTools) — 15/02/2026

### Comparação Dashboard vs Analytics (Jan/2026 Consolidado):

| Métrica | Dashboard | Analytics | Correto? |
|---------|-----------|-----------|----------|
| Pagantes | 980 | 907 | ⚠️ Dashboard não filtrou |
| Matrículas | 27 | 84 | ⚠️ Dashboard não filtrou |
| Evasões | 25 | 28 | ⚠️ Dashboard não filtrou |
| Leads | 313 | 17 | ⚠️ Dashboard não filtrou |

**Problema**: O Dashboard **NÃO RESPEITA** o filtro de mês para dados históricos. Mostra sempre os dados do mês atual (Fev/2026) mesmo quando Janeiro está selecionado.

**Causa**: `vw_dashboard_unidade` usa `CURRENT_DATE` e não aceita parâmetros.

### Analytics > Gestão > Alunos (Barra, Jan/2026):

| Métrica | Frontend | Banco | Correto? |
|---------|----------|-------|----------|
| Total Alunos Ativos | 218 | 244 | ⚠️ Diferente |
| Alunos Pagantes | 217 | 218 | ≈ OK |
| Novas Matrículas | 24 | 24 | ✅ OK |
| Evasões | 19 | 19 | ✅ OK |

### Analytics > Gestão > Retenção (Barra, Jan/2026):

| Métrica | Frontend | Banco | Correto? |
|---------|----------|-------|----------|
| Cancelamentos | 19 | 19 | ✅ OK |
| Renovações | 10 | 10 | ✅ OK |
| MRR Perdido | R$ 8.316 | R$ 8.316 | ✅ OK |
| **Tempo Permanência** | **0** | ~15 meses | ❌ ERRO |

### Administrativo (Jan/2026 Consolidado):

| Métrica | Frontend | Banco | Correto? |
|---------|----------|-------|----------|
| Alunos Ativos | 916 | ~920 | ≈ OK |
| Renovações | 10 | 10 | ✅ OK |
| Cancelamentos | 27 | 28 | ⚠️ -1 |
| **Tempo Permanência** | **"-"** | ~15 meses | ❌ NÃO CALCULADO |
| **Pérola Maturano** | **2x** | 1x | ❌ DUPLICATA |

### Administrativo (Fev/2026 Consolidado):

| Métrica | Frontend | Banco | Correto? |
|---------|----------|-------|----------|
| Tempo Permanência | 18.2 meses | ✅ | ✅ OK |

---

## 🚨 DIVERGÊNCIAS CRÍTICAS IDENTIFICADAS

### 1. Dashboard não filtra por período histórico
- **Impacto**: Usuário vê dados errados ao selecionar meses anteriores
- **Causa**: `vw_dashboard_unidade` usa `CURRENT_DATE`
- **Fix**: Criar RPC parametrizada ou usar fallback para `dados_mensais`

### 2. Tempo de Permanência zerado para Jan/2026
- **Impacto**: KPI importante não aparece na aba Retenção
- **Causa**: View `vw_kpis_retencao_mensal` não calcula para períodos históricos
- **Fix**: Calcular a partir de `evasoes_v2.tempo_permanencia_meses` ou `movimentacoes_admin`

### 3. Duplicata Pérola Madeira Maturano
- **Impacto**: Contagem de renovações inflada (+1)
- **Causa**: Registro duplicado na tabela `renovacoes` (IDs 22 e 23)
- **Fix**: DELETE FROM renovacoes WHERE id = 23

### 4. dados_mensais Janeiro/2026 não existe
- **Impacto**: Fallback para histórico não funciona
- **Causa**: Registro nunca foi inserido
- **Fix**: INSERT com valores do relatório administrativo

### 5. Views usando evasoes_legacy (tabela antiga)
- **Impacto**: Dados inconsistentes em algumas views
- **Causa**: 4 views não foram atualizadas após migração
- **Fix**: Recriar views apontando para `evasoes_v2`

---

*Documento gerado automaticamente pela auditoria do sistema LA Music Report*
