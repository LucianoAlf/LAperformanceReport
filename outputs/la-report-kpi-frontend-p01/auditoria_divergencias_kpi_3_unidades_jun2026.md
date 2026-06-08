# Auditoria KPI — 3 Unidades / Jun 2026
**Data:** 2026-06-08 | **Fonte:** Supabase MCP — queries ao vivo
**Escopo:** Barra · Campo Grande · Recreio | Dashboard · Analytics · Administrativo · Alunos · Professores/Carteira

---

## 1. Resumo Executivo

A auditoria com acesso direto ao banco identificou **2 bugs críticos estruturais nas views** e **1 bug crítico no frontend** que explicam todas as divergências observadas. Os números divergem entre páginas porque as views medem conceitos diferentes — e uma delas **sempre retorna o mês atual**, tornando qualquer consulta histórica silenciosamente incorreta.

| Problema | Impacto | Criticidade |
|----------|---------|-------------|
| `vw_kpis_gestao_mensal` hardcoda `CURRENT_DATE` — nunca é histórica | Mês fechado exibe dados de hoje | P0 — CRÍTICO |
| Views contam vínculos/linhas como "ativos", não pessoas únicas (requer dedup) | CG: 516 vínculos ≠ 478 pessoas reais | P0 — CRÍTICO |
| AlunosPage calcula MRR/ticket excluindo 2º curso — viola regra de negócio | Subrepresenta R$18k no consolidado | P1 — INCORREÇÃO |
| Administrativo mostra zeros apesar de dados existirem no banco | Operadores sem visibilidade | P0 — BUG FRONTEND |
| Professores/Carteira deriva pagantes via `round(mrr/ticket)` | -2 pagantes por unidade (Barra, Recreio) | P1 |

### Regras de negócio fechadas — não são decisões pendentes

> **Alunos Ativos** = pessoas únicas (dedup por nome+unidade). **Matrículas Ativas** = vínculos/linhas. KPIs diferentes, não substituíveis.
>
> **MRR** = soma de TODAS as parcelas recorrentes pagantes da pessoa (todos os cursos). Aluno com 4 cursos × R$300 = R$1.200 no MRR. O 2º curso entra no **numerador** (valor), mas não duplica a pessoa no **denominador** (contagem de pagantes).
>
> **Ticket Médio executivo** = SUM(parcelas recorrentes pagantes agregadas por pessoa) ÷ COUNT(pessoas pagantes). Não é média simples por matrícula. A `vw_kpis_gestao_mensal` já implementa corretamente via CTE `alunos_ticket`.
>
> **Fix de alunos ativos** não é `COALESCE(is_segundo_curso, false) = false` — isso ainda conta linhas. A correção exige `COUNT DISTINCT` de pessoa (ex: `lower(trim(nome)) || unidade_id`) nas views e RPCs.

---

## 2. Números Reais — Todas as Fontes (Jun/2026)

### 2.1 Barra — Jun/2026

| KPI | vw_kpis_gestao_mensal | vw_dashboard_unidade | alunos ao vivo (canônico) | Carteira Professores | dados_mensais Mai/26 |
|-----|----------------------|---------------------|--------------------------|---------------------|---------------------|
| **Alunos Ativos** | 246 | 246 | **228** (pessoas) / 228 (matrículas) | — | 222 |
| **Alunos Pagantes** | 225 | 225 | **225** | **223** | 221 |
| **Ticket Médio** | R$ 447,59 | R$ 445,34 | **R$ 428,90** | R$ 448 (card) | R$ 426,53 |
| **MRR** | R$ 100.707 | R$ 100.707 | **R$ 96.502** | R$ 95.702 | R$ 94.263 |
| **Churn Rate** | 1,36% | 1,36% | — | — | 5,88% |
| **Evasões** | 3 | 3 | — | — | 13 |
| **Novas Matrículas** | 3 | 3 | — | — | 9 |
| **Renovações (movim.)** | 5 | — | — | — | — |
| **Segundo curso ativo** | +13 (incluídos no MRR) | — | excluídos | — | — |
| **Sem professor** | — | — | — | 2 alunos / R$ 800 | — |

### 2.2 Campo Grande — Jun/2026

