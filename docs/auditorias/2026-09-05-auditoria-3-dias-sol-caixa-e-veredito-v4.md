# Auditoria dos 3 grupos financeiros — 03 a 05/09/2026 — e o veredito da V4

**Escopo:** tudo que a equipe escreveu, tudo que a Sol respondeu, o que ela leu de
cada imagem e PDF, nos grupos **Campo Grande**, **Recreio** e **Barra**.
**Fontes:** `caixa.log` da la-hq (1,6 MB, 204 mensagens de texto no período),
`caixa_movimentacoes`, `caixas_diarios` e o código vivo do runtime.
**Pedido do Luciano:** achar os erros, **corrigir cada um**, e decidir se vale
continuar depurando a gramática ou virar a chave para a V4 (AI-first, no formato
da Maria).

---

## 1. O tamanho do problema, em número

| | 03/09 | 04/09 | 05/09 |
|---|---|---|---|
| cards enviados | 11 | 6 | **40** |
| lançados | 7 | 4 | 33 |
| **correções que a equipe teve de digitar** | 3 | 1 | **19** |

Em 05/09 a equipe corrigiu **19 de 40 cards — quase metade**. E o que a Sol não
conseguiu virou trabalho manual no app:

| lançados à mão (fora da Sol) | valor |
|---|---|
| 03/09 · CG | R$ 417,00 |
| 04/09 · CG | **R$ 3.685,00** (5 dos 7 lançamentos do dia) |
| 05/09 · CG | R$ 2.119,00 |
| 05/09 · Recreio | R$ 1.248,16 |
| **total em 3 dias** | **R$ 7.469,16 · 12 lançamentos** |

Esses 12 entram no caixa **sem `aluno_id` e sem `fatura_id`** — o dinheiro fecha,
mas a conciliação com a fatura do aluno se perde. É o custo real, e não aparece em
lugar nenhum da tela.

A Barra foi o grupo silencioso: 3 cards em 3 dias, zero correção. Todo o problema
está em CG e Recreio, que são os que têm volume.

---

## 2. As quatro raízes — todas medidas, todas corrigidas

Nenhuma das quatro cria gramática nova de diálogo (compromisso vigente). As quatro
consertam **leitura de dado**.

### F1 · A Sol escrevia "cartão débito" em comprovante de Pix

**6 de 6 correções de forma em 3 dias foram "foi pix"** — Moisés 13:32, Luiz
Eduardo 13:54, Manuela 13:57, e mais três. Nunca o contrário.

A raiz não é o OCR nem o LLM. `extrairForma` **já lia certo** (ela testa `/pix/`
primeiro, de propósito). O que acontecia depois:

```js
if (!forma) { const ff = extrairForma(ocrText, null); if (ff) forma = ff; }
const cc = extrairCartao(ocrText);
if (cc) { forma = 'cartao'; ... }        // ← sobrescreve SEM condicao nenhuma
```

E `SINAL_CARTAO` aceita a palavra **`débito` sozinha** — que aparece em *todo*
comprovante de Pix de banco, na linha **"Débito em conta"**. Ou seja: a evidência
mais forte que existe (o comprovante escrito "Pix") perdia para uma palavra solta.

**Correção:** "Débito/crédito em conta" sai do texto antes de qualquer teste, e
**pix explícito vence** — salvo sinal FORTE de maquininha (bandeira, NSU,
adquirente, "venda débito", "cartão de débito"), que cupom tem e comprovante de
Pix não. Feita em `extrairCartao`, então vale nos 4 lugares que a chamam, não só
no ramo do OCR.

### F2 · O lote de 3 alunos que derrubou o Recreio

12:41 — a Vitória manda o PDF com a legenda:

```
parcelas dos alunos:
Márcio Sant'Anna R$395,00
Valentina Cortes Santanna R$468,16
Maria Luiza Cortes Sant'Anna R$385,00

total: R$1.248,16 - pix
```

