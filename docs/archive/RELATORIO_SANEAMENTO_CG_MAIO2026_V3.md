# Relatório Final v3 — Saneamento Ciclo de Vida + Simulação
## Campo Grande / Maio 2026

**Gerado em:** 31/05/2026  
**Status:** NENHUM UPDATE APLICADO — aguardando aprovação do Alf  
**Arquivos SQL:**
- `SIMULACAO_SANEAMENTO_CG_MAIO2026_V3.sql` — Preview 100% read-only (SELECT, zero DDL)
- `UPDATE_SANEAMENTO_CG_MAIO2026_V3.sql` — Updates com guards + asserts (comentado)

---

## 1. Resumo Executivo

**Eventos (não mudam com saneamento):**
| Métrica | Valor |
|---------|-------|
| novas_matriculas | 23 |
| evasoes | 13 |
| taxa_renovacao | 88,37% |
| reajuste_parcelas | 12,95% |

**Estoque — Simulação no banco real (regra correta):**
| Métrica | ANTES | DEPOIS A (28 correções) | DEPOIS B (+ banda) | Δ B vs Atual |
|---------|-------|------------------------|-------------------|-------------|
| alunos_ativos | 515 | 500 | **495** | **-20** |
| alunos_pagantes | 485 | 474 | **473** | **-12** |
| matriculas_ativas | 582 | 567 | 567 | -15 |
| matriculas_banda | 45 | 43 | 43 | -2 |
| churn_rate | 2,68% | 2,74% | 2,75% | +0,07 p.p. |

**Cenários:**
- **ANTES:** Snapshot atual do banco (data_saida inconsistente)
- **DEPOIS A:** Após 28 correções de ciclo de vida (sem regra curso_id IS NULL)
- **DEPOIS B:** Após correções + **nova regra** excluindo `cursos.is_projeto_banda=true` de ativos/pagantes

---

## 2. Regras Aplicadas na Simulação

1. **Snapshot no fim do mês:** `data_matricula <= 2026-05-31` AND (`data_saida > 2026-05-31` OR `data_saida IS NULL`)
2. **Nova regra banda:** `cursos.is_projeto_banda = false` para ativos/pagantes (continua em matriculas_banda)
3. **NÃO filtrar curso_id IS NOT NULL globalmente** — Giovanna 1619 (ativo, curso_id=NULL, dados Emusys) permanece no snapshot
4. **Pagante:** `tipos_matricula.conta_como_pagante = true`
5. **2º curso:** excluído de ativos/pagantes, incluído em matriculas_ativas
6. **Arthur (47):** mantém `data_saida='2026-01-09'`, só muda `status='inativo'`

---

## 3. Grupos de Correção (28 alunos)

### Grupo A — Preencher data_saida (16 casos)

| ID | Nome | data_saida Nova | Pagante? | Snapshot Maio? |
|----|------|-----------------|----------|----------------|
| 106 | Emily Souza de Oliveira | 2026-03-05 | Sim | ❌ Não |
| 85 | Davi Borges da Silva Nascimento | 2026-04-25 | Sim | ❌ Não |
| 94 | Davi Rosendo Chaves Vieira | 2026-04-01 | Sim | ❌ Não |
| 131 | Gabriel Pereira Morais | 2026-03-03 | Sim | ❌ Não |
| 137 | Georgie Jefferson de Mello Basílio | 2026-05-07 | Sim | ❌ Não |
| 149 | Guilherme Gama Clavelario Nunes | 2026-05-04 | Sim | ❌ Não |
| 165 | Heitor Thadeu Caciano | 2026-04-11 | Sim | ❌ Não |
| 224 | Laura Peres de Souza | 2026-04-02 | Sim | ❌ Não |
| 258 | Luís Rafael Sousa dos Santos | 2026-05-06 | Sim | ❌ Não |
| 270 | Manuela Piveta Schulz | 2026-04-02 | Sim | ❌ Não |
| 327 | Murilo Martellote de Assis | 2026-03-06 | Sim | ❌ Não |
| 354 | Pedro Martellote de Assis | 2026-03-06 | Sim | ❌ Não |
| 384 | Sophia Maciel Magalhaes | 2026-04-10 | Sim | ❌ Não |
| 11 | Alexandre Wallace Bispo Oliveira | 2026-03-14 | Não | ❌ Não |
| 118 | Felipe Marques Gevezier | 2026-03-23 | Não | ❌ Não |
| 1377 | Alexandre de Sousa Serra | 2026-04-01 | Não | ❌ Não |

