# Parte financeira do LA Music Report — contrato para o Super Folha

**Data:** 14/09/2026 · **Projeto Supabase:** `ouqwbbermlzqqvtqwlul` (LA Report)
**Decisão do Alf:** o LA Report guarda o espelho financeiro do Emusys; o **Super Folha consome**; a Maria lê **só** o Super Folha. Ninguém fala direto com o Emusys a partir dos agentes.
**Público deste doc:** agente da Maria e agente de desenvolvimento do Super Folha.

---

## 1. O que existe de financeiro no LA Report (visão geral)

Existem **dois pipelines** financeiros. Eles NÃO se misturam:

| Pipeline | Fonte Emusys | O que cobre | Consumidor |
|---|---|---|---|
| **Contas a receber (faturas de mensalidade)** | `GET /faturas` | Parcelas/mensalidades dos alunos (receita contratada) | Tela "Faturas de Alunos", RPCs canônicas, Super Folha via `export-contas-receber` |
| **Fluxo de caixa (espelho de lançamentos)** — **NOVO 14/09** | `GET /financeiro/lancamentos` + 3 catálogos (BETA) | TUDO que movimentou caixa: entradas, saídas, transferências, estornos | Super Folha via `export-financeiro-lancamentos` |

A diferença importa: **fatura** é "o que deveria entrar" (parcela de contrato); **lançamento** é "o que movimentou de fato" (caixa). A mesma grana aparece nos dois — nunca some os dois mundos.

---

## 2. Pipeline NOVO: espelho do fluxo de caixa Emusys

### 2.1 Fonte (API Emusys beta, medido ao vivo em 14/09/2026)

`https://api.emusys.com.br/v1` — 4 endpoints:
`GET /financeiro/lancamentos`, `GET /financeiro/contas_financeiras`, `GET /financeiro/plano_contas`, `GET /financeiro/formas_pagamento`.

Item de lançamento:

```json
{
  "id": 82420,
  "data": "2026-08-05",
  "valor": -728.57,
  "natureza": "transferencia",
  "conta": { "id": 1002, "descricao": "" },
  "plano_contas": { "id": 12, "nome": "3.1.1 Parcelas" },
  "forma_pagamento": null,
  "descricao": "Repasse da Operadora (Pgtos em Débito) - Parcelas 08/2026 de ..."
}
```

**Fatores medidos que NÃO estão em doc nenhuma (confie aqui):**

1. **`natureza` tem 5 valores:** `entrada`, `saida`, `transferencia`, `estorno`, `estornado`.
2. **O sinal de `valor` não é derivável da natureza.** `estornado` já veio `-750` e positivo em outros casos. Leia sempre o sinal do campo.
3. **Transferência vem em 2 itens** (saída de uma conta + entrada na outra).
4. **"Repasse da Operadora" e "Transferido para a Tesouraria" chegam sem conta legível** — `conta: {id: 1002, descricao: ""}` (id fantasma fora do catálogo) ou `null`, e `forma_pagamento: null`.
5. **Estorno liga no item estornado pelo texto:** `descricao: "Estorno ref.82155 - Parcela 07/2026..."` → aponta o `id` 82155.
6. **Plano de contas:** o `codigo` da API do catálogo é numeração INTERNA do Emusys (ex.: `nome: "7 Não Operacionais"` com `codigo: "6"`). **A classificação contábil é o número no INÍCIO do nome** (`"5.2.4 Aluguel"` → `5.2.4`). Plano sem número no nome = registro interno (ex.: `"Taxas de Antecipação de Valores"`, que inclusive tem `id:-25` negativo).
7. **A API não tem `updated_at`.** É por isso que a rotina revarre o mês corrente + 2 anteriores todo dia, dia a dia.
8. **Sem filtro de data, a API devolve o histórico inteiro** (medido: desde 2018).
9. **Rate limit:** ~120 chamadas em rajada → HTTP **500** com `{"status":"erro","msg":"erro desconhecido."}` (não é 429). Recuo exponencial resolve. ⚠️ O endpoint `/financeiro/contas_financeiras` da unidade CG retorna **esse mesmo 500 de forma persistente** (bug de dados na origem, aberto com o Emusys) — distinguir por repetição.
10. **IDs são por unidade/token**: o `id=82420` da CG não é o mesmo lançamento da Barra. Chave única de qualquer coisa = `(unidade, id)`.

