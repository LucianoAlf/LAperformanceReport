# Auditoria de Divergências de KPIs — Barra / Jun/2026
**Data:** 2026-06-08 | **Auditor:** Claude Sonnet 4.6
**Escopo:** Dashboard · Analytics (Alunos/Financeiro/Retenção) · Administrativo · Gestão de Alunos · Professores/Carteira
**Contexto:** Mês aberto (Jun/2026). Fonte canônica para mês aberto = views ao vivo + tabela `alunos`.

---

## 1. Mapa de fontes por KPI (Jun/2026 — Barra)

| KPI | Dashboard | Analytics Alunos | Analytics Financeiro | Analytics Retenção | Administrativo | Gestão Alunos | Prof. Carteira |
|-----|-----------|-----------------|---------------------|-------------------|----------------|---------------|----------------|
| **Alunos Ativos** | 246 | 228 | — | — | **0 (BUG)** | 228 | 254 |
| **Alunos Pagantes** | 225 | 225 | — | — | **0 (BUG)** | 225 | **222** |
| **Ticket Médio** | R$448 (card) / R$445 (tabela) | R$448/R$443 | R$448/R$443 | — | — | R$448 | R$448 |
| **MRR** | R$100.707 | — | R$100.707 | — | — | — | **R$99.373** |
| **Evasões** | 3 | 3 | — | 3 | **0** | 3 | — |
| **Renovações** | — | — | — | 5 | **0** | — | — |
| **Novas Matrículas** | 3 | 3 | — | — | **0** | — | — |
| **Churn Rate** | — | — | — | 1.3% | 0.0% | — | — |

### Fontes de código por página

| Página | Arquivo | Hook/Query | Tabela/View | Filtros |
|--------|---------|-----------|-------------|---------|
| Dashboard — cards Gestão | `DashboardPage.tsx` ~L346 | direto supabase | `vw_kpis_gestao_mensal` | ano+mes+unidade_id |
| Dashboard — Resumo Unidades | `DashboardPage.tsx` ~L772 | direto supabase | `vw_dashboard_unidade` + `dados_mensais` | unidade_id (sem ano/mes explícito para atual) |
| Analytics Alunos — cards | `TabGestao.tsx` ~L300 | `useKPIsGestao` → `vw_kpis_gestao_mensal` | `vw_kpis_gestao_mensal` | ano+mes+unidade_id |
| Analytics Alunos — Evolução | `TabGestao.tsx` ~L956 | direto supabase | `dados_mensais` | últimos 12 meses + unidade_id |
| Analytics Financeiro — cards | `TabGestao.tsx` ~L698 | derivado de kpisData | `vw_kpis_gestao_mensal` | mesmo filtro |
| Analytics Retenção — cards | `TabGestao.tsx` ~L315 | `useKPIsRetencao` → `vw_kpis_retencao_mensal` | `vw_kpis_retencao_mensal` | ano+mes+unidade_id |
| Administrativo — KPI Resumo | `AdministrativoPage.tsx` L344-521 | direto supabase | `vw_kpis_gestao_mensal` → fallback `alunos` | ano+mes+unidade_id |
| Administrativo — Lançamentos | `AdministrativoPage.tsx` ~L282 | direto supabase | `movimentacoes_admin` | data range + unidade_id |
| Gestão de Alunos — cards | `AlunosPage.tsx` ~L616 | direto supabase | `alunos` ao vivo | status IN (ativo,trancado) + unidade_id |
| Prof. Carteira — pagantes | `TabCarteiraProfessores.tsx` L292 | RPC | `get_carteira_professores` | unidade_id (SEM filtro temporal) |
| Prof. Carteira — MRR | `TabCarteiraProfessores.tsx` L99 | RPC | `get_carteira_professores` | unidade_id (SEM filtro temporal) |
| Prof. Carteira — ativos | `TabCarteiraProfessores.tsx` L99 | RPC | `get_carteira_professores` | unidade_id (SEM filtro temporal) |

---

## 2. Root Cause de cada divergência

### 2.1 ❌ CRÍTICO — Administrativo mostra zeros em Alunos Ativos, Pagantes, Matrículas

