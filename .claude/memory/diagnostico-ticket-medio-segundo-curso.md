# Diagnóstico: Bug Ticket Médio + Segundo Curso Bolsista

## Data: 2026-06-06
## Aprovado por: Alfredo (com 4 travas)
## Status: Patch e migration preparados, NÃO EXECUTAR

---

## 1. Diagnóstico Consolidado

### 1.1 Bug PREVENTIVO (código): tipo_matricula_id forçado ao criar 2o curso

**Onde:**
- Frontend: `ModalFichaAluno.tsx` linha 590
- Trigger: `auto_detect_segundo_curso_banda` no INSERT

**Problema:**
```typescript
const tipoMatriculaId = cursoSelecionadoEhBanda ? 5 : 2;
```
Segundo curso sempre força `tipo_matricula_id = 2` (Segundo Curso). Se o aluno principal é bolsista (3 ou 4), o segundo curso vira "Segundo Curso pagante" (`conta_como_pagante = true`), corrompendo o cadastro.

**Status atual dos dados:** Zero registros hoje com essa inconsistência. Rayane e Kailane já foram corrigidas. É um bug de **futuro** — próximo bolsista que ganhar segundo curso será afetado.

### 1.2 Bug ATIVO (cálculo): Ticket médio por LINHA em vez de por PESSOA

**Onde:** View `vw_kpis_gestao_mensal` no banco — CTE `financeiro_legado`

**O código da migration 20260531 tem a correção (`alunos_ticket` agrupando por pessoa), mas o banco está com uma versão INTERMEDIÁRIA** que usa `financeiro_legado` calculando por linha.

**Query atual no banco (errada):**
```sql
financeiro_legado AS (
  SELECT a.unidade_id,
    avg(a.valor_parcela) FILTER (WHERE tm.entra_ticket_medio = true) AS ticket_medio,
    sum(a.valor_parcela) FILTER (WHERE tm.conta_como_pagante = true) AS mrr
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.status = 'ativo'
  GROUP BY a.unidade_id
)
```

**Problema:** AVG por linha. Um aluno com 2 cursos de R$ 400 conta como 2 linhas de R$ 400, diluindo o ticket.

**Regra correta (Alf):**
- Ticket médio = soma das parcelas pagantes por PESSOA / quantidade de PESSOAS pagantes
- Agrupar por: `LOWER(TRIM(nome)) + unidade_id`
- Segundo curso entra no numerador (soma das parcelas) mas não duplica o denominador
- MRR está correto — soma todas as parcelas pagantes (inclui 2o curso)

**Dados reais do banco (2026-06-06):**

| Métrica | Valor Atual (errado) | Valor Correto | Erro |
|---------|---------------------|---------------|------|
| Ticket médio | R$ 391,69 | R$ 415,89 | **R$ 24,20 a menos** (6,18%) |
| MRR | R$ 397.478,83 | R$ 397.478,83 | Correto |
| Pessoas pagantes | 958 | 958 | Correto |

---

## 2. Correção 1: View vw_kpis_gestao_mensal (Ticket por Pessoa)

### SQL da view corrigida