### 2.2 Tabelas do espelho (banco `public`)

| Tabela | Conteúdo |
|---|---|
| `financeiro_emusys_lancamentos` | Espelho item a item. **Nunca apaga.** |
| `financeiro_emusys_contas` | Catálogo completo de contas a cada rodada |
| `financeiro_emusys_plano_contas` | Catálogo completo do plano de contas (`codigo_api` = interno; `codigo_extraido` = classificação do nome) |
| `financeiro_emusys_formas_pagamento` | Catálogo completo de formas |
| `financeiro_emusys_varredura_dias` | Status dia a dia (`completo`/`erro`) — dia em erro NUNCA vale como vazio |
| `financeiro_emusys_varredura_resumo` | Estado por unidade: janela, dias pendentes, última varredura completa |

**Tracking por item (todas as 4 tabelas-espelho):**
`primeira_vez_visto`, `ultima_vez_visto`, `hash_conteudo` (sha256 canônico dos campos espelhados), `alterado_em` (só preenchido quando o hash muda), `sumiu_em` (item sumiu de uma varredura completa do dia; zera se voltar). **Regra dura: item sumido fica no espelho para rastro, mas NÃO entra nos totais.**

RLS: fechado para anon/authenticated. Leitura só via `service_role` (edges). No navegador, só agregados via `get_financeiro_espelho_status()` (admin-only).

### 2.3 Sync (`sync-financeiro-emusys`)

Edge que puxa e grava. Rotina diária via pg_cron (jobs `sync-financeiro-emusys-{unidade}-{principal,retry}`, ~06h BRT + retry 45min): varre o mês corrente + 2 anteriores dia a dia; guarda ~1,1s entre chamadas; orçamento de tempo por execução e retomada por dias pendentes. Um dia só é `completo` quando TODAS as páginas dele vieram.

Campos gravados por lançamento: data, valor (com sinal), natureza, conta (id+descrição), plano (id+nome+`plano_codigo` extraído do início do nome), forma de pagamento, descrição, **payload cru** (`payload` jsonb) + tracking.

### 2.4 Contrato de leitura para o Super Folha: `export-financeiro-lancamentos`

**Mesmo padrão do contas-receber-sync (segredo).**

```
POST https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/export-financeiro-lancamentos
Content-Type: application/json
x-super-folha-sync-secret: <segredo compartilhado>

{ "competencia": "2026-08-01", "unidade_id": null, "incluir_payload": false }
```

- `competencia` (obrigatória): `YYYY-MM-01`.
- `unidade_id` (opcional): UUID da unidade no LA Report — omita para as 3.
- `incluir_payload` (opcional): inclui o JSON cru do Emusys em cada item.

**Resposta:**

```json
{
  "success": true,
  "competencia": "2026-08-01",
  "gerado_em": "2026-09-14T...",
  "varredura": [
    {
      "unidade_id": "...",
      "unidade_nome": "Barra",
      "janela_inicio": "2026-07-01",
      "janela_fim": "2026-09-14",
      "janela_cobre_competencia": true,
      "ultima_varredura_completa_em": "2026-09-14T...",
      "ultima_revarredura_anual_em": "2026-09-01T...",
      "competencia_ultima_varredura_completa_em": "2026-09-14T...",
      "competencia_total_dias": 31,
      "ultima_tentativa_em": "...",
      "dias_pendentes_janela": 0,
      "dias_competencia_completos": 31,
      "dias_competencia_com_erro": 0,
      "ultimo_erro": null
    }
  ],
  "totais_por_natureza": [
    { "unidade_id": "...", "unidade_nome": "Barra", "natureza": "entrada", "quantidade": 0, "valor_total": 0.0 }
  ],
  "controle": {
    "itens_vivos": 0,
    "itens_sumidos": 0,
    "sumidos_amostra": []
  },
  "itens": [
    {
      "unidade_id": "...",
      "emusys_lancamento_id": 82420,
      "data": "2026-08-05",
      "valor": -728.57,
      "natureza": "transferencia",
      "conta": { "id": 1002, "descricao": null },
      "plano_contas": { "id": 12, "nome": "3.1.1 Parcelas", "codigo": "3.1.1" },
      "forma_pagamento": null,
      "descricao": "...",
      "primeira_vez_visto": "...",
      "ultima_vez_visto": "...",
      "alterado_em": null
    }
  ]
}
```

