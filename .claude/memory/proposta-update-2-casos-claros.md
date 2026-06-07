# Proposta de UPDATE: 2 Casos Claros de Status Incorreto

## Data: 2026-06-06
## Status: PREPARADO, NÃO EXECUTADO
## Aguardando aprovação explícita do Alfredo

---

## Casos Selecionados

| ID | Aluno | Unidade | Problema | Movimentação | Data Mov. | Status Atual | Status Correto |
|----|-------|---------|----------|--------------|-----------|--------------|----------------|
| **337** | Olavo Pereira Wood | Campo Grande | `nao_renovacao` registrada, mas `ativo` | `nao_renovacao` | 2025-10-01 | `ativo` | `evadido` |
| **1723** | Giane Apoliana Albino de Oliveira | Recreio | `evasao` registrada, mas `ativo` | `evasao` | 2026-06-05 | `ativo` | `evadido` |

---

## Evidências

### 1. Dados cadastrais atuais

```sql
SELECT * FROM alunos WHERE id IN (337, 1723);
```

| ID | Aluno | Unidade | Curso | Valor | Status | Status Pagamento | Data Matrícula |
|----|-------|---------|-------|-------|--------|------------------|----------------|
| 337 | Olavo Pereira Wood | CG | Bateria | R$ 337 | **ativo** | sem_parcela | 2024-09-28 |
| 1723 | Giane Apoliana | Recreio | Teclado | R$ 357 | **ativo** | sem_parcela | 2026-05-28 |

### 2. Movimentações que justificam saída

```sql
SELECT a.id, a.nome, m.data, m.tipo, m.observacoes
FROM alunos a
LEFT JOIN movimentacoes_admin m ON m.aluno_id = a.id OR m.aluno_nome = a.nome
WHERE a.id IN (337, 1723) AND m.id IS NOT NULL;
```

| ID | Aluno | Data | Tipo | Observação |
|----|-------|------|------|------------|
| 337 | Olavo Pereira Wood | 2025-10-01 | `nao_renovacao` | "Separação pais - desânimo" |
| 1723 | Giane Apoliana | 2026-06-05 | `evasao` | — |

### 3. Status válidos no sistema

```sql
SELECT DISTINCT status FROM alunos WHERE status IS NOT NULL;
```

Resultado: `ativo`, `evadido`, `inativo`, `trancado`

**Status correto para ambos:** `evadido` (movimentação de saída registrada)

---

## Impacto Esperado

| Unidade | Ativos Atual | Após UPDATE | Diff |
|---------|-------------|-------------|------|
| Campo Grande | 473 | 472 | **-1 pessoa** |
| Recreio | 316 | 315 | **-1 pessoa** |

**MRR:** Nenhum impacto (ambos já são `sem_parcela`)
**Ticket médio:** Nenhum impacto (ambos já são `sem_parcela`)
**Matrículas ativas:** -2 (uma em cada unidade)

---

## UPDATEs Preparados (com travas)

### Caso 1: Olavo Pereira Wood (ID 337)

```sql
-- Trava: só altera se existir movimentacao de nao_renovacao
UPDATE alunos
SET status = 'evadido',
    data_saida = '2025-10-01',
    updated_at = NOW()
WHERE id = 337
  AND status = 'ativo'
  AND EXISTS (
    SELECT 1 FROM movimentacoes_admin
    WHERE (aluno_id = 337 OR aluno_nome = 'Olavo Pereira Wood')
      AND tipo = 'nao_renovacao'
  )
RETURNING id, nome, status, data_saida;
```

**Linhas afetadas esperadas:** 1

---

### Caso 2: Giane Apoliana (ID 1723)

```sql
-- Trava: só altera se existir movimentacao de evasao
UPDATE alunos
SET status = 'evadido',
    data_saida = '2026-06-05',
    updated_at = NOW()
WHERE id = 1723
  AND status = 'ativo'
  AND EXISTS (
    SELECT 1 FROM movimentacoes_admin
    WHERE (aluno_id = 1723 OR aluno_nome = 'Giane Apoliana Albino de Oliveira')
      AND tipo = 'evasao'
  )
RETURNING id, nome, status, data_saida;
```

**Linhas afetadas esperadas:** 1

---

## O que NÃO será alterado

| Campo | Motivo |
|-------|--------|
| `tipo_matricula_id` | Não criar tipo novo, manter Regular (1) |
| `tipo_aluno` | Não alterar classificação |
| `status_pagamento` | Já está `sem_parcela`, correto para evadido |
| Outros 7 registros | Fora do escopo, aguardam validação humana |

---

## Checklist de Validação Pós-UPDATE

- [ ] Confirmar que exatamente 2 linhas foram afetadas
- [ ] Confirmar que `status = 'evadido'` nos 2 registros
- [ ] Confirmar que `data_saida` foi preenchida
- [ ] Confirmar que `total_alunos_ativos` da view diminuiu 1 em CG e 1 em Recreio
- [ ] Confirmar que MRR não mudou
- [ ] Confirmar que ticket médio não mudou

---

## Registros em Validação Humana (não serão alterados agora)

| ID | Aluno | Unidade | Motivo |
|----|-------|---------|--------|
| 191 | João Miguel | CG | 5 anos ativo sem parcela — benefício? |
| 220 | Laura Andrade | CG | 1 ano ativo, zero movimentações — passaporte puro? |
| 269 | Manuela Lourenço | CG | 1 mês, sem contrato — passaporte novo? |
| 422 | Agatha Sampaio | Recreio | Contrato vigente + renovação + sem parcela — benefício? |
| 450 | Bento Vieira | Recreio | Musicalização Infantil sem movimentação — trial? |
| 483 | Davi do nascimento | Recreio | Contrato vencido há 1 ano — erro de cadastro? |
| 1676 | Luciana Lima | Recreio | Matrícula de 1 mês — aguardar faturamento |
