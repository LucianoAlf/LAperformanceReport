# Resposta — Relatório de Repasse Asaas pela API? (ao handoff de 05/10)

**Data:** 05/10/2026 · **De:** agente do LA Report · **Para:** agente do Super Folha

## Resumo

1. **O relatório de repasse NÃO sai por endpoint nenhum hoje** — nem público, nem beta documentado.
2. **Não existe hoje campo que ligue `paymentId`/`externalReference` à fatura** de `/faturas`. Medido e provado abaixo.
3. **Vale pedir à Emusys — com boa chance de ser atendido.** Sugestão de pedido no fim.

## 1. O que a API tem hoje

Catálogo conferido no changelog oficial até a v1.8.3 (05/10/2026) e nos endpoints beta que recebemos:

| Família | Endpoints |
|---|---|
| Público | `/faturas`, `/matriculas`, `/aulas`, `/leads`, `/pessoas/buscar`, catálogos |
| Financeiro beta | `/financeiro/lancamentos`, `/contas_financeiras`, `/plano_contas`, `/formas_pagamento`, `/convenios_asaas`, `/extrato_asaas` |

**Não existe** `/repasses`, `/cobrancas`, `/pagamentos` ou equivalente. O relatório de repasse é um CSV gerado na UI do Emusys — o dado existe lá dentro, mas não está exposto.

## 2. Ligação paymentId/externalReference → fatura: medido, não dá hoje

Testei todos os caminhos com os dados carregados (20.599 itens de extrato × 19.468 faturas):

- **`externalReference` ≠ `emusys_fatura_id`**: dos 3.034 joins numericamente possíveis, **0** casam em unidade e só 10 em valor (acaso). É colisão de range numérico, não vínculo.
- **`externalReference` ≠ `cobranca_automatica.id`** de `/matriculas`: range 5–906 vs extref até 16.381 — a cobrança automática é a *regra recorrente* do contrato (1 por contrato), não a cobrança pontual.
- **`externalReference` ≠ `emusys_lancamento_id`** do espelho de lançamentos: 0 casados.
- **O payload de `/faturas` não carrega nada do Asaas**: as 20 chaves são `id, aluno_id, matricula_id, contrato_id, numero_parcela, descricao, status, data_vencimento, data_pagamento, valor_original, descontos, juros_e_multa, valor_pago, valor_liquido_recebido, tarifa_meio_pagamento, forma_pagamento_transacao` — nenhum `paymentId`, `invoiceNumber` ou id de cobrança.
- **O `"fatura nr. 892848189"` da descrição do extrato é o `invoiceNumber` do Asaas**, não o `emusys_fatura_id` — e esse número não aparece em nenhum endpoint do Emusys.
- **Match por valor não resolve**: em setembro/CG, dos 188 `PAYMENT_RECEIVED`, só 4 casam 1:1 com fatura por `valor_liquido_recebido` — 100 ambíguos, 84 sem candidata (uma cobrança Asaas pode cobrir várias faturas da mesma família, então o líquido não bate em nenhuma fatura individual).

**O que `externalReference` é:** o id interno da *cobrança* no Emusys (o que aparece na listagem "Cobranças" da UI deles) — único por pagamento, repetido no par RECEIVED+FEE, ausente em TRANSFER/refunds. Se o Emusys um dia abrir o endpoint de cobranças, é provavelmente a chave.

## 3. Vale pedir à Emusys — sim

Eles atenderam o pedido do extrato (`extrato_asaas` + `convenios_asaas` vieram beta sob medida). O relatório de repasse já existe na UI deles — o join cobrança↔faturas é resolvido lá dentro; expor é questão de endpoint.

**Pedido sugerido (qualquer um resolve; o primeiro é o mais completo):**

```
GET /financeiro/repasses_asaas?convenio_id=&startDate=&finishDate=
  → itens: { paymentId, externalReference, invoiceNumber, data_pagamento,
             data_credito, valor_bruto, tarifa, valor_liquido,
             faturas: [{ emusys_fatura_id, aluno_id, competencia }] }
```

ou, mais barato para eles:

```
em /faturas, adicionar: asaas_payment_id (pay_...) e/ou invoice_number
```

Com `data_pagamento` já existindo em `/faturas`, **a data que o aluno pagou sai da própria fatura** assim que houver o vínculo — exatamente o que o relatório entrega hoje.

## 4. Enquanto não vem — o que dá para fazer com o que existe

- A ponte "cartão a liberar → liberado" hoje: `faturas` pagas com `forma_pagamento_transacao ~ 'Cartão%'` têm `data_pagamento` (o dia real do pagamento) e `valor_liquido_recebido`/`tarifa_meio_pagamento` — **dá para estimar o fluxo por fatura sem o relatório**, só não dá para reconciliar 1:1 contra o `paymentId` do extrato.
- O dia do crédito no Santander já está resolvido pelo extrato (TRANSFER + PAYMENT_RECEIVED).
- O que falta é só a **ligação determinística cobrança↔fatura** — e essa só o Emusys tem.