**Arquivo:** `AdministrativoPage.tsx`, linhas 344–521
**Valor esperado:** Ativos ≈ 228, Pagantes ≈ 225
**Valor exibido:** 0 para todos os KPIs do "Resumo do Mês"

**Diagnóstico:**

```typescript
// L344: rota principal — PERÍODO ATUAL
if (isPeriodoAtual) {
  let kpisQuery = supabase
    .from('vw_kpis_gestao_mensal')
    .select('*')
    .eq('ano', ano).eq('mes', mes);
  if (unidade !== 'todos') kpisQuery = kpisQuery.eq('unidade_id', unidade);

  const { data } = await kpisQuery;
  kpisData = data || [];

  // L361: FALLBACK — só ativa se a view retornar ZERO LINHAS
  if (kpisData.length === 0 && unidade !== 'todos') {
    // busca alunos ao vivo — correto
  }
}
```

**Causa raiz provável (2 hipóteses):**

**Hipótese A — View retorna linha com zeros:**
O comentário na linha 360 diz: *"view usa leads para calcular ano/mes, então unidades sem leads ficam invisíveis"*. Mas se a view retorna 1 linha com `total_alunos_ativos = 0` (em vez de retornar 0 linhas), o fallback não ativa (`kpisData.length` ≠ 0) e o reduce em L521 soma zeros → resumo zerado.

**Hipótese B — Propriedades não mapeadas no reduce:**
Se a view retorna `alunos_pagantes` mas o reduce usa `k.total_alunos_pagantes` (undefined), o resultado é 0 mesmo com dados. Enquanto o fallback (L388) cria explicitamente `total_alunos_ativos`, a view pode usar coluna diferente.

**Query para confirmar:**
```sql
-- Verificar o que a view retorna para Barra/Jun/2026
SELECT *
FROM vw_kpis_gestao_mensal
WHERE ano = 2026 AND mes = 6
  AND unidade_id = (SELECT id FROM unidades WHERE nome ILIKE '%barra%' LIMIT 1);

-- Se retornar linha com zeros, confirma Hipótese A
-- Se retornar 0 linhas, o fallback deveria ter funcionado
```

---

### 2.2 ❌ CRÍTICO — Administrativo: Evasões/Renovações/Matrículas = 0 vs Analytics = 3/5/3

**Arquivo:** `AdministrativoPage.tsx` — seção "Lançamentos Rápidos"
**Fonte dos lançamentos:** `movimentacoes_admin` filtrado por `data` no período

**Causa raiz — DIVERGÊNCIA ARQUITETURAL INTENCIONAL:**

| | Administrativo | Analytics |
|---|---|---|
| Fonte | `movimentacoes_admin` (manual) | `movimentacoes_admin` (todos) |
| Origem esperada | Operador lança manualmente | Emusys sync + manual |
| Resultado Jun/2026 | 0 (nada lançado manualmente) | 3/5 (do sync Emusys) |

Os **3 cancelamentos e 5 renovações de Junho** que aparecem no Analytics provavelmente foram inseridos via sync do Emusys (`movimentacoes_admin.origem = 'emusys'` ou similar), não via formulário manual do Administrativo.

**Porém**, os KPIs do "Resumo do Mês" (Alunos Ativos, Pagantes) NÃO deveriam ser 0 — esses vêm da view/tabela `alunos`, não de lançamentos manuais. Portanto, o zero nos KPIs é **BUG separado** do zero nos lançamentos.

**Query para confirmar:**
```sql
-- Verificar origem dos movimentos de Jun/2026 para Barra
SELECT tipo, origem, COUNT(*) as total
FROM movimentacoes_admin
WHERE EXTRACT(YEAR FROM data) = 2026
  AND EXTRACT(MONTH FROM data) = 6
  AND unidade_id = (SELECT id FROM unidades WHERE nome ILIKE '%barra%' LIMIT 1)
GROUP BY tipo, origem
ORDER BY tipo;
```

---

### 2.3 ❌ ERRO — Professores Carteira: 222 pagantes vs 225 (todas as outras páginas)

**Arquivo:** `TabCarteiraProfessores.tsx`, linhas 99 e 292–297
**Diferença:** 225 - 222 = **3 alunos**

