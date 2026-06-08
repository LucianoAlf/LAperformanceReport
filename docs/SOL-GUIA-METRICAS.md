# Guia de Métricas — LA Music Performance Report

**Para uso exclusivo da Sol (VPS). Leia antes de qualquer consulta ao banco.**

---

## ⚠️ Regra de Ouro: `alunos` é por matrícula, não por pessoa

A tabela `alunos` **não é uma tabela de pessoas**. É uma tabela de **matrículas ativas ou históricas**. Uma pessoa com 2 cursos ativos tem **2 linhas** em `alunos`, com o mesmo nome, telefone, unidade e data de nascimento.

Isso é design intencional — não é duplicata.

| Pergunta | Query certa |
|---|---|
| Quantas matrículas ativas? | `COUNT(id) WHERE status='ativo'` |
| Quantos alunos únicos? | `COUNT(DISTINCT ...)` agrupando por nome+unidade+telefone |
| Aluno tem segundo curso? | `is_segundo_curso = true` |

---

## 1. Aluno Ativo

**Definição:** qualquer linha em `alunos` com `status = 'ativo'`.

```sql
SELECT count(*) FROM alunos WHERE status = 'ativo' AND unidade_id = :unidade_id;
```

**Inclui:** alunos regulares, segundo curso, banda, bolsistas.
**Não inclui:** trancados, aviso prévio, inativos, evadidos.

**Status possíveis em `alunos`:**
| Status | Significado |
|---|---|
| `ativo` | Frequentando normalmente |
| `trancado` | Pausa temporária |
| `aviso_previo` | Vai sair — intervenção ainda possível |
| `inativo` | Saiu (não renovou) |
| `evadido` | Saiu (evasão confirmada) |

---

## 2. Matrículas Ativas vs. Alunos Únicos

São métricas diferentes. A diferença aparece quando um aluno tem 2 cursos ativos:

- **Alunos ativos como pessoas** = 321 (filtra `is_segundo_curso = false`)
- **Matrículas ativas como contratos** = 423 (conta todas as linhas ativas, incluindo segundos cursos)

```sql
-- Matrículas ativas por unidade (conta contratos, não pessoas)
SELECT u.nome, count(a.id) AS matriculas
FROM alunos a
JOIN unidades u ON u.id = a.unidade_id
WHERE a.status = 'ativo'
GROUP BY u.nome;

-- Pessoas únicas ativas (exclui segundo curso e banda)
SELECT u.nome, count(a.id) AS pessoas
FROM alunos a
JOIN unidades u ON u.id = a.unidade_id
WHERE a.status = 'ativo'
  AND a.is_segundo_curso = false
  AND a.tipo_matricula_id != 5
GROUP BY u.nome;
```

---

## 3. Pagantes

**Definição:** alunos com `classificacao = 'pagante'` (campo direto em `alunos`).

| Valor | Significado |
|---|---|
| `pagante` | Paga mensalidade normalmente |
| `bolsista_integral` | Isento 100% |
| `bolsista_parcial` | Desconto parcial |
| `nao_pagante` | Não paga (ex: staff, permuta) |

```sql
SELECT count(*) FROM alunos
WHERE status = 'ativo' AND classificacao = 'pagante'
AND unidade_id = :unidade_id;
```

**Importante:** bolsistas integrais e não-pagantes não entram no pipeline comercial nem no cálculo de churn padrão. Pergunte ao usuário se quer incluir ou não antes de montar a query.

---

## 4. Bolsistas

Campo `tipo_matricula_id` em `alunos`:

| ID | Tipo |
|---|---|
| 1 | REGULAR |
| 2 | SEGUNDO_CURSO |
| 3 | BOLSISTA_INTEGRAL |
| 4 | BOLSISTA_PARCIAL |
| 5 | BANDA |

```sql
SELECT count(*) FROM alunos
WHERE status = 'ativo' AND tipo_matricula_id IN (3, 4)
AND unidade_id = :unidade_id;
```

---

## 5. Segundo Curso e Banda

- `is_segundo_curso = true` → mesma pessoa já tem outra matrícula ativa na mesma unidade
- Banda → `tipo_matricula_id = 5` (detectado automaticamente por curso com "banda" no nome)
- `is_projeto_banda = true` em `cursos` → esse curso é excluído de médias, carteira e score de professor

**Quando excluir do cálculo:** relatórios comerciais de novos alunos sempre excluem `is_segundo_curso = true` e banda. Pergunte ao usuário se a pergunta é "novos alunos" ou "todos os contratos".

---

## 6. Trancamento

Pausa temporária. Não é cancelamento. **Não entra no churn.**

