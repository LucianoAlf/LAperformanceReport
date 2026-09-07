# Replay do roteador V4 corrigido — 213 mensagens reais de 15/08

**Data:** 07/09/2026 · **Frente 1, etapa (b)** · Fonte: `sol_caixa_ingestao_recebimentos` (a única com texto puro)

---

## O que este replay mede — e o que não mede

`sol_caixa_ingestao_recebimentos` tem **213 mensagens de 15/08 com `raw_text` e 172 mídias**. É a única fonte com texto: `caixa.log` e `sol_caixa_shadow_eventos_v1` guardam **hash por desenho** (`body_sha256`), escolha de privacidade do V3 que não se deve desfazer.

⚠️ Mas `movimentacao_id` é NULL nas 213 e `aluno_extraido` está vazio: a tabela foi ligada um dia e o elo com o lançamento nunca foi conectado. Portanto:

| mede | não mede |
|---|---|
| extração de valor/forma/categoria/aluno | o fluxo de **aprovação** ("pode") |
| latência e taxa de falha do transporte novo | o contexto do preview pendente |
| julgamento contra o controle "ignorado" | |

O fluxo de aprovação — que é onde o laudo (a) achou os 64 falsos negativos — **só se mede com sombra nova**, que voltou a rodar hoje.

## ✅ Transporte — resolvido

| | sombra antiga (31/08–05/09) | replay corrigido |
|---|---|---|
| latência mediana | 19,8s | **2,5s** |
| p90 | 44,1s | **4,2s** |
| máximo | 48,8s | 15,9s |
| falha | **15%** (55 de 366) | **0%** (0 erros, 1 resposta vazia) |

As 55 falhas do laudo (a) eram transporte. **Somem.**

## ✅ Extração — melhor que o legado

- valor: o legado extraiu em 73 · **o V4 extraiu nos mesmos 73, perdeu zero**
- **+16** valores que o legado não achou
- **aluno em 91** — o legado não extraía nenhum nesta tabela

## ✅ Escala do valor — contrato honrado

Eu havia levantado risco de escala: o roteador devolveu `499` onde o legado gravou `49900` (centavos), enquanto na sombra antiga devolvia `38700`.

Verificado na fonte: o prompt pede *"valor (numero em reais, ex 509.00)"* e o runtime faz `valor * 100` para obter centavos. **O contrato é reais.** No replay: **70 em reais, 0 em centavos**.

Ou seja, era a **versão antiga violando o contrato**; a corrigida acerta. O alerta se resolve sozinho — mas fica registrado que valores da sombra antiga **não devem ser comparados por escala**.

## ✅ Julgamento — o controle concorda, e a abstenção funciona

**Controle (34 mensagens que o caixa ignorou):** o V4 diz `nada` em **33**, `conversa` em 1. Concordância quase perfeita no grupo em que o erro seria mais caro (agir sobre lixo).

**Confiança baixa ⇒ abstenção.** Das 56 decisões com confiança < 0,5, **55 dizem `nada`**. A única que agiria é `consulta_caixa` — leitura, não escrita. O roteador **não decide dinheiro quando está inseguro**.

## 🔴 O bloqueador — 4,1% de erro no valor

Três dos 73 valores saíram errados:

| legado | V4 | |
|---|---|---|
| R$ 435,50 | 4355 | 10× |
| R$ 464,40 | 4644 | 10× |
| R$ 450,00 | 50 | 9× menor |

**Hipótese testada e derrubada:** "valor com centavos não-zero sempre quebra". Falso — **14 acertos com centavo quebrado**, incluindo `461,75`, `1836,28`, `1248,16`, `470,69` e `0,99`, todos exatos.

| | acertou | errou |
|---|---|---|
| centavos `00` | 56 | 1 |
| centavos ≠ 0 | 14 | 2 |

Não há padrão sistemático. É **extração ocasional errada**, a 4,1%.

⚠️ **Isso não é aceitável para dinheiro e não se resolve com prompt.** Um em cada 24 lançamentos sairia com valor errado, dois deles por um fator de 10. A correção é **determinística, não estatística**: conferir o valor extraído contra o texto original antes de qualquer preview — e o runtime **já tem esse padrão**, em `_valorNoTextoHumano`, criado em 01/09 justamente para impedir que número que só existe no OCR fure o fail-closed.

## Onde isso deixa o flip

| dimensão | veredito |
|---|---|
| transporte | ✅ resolvido (2,5s, 0% falha) |
| extração de campos | ✅ melhor que o legado |
| escala do valor | ✅ contrato honrado |
| abstenção sob incerteza | ✅ funciona |
| julgamento no controle | ✅ 33/34 |
| **exatidão do valor** | 🔴 **4,1% — bloqueia** |
| fluxo de aprovação | ⏳ não medido; depende da sombra nova |

**Duas condições para virar a chave**, nesta ordem:

1. **Guarda determinística de valor** — o valor do preview tem de existir no texto ou no OCR, senão não vira preview. Sem isso o 4,1% vira dinheiro errado.
2. **Sombra nova cobrindo aprovações** — com a foto do contexto, o número que o laudo (a) não pôde medir. Terça e quarta dão a amostra.

Não proponho limiar numérico para (2) antes de ver a primeira amostra com contexto: o laudo (a) mostrou que limiar definido sobre instrumentação errada reprova o que está certo.