**Causa raiz — DERIVAÇÃO COM ERRO DE ARREDONDAMENTO:**

```typescript
// L99: busca via RPC sem filtro temporal
const { data } = await supabase.rpc('get_carteira_professores', { p_unidade_id: unidadeAtual });

// L292-297: pagantes derivados por round(mrr/ticket) — ERRADO
const totalPagantes = dados.reduce((acc, c) => {
  if (c.ticket_medio > 0) {
    return acc + Math.round(c.mrr_total / c.ticket_medio);
  }
  return acc;
}, 0);
```

**Problema:** O `Math.round(mrr/ticket)` acumula erro para cada professor:
- Professor A: MRR R$9.180 / ticket R$368 = 24,94 → round = 25 (erro: -0,06)
- Professor B: MRR R$7.360 / ticket R$368 = 19,99 → round = 20 (erro: -0,01)
- ...acumulado em 18 professores → ~3 unidades de diferença

**Correção:** A RPC `get_carteira_professores` deve retornar um campo `alunos_pagantes` calculado diretamente por `COUNT(a.id) WHERE conta_como_pagante = true AND NOT is_segundo_curso`.

---

### 2.4 ❌ ERRO — Professores Carteira: 254 ativos vs 228 (Analytics/Alunos)

**Diferença:** 254 - 228 = **26 alunos a mais**

**Causa raiz — DEFINIÇÃO DIFERENTE DE "ATIVO":**

| Fonte | Valor | Definição |
|-------|-------|-----------|
| Analytics/Alunos | 228 | `COUNT DISTINCT nome` WHERE `status IN (ativo, trancado) AND NOT is_segundo_curso` — conta **PESSOAS** |
| Prof. Carteira RPC | 254 | `SUM(total_alunos)` por professor — provavelmente conta **MATRÍCULAS** (linhas na tabela `alunos`) |

As 26 unidades a mais na Carteira provavelmente são:
- Alunos de banda (`is_projeto_banda = true`) que têm parcela mas Analytics exclui do count de pessoas
- Alunos `is_segundo_curso = true` que aparecem em 2 linhas — Analytics dedup, RPC soma
- Alunos com `aviso_previo` incluídos na RPC mas não no filtro `(ativo, trancado)` de Analytics

**Query para confirmar:**
```sql
-- Diferença entre contagem de pessoas vs matrículas para Barra
SELECT
  COUNT(*) AS total_matriculas,
  COUNT(DISTINCT LOWER(nome)) AS total_pessoas_distintas,
  COUNT(*) FILTER (WHERE NOT is_segundo_curso) AS matriculas_sem_segundo_curso,
  COUNT(DISTINCT LOWER(nome)) FILTER (WHERE NOT is_segundo_curso) AS pessoas_sem_segundo_curso
FROM alunos
WHERE status IN ('ativo', 'trancado')
  AND unidade_id = (SELECT id FROM unidades WHERE nome ILIKE '%barra%' LIMIT 1);
```

---

### 2.5 ⚠️ PARCIAL — Dashboard "Resumo por Unidade": 246 ativos vs 228 (Analytics)

**Diferença:** 246 - 228 = **18 alunos a mais**

**Causa raiz — `vw_dashboard_unidade` usa definição diferente de ativo:**

O Dashboard Resumo lê `vw_dashboard_unidade.alunos_ativos` para o mês atual. Essa view provavelmente inclui status `aviso_previo` na contagem de ativos (enquanto Analytics usa apenas `ativo` e `trancado`).

228 (Analytics) + aviso_prévio incluídos ≈ 246 se houver ~18 alunos em aviso prévio na Barra. Screenshot do Analytics Retenção mostra "Aviso Prévio: 0" mas isso é para Junho — pode ter aviso_previo de períodos anteriores ainda ativos.

**Alternativa:** `vw_dashboard_unidade` conta matrículas e não faz deduplica por pessoa (is_segundo_curso).