A Sol respondeu com **um card de R$ 395** e o aviso "a mensagem cita R$ 1.248,16".
12:43, a Vitória repete no formato que a Sol pediu, com hífen: **"Não entendi
essa 😅"**. 12:45, ela explica com todas as letras — e a Sol grava o nome do aluno
como **`"diferente mas o valor esta unificado."`**. 12:46: *"@Luciano Alf me
ajudaaa"*. As 3 parcelas foram lançadas à mão.

Duas causas somadas, nas **duas cópias** da mesma regra (detector e parser):

1. **O traço era obrigatório.** A equipe escreve `Nome R$395,00`. A Sol ensina
   `Nome — R$ valor`, com um travessão que **não existe no teclado do celular**.
2. **Apóstrofo não entrava no nome.** `Sant'Anna` — e **2 dos 3 alunos** do lote
   são Sant'Anna. Mesmo na segunda tentativa, com hífen, só 1 das 3 linhas casava.

**Correção:** a linha `Nome — R$ valor` passa a ter **uma regra só**
(`_linhaNomeValorSol`), usada pelo detector e pelo parser — duas cópias da mesma
regra é o padrão que gerou as duplicatas de renovação. Apóstrofo e ponto entram no
nome (Sant'Anna, D'Angelo, Jr.); **o traço vira opcional quando o valor traz
`R$`** — sem traço o `R$` é obrigatório, é ele que marca a fronteira. Rótulo de
operação no começo da linha (`Parcela`, `Passaporte`, `Total`…) nunca vira nome.

Com a correção, a legenda das 12:41 é reconhecida como multi-aluno **na primeira
tentativa**, os 3 alunos saem e a soma fecha em R$ 1.248,16.

### F3 · Frase virando nome de aluno

Três vezes em 3 dias a Sol gravou um pedaço de frase no campo ALUNO:

| quando | o que ficou gravado |
|---|---|
| 03/09 Recreio | `São dois curso teclado e` |
| 05/09 CG | `Maria Luzia Marinho da Silva Delgado e a parcela é` |
| 05/09 Recreio | `diferente mas o valor esta unificado.` |

`_alunoRotulado` casava `\balun[oa]s?\b` — **aceitando o plural** — e o rótulo
(`:`, `-`, `é`, `foi`) era **opcional**. Então `alunos` + qualquer prosa virava
nome. É a mesma lição já registrada no `CLAUDE.md`: *palavra solta nunca é
comando*. "alunos" no plural significa **mais de um** — é o oposto de uma etiqueta
para um nome.

**Correção:** só o **singular** rotula (`\balun[oa]\b`); o corte do rabo da frase
ganhou os campos que faltavam (`e a parcela`, `e a competência`, …); e o que
**sobra depois da limpeza** passa por um vocabulário de operação — se ainda tem
"parcela", "valor", "forma", "competência", não era nome nenhum.

⚠️ A ordem importa e custou uma iteração: julgar a captura **crua** rejeitava
também o caso bom (`aluna Maria Luzia … e a parcela é de setembro`), porque o rabo
da frase está dentro dela. O corte roda primeiro; o vocabulário julga o que sobrou.

### F4 · O mesmo nome oferecido três vezes

Card da Kamilly (CG 13:51): *"Não identifiquei — o pagamento veio de Michele
Azevedo de Souza. É de qual aluno? – Kamilly Azevedo da Silva – Kamilly Azevedo da
Silva – Kamilly Azevedo da Silva"*. São **3 matrículas da mesma pessoa** e a lista
não deduplicava. Perguntar oferecendo o mesmo nome 3× não é pergunta, é ruído.
Uma linha: `[...new Set(...)]`.

---

## 3. Validação

Patch com **guarda de âncora declarando o número esperado** (10 âncoras, todas
bateram 1×): `tests/sol-runtime/_patch-forma-pix-e-nome-05set.cjs`.