- Status do aluno: `trancado`
- Campo: `previsao_retorno`
- Registrado em: `movimentacoes_admin` com `tipo = 'trancamento'`

---

## 7. Aviso Prévio

Aluno sinalizou que vai sair, mas ainda está ativo. Intervenção ainda é possível.

- Status do aluno: `aviso_previo`
- `mes_saida` = mês previsto de saída
- **Não entra no churn** — tem aba e relatório próprios
- Registrado em: `movimentacoes_admin` com `tipo = 'aviso_previo'`

```sql
SELECT * FROM movimentacoes_admin
WHERE tipo = 'aviso_previo'
AND to_char(mes_saida, 'YYYY-MM') = '2026-06'
AND unidade_id = :unidade_id;
```

---

## 8. Evasão (Churn)

**Fonte de verdade única:** tabela `movimentacoes_admin`. Nunca usar status do aluno para calcular churn.

Tipos que **contam no churn:**
- `evasao` — cancelamento confirmado
- `nao_renovacao` — não renovou ao fim do contrato

Tipos que **não contam no churn:**
- `aviso_previo`, `trancamento`, `renovacao`

```sql
-- Churn do mês (sempre com timezone BRT)
SELECT count(*) FROM movimentacoes_admin
WHERE tipo IN ('evasao', 'nao_renovacao')
AND date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo')
  = date_trunc('month', :data_referencia AT TIME ZONE 'America/Sao_Paulo')
AND unidade_id = :unidade_id;
```

**Fórmula churn rate:**
```
(evasões + não renovações no mês) / alunos pagantes no início do mês × 100
```

**Motivos de saída:** tabela `motivos_saida` com campos `id, nome, categoria, conta_score_professor`.
Motivos com `conta_score_professor = true` penalizam o professor no score. Motivo NULL sem match = não penaliza.

---

## 9. Renovação

Registrada em `movimentacoes_admin` com `tipo = 'renovacao'`.

```sql
SELECT count(*) FROM movimentacoes_admin
WHERE tipo = 'renovacao'
AND date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo')
  = date_trunc('month', :data_referencia AT TIME ZONE 'America/Sao_Paulo')
AND unidade_id = :unidade_id;
```

**Taxa de renovação:** renovações realizadas / renovações previstas. Meta: ≥ 80%.

---

## 10. Leads

Um lead é um potencial aluno que ainda não se matriculou (ou está em processo).

**Tabela:** `leads`

| Campo | O que é |
|---|---|
| `status` | Etapa atual no funil |
| `data_contato` | Data de criação no Emusys (não é data do webhook) |
| `experimental_agendada` | Flag booleana — nunca volta pra false após virar true |
| `aluno_id` | Se preenchido, é aluno existente (segundo curso), não lead novo |
| `arquivado` | Se true, ignorar em buscas normais |
| `tipo_agendamento` | `'experimental'` ou `'visita'` |

**Pipeline (crm_pipeline_etapas):**
| ID | Nome | Status |
|---|---|---|
| 1 | Novo Lead | `novo` |
| 5 | Experimental Agendada | `experimental_agendada` |
| 6 | Visita Escola | `visita_escola` |
| 7 | Experimental Realizada | `experimental_realizada` |
| 9 | Faltou | `experimental_faltou` |
| 10 | Convertido/Matriculado | `convertido` |
| 11 | Arquivado | `arquivado` |

```sql
-- Leads do mês (padrão dos relatórios: todos os status, sem filtro de etapa)
SELECT count(*) FROM leads
WHERE date_trunc('month', data_contato AT TIME ZONE 'America/Sao_Paulo')
  = date_trunc('month', :data_referencia AT TIME ZONE 'America/Sao_Paulo')
AND arquivado = false
AND unidade_id = :unidade_id;
```

---

## 11. Experimentais

Uma experimental é uma aula de teste que o lead faz antes de se matricular.

**Tabela canônica:** `lead_experimentais` — cada linha = uma experimental individual.

> ⚠️ Um lead (mãe/responsável) pode ter N experimentais (uma por filho). Nunca contar experimentais por `leads.experimental_agendada` — use `lead_experimentais`.

| Campo | O que é |
|---|---|
| `lead_id` | FK para `leads` |
| `nome_aluno` | Nome do aluno (pode ser diferente do lead/responsável) |
| `data_experimental` | Data da aula |
| `status` | `agendada / experimental_realizada / experimental_faltou / cancelada` |
| `professor_experimental_id` | Professor da aula |
| `emusys_lead_id` | NULL = lançamento manual |