**Query para confirmar:**
```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'ativo') AS ativos,
  COUNT(*) FILTER (WHERE status = 'trancado') AS trancados,
  COUNT(*) FILTER (WHERE status = 'aviso_previo') AS aviso_previo,
  COUNT(*) FILTER (WHERE status IN ('ativo','trancado','aviso_previo')) AS total_3_status,
  COUNT(DISTINCT LOWER(nome)) FILTER (WHERE status IN ('ativo','trancado')) AS pessoas_ativo_trancado
FROM alunos
WHERE unidade_id = (SELECT id FROM unidades WHERE nome ILIKE '%barra%' LIMIT 1)
  AND NOT is_segundo_curso;
```

---

### 2.6 ⚠️ PARCIAL — MRR: R$100.707 (Analytics) vs R$99.373 (Prof. Carteira)

**Diferença:** R$1.334 (~1,3%)

**Causa raiz — INCLUSÃO/EXCLUSÃO DE ALUNOS SEM PROFESSOR:**

- Analytics MRR: `SUM(valor_parcela)` de todos os pagantes da unidade
- Prof. Carteira MRR: `SUM(mrr_total)` por professor → exclui alunos que **não estão vinculados a nenhum professor ativo** na carteira

Os R$1.334 de diferença correspondem a ~3 alunos pagantes com ticket médio ≈ R$445 que aparecem no sistema mas não têm professor vinculado ativo.

**Query para confirmar:**
```sql
-- Alunos pagantes sem professor vinculado (possível fonte da diferença)
SELECT COUNT(*), SUM(a.valor_parcela) AS mrr_sem_professor
FROM alunos a
LEFT JOIN professores p ON a.professor_id = p.id
WHERE a.status IN ('ativo', 'trancado')
  AND a.unidade_id = (SELECT id FROM unidades WHERE nome ILIKE '%barra%' LIMIT 1)
  AND (a.tipos_matricula_id IN (SELECT id FROM tipos_matricula WHERE conta_como_pagante = true))
  AND NOT a.is_segundo_curso
  AND (a.professor_id IS NULL OR p.ativo = false);
```

---

### 2.7 ⚠️ PARCIAL — Ticket Médio: R$427 (gráfico Evolução) vs R$448 (card)

**Causa raiz — FONTES TEMPORAIS DIFERENTES:**

- **Card R$448**: calculado em tempo real de `alunos` ao vivo para Jun/2026 atual
- **Gráfico "Atual: R$427"**: último ponto do array de evolução, que usa `dados_mensais` histórico (último mês com snapshot = **Mai/2026**, onde `ticket_medio` pode ser R$427)

O gráfico exibe a legenda "Atual" mas na verdade mostra o último ponto dos dados mensais históricos — que pode ser Mai/2026 se Jun/2026 ainda não tem snapshot em `dados_mensais`.

---

### 2.8 ⚠️ PARCIAL — Ticket Médio: R$448 (card) vs R$445 (tabela Resumo)

**Diferença:** R$3

**Causa raiz — PONDERAÇÃO DIFERENTE:**

- Card: `SUM(valor_parcela) / COUNT(pagantes)` — média por aluno individual
- Tabela Resumo: pode usar `vw_dashboard_unidade.ticket_medio` que calcula diferente ou arredonda diferente

---

## 3. Classificação das divergências

| # | Divergência | Classificação | Prioridade |
|---|-------------|---------------|-----------|
| 2.1 | Administrativo KPIs = 0 (Ativos, Pagantes) | **BUG** — view retorna dados mas mapeamento falha | **P0** |
| 2.2 | Administrativo Lançamentos = 0 vs Analytics = 3/5 | **ARQUITETURAL ESPERADO** + investigar se sync emusys deveria aparecer | P1 |
| 2.3 | Professores 222 vs 225 pagantes | **BUG** — derivação round(mrr/ticket) errada | **P0** |
| 2.4 | Professores 254 vs 228 ativos | **DEFINIÇÃO DIFERENTE** — RPC conta matrículas, Analytics conta pessoas | P1 |
| 2.5 | Dashboard 246 vs 228 ativos | **DEFINIÇÃO DIFERENTE** — vw_dashboard_unidade inclui aviso_previo ou matrículas | P1 |
| 2.6 | MRR R$100.707 vs R$99.373 | **DEFINIÇÃO DIFERENTE** — Carteira exclui alunos sem professor | P2 |
| 2.7 | Ticket R$427 (gráfico) vs R$448 (card) | **ERRO ARQUITETURAL** — label "Atual" aponta para dado histórico | P1 |
| 2.8 | Ticket R$448 vs R$445 | **DEFINIÇÃO DIFERENTE** — ponderação distinta | P2 |

