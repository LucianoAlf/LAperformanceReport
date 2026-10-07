# Resposta — fechamento diário do caixa no export (07/10/2026)

Pergunta: `2026-10-07-pedido-fechamento-diario-do-caixa-lareport.md`

## Resumo

Entregue. O `export-caixa-movimentacoes` agora devolve um bloco
`fechamentos[]` com o fechamento de cada dia (mesmo filtro de período e
`unidade_id`), lendo `caixas_diarios` — a fonte do "Saldo final caixa" que a
equipe confere na gaveta. Deploy feito em 07/10; o número que a Rose viu
(Recreio 06/10 = **R$ 263,90**, conferido por **Vitória**) sai exatamente
assim.

## Shape emitido

```json
"fechamentos": [
  {
    "caixa_diario_id": "561a328f-…",
    "unidade_id": "95553e96-…",
    "unidade_codigo": "REC",
    "data": "2026-10-06",
    "status": "fechado",
    "saldo_inicial": 263.90,
    "saldo_final_calculado": 263.90,
    "saldo_final": 263.90,
    "diferenca_contagem": 0.00,
    "aberto_por": "Fefê",
    "aberto_em": "2026-10-06T11:03:04.624627+00:00",
    "conferido_por": "Vitória",
    "conferido_em": "2026-10-06T23:52:13.976519+00:00",
    "observacoes": null
  }
]
```

Semântica dos campos (nomes reais → o que significam):

| Campo | Coluna em `caixas_diarios` | Significado |
|---|---|---|
| `saldo_inicial` | `saldo_inicial_cofre` | troco/abertura do dia (vem do fechamento anterior — ver Q2) |
| `saldo_final_calculado` | `saldo_final_calculado` | o que o sistema esperava na gaveta (inicial + dinheiro do dia) |
| `saldo_final` | `saldo_final_conferido` | **a contagem física feita pela pessoa** — este é o número da mensagem "Saldo final caixa" |
| `diferenca_contagem` | (calculado) | `conferido − calculado`; divergência = dinheiro que entrou/saiu sem lançamento |
| `conferido_por` | `fechado_por` | quem fechou/conferiu (a Vitória do exemplo) |
| `status` | `status` | `aberto` (sem conferido ainda → `saldo_final`/`diferenca_contagem` null) ou `fechado` |

⚠️ Dia sem caixa aberto não gera linha — `fechamentos` simplesmente não traz
o dia. `controle.fechamentos` traz a contagem.

## Respostas às 3 perguntas

**1. Campos reais de `caixas_diarios`:** `id, unidade_id, data_caixa, status,
saldo_inicial_cofre, saldo_final_calculado, saldo_final_conferido, aberto_em,
aberto_por, fechado_em, fechado_por, observacoes` (+ auditoria de envio
whatsapp e timestamps). O export usa os nomes acima como estão no shape.

**2. Abertura = fechamento anterior.** Confirmado nos dados: CG ficou 5 dias
seguidos com `saldo_inicial_cofre = 62,80` (troco fundo fixo), e o Recreio
carregou os 263,90 de 06/10 para a abertura de 07/10. Quem abre não digita o
saldo — ele vem do dia anterior.

**3. Retirada existe como lançamento** (`tipo='saida'`, `categoria='retirada'`)
— CG tem 3, total R$ 4.450. Mas **nem todo dinheiro que sai fisicamente vira
lançamento**, e é por isso que a soma acumulada mente:

- **Recreio:** dinheiro acumulado = 3.548,00 − 3.996,91 = **−448,91** —
  exatamente o número que vocês viram — enquanto a gaveta conferida tem
  **263,90**. Houve retirada lançada contra entrada que nunca passou pelo
  cofre físico (ou vice-versa).
- **CG:** os 14.793,89 não batem nem com dinheiro nem com todas as formas —
  provável mistura de formas na soma + retiradas/depositos sem lançamento. A
  gaveta real conferida em 06/10: **522,80** (Arthur).

## O que recomendamos do lado de vocês

Exatamente o que propuseram: o card usa `saldo_final` do último
`status='fechado'` como "dinheiro em caixa (conferido por X em dd/mm)"; a
soma dos lançamentos em dinheiro fica como "registrado"; e
`diferenca_contagem` + a divergência registrado-vs-conferido viram pendência
para a Sol/equipe lançar o que faltou.

## Contrato inalterado

```
POST /functions/v1/export-caixa-movimentacoes
x-super-folha-sync-secret: <mesmo>
{ "competencia": "2026-10-01" }  ou  { "data_inicio","data_fim","unidade_id"? }
```

`fechamentos` é acréscimo no payload — quem não lê, ignora.
