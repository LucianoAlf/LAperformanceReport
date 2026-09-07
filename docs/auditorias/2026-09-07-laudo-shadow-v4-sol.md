# Laudo do shadow V4 da Sol — as 366 decisões de 31/08 a 05/09

**Data:** 07/09/2026 · **Frente 1, etapa (a)** · Fonte: `caixa.log` do runtime, `acao = roteador_v4_shadow`

---

## Correção de partida

Eu havia reportado "zero decisões em sombra". **Errado — são 366.** Procurei em `bridge.log` e no workspace; elas estão no `caixa.log` do runtime do caixa. O que de fato nunca rodou foram os **patches de 05/09** (transporte HTTPS direto, foto do contexto por `messageId`, prompt corrigido, minimax-m3): o `caixa-financeiro.cjs` foi alterado às 19:30 e o gateway estava de pé desde 01/09.

Isso importa porque **este laudo mede a versão ANTIGA do roteador**, não a corrigida.

## O placar bruto

| | n | % |
|---|---|---|
| V4 agiria onde o legado não fez nada | 132 | 36% |
| ✅ concorda agindo | 96 | 26% |
| ⚠️ roteador falhou (`None`) | 55 | 15% |
| 🔴 **V4 não agiria onde o legado agiu** | 41 | 11% |
| ✅ concorda em não fazer nada | 28 | 7% |
| 🔴 V4 conversaria onde o legado agiu | 14 | 3% |

Latência geral: **mediana 19,8s · p90 44,1s**.

## As 55 falhas do roteador são transporte, não julgamento

Latência mediana **47,4s**, com **33 das 55 acima de 40s**. É timeout. O transporte antigo estourava e a decisão voltava vazia — exatamente o que o patch de 05/09 (HTTPS direto + minimax-m3, medido em 1,9s/3,2s) corrige e que nunca entrou em execução.

**Não conta contra o julgamento do roteador.**

## 🔴 Os 64 casos perigosos — o achado principal

Juntando "não agiria" (41) e "conversaria" (14) mais os equivalentes, são **64 decisões** em que o V4 **não teria lançado dinheiro que o runtime lançou**. Se a chave estivesse virada, 64 lançamentos não teriam acontecido.

Abrindo os 64 contra os 57 que concordam agindo:

| | 🔴 perigosos (64) | ✅ concordam (57) |
|---|---|---|
| `legado` | **`lancado` em 64/64** | ação em 57/57 |
| extraiu **valor** | **0 / 64** | 33 / 57 |
| extraiu **aluno** | **0 / 64** | 39 / 57 |
| `pendencias = 0` no contexto | **48 / 64 (75%)** | 25 / 57 (44%) |
| confiança mediana | 0,95 | 0,98 |
| latência mediana | 17,9s (só 2 acima de 30s) | — |

### O que isso quer dizer

Três fatos que só se explicam juntos de um jeito:

1. **`legado = lancado` em 64 de 64.** No runtime, `lancado` é o que acontece quando alguém **aprova** — o "pode".
2. **Zero extração de valor ou aluno em 64 de 64.** Mensagem de aprovação (*"pode"*, *"isso"*, *"sim, esse mesmo"*) não carrega valor nem nome. O valor está no **preview pendente**, não no texto.
3. **75% chegaram ao roteador com `pendencias = 0`.**

Ou seja: **o roteador julgou aprovações de dinheiro sem enxergar o que estava sendo aprovado.** Sem o preview pendente, *"pode"* **é** nada — e ele respondeu "nada" com confiança 0,95, o que é a resposta correta para a entrada que recebeu.

⚠️ E a causa é conhecida e já corrigida no código que não rodou: o shadow era chamado **depois** do `handle()`, quando o runtime já havia consumido a pendência. O patch de 05/09 tira a foto do contexto **por `messageId`, antes** — é literalmente este bug.

### Hipóteses testadas e derrubadas

- **"São mensagens com comprovante (mídia) e o roteador não vê imagem."** Falso: 1% de mídia nos perigosos e 0% nos que concordam. Correlacionado por proximidade temporal no mesmo chat.
- **"São timeouts."** Falso: latência mediana 17,9s nos perigosos, com apenas 2 acima de 30s. Os timeouts são o outro grupo (os 55 `None`).

### O que ainda não está provado

Não consigo ler o texto das 64 mensagens — o log é **hash por desenho** (`body_hash`, `chat_id_hash`), escolha de privacidade do V3 que não se deve desfazer. A leitura acima é inferência **fortemente sustentada** por três sinais convergentes, não leitura direta. O que confirmaria de vez: rodar o roteador **com a foto do contexto** sobre entrada real — que é a etapa (b).

## Consequência para o critério de flip

**O critério que propus não pode ser avaliado com estes dados.** Eu havia sugerido "zero casos de V4 não lançaria onde deveria". Sobre esta amostra dariam 64 — e seriam 64 falsos negativos causados por instrumentação, não por julgamento.

Onde isso deixa a decisão:

- **julgamento do roteador:** os 96 que concordam agindo, com extração de valor em 33 e de aluno em 39, mostram que quando ele recebe contexto ele acerta. Sinal positivo.
- **os 132 "V4 agiria onde o legado não fez nada"** são o ganho potencial — e ainda não sei se são ganho ou ruído. Precisam ser abertos.
- **latência e falha:** medidos na versão errada. Sem valor.

**Nada aqui autoriza nem impede o flip.** O que ele produz é diagnóstico: a sombra de 31/08 a 05/09 mediu um roteador cego para aprovações, e por isso o número que assusta (64) é artefato.

## Próximo passo

Etapa (b): replay do dia **15/08** — 213 mensagens com `raw_text` e 172 mídias em `sol_caixa_ingestao_recebimentos` — pelo roteador corrigido, com a foto do contexto. É a única fonte com texto puro; as demais são hash.

E, em paralelo, a sombra nova já está rodando desde o restart de hoje, agora com o código de 05/09 em memória.
