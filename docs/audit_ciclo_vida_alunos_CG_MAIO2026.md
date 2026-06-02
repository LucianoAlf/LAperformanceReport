# Saneamento de Ciclo de Vida — Campo Grande / Maio 2026

**Gerado em:** 31/05/2026  
**Unidade:** Campo Grande  
**Contexto:** Antes de executar `recalcular_dados_mensais` v2, identificamos inconsistências no ciclo de vida de 28 alunos que distorcem o snapshot de estoque.

---

## Contexto do Problema

A função v2 calcula estoque histórico por `data_matricula` + `data_saida`:
- Ativo no fim do mês = `data_matricula <= fim_mes` E (`data_saida IS NULL` OU `data_saida > fim_mes`)

A view live usa `status IN ('ativo', 'trancado')` — que é o estado **atual**, não snapshot.

**Resultado:** Divergência de 16 ativos e 10 pagantes entre a simulação e a view validada.

---

## Grupo A — Inativos sem `data_saida` (22 alunos)

Alunos com `status='inativo'` mas `data_saida IS NULL`. A função v2 os conta como presentes no snapshot de Maio. A view live os exclui corretamente (status != ativo/trancado), mas o snapshot está errado.

| # | ID | Nome | data_matricula | tipo_matricula | valor_parcela | movimentação_encontrada | mov_data | Recomendação |
|---|----|------|--------------|--------------|-------------|----------------------|---------|-------------|
| 1 | 106 | Emilly Souza de Oliveira | 2025-01-30 | Regular | 332,00 | evasao | 2026-03-07 | ✅ **AUTO: preencher `data_saida` = 2026-03-07** |
| 2 | 1450 | Maria Eduarda de Lima Bomfim Pedro | 2026-02-24 | Bolsista Integral | — | renovacao | 2026-05-02 | ⚠️ **VALIDAR: inativa com renovação recente. Verificar se saiu depois.** |
| 3 | 85 | Davi Borges da Silva Nascimento | 2018-05-03 | Regular | 377,00 | — | — | **VALIDAR HUGO: criar saída ou preencher data_saida** |
| 4 | 94 | Davi Rosendo Chaves Vieira | 2024-10-31 | Regular | 321,00 | — | — | **VALIDAR HUGO** |
| 5 | 131 | Gabriel Pereira Morais | 2024-10-24 | Regular | 337,00 | — | — | **VALIDAR HUGO** |
| 6 | 137 | Georgie Jefferson de Mello Basílio | 2025-02-13 | Regular | 450,00 | — | — | **VALIDAR HUGO** |
| 7 | 149 | Guilherme Gama Clavelario Nunes | 2024-02-29 | Regular | 357,00 | — | — | **VALIDAR HUGO** |
| 8 | 165 | Heitor Thadeu Caciano | 2023-01-28 | Regular | 447,00 | — | — | **VALIDAR HUGO** |
| 9 | 224 | Laura Peres de Souza | 2025-01-24 | Regular | 350,00 | — | — | **VALIDAR HUGO** |
| 10 | 258 | Luís Rafael Sousa dos Santos | 2025-04-14 | Regular | 380,00 | — | — | **VALIDAR HUGO** |
| 11 | 270 | Manuela Piveta Schulz | 2024-11-30 | Regular | 267,00 | — | — | **VALIDAR HUGO** |
| 12 | 327 | Murilo Martellote de Assis | 2021-05-15 | Regular | 367,00 | — | — | **VALIDAR HUGO** |
| 13 | 354 | Pedro Martellote de Assis | 2021-05-15 | Regular | 367,00 | — | — | **VALIDAR HUGO** |
| 14 | 384 | Sophia Maciel Magalhaes | 2024-11-14 | Regular | 360,00 | — | — | **VALIDAR HUGO** |
| 15 | 945 | Luciano da Silva Bernardino | 2026-02-09 | Regular | 327,00 | — | — | **VALIDAR HUGO** |
| 16 | 11 | Alexandre Wallace Bispo Oliveira | 2024-11-30 | Bolsista Parcial | 250,00 | — | — | **VALIDAR HUGO** (bolsista) |
| 17 | 118 | Felipe Marques Gevezier | 2025-09-29 | Bolsista Integral | — | — | — | **VALIDAR HUGO** (bolsista) |
| 18 | 1375 | Alan Samico do Nascimento | 2024-05-18 | Bolsista Integral | — | — | — | **VALIDAR HUGO** (bolsista) |
| 19 | 1377 | Alexandre de Sousa Serra | 2025-02-22 | Bolsista Integral | 0,00 | — | — | **VALIDAR HUGO** (bolsista) |
| 20 | 1378 | Ana Julia de Oliveira Gomes | 2023-01-26 | Bolsista Integral | — | — | — | **VALIDAR HUGO** (bolsista) |
| 21 | 1393 | Leamsi Guedes de Sant'anna | 2018-05-04 | Bolsista Integral | — | — | — | **VALIDAR HUGO** (bolsista) |
| 22 | 1598 | Alexandre Dos Santos | 2026-04-02 | Regular | 0,00 | — | — | **VALIDAR HUGO** (parcela zero) |