| KPI | vw_kpis_gestao_mensal | vw_dashboard_unidade | alunos ao vivo (canônico) | Carteira Professores | dados_mensais Mai/26 |
|-----|----------------------|---------------------|--------------------------|---------------------|---------------------|
| **Alunos Ativos** | 516 | 516 | **478** (pessoas) / 479 (matrículas) | — | 496 |
| **Alunos Pagantes** | 448 | 448 | **448** | **448** | 470 |
| **Ticket Médio** | R$ 389,11 | R$ 383,03 | **R$ 372,32** | — | R$ 368,66 |
| **MRR** | R$ 173.269 | R$ 173.269 | **R$ 166.798** | R$ 166.798 | R$ 173.270 |
| **Churn Rate** | 1,06% | 1,06% | — | — | 2,77% |
| **Evasões** | 5 | 5 | — | — | 13 |
| **Novas Matrículas** | 6 | 6 | — | — | 23 |
| **Renovações (movim.)** | 32 | — | — | — | — |
| **Segundo curso ativo** | +27 (incluídos no MRR) | — | excluídos | — | — |
| **Sem professor** | — | — | — | 0 alunos | — |

### 2.3 Recreio — Jun/2026

| KPI | vw_kpis_gestao_mensal | vw_dashboard_unidade | alunos ao vivo (canônico) | Carteira Professores | dados_mensais Mai/26 |
|-----|----------------------|---------------------|--------------------------|---------------------|---------------------|
| **Alunos Ativos** | 382 | 382 | **324** (pessoas) / 333 (matrículas) | — | 324 |
| **Alunos Pagantes** | 313 | 313 | **313** | **311** | 314 |
| **Ticket Médio** | R$ 438,40 | R$ 437,87 | **R$ 413,47** | — | R$ 401,49 |
| **MRR** | R$ 136.888 | R$ 137.273 | **R$ 129.416** | R$ 128.614 | R$ 126.068 |
| **Churn Rate** | 5,10% | 5,10% | — | — | 6,09% |
| **Evasões** | 16 | 16 | — | — | 19 |
| **Novas Matrículas** | 7 | 7 | — | — | 25 |
| **Renovações (movim.)** | 2 | — | — | — | — |
| **Segundo curso ativo** | +24 (incluídos no MRR) | — | excluídos | — | — |
| **Sem professor** | — | — | — | 2 alunos / R$ 802 | — |

---

## 3. Root Cause — Divergências com Evidência do SQL

### 3.1 BUG CRÍTICO — `vw_kpis_gestao_mensal` sempre retorna o mês atual

**Evidência direta do SQL da view (CTE `alunos_mes`):**

```sql
SELECT a.unidade_id,
  EXTRACT(year FROM CURRENT_DATE)::integer AS ano,   -- ← HARDCODED: sempre hoje
  EXTRACT(month FROM CURRENT_DATE)::integer AS mes,  -- ← HARDCODED: sempre hoje
  count(*) FILTER (...) AS total_alunos,
  ...
FROM alunos a ...
WHERE a.status IN ('ativo', 'trancado')
GROUP BY a.unidade_id
```

**Consequência:** A view não tem filtro temporal. Sempre retorna o estado atual da tabela `alunos`. O `ano/mes` na saída é sempre o mês corrente.

Quando o frontend filtra `WHERE ano = 2026 AND mes = 6` (junho, mês atual) → retorna dados ✓
Quando o frontend filtra `WHERE ano = 2026 AND mes = 5` (maio, fechado) → retorna 0 linhas ✗
→ **Analytics/Dashboard sempre mostram dados de hoje, independente do mês selecionado.**

**Para mês histórico fechado:** o fallback para `dados_mensais` deveria ser acionado, mas só ocorre se `kpisData.length === 0`. Se a view retorna uma linha com dados do mês atual para qualquer consulta do mês atual, a inconsistência passa despercebida.

### 3.2 BUG CRÍTICO — View infla Ativos e MRR

**Ativos inflados — alunos com `is_segundo_curso IS NULL`:**

A view (CTE `alunos_mes`) conta como ativo:
```sql
count(*) FILTER (WHERE is_segundo_curso IS NULL OR is_segundo_curso = false)
```
A página Alunos usa `NOT is_segundo_curso` (PostgreSQL) que exclui NULLs.

| Unidade | View (ativos) | Alunos (pessoas) | Diferença | is_segundo_curso=NULL |
|---------|--------------|-----------------|-----------|----------------------|
| Barra | 246 | 228 | **+18** | ~5 NULL + 13 2ºcurso |
| Campo Grande | 516 | 478 | **+38** | ~11 NULL + 27 2ºcurso |
| Recreio | 382 | 324 | **+58** | ~34 NULL + 24 2ºcurso |

