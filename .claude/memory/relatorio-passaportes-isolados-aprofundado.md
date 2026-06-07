# Relatório Aprofundado: 9 Passaportes Isolados

## Data: 2026-06-06
## Método: SELECT-only, sem UPDATE
## Status: Aguardando validação humana

---

## Resumo Executivo

Investigação nominal dos 9 passaportes (`sem_parcela`) sem outra matrícula ativa. Revela **inconsistências de status**, **contratos vencidos** e **evasões não refletidas no status**.

**Nenhum UPDATE executado.**

---

## Dados por Aluno

### Campo Grande

#### 191 — João Miguel da Cunha Alves Ferreira

| Campo | Valor |
|-------|-------|
| Curso | Violino |
| Professor | Joel de Salles Gouveia Filho |
| Valor | R$ 399,00 |
| Status | `ativo` |
| Status Pagamento | `sem_parcela` |
| Data Matrícula | **2020-11-27** (5 anos atrás) |
| Contrato | Nulo |
| Movimentações | 1 — `renovacao` em 2026-03-14 |
| Outra matrícula ativa | **Não** |

**Análise:** Aluno de 5 anos! Renovado em março/2026, mas `sem_parcela` e sem contrato. Possível migração para passaporte ou benefício. O fato de ter renovação sugere que já foi pagante.

**Recomendação:** Verificar se é aluno que migrou para passaporte/benefício e se deveria estar `inativo` ou com outro tipo. **Encaminhar para validação humana.**

---

#### 220 — Laura Andrade da Silveira

| Campo | Valor |
|-------|-------|
| Curso | Teclado |
| Professor | Ramon Pina Morais |
| Valor | R$ 347,00 |
| Status | `ativo` |
| Status Pagamento | `sem_parcela` |
| Data Matrícula | 2024-02-06 |
| Contrato | Nulo |
| Movimentações | **Zero** |
| Outra matrícula ativa | **Não** |

**Análise:** Matriculada há 1 ano, zero movimentações (sem renovação, sem evasão, sem trancamento). Status `ativo` + `sem_parcela` + sem contrato. Possível passaporte vendido como serviço isolado ou cadastro órfão.

**Recomendação:** Verificar se a aluna realmente frequentou aulas ou se é passaporte puro. Se nunca teve aulas regulares, deveria estar `inativo` ou arquivado. **Encaminhar para validação humana.**

---

#### 269 — Manuela Lourenço Ribeiro

| Campo | Valor |
|-------|-------|
| Curso | Teclado |
| Professor | Leonardo Castro |
| Valor | R$ 347,00 |
| Status | `ativo` |
| Status Pagamento | `sem_parcela` |
| Data Matrícula | 2025-05-22 (1 mês atrás) |
| Contrato | Nulo |
| Movimentações | **Zero** |
| Outra matrícula ativa | **Não** |

**Análise:** Matrícula muito recente (maio/2025 = 1 mês). Sem contrato, sem movimentações. Provável passaporte recém-vendido como serviço isolado.

**Recomendação:** Se é passaporte puro (sem aulas regulares), considerar criar uma forma de registrar serviços isolados sem contar como aluno ativo. **Curto prazo:** verificar se deveria estar `inativo`. **Médio prazo:** fluxo de passaporte como serviço, não matrícula.

---

#### 337 — Olavo Pereira Wood

| Campo | Valor |
|-------|-------|
| Curso | Bateria |
| Professor | Vicente Pinheiro Neto |
| Valor | R$ 337,00 |
| Status | **`ativo`** ⚠️ |
| Status Pagamento | `sem_parcela` |
| Data Matrícula | 2024-09-28 |
| Contrato | Nulo |
| Movimentações | 1 — **`nao_renovacao`** em **2025-10-01** |
| Outra matrícula ativa | **Não** |

**Análise:** `nao_renovacao` registrada em outubro/2025, mas status continua `ativo`! Contraditório. Deveria estar `evadido` ou `inativo`.

