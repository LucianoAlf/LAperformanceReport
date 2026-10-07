# Extrato Asaas — espelho pronto no LA Report (resposta ao handoff de 05/10)

**Data:** 05/10/2026 · **Projeto:** `ouqwbbermlzqqvtqwlul` (LA Report)
**Decisão do Alf (05/10):** o LA Report chama o Emusys, guarda o espelho e expõe um export. O Super Folha só consome pelo export. A Maria continua lendo só o Super Folha.

---

## 1. Entrega

| Peça | Onde |
|---|---|
| Espelho item a item | `financeiro_asaas_extrato` — `(unidade_id, convenio_id, asaas_id)` único, nada é apagado |
| Catálogo de convênios | `financeiro_asaas_convenios` — atualizado a cada rodada |
| Varredura por dia | `financeiro_asaas_varredura_dias` — status `completo`/`erro` por (convênio × dia) + `balance_quebras` |
| Fila durável | `sync_asaas_extrato_queue` + RPCs enqueue/claim/renew/complete/fail — serializada com as filas Emusys existentes |
| Edge sync | `sync-asaas-emusys` — `enqueue_daily` / `enqueue_range` / `enqueue_monthly` / `worker` / `queue_status` |
| **Edge export** | **`export-financeiro-asaas-extrato`** |
| Backfill | `scripts/backfill-asaas-extrato.mjs` (retomável, blocos mensais) |
| Crons | worker 1/min · diário por unidade 08h BRT escalonado · revarredura do mês anterior dia 1 |
| Testes | `_shared/financeiroAsaas.test.ts` (7/7) · `tests/asaasExtratoExportContrato.test.mjs` (7/7) |

Migrations: `20261005120000` (espelho), `20261005130000` (fila), `20261005140000` (crons). RLS fechado: só `service_role`.

## 2. Export

```
POST https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/export-financeiro-asaas-extrato
x-super-folha-sync-secret: <o mesmo segredo do export-financeiro-lancamentos>
{ "inicio": "2026-09-01", "fim": "2026-09-30", "unidade_id": null, "convenio_id": null, "incluir_payload": false }
```

- Intervalo máximo 366 dias por chamada (413 dias → 400).
- `incluir_payload: true` adiciona `payload` cru por item (padrão: não sai).
- Filtros `unidade_id` e `convenio_id` testados e funcionando.
- Resposta: `itens[]` (vivos do período, com `primeira_vez_visto`, `ultima_vez_visto`, `alterado_em`, `sumiu_em`), `totais_por_tipo[]` (convênio × tipo: quantidade + soma), `varredura[]` (janela, dias completos/erro, último erro, fronteira da carga inicial), `convenios[]` (id, unidade, status, conta_bancaria) e `controle` (vivos, sumidos, amostra).

## 3. Carga inicial — concluída 05/10

- 366 jobs, **100% succeeded**, zero falhas.
- **4.032 dias completos** (1.008 dias × 4 convênios, 01/01/2024 → 04/10/2026), **0 dias com erro, 0 quebras na cadeia de `balance`**.
- **20.599 itens**, 0 marcados como sumidos.
- Asaas da CG responde desde 03/01/2024; Barra desde 10/09/2024; Recreio desde 06/09/2024 — dias anteriores ao onboarding de cada convênio ficam `completo` com 0 itens (vazio legítimo, não erro).

## 4. Setembro/2026 — confere com a tabela do handoff (centavo a centavo)

| Unidade | PAYMENT_RECEIVED | PAYMENT_FEE | TRANSFER |
|---|---|---|---|
| CG (conv 5+7) | 188 · **R$ 70.767,17** | **−R$ 717,71** | **−R$ 70.049,46** |
| Barra (conv 3) | 218 · **R$ 94.208,90** | **−R$ 981,89** | **−R$ 93.227,01** |
| Recreio (conv 4) | 263 · **R$ 110.697,46** | **−R$ 1.176,19** | **−R$ 109.521,27** |