---

## Grupo B — Ativos com `data_saida` antiga (6 alunos)

Alunos com `status='ativo'` mas `data_saida <= 31/05/2026`. A view live os conta (status=ativo), mas a função v2 os exclui (data_saida antiga). O snapshot está errado em direção oposta.

| # | ID | Nome | data_matricula | data_saida | tipo_matricula | valor_parcela | movimentação_encontrada | mov_data | Recomendação |
|---|----|------|--------------|-----------|--------------|-------------|----------------------|---------|-------------|
| 1 | 31 | Anne Krissya Cordeiro da Silva Noé | 2023-01-27 | 2026-02-24 | Bolsista Parcial | — | renovacao | 2026-04-01 | ⚠️ **VALIDAR: saiu e voltou? `data_saida` anterior à renovação. Limpar data_saida?** |
| 2 | 263 | Luiza Mazeliah do Nascimento | 2023-01-26 | 2026-03-02 | Regular | 447,00 | renovacao | 2026-03-14 | ⚠️ **VALIDAR: `data_saida` anterior à renovação. Reativou? Limpar data_saida?** |
| 3 | 405 | Vicente Dias Botelho | 2023-01-27 | 2026-02-05 | Regular | 417,00 | renovacao | 2026-01-18 | ⚠️ **VALIDAR: renovou em Jan, saiu em Fev, mas ativo. Reativou depois?** |
| 4 | 47 | Arthur Souza Del Bosco | 2024-03-09 | 2026-01-09 | Regular | — | — | — | **VALIDAR HUGO: corrigir status para 'inativo' ou criar movimentação de saída** |
| 5 | 323 | Miguel Santos Borges | 2024-07-31 | 2026-02-02 | Regular | 374,00 | — | — | **VALIDAR HUGO: corrigir status para 'inativo' ou criar movimentação de saída** |
| 6 | 949 | Cassyo L P Silva | 2026-01-19 | 2026-02-14 | Regular | 365,00 | — | — | **VALIDAR HUGO: corrigir status para 'inativo' ou criar movimentação de saída** |

---

## Resumo de Classificação

| Classificação | Quantidade | Ação |
|--------------|-----------|------|
| ✅ Correção automática segura | 1 | Emily: preencher `data_saida` = 2026-03-07 |
| ⚠️ Validação obrigatória (inconsistência grave) | 4 | Maria Eduarda, Anne, Luiza, Vicente |
| 🔍 Validação humana (Hugo) — sem movimentação | 20 | Inativos sem data_saida e sem evasão registrada |
| 🔍 Validação humana (Hugo) — ativo com saída | 3 | Arthur, Miguel, Cassyo |
| **TOTAL** | **28** | — |

---

## Impacto nos KPIs de Maio/2026

| Métrica | Snapshot Atual (sujo) | Snapshot Pós-Saneamento (projeção) | Divergência |
|---------|---------------------|-----------------------------------|-------------|
| alunos_ativos | 515 | ~499 | -16 |
| alunos_pagantes | 485 | ~475 | -10 |
| churn_rate | 2,68% | 2,74% | +0,06 p.p. |

**Observação:** Eventos (novas_matriculas=23, evasoes=13, taxa_renovacao=88,37%, reajuste=12,95%) já estão validados e corretos. Apenas o estoque precisa de saneamento.

---

## Próximos Passos

1. **Hugo valida** os 28 casos e decide ação por aluno.
2. **Correções aplicadas** em `alunos.data_saida` e/ou `alunos.status`.
3. **Verificar** se existem casos similares em Barra e Recreio.
4. **Re-simular** a função v2 após saneamento.
5. **Só então:** executar `recalcular_dados_mensais(2026, 5, Campo Grande)`.
6. **Validar antes/depois** do snapshot.
7. **Se aprovado:** replicar para Barra e Recreio, depois backfill Jan-Maio 2026.

---

## Notas Técnicas

- **Função v2:** `recalcular_dados_mensais(p_ano, p_mes, p_unidade_id)` — `SECURITY DEFINER`, assinatura original.
- **Regra de snapshot:** `data_matricula <= fim_mes` E (`data_saida IS NULL` OU `data_saida > fim_mes`).
- **Problema raiz:** Inconsistência entre `status` e `data_saida` na tabela `alunos`.
- **Regra de negócio aprovada:** Snapshot histórico deve usar ciclo de vida por data, não status atual.