**Regras de leitura para os agentes:**
1. `itens` = só vivos (`sumiu_em` null). Totais = só vivos. Mortos ficam em `controle` com amostra.
2. **Antes de confiar no mês**, confira `varredura[]`: a competência pedida precisa estar coberta pela janela e com `dias_competencia_com_erro = 0`. Se `ultima_varredura_completa_em` é antiga ou `null`, os dados do mês corrente podem estar defasados — os meses anteriores a `-2` não são revarridos (só foto do último run completo).
3. `valor_total` é soma algébrica com sinal (saídas negativas na soma da natureza `saida` também — é a convenção da origem).
4. Erros: `403 acesso negado` (segredo errado), `400` (parâmetro inválido), `503` (segredo não configurado no lado do LA Report).
5. Erros da fonte ficam visíveis: catálogo da CG dando 500 aparece no resumo da sync, não aqui; um dia em erro aparece em `dias_competencia_com_erro` e o item NUNCA é confundido com "dia vazio".

### 2.5 Confirmações de contrato (pedido Super Folha 15/09/2026)

1. **Segredo:** o header `x-super-folha-sync-secret` aceita `SUPER_FOLHA_FINANCEIRO_SECRET` (dedicado, se configurado) com fallback para `SUPER_FOLHA_CONTAS_RECEBER_SECRET` (o mesmo do `export-contas-receber`). Se o Super Folha já usa o segredo do contas-receber, funciona sem mudança. Se preferir segredo separado, basta configurar `SUPER_FOLHA_FINANCEIRO_SECRET` no projeto Supabase.
2. **Ordem dos itens:** `data ASC, emusys_lancamento_id ASC` — determinística, igual em toda chamada.
3. **UUIDs de unidade:** os mesmos do export de faturas: CG `2ec861f6-023f-4d7b-9927-3960ad8c2a92`, Barra `368d47f5-2d88-4475-bc14-ba084a9a348e`, Recreio `95553e96-971b-4590-a6eb-0201d013c14d`.
4. **Conta da CG nos lançamentos:** `conta.id` e `conta.descricao` vêm preenchidos em todos os lançamentos da CG, **exceto** nos repasses da operadora e transferidos para a tesouraria (onde `conta` é null ou `{id: 1002, descricao: ""}` — id fantasma fora do catálogo). O catálogo de contas da CG continua dando HTTP 500 na origem, mas a conta de cada lançamento vem no próprio item — é dela que se deriva a separação EMLA vs Kids.
5. **Campos novos no `varredura[]` (15/09/2026):**
   - `competencia_ultima_varredura_completa_em`: data mais recente em que **todos** os dias da competência pedida vieram completos. `null` se a competência ainda tem dias em erro ou não foi toda varrida. Distingue "mês conferido ontem" de "foto de 3 meses atrás".
   - `competencia_total_dias`: total de dias da competência (para conferir cobertura).
   - `ultima_revarredura_anual_em`: timestamp da última revarredura do ano inteiro (ver §2.6).
6. **Mudanças de formato deste export serão avisadas antes.** A Maria repassa números no WhatsApp; o Super Folha é o único consumidor.

### 2.6 Revarredura anual (NOVO 15/09/2026)

A janela diária cobre só mês corrente + 2 anteriores. Mês fechado que a Rose corrigir depois sai do radar — e junho, julho e agosto são meses que o Super Folha já fechou no DRE.

**Solução:** revarredura mensal do ano corrente inteiro (jan–hoje), dia a dia, no dia 1 de cada mês às 3h BRT. Jobs `sync-financeiro-emusys-revarredura-anual-{cg,barra,recreio}`.

- Mesma regra dura: `sumiu_em` só é marcado a partir de um dia com varredura completa.
- Ignora dias já revarridos na última semana (não repete o que a janela diária acabou de cobrir).
- Não sobrescreve a janela diária do `varredura_resumo` — só atualiza `ultima_revarredura_anual_em`.
- Orçamento de 600s (10 min) por chamada; retomada incremental por dias pendentes.