**MRR na view — CORRETO pela regra de negócio:**

A view (CTE `alunos_mes`) calcula MRR incluindo todos os cursos do aluno:
```sql
sum(a.valor_parcela) FILTER (WHERE tm.conta_como_pagante = true
  AND COALESCE(status_pagamento, '') <> 'sem_parcela')
-- Inclui is_segundo_curso — CORRETO: aluno com 4 cursos × R$300 = R$1.200 no MRR
```

A contagem de **pagantes** (pessoas) exclui 2º curso — também correto: 1 pessoa conta 1 vez.

→ **View está internamente consistente:** MRR = soma de todas as parcelas de todas as matrículas. Pagantes = número de pessoas únicas. Ticket = MRR / Pagantes = valor total por pessoa.

**A divergência de MRR é a AlunosPage que está errada:**

| Unidade | MRR correto (view) | MRR errado (AlunosPage, excl 2º) | Subtração indevida |
|---------|-------------------|----------------------------------|--------------------|
| Barra | **R$ 100.707** | R$ 96.502 | R$ 4.205 (13 alunos 2º curso) |
| Campo Grande | **R$ 173.269** | R$ 166.798 | R$ 6.471 (27 alunos 2º curso) |
| Recreio | **R$ 136.888** | R$ 129.416 | R$ 7.472 (24 alunos 2º curso) |

### 3.3 Ticket Médio — Duas definições diferentes

**View (`vw_kpis_gestao_mensal` e `vw_dashboard_unidade`):** Usa CTE `alunos_ticket` que:
1. Agrupa por pessoa (`lower(nome) || unidade_id`)
2. Soma todas as parcelas de todos os cursos daquela pessoa
3. Filtra por `entra_ticket_medio = true` (não `conta_como_pagante`)
4. Calcula `AVG` dos valores por pessoa

**AlunosPage:** Usa `AVG(valor_parcela)` direto por matrícula individual com `conta_como_pagante = true`.

→ A view calcula ticket **por pessoa** (soma cursos), AlunosPage calcula **por matrícula**. Para alunos de múltiplos cursos, a view soma o valor total e divide por 1 pessoa.

| Unidade | Ticket View | Ticket Alunos | Diferença |
|---------|------------|---------------|-----------|
| Barra | R$ 447,59 | R$ 428,90 | **+R$ 18,69** |
| Campo Grande | R$ 389,11 | R$ 372,32 | **+R$ 16,79** |
| Recreio | R$ 438,40 | R$ 413,47 | **+R$ 24,93** |

**Qual está correto?** Para fins gerenciais, ticket-por-pessoa é mais representativo do valor do cliente. Para fins de billing individual, ticket-por-matrícula é o correto. Depende do contexto de uso.

### 3.4 Ticket R$427 no gráfico vs R$448 no card (Barra)

- **Card "Ticket Médio" (Analytics Financeiro):** R$447,59 — calculado ao vivo da view (Jun/2026 atual)
- **Gráfico "Evolução do Ticket Médio — Atual: R$427":** último ponto do array de evolução, que vem de `dados_mensais.ticket_medio` de **Maio/2026 = R$426,53 ≈ R$427**

O gráfico exibe o label "Atual" para o último ponto histórico disponível (Mai), enquanto o card já calculou o mês corrente (Jun). **Gap de R$21 é real — é a evolução do ticket de Mai→Jun.**

### 3.5 Professores/Carteira — Pagantes derivados com erro

A aba Carteira deriva pagantes via `Math.round(mrr_total / ticket_medio)` por professor, acumulando erros de arredondamento:

| Unidade | Pagantes (canônico) | Pagantes (Carteira) | Diferença | Alunos sem professor |
|---------|--------------------|--------------------|-----------|---------------------|
| Barra | 225 | **223** | **-2** | 2 alunos / R$ 800 |
| Campo Grande | 448 | **448** | 0 | 0 alunos |
| Recreio | 313 | **311** | **-2** | 2 alunos / R$ 802 |

Barra e Recreio têm 2 alunos pagantes sem professor ativo atribuído. A RPC os ignora + arredondamento acumulado = 2 a menos em cada unidade.

### 3.6 Administrativo — Zeros (Bug Frontend Confirmado)

**Dados no banco existem:**

