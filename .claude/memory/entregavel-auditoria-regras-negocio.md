# Entregável de Auditoria — Regras de Negócio LA Report
> Data: 2026-06-04  
> Tipo: SELECT-only / Documental — **NÃO executar DDL, DML, migration ou backfill**  
> Próxima etapa: validação com Alf antes de qualquer alteração em produção

---

## 1. DIFF DOCUMENTAL (O que mudou da versão anterior)

### De → Para

| Aspecto | Versão Anterior (pré-auditoria) | Versão Atual (pós-auditoria) |
|---------|----------------------------------|------------------------------|
| **Classificação de regras** | Todas as regras iguais, sem distinção de fonte | Regras separadas em 4 categorias: ✅ Alf, 📋 código, ❓ pendente, 🚫 legado |
| **Overclaim** | Muitas regras marcadas como ✅ "validadas pelo Alf" sem confirmação verbal | ✅ removido de regras não confirmadas; todas marcadas como 📋 "inferidas do código" |
| **Precedência** | "Se conflita com código legado, esta lista tem precedência" | "Documento antigo divergente = legado. Código divergente = possível bug. Regra validada pelo Alf = canônica." |
| **Pessoa vs Matrícula** | Regra genérica | Explicitado: `COUNT(DISTINCT nome)` para ativos/pagantes; `COUNT(*)` para matrículas |
| **View 20260531** | Considerada "correção de renovações" | Identificada como **possível bug** em ativos/pagantes (usa `COUNT(*)` em vez de `COUNT(DISTINCT nome)`) |
| **Churn** | Uma fórmula só (`evasoes / (inicio + novas)`) | 3 fórmulas detectadas: código (`/pagantes`), doc antigo (`/ativos`), canônico (`/inicio+novas`). Marcado como ❓ pendente |
| **Inadimplência** | Uma fórmula só (`(previsto - realizado)/previsto`) | 2 fórmulas detectadas: % cabeças (view) vs % valor (validação V5). Marcado como ❓ pendente |
| **Ticket Médio** | Uma fórmula só (`AVG(valor_parcela)`) | 3 fórmulas detectadas: por matrícula (view antiga), por pessoa (validação V5), não calculado (view V5). Marcado como ❓ pendente |
| **Evasões** | Fonte única implícita | 3 fontes identificadas: `evasoes_v2` (view retencao, desatualizada), `movimentacoes_admin` com dedup (view gestao), `movimentacoes_admin` sem dedup (frontend). Unificação pendente |
| **Renovações** | Fonte única implícita | Frontend busca `renovacoes` (tabela legada); view busca `movimentacoes_admin` (atual). Divergência detectada |
| **LTV** | Calculado na view antiga | View V5 **não calcula** LTV. Frontend calcula como `ticket * tempo` com dados possivelmente desatualizados |
| **Views faltando** | Não documentado | 5 views/RPCs faltando documentados: `vw_kpis_professor_mensal`, `vw_kpis_professor_completo`, `vw_kpis_professor_historico`, `get_kpis_professor_periodo`, `vw_kpis_comercial_historico` |
| **Regras implícitas** | Não documentadas | 10 regras implícitas catalogadas (R1-R10) |
| **Perguntas para Alf** | Não estruturadas | 10 perguntas prioritárias catalogadas (P1-P10) |
| **Checklist de ações** | Não existia | 11 ações priorizadas (P0-P3) com responsável e impacto |

### Regras que mudaram de status

| Regra | Status Anterior | Status Atual | Motivo |
|-------|-----------------|--------------|--------|
| Churn Rate | Canônica | ❓ Pendente | 3 fórmulas diferentes detectadas |
| Taxa Renovação | Canônica | ❓ Pendente | Canônico inclui `aviso_previo`; código não inclui |
| Inadimplência | Canônica | ❓ Pendente | View calcula % cabeças; validação propõe % valor |
| Ticket Médio | Canônica | ❓ Pendente | 3 definições diferentes; view V5 não calcula |
| Evasões (fonte) | Implícita | 📋 Inferida | `evasoes_v2` identificada como desatualizada |
| LTV | Canônica | 📋 Inferida | View V5 não calcula; frontend usa fallback |
| Kids/School (fonte) | Canônica | ❓ Pendente | `idade_atual` vs `classificacao` divergem |

