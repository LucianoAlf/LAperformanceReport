# Relatório P0.1 — Mapa de Fontes de KPIs Frontend
## LA Music Performance Report — Auditoria Técnica

**Data:** 2026-06-08
**Auditor:** Claude Sonnet 4.6 (agent P0.1)
**Escopo:** Leitura de código — sem execução de banco, sem patches

---

## 1. Resumo Executivo

### Contagem por status

| Status | Quantidade | KPIs afetados |
|--------|------------|---------------|
| ERRO CRÍTICO | 6 | alunos_pagantes, churn, evasões, ticket, inadimplência, renovação (useKPIsRetencao fallback; Dashboard fallback histórico; useKPIsGestao view-viva; TabCarteiraProfessores pagantes derivados; ticket consolidado sem ponderação; DashboardPage fallback duplo) |
| Parcial / Perigoso | 5 | Dashboard (lógica dual, flag frágil), Fideliza+ (RPC sem garantia de snapshot), evolução de alunos (mês atual vivo misturado), Carteira MRR/ticket (sem filtro temporal), taxa de renovação (fallback professores_performance) |
| OK | 7 | useDadosMensais, useCompetenciaMensalStatus, Dashboard gráfico evolução, Dashboard comercial, GestaoMensal/TabGestao, Fideliza+ histórico trimestral, AlunosPage recálculo bloqueado |
| Indefinido / Decisão Alf | 5 | AlunosPage KPIs operacionais (intencionalmente ao vivo), Professores média alunos/turma, Kids/School, bolsistas, LTV operacional |

### Principais riscos

1. **`useKPIsGestao` lê view viva para qualquer competência** — CG/Maio 2026 fechado exibirá ~449 ao vivo, não 470 snapshot.
2. **`useKPIsRetencao` fallback recalcula mês fechado ao vivo** — churn e evasões de mês histórico calculados sobre carteira atual.
3. **`DashboardPage` fallback duplo** — sem snapshot em `dados_mensais`, busca `alunos` ao vivo para mês histórico.
4. **`TabCarteiraProfessores` pagantes derivados** — `round(mrr/ticket)` sem filtro temporal → divergência 454 vs 449.
5. **`useKPIsGestao` ticket médio consolidado não ponderado** — média aritmética simples distorce consolidado.
6. **Fideliza+ RPC não auditada** — risco MÉDIO de usar views ao vivo para trimestres fechados.

---

## 2. Matriz Completa de Fontes