---

## 4. Fonte canônica recomendada (Jun/2026 — mês aberto)

| KPI | Fonte canônica para mês aberto | Justificativa |
|-----|-------------------------------|---------------|
| Alunos Ativos | `COUNT DISTINCT LOWER(nome)` de `alunos` WHERE status IN (ativo,trancado) AND NOT is_segundo_curso | Conta pessoas, não matrículas |
| Alunos Pagantes | `COUNT` de `alunos` WHERE conta_como_pagante=true AND NOT is_segundo_curso AND status IN (ativo,trancado) | Filtro explícito e correto |
| Ticket Médio | `SUM(valor_parcela)/COUNT(pagantes)` — ponderado por pessoa pagante | Sem dupla contagem |
| MRR | `SUM(valor_parcela)` WHERE mesmos filtros de pagantes | Consistente com ticket |
| ARR | MRR × 12 | Derivado |
| Evasões | `movimentacoes_admin` WHERE tipo IN (evasao,nao_renovacao) AND data no mês | Inclui sync Emusys e manual |
| Renovações | `movimentacoes_admin` WHERE tipo = 'renovacao' AND data no mês | Idem |
| Novas Matrículas | `alunos` WHERE data_matricula no mês AND NOT is_segundo_curso | Fonte direta |
| Churn Rate | evasoes / ativos_inicio_mes × 100 | Precisa definir "ativos início" |
| Ativos Professores (carteira) | Campo explícito na RPC `get_carteira_professores` — sem derivação | Elimina erro round() |

---

## 5. Plano de correção prioritizado

### P0 — Bloqueia confiança (corrigir esta semana)

**P0-A: Administrativo KPIs zerados**
- Arquivo: `AdministrativoPage.tsx`
- Investigar: executar query SQL de diagnóstico da seção 2.1
- Fix provável: Adicionar fallback explícito para quando `kpisData` existe mas tem `total_alunos_ativos = 0` — ou checar nome de coluna da view
- Risco: BAIXO — só altera lógica de display, não dados

**P0-B: Professores Carteira pagantes derivados**
- Arquivo: `TabCarteiraProfessores.tsx` L292-297 + RPC `get_carteira_professores`
- Fix: Adicionar `alunos_pagantes` como campo calculado na RPC (COUNT direto, não round(mrr/ticket))
- Risco: MÉDIO — requer alteração de RPC no banco

### P1 — Visível ao usuário (corrigir no próximo sprint)

**P1-A: Padronizar definição de "Alunos Ativos"**
- Decidir: sistema usa "pessoas distintas" ou "matrículas"?
- Recomendação: PESSOAS (COUNT DISTINCT nome, NOT is_segundo_curso)
- Arquivos: `vw_dashboard_unidade`, `get_carteira_professores`, `AlunosPage.tsx`

**P1-B: Ticket "Atual" no gráfico aponta para dado de Maio**
- Arquivo: `TabGestao.tsx` — label do último ponto da série histórica
- Fix: se Jun não tem snapshot, usar valor ao vivo como último ponto marcado explicitamente como "Estimativa"

**P1-C: Administrativo lançamentos vs Analytics evasões**
- Decisão: o Administrativo deve mostrar lançamentos manuais OU todos os movimentos (incluindo Emusys)?
- Se incluir Emusys: remover filtro de origem na query de movimentacoes_admin
- Impacto UX: operadores veriam movimentos que não lançaram — definir com Alf

### P2 — Melhorias de consistência

**P2-A:** Ticket médio R$448 vs R$445 — padronizar cálculo em todas as tabelas de resumo
**P2-B:** MRR Carteira vs MRR Analytics — adicionar badge "exclui N alunos sem professor" na Carteira
**P2-C:** Professores ativos 254 vs 228 — adicionar tooltip explicando que Carteira conta matrículas