---

### Nota sobre Identidade Operacional

📋 **Identidade operacional da pessoa = `LOWER(TRIM(nome)) + unidade_id`**.
- Só `nome` pode colidir (dois "João Silva" na mesma unidade).
- O banco usa `nome` em algumas CTEs (view V5) e `nome + data_nascimento + unidade_id` em outras (view 20260531).
- **Recomendação futura:** evoluir para chave real (ex: CPF ou UUID de pessoa), mas hoje o sistema opera com `nome`.

---

## 2. LISTA DE RISCOS

### Riscos de Regressão (já presentes no código)

| ID | Risco | Severidade | Evidência | Impacto se não corrigir |
|----|-------|------------|-----------|------------------------|
| R-01 | **View 20260531 conta linhas em vez de pessoas** para ativos/pagantes | **CRÍTICO** | `supabase/migrations/20260531_fix_renovacoes_reajuste_views.sql` linha 52-53: `count(*) FILTER ... AS total_alunos` e `AS alunos_pagantes` | Dashboard pode inflar número de ativos/pagantes em até 2x se houver muitos alunos com 2 cursos. Meta de "churn máximo 5%" fica mais difícil de atingir (base maior). |
| R-02 | **Frontend não deduplica evasões** | **CRÍTICO** | `src/components/GestaoMensal/TabGestao.tsx` linha 784: `.in('tipo', ['evasao', 'nao_renovacao'])` sem DISTINCT ON | Mesma pessoa evadida 2x no mês = conta 2x no frontend, 1x no banco. Usuário vê número inconsistente. |
| R-03 | **View `vw_kpis_retencao_mensal` usa `evasoes_v2` (desatualizada)** | **CRÍTICO** | `supabase/migrations/fase3_views_kpis.sql` linha 231: `FROM evasoes_v2` | Dashboard e relatórios de retenção mostram números desatualizados. Evasões recentes podem não aparecer. |
| R-04 | **Frontend busca renovações de `renovacoes` (tabela legada)** | **ALTO** | `src/components/GestaoMensal/TabGestao.tsx` linha 630: renovações de `renovacoes` table | Se `renovacoes` não for sincronizada com `movimentacoes_admin`, taxa de renovação fica incorreta. |
| R-05 | **View V5 não calcula ticket médio nem LTV** | **ALTO** | `docs/MIGRACAO_REGLA_KPI_V5_ALUNOS.sql` linha 118: comentário "NÃO validar/alterar ticket agora" | MRR, ARR, LTV e todas as metas financeiras downstream usam dados desatualizados. |
| R-06 | **Dashboard mistura tempo real + snapshot** | **ALTO** | `vw_dashboard_unidade` junta `alunos` (tempo real) com `dados_mensais` (snapshot) | No mês de transição (ex: fechamento de Maio em 1º de Junho), números do dashboard podem parecer inconsistentes sem explicação. |
| R-07 | **Churn: 3 fórmulas diferentes** | **ALTO** | Código: `evasoes/pagantes`; Doc KPIs: `evasoes/ativos`; Canônico: `evasoes/(inicio+novas)` | Meta corporativa "churn máximo 5%" pode ser avaliada com base errada. Sem saber qual fórmula usar, impossível auditar. |
| R-08 | **Inadimplência: 2 métricas diferentes** | **MÉDIO** | View: % cabeças; Validação V5: % valor | Mesmo "5% de inadimplência" pode significar coisas diferentes no dashboard vs no relatório financeiro. |
| R-09 | **Views/RPCs de professor faltando** | **ALTO** | `vw_kpis_professor_mensal`, `vw_kpis_professor_completo`, `get_kpis_professor_periodo` referenciados mas não existem | Páginas de performance de professores podem falhar ou mostrar dados inconsistentes via fallbacks. |
| R-10 | **Experimentais filtradas por `data_contato` em vez de `data_experimental_realizada`** | **MÉDIO** | `supabase/migrations/fase3_views_kpis.sql` linha 100: `EXTRACT(MONTH FROM data_contato)` | Aula experimental agendada em Maio e realizada em Junho conta em Maio (errado). |
| R-11 | **Regra "canto coral" baseada em nome** | **MÉDIO** | `c.nome NOT ILIKE '%canto coral%'` em múltiplas queries | Se nome do curso mudar ("Coral Infantil"), regra quebra silenciosamente. |
| R-12 | **Kids/School: `idade_atual` vs `classificacao`** | **MÉDIO** | Frontend usa `idade_atual`; banco (carteira) usa `classificacao` | Aluno faz aniversário, `classificacao` não é atualizada → carteira do professor mostra classificação errada. |
| R-13 | **Assimetria experimental/matricula pode gerar taxa > 100%** | **MÉDIO** | `ModalDetalhesConversao.tsx`: numerador aceita matrícula sem experimental | Taxa de conversão de professor > 100% confunde usuários. Ex: Willian T1 2026 = 200%. |
| R-14 | **Snapshot `dados_mensais` pode ficar desatualizado** | **MÉDIO** | `recalcular_dados_mensais` precisa ser chamada manualmente | Se não rodar no fim do mês, histórico fica incorreto. Usuário não sabe quando foi a última atualização. |
| R-15 | **Health score depende de limites configuráveis** | **BAIXO** | `calcular_health_score_aluno`: `limite_saudavel` e `limite_atencao` são configuráveis | Se limites mudarem, classificação de alunos muda sem aviso. |