**Recomendação:** Corrigir status para `evadido` (ou `inativo`). É um erro de cadastro claro. **Pode ser corrigido automaticamente** se confirmado que `nao_renovacao` + 8 meses sem pagamento = evasão.

---

### Recreio

#### 422 — Agatha Sampaio Mendes dos Santos

| Campo | Valor |
|-------|-------|
| Curso | Canto |
| Professor | Leticia de Almeida Palmeira |
| Valor | R$ 423,50 |
| Status | `ativo` |
| Status Pagamento | `sem_parcela` |
| Data Matrícula | 2025-03-31 |
| Contrato | 2025-04-07 a 2026-05-25 |
| Movimentações | 1 — `renovacao` em 2026-05-28 |
| Outra matrícula ativa | **Não** |

**Análise:** Tem contrato vigente (até maio/2026), renovação registrada, mas `sem_parcela`. Possível passaporte com renovação automática ou benefício de funcionário.

**Recomendação:** Verificar se é benefício interno (funcionário, familiar) ou passaporte. Se for benefício, deveria ter tipo específico. **Encaminhar para validação humana.**

---

#### 450 — Bento Vieira Sindeaux

| Campo | Valor |
|-------|-------|
| Curso | Musicalização Infantil |
| Professor | Leticia de Almeida Palmeira |
| Valor | R$ 460,00 |
| Status | `ativo` |
| Status Pagamento | `sem_parcela` |
| Data Matrícula | 2025-04-05 |
| Contrato | Nulo |
| Movimentações | **Zero** |
| Outra matrícula ativa | **Não** |

**Análise:** Matrícula recente (abril/2025), sem contrato, sem movimentações. Musicalização Infantil é curso de crianças pequenas. Possível trial/experimental que nunca converteu.

**Recomendação:** Verificar se teve aulas de experiência e não converteu. Se não converteu, deveria estar `inativo` ou `evadido`. **Encaminhar para validação humana.**

---

#### 483 — Davi do nascimento alexandre da gama mello

| Campo | Valor |
|-------|-------|
| Curso | Musicalização Preparatória |
| Professor | Leticia de Almeida Palmeira |
| Valor | R$ 459,00 |
| Status | **`ativo`** ⚠️ |
| Status Pagamento | `sem_parcela` |
| Data Matrícula | 2024-03-16 |
| Contrato | **2024-03-23 a 2025-04-26** |
| Movimentações | 1 — `renovacao` em 2026-05-28 |
| Outra matrícula ativa | **Não** |

**Análise:** Contrato **VENCIDO** em abril/2025 (há 1 ano!), mas status `ativo`. Renovado em maio/2026, mas sem parcela. Contraditório — renovação de aluno sem parcela com contrato vencido.

**Recomendação:** Verificar se renovação foi registrada erroneamente. Se contrato venceu e não há parcela, deveria estar `evadido`. **Possível erro de cadastro.**

---

#### 1723 — Giane Apoliana Albino de Oliveira

| Campo | Valor |
|-------|-------|
| Curso | Teclado |
| Professor | Renan Amorim Guimarães |
| Valor | R$ 357,00 |
| Status | **`ativo`** ⚠️ |
| Status Pagamento | `sem_parcela` |
| Data Matrícula | **2026-05-28** (9 dias atrás) |
| Contrato | 2026-06-03 a 2027-01-06 |
| Movimentações | 1 — **`evasao`** em **2026-06-05** |
| Outra matrícula ativa | **Não** |

**Análise:** Matriculou em 28/05/2026, já teve `evasao` em 05/06/2026 (1 semana depois!), mas status continua `ativo`. **Contraditório grave.**

**Recomendação:** Corrigir status para `evadido`. Evasão registrada + status ativo = erro de cadastro. **Pode ser corrigido automaticamente.**

---

#### 1676 — Luciana Lima de Moura