- **`forma-e-nome-05set.test.cjs`** (novo, 22 casos com os **textos reais** dos
  grupos): **10 falhas antes → 0 depois**. Metade dos casos são "não regride":
  cupom PagBank continua cartão débito, `( cartão de débito)` continua cartão,
  uma linha só nunca vira multi, duas linhas de *produto* não viram dois alunos.
- **`detector-multi-aluno.test.cjs`** (18 legendas reais): **18/18 antes e depois**.
- **Suíte local completa, 34 arquivos:** 33 ok.
  ⚠️ `parcela-recreio-vitoria.test.cjs` dá 2/4 — **falha idêntica no backup
  pré-patch**, conferido rodando o teste contra a cópia antiga. Não é regressão;
  é dívida anterior (o teste supõe "fonte financeira indisponível" e hoje a fonte
  está fresca).

🔴 **PENDENTE — a bridge ainda não recarregou.** O arquivo em produção está
corrigido e validado, mas `whatsapp-bridge/bridge.js` faz `require` do módulo
**no start**: só passa a valer depois de reiniciar. O comando (`kill` do pid da
bridge, com o `hermes-gateway-sol.service` respawnando em ~5s) **foi bloqueado
pelo classificador de permissão** desta sessão. Precisa do seu OK.
Os crons de abrir/fechar são processos novos a cada execução e **já pegam o
código novo** — por isso a suíte inteira foi rodada antes de deixar o arquivo em
pé. Reverter, se precisar:
`caixa-financeiro.cjs.bak-20260905T175000Z-before-forma-pix-e-nome`.

---

## 4. A V4 em sombra — e o veredito

### 4.1 🔴 O shadow está sendo medido errado, e isso subestima o roteador

`observarRoteadorV4(event, acaoLegada)` é chamado **depois** do `handle()`. Quando
o humano escreve "Pode", o runtime lança e **consome a pendência**; só então o
roteador recebe a mensagem — com o contexto **já vazio**.

Medido: das **44 mensagens que fizeram o runtime lançar, 33 (75%) chegaram ao
roteador com `pendencias: 0`**. Ele viu a palavra "Pode" sozinha, sem card
nenhum, e respondeu `nada`/`conversa` — que é a resposta certa para "aprovar o
quê?". Nas 11 que ainda tinham card visível, ele disse `aprovar` em 6.

Ou seja: o placar bruto ("o roteador só pegou 6 de 44 aprovações, 13,6%") é
**artefato de instrumentação**. Qualquer decisão de flip tomada em cima da tabela
crua estaria em cima de uma medição quebrada.

### 4.2 O placar honesto — 204 mensagens, 3 dias

| | |
|---|---|
| os dois agiram | 41 |
| **só o V4 viu intenção (legado mudo)** | **35** |
| só o legado agiu | 68 — mas **40 com o contexto já consumido** |
| os dois em silêncio | 60 |

**Os 35 ganhos** são momentos em que a equipe falou e a Sol ficou parada:
`lancamento_por_texto` 11 · `aprovar` 7 · `corrigir_competencia` 5 · `descartar` 4
· `lancamento_multi_aluno` 3 · e mais 5 avulsos.

**As perdas reais** (legado agiu, V4 calado, com contexto visível) são **28** — e
**12 delas são `intencao: null`**, ou seja, o roteador **não respondeu a tempo**.
Não é erro de julgamento, é o cano. Das 16 que responderam, **6 são o mesmo buraco
nomeável**: `saida_texto_sem_forma` / `preview_tipo_corrigido_saida` — saída de
dinheiro ditada por texto, que o legado lê e o roteador chamou de `nada`, apesar
de ter `saida_dinheiro` no enum dele. É ajuste de prompt, não de arquitetura.

### 4.3 Nos dois casos que doeram hoje, o roteador acertou e a gramática errou