---

## 3. SELECTs DE VALIDAÇÃO (SELECT-only)

> **Instrução:** Rodar no SQL Editor do Supabase. Nenhum comando altera dados.  
> **Objetivo:** Validar divergências antes de qualquer correção.  
> **Unidade prioritária:** Campo Grande (CG). Depois Barra, Recreio.

### 3.1 Validar Pessoa vs Linha em Alunos Ativos

```sql
-- Q1: Diferença entre COUNT(DISTINCT nome) e COUNT(*) para ativos CG
SELECT
  u.nome AS unidade,
  COUNT(DISTINCT a.nome) AS ativos_pessoa_level,
  COUNT(*) FILTER (WHERE COALESCE(a.is_segundo_curso, false) = false) AS ativos_linha_level_view20260531
FROM alunos a
JOIN unidades u ON u.id = a.unidade_id
WHERE a.status IN ('ativo', 'trancado')
  AND u.nome ILIKE '%campo grande%'
GROUP BY u.nome;
-- Esperado: se ativos_linha_level > ativos_pessoa_level, confirmar divergencia R-01
```

### 3.2 Validar Pagantes: Pessoa vs Linha

```sql
-- Q2: Pagantes pessoa-level vs linha-level CG
SELECT
  u.nome AS unidade,
  COUNT(DISTINCT a.nome) FILTER (
    WHERE tm.conta_como_pagante = true
      AND a.valor_parcela > 0
  ) AS pagantes_pessoa_level,
  COUNT(*) FILTER (
    WHERE tm.conta_como_pagante = true
      AND a.valor_parcela > 0
      AND COALESCE(a.is_segundo_curso, false) = false
  ) AS pagantes_linha_level_view20260531
FROM alunos a
LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
JOIN unidades u ON u.id = a.unidade_id
WHERE a.status IN ('ativo', 'trancado')
  AND u.nome ILIKE '%campo grande%'
GROUP BY u.nome;
-- Esperado: se linha_level > pessoa_level, confirmar divergencia R-01
```

### 3.3 Validar Evasões: 3 Fontes

