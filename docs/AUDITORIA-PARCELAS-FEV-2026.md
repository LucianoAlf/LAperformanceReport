# 📋 AUDITORIA PARCELAS FEV/2026 — BARRA

**Data**: 15/02/2026
**Fonte**: CSV Emusys vs Banco de Dados Supabase

---

## 📊 RESUMO DO CSV

| Situação | Quantidade | Descrição |
|----------|------------|-----------|
| `pago` | 196 | Parcelas já pagas |
| `vencido` | 7 | Inadimplentes (vencidas e não pagas) |
| `vencendo_hoje` | 4 | Vencendo em 15/02/2026 |
| `a_vencer` | 2 | Ainda vão vencer |
| `outro` | 2 | Vencimento 27/02 |
| **TOTAL** | **211** | (excluindo vendas de produtos e pagamentos avulsos) |

---

## 🔴 AÇÃO 1: ATUALIZAR STATUS DE PAGAMENTO

### Alunos que PAGARAM (situacao = 'pago' no CSV) mas estão como 'inadimplente' no BD:

**Total: ~180 alunos precisam mudar de `inadimplente` → `em_dia`**

*(A lista completa está no CSV, todos com `situacao = pago` devem ter `status_pagamento = em_dia`)*

---

## 🟡 AÇÃO 2: DIVERGÊNCIAS DE VALORES (CSV vs BD)

| # | Aluno | Curso | CSV (R$) | BD (R$) | Diferença | Ação |
|---|-------|-------|----------|---------|-----------|------|
| 1 | Agatha Carias da Silva Pereira | Teclado | 385.00 | 477.00 | -92.00 | ⚠️ Verificar |
| 2 | Alana Vasconcelos de Araujo | Canto | 465.00 | 420.00 | +45.00 | Atualizar BD |
| 3 | Ana Paula dos Santos Souza | Teclado | 402.00 | 365.00 | +37.00 | Atualizar BD |
| 4 | Arthur Moreno Godinho | Bateria | 402.00 | 365.00 | +37.00 | Atualizar BD |
| 5 | Benício Carvalho | Bateria | 402.00 | 365.00 | +37.00 | Atualizar BD |
| 6 | Cecília suhett de Oliveira | Teclado | 492.76 | 482.00 | +10.76 | Atualizar BD |
| 7 | Natan Pereira Calvo Demidoff | Bateria | 385.00 | 457.00 | -72.00 | ⚠️ Verificar |
| 8 | Paulo César Benzi Filho | Piano | 446.18 | 437.00 | +9.18 | Atualizar BD |
| 9 | Pedro Henrique Moreno Godinho | Bateria | 402.00 | 365.00 | +37.00 | Atualizar BD |
| 10 | Pérola Madeira Maturano | Canto | 375.00 | 350.00 | +25.00 | Atualizar BD |
| 11 | Rafael Kelly Ximenes Apoliano | Bateria | 404.00 | 377.00 | +27.00 | Atualizar BD |
| 12 | Saulo Reina da Rocha | Bateria | 393.98 | 385.00 | +8.98 | Atualizar BD |
| 13 | Sergio Paulo Fogaça de Carvalho | Violão | 403.00 | 365.00 | +38.00 | Atualizar BD |
| 14 | Thalita Araujo Costa | Canto | 482.00 | 437.00 | +45.00 | Atualizar BD |
| 15 | Thoth dos Anjos de Oliveira | Mus. Bebês | 470.00 | 426.00 | +44.00 | Atualizar BD |
| 16 | Vitoria da Luz | Canto | 482.00 | 437.00 | +45.00 | Atualizar BD |
| 17 | Alicia Reina | Teclado | 393.98 | 385.00 | +8.98 | Atualizar BD |
| 18 | Juliana de Oliveira almeida | Piano | 437.99 | ? | ? | Verificar se existe |

---

## 🟢 AÇÃO 3: INADIMPLENTES REAIS (vencido no CSV)

| # | Aluno | Curso | Valor | Vencimento | Dias Atraso |
|---|-------|-------|-------|------------|-------------|
| 1 | Juliana de Oliveira almeida | Piano | 437.99 | 05/02 | 10 |
| 2 | Saulo Reina da Rocha | Bateria | 393.98 | 05/02 | 10 |
| 3 | Alicia Reina | Teclado | 393.98 | 05/02 | 10 |
| 4 | Juliana de Oliveira almeida | Canto | 416.50 | 05/02 | 10 |
| 5 | Maria Flor Silveira | Violão | 446.90 | 07/02 | 8 |
| 6 | Joaquim Candido Querido Ferraz Soares | Canto | 456.98 | 08/02 | 7 |
| 7 | Lorenzo Tavares Bernardino de Lima | Bateria | 357.35 | 12/02 | 3 |

**Total inadimplente: R$ 2.903,68**

---

## 🔵 AÇÃO 4: EM ABERTO (vencendo_hoje ou a_vencer)

| # | Aluno | Curso | Valor | Vencimento | Status |
|---|-------|-------|-------|------------|--------|
| 1 | Vinicius Cunha Oliveira | Bateria | 365.00 | 15/02 | vencendo_hoje |
| 2 | Bernardo Becker Oliveira | Bateria | 400.00 | 15/02 | vencendo_hoje |
| 3 | Lívia Becker Oliveira | Piano | 365.00 | 15/02 | vencendo_hoje |
| 4 | Aline Borges Becker Oliveira | Canto | 365.00 | 15/02 | vencendo_hoje |
| 5 | Anna Luisa Peres Alves | Violão | 447.00 | 16/02 | a_vencer |
| 6 | Davi Lima Quintarelli | Bateria | 487.00 | 20/02 | a_vencer |
| 7 | Theo Martinelli Torres | Bateria | 385.00 | 27/02 | outro |
| 8 | Lucca Martinelli Torres | Violão | 385.00 | 27/02 | outro |

---

## ⚠️ REGISTROS IGNORADOS (não são parcelas de alunos)

| Linha | Nome | Descrição | Valor |
|-------|------|-----------|-------|
| 192 | Pessoa sem cadastro | Pagamento aluna Sara Gomes (Indevida) | 440.00 |
| 193 | Pessoa sem cadastro | Repasse parcelas | 645.05 |
| 195 | Arthur Titus Rego Von Bertrand | Venda PALHETA CAVEIRA | 18.00 |
| 222 | Lucca Martinelli Torres | paleta | 9.00 |

---

## ✅ PRÓXIMOS PASSOS

1. **Confirmar** se os valores do CSV são os corretos (fonte de verdade)
2. **Executar** atualização de `status_pagamento` para quem pagou
3. **Executar** atualização de `valor_parcela` para os divergentes
4. **Manter** como `inadimplente` apenas os 7 realmente vencidos
5. **Manter** como `em_aberto` (ou `-`) os 8 que ainda vão vencer

---

*Gerado automaticamente pela auditoria de parcelas*