| momento | equipe escreveu | legado | V4 |
|---|---|---|---|
| Recreio 12:43 | "são pagamentos de 3 parcelas juntas, Márcio…" | `nada` → *"Não entendi essa"* | **`lancamento_multi_aluno` 0.99** ✅ |
| Recreio 12:45 | "são 3 parcelas de alunos diferente mas…" | gravou o nome errado | **`lancamento_multi_aluno` 0.99, valor 1.248,16, pix** ✅ |
| CG 04/09 14:52 | (com 3 pendências abertas) | `nada` | **`aprovar` 0.97** ✅ |
| CG 05/09 13:26 | correção de competência | `nada` (só o fallback LLM salvou) | **`corrigir_competencia` 0.98** ✅ |

E no mesmo instante do 12:43 o **fallback LLM do próprio legado** devolveu
`fallback_llm_sem_intencao`. O roteador acertou onde as duas camadas atuais
falharam.

### 4.4 🔴 O bloqueio do flip é latência — e é do cano, não do cérebro

Medido no log: **mediana 21,8 s · p90 44,5 s · máximo 48,8 s. 53% acima de 20 s,
10% sem resposta nenhuma.**

Cronometrado na VPS, a causa:

| o que | tempo |
|---|---|
| roteador como está hoje (`hermes_cli chat`, prompt trivial) | **10–13 s** |
| o mesmo, trocando para `openai-api/gpt-5.4-mini` | **10,5 s** |
| o mesmo, com `anthropic/claude-haiku-4-5` | 23 s — e devolveu prosa, não JSON |

**Trocar o modelo não resolve.** O piso de ~10 s é o próprio `hermes_cli`: subir o
venv Python, inicializar o agente e ir ao gateway, **um processo por mensagem**. O
perfil da Sol roda `gpt-5.6-luna` via `openai-codex` — um modelo de raciocínio
atrás de um CLI, para uma tarefa de classificação que pede o contrário.

Com a V4 na frente, **cada mensagem do grupo esperaria 20–45 s** antes de qualquer
resposta. Inviável.

### 4.5 Veredito

**Vale virar a chave. Não vale virar hoje, e não com este cano.**

O cérebro está pronto: 35 ganhos contra ~16 perdas de julgamento, confiança 0,98–0,99
nos casos difíceis, e acerto exatamente onde a gramática mais custou dinheiro esta
semana. Continuar só depurando regex tem retorno decrescente — as quatro raízes de
hoje são a quinta rodada do mesmo tipo de conserto.

Mas a V4 na frente **hoje** trocaria erro por espera, e espera de 40 s num grupo
onde a ADM lança 30 comprovantes por tarde é pior que o erro.

**Três pré-requisitos, nesta ordem, antes do flip:**

1. **Tirar o roteador do `hermes_cli`.** Chamada HTTP direta à API do modelo, como
   as edges já fazem — alvo de 1–3 s. É o item que decide tudo; sem ele os outros
   dois não importam.
2. **Consertar a medição do shadow:** capturar o contexto **antes** do `handle()`.
   Enquanto o roteador for medido depois do consumo da pendência, o placar mente
   contra ele — e mentiria a favor dele depois do flip, quando ele estiver na
   frente.
3. **Fechar o buraco de `saida_dinheiro`** no prompt (6 das 16 perdas reais).

Com isso feito, uma semana de sombra **remedida** decide o flip com número limpo.
Os invariantes não mudam: número só de RPC canônica, o "pode" continua
determinístico (aprovação de dinheiro nunca sai do LLM), escrita atrás da V3,
rollback por env var.

---

## 5. O que fica aberto

- 🔴 **Reiniciar a bridge** — sem isso as 4 correções não estão no ar (§3).
- **Pendência fantasma:** Heiton/CG 13:36 gerou **dois cards de R$ 387** com 26 s
  de diferença; o "Pode" lançou um e o outro virou o pin *"Ainda aguardando"*.
  O dinheiro está certo (**lançado uma vez só**, conferido em
  `caixa_movimentacoes`), mas o card órfão depois disparou um falso alarme de
  duplicata contra o próprio lançamento da Sol. Não corrigido — precisa de guarda
  de "já existe card vivo para este mesmo comprovante".