```sql
-- Q3a: Evasões por movimentacoes_admin (fonte atual) — CG, mês atual
SELECT
  u.nome AS unidade,
  COUNT(*) AS evasoes_sem_dedup,
  COUNT(DISTINCT LOWER(TRIM(BOTH FROM m.aluno_nome))) AS evasoes_com_dedup_por_nome
FROM movimentacoes_admin m
JOIN unidades u ON u.id = m.unidade_id
WHERE m.tipo IN ('evasao', 'nao_renovacao')
  AND EXTRACT(YEAR FROM m.data) = EXTRACT(YEAR FROM CURRENT_DATE)
  AND EXTRACT(MONTH FROM m.data) = EXTRACT(MONTH FROM CURRENT_DATE)
  AND u.nome ILIKE '%campo grande%'
GROUP BY u.nome;

-- Q3b: Evasões por evasoes_v2 (fonte view retencao) — CG, mês atual
SELECT
  u.nome AS unidade,
  COUNT(*) AS evasoes_v2
FROM evasoes_v2 e
JOIN unidades u ON u.id = e.unidade_id
WHERE EXTRACT(YEAR FROM e.data_saida) = EXTRACT(YEAR FROM CURRENT_DATE)
  AND EXTRACT(MONTH FROM e.data_saida) = EXTRACT(MONTH FROM CURRENT_DATE)
  AND u.nome ILIKE '%campo grande%'
GROUP BY u.nome;
-- Esperado: se Q3a.evasoes_sem_dedup != Q3b.evasoes_v2, confirmar divergencia R-02/R-03
```

### 3.4 Validar Churn com 3 Fórmulas

```sql
-- Q4: Churn com 3 bases diferentes — CG, mês fechado (ex: Maio 2026)
WITH params AS (
  SELECT DATE '2026-05-01' AS inicio_mes, DATE '2026-05-31' AS fim_mes
),
ev AS (
  SELECT COUNT(DISTINCT LOWER(TRIM(BOTH FROM m.aluno_nome))) AS evasoes
  FROM movimentacoes_admin m
  CROSS JOIN params p
  WHERE m.tipo IN ('evasao', 'nao_renovacao')
    AND m.data >= p.inicio_mes AND m.data < (p.fim_mes + INTERVAL '1 day')
    AND m.unidade_id = (SELECT id FROM unidades WHERE nome ILIKE '%campo grande%')
),
pag AS (
  SELECT COUNT(DISTINCT a.nome) AS pagantes
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  CROSS JOIN params p
  WHERE a.unidade_id = (SELECT id FROM unidades WHERE nome ILIKE '%campo grande%')
    AND a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= p.fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > p.fim_mes)
    AND tm.conta_como_pagante = true
),
ati AS (
  SELECT COUNT(DISTINCT a.nome) AS ativos
  FROM alunos a
  CROSS JOIN params p
  WHERE a.unidade_id = (SELECT id FROM unidades WHERE nome ILIKE '%campo grande%')
    AND a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= p.fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > p.fim_mes)
),
nov AS (
  SELECT COUNT(*) AS novas
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  LEFT JOIN cursos c ON c.id = a.curso_id
  CROSS JOIN params p
  WHERE a.unidade_id = (SELECT id FROM unidades WHERE nome ILIKE '%campo grande%')
    AND a.status IN ('ativo', 'trancado')
    AND a.data_matricula >= p.inicio_mes AND a.data_matricula <= p.fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > p.fim_mes)
    AND COALESCE(a.is_segundo_curso, false) = false
    AND COALESCE(c.is_projeto_banda, false) = false
    AND (c.nome IS NULL OR c.nome NOT ILIKE '%canto coral%')
    AND (tm.codigo IS NULL OR tm.codigo NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC'))
)
SELECT
  'CG Maio 2026' AS cenario,
  e.evasoes,
  p.pagantes,
  a.ativos,
  n.novas,
  ROUND(e.evasoes::numeric / NULLIF(p.pagantes, 0) * 100, 2) AS churn_por_pagantes,
  ROUND(e.evasoes::numeric / NULLIF(a.ativos, 0) * 100, 2) AS churn_por_ativos,
  (SELECT ROUND(evasoes::numeric / NULLIF(ativos + novas, 0) * 100, 2) FROM ev, ati, nov) AS churn_por_ativos_mais_novas
FROM ev e, pag p, ati a, nov n;
-- CORRECAO: cross join intencional pois cada CTE retorna exatamente 1 linha.
-- Se preferir evitar virgula, use: SELECT ... FROM ev CROSS JOIN pag CROSS JOIN ati CROSS JOIN nov
-- Esperado: comparar os 3 valores. Perguntar ao Alf qual é o correto.
```

### 3.5 Validar Inadimplência: Cabeça vs Valor