**Impacto:** Remove 16 do snapshot de Maio (13 pagantes, 3 não-pagantes).

### Grupo B — Status='inativo', manter data_saida (1 caso)

| ID | Nome | data_saida Atual | Ação | Snapshot? |
|----|------|-----------------|------|-----------|
| 47 | Arthur Souza Del Bosco | 2026-01-09 | status → inativo | ❌ Não |

**Regra:** `MANTER data_saida='2026-01-09'`. NÃO limpar.

### Grupo C — Limpar data_saida (5 casos)

| ID | Nome | data_saida Atual | data_saida Esperada (guard) | Ação | Snapshot? |
|----|------|-----------------|---------------------------|------|-----------|
| 31 | Anne Krissya Cordeiro | 2026-02-24 | = '2026-02-24' | → NULL | ✅ Sim |
| 263 | Luiza Mazeliah do Nascimento | 2026-03-02 | = '2026-03-02' | → NULL | ✅ Sim |
| 323 | Miguel Santos Borges | 2026-02-02 | = '2026-02-02' | → NULL | ✅ Sim |
| 405 | Vicente Dias Botelho | 2026-02-05 | = '2026-02-05' | → NULL | ✅ Sim |
| 949 | Cassyo Lucas Prado Silva | 2026-02-14 | = '2026-02-14' | → NULL | ✅ Sim |

**Impacto:** Adiciona 5 ativos confirmados pelo Alf (4 pagantes, 1 bolsista).

### Grupo D — Não matriculadas (2 casos)

| ID | Nome | Status | data_saida Atual | Ação | Snapshot? |
|----|------|--------|-----------------|------|-----------|
| 1450 | Maria Eduarda de Lima Bomfim Pedro | inativo | NULL | → 2026-05-31 | ❌ Não |
| 1378 | Ana Julia de Oliveira Gomes | inativo | NULL | → 2026-05-31 | ❌ Não |

### Grupo E — Excluídos (2 casos)

| ID | Nome | Status | data_saida Atual | Ação | Snapshot? |
|----|------|--------|-----------------|------|-----------|
| 945 | Luciano da Silva Bernardino | inativo | NULL | → 2026-05-31 | ❌ Não |
| 1598 | Alexandre Dos Santos | inativo | NULL | → 2026-05-31 | ❌ Não |

**Nota sobre Alexandre Dos Santos (1598):**
- `status = inativo`
- `valor_parcela = 0`
- `tipo_matricula_id = 1 (Regular)` → conta_como_pagante=true
- `curso_id = NULL`
- **Decisão:** corte técnico `data_saida='2026-05-31'`. Sai do snapshot. Se futuramente tiver curso, reavalia.

---

## 4. Alerta de Qualidade de Dados

**Giovanna Campos Peixoto Ueoka (id 1619)**

| Campo | Valor | Problema |
|-------|-------|----------|
| status | ativo | ✅ OK |
| data_saida | NULL | ✅ OK |
| valor_parcela | 387,00 | ✅ OK |
| tipo_matricula_id | 1 (Regular) | ✅ OK |
| curso_id | NULL | ⚠️ **INCOMPLETO** |

**Contexto:**
- Emusys: Teclado/Piano, Prof. Fabricio, em andamento até 10/02/2027, mensalidade 447,00
- Supabase: curso_id=NULL

**Ação:** NÃO excluir do snapshot por curso_id=NULL. Criar alerta de qualidade de dados para completar curso_id no cadastro.

---

## 5. Reconciliação dos Números

### alunos_ativos: 515 → 495 (-20)

| Fator | Δ |
|-------|---|
| ANTES | 515 |
| Grupo A: remove 16 inativos fantasmas | -16 |
| Grupo C: adiciona 5 ativos confirmados | +5 |
| Grupo D: remove 2 não-matriculadas | -2 |
| Grupo E: remove 2 excluídos | -2 |
| Grupo B/F: já excluídos ou inativos | 0 |
| **DEPOIS A** | **500** |
| Nova regra banda: remove 5 ativos banda (Barbara, Alan, Ana Julia, Leamsi, Leticia, Pedro Lucas, Maria → 7, mas 2 já saíram no D, sobram 5) | -5 |
| **DEPOIS B** | **495** |