- **Lançamento sem `aluno_id`:** a Kamilly (R$ 734) entrou com o nome correto no
  card e **`aluno_id` nulo** no banco. Mais 8 casos em 3 dias. O vínculo falha em
  silêncio — não há log de `vinculo_lancamento` nesses.
- **`lancado` não registra `chatId`** no log: dá para contar lançamentos, não dá
  para atribuí-los à unidade sem cruzar com o banco. Observabilidade barata de
  arrumar.
- **`parcela-recreio-vitoria.test.cjs`** falhando 2/4 desde antes de hoje (§3).

---

# Adendo — 05/09/2026, noite: os três pré-requisitos, feitos

Autorizados pelo Luciano na sequência da auditoria. Patch:
`tests/sol-runtime/_patch-roteador-v4-direto-05set.cjs` (8 âncoras, todas 1×).

## 0. A bridge recarregou

`✅ WhatsApp connected!`, zero `init falhou`. **As quatro correções da §2 estão no
ar desde 18:21 UTC (15:21 BRT).**

## 1. O roteador saiu do `hermes_cli`

Passa a ser **HTTPS direto** para a API do OpenCode Zen (compatível com OpenAI),
com o modelo escolhido por `SOL_CAIXA_V4_MODELO` — troca sem redeploy. Chave em
arquivo **600 fora do repo** (`caixa-ingestao/.secrets/zen.env`). Sem chave, cai
de volta no `hermes_cli`: a sombra nunca fica muda por falta de arquivo.

⚠️ **O `User-Agent` não é enfeite.** Sem ele o Cloudflare do `opencode.ai`
devolve `403 · error code: 1010` **antes** de a requisição chegar ao modelo — foi
o que fez as três primeiras tentativas de endpoint parecerem "URL errada".

## 2. O contexto passou a ser fotografado ANTES do `handle()`

É o conserto da medição descrita em §4.1. `handle()` tira a foto na entrada; o
observador usa a foto. O log ganhou `contexto_de` (`foto_pre_handle` |
`pos_handle`) — sem isso a próxima leitura do placar não saberia se está
comparando com a régua velha ou com a nova.

⚠️ **A foto é chaveada por `messageId`, não por `chatId`.** O bridge não
serializa o `handle` (em 05/09 às 16:36:35 chegaram 3 mensagens no mesmo
segundo); chavear por chat faria a foto de B sobrescrever a de A antes de o
observador de A ler — trocaria um defeito de medição por outro.

## 3. O prompt: a lacuna era pior que a medida