| Página | Aba/Componente | Elemento | KPI | Fonte atual | Campo | Filtro competência | Filtro unidade | Status | Risco | Fonte canônica | Patch? |
|--------|----------------|----------|-----|-------------|-------|--------------------|----------------|--------|-------|----------------|--------|
| Dashboard | Gestão | KPICard "Pagantes" | alunos_pagantes | `vw_kpis_gestao_mensal` (primário) → `dados_mensais` (fallback vazio) → `alunos` ao vivo (fallback2) | `total_alunos_pagantes` | ano+mes range | unidade_id | ❌ Errado | ALTO: primário é view viva para qualquer mês incluindo fechado | `dados_mensais` se fechado, `vw_kpis_gestao_mensal` se aberto | Sim |
| Dashboard | Gestão | KPICard "Ticket Médio" | ticket_medio | Mesmo fluxo acima | `ticket_medio` | idem | unidade_id | ❌ Errado | ALTO | `dados_mensais.ticket_medio` se fechado | Sim |
| Dashboard | Gestão | KPICard "Evasões" | evasoes | `dados_mensais.evasoes` (histórico) → `vw_kpis_retencao_mensal` (fallback) | `total_evasoes` / `evasoes` | ano+mes | unidade_id | ⚠️ Parcial | MÉDIO: fallback usa view viva | `dados_mensais.evasoes` se fechado | Sim |
| Dashboard | Gestão | KPICard "Matrículas" | novas_matriculas | `dados_mensais.novas_matriculas` (histórico) → `alunos` ao vivo (fallback2) | `novas_matriculas` | data_matricula range | unidade_id | ⚠️ Parcial | ALTO: fallback2 reconta ao vivo | `dados_mensais.novas_matriculas` se fechado | Sim |
| Dashboard | Gestão | Tabela Resumo Unidades — Pagantes | alunos_pagantes | `vw_dashboard_unidade` (atual) → `dados_mensais` (histórico) → `vw_dashboard_unidade` (fallback sem snapshot) | `alunos_pagantes` | isPeriodoAtual flag | unidade_id | ⚠️ Parcial | MÉDIO: fallback final usa vivo mesmo para histórico | `dados_mensais` se fechado | Sim |
| Dashboard | Gestão | Tabela Resumo Unidades — Ticket | ticket_medio | idem acima | `ticket_medio` | idem | unidade_id | ⚠️ Parcial | MÉDIO | `dados_mensais.ticket_medio` | Sim |
| Dashboard | Gestão | Gráfico Evolução 12 meses (histórico) | alunos_pagantes | `dados_mensais` | `alunos_pagantes` | últimos 12 meses | unidade_id | ✅ OK | BAIXO | Mantém | Não |
| Dashboard | Gestão | Gráfico Evolução 12 meses (ponto atual) | alunos_pagantes | `vw_dashboard_unidade` (real-time) | `alunos_pagantes` | mês corrente | unidade_id | ✅ OK | Mês atual explicitamente vivo | Mantém | Não |
| Dashboard | Comercial | KPICard "Leads" | leads_mes | `leads` direto (atual) / `vw_kpis_comercial_historico` (histórico) | count / `total_leads` | data_contato range | unidade_id | ✅ OK | Comercial não tem snapshot obrigatório | Mantém | Não |
| Dashboard | Comercial | KPICard "Taxa Conversão" | taxa_conversao | `leads.experimental_realizada` + status | calculado JS | data_contato range | unidade_id | ✅ OK | Fórmula correta, fonte operacional | Mantém | Não |
| Dashboard | Comercial | KPICard "Ticket Passaporte" | ticket_passaporte | `alunos.valor_passaporte` (atual) / `vw_kpis_comercial_historico` (histórico) | `valor_passaporte` | data_matricula range | unidade_id | ✅ OK | Aceitável | Mantém | Não |
| Dashboard | Professores | KPICard "Taxa Renovação" | taxa_renovacao | `movimentacoes_admin` (primário) → `professores_performance` (fallback) | tipo=renovacao | data range | unidade_id | ⚠️ Parcial | MÉDIO: fallback usa tabela histórica não automática | `movimentacoes_admin` ou `dados_mensais.taxa_renovacao` | Monitorar |
| Dashboard | Professores | KPICard "Média Alunos/Prof" | media_alunos_professor | `vw_turmas_implicitas` ao vivo | total_alunos/count | sem filtro competência | unidade_id | ❓ Indefinido | Operacional por natureza | Decisão Alf | Não |
| Alunos | KPI Header | KPICard "Pagantes" | totalPagantes | `alunos` ao vivo — JS `conta_como_pagante AND NOT is_segundo_curso AND (ativo|trancado)` | `tipos_matricula.conta_como_pagante` | data_matricula range opcional | unidade_id | ❓ Indefinido | Intencionalmente operacional | Decisão Alf | Não (se operacional) |
| Alunos | KPI Header | KPICard "Ticket Médio" | ticketMedio | `alunos` ao vivo — JS `entra_ticket_medio=true`, agrupa por pessoa | `valor_parcela` | range | unidade_id | ❓ Indefinido | Operacional | Idem | Não |
| Alunos | KPI Header | KPICard "T. Permanência / LTV" | ltvMedio | RPC `get_tempo_permanencia` | `tempo_permanencia_medio` | sem filtro competência | unidade_id | ✅ OK | Operacional, correto | Mantém | Não |
| Alunos | KPI Header | KPICard "Alunos Ativos" | totalAtivos | `alunos` ao vivo — `DISTINCT nome` status ativo/trancado | nome lower | range | unidade_id | ❓ Indefinido | Operacional | Idem | Não |
| Alunos | KPI Header | KPICard "Matrículas Ativas" | totalMatriculasAtivas | `alunos` ao vivo — ativo+trancado+aviso_previo count | status | range | unidade_id | ❓ Indefinido | Operacional | Idem | Não |
| Alunos | KPI Header | KPICard "Bolsistas" | totalBolsistas | `alunos` ao vivo — `codigo BOLSISTA_INT/PARC AND NOT banda` | `tipos_matricula.codigo` | range | unidade_id | ❓ Indefinido | Operacional | Idem | Não |
| Alunos | KPI Header | Banda / 2ºcurso / Coral | matriculasBanda, matriculasSegundoCurso, matriculasCoral | `alunos` ao vivo calculado JS | `is_projeto_banda`, `is_segundo_curso`, nome curso | range | unidade_id | ❓ Indefinido | Operacional | Idem | Não |
| Professores | TabCarteira | KPICard "Alunos Pagantes" consolidado | totalPagantes | Derivado: `SUM(round(mrr_total / ticket_medio))` por professor — JS | RPC `get_carteira_professores` → JS | NENHUM (ao vivo) | unidade_id | ❌ Errado | CRÍTICO: sem filtro temporal + arredondamento acumulado → 454 em vez de 449/470 | RPC com campo explícito `alunos_pagantes` ou `dados_mensais` | Sim |
| Professores | TabCarteira | KPICard "MRR Total" | mrrTotal | RPC `get_carteira_professores` ao vivo | `mrr_total` | NENHUM | unidade_id | ❌ Errado | ALTO: sem filtro temporal; retorna estado atual | RPC com parâmetro de data / `dados_mensais.mrr` | Sim |
| Professores | TabCarteira | KPICard "Ticket Médio" | ticketMedio | Derivado: `mrrTotal / totalPagantes` — JS | calculado | NENHUM | unidade_id | ❌ Errado | ALTO: propaga erro de pagantes | `dados_mensais.ticket_medio` ou campo da RPC | Sim |
| Professores | TabCarteira | KPICard "Alunos Ativos" | total_alunos | RPC `get_carteira_professores` ao vivo | `total_alunos` | NENHUM | unidade_id | ❓ Indefinido | Aceitável se explicitamente operacional | Badge "ao vivo" | Não |
| Professores | TabCarteira | Tabela alunos expandida | valor_parcela, status, tempo_permanencia | `alunos` direto ao vivo | `valor_parcela` etc | NENHUM | unidade_id | ❓ Indefinido | Operacional, gestão de carteira | Badge "ao vivo" | Não |
| Professores | TabPerformance | KPIs por professor | media_alunos_turma, taxa_cancelamento, taxa_conversao, media_presenca, evasoes | `vw_kpis_professor_mensal` via `get_kpis_professor_periodo` | múltiplos | ano+mes ou range trimestral | unidade_id | ✅ OK | View mensal; professores não têm snapshot separado — comportamento esperado | Mantém | Não |
| Professores | TabPerformance | Health Score | score composto | Calculado JS de KPIs de performance | múltiplos | ano+mes | unidade_id | ✅ OK | Derivado de fonte correta | Mantém | Não |
| Administrativo | TabFideliza | Ranking — métricas | churn_rate, inadimplencia, taxa_renovacao, reajuste, lojinha | RPC `get_programa_fideliza_dados` (SQL não auditado) | `metricas.*` | p_trimestre | p_unidade_id | ⚠️ Parcial | MÉDIO: se RPC usa views ao vivo para trimestre fechado, valores errados | Verificar SQL RPC | Verificar |
| Administrativo | TabFideliza | Histórico trimestral | todos KPIs históricos | `programa_fideliza_historico` via RPC | `historico.*` | trimestre snap | unidade_id | ✅ OK | Snapshot salvo explicitamente | Mantém | Não |
| Administrativo | TabFideliza | Pontuação/Bônus | pontos por critério | Calculado JS de métricas da RPC | múltiplos | p_trimestre | p_unidade_id | ✅ OK | Cálculo JS correto, derivado de fonte RPC | Depende da RPC | Não |
| useKPIsGestao | hook | todos KPIs de gestão | total_alunos_ativos/pagantes, ticket, mrr, arr, churn, evasoes | `vw_kpis_gestao_mensal` SEMPRE primário + `dados_mensais` fallback vazio | múltiplos | ano+mes | unidade_id | ❌ Errado | CRÍTICO: view viva para qualquer competência incluindo fechada | `dados_mensais` se fechado | Sim |
| useKPIsRetencao | hook | evasoes, renovacoes, churn, taxa_evasao | total_evasoes, taxa_evasao, taxa_renovacao | `vw_kpis_retencao_mensal` primário + `movimentacoes_admin`+`alunos` ao vivo fallback | múltiplos | ano+mes | unidade_id | ❌ Errado | CRÍTICO: fallback recalcula ao vivo mês fechado | `dados_mensais` se fechado, sem fallback para alunos ao vivo | Sim |
| useDadosMensais | hook | todos | alunos_pagantes, evasoes, churn, ticket etc | `dados_mensais` diretamente | múltiplos | ano+mesInicio+mesFim | unidade_id | ✅ OK | Fonte canônica correta | Mantém | Não |
| useKPIsGestao | hook — consolidado | ticket_medio | ticket médio consolidado | Média aritmética `sum(ticket) / count(unidades)` — JS linha 93 | `ticket_medio` | idem | idem | ❌ Errado | MÉDIO: ignora ponderação por pagantes — distorce consolidado | Média ponderada `sum(ticket*pagantes)/sum(pagantes)` | Sim |

