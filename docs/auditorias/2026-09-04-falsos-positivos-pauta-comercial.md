# Falsos positivos na pauta comercial — investigação do feedback das consultoras (04/09/2026)

O bloco "🔥 SINAIS DO DIA — AÇÃO" estreou no relatório comercial de 03/09 às
20h05. A Daiana (Recreio) e a Vitória (CG) gostaram e, no mesmo dia, apontaram
ruído. **Elas estavam certas em quase tudo.** Este é o apuramento caso a caso.

---

## O que elas disseram

**Daiana (Recreio), 4 áudios:**
> *"No Cauã e no Marcelo, eles retornaram falando que não iriam no momento. Eu
> agradeci e fechei a conversa. Só que aí está dando como se não tivesse tido o
> desfecho."*
>
> *"Já tentei contato com essa galera, mas ninguém deu retorno. E teve uns que
> deram, mas que não quiseram reagendar."*
>
> *"Ambos eu agendei experimental. Só que ambos também não vieram, faltaram."*

**Vitória (CG):**
> *"Graciele — já passei todas as informações de valores e sugeri uma aula
> experimental. **Ela** que ficou de dar um retorno."*
>
> *"Leandro — falou que não vai matricular no momento e explicou os motivos. Eu
> agradeci e falei que estaríamos à disposição."*
>
> *"Fiquei na dúvida de qual a base que usaram e se eu tenho que sinalizar de
> alguma forma quando já dei o retorno."*

---

## Quatro causas distintas, não uma

### 1. 🔴 A etapa do lead vinha do flag errado — **defeito, corrigido**

O relatório disse *"Marcelo Cavalcante de Lima **fez a experimental** de Violão"*.
A Daiana disse que ele faltou. Os dois estão parcialmente certos e o sistema
estava errado: na fonte canônica `lead_experimentais`, a aula dele está
**`cancelada`** — ela nunca aconteceu.

`vw_jornada_lead_v1` decidia a etapa com:

```sql
WHEN COALESCE(exp.exp_realizadas,0) > 0 OR l.experimental_realizada THEN 'experimental_realizada'
```

O `OR l.experimental_realizada` fazia o flag de `leads` **sobrepor a fonte
canônica**. O Marcelo tem os dois flags contraditórios ao mesmo tempo
(`experimental_realizada = true` **e** `faltou_experimental = true`).

**Medido: 10 leads com essa contradição; 8 sinais R15 abertos sem nenhuma
experimental realizada na fonte canônica.**

⚠️ `lead_experimentais` já era declarada canônica no CLAUDE.md — a taxa de
conversão do professor foi migrada de `leads` para ela em 20/06/2026 pelo mesmo
motivo. A regra agora vale aqui também: **existindo linha canônica, ela manda**;
o flag de `leads` só resgata quem não tem nenhuma. `cancelada` ganhou tratamento
próprio (não é agendada nem realizada).

**Efeito: 13 sinais fechados como `improcedente`** (8 R15 + 5 R17). Marcelo e
Cauã saíram da lista do Recreio.

### 2. 🔴 "Ligar para remarcar" para quem já foi remarcado duas vezes — **corrigido**

A **Maria Eduarda** tem **três** experimentais: 21/08 faltou, 27/08 agendada,
31/08 faltou. Ou seja, **a Daiana remarcou duas vezes**. Mandar "ligar para
remarcar, sem cobrança pela falta" pela terceira vez ignora o trabalho já feito —
e é assim que o canal perde credibilidade.

**Medido: 13 dos 82 R17 abertos (16%) são de quem faltou 2 ou mais vezes.**

A orientação passou a ser:

> *Decidir se vale mais uma tentativa ou encerrar com motivo — já faltou 2 vezes
> e ligar de novo repete o que já foi feito. Se encerrar, registrar o motivo no
> CRM: sem isso ele volta nesta lista amanhã.*

⚠️ **A ação vem na primeira frase.** O bloco do grupo corta a orientação na 1ª
frase; a primeira versão chegou ao WhatsApp como *"→ Já faltou 2 vezes."* e
perdeu exatamente o que a pessoa devia fazer.

⚠️ **Correção de um número meu:** eu havia medido "22 R17 já remarcados depois" —
estava errado, o critério incluía remarcações que **também** faltaram. Com o
critério certo (remarcação que vingou: `realizada`/`convertido`/`agendada`
posterior), são **0**. O problema real é o outro, a repetição de faltas.

### 3. 🟡 Cobrança da secretaria entregue ao comercial — **corrigido**

O sinal da **Graciele** cobrava uma promessa da escola:
*"Pode deixar que eu vou ficar em cima para falarem com você logo logo 💛"*.