O Super Folha lê `ultima_revarredura_anual_em` no `varredura[]` do export para saber até quando cada mês antigo foi conferido.

### 2.7 Planos de contas sem código no nome

Planos cujo `nome` não começa com número (logo `plano_codigo` = null no espelho). São **27 planos por unidade**, os mesmos nas três. O de-para fica com o Super Folha.

| emusys_plano_id | nome |
|---|---|
| -25 | Taxas de Antecipação de Valores |
| 19 | Telefone fixo |
| 45 | Falta de Caixa |
| 53 | ICMS |
| 54 | ISS |
| 55 | PIS |
| 56 | Cofins |
| 57 | IRPJ |
| 59 | Descontos Incondicionais |
| 60 | Descontos Condicionais |
| 62 | Vale Transporte |
| 63 | Cesta Básica |
| 75 | Receita com Eventos / Casamentos |
| 89 | Material para Encadernação |
| 90 | Despesas da Cantina |
| 91 | Despesas Negativação / Protesto |
| 96 | Impostos de Veículos |
| 99 | Eventos |
| 104 | Sicredi |
| 105 | Confraternização |
| 108 | Despesas na comunicação de cobrança |
| 111 | Cartório |
| 112 | Certificados |
| 129 | Assinatura de Material |
| 135 | Beneficios |
| 136 | Encargos Sociais |
| 137 | Pró-Labore |

**Observação:** o Super Folha mencionou "Vendas Loja" como plano sem código, mas esse nome **não existe** no catálogo espelhado nem em descrições de lançamento. Pode ser um plano do Emusys UI que ainda não foi espelhado, ou um nome diferente. Se aparecer na próxima revarredura, será incluído aqui.

Transferência sem plano (302 itens no espelho) é esperado — `plano_contas` vem null nesses casos.

---

## 3. Pipeline EXISTENTE: contas a receber (faturas dos alunos)

Continua valendo e é o que alimenta a tela de Faturas e a inadimplência.

- **Espelho:** `sync_run_items` (snapshot congelado por competência) + `emusys_faturas`/canônico. Fonte: `GET /faturas` por janela de vencimento, 3 unidades, mutex global, publicação atômica.
- **Leitura:** `export-contas-receber` (mesmo segredo), modos:
  - `{"modo":"snapshot","competencia":"YYYY-MM-01","sync_run_id?,"require_latest?,"require_fresh?"}` → manifesto + itens com hash estável (`row_source_hash` não muda por ids operacionais) e `source_missing` para faturas mortas (tombstones fora dos totais de conferência).
  - `{"modo":"inadimplencia","unidade_id?,"as_of_date?"}` → `get_inadimplencia_canonica` embalada.
- **Regras de valor (IMPORTANTES):**
  - `valor_original` = cheio; desconto **condicional** = perdido no atraso; desconto **fixo** = permanece.
  - `juros_e_multa` da API vem **`0` em TODA aberta** (mesmo vencida — medido 14/09/2026; a doc prometia dinâmico mas não entrega). O valor atualizado de aberta é calculado no LA Report: **multa 2% + mora 1% a.m. pro rata die** sobre `valor_original − desconto_fixo` (Cláusula 2.5), pela função `calcular_valores_fatura_financeiro_v1`. Paga com atraso → os campos de transação trazem o real cobrado.
  - `numero_parcela`/`total_parcelas_contrato` numeram por **contrato**, não matrícula (renovação reinicia).
  - Forma de pagamento efetiva = `forma_pagamento_transacao` (≠ preferencial do contrato).

### 3.1 NOVO 14/09: faturas pagas por data de pagamento (DRE caixa)

O snapshot por vencimento não captura adiantamentos e cheques pré-datados pagos em M com vencimento futuro. Para o DRE caixa do Super Folha (que usa data de pagamento), adicionamos:

- **Tabela:** `faturas_pagas_mes` — chave única `(unidade_id, emusys_fatura_id)`. Colunas: `data_vencimento`, `data_pagamento`, `competencia_vencimento`, `competencia_pagamento`, valores, payload.
- **Sync:** `sync-faturas-emusys` com `mode: "pagas_no_mes"`. Puxa `status=paga` com janela de vencimento M−2 a M+12, filtra por `data_pagamento` em M no cliente, upsert em `faturas_pagas_mes`. Cron diário às 4h BRT (7h UTC) cobrindo mês corrente + anterior.
- **Export:** `export-contas-receber` modo `snapshot` agora faz **merge**: snapshot por vencimento + `faturas_pagas_mes` por pagamento, **dedup por `(unidade_id, emusys_fatura_id)`** (a do snapshot vence primeiro; a de pagamento é extra). O manifesto traz `faturas_pagas_mes_extras` = quantas faturas extras por pagamento foram incluídas.
- **Não muda a regra de abertas:** faturas em aberto continuam só por vencimento. Só PAGAS com data de pagamento em M e vencimento fora de M são adicionadas.
- **Casos reais validados em agosto/2026:**
  - Recreio: 10 PIX de R$ 385,20 em 11/08 (parcelas 08/2026 a 07/2027) — `emusys_fatura_id` 30293–30304.
  - Recreio: 9 cheques de R$ 435,50 em 14/08 (parcelas 09/2026 a 06/2027) — `emusys_fatura_id` 29413–29422.
  - Barra: 12 cartões de R$ 475,00 em 17/08 (parcelas 08/2026 a 07/2027) — `emusys_fatura_id` 15034–15045.
  - CG R$ 4.714 em 13/08 `emusys_fatura_id` 82868: **não encontrado** no espelho do LA Report (nem no snapshot, nem em `faturas_pagas_mes`, nem em `sync_run_items`). Pode ser ID de outra fonte ou incorreto; pedimos confirmação ao Super Folha.

---

## 4. Identidades e convenções que atravessam tudo

- `unidade_id` (LA Report, uuid): CG `2ec861f6-023f-4d7b-9927-3960ad8c2a92`, Barra `368d47f5-2d88-4475-bc14-ba084a9a348e`, Recreio `95553e96-971b-4590-a6eb-0201d013c14d`.
- **Nenhum id do Emusys é global.** Sempre carregue `unidade_id` junto nas chaves.
- Timestamps em UTC; datas em `YYYY-MM-DD`; competência sempre `YYYY-MM-01`; "hoje operacional" = America/Sao_Paulo.
- Secrets/tokens nunca saem do LA Report: os agentes recebem só o `x-super-folha-sync-secret` dos exports.

## 5. Backfill jan–set/2026 e aceite

Backfill único rodado via `scripts/backfill-financeiro-emusys.mjs` (mesma edge da rotina diária, resumível por dia).

**Aceite acordado (ago/2026):**
| Unidade | Lançamentos | Entradas | Saídas |
|---|---|---|---|
| CG | 1.066 | R$ 183.711,30 | −R$ 154.045,78 |
| Barra | 762 | R$ 125.421,00 | −R$ 106.968,93 |
| Recreio | 951 | R$ 173.340,33 | −R$ 159.672,27 |

**Resultado medido do espelho (14/09/2026): aceite de agosto BATEU 100% — contagens e valores ao centavo, sem divergências.**

## 6. Relatório do backfill jan–set/2026

Setembro é parcial (dias 01–14). Totais são somas algébricas com sinal (`saida` negativa). Estornos = `estorno` + `estornado` somados. Itens com `sumiu_em` ficariam FORA (não houve nenhum na primeira captura).

### CG (Campo Grande)

| Mês | Itens | Entradas (qtd) | Entradas R$ | Saídas (qtd) | Saídas R$ | Estornos (qtd) | Estornos R$ | Transferências (qtd) | Transf. R$ |
|---|---|---|---|---|---|---|---|---|---|
| 01 | 1.106 | 483 | 162.169,20 | 398 | −153.275,18 | 103 | 2.850,26 | 122 | −28.493,00 |
| 02 | 1.243 | 557 | 188.015,22 | 415 | −158.348,85 | 171 | 13.248,97 | 100 | −28.222,88 |
| 03 | 1.408 | 579 | 182.216,28 | 439 | −166.774,54 | 252 | −23.957,07 | 138 | −28.091,91 |
| 04 | 1.090 | 500 | 180.951,12 | 433 | −184.848,41 | 71 | −911,99 | 86 | −17.083,50 |
| 05 | 1.247 | 590 | 194.868,31 | 403 | −163.520,19 | 143 | −278,25 | 111 | −22.590,50 |
| 06 | 975 | 459 | 181.510,45 | 379 | −169.364,10 | 77 | −4.355,00 | 60 | −7.835,07 |
| 07 | 1.008 | 460 | 162.904,98 | 406 | −150.393,24 | 75 | 2.622,96 | 67 | −15.224,94 |
| **08** | **1.066** ✅ | 535 | **183.711,30** ✅ | 377 | **−154.045,78** ✅ | 84 | −2.107,96 | 70 | −20.170,00 |
| 09* | 549 | 285 | 109.241,74 | 228 | −96.974,24 | 23 | −750,00 | 13 | 101,00 |