---

## 3. Divergências Críticas

### 3.1 Divergência 454 vs 449 — Alunos Pagantes CG/Jun2026

**Professores (TabCarteira) exibe 454:**

Fonte: RPC `get_carteira_professores` → JavaScript:
```typescript
// src/components/App/Professores/TabCarteiraProfessores.tsx linhas 292-297
const totalPagantes = dados.reduce((acc, c) => {
  if (c.ticket_medio > 0) {
    return acc + Math.round(c.mrr_total / c.ticket_medio);
  }
  return acc;
}, 0);
```

Problemas identificados:
1. **Sem filtro temporal** — RPC retorna carteira ao vivo do momento da consulta.
2. **Arredondamento acumulado** — `Math.round(mrr/ticket)` por professor. Ex: professor com MRR R$9.180 e ticket R$204 → `round(9180/204) = round(45.0) = 45`. Outro com MRR R$6.650 e ticket R$221 → `round(6650/221) = round(30.09) = 30`. Erros individuais acumulam-se em N professores.
3. **Possível inclusão de `is_segundo_curso=true`** no campo `mrr_total` da RPC — inflaciona MRR e por consequência inflaciona pagantes derivados.

**AlunosPage exibe 449:**

Fonte: `alunos` ao vivo, JS explícito:
```typescript
// src/components/App/Alunos/AlunosPage.tsx linhas 616-621
const pagantesRecords = ativosETrancados.filter((a: any) =>
  a.tipos_matricula?.conta_como_pagante === true &&
  !a.is_segundo_curso &&
  (a.status === 'ativo' || a.status === 'trancado')
);
const totalPagantes = pagantesRecords.length;
```

Filtro correto e explícito: `conta_como_pagante AND NOT is_segundo_curso AND (ativo|trancado)`.

**Explicação das 5 unidades de diferença:**
- RPC provavelmente inclui alunos de `aviso_previo` ou `is_segundo_curso=true` com parcela no MRR, inflacionando `round(mrr/ticket)`.
- Arredondamento acumulado adiciona 1-3 unidades extras.

**Nenhum valor corresponde à referência Maio 2026 (470).** Ambas as telas exibem Jun2026 aberto — a divergência 470 vs 454/449 é esperada e indica mês diferente, não erro de cálculo na comparação mês a mês.

### 3.2 Impacto na referência CG/Maio 2026 (competência FECHADA)

Para `ano=2026, mes=5, unidade=CG`:

| Tela | Fonte usada | Valor esperado do snapshot | Valor exibido (estimado) | Status |
|------|-------------|---------------------------|--------------------------|--------|
| Dashboard "Pagantes" | `vw_kpis_gestao_mensal` (vivo) | 470 | ~449 (ao vivo Jun) | ❌ ERRO |
| Dashboard "Ticket Médio" | `vw_kpis_gestao_mensal` (vivo) | R$368,66 | valor Jun ao vivo | ❌ ERRO |
| Dashboard "Churn" | `dados_mensais` → RPC retencao | 2,77% | provável 2,77% (se snapshot existe) | ⚠️ Depende |
| Dashboard "Evasões" | `dados_mensais` (se existir) | 13 | 13 (se snapshot existe) | ⚠️ Depende |
| GestaoMensal | `dados_mensais` via RPC | 470 / R$368,66 / 13 / 2,77% | Correto | ✅ OK |
| AlunosPage KPIs | `alunos` ao vivo | N/A (operacional) | ~449 (ao vivo) | ❓ Indefinido |
| Professores Carteira | RPC ao vivo | N/A | ~454 (ao vivo) | ❌ ERRO se exibido como Maio |

---

## 4. Itens OK

1. **`useDadosMensais`** (`src/hooks/useDadosMensais.ts`): lê `dados_mensais` com `ano + mesInicio/mesFim + unidade_id`. Agregações corretas: média para churn/ticket/inadimplencia, soma para evasoes/novas_matriculas. Fonte canônica correta.

2. **`useCompetenciaMensalStatus`** (`src/hooks/useCompetenciaMensalStatus.ts`): implementação correta do status de fechamento. Lê `competencias_mensais`, calcula `bloqueiaEscrita`, expõe `status` com semântica clara. Bem integrado em `AlunosPage` para bloquear recálculo.

3. **`DashboardPage` — gráfico Evolução 12 meses**: usa `dados_mensais` para histórico e substitui explicitamente o ponto do mês corrente com `vw_dashboard_unidade`. Arquitetura correta — fonte histórica = snapshot, fonte atual = vivo. Linha 772-788.

4. **`DashboardPage` — dados comerciais**: lê `leads` direto para mês atual e `vw_kpis_comercial_historico` para histórico. Comercial não tem snapshot fechado obrigatório — comportamento correto.