```sql
-- Q5: Inadimplência % cabeças vs % valor — CG, mês atual
SELECT
  u.nome AS unidade,
  COUNT(DISTINCT a.nome) FILTER (WHERE a.status_pagamento = 'inadimplente') AS inadimplentes_cabeca,
  COUNT(DISTINCT a.nome) FILTER (WHERE tm.conta_como_pagante = true) AS total_pagantes,
  ROUND(
    COUNT(DISTINCT a.nome) FILTER (WHERE a.status_pagamento = 'inadimplente')::numeric
    / NULLIF(COUNT(DISTINCT a.nome) FILTER (WHERE tm.conta_como_pagante = true), 0) * 100,
    2
  ) AS inadimplencia_pct_cabeca,
  COALESCE(SUM(a.valor_parcela) FILTER (WHERE a.status_pagamento = 'inadimplente' AND tm.conta_como_pagante = true), 0) AS mrr_inadimplente,
  COALESCE(SUM(a.valor_parcela) FILTER (WHERE tm.conta_como_pagante = true AND a.valor_parcela > 0), 0) AS mrr_total,
  CASE WHEN COALESCE(SUM(a.valor_parcela) FILTER (WHERE tm.conta_como_pagante = true AND a.valor_parcela > 0), 0) > 0
    THEN ROUND(
      COALESCE(SUM(a.valor_parcela) FILTER (WHERE a.status_pagamento = 'inadimplente' AND tm.conta_como_pagante = true), 0)::numeric
      / SUM(a.valor_parcela) FILTER (WHERE tm.conta_como_pagante = true AND a.valor_parcela > 0) * 100,
      2
    )
    ELSE 0
  END AS inadimplencia_pct_valor
FROM alunos a
LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
JOIN unidades u ON u.id = a.unidade_id
WHERE a.status IN ('ativo', 'trancado')
  AND u.nome ILIKE '%campo grande%'
GROUP BY u.nome;
-- Esperado: comparar % cabeça vs % valor. Perguntar ao Alf qual é o correto.
```

### 3.6 Validar Ticket Médio: Por Pessoa vs Por Matrícula

```sql
-- Q6: Ticket médio por pessoa vs por matrícula — CG, snapshot atual
WITH por_pessoa AS (
  SELECT a.nome, SUM(a.valor_parcela) AS valor_total
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  JOIN unidades u ON u.id = a.unidade_id
  WHERE a.status IN ('ativo', 'trancado')
    AND tm.conta_como_pagante = true
    AND a.valor_parcela > 0
    AND u.nome ILIKE '%campo grande%'
  GROUP BY a.nome
),
por_matricula AS (
  SELECT a.valor_parcela
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  JOIN unidades u ON u.id = a.unidade_id
  WHERE a.status IN ('ativo', 'trancado')
    AND tm.conta_como_pagante = true
    AND a.valor_parcela > 0
    AND COALESCE(a.is_segundo_curso, false) = false
    AND u.nome ILIKE '%campo grande%'
)
SELECT
  'CG Atual' AS cenario,
  (SELECT ROUND(AVG(valor_total), 2) FROM por_pessoa) AS ticket_por_pessoa,
  (SELECT ROUND(AVG(valor_parcela), 2) FROM por_matricula) AS ticket_por_matricula,
  (SELECT ROUND(AVG(valor_total), 2) FROM por_pessoa)
    - (SELECT ROUND(AVG(valor_parcela), 2) FROM por_matricula) AS diferenca;
-- CORREÇÃO: versão anterior usava FROM por_pessoa pp, por_matricula pm (cross join).
-- Como cada subquery retorna escalar, evita produto cartesiano.
-- Esperado: se diferenca > 0, confirmar que ticket por pessoa e por matrícula divergem.
-- Perguntar ao Alf qual usar.
```

### 3.7 Validar Kids/School: Idade vs Classificação