### alunos_pagantes: 485 → 473 (-12)

| Fator | Δ |
|-------|---|
| ANTES | 485 |
| Grupo A: remove 13 pagantes fantasmas | -13 |
| Grupo C: adiciona 4 pagantes confirmados | +4 |
| Grupo D/E: remove 1 pagante (Luciano) | -1 |
| **DEPOIS A** | **474** |
| Nova regra banda: remove 1 pagante (Barbara) | -1 |
| **DEPOIS B** | **473** |

---

## 6. Impacto no Churn Rate

| Cenário | Evasões | Pagantes | Churn |
|---------|---------|----------|-------|
| ANTES | 13 | 485 | 2,68% |
| DEPOIS A | 13 | 474 | 2,74% |
| DEPOIS B | 13 | 473 | 2,75% |

**Importante:** As evasões NÃO mudam. São eventos baseados em `movimentacoes_admin`. O saneamento corrige apenas o denominador (pagantes reais).

---

## 7. Alunos Afetados pela Nova Regra Banda

7 alunos com `is_projeto_banda = true`:

| ID | Nome | Status | Pagante? | Ação regra banda |
|----|------|--------|----------|-----------------|
| 49 | Barbara Ribeiro Alves | ativo | Sim (parcela=NULL, Regular) | ❌ Excluir de ativos/pagantes |
| 1375 | Alan Samico | inativo | Não | ❌ Excluir de ativos |
| 1378 | Ana Julia | inativo | Não | ❌ Excluir de ativos |
| 1393 | Leamsi | inativo | Não | ❌ Excluir de ativos |
| 1395 | Leticia Fernandes Turques | ativo | Não | ❌ Excluir de ativos |
| 1404 | Pedro Lucas da Silva Brandão | ativo | Não | ❌ Excluir de ativos |
| 1450 | Maria Eduarda | inativo | Não | ❌ Excluir de ativos |

> Todos continuam em `matriculas_banda` (43 total DEPOIS A/B).

---

## 8. Próximos Passos

1. **Alf aprova** os arquivos v3
2. **Executar** `SIMULACAO_SANEAMENTO_CG_MAIO2026_V3.sql` no SQL Editor (validar preview)
3. **Descomentar e executar** `UPDATE_SANEAMENTO_CG_MAIO2026_V3.sql`
4. **Validar** com query:
   ```sql
   SELECT id, nome, status, data_saida
   FROM alunos
   WHERE id IN (11, 31, 47, 85, 94, 106, 118, 131, 137, 149, 165, 224, 258, 263, 270, 323, 327, 354, 384, 405, 945, 949, 1377, 1378, 1450, 1598)
   ORDER BY id;
   ```
5. **Atualizar** `recalcular_dados_mensais`: adicionar `AND COALESCE(c.is_projeto_banda, false) = false` em ativos/pagantes
6. **Executar** `recalcular_dados_mensais(2026, 5, '2ec861f6-023f-4d7b-9927-3960ad8c2a92')`
7. **Comparar** snapshot gravado vs simulação DEPOIS B
8. **Se OK:** replicar para Barra e Recreio, depois backfill Jan-Abr

---

## 9. Diferença para Versão Anterior (v2 → v3)

| Problema v2 | Correção v3 |
|------------|-------------|
| `curso_id IS NOT NULL` global excluía Giovanna 1619 (aluna real) | **Removido.** Apenas excluir `is_projeto_banda = true` |
| Arthur 47: simulação virtual limpava data_saida | **Corrigido.** Grupo B/F mantém data_saida atual |
| Updates sem asserts de contagem | **ASSERTS:** RAISE EXCEPTION se A≠16, B≠1, C≠5, D≠2, E≠2 |
| Grupo C sem guard por data_saida esperada | **Guards individuais:** cada ID com data_saida exata esperada |
| Números não batiam com simulação do Alf | **Batem:** 515/485/582/45 → 500/474/567/43 → 495/473/567/43 |