```sql
CREATE OR REPLACE VIEW public.vw_kpis_gestao_mensal AS
WITH params AS (
  SELECT date_trunc('month', CURRENT_DATE)::date AS inicio_mes,
         (date_trunc('month', CURRENT_DATE) + '1 mon -1 days'::interval)::date AS fim_mes,
         EXTRACT(year FROM CURRENT_DATE)::integer AS ano,
         EXTRACT(month FROM CURRENT_DATE)::integer AS mes
),
leads_mes AS (
  SELECT l.unidade_id,
         p_1.ano,
         p_1.mes,
         sum(CASE WHEN l.status::text = ANY (ARRAY['novo', 'agendado']) THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS total_leads,
         sum(CASE WHEN l.status::text = 'experimental_agendada' THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS experimentais_agendadas,
         sum(CASE WHEN l.status::text = ANY (ARRAY['experimental_realizada', 'compareceu']) THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS experimentais_realizadas,
         sum(CASE WHEN l.status::text = 'experimental_faltou' THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS faltaram,
         sum(CASE WHEN l.arquivado = true THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS leads_arquivados
    FROM leads l
    CROSS JOIN params p_1
   WHERE l.data_contato >= p_1.inicio_mes AND l.data_contato < (p_1.fim_mes + '1 day'::interval)
   GROUP BY l.unidade_id, p_1.ano, p_1.mes
),
snapshot_base AS (
  SELECT a.unidade_id,
         a.id AS aluno_id,
         a.nome,
         a.status,
         a.data_matricula,
         a.data_saida,
         a.valor_parcela,
         a.is_segundo_curso,
         a.tipo_matricula_id,
         a.curso_id,
         tm.codigo AS tipo_matricula_codigo,
         tm.conta_como_pagante,
         tm.entra_ticket_medio,
         c.is_projeto_banda,
         c.nome AS curso_nome
    FROM alunos a
    LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
    LEFT JOIN cursos c ON c.id = a.curso_id
    CROSS JOIN params p_1
   WHERE a.status IN ('ativo', 'trancado')
     AND a.data_matricula <= p_1.fim_mes
     AND (a.data_saida IS NULL OR a.data_saida > p_1.fim_mes)
),
alunos_mes AS (
  SELECT sb.unidade_id,
         p_1.ano,
         p_1.mes,
         count(DISTINCT sb.nome) AS total_alunos,
         count(DISTINCT sb.nome) FILTER (WHERE sb.conta_como_pagante = true) AS alunos_pagantes,
         count(DISTINCT sb.nome) FILTER (WHERE sb.tipo_matricula_codigo = 'BOLSISTA_INT' AND COALESCE(sb.is_projeto_banda, false) = false AND COALESCE(sb.is_segundo_curso, false) = false) AS bolsistas_integrais,
         count(DISTINCT sb.nome) FILTER (WHERE sb.tipo_matricula_codigo = 'BOLSISTA_PARC' AND COALESCE(sb.is_projeto_banda, false) = false AND COALESCE(sb.is_segundo_curso, false) = false) AS bolsistas_parciais,
         count(*) AS matriculas_ativas,
         count(*) FILTER (WHERE sb.is_projeto_banda = true) AS total_banda,
         count(*) FILTER (WHERE COALESCE(sb.is_segundo_curso, false) = true AND COALESCE(sb.is_projeto_banda, false) = false) AS segundo_curso,
         sum(sb.valor_parcela) FILTER (WHERE sb.conta_como_pagante = true AND COALESCE(sb.status_pagamento, '') <> 'sem_parcela') AS mrr,
         count(*) FILTER (WHERE sb.status_pagamento = 'inadimplente' AND sb.conta_como_pagante = true AND COALESCE(sb.is_segundo_curso, false) = false) AS qtd_inadimplentes,
         COALESCE(sum(sb.valor_parcela) FILTER (WHERE sb.status_pagamento = 'inadimplente' AND sb.conta_como_pagante = true), 0) AS mrr_inadimplente
    FROM snapshot_base sb
    CROSS JOIN params p_1
   GROUP BY sb.unidade_id, p_1.ano, p_1.mes
),
-- >>> CORREÇÃO: Ticket médio por PESSOA (não por linha)
alunos_ticket AS (
  SELECT a.unidade_id,
         -- Chave pessoa = LOWER(TRIM(nome)) + unidade_id (Alf: não usar data_nascimento)
         (lower(trim(both from a.nome)) || '-'::text) || a.unidade_id::text AS chave_pessoa,
         sum(a.valor_parcela) FILTER (WHERE tm.entra_ticket_medio = true AND a.valor_parcela > 0) AS valor_total
    FROM alunos a
    LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
    LEFT JOIN cursos c ON c.id = a.curso_id
   WHERE a.status IN ('ativo', 'trancado')
     -- Excluir bolsistas integral/parcial
     AND (tm.codigo IS NULL OR tm.codigo NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC'))
     -- Excluir banda/projeto
     AND COALESCE(c.is_projeto_banda, false) = false
     -- Excluir coral
     AND (c.nome IS NULL OR c.nome NOT ILIKE '%canto coral%')
     -- Só entra se soma da pessoa > 0
     AND a.valor_parcela > 0
     AND tm.entra_ticket_medio = true
   GROUP BY a.unidade_id, (lower(trim(both from a.nome)) || '-'::text) || a.unidade_id::text
   HAVING sum(a.valor_parcela) FILTER (WHERE tm.entra_ticket_medio = true AND a.valor_parcela > 0) > 0
),
ticket_por_unidade AS (
  SELECT unidade_id,
         count(*) AS total_pessoas_ticket,
         sum(valor_total) AS soma_parcelas,
         avg(valor_total) AS ticket_medio_calculado
    FROM alunos_ticket
   GROUP BY unidade_id
),
permanencia_combinada AS (
  SELECT unidade_id, tempo_permanencia_meses AS meses
    FROM alunos_historico
   WHERE tempo_permanencia_meses >= 4
   UNION ALL
  SELECT a.unidade_id, a.tempo_permanencia_meses
    FROM alunos a
    LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
   WHERE a.status IN ('inativo', 'evadido')
     AND a.tempo_permanencia_meses >= 4
     AND (tm.codigo IS NULL OR tm.codigo NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA'))
     AND COALESCE(a.is_segundo_curso, false) = false
),
permanencia_calc AS (
  SELECT unidade_id, round(avg(meses), 1) AS tempo_permanencia_medio
    FROM permanencia_combinada
   GROUP BY unidade_id
),
evasoes_dedup AS (
  SELECT DISTINCT ON (lower(trim(both from m.aluno_nome)), m.unidade_id, EXTRACT(year FROM m.data), EXTRACT(month FROM m.data))
         m.id, m.aluno_id, m.unidade_id, m.data AS data_evasao, m.tipo,
         COALESCE(m.valor_parcela_evasao, m.valor_parcela_anterior) AS valor_parcela
    FROM movimentacoes_admin m
   WHERE m.tipo IN ('evasao', 'nao_renovacao')
   ORDER BY lower(trim(both from m.aluno_nome)), m.unidade_id, EXTRACT(year FROM m.data), EXTRACT(month FROM m.data), m.aluno_id DESC NULLS LAST, m.data DESC
),
evasoes_mes AS (
  SELECT unidade_id,
         EXTRACT(year FROM data_evasao)::integer AS ano,
         EXTRACT(month FROM data_evasao)::integer AS mes,
         count(*) AS total_evasoes
    FROM evasoes_dedup
   GROUP BY unidade_id, EXTRACT(year FROM data_evasao), EXTRACT(month FROM data_evasao)
),
renovacoes_mes AS (
  SELECT m.unidade_id,
         EXTRACT(year FROM m.data)::integer AS ano,
         EXTRACT(month FROM m.data)::integer AS mes,
         count(*) FILTER (WHERE m.tipo = 'renovacao') AS renovacoes,
         count(*) FILTER (WHERE m.tipo IN ('renovacao', 'nao_renovacao')) AS total_contratos,
         count(*) FILTER (WHERE m.tipo = 'nao_renovacao') AS nao_renovacoes,
         round(avg(
           ((m.valor_parcela_novo - m.valor_parcela_anterior) / NULLIF(m.valor_parcela_anterior, 0)) * 100
         ) FILTER (
           WHERE m.tipo = 'renovacao'
             AND m.valor_parcela_anterior IS NOT NULL
             AND m.valor_parcela_novo IS NOT NULL
             AND m.valor_parcela_anterior > 0
             AND m.valor_parcela_novo > m.valor_parcela_anterior
         ), 2) AS reajuste_medio
    FROM movimentacoes_admin m
   WHERE m.tipo IN ('renovacao', 'nao_renovacao')
   GROUP BY m.unidade_id, EXTRACT(year FROM m.data), EXTRACT(month FROM m.data)
)
SELECT u.id AS unidade_id,
       u.nome AS unidade_nome,
       COALESCE(lm.ano, am.ano, EXTRACT(year FROM CURRENT_DATE)::integer) AS ano,
       COALESCE(lm.mes, am.mes, EXTRACT(month FROM CURRENT_DATE)::integer) AS mes,
       COALESCE(am.total_alunos, 0)::integer AS total_alunos_ativos,
       COALESCE(am.alunos_pagantes, 0)::integer AS total_alunos_pagantes,
       COALESCE(am.bolsistas_integrais, 0)::integer AS total_bolsistas_integrais,
       COALESCE(am.bolsistas_parciais, 0)::integer AS total_bolsistas_parciais,
       COALESCE(am.total_banda, 0)::integer AS total_banda,
       COALESCE(am.segundo_curso, 0)::integer AS total_segundo_curso,
       -- >>> CORREÇÃO: Ticket médio por pessoa (não por linha)
       COALESCE(tu.ticket_medio_calculado, 0)::numeric(10,2) AS ticket_medio,
       COALESCE(am.mrr, 0)::numeric(12,2) AS mrr,
       (COALESCE(am.mrr, 0) * 12)::numeric(14,2) AS arr,
       COALESCE(pc.tempo_permanencia_medio, 0)::numeric(5,1) AS tempo_permanencia_medio,
       (COALESCE(tu.ticket_medio_calculado, 0) * COALESCE(pc.tempo_permanencia_medio, 0))::numeric(12,2) AS ltv_medio,
       0::numeric(5,2) AS inadimplencia_pct,
       COALESCE(am.mrr, 0)::numeric(12,2) AS faturamento_previsto,
       COALESCE(am.mrr, 0)::numeric(12,2) AS faturamento_realizado,
       COALESCE(lm.total_leads, 0)::integer AS total_leads,
       COALESCE(lm.experimentais_agendadas, 0)::integer AS experimentais_agendadas,
       COALESCE(lm.experimentais_realizadas, 0)::integer AS experimentais_realizadas,
       0::integer AS novas_matriculas, -- será removido ou calculado via matriculas_mes
       COALESCE(em.total_evasoes, 0)::integer AS total_evasoes,
       CASE WHEN COALESCE(am.alunos_pagantes, 0) > 0
            THEN round(COALESCE(em.total_evasoes, 0)::numeric / am.alunos_pagantes::numeric * 100, 2)
            ELSE 0
       END::numeric(5,2) AS churn_rate,
       COALESCE(rm.renovacoes, 0)::integer AS renovacoes,
       CASE WHEN COALESCE(rm.total_contratos, 0) > 0
            THEN round(rm.renovacoes::numeric / rm.total_contratos::numeric * 100, 2)
            ELSE 0
       END::numeric(5,2) AS taxa_renovacao,
       COALESCE(rm.reajuste_medio, 0)::numeric(5,2) AS reajuste_medio,
       COALESCE(am.matriculas_ativas, 0)::integer AS matriculas_ativas
  FROM unidades u
  LEFT JOIN alunos_mes am ON am.unidade_id = u.id
  LEFT JOIN ticket_por_unidade tu ON tu.unidade_id = u.id
  LEFT JOIN permanencia_calc pc ON pc.unidade_id = u.id
  LEFT JOIN leads_mes lm ON lm.unidade_id = u.id AND lm.ano = am.ano AND lm.mes = am.mes
  LEFT JOIN evasoes_mes em ON em.unidade_id = u.id AND em.ano = am.ano AND em.mes = am.mes
  LEFT JOIN renovacoes_mes rm ON rm.unidade_id = u.id AND rm.ano = am.ano AND rm.mes = am.mes
 WHERE u.ativo = true;

GRANT SELECT ON vw_kpis_gestao_mensal TO authenticated;
```