`saida_dinheiro` ganhou exemplos do jeito que a equipe escreve ("comprei água
45"). Mas a bancada achou uma lacuna **maior e invisível no shadow**:
🔴 **`lancamento_por_texto` estava no enum e não tinha uma linha de descrição.**
"PG parcela 09/26 / Aluno: X / LA CG - R$377,00" — o formato que a equipe usa o
dia inteiro — virava `aprovar` com confiança **0,95**. E `aprovar` dizia "SÓ
quando mandam lançar explicitamente", o que exclui justamente o **"pode"** que a
própria Sol ensina. Os dois foram reescritos.

## 4. Bônus: o shadow passou a guardar o texto

🔴 **Não dá para reprocessar a sombra do passado.** Nem `caixa.log`, nem
`bridge.log`, nem `sol_caixa_lancamento_auditoria` guardam o corpo da mensagem, e
`sol_caixa_ingestao_recebimentos.raw_text` parou de ser escrita em **15/08**. O
texto não existe em lugar nenhum — o replay histórico é impossível, não é questão
de esforço. A partir de agora o shadow grava `texto` (300 chars), `modelo` e
`contexto_de`: **o replay de verdade passa a existir daqui pra frente.**

No lugar do replay, uma **bancada rotulada** (`tests/sol-runtime/bench-roteador-v4.cjs`)
com 25 casos tirados dos grupos — inclusive os que a gramática errou. Conjunto
rotulado mede **acerto**; replay só mede concordância. A bancada chama
`rotearMensagemV4` **do runtime de produção**, não uma cópia do prompt.

## 5. Os quatro modelos pedidos

| modelo | acerto | mediana | falhas |
|---|---|---|---|
| **deepseek-v4-flash** | **22–23/25** | 5–8 s | 0–2 |
| glm-5.3-flash | 9–11/25 | 4,0 s | 14–15 — **não devolve JSON** |
| quen-3.8-flash | — | — | **401 `Model not supported`** |
| muse-spark-1.3-contributor | — | — | **401 `Model not supported`** |

🔴 **Dois dos quatro não existem nesta conta.** A API responde
`{"type":"ModelError","message":"Model quen-3.8-flash is not supported"}`.
Testadas também as grafias `qwen-3.8-flash`, `qwen3.8-flash`, `qwen-3-8-flash`,
`muse-spark-1.3` (esta dá 500) e `musespark-1.3-contributor`. Não é erro de
digitação nosso — o catálogo não os tem.

`glm-5.3-flash` é rápido e **não obedece a instrução de JSON**: embrulha em prosa.
Com `response_format: json_object` fica pior — devolve conteúdo **vazio**.

**`deepseek-v4-flash` é o escolhido** e é o default do `_v4Modelo()`.
`response_format: json_object` foi ligado: medido, derruba a chamada isolada para
**1,2 s** e elimina o embrulho em markdown.

## 6. 🔴 O que a medição derrubou: não é o prompt, é o provedor

Levantei a hipótese de que a lentidão vinha do tamanho do prompt. **Os dados
derrubaram.** A *mesma* requisição ao `deepseek-v4-flash` levou, em quatro
tentativas seguidas: **1,1 s · 13,8 s · 20,5 s · 45,3 s**. Comprimir o prompt de
1.900 para 1.171 caracteres não mudou o quadro, e separar em `system`+`user`
**piorou** (27–45 s). É fila do lado do provedor.

Consequência para a decisão, e ela é limpa:

- **Mediana** melhora de verdade: **21,8 s → 5–8 s**, sem um único processo Python
  por mensagem. Para a sombra, isso já vale sozinho.
- **A cauda é o que decide o flip.** Em sombra, um p99 gordo custa uma observação
  perdida. Na frente, **congela o grupo**. Por isso o timeout do roteador ficou em
  30 s **enquanto ele observa** — e, quando for para a frente, a regra tem de se
  inverter: timeout curto com queda para o caminho determinístico, para provedor
  lento degradar no comportamento de hoje em vez de travar.

**O flip continua não sendo hoje** — e agora por um motivo diferente e melhor
medido: não é mais o `hermes_cli`, é a estabilidade do provedor. O que decide é
uma semana de sombra com a régua nova, lendo `ms` e `modelo` direto do log.

---

# Adendo 2 — o catálogo real, e duas medições minhas que estavam erradas

O Luciano mandou eu ir buscar os nomes na API em vez de deduzir. Certo — e a
lista derrubou boa parte do adendo anterior.

## O erro de método que abriu isso

Eu tinha testado `GET /zen/v1/models`, levado **403**, e concluído "o endpoint
não expõe o catálogo". **O 403 era falta do `User-Agent`** — a mesma armadilha
que eu já tinha documentado dez linhas acima, no próprio adendo. Com o header, o
endpoint responde: **18 modelos**.

## O que a conta alcança de verdade

| grupo | resultado |
|---|---|
| `deepseek-v4-pro`, `deepseek-v4-flash`, `deepseek-v4-flash-vision-exp`, `glm-5.3-flash`, `glm-5.3`, `minimax-m3`, `ling-3.0-flash-fin-free` | **funcionam** |
| `claude-*`, `gemini-3.8-flash`, `gemini-3.7-flash`, `gpt-6-astra`, `gpt-5.6-terra`, `gpt-5.6-luna`, `muse-spark-*` | **500 em ~0,5 s** — instantâneo demais para ser inferência; é entitlement |
| `grok-4.5` | 503 `Upstream request failed` |

🔴 **Muse Spark: o nome certo é `muse-spark-1.3-contributor-free`** (não
`muse-spark-1.3-contributor`) — mas dá **500 instantâneo** com o id certo, sem
detalhe no corpo. O site marca "(regiões limitadas)" e este servidor está em
**São Paulo/BR**. Testados também `muse-spark-1.3` e `muse-spark-1.2-contributor-free`.

🔴 **Qwen não existe no catálogo da API.** Nenhuma variante. O site lista Qwen3.8
Flash porque aquela página é do produto **Go/CLI**; o Zen, nesta chave, não o tem.

## 🔴 O erro que invalidou meu próprio resultado: `max_tokens: 300`

Estes modelos emitem **`reasoning_content` antes do `content`, e o raciocínio
consome o mesmo orçamento**. Com 300, três deles terminavam em
`finish_reason: length` com o **`content` vazio** — e eu os tinha reprovado por
um teto que era meu, não deles:

| modelo | `max_tokens=300` | `max_tokens=2000` |
|---|---|---|
| glm-5.3-flash | `length`, **vazio** | 4,8 s, resposta certa |
| deepseek-v4-pro | `length`, **vazio** | 8,7 s, resposta certa |
| ling-3.0-flash-fin-free | `length`, **vazio** | 1,7 s, resposta certa |

O "glm não devolve JSON" do adendo 1 media o **teto de tokens**, não o modelo:
com o orçamento certo ele foi de 9-11/25 para **24/25**. Corrigido para 2000, e
`response_format` **saiu** (não acelera de forma confiável e zera o `content` de
quem raciocina; o `_parseVisionJson` já acha o último bloco `{…}` na prosa).

Isso também explica parte do que eu tinha chamado de "variância do provedor": o
`deepseek-v4-flash` gasta **1.800–2.100 tokens de raciocínio** neste prompt. A
variância existe, mas era menor do que eu disse.

## Placar final — 25 casos rotulados, prompt de produção

| modelo | acerto | mediana | **p90** | falhas |
|---|---|---|---|---|
| deepseek-v4-pro | 24/25 | 4,4 s | 13,9 s | 1 |
| glm-5.3-flash | 24/25 | 4,7 s | 12,3 s | 1 |
| deepseek-v4-flash | 24/25 | 5,6 s | 16,7 s | 1 |
| **minimax-m3** ⭐ | 23/25 | **1,9 s** | **3,2 s** | **0** |
| ling-3.0-flash-fin-free | 18/25 | 1,8 s | 5,4 s | 6 (cota) |

**`minimax-m3` é o novo padrão** (`SOL_CAIXA_V4_MODELO` troca sem redeploy).
A escolha é pela **cauda**: p90 de **3,2 s contra os 44,5 s de hoje** — 14× — e é
a única cauda do conjunto compatível com um dia ficar **na frente** do usuário.
A diferença de acerto para o topo é de **um caso**.

E os dois erros dele caem para o **lado seguro**: "esquece esse aí" virou
`conversa` (não descarta) e a prosa com R$ 633 virou `consulta_caixa` (não lança
nem dá saída). Num sistema de dinheiro, **onde o erro cai importa mais que
quantos são** — foi exatamente essa prosa que abriu uma saída de R$ 633 em 31/08.

## O ajuste de prompt que a bancada encontrou

`corrigir_competencia` era errado por **4 dos 5 modelos**: "é a parcela de 08/26 e
09/26 juntas" virava `contestar_fatura` — e com razão, porque a descrição de
contestação cobria literalmente o caso. A fronteira que faltava:
**quem diz qual é a certa está corrigindo; quem só diz que está errada está
contestando.** Com ela, glm foi 23→24 e ling 13→18.