5. **`GestaoMensal/TabGestao`** (`src/components/GestaoMensal/TabGestao.tsx`): usa `recalcular_dados_mensais` → `get_kpis_consolidados` operando sobre `dados_mensais`. Fluxo canônico correto.

6. **`useFidelizaPrograma` — histórico trimestral**: tabela `programa_fideliza_historico` com snapshots salvos via `salvar_historico_trimestral_fideliza`. Correto para histórico.

7. **`AlunosPage` — botão Recalcular**: corretamente bloqueado por `useCompetenciaMensalStatus.bloqueiaEscrita`. Para competência fechada, botão desabilitado com tooltip correto.

---

## 5. Itens Parciais / Perigosos

### 5.1 `useKPIsGestao` — fallback `dados_mensais` nunca ativado para meses fechados

**Arquivo:** `src/hooks/useKPIsGestao.ts`, linhas 115–148

O fallback para `dados_mensais` só ativa quando a view retorna zero linhas. Para CG/Maio 2026 fechado, `vw_kpis_gestao_mensal` provavelmente retorna dados (view calcula ao vivo sobre `alunos`). O fallback nunca é ativado. O hook não consulta `useCompetenciaMensalStatus`.

**Risco:** ALTO. Mês fechado exibe dados ao vivo sem alerta.

### 5.2 `DashboardPage` — flag `isPeriodoAtual` como único guardião de fonte

**Arquivo:** `src/components/App/Dashboard/DashboardPage.tsx`, linha 362

```typescript
const isPeriodoAtual = ano === currentYear && mesInicio === currentMonth && mesFim === currentMonth;
```

Três problemas:
1. Mês passado sem snapshot cai no fallback de `alunos` ao vivo (linhas 406–466).
2. Não consulta `useCompetenciaMensalStatus` — ignora estado de fechamento da competência.
3. Para range trimestral com mês atual incluído: `isPeriodoAtual = false` → busca `dados_mensais` que pode estar parcialmente vazio.

**Risco:** ALTO para meses históricos sem snapshot, MÉDIO para trimestres mistos.

### 5.3 `useFidelizaPrograma` — métricas atuais via RPC sem fonte conhecida

**Arquivo:** `src/hooks/useFidelizaPrograma.ts`, linha 234

RPC `get_programa_fideliza_dados` — SQL não auditado no escopo deste relatório. O frontend confia cegamente nos valores retornados. Se a RPC usa views ao vivo para o trimestre em andamento, as métricas de churn/inadimplência/renovação exibidas no ranking serão diferentes do que será consolidado ao fechar o trimestre.

**Risco:** MÉDIO-ALTO. Depende da implementação SQL.

### 5.4 `DashboardPage` — taxa de renovação com fallback para `professores_performance`

**Arquivo:** `src/components/App/Dashboard/DashboardPage.tsx`, linhas 712–725

Fallback usa tabela `professores_performance` com mapeamento hardcoded de UUIDs para nomes de unidade (Campo Grande, Recreio, Barra). Frágil e potencialmente desatualizado se unidades mudam.

**Risco:** BAIXO-MÉDIO. Só ativa quando `movimentacoes_admin` retorna vazio.

### 5.5 `DashboardPage` — resumo unidades sem tempo médio em histórico

**Arquivo:** `src/components/App/Dashboard/DashboardPage.tsx`, linha 866

```typescript
return { ..., tempo_medio: 0 };  // sempre zero para histórico
```

Tempo médio de permanência sempre zero na tabela de resumo por unidade para períodos históricos.

**Risco:** BAIXO. Campo silenciosamente zero — não é exibido de forma proeminente.

---

## 6. Itens Errados

### 6.1 `useKPIsGestao` — rota primária lê view viva para qualquer mês

**Arquivo:** `src/hooks/useKPIsGestao.ts`
**Linhas:** 63–78

```typescript
// ERRO: view viva para qualquer competência, incluindo fechada
let query = supabase
  .from('vw_kpis_gestao_mensal')
  .select('*')
  .eq('ano', currentYear)
  .eq('mes', currentMonth);
```

Não há verificação de `competenciaFechada`. Para CG/Maio 2026 (`ano=2026, mes=5`): retorna dados ao vivo — ~449 pagantes e ticket ao vivo, não 470 e R$368,66.

**Impacto:** Qualquer componente que usa `useKPIsGestao` com competência fechada exibe dados errados.

### 6.2 `useKPIsRetencao` — fallback recalcula mês fechado com carteira atual

**Arquivo:** `src/hooks/useKPIsRetencao.ts`
**Linhas:** 193–203

```typescript
// ERRO: carteira atual usada para calcular taxa de mês histórico
let alunosQuery = supabase
  .from('alunos')
  .select('*', { count: 'exact', head: true })
  .in('status', ['ativo', 'trancado']);
// sem filtro de data — conta carteira de hoje
```

Para CG/Maio 2026: se view retornar vazio, `taxa_evasao = 13 / 449 = 2,90%` (ao vivo com 449 alunos) em vez de `13 / 496 = 2,62%` (snapshot correto com 496 ativos). Diverge do `churn_rate = 2,77%` de `dados_mensais`.

Adicionalmente, linhas 161–178:
```typescript
// ERRO: evasões de período histórico buscadas em movimentacoes_admin ao vivo
let evasoesQuery = supabase
  .from('movimentacoes_admin')
  .select('*')
  .in('tipo', ['evasao', 'nao_renovacao'])
  .gte('data', startDate)
  .lte('data', endDate);
```

Isso está aparentemente correto (filtra por data), mas mistura movimentacoes_admin (operacional) com dados_mensais (snapshot) — fontes diferentes para o mesmo período.

### 6.3 `DashboardPage` — fallback duplo para histórico usa `alunos` ao vivo

**Arquivo:** `src/components/App/Dashboard/DashboardPage.tsx`
**Linhas:** 406–466

```typescript
// ERRO: para período histórico sem snapshot em dados_mensais
// busca alunos ao vivo e recalcula KPIs executivos
let alunosQuery = supabase
  .from('alunos')
  .select('id, status, tipo_matricula_id, is_segundo_curso, valor_parcela, ...')
  .in('status', ['ativo', 'trancado']);
// sem filtro de data — conta carteira atual
```