Só que essa frase é da conversa **`LA_Secretaria_CG`**, atribuída à **Gabriela
Leal**. Quem prometeu foi a secretaria; **a cobrança foi para a Vitória**, que
respondeu com razão *"eu já atendi isso"* — ela atendeu **a conversa dela**, que é
outra.

O domínio vinha da ENTIDADE (lead → comercial) e ignorava o departamento da
conversa. Agora, em sinal de origem `llm_conversa`, **o departamento manda**: a
conversa tem dono, e o dono é quem prometeu.

**Medido: 1 sinal** (de 26 de origem conversa). Raro — mas foi justamente o que
a Vitória viu.

### 4. 🔴 "Mais 163 na fila" era promessa falsa — **corrigido**

Este é o achado maior, e explica o tom dos dois feedbacks.

| regra | abertos | ≤14 dias | 15-30 dias | **>30 dias** | pior |
|---|---|---|---|---|---|
| R15 | 175 | 23 | 29 | **123 (70%)** | 120 dias |
| R17 | 82 | 13 | 20 | **49 (60%)** | 118 dias |

O relatório prometia *"Mais 163 na fila — os próximos vêm amanhã"* como se fosse
fila de trabalho. **Em dois terços, é cemitério.** A consultora que confiasse na
fila gastaria o dia ligando para gente de quatro meses atrás — que é literalmente
o que a Daiana disse já ter feito.

A pauta diária passou a entregar só o que ainda dá para agir por telefone
(**≤ 30 dias**), e o contador da fila conta só isso — senão continuaria mentindo,
com número menor.

⚠️ **O sinal antigo não é apagado.** Ele é real: o desfecho de fato não existe. O
que muda é a **entrega** — quem passou de 30 dias pertence a campanha de
reativação, outro movimento, outro texto, outro dono.
`radar_publico_reativacao_v1` já dimensiona: **368 fizeram experimental e não
matricularam**.

⚠️ **Overload:** acrescentar `p_janela_dias` com DEFAULT criou uma 2ª assinatura
e o Postgres passou a recusar com `function is not unique`. A antiga foi dropada
no mesmo passo — é o caso que o CLAUDE.md registra do `upsert_lead` (11/08, 22
leads perdidos em 21h).

---

## ❗ O que NÃO é defeito, e precisa de decisão

**Cauã e Leandro continuam na lista, e estão certos ali.** As duas consultoras
declararam o desfecho **verbalmente, no WhatsApp**, e fecharam a conversa. No
banco, `leads.motivo_nao_matricula` e `motivo_nao_matricula_id` estão **NULL** e
`arquivado = false`. **Não existe nada que o sistema possa ler.**

Conferido: a conversa do Marcelo no espelho do Chatwoot está `pending` com a
Mila — a conversa em que a Daiana falou com ele **não passa por um canal que a
gente espelhe**.

A pergunta da Vitória é exatamente esta e ainda não tem resposta:

> *"Eu tenho que sinalizar de alguma forma quando já dei o retorno?"*

**Hoje: sim, e não há como.** Enquanto isso não existir, esses casos voltam todo
dia — e são ruído legítimo, não bug.

Três caminhos, e a escolha é de negócio:

1. **Campo no CRM** — existe (`motivo_nao_matricula`), mas elas trabalham no
   WhatsApp; adoção tende a zero.
2. **Ler o `resolved` do Chatwoot** — é a ação que elas **já fazem**, na
   ferramenta que já usam. Exige que a conversa esteja numa inbox espelhada.
3. **Responder ao próprio sinal** ("resolvido, ele não quer") e o sistema fechar.
   É 3º andar (governança) e não está construído.

---

## ⚠️ Concentração que sobrou e não mexi

Depois de tudo, **Campo Grande fica com 115 na fila e 94 deles são R16** (78%) —
"experimental agendada que já passou sem desfecho".

O lastro da própria R16, escrito em 03/09, já avisa:

> *93 dos 103 são de Campo Grande, contra 9 do Recreio e 1 da Barra. Uma
> concentração de 90% numa unidade é assinatura de PROCESSO (CG não atualiza o
> status depois da aula), não de oportunidade comercial.*

**Não removi da lista da consultora por conta própria** — decidir se "a aula
passou e ninguém lançou" é tarefa de consultora ou de ADM muda o dia de alguém, e
é chamada de negócio. Fica registrado para decisão.

---

## Resumo

| | antes | depois |
|---|---|---|
| sinais falsos por fonte não canônica | 13 abertos | **0** (fechados como improcedente) |
| orientação errada em falta repetida | 13 | **0** |
| cobrança no time errado | 1 | **0** |
| "fila" com >30 dias | 172 de 257 | **fora da pauta diária** |

Nada foi apagado. Tudo que saiu da pauta continua no banco, com o motivo
registrado — é o que vai permitir medir a taxa de falso positivo daqui pra frente.