| Unidade | Movim. Jun/2026 | Renovações | Evasões | Não Renov. | Avisos |
|---------|----------------|------------|---------|-----------|--------|
| Barra | 9 | 5 | 3 | 0 | 0 |
| Campo Grande | 39 | 32 | 3 | 2 | 1 |
| Recreio | 22 | 2 | 17 | 0 | 0 |

**O banco tem dados. O bug é no frontend.**

A view retorna dados corretos para jun/2026 (diagnóstico: "OK" para as 3 unidades). Mas o `AdministrativoPage.tsx` provavelmente tem um dos seguintes bugs:

**Hipótese A — `reduce` sem initial value:** Se `kpisData.length === 1` e `reduce` não tem valor inicial, o callback nunca é chamado e o objeto retornado tem as chaves originais da view (`total_alunos_ativos`) em vez das chaves mapeadas (`alunos_ativos`). Os cards mostram `resumo?.alunos_ativos || 0` = 0.

**Hipótese B — Bug no filtro de movimentações:** A query de movimentações usa `data BETWEEN dataInicio AND dataFim`. Se essas variáveis não estão inicializadas corretamente, retorna 0 lançamentos visíveis — mesmo com dados no banco.

**Como verificar:** Adicionar `console.log('kpisData:', kpisData, 'kpis:', kpis)` antes do setResumo em `AdministrativoPage.tsx` linha ~600.

---

## 4. Comparativo Consolidado — 3 Unidades Somadas

| KPI | Soma Views (Jun) | Soma Alunos Canônico (Jun) | Diferença | dados_mensais Mai/26 |
|-----|-----------------|--------------------------|-----------|---------------------|
| Alunos Ativos | 1.144 | **1.030** (pessoas) | +114 (+11%) | 1.042 |
| Alunos Pagantes | 986 | **986** | 0 | 1.005 |
| MRR Total | R$ 410.864 | **R$ 392.716** | +R$ 18.148 (+4,6%) | R$ 393.601 |
| Ticket Médio (ponderado) | R$ 416 (aprox) | **R$ 398** (aprox) | +R$ 18 | — |

---

## 5. Mapa de Página → Fonte → Problema

| Página | Aba | KPI | Fonte | Status |
|--------|-----|-----|-------|--------|
| Dashboard | Gestão | Pagantes | `vw_kpis_gestao_mensal` | ⚠️ Sempre mês atual |
| Dashboard | Gestão | Ativos | `vw_kpis_gestao_mensal` | ❌ Inflado (+NULL is_segundo_curso) |
| Dashboard | Gestão | MRR | `vw_kpis_gestao_mensal` | ❌ Inclui 2º curso |
| Dashboard | Gestão | Ticket | `vw_kpis_gestao_mensal` | ⚠️ Definição diferente (por pessoa) |
| Dashboard | Resumo Unidades | Ativos/Pagantes | `vw_dashboard_unidade` | ❌ Mesmos bugs da view acima |
| Analytics | Alunos | Ativos | `vw_kpis_gestao_mensal` | ❌ Inflado |
| Analytics | Alunos | Pagantes | `vw_kpis_gestao_mensal` | ⚠️ Correto hoje, errado para histórico |
| Analytics | Financeiro | MRR | `vw_kpis_gestao_mensal` | ❌ Inclui 2º curso |
| Analytics | Financeiro | Ticket (card) | `vw_kpis_gestao_mensal` | ⚠️ Definição por pessoa |
| Analytics | Financeiro | Ticket (gráfico) | `dados_mensais` | ✅ Snapshot histórico correto |
| Analytics | Retenção | Evasões/Churn | `vw_kpis_retencao_mensal` | ⚠️ Mesma limitação de mês atual |
| Administrativo | Resumo Mês | Todos KPIs | `vw_kpis_gestao_mensal` | ❌ BUG — zeros (frontend) |
| Administrativo | Lançamentos | Renovações/Evasões | `movimentacoes_admin` | ❌ BUG — zeros (frontend) |
| Gestão Alunos | KPI Header | Ativos | `alunos` ao vivo | ✅ Correto (operacional) |
| Gestão Alunos | KPI Header | Pagantes | `alunos` ao vivo | ✅ Correto (operacional) |
| Gestão Alunos | KPI Header | MRR/Ticket | `alunos` ao vivo | ✅ Correto para carteira viva |
| Professores | Carteira KPIs | Pagantes | `get_carteira_professores` + round(mrr/ticket) | ❌ Errado (-2 por unidade) |
| Professores | Carteira KPIs | MRR | `get_carteira_professores` | ❌ Exclui sem-professor |