---

## 3. Correção 2: Frontend ModalFichaAluno.tsx

### Linha 590 — criação de segundo curso

**DE (bug):**
```typescript
const tipoMatriculaId = cursoSelecionadoEhBanda ? 5 : 2;
const isSegundoCurso = cursoSelecionadoEhBanda ? null : true;
```

**PARA (corrigido — preserva bolsista):**
```typescript
// Preservar tipo_matricula_id se for bolsista (3=Integral, 4=Parcial)
// Só força 2 (Segundo Curso) se for pagante regular (1)
const tipoMatriculaId = cursoSelecionadoEhBanda
  ? 5  // Banda
  : ([3, 4].includes(formData.tipo_matricula_id)
      ? formData.tipo_matricula_id  // Preserva bolsista integral/parcial
      : 2);  // Segundo Curso (só para pagante regular)
const isSegundoCurso = cursoSelecionadoEhBanda ? null : true;
```

**Lógica:**
- Banda → 5
- Bolsista integral/parcial → preserva 3/4
- Pagante regular → vira 2

---

## 4. Correção 3: Trigger auto_detect_segundo_curso_banda

### Verificação necessária

A trigger atual:
```sql
IF TG_OP = 'INSERT' AND COALESCE(NEW.tipo_matricula_id, 1) IN (1, 2) THEN
  -- Só atua se Regular (1) ou Segundo Curso (2)
```

