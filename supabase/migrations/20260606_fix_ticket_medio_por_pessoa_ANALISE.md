# Análise: Patch do Ticket Médio vs Versão Oficial

## Base de comparação
- **Oficial (2026-05-31):** `20260531_fix_renovacoes_reajuste_views.sql`
- **Patch problemático:** `.claude/memory/patch-view-ticket-medio-por-pessoa.sql` (já aplicado no banco)
- **Proposta limpa:** `20260606_fix_ticket_medio_por_pessoa_LIMPO.sql` (novo)

---

## Regressões identificadas no patch

### 1. `inadimplencia_pct` hardcoded 0
| | Oficial | Patch |
|---|---|---|
| Fórmula | `qtd_inadimplentes / alunos_pagantes * 100` | `0` |
| Impacto | Mostra % real de inadimplência | Sempre 0% |
| Status na LIMPA | ✅ Preservado | |

### 2. `novas_matriculas` hardcoded 0
| | Oficial | Patch |
|---|---|---|
| Fonte | CTE `matriculas_mes` (tabela `alunos`) | `0::integer` |
| Filtros | Exclui 2º curso, banda, coral, bolsistas | Nada |
| Impacto | Mostra novas matrículas reais | Sempre 0 |
| Status na LIMPA | ✅ Preservado | |

### 3. `faturamento_realizado` = `mrr` (não desconta inadimplência)
| | Oficial | Patch |
|---|---|---|
| Fórmula | `mrr - mrr_inadimplente` | `mrr` |
| Impacto | Previsto ≠ Realizado quando há inadimplentes | Sempre iguais |
| Status na LIMPA | ✅ Preservado | |

### 4. `snapshot_base` + `params` introduzem filtro temporal inédito
O patch adiciona CTE `params` (inicio_mes/fim_mes) e `snapshot_base` que filtra:
```sql
AND a.data_matricula <= p_1.fim_mes
AND (a.data_saida IS NULL OR a.data_saida > p_1.fim_mes)
```

A view oficial (20260531) usa `CURRENT_DATE` diretamente sem essa granularidade. Isso altera a semântica temporal da view.

| | Oficial | Patch |
|---|---|---|
| Snapshot | Status atual do aluno | Status no último dia do mês |
| Impacto | Alunos evadidos este mês ainda apareciam em "ativos" se evadiram após o fim do mês | Snapshot congelado no fim do mês |
| Status na LIMPA | ✅ Preservado (sem snapshot_base) | |

### 5. `total_alunos_ativos` e `total_alunos_pagantes` passam a ser por pessoa
| | Oficial | Patch |
|---|---|---|
| Agrupamento | `count(*)` (linhas/matriculas) | `count(DISTINCT nome)` (pessoas) |
| Impacto | Conta matrículas | Conta indivíduos |
| Exemplo | Davi CG (4 cursos) = 4 ativos | Davi CG (4 cursos) = 1 ativo |
| Status na LIMPA | ✅ Preservado (count de linhas) | |

**Nota:** Isso é uma mudança de semântica que já foi discutida em outras migrations. A LIMPA preserva o comportamento oficial (linhas) para não quebrar KPIs existentes. Se desejar mudar para pessoas, deve ser feito em migration separada e aprovada.

### 6. Coral por filtro de nome
| | Oficial | Patch |
|---|---|---|
| Filtro | `c.nome !~~* '%canto coral%'` | `c.nome !~~* '%canto coral%'` |
| Status | Herdado da base — NÃO é regressão do patch | |
| Status na LIMPA | ✅ Preservado | |

### 7. Churn sem excluir transferência
| | Oficial | Patch |
|---|---|---|
| Fórmula | `total_evasoes / alunos_pagantes` | `total_evasoes / alunos_pagantes` |
| Nota | A view `vw_kpis_retencao_mensal` já subtrai transferências. A `vw_kpis_gestao_mensal` oficial NÃO subtrai. | |
| Status | Herdado da base — NÃO é regressão do patch, mas gap conhecido | |
| Status na LIMPA | ✅ Preservado (mesmo gap) | |

### 8. `matriculas_ativas` adicionado no SELECT
O patch adiciona `matriculas_ativas = count(*)` no SELECT final. Isso não existia na versão oficial.

| Status na LIMPA | ✅ Removido (não existia na base) | |

---

## Resumo: o que muda na LIMPA vs o patch aplicado no banco

| Campo/Regra | Patch (atual no banco) | LIMPA (proposta) |
|---|---|---|
| `ticket_medio` | Por pessoa | Por pessoa |
| `inadimplencia_pct` | 0 | Calculado real |
| `novas_matriculas` | 0 | Da CTE matriculas_mes |
| `faturamento_realizado` | = mrr | = mrr - inadimplente |
| `total_alunos_ativos` | Pessoas | Linhas |
| `total_alunos_pagantes` | Pessoas | Linhas |
| `snapshot_base` + `params` | Presente | Removido |
| `matriculas_ativas` | Presente | Removido |
| `churn_rate` | evasoes/pagantes | evasoes/pagantes |
| `taxa_renovacao` | movimentacoes_admin | movimentacoes_admin |
| `reajuste_medio` | movimentacoes_admin | movimentacoes_admin |

---

## Recomendação

1. **Aprovar a LIMPA** como migration oficial — apenas o patch do ticket médio por pessoa.
2. **Rodar a LIMPA no banco** para corrigir as regressões (inadimplencia=0, novas_matriculas=0, faturamento_realizado errado).
3. **Não versionar o patch problemático** como migration oficial.
4. **Se desejar** mudar `total_alunos_ativos/pagantes` de linhas para pessoas, criar migration separada.