```sql
-- Q7: Divergência entre idade_atual e classificacao — CG
SELECT
  a.nome,
  a.idade_atual,
  a.classificacao,
  CASE
    WHEN a.idade_atual <= 11 AND a.classificacao != 'LAMK' THEN 'DIVERGENTE: deveria ser LAMK'
    WHEN a.idade_atual >= 12 AND a.classificacao != 'EMLA' THEN 'DIVERGENTE: deveria ser EMLA'
    ELSE 'OK'
  END AS status
FROM alunos a
JOIN unidades u ON u.id = a.unidade_id
WHERE a.status IN ('ativo', 'trancado')
  AND a.idade_atual IS NOT NULL
  AND u.nome ILIKE '%campo grande%'
  AND (
    (a.idade_atual <= 11 AND a.classificacao != 'LAMK')
    OR (a.idade_atual >= 12 AND a.classificacao != 'EMLA')
  )
ORDER BY a.nome
LIMIT 20;
-- Esperado: lista de alunos onde idade e classificacao divergem.
-- Se > 0, confirmar necessidade de sincronizar classificacao com idade.
```

### 3.8 Validar Views Faltando

```sql
-- Q8: Verificar existência de views e functions criticas
SELECT
  c.relname AS objeto,
  CASE c.relkind
    WHEN 'v' THEN 'VIEW'
    WHEN 'm' THEN 'MATERIALIZED VIEW'
  END AS tipo,
  n.nspname AS schema
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'vw_kpis_professor_mensal',
    'vw_kpis_professor_completo',
    'vw_kpis_professor_historico',
    'vw_kpis_comercial_historico'
  )
  AND c.relkind IN ('v', 'm')
UNION ALL
SELECT
  p.proname AS objeto,
  'FUNCTION' AS tipo,
  n.nspname AS schema
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'get_kpis_professor_periodo';
-- Esperado: se retornar 0 rows, confirmar que views/functions faltam.
```

### 3.9 Validar Snapshot vs Tempo Real (dados_mensais desatualizado?)

```sql
-- Q9: Comparar dados_mensais vs snapshot operacional — CG, mês corrente
WITH params AS (
  SELECT
    DATE_TRUNC('month', CURRENT_DATE)::date AS inicio_mes,
    (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date AS fim_mes
),
snapshot_operacional AS (
  SELECT
    COUNT(DISTINCT a.nome) AS ativos,
    COUNT(DISTINCT a.nome) FILTER (WHERE tm.conta_como_pagante = true AND a.valor_parcela > 0) AS pagantes
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  CROSS JOIN params p
  WHERE a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= p.fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > p.fim_mes)
    AND a.unidade_id = (SELECT id FROM unidades WHERE nome ILIKE '%campo grande%')
)
SELECT
  'CG Mês Atual' AS cenario,
  dm.alunos_ativos AS dados_mensais_ativos,
  so.ativos AS snapshot_operacional_ativos,
  dm.alunos_pagantes AS dados_mensais_pagantes,
  so.pagantes AS snapshot_operacional_pagantes,
  dm.alunos_ativos - so.ativos AS diff_ativos,
  dm.alunos_pagantes - so.pagantes AS diff_pagantes
FROM dados_mensais dm, snapshot_operacional so
WHERE dm.unidade_id = (SELECT id FROM unidades WHERE nome ILIKE '%campo grande%')
  AND dm.ano = EXTRACT(YEAR FROM CURRENT_DATE)
  AND dm.mes = EXTRACT(MONTH FROM CURRENT_DATE);
-- Esperado: se diff != 0, dados_mensais está desatualizado ou há divergência de regra.
```

---

## 4. PLANO FASEADO POR UNIDADE

> **Princípio:** Validar primeiro, corrigir depois.  
> **Proibição:** Nenhuma execução de DDL (CREATE/DROP/ALTER), DML (UPDATE/DELETE/INSERT), migration ou backfill sem aprovação explícita do Alf.  
> **Ferramenta:** SQL Editor do Supabase em modo SELECT-only.

### Fase 0: Preparação (1-2 dias)
- [ ] Executar SELECTs Q1-Q9 acima para **Campo Grande**
- [ ] Documentar resultados em `.claude/memory/auditoria-cg-2026-06.md`
- [ ] Submeter P1-P10 ao Alf para validação
- [ ] Aguardar respostas antes de prosseguir

### Fase 1: Campo Grande (CG) — Validação (3-5 dias)
- [ ] Executar todos os SELECTs Q1-Q9 para CG
- [ ] Mapear divergências específicas de CG (ex: banda, coral, bolsistas)
- [ ] Validar números esperados com Alf (ativos, pagantes, evasões, churn, ticket)
- [ ] Documentar: "CG está OK" ou "CG precisa de retificação em X, Y, Z"
- [ ] **NÃO executar correções** — apenas validar e documentar