---

## 6. Queries SQL de verificação (rodar no Supabase)

```sql
-- ============================================================
-- DIAGNÓSTICO COMPLETO — Barra / Jun 2026
-- ============================================================

-- 1. O que a view retorna para Administrativo?
SELECT 'vw_kpis_gestao_mensal' AS fonte, *
FROM vw_kpis_gestao_mensal
WHERE ano = 2026 AND mes = 6
  AND unidade_id = (SELECT id FROM unidades WHERE nome ILIKE '%barra%' LIMIT 1);

-- 2. Contagem canônica de alunos ativos (pessoas)
SELECT
  COUNT(*) FILTER (WHERE status IN ('ativo','trancado') AND NOT is_segundo_curso) AS ativos_pessoas,
  COUNT(*) FILTER (WHERE status = 'aviso_previo' AND NOT is_segundo_curso) AS aviso_previo,
  COUNT(*) FILTER (WHERE status IN ('ativo','trancado','aviso_previo')) AS ativos_matriculas,
  COUNT(*) FILTER (
    WHERE status IN ('ativo','trancado')
    AND NOT is_segundo_curso
    AND id IN (SELECT id FROM tipos_matricula WHERE conta_como_pagante = true) -- adjust join as needed
  ) AS pagantes_pessoas
FROM alunos
WHERE unidade_id = (SELECT id FROM unidades WHERE nome ILIKE '%barra%' LIMIT 1);

-- 3. MRR canônico (alunos pagantes sem deduplica por professor)
SELECT
  COUNT(*) AS pagantes,
  SUM(valor_parcela) AS mrr_total,
  ROUND(AVG(valor_parcela), 2) AS ticket_medio
FROM alunos a
JOIN tipos_matricula tm ON a.tipo_matricula_id = tm.id
WHERE a.status IN ('ativo', 'trancado')
  AND tm.conta_como_pagante = true
  AND NOT a.is_segundo_curso
  AND a.unidade_id = (SELECT id FROM unidades WHERE nome ILIKE '%barra%' LIMIT 1);

-- 4. Movimentos Jun/2026 por origem (para entender zeros no Administrativo)
SELECT tipo, COUNT(*) AS total
FROM movimentacoes_admin
WHERE EXTRACT(YEAR FROM data) = 2026
  AND EXTRACT(MONTH FROM data) = 6
  AND unidade_id = (SELECT id FROM unidades WHERE nome ILIKE '%barra%' LIMIT 1)
GROUP BY tipo ORDER BY tipo;

-- 5. Alunos sem professor (fonte da diferença de MRR)
SELECT COUNT(*) AS sem_professor, COALESCE(SUM(a.valor_parcela), 0) AS mrr_sem_professor
FROM alunos a
JOIN tipos_matricula tm ON a.tipo_matricula_id = tm.id
WHERE a.status IN ('ativo', 'trancado')
  AND tm.conta_como_pagante = true
  AND NOT a.is_segundo_curso
  AND a.unidade_id = (SELECT id FROM unidades WHERE nome ILIKE '%barra%' LIMIT 1)
  AND (a.professor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM professores p WHERE p.id = a.professor_id AND p.ativo = true
  ));
```

---

## 7. Decisões que precisam do Alf

| # | Decisão | Contexto | Impacto |
|---|---------|---------|---------|
| D1 | Administrativo deve mostrar lançamentos Emusys ou só manuais? | Analytics mostra 3/5 do Emusys; Administrativo mostra 0 manual | Define se operator vê tudo ou só o que ele lançou |
| D2 | "Alunos Ativos" = pessoas distintas (228) ou matrículas (254)? | Afeta Carteira de Professores, Dashboard resumo, KPI oficial | Define o KPI canônico do negócio |
| D3 | Professores Carteira deve ter seletor de competência (mês)? | Hoje é sempre ao vivo — não tem histórico temporal | P1-B requere decisão antes de implementar |
| D4 | Churn deve incluir `aviso_previo` no denominador? | Afeta Administrativo (0.0%) vs Analytics (1.3%) | Define fórmula canônica |