Se o frontend corrigir o `tipo_matricula_id` (enviando 3 ou 4 para bolsista), a trigger NÃO vai sobrescrever. Então a correção do frontend pode ser suficiente.

**Mas** precisamos validar: se alguém criar segundo curso direto no banco (sem frontend), a trigger ainda força 2. Recomendação: adicionar checagem na trigger para não sobrescrever bolsista.

---

## 5. Travas de Validação (Alfredo)

### Trava 1: SELECT antes de qualquer UPDATE

Não fazer UPDATE nominal em Rayane/Kailane sem SELECT atual confirmando divergência.

```sql
-- SELECT de validação obrigatório antes de qualquer UPDATE
SELECT id, nome, curso_id, tipo_aluno, tipo_matricula_id, is_segundo_curso, status
FROM alunos
WHERE nome ILIKE '%Rayane Bianca%'
   OR nome ILIKE '%Kailane%'
ORDER BY nome, curso_id;
```

### Trava 2: Validar view antes de aplicar migration

```sql
-- Comparar ticket médio: view atual vs view nova
-- Rodar em ambiente de teste primeiro
```

### Trava 3: Não excluir segundo curso do MRR

A regra correta é:
- MRR = soma de TODAS as parcelas pagantes (inclui 2o curso)
- Ticket médio = soma por PESSOA / número de PESSOAS

Nunca usar `is_segundo_curso = false` como filtro de MRR.

### Trava 4: Agrupar pessoa corretamente

Chave de pessoa: `LOWER(TRIM(nome)) + unidade_id`
NÃO usar só `nome` (risco de homônimos em unidades diferentes).

---

## 6. Checklist de Execução

- [ ] Validar SELECT da Rayane e Kailane antes de qualquer UPDATE
- [ ] Aplicar migration da view em ambiente de teste
- [ ] Comparar resultados: ticket médio deve subir ~R$ 24 (de R$ 391 para R$ 415)
- [ ] MRR deve permanecer igual (~R$ 397.478)
- [ ] Aplicar patch do frontend (ModalFichaAluno.tsx)
- [ ] Testar criação de segundo curso para bolsista (não deve virar tipo 2)
- [ ] Testar criação de segundo curso para pagante (deve virar tipo 2)
- [ ] Validar trigger não sobrescreve bolsista em INSERT direto