### Fase 2: Campo Grande — Correção Documental (2-3 dias)
- [ ] Atualizar `regras-negocio-canonicas.md` com respostas do Alf (mover ❓ para ✅ ou 🚫)
- [ ] Atualizar `SKILL.md` com mesmas classificações
- [ ] Gerar script de validação SELECT-only para confirmar que regras corrigidas batem
- [ ] **NÃO alterar banco** — apenas documentação

### Fase 3: Barra da Tijuca — Validação (2-3 dias)
- [ ] Executar SELECTs Q1-Q9 para Barra
- [ ] Comparar com CG: mesmas regras se aplicam?
- [ ] Identificar peculiaridades de Barra (ex: mais banda, mais bolsistas)
- [ ] Documentar divergências específicas de Barra

### Fase 4: Recreio — Validação (2-3 dias)
- [ ] Executar SELECTs Q1-Q9 para Recreio
- [ ] Comparar com CG e Barra
- [ ] Documentar divergências específicas de Recreio

### Fase 5: Consolidação e Decisão (2-3 dias)
- [ ] Consolidar resultados das 3 unidades
- [ ] Priorizar divergências comuns vs específicas
- [ ] Submeter plano de correção (SQL) ao Alf para aprovação
- [ ] **SÓ APÓS APROVAÇÃO:** criar migration SQL (nunca executar direto em produção)

### Fase 6: Correção em Produção (após aprovação)
- [ ] Executar migration em ambiente de teste primeiro
- [ ] Validar com SELECTs pós-migration
- [ ] Executar em produção com acompanhamento
- [ ] Documentar resultado

---

## 5. PROMPT FECHADO PARA CASCADE/WINDSURF

```
# Contexto
Você está trabalhando no LA Music Performance Report. Uma auditoria de regras de negócio foi concluída e identificou divergências críticas entre views SQL, RPCs e frontend.

# Regras de Ouro (nunca quebrar)
1. NÃO alterar banco, view, RPC ou migration sem aprovação explícita do Alf.
2. NÃO executar backfill, DROP VIEW, CREATE OR REPLACE VIEW, UPDATE, DELETE ou INSERT em produção.
3. Documento antigo divergente = legado. Código divergente = possível bug. Regra validada pelo Alf = canônica.
4. Trabalhar em modo SELECT-only sempre que possível.
5. Antes de declarar qualquer painel/dashboard "correto", validar com SELECTs contra o banco.

# Documentação de referência (obrigatório ler antes de agir)
- .claude/memory/regras-negocio-canonicas.md — regras classificadas por status
- .claude/memory/auditoria-regras-negocio-2026-06-04.md — auditoria técnica completa
- .claude/memory/entregavel-auditoria-regras-negocio.md — este documento (diff, riscos, SELECTs, plano)

# Tarefas permitidas
- Gerar SELECTs de validação (SELECT-only)
- Corrigir documentação (.md files)
- Gerar scripts de migração SQL (mas NÃO executar)
- Auditar código frontend para alinhamento com regras canônicas
- Reportar divergências encontradas

# Tarefas proibidas
- Executar qualquer DDL (CREATE, DROP, ALTER) no banco
- Executar qualquer DML (UPDATE, DELETE, INSERT) no banco
- Executar CREATE OR REPLACE VIEW
- Executar backfill ou recalcular_dados_mensais
- Alterar dados em produção
- Commitar migration sem aprovação do Alf

# Próximas entregas pendentes (revisar antes de entregar qualquer coisa)
1. Revisar próximos entregáveis em modo SELECT-only
2. Auditar Barra/Recreio antes de retificação
3. Validar divergência entre vw_kpis_gestao_mensal, dados_mensais e frontend Kids/School antes de declarar painel correto

# Quando terminar
- Reportar o que foi feito
- Listar qualquer nova divergência encontrada
- NÃO declarar "está tudo correto" sem evidência de SELECT
```

---

*Entregável gerado em 2026-06-04. Próxima revisão após respostas do Alf às perguntas P1-P10.*
