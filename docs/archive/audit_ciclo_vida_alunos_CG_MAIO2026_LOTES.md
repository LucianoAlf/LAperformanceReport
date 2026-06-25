# Saneamento de Ciclo de Vida — Campo Grande / Maio 2026
## Validação por Lotes (Alf como autoridade final)

**Gerado em:** 31/05/2026  
**Unidade:** Campo Grande  
**Status:** NENHUM UPDATE APLICADO — aguardando aprovação lote por lote

---

## Regra Conceitual Aprovada

Snapshot histórico deve usar ciclo de vida por data:
- Ativo no fim do mês = `data_matricula <= fim_mes` E (`data_saida IS NULL` OU `data_saida > fim_mes`)
- `data_saida` é a data efetiva de saída (evasão, não-renovação, etc.)
- `status` atual não é confiável para snapshot histórico

**Não aplicar updates em massa. Validar lote por lote.**

---

## LOTE A — Evidência Forte (1 caso)

Evidência: `movimentacoes_admin` com tipo='evasao' confirma data de saída.

### #1 — Emily Souza de Oliveira (id=106)

| Campo | Valor Atual |
|-------|-------------|
| status | inativo |
| data_saida | NULL |
| data_matricula | 2025-01-30 |
| tipo_matricula | Regular |
| valor_parcela | 332,00 |
| movimentação encontrada | evasao em 2026-03-07 |
| **Recomendação** | **Preencher data_saida = 2026-03-07** |

**Justificativa:** A movimentação de evasão em 07/03/2026 confirma que Emily saiu da escola nessa data. O cadastro não reflete isso (`data_saida` vazio). Preencher com a data da evasão torna o snapshot histórico consistente.

**SQL proposto (NÃO EXECUTAR):**
```sql
UPDATE alunos
SET data_saida = '2026-03-07',
    updated_at = NOW()
WHERE id = 106;
```

---

## LOTE B — Decisão do Alf (27 casos)

### B1 — Inativa com renovação recente (1 caso)

Evidência: `status='inativo'` mas existe renovação recente. Inconsistência que precisa de decisão operacional.

#### #2 — Maria Eduarda de Lima Bomfim Pedro (id=1450)

| Campo | Valor Atual |
|-------|-------------|
| status | inativo |
| data_saida | NULL |
| data_matricula | 2026-02-24 |
| tipo_matricula | Bolsista Integral |
| valor_parcela | NULL |
| movimentação encontrada | renovacao em 2026-05-02 |
| **Recomendação** | **VERIFICAR:** Saíu depois da renovação? Ou renovou e depois saiu? Ou status='inativo' está errado? |

**Justificativa:** Uma aluna inativa com renovação em 02/05/2026 é paradoxal. Ou ela está ativa e o status deve ser corrigido, ou ela saiu depois da renovação e precisamos da data real de saída para preencher `data_saida`.

**SQL proposto — depende da decisão:**
```sql
-- Se saiu depois da renovação (ex: 15/05/2026):
UPDATE alunos SET data_saida = '2026-05-15', updated_at = NOW() WHERE id = 1450;

-- Se está ativa (status errado):
UPDATE alunos SET status = 'ativo', updated_at = NOW() WHERE id = 1450;

-- Se precisa de movimentação de saída no sistema administrativo:
INSERT INTO movimentacoes_admin (aluno_id, unidade_id, tipo, data, observacoes, created_at)
VALUES ('1450', '2ec861f6-023f-4d7b-9927-3960ad8c2a92', 'evasao', '2026-05-XX', 'Saída após renovação', NOW());
```

---

### B2 — Inativos sem data_saida e sem movimentação (20 casos)

**Problema:** Sabemos que saíram (status='inativo'), mas não sabemos **quando**. Para o snapshot de Maio, a data de saída determina se elas contavam em Maio ou não. Sem data, não dá para calcular snapshot correto.

**Decisão do Alf:** Para cada caso, definir se:
1. O aluno saiu **antes** de Maio/2026 → preencher `data_saida` com a data real
2. O aluno saiu **durante** Maio/2026 → preencher `data_saida` com data em Maio (afeta estoque e evasão de Maio)
3. O aluno saiu **depois** de Maio/2026 → preencher `data_saida` com data em Junho ou posterior
4. O aluno está ativo e o status está errado → corrigir `status` para 'ativo'

**Importante:** Se o aluno saiu em Maio, isso afeta o snapshot de Maio (ele contou no início e saiu no meio) e pode afetar o contador de evasões de Maio.

