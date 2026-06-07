# Verificação P8/P11 — SELECT-Only

> Data: 2026-06-05
> Tipo: SELECT-only — NÃO executar DDL, DML, migration ou backfill
> Objetivo: Confirmar estrutura real de `dados_mensais`, funções e cron antes de propor migration

---

## 1. Confirmação: `dados_mensais` é tabela ou view?

```sql
SELECT
  c.relname AS nome,
  c.relkind AS tipo
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname = 'dados_mensais'
  AND n.nspname = 'public';
-- Esperado: tipo = 'r' (tabela) ou 'v' (view)
```

## 2. Estrutura completa da tabela

```sql
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'dados_mensais'
  AND table_schema = 'public'
ORDER BY ordinal_position;
```

## 3. Constraints (UNIQUE, PRIMARY KEY, GENERATED)

```sql
-- Constraints (incluindo UNIQUE em unidade_id, ano, mes)
SELECT
  con.conname AS nome_constraint,
  con.contype AS tipo,
  pg_get_constraintdef(con.oid) AS definicao
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname = 'dados_mensais'
  AND n.nspname = 'public';

-- Colunas GENERATED ALWAYS
SELECT
  column_name,
  generation_expression
FROM information_schema.columns
WHERE table_name = 'dados_mensais'
  AND table_schema = 'public'
  AND generation_expression IS NOT NULL;
```

## 4. Função `recalcular_dados_mensais` — definição atual

```sql
SELECT
  proname AS nome,
  pg_get_function_arguments(oid) AS argumentos,
  pg_get_function_result(oid) AS retorno,
  prosrc AS corpo
FROM pg_proc
WHERE proname = 'recalcular_dados_mensais'
  AND pronamespace = 'public'::regnamespace;
```

## 5. Função `snapshot_dados_mensais` legada — ainda existe?

```sql
SELECT
  proname AS nome,
  pg_get_function_arguments(oid) AS argumentos,
  pg_get_function_result(oid) AS retorno
FROM pg_proc
WHERE proname = 'snapshot_dados_mensais'
  AND pronamespace = 'public'::regnamespace;
```

## 6. Cron jobs ativos

```sql
SELECT
  jobid,
  jobname,
  schedule,
  command,
  active
FROM cron.job
WHERE jobname LIKE '%dados_mensais%'
   OR command LIKE '%dados_mensais%';
```

## 7. Último snapshot por mês

```sql
SELECT
  ano,
  mes,
  COUNT(*) AS qtd_unidades,
  MAX(updated_at) AS ultimo_update,
  MIN(updated_at) AS primeiro_update
FROM dados_mensais
WHERE ano = 2026
GROUP BY ano, mes
ORDER BY mes;
-- Esperado: mes 1,2,3,4,5. Se faltar mes 4 → confirmado que abril foi perdido.
```

## 8. Dados de abril por unidade

```sql
SELECT
  u.nome AS unidade,
  dm.ano,
  dm.mes,
  dm.alunos_ativos,
  dm.alunos_pagantes,
  dm.evasoes,
  dm.churn_rate,
  dm.updated_at
FROM dados_mensais dm
JOIN unidades u ON u.id = dm.unidade_id
WHERE dm.ano = 2026 AND dm.mes = 4
ORDER BY u.nome;
```

## 9. Linhas duplicadas (teste de sanidade da constraint)

```sql
SELECT
  unidade_id,
  ano,
  mes,
  COUNT(*) AS qtd_linhas
FROM dados_mensais
GROUP BY unidade_id, ano, mes
HAVING COUNT(*) > 1;
-- Esperado: 0 linhas (constraint UNIQUE deve impedir duplicatas)
```

## 10. Tamanho da tabela

```sql
SELECT
  pg_size_pretty(pg_total_relation_size('public.dados_mensais')) AS tamanho_total,
  (SELECT COUNT(*) FROM dados_mensais) AS total_linhas;
```

---

## Checklist de Verificação

Antes de qualquer migration, confirmar:

- [ ] `dados_mensais` é tabela (`relkind = 'r'`)
- [ ] Existe constraint UNIQUE em `(unidade_id, ano, mes)`
- [ ] `faturamento_estimado` e `saldo_liquido` são `GENERATED ALWAYS`
- [ ] `recalcular_dados_mensais` existe e retorna JSONB
- [ ] `snapshot_dados_mensais` legada existe (ou foi dropada)
- [ ] Cron legado está INATIVO (zero jobs com `dados_mensais`)
- [ ] Dados de abril 2026 existem (ou foram perdidos)
- [ ] Zero linhas duplicadas
- [ ] Tamanho da tabela é pequeno (< 1MB = pode adicionar histórico sem custo)