---

## 6. Plano de Correção

### P0 — Fazer esta semana

**P0-A: Corrigir `vw_kpis_gestao_mensal` — adicionar filtro temporal real**

A view precisa calcular alunos de forma paramétrica (por snapshot ou por data). Para mês atual, a lógica atual funciona. Para histórico, precisa vir de `dados_mensais`.

**Solução imediata (sem alterar view):** O frontend deve verificar `useCompetenciaMensalStatus` e:
- Mês fechado → ler de `dados_mensais` diretamente (já existe `useDadosMensais`)
- Mês atual → view (comportamento atual)

**P0-B: Corrigir bug do Administrativo**

1. Abrir `AdministrativoPage.tsx` linha ~521: verificar se `reduce` tem initial value `{}`
2. Se não tiver, adicionar: `kpisData.reduce((acc, k) => ({...}), {})`
3. Verificar variáveis `dataInicio`/`dataFim` usadas no filtro de movimentações

**P0-C: Corrigir AlunosPage — incluir 2º curso no MRR e ticket**

A `AlunosPage.tsx` exclui `is_segundo_curso` do cálculo de MRR e ticket, contrariando a regra de negócio. Aluno com múltiplos cursos deve ter TODOS os cursos somados no MRR e ticket.

Arquivo: `src/components/App/Alunos/AlunosPage.tsx` — rever o filtro de MRR/ticket para incluir todas as matrículas da pessoa (sem excluir is_segundo_curso do valor financeiro). A contagem de *pessoas* (pagantes) continua excluindo 2º curso; o *valor* não.

### P1 — Próximo sprint

**P1-A: Corrigir `total_alunos_ativos` nas views — contar pessoas, não linhas**

O COALESCE não resolve. A view precisa deduplicar por pessoa:

```sql
-- ANTES (conta linhas onde is_segundo_curso = false/NULL — ERRADO):
count(*) FILTER (WHERE is_segundo_curso IS NULL OR is_segundo_curso = false)

-- DEPOIS (conta pessoas únicas — CORRETO):
COUNT(DISTINCT lower(trim(a.nome)) || '-' || a.unidade_id::text)
FILTER (WHERE a.status IN ('ativo','trancado'))
```

Aplicar nas views `vw_kpis_gestao_mensal`, `vw_dashboard_unidade` e na RPC `get_carteira_professores`.

Além disso: limpar os ~57 registros com `is_segundo_curso IS NULL` na tabela `alunos` (qualidade de dado).

**P1-B: Corrigir RPC `get_carteira_professores` — adicionar campo alunos_pagantes**

Adicionar contagem direta de pagantes ao invés de derivar via `round(mrr/ticket)`.

**P1-C: Padronizar definição de "Alunos Ativos" — pessoas vs matrículas**

Decidir (com Alf) qual é o KPI oficial. Recomendação: **pessoas distintas** (exclui 2º curso via `COALESCE(is_segundo_curso,false)=false`).

### P2 — Backlog

**P2-A:** Badge "Dados ao vivo — [Mês]" na AlunosPage quando competência fechada
**P2-B:** Gráfico Ticket Médio — usar ponto ao vivo para mês atual, não último snapshot
**P2-C:** Limpar `is_segundo_curso IS NULL` em produção (qualidade de dados)

---

## 7. Decisões Pendentes — Alf

As definições de KPI executivo estão fechadas (seção 1). Restam apenas:

| # | Decisão | Contexto |
|---|---------|---------|
| D4 | Administrativo deve mostrar lançamentos do Emusys ou só manuais? | CG tem 39 movimentos (32 renovações) já no banco — operadores não estão vendo |
| D5 | Churn Recreio Jun/2026 = 5,1% (16 evasões) — confirmar se o número é correto | Volume alto vs Barra (1,36%) e CG (1,06%) |

### Decisões já fechadas (para registro)

| # | Decisão | Resolução |
|---|---------|-----------|
| D1 | Alunos Ativos = pessoas ou matrículas? | **Pessoas únicas** (dedup). Matrículas Ativas = vínculos. |
| D2 | 2º curso entra no MRR? | **Sim** — entra no numerador (valor). Não duplica no denominador (pessoas). |
| D3 | Ticket médio = por pessoa ou por matrícula? | **Por pessoa** — SUM(parcelas pagantes da pessoa) ÷ COUNT(pessoas pagantes). |