| # | ID | Nome | data_matricula | tipo_matricula | valor_parcela | status | data_saida | movimentação | Recomendação |
|---|----|------|--------------|--------------|-------------|--------|-----------|-------------|-------------|
| 3 | 85 | Davi Borges da Silva Nascimento | 2018-05-03 | Regular | 377,00 | inativo | NULL | — | DEFINIR data_saida real |
| 4 | 94 | Davi Rosendo Chaves Vieira | 2024-10-31 | Regular | 321,00 | inativo | NULL | — | DEFINIR data_saida real |
| 5 | 131 | Gabriel Pereira Morais | 2024-10-24 | Regular | 337,00 | inativo | NULL | — | DEFINIR data_saida real |
| 6 | 137 | Georgie Jefferson de Mello Basílio | 2025-02-13 | Regular | 450,00 | inativo | NULL | — | DEFINIR data_saida real |
| 7 | 149 | Guilherme Gama Clavelario Nunes | 2024-02-29 | Regular | 357,00 | inativo | NULL | — | DEFINIR data_saida real |
| 8 | 165 | Heitor Thadeu Caciano | 2023-01-28 | Regular | 447,00 | inativo | NULL | — | DEFINIR data_saida real |
| 9 | 224 | Laura Peres de Souza | 2025-01-24 | Regular | 350,00 | inativo | NULL | — | DEFINIR data_saida real |
| 10 | 258 | Luís Rafael Sousa dos Santos | 2025-04-14 | Regular | 380,00 | inativo | NULL | — | DEFINIR data_saida real |
| 11 | 270 | Manuela Piveta Schulz | 2024-11-30 | Regular | 267,00 | inativo | NULL | — | DEFINIR data_saida real |
| 12 | 327 | Murilo Martellote de Assis | 2021-05-15 | Regular | 367,00 | inativo | NULL | — | DEFINIR data_saida real |
| 13 | 354 | Pedro Martellote de Assis | 2021-05-15 | Regular | 367,00 | inativo | NULL | — | DEFINIR data_saida real |
| 14 | 384 | Sophia Maciel Magalhaes | 2024-11-14 | Regular | 360,00 | inativo | NULL | — | DEFINIR data_saida real |
| 15 | 945 | Luciano da Silva Bernardino | 2026-02-09 | Regular | 327,00 | inativo | NULL | — | DEFINIR data_saida real |
| 16 | 11 | Alexandre Wallace Bispo Oliveira | 2024-11-30 | Bolsista Parcial | 250,00 | inativo | NULL | — | DEFINIR data_saida real |
| 17 | 118 | Felipe Marques Gevezier | 2025-09-29 | Bolsista Integral | NULL | inativo | NULL | — | DEFINIR data_saida real |
| 18 | 1375 | Alan Samico do Nascimento | 2024-05-18 | Bolsista Integral | NULL | inativo | NULL | — | DEFINIR data_saida real |
| 19 | 1377 | Alexandre de Sousa Serra | 2025-02-22 | Bolsista Integral | 0,00 | inativo | NULL | — | DEFINIR data_saida real |
| 20 | 1378 | Ana Julia de Oliveira Gomes | 2023-01-26 | Bolsista Integral | NULL | inativo | NULL | — | DEFINIR data_saida real |
| 21 | 1393 | Leamsi Guedes de Sant'anna | 2018-05-04 | Bolsista Integral | NULL | inativo | NULL | — | DEFINIR data_saida real |
| 22 | 1598 | Alexandre Dos Santos | 2026-04-02 | Regular | 0,00 | inativo | NULL | — | DEFINIR data_saida real |

**Template de SQL proposto (para cada caso, preencher a data real):**
```sql
UPDATE alunos
SET data_saida = 'YYYY-MM-DD',
    updated_at = NOW()
WHERE id = XXX;
```

---

### B3 — Ativos com data_saida antiga + renovação posterior (3 casos)

**Problema:** `data_saida` indica saída, mas o aluno está 'ativo' e tem renovação posterior. Provável que reativaram ou voltaram.

**Decisão do Alf:** Para cada caso, definir se:
1. O aluno **reativou** depois da saída → limpar `data_saida` (NULL)
2. O aluno **não reativou** → corrigir `status` para 'inativo'