### Barra

| Mês | Itens | Entradas (qtd) | Entradas R$ | Saídas (qtd) | Saídas R$ | Estornos (qtd) | Estornos R$ | Transferências (qtd) | Transf. R$ |
|---|---|---|---|---|---|---|---|---|---|
| 01 | 631 | 289 | 107.390,24 | 297 | −90.219,94 | 3 | −158,90 | 42 | −8.698,00 |
| 02 | 625 | 265 | 106.258,85 | 297 | −110.907,28 | 24 | −1.162,01 | 39 | −11.046,00 |
| 03 | 716 | 294 | 111.668,50 | 330 | −122.819,86 | 31 | 2.328,91 | 61 | −9.944,00 |
| 04 | 655 | 277 | 126.945,52 | 351 | −127.001,26 | 4 | 481,55 | 23 | −3.050,00 |
| 05 | 631 | 265 | 111.226,04 | 304 | −104.721,64 | 34 | −4.380,00 | 28 | −4.216,00 |
| 06 | 642 | 276 | 116.702,61 | 316 | −105.104,55 | 16 | 0,00 | 34 | −3.432,00 |
| 07 | 683 | 283 | 113.037,91 | 330 | −105.619,13 | 28 | 1.247,99 | 42 | −5.708,00 |
| **08** | **762** ✅ | 310 | **125.421,00** ✅ | 346 | **−106.968,93** ✅ | 64 | −786,22 | 42 | −10.200,04 |
| 09* | 490 | 222 | 94.418,65 | 260 | −69.074,87 | 0 | — | 8 | −800,00 |

### Recreio

| Mês | Itens | Entradas (qtd) | Entradas R$ | Saídas (qtd) | Saídas R$ | Estornos (qtd) | Estornos R$ | Transferências (qtd) | Transf. R$ |
|---|---|---|---|---|---|---|---|---|---|
| 01 | 804 | 339 | 131.323,17 | 379 | −119.621,60 | 33 | 2.381,98 | 53 | −13.660,65 |
| 02 | 832 | 328 | 131.913,97 | 407 | −130.868,31 | 53 | 2.487,57 | 44 | −12.272,95 |
| 03 | 940 | 387 | 151.545,82 | 419 | −146.225,38 | 90 | 2.731,36 | 44 | −10.012,30 |
| 04 | 892 | 374 | 158.274,73 | 425 | −144.767,92 | 54 | −4.775,00 | 39 | −9.400,60 |
| 05 | 883 | 371 | 145.946,07 | 411 | −133.606,09 | 38 | −1.442,90 | 63 | −17.226,67 |
| 06 | 855 | 388 | 155.950,68 | 390 | −139.529,99 | 13 | −661,54 | 64 | −13.645,67 |
| 07 | 914 | 388 | 151.021,94 | 421 | −138.650,45 | 20 | −710,40 | 85 | −12.061,00 |
| **08** | **951** ✅ | 430 | **173.340,33** ✅ | 431 | **−159.672,27** ✅ | 35 | −3.475,00 | 55 | −10.931,60 |
| 09* | 694 | 331 | 136.375,72 | 340 | −99.065,41 | 8 | 0,00 | 15 | −489,55 |

\* setembro até o dia 14.

**Higiene da captura:** 771 dias completos · 0 dias em erro · 23.292 itens no espelho · 0 sumidos · 0 alterados. Catálogos: plano de contas 184 itens/unidade; formas de pagamento 28/unidade; contas Barra 11 / Recreio 12 / **CG indisponível na origem** (HTTP 500 persistido, ver §2.1 item 9 — as contas da CG podem ser derivadas dos próprios lançamentos quando o Emusys corrigir).

**Divergências contra o aceite: nenhuma.**