| Campo | Valor |
|-------|-------|
| Curso | Canto |
| Professor | Erick Osmy |
| Valor | R$ 385,00 |
| Status | `ativo` |
| Status Pagamento | `sem_parcela` |
| Data Matrícula | **2026-05-09** (1 mês atrás) |
| Contrato | 2026-05-23 a 2027-02-20 |
| Movimentações | **Zero** |
| Outra matrícula ativa | **Não** |

**Análise:** Matrícula muito recente (maio/2026), contrato vigente, zero movimentações. Provável passaporte novo ou aluno que ainda não iniciou pagamentos.

**Recomendação:** Se é aluno novo que ainda não pagou primeira parcela, `sem_parcela` pode ser temporário. Verificar se há pagamento pendente. **Não alterar ainda** — aguardar próximo ciclo de faturamento.

---

## Consolidado por Recomendação

| # | ID | Aluno | Unidade | Recomendação | Urgência |
|---|----|-------|---------|--------------|----------|
| 1 | 337 | Olavo Pereira Wood | CG | Corrigir status: `nao_renovacao` + 8 meses = `evadido` | Alta |
| 2 | 1723 | Giane Apoliana | Recreio | Corrigir status: `evasao` registrada = `evadido` | **Alta** |
| 3 | 483 | Davi do nascimento | Recreio | Verificar renovação com contrato vencido + sem parcela | Média |
| 4 | 191 | João Miguel | CG | Verificar: 5 anos de matrícula, renovação, sem parcela | Média |
| 5 | 220 | Laura Andrade | CG | Verificar: 1 ano, zero movimentações, ativo sem parcela | Média |
| 6 | 450 | Bento Vieira | Recreio | Verificar: trial/experimental não convertido | Média |
| 7 | 269 | Manuela Lourenço | CG | Verificar: passaporte como serviço isolado | Baixa |
| 8 | 1676 | Luciana Lima | Recreio | **Não alterar**: matrícula recente, aguardar faturamento | Baixa |
| 9 | 422 | Agatha Sampaio | Recreio | Verificar: benefício/funcionário com renovação | Baixa |

---

## Padrões Identificados

1. **Status não reflete movimentações:** 2 casos (`nao_renovacao`, `evasao`) com status `ativo`
2. **Contratos vencidos:** 1 caso com contrato vencido há 1 ano mas ativo
3. **Passaportes recentes:** 3 casos com matrícula < 2 meses, possíveis serviços novos
4. **Zero movimentações:** 3 casos com matrícula > 3 meses e zero movimentações (cadastro órfão?)

---

## SQLs Usados

```sql
-- Classificação dos 9 passaportes isolados
WITH alvos AS (
  SELECT id, nome, unidade_id, curso_id, valor_parcela, status_pagamento, status, 
         data_matricula, data_saida, data_inicio_contrato, data_fim_contrato,
         professor_atual_id
  FROM alunos WHERE id IN (191, 220, 269, 337, 422, 450, 483, 1723, 1676)
)
SELECT a.id, a.nome, u.nome AS unidade, c.nome AS curso, a.valor_parcela,
       a.status_pagamento, a.status, a.data_matricula, a.data_saida,
       a.data_inicio_contrato, a.data_fim_contrato, p.nome AS professor,
       COUNT(DISTINCT m.id) AS qtd_movimentacoes,
       STRING_AGG(DISTINCT m.tipo, ', ') AS tipos_movimentacao,
       MAX(m.data) AS ultima_movimentacao
FROM alvos a
LEFT JOIN unidades u ON u.id = a.unidade_id
LEFT JOIN cursos c ON c.id = a.curso_id
LEFT JOIN professores p ON p.id = a.professor_atual_id
LEFT JOIN movimentacoes_admin m ON m.aluno_id = a.id OR m.aluno_nome = a.nome
GROUP BY a.id, a.nome, u.nome, c.nome, a.valor_parcela, a.status_pagamento, a.status,
         a.data_matricula, a.data_saida, a.data_inicio_contrato, a.data_fim_contrato, p.nome
ORDER BY u.nome, a.nome;
```