```sql
-- Experimentais do mês (exclui canceladas)
SELECT count(*) FROM lead_experimentais le
JOIN leads l ON l.id = le.lead_id
WHERE date_trunc('month', le.data_experimental AT TIME ZONE 'America/Sao_Paulo')
  = date_trunc('month', :data_referencia AT TIME ZONE 'America/Sao_Paulo')
AND le.status != 'cancelada'
AND l.unidade_id = :unidade_id;

-- Taxa de show-up
SELECT
  count(*) FILTER (WHERE le.status = 'experimental_realizada') AS realizadas,
  count(*) FILTER (WHERE le.status != 'cancelada') AS agendadas
FROM lead_experimentais le
JOIN leads l ON l.id = le.lead_id
WHERE date_trunc('month', le.data_experimental AT TIME ZONE 'America/Sao_Paulo')
  = date_trunc('month', :data_referencia AT TIME ZONE 'America/Sao_Paulo')
AND l.unidade_id = :unidade_id;
```

---

## 12. Visitas

O lead vem conhecer a escola sem fazer aula. Alternativa à experimental.

- Tabela: `visitas`
- Status: `agendada / realizada / nao_compareceu / cancelada`
- Distinção do experimental: `leads.tipo_agendamento = 'visita'` (quando dado está em `leads`)

---

## 13. LTV / Tempo de Permanência

**Fórmula:** soma dos meses de todas as passagens de ex-alunos com ≥ 4 meses / quantidade de ex-alunos.

Alunos com < 4 meses **não entram** no cálculo (contam na evasão, mas não no LTV).

**Fontes:**
- `alunos_historico` — passagens importadas e passagens anteriores de alunos que voltaram
- `alunos` — inativos/evadidos atualmente no sistema

**Excluídos do LTV:** bolsistas (`tipo_matricula_id IN (3,4)`), banda, segundo curso.

```sql
-- Usar RPC existente
SELECT * FROM get_historico_ltv(:unidade_id);
```

---

## 14. Dados Mensais (Snapshots Históricos)

Tabela `dados_mensais` — snapshot mensal de KPIs. Gerada por pg_cron no dia 1 de cada mês.

Campos: `alunos_ativos`, `alunos_pagantes`, `matriculas_ativas`, `novos_alunos`, `evasoes`, `renovacoes`, `nao_renovacoes`, `churn_rate`, `ticket_medio`, `faturamento`, `mrr_perdido`.

> Use `dados_mensais` para perguntas históricas ("como estava em março?"). Para o mês corrente, consulte as tabelas operacionais.

---

## 15. Escopo por Perfil de Colaborador

| Perfil | O que pode ver |
|---|---|
| `admin` | Todas as unidades, todos os dados |
| `farmer` | Sua unidade — foco em alunos, evasões, renovações, churn |
| `hunter` | Sua unidade — foco em leads, pipeline, experimentais |
| `pre_atendimento` | Sua unidade — apenas leads e agenda |

**Nunca retornar dados de outra unidade para perfis não-admin.** Sempre aplicar `AND unidade_id = :colaborador_unidade_id` exceto para admin.

---

## 16. Timezone

**Sempre BRT (UTC-3).** Todas as datas de negócio são neste fuso.

```sql
-- Correto
date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo')

-- Errado (usa UTC por padrão — atrasa 3h e pode errar o mês)
date_trunc('month', created_at)
```

---

## Resumo Rápido

| Métrica | Tabela | Filtro principal |
|---|---|---|
| Matrículas ativas (contratos) | `alunos` | `status='ativo'` |
| Alunos únicos ativos | `alunos` | `status='ativo' AND is_segundo_curso=false AND tipo_matricula_id!=5` |
| Pagantes | `alunos` | `status='ativo' AND classificacao='pagante'` |
| Bolsistas | `alunos` | `tipo_matricula_id IN (3,4)` |
| Churn | `movimentacoes_admin` | `tipo IN ('evasao','nao_renovacao')` |
| Renovações | `movimentacoes_admin` | `tipo='renovacao'` |
| Trancamentos | `movimentacoes_admin` | `tipo='trancamento'` |
| Avisos prévios | `movimentacoes_admin` | `tipo='aviso_previo'` |
| Leads novos | `leads` | `arquivado=false`, por `data_contato` |
| Experimentais | `lead_experimentais` | por `data_experimental`, excluir `cancelada` |
| Visitas | `visitas` | por `data_visita` |
| LTV histórico | RPC `get_historico_ltv` | — |
| KPIs mensais históricos | `dados_mensais` | por `ano` e `mes` |

---

## IDs das Unidades

| Unidade | UUID |
|---|---|
| Campo Grande (CG) | `2ec861f6-023f-4d7b-9927-3960ad8c2a92` |
| Recreio | `95553e96-971b-4590-a6eb-0201d013c14d` |
| Barra | `368d47f5-2d88-4475-bc14-ba084a9a348e` |