Este fallback nunca deveria existir para meses fechados. Para meses sem snapshot, o correto é exibir "Indisponível" ou "Dados preliminares".

### 6.4 `TabCarteiraProfessores` — pagantes derivados sem filtro temporal

**Arquivo:** `src/components/App/Professores/TabCarteiraProfessores.tsx`
**Linhas:** 99–100 e 292–297

```typescript
// ERRO 1: RPC sem parâmetro de data
const { data: carteiraData } = await supabase.rpc('get_carteira_professores', rpcParams);
// rpcParams = { p_unidade_id: unidadeAtual } — sem data

// ERRO 2: derivação com arredondamento acumulado
const totalPagantes = dados.reduce((acc, c) => {
  if (c.ticket_medio > 0) {
    return acc + Math.round(c.mrr_total / c.ticket_medio);  // acumula erro
  }
  return acc;
}, 0);
```

Resultado: 454 para CG/Jun2026 ao invés do correto 449 (operacional) ou 470 (Maio snapshot).

### 6.5 `useKPIsGestao` — ticket médio consolidado não ponderado

**Arquivo:** `src/hooks/useKPIsGestao.ts`
**Linha:** 93

```typescript
// ERRO: média aritmética ignora tamanho das unidades
ticket_medio: kpisData.reduce((acc, k) => acc + (k.ticket_medio || 0), 0) / kpisData.length,
```

Para unidades com 50/200/400 pagantes e tickets R$250/R$350/R$380: média aritmética = R$326,67; média ponderada correta = R$359,38. Diferença de R$33 por aluno para fins de MRR/ARR.

O padrão correto já existe em `DashboardPage.tsx` linha 477 (`ticket_medio_ponderado_sum`) mas não foi replicado no hook.

### 6.6 `DashboardPage` — MRR histórico calculado incorretamente

**Arquivo:** `src/components/App/Dashboard/DashboardPage.tsx`
**Linha:** 857

```typescript
// Para histórico de tabela resumo unidades:
faturamento: alunosPagantes * ticketMedio  // ticketMedio = sum/count (não ponderado)
```

Propaga o erro do ticket não ponderado para o cálculo de faturamento/MRR.

---

## 7. Fideliza+ — Análise Separada

### Fluxo de dados

```
TabProgramaFideliza
  → useFidelizaPrograma
      → RPC get_programa_fideliza_dados(p_ano, p_trimestre, p_unidade_id)
          → retorna: config, farmers[].metricas, penalidades, historico, experiencias
      → frontend: calcularPontuacao() em JS puro (correto)
      → RPC salvar_historico_trimestral_fideliza → programa_fideliza_historico (snapshot)
```

### Análise das métricas trimestrais

| Métrica | Fonte frontend | SQL RPC auditado? | Status | Risco |
|---------|---------------|-------------------|--------|-------|
| `churn_rate` | RPC `farmers[].metricas.churn_rate` | Não | ⚠️ Parcial | Se RPC usa `dados_mensais` → OK; se usa views → MÉDIO |
| `inadimplencia_pct` | RPC `farmers[].metricas.inadimplencia_pct` | Não | ⚠️ Parcial | Idem |
| `taxa_renovacao` | RPC `farmers[].metricas.taxa_renovacao` | Não | ⚠️ Parcial | Idem |
| `reajuste_medio` | RPC `farmers[].metricas.reajuste_medio` | Não | ⚠️ Parcial | Idem |
| `vendas_lojinha` | RPC `farmers[].metricas.vendas_lojinha` | Não | ⚠️ Parcial | Provavelmente tabela de vendas — operacional; OK |
| Histórico trimestral | `programa_fideliza_historico` (snapshot salvo) | N/A | ✅ OK | Baixo — snapshot explícito |

### Pontuação e bônus

Cálculo de pontuação (arquivo `useFidelizaPrograma.ts` linhas 143–226) é 100% em JavaScript usando os dados da RPC. Implementação correta com caps por categoria e critérios bem definidos.

### Risco principal

**MÉDIO:** A RPC `get_programa_fideliza_dados` deve ser auditada para confirmar que usa `dados_mensais` (não views ao vivo) para trimestres cujos meses já foram fechados. Prioridade: antes do fechamento de Q2/2026.

---

## 8. Página Alunos — Operacional vs KPI Executivo

### Papel da página

`AlunosPage` é explicitamente uma página **operacional de gestão de carteira viva**. Seus KPIs no header são calculados de `alunos` ao vivo com filtro de `data_matricula` opcional. Isso é intencional e correto para o propósito da página.

### Distinção fundamental

| Aspecto | AlunosPage (operacional) | GestaoMensal/Dashboard (executivo) |
|---------|-------------------------|------------------------------------|
| Fonte | `alunos` ao vivo | `dados_mensais` snapshot |
| Propósito | Gestão diária | Relatório mensal fechado |
| Filtro temporal | `data_matricula` range | `ano + mes` exato |
| "449 pagantes" | Estado atual carteira CG | Incomparável com snapshot |
| Bloqueio competência | Sim (para recálculo RPC), não para leitura | Bloqueio total de escrita |

### Conclusão

Os KPIs da AlunosPage **não devem** ser comparados com `dados_mensais`. São dados diferentes por definição e propósito. O problema não é a AlunosPage mostrar 449 — é o Dashboard (que deveria ser executivo) também exibir ao vivo em vez do snapshot para competência fechada.

**Recomendação:** Adicionar badge visível "Dados operacionais — carteira ao vivo" no header de KPIs da AlunosPage quando a competência selecionada estiver fechada, para diferenciar explicitamente do número do relatório.

---

## 9. Arquitetura Recomendada — Hook Canônico

### Proposta: `useKPIsAlunosCanonicos`