Detalhe convênio: CG/5 = 105 recebidos · 39.825,61 / −383,63 / −39.441,98; CG/7 = 83 · 30.941,56 / −334,08 / −30.607,48.

## 5. Tipos históricos além dos 3 de setembro (safra completa 2024→hoje)

| `type` | Qtd | Soma | Onde/quando |
|---|---|---|---|
| `PAYMENT_RECEIVED` | 9.824 | +3.905.457,34 | todas |
| `PAYMENT_FEE` | 9.824 | −42.081,50 | todas — **exatamente 1:1 com RECEIVED** |
| `TRANSFER` | 928 | −3.873.683,59 | todas |
| `PIX_TRANSACTION_DEBIT_REFUND` | 8 | +13.117,77 | devolução de Pix enviado (2024-09→2026-03) |
| `CONTRACTUAL_EFFECT_SETTLEMENT` | 5 | −1.150,17 | CG, ago/2025 |
| `PAYMENT_REVERSAL` | 4 | −1.577,50 | CG/REC, fev–mai/2026 |
| `PAYMENT_FEE_REVERSAL` | 4 | +17,65 | pares dos reversais |
| `CHARGEBACK` / `CHARGEBACK_REVERSAL` | 1+1 | −445,46 / +445,46 | Recreio, fev/2026 |

O espelho aceita qualquer `type` novo — não há lista fechada em lugar nenhum.

## 6. O que é `externalReference`

Resposta curta: **é o identificador interno da cobrança no Emusys** — o campo `externalReference` do Asaas é texto livre preenchido por quem cria a cobrança via API (o Emusys), e ele carrega um número sequencial (~11k–16k em set/2026) que **não é** `emusys_fatura_id` nem `emusys_lancamento_id` do espelho financeiro.

Evidência: os 397 joins numéricos possíveis entre `external_reference` e `emusys_fatura_id` são colisões puras — **0%** casam em valor e **0%** casam em unidade. Nem o número da fatura da descrição (`"fatura nr. 892848189"`, que é o `invoiceNumber` do Asaas) aparece nos payloads das faturas/lançamentos do Emusys — o Emusys não expõe hoje o vínculo cobrança↔fatura nos endpoints disponíveis.

Comportamento medido:
- ~97% dos pagamentos têm `externalReference` (588/606 em set); TRANSFER e refunds nunca têm.
- Repete **1× por pagamento**: o `PAYMENT_RECEIVED` e seu `PAYMENT_FEE` dividem `paymentId` **e** `externalReference`.
- Links úteis que existem de verdade: `paymentId` (único por cobrança), `transferId`/`pixTransactionId` (transferências), e o `invoiceNumber` dentro de `description`.

Se o Emusys abrir o endpoint de cobranças um dia, `externalReference` provavelmente é a chave. Até lá, tratem como id opaco por pagamento.

## 7. Rotinas

- **Diária:** últimos 10 dias encerrados por convênio, 08h BRT por unidade (CG 11:00, Barra 11:10, Recreio 11:20 UTC) — pega estorno/chargeback/liberação atrasada.
- **Mensal:** dia 1, 09:30 BRT — revarre o mês anterior inteiro.
- **Worker:** 1/min; a fila **cede** quando qualquer outra fila Emusys está rodando (rate limit é por token da escola; ~1,1 s entre chamadas).
- **Integridade:** dia só fica `completo` se a janela que o cobre veio inteira **e** a cadeia `balance anterior + value = balance` não quebrou nele; quebra marca o dia `erro`, e dia com erro nunca vale como vazio. Item vivo que some numa varredura completa → `sumiu_em` (nunca apagado, sai dos vivos/totais).

## 8. Sugestão de consumo

- **Carga inicial:** mês a mês 01/2024→hoje (`inicio`/`fim` por mês).
- **Rotina:** últimos 15 dias; tratar `dias_periodo_com_erro>0` como "não confie na janela daquele convênio" — o dado vai se autocorrigir na revarredura.
- `carga_inicial_concluida_ate` na `varredura[]` diz até onde a carga histórica cobriu com verificação.