| # | ID | Nome | data_matricula | data_saida | movimentação | mov_data | Recomendação |
|---|----|------|--------------|-----------|-------------|---------|-------------|
| 23 | 31 | Anne Krissya Cordeiro da Silva Noé | 2023-01-27 | 2026-02-24 | renovacao | 2026-04-01 | **Limpar data_saida** (reativou em Abril) OU **corrigir status** se não está ativa |
| 24 | 263 | Luiza Mazeliah do Nascimento | 2023-01-26 | 2026-03-02 | renovacao | 2026-03-14 | **Limpar data_saida** (renovou 12 dias depois da saída) OU **corrigir status** se não está ativa |
| 25 | 405 | Vicente Dias Botelho | 2023-01-27 | 2026-02-05 | renovacao | 2026-01-18 | **Limpar data_saida** (renovou antes da saída — saiu depois?) OU **corrigir status** se não está ativo |

**SQL proposto — depende da decisão:**
```sql
-- Se reativou / volta ativa:
UPDATE alunos SET data_saida = NULL, updated_at = NOW() WHERE id = 31;
UPDATE alunos SET data_saida = NULL, updated_at = NOW() WHERE id = 263;
UPDATE alunos SET data_saida = NULL, updated_at = NOW() WHERE id = 405;

-- Se não está ativo (status errado):
UPDATE alunos SET status = 'inativo', updated_at = NOW() WHERE id IN (31, 263, 405);
```

---

### B4 — Ativos com data_saida antiga sem movimentação (3 casos)

**Problema:** `status='ativo'` mas `data_saida` indica saída em Jan/Fev. Sem movimentação de reativação.

**Decisão do Alf:** Para cada caso, definir se:
1. O aluno **saiu e o status está errado** → corrigir `status` para 'inativo'
2. O aluno **não saiu e data_saida está errada** → limpar `data_saida` (NULL)

| # | ID | Nome | data_matricula | data_saida | movimentação | Recomendação |
|---|----|------|--------------|-----------|-------------|-------------|
| 26 | 47 | Arthur Souza Del Bosco | 2024-03-09 | 2026-01-09 | — | **VERIFICAR:** saiu em Jan? Se sim, status → inativo. Se não, limpar data_saida. |
| 27 | 323 | Miguel Santos Borges | 2024-07-31 | 2026-02-02 | — | **VERIFICAR:** saiu em Fev? Se sim, status → inativo. Se não, limpar data_saida. |
| 28 | 949 | Cassyo L P Silva | 2026-01-19 | 2026-02-14 | — | **VERIFICAR:** saiu em Fev? Se sim, status → inativo. Se não, limpar data_saida. |

**SQL proposto — depende da decisão:**
```sql
-- Se saíram (status → inativo):
UPDATE alunos SET status = 'inativo', updated_at = NOW() WHERE id IN (47, 323, 949);

-- Se não saíram (limpar data_saida):
UPDATE alunos SET data_saida = NULL, updated_at = NOW() WHERE id IN (47, 323, 949);
```

---

## Resumo por Lote

| Lote | Casos | Status | Próximo Passo |
|------|-------|--------|--------------|
| **A** | Emily (id=106) | Evidência forte | Alf aprova → aplicar |
| **B1** | Maria Eduarda (id=1450) | Inconsistência grave | Alf define se saiu e quando |
| **B2** | 20 inativos sem movimentação | Data de saída desconhecida | Alf define data_saida por aluno |
| **B3** | 3 ativos com saída + renovação | Reativação ou status errado | Alf decide: limpar saída ou corrigir status |
| **B4** | 3 ativos com saída sem movimentação | Saída real ou data_saida errada | Alf decide: corrigir status ou limpar saída |

---

## Impacto nos KPIs de Maio/2026 (pós-saneamento estimado)

| Métrica | Snapshot Atual (sujo) | Snapshot Pós-Saneamento (estimativa) |
|---------|---------------------|-------------------------------------|
| alunos_ativos | 515 | ~499 |
| alunos_pagantes | 485 | ~475 |
| churn_rate | 2,68% | 2,74% |

---

## Checklist de Aprovação

- [ ] **LOTE A aprovado** (Emily) — 1 caso
- [ ] **LOTE B1 resolvido** (Maria Eduarda) — 1 caso
- [ ] **LOTE B2 resolvido** (20 inativos) — definir data_saida para cada
- [ ] **LOTE B3 resolvido** (3 ativos com saída+renovação) — limpar saída ou corrigir status
- [ ] **LOTE B4 resolvido** (3 ativos com saída sem movimentação) — corrigir status ou limpar saída
- [ ] **Re-simulação v2** executada e validada
- [ ] **RPC** `recalcular_dados_mensais(2026, 5, Campo Grande)` aprovado para execução