```typescript
// src/hooks/useKPIsAlunosCanonicos.ts

export type FonteKPI = 'dados_mensais' | 'vivo' | 'preliminar' | 'indisponivel';

export interface KPIsAlunosCanonicosResult {
  // Meta-informação obrigatória
  fonte: FonteKPI;
  competenciaFechada: boolean;
  competenciaLabel: string;
  alertasFonte: string[];

  // KPIs de carteira
  alunosAtivos: number | null;
  alunosPagantes: number | null;
  ticketMedio: number | null;
  mrr: number | null;
  arr: number | null;

  // KPIs de retenção
  churnRate: number | null;
  evasoes: number | null;
  inadimplencia: number | null;
  taxaRenovacao: number | null;

  // KPIs de tempo
  tempoPermanencia: number | null;
  ltv: number | null;

  // Matrículas
  matriculasAtivas: number | null;
  novasMatriculas: number | null;
  matriculasBanda: number | null;
  matriculasSegundoCurso: number | null;

  // Segmentação
  bolsistasIntegrais: number | null;
  bolsistasParciais: number | null;
  kids: number | null;
  school: number | null;

  // Consolidado por unidade
  porUnidade: Array<{
    unidade_id: string;
    unidade_nome: string;
    fonte: FonteKPI;
    alunosAtivos: number | null;
    alunosPagantes: number | null;
    ticketMedio: number | null;
    mrr: number | null;
    churnRate: number | null;
    evasoes: number | null;
  }>;

  // Evolução histórica (para gráficos)
  evolucao: Array<{
    ano: number;
    mes: number;
    label: string;
    alunosPagantes: number | null;
    ticketMedio: number | null;
    churnRate: number | null;
    fonte: FonteKPI;
  }>;

  // Estado
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export interface UseKPIsAlunosCanonicosParams {
  unidadeId: string | 'todos';
  ano: number;
  mes: number;
  mesFim?: number; // para range trimestral/semestral
}
```

### Pseudo-código de implementação

```typescript
export function useKPIsAlunosCanonicos({ unidadeId, ano, mes, mesFim }: Params) {
  const mesInicio = mes;
  const mesUltimo = mesFim ?? mes;

  // PASSO 1: Verificar status de fechamento
  // Para range: consultar status de TODOS os meses do range
  const { rows: statusRows, loading: statusLoading } = useCompetenciaMensalStatus({
    unidadeId,
    ano,
    mes: mesInicio,
    enabled: true,
  });

  const competenciaFechada = useMemo(() => {
    // Considerado fechado se qualquer unidade do range tem status fechado/retificacao
    return statusRows.some(r =>
      r.status === 'fechado' || r.status === 'retificacao_pendente'
    );
  }, [statusRows]);

  // PASSO 2: Determinar fonte
  const fonte = useMemo((): FonteKPI => {
    if (statusLoading) return 'indisponivel';
    if (competenciaFechada) return 'dados_mensais';
    const hoje = new Date();
    const isAtual = ano === hoje.getFullYear() && mesInicio === hoje.getMonth() + 1;
    return isAtual ? 'vivo' : 'preliminar';
  }, [competenciaFechada, statusLoading, ano, mesInicio]);

  // PASSO 3: Buscar de fonte correta
  useEffect(() => {
    if (fonte === 'dados_mensais') {
      // Query ÚNICA: dados_mensais WHERE ano=ano AND mes BETWEEN mesInicio AND mesUltimo
      // Agregação canônica:
      //   alunos_pagantes = média ponderada por mês (ou última linha para mensal)
      //   ticket_medio = SUM(ticket*pagantes) / SUM(pagantes) — ponderado
      //   evasoes = SUM (evento acumulável)
      //   novas_matriculas = SUM (evento acumulável)
      //   churn_rate = média simples dos meses (ou recalcular = SUM(evasoes)/SUM(pagantes_ini)*100)
      //   inadimplencia = média simples
      //   taxa_renovacao = SUM(renovadas)/SUM(previstas)*100
      fetchFromDadosMensais();
    } else if (fonte === 'vivo' || fonte === 'preliminar') {
      // Para mês atual aberto: vw_kpis_gestao_mensal + vw_kpis_retencao_mensal
      // Marcar como 'preliminar' se fonte === 'preliminar'
      fetchFromLive();
    } else {
      // indisponivel: retornar nulls, não zeros
      setResult({ fonte: 'indisponivel', ...nullKPIs });
    }
  }, [fonte, unidadeId, ano, mesInicio, mesUltimo]);

  // PASSO 4: Gerar alertas de fonte
  const alertasFonte = gerarAlertasFonte(fonte, competenciaLabel);

  // REGRAS INVIOLÁVEIS:
  // - NUNCA usar tabela alunos ao vivo para KPIs executivos de mês fechado
  // - NUNCA usar fallback silencioso que muda a semântica dos dados
  // - Se dados indisponíveis: retornar null, não zero, não dado de outra competência
  // - Ticket médio consolidado SEMPRE ponderado por pagantes

  return { ...result, fonte, competenciaFechada, alertasFonte, isLoading, error, refetch };
}

function gerarAlertasFonte(fonte: FonteKPI, label: string): string[] {
  switch (fonte) {
    case 'dados_mensais':
      return [`Snapshot histórico de ${label} — imutável`];
    case 'vivo':
      return [`Mês em andamento — dados calculados em tempo real`];
    case 'preliminar':
      return [
        `Competência ${label} ainda não fechada`,
        'Dados podem divergir do fechamento oficial',
      ];
    case 'indisponivel':
      return ['Status de competência indisponível'];
  }
}
```

### Contrato de integração com componentes

```typescript
// Uso em DashboardPage:
const kpis = useKPIsAlunosCanonicos({
  unidadeId: unidade,
  ano,
  mes: mesInicio,
  mesFim,
});

// Exibir alerta de fonte:
{kpis.alertasFonte.map(alerta => (
  <Badge key={alerta} variant={kpis.fonte === 'dados_mensais' ? 'success' : 'warning'}>
    {alerta}
  </Badge>
))}

// KPICard com dado possivelmente null:
<KPICard
  value={kpis.alunosPagantes ?? '--'}
  subvalue={kpis.fonte === 'indisponivel' ? 'Dados indisponíveis' : undefined}
/>
```

---

## 10. Plano de Patch em Fases

### Fase A — Auditoria (este relatório) ✓ Concluída

### Fase B — Implementação

**B1 — Hook canônico `useKPIsAlunosCanonicos` (2 dias)**
- Implementar conforme seção 9
- Integrar com `useCompetenciaMensalStatus` existente
- Sem alterar nenhuma página ainda
- Testes unitários: todos os cenários da seção 11

**B2 — Patch `useKPIsGestao` (0,5 dia)**

Arquivo: `src/hooks/useKPIsGestao.ts`, linha 58

```typescript
// ANTES:
const fetchData = useCallback(async () => {
  // sempre usa vw_kpis_gestao_mensal

// DEPOIS — adicionar antes da query:
const { status: competenciaStatus } = await supabase
  .from('competencias_mensais')
  .select('status')
  .eq('ano', currentYear)
  .eq('mes', currentMonth)
  .maybeSingle();

const isFechado = competenciaStatus?.status === 'fechado' || competenciaStatus?.status === 'retificacao_pendente';

if (isFechado) {
  // usar dados_mensais diretamente (já existe o código do fallback — mover para cá)
} else {
  // usar vw_kpis_gestao_mensal como atualmente
}
```

**B3 — Patch `useKPIsRetencao` (0,5 dia)**

Arquivo: `src/hooks/useKPIsRetencao.ts`, linha 161

```typescript
// ANTES:
const fetchFromTables = async () => { /* recalcula ao vivo */ }

// DEPOIS — substituir por:
const fetchFromDadosMensais = async () => {
  const { data } = await supabase
    .from('dados_mensais')
    .select('evasoes, churn_rate, taxa_renovacao, novas_matriculas')
    .eq('ano', currentYear)
    .eq('mes', currentMonth);
  if (data && data.length > 0) {
    // usar campos de dados_mensais
  } else {
    setData(null); // indisponível — não inventar
  }
};
```

**B4 — Patch `DashboardPage` (1 dia)**

Arquivo: `src/components/App/Dashboard/DashboardPage.tsx`
- Substituir flag `isPeriodoAtual` por integração com `useCompetenciaMensalStatus`
- Eliminar o bloco de fallback `alunos` ao vivo (linhas 406–466) para períodos históricos
- Substituir por exibição de "Dados indisponíveis para este período" quando sem snapshot

**B5 — Patch `TabCarteiraProfessores` (0,5 dia)**

Arquivo: `src/components/App/Professores/TabCarteiraProfessores.tsx`
- Remover cálculo derivado `round(mrr/ticket)` das linhas 292–297
- Solicitar campo explícito `alunos_pagantes` na RPC `get_carteira_professores`
- Adicionar badge "Carteira ao vivo — [mês atual]" nos KPIs consolidados

**B6 — Auditoria SQL `get_programa_fideliza_dados` (0,5 dia)**
- Verificar se agrega `dados_mensais` ou views ao vivo para meses do trimestre
- Se ao vivo para trimestre parcialmente fechado: corrigir para usar `dados_mensais` nos meses fechados

**B7 — Correção ticket médio consolidado (0,5 dia)**

Arquivo: `src/hooks/useKPIsGestao.ts`, linha 93

```typescript
// ANTES (média aritmética):
ticket_medio: kpisData.reduce((acc, k) => acc + (k.ticket_medio || 0), 0) / kpisData.length,

// DEPOIS (média ponderada por pagantes):
ticket_medio: (() => {
  const totalPagantes = kpisData.reduce((acc, k) => acc + (k.total_alunos_pagantes || 0), 0);
  if (totalPagantes === 0) return 0;
  return kpisData.reduce((acc, k) => acc + ((k.ticket_medio || 0) * (k.total_alunos_pagantes || 0)), 0) / totalPagantes;
})(),
```

### Fase C — QA

Ver checklist na seção 11.

---

## 11. Checklist de QA

```
CENÁRIO 1: CG/Maio 2026 (FECHADO)
[ ] Dashboard "Pagantes" exibe 470 (não ~449)
[ ] Dashboard "Ticket Médio" exibe R$368,66 (não valor ao vivo)
[ ] Dashboard "Churn" exibe 2,77%
[ ] Dashboard "Evasões" exibe 13
[ ] GestaoMensal exibe os mesmos 4 valores acima
[ ] DashboardPage exibe badge "Snapshot histórico de Mai/2026 — imutável"
[ ] Professores Carteira exibe badge "Carteira ao vivo — [mês atual]" (não confunde com Maio)
[ ] Troca para Jun/2026: Dashboard muda para dados ao vivo e exibe badge "Mês em andamento"

CENÁRIO 2: Consolidado 3 unidades — Maio 2026 (FECHADO)
[ ] Dashboard soma pagantes das 3 unidades de dados_mensais
[ ] Ticket médio consolidado é PONDERADO por pagantes (não média aritmética)
[ ] MRR = SUM(pagantes * ticket) por unidade, somado
[ ] Churn = média simples dos 3 churn_rate

CENÁRIO 3: Mês atual aberto (Jun/2026)
[ ] Dashboard exibe badge "Mês em andamento"
[ ] Valores atualizam em tempo real (view viva)
[ ] Botão Recalcular em AlunosPage habilitado

CENÁRIO 4: Mês passado sem snapshot (ex: competência aberta sem dados_mensais)
[ ] Dashboard exibe "Dados preliminares — competência ainda não fechada"
[ ] NÃO exibe zeros (não confunde com dado real)
[ ] NÃO recalcula de alunos ao vivo silenciosamente

CENÁRIO 5: Troca de unidade
[ ] Dados atualizam imediatamente para nova unidade
[ ] Nenhum dado da unidade anterior persiste

CENÁRIO 6: Troca de competência
[ ] Fonte muda corretamente: fechado→dados_mensais, aberto→vivo, passado sem snapshot→preliminar
[ ] Badge de fonte atualiza

CENÁRIO 7: Gráfico vs cards (mesmo mês histórico)
[ ] Valor do ponto no gráfico Evolução igual ao valor do card Pagantes para o mesmo mês
[ ] Ponto do mês atual: gráfico usa vw_dashboard_unidade = card usa mesma fonte
[ ] Ao fechar competência: ponto do gráfico deve mudar de ao-vivo para snapshot

CENÁRIO 8: Fideliza+ trimestre fechado
[ ] Ranking do Q1/2026 usa programa_fideliza_historico (snapshot), não ao vivo
[ ] Ranking do Q2/2026 (em andamento) exibe badge "Em andamento"
[ ] Cálculo de pontuação é idêntico se feito em JS vs RPC

CENÁRIO 9: AlunosPage operacional
[ ] KPIs mostram carteira ao vivo (449 CG)
[ ] Badge "Dados operacionais" visível quando competência selecionada está fechada
[ ] Botão Recalcular bloqueado para competência fechada com tooltip correto

CENÁRIO 10: Professores Carteira
[ ] pagantes consolidados = campo explícito da RPC (não round(mrr/ticket))
[ ] Badge "ao vivo" indica que não é dado histórico
```

---

## 12. Decisões Pendentes para o Alf

### D1 — AlunosPage: KPIs operacionais devem mostrar badge quando competência fechada?

**Situação atual:** 449 pagantes ao vivo, sem indicação de que a competência Mai/2026 está fechada com 470 no snapshot.

**Opção A:** Adicionar badge "Dados operacionais — ao vivo" no header quando competência fechada. Mantém propósito operacional, mas informa que o número difere do relatório.

**Opção B:** Para competência fechada, mostrar os dois números: "449 ao vivo / 470 no fechamento".

**Recomendação:** Opção A — menos invasivo, preserva UX operacional.

### D2 — Professores Carteira: adicionar filtro temporal ou manter "ao vivo"?

**Situação atual:** Carteira sempre ao vivo, sem dimensão temporal.

**Opção A:** Adicionar seletor de competência com dados de `dados_mensais` para MRR/ticket quando fechado.

**Opção B:** Manter explicitamente ao vivo com badge "Carteira Jun/2026 — ao vivo".

**Recomendação:** Opção B para curto prazo (menor esforço); Opção A para versão futura do módulo de professores.

### D3 — Fideliza+ RPC: auditar SQL antes ou depois de fechar Q2/2026?

**Risco de não auditar:** Q2/2026 fecha em Junho. Se RPC usa views ao vivo para calcular churn dos meses do trimestre, o ranking final de Q2 será calculado sobre carteira de Julho (quando o snapshot for tirado), não sobre os valores reais de Abril-Junho.

**Recomendação:** Auditar ANTES do fechamento de Q2/2026 (urgente — prazo: antes de 30/06/2026).

### D4 — Gráfico evolução: ponto atual deve usar snapshot quando disponível?

**Situação atual:** Ponto do mês atual sempre de `vw_dashboard_unidade` ao vivo. Se o mês corrente for fechado, o ponto do gráfico ainda usa ao vivo.

**Recomendação:** Se `dados_mensais` tem snapshot para o mês corrente, usar snapshot para manter consistência com pontos históricos. Implementar em B4.

### D5 — Ticket médio consolidado: corrigir ponderação em todos os hooks?

**Situação atual:** `useKPIsGestao` linha 93 usa média aritmética. `DashboardPage` linha 477 já usa ponderada.

**Recomendação:** Padronizar para ponderada em todos os lugares. Implementar em B7 juntamente com hook canônico.

---

## Anexo A — Mapa de Arquivos Auditados

| Arquivo | Linhas auditadas | Classificação final |
|---------|-----------------|---------------------|
| `src/hooks/useKPIsGestao.ts` | 1–188 (completo) | ❌ Errado (view viva + ticket não ponderado) |
| `src/hooks/useDadosMensais.ts` | 1–150 (completo) | ✅ OK |
| `src/hooks/useCompetenciaFiltro.ts` | 1–263 (completo) | ✅ OK |
| `src/hooks/useCompetenciaMensalStatus.ts` | 1–223 (completo) | ✅ OK |
| `src/hooks/useFidelizaPrograma.ts` | 1–489 (completo) | ⚠️ Parcial (RPC SQL não auditada) |
| `src/hooks/useKPIsRetencao.ts` | 1–284 (completo) | ❌ Errado (fallback ao vivo crítico) |
| `src/components/App/Dashboard/DashboardPage.tsx` | 1–1468 (completo) | ❌/⚠️ Misto (6 erros, ver seções 5 e 6) |
| `src/components/App/Alunos/AlunosPage.tsx` | 1–1766 (completo) | ❓ Indefinido (operacional — ver D1) |
| `src/components/App/Professores/TabCarteiraProfessores.tsx` | 1–695 (completo) | ❌ Errado (pagantes derivados, sem temporalidade) |
| `src/components/App/Administrativo/TabProgramaFideliza.tsx` | 1–120 (parcial) | ⚠️ Parcial (delega para hook) |

## Anexo B — RPC e Views Referenciadas

| Objeto | Tipo | Auditado SQL? | Usado em | Risco |
|--------|------|---------------|----------|-------|
| `vw_kpis_gestao_mensal` | View | Não | useKPIsGestao (primário) | ALTO |
| `vw_dashboard_unidade` | View | Não | DashboardPage (mês atual) | BAIXO (uso correto) |
| `vw_kpis_retencao_mensal` | View | Não | useKPIsRetencao (primário) | MÉDIO |
| `vw_kpis_comercial_historico` | View | Não | DashboardPage (histórico comercial) | BAIXO |
| `vw_turmas_implicitas` | View | Não | AlunosPage, DashboardPage | BAIXO (operacional) |
| `vw_kpis_professor_mensal` | View | Não | TabCarteiraProfessores, TabPerformance | BAIXO (professores não têm snapshot) |
| `get_kpis_consolidados` | RPC | Não | useSupabase (GestaoMensal) | BAIXO (usa dados_mensais) |
| `get_carteira_professores` | RPC | Não | TabCarteiraProfessores | ALTO (sem filtro temporal) |
| `get_programa_fideliza_dados` | RPC | Não | useFidelizaPrograma | MÉDIO (SQL desconhecido) |
| `recalcular_dados_mensais` | RPC | Não | AlunosPage, TabGestao | BAIXO (grava em dados_mensais corretamente) |
| `get_tempo_permanencia` | RPC | Não | AlunosPage | BAIXO (operacional) |
| `dados_mensais` | Tabela | N/A (fonte canônica) | useDadosMensais, DashboardPage (hist.) | N/A |
| `competencias_mensais` | Tabela | N/A | useCompetenciaMensalStatus | N/A |
