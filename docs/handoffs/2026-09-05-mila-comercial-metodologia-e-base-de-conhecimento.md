# Mila comercial — metodologia, estado e a base de conhecimento

**Data:** 05/09/2026 · **Para:** aprofundamento externo (Claude/GPT/Gemini) e
curadoria do Luciano + Anne Krissya.
**Objetivo deste documento:** ser autossuficiente. Quem ler isto sem conhecer a
LA Music tem de entender o negócio, a arquitetura, o que já existe, o que falta,
e — o foco — **como construir a base de conhecimento comercial da Mila**.

---

## 1. O contexto mínimo

A **LA Music** é uma rede de três escolas de música no Rio: **Campo Grande**,
**Recreio** e **Barra**. ~1.200 alunos ativos. O time comercial é pequeno e
enxuto: **uma consultora por unidade** (Vitória/CG, Daiana/Recreio,
Kailane/Barra), com uma **líder comercial** acima das três, **Anne Krissya**.

O funil: lead chega (Instagram, Google, indicação, visita) → agenda **aula
experimental** → faz a aula → matricula. Quem faz a aula converte 40–50% em
qualquer canal; o funil vaza **antes** da aula (Instagram leva 9,6% dos leads à
aula; indicação leva 77,4%).

A **Mila** é a agente da LA. Ela tem duas encarnações que não devem ser
confundidas:

| | o que é | onde roda |
|---|---|---|
| **Mila SDR** | atende o LEAD no WhatsApp, qualifica e transfere | n8n + Chatwoot |
| **Mila de gestão** | conversa com a EQUIPE (consultoras e líder) | Hermes na VPS, tools por MCP |

Este documento trata da **Mila de gestão**.

---

## 2. A metodologia: quatro camadas

```
🧱 ALICERCE ......... motor de dados
1️⃣ PRIMEIRO ANDAR ... contexto → interpretação → orientação
2️⃣ SEGUNDO ANDAR .... padrões → aprendizados → estratégia
3️⃣ TERCEIRO ANDAR ... ação → execução → medir
```

🔴 **As camadas são CAPACIDADE, não persona.** A pilha inteira se repete **para
cada agente**. A Mila do consultor tem as quatro dela; a Mila da líder tem as
quatro dela.

O erro que cometemos e corrigimos em 04/09 foi rotular andar por **quem usa**
("1º = operacional/consultoras, 2º = tático/gerentes"). Isso faz parecer que
subir de andar é trocar de público, quando subir de andar é **a mesma pessoa
ganhando uma capacidade nova**. Uma consultora precisa das quatro.

Como reconhecer em conversa:

- **1º** — *"o que está acontecendo?"* → *"você tem 3 experimentais hoje, a
  primeira às 9h com a Letícia."*
- **2º** — *"o que isso quer dizer?"* → *"quem faz a aula fecha 40–50% em
  qualquer canal, medido em 4.247 leads. Essas 3 são o ativo mais valioso do
  seu dia."*
- **3º** — *"então faz isso"* → *"quer que eu escreva a mensagem de confirmação
  para as três?"* (ela redige, mostra, e só envia com o "pode").

### 2.1 Onde entra a MEDIÇÃO (pergunta aberta, respondida aqui)

O Luciano perguntou se medir resultado seria um **quarto andar**. **Não é** — e
criar um quinto nível quebraria a própria metodologia.

**Medir é a ARESTA DE VOLTA do 3º andar para o 2º.** Sem ela, a pilha é um
encanamento: dado → leitura → conselho → ação, e acabou. Com ela, vira **ciclo**:

```
2️⃣ padrão  →  3️⃣ ação  →  resultado medido  →  2️⃣ padrão novo (ou padrão derrubado)
        ↑                                              │
        └──────────────────────────────────────────────┘
```

Concretamente: a tabela `radar_estrategias` já tem a coluna
**`evidencia_eficacia`** — e ela está **vazia em todas as 14 estratégias**. É
literalmente o campo onde mora "essa corridinha funcionou ou não". Enquanto
estiver vazio, o 2º andar **descreve mas não aprende**.

Então a regra que vale para tudo que for criado daqui em diante:
**toda ação do 3º andar tem de nascer com o desfecho previsto** — o que vamos
olhar, quando, e contra o quê comparamos. Campanha, corridinha, régua de
follow-up, disparo de indicação: todas.

⚠️ **Cuidado metodológico:** "a corridinha funcionou" não é "bateu a meta". Setembro
pode bater a meta por sazonalidade (volta às aulas) sem a corridinha ter feito
nada. A comparação honesta é contra o **mesmo mês do ano anterior** ou contra as
**unidades que não fizeram** — e quando não der para isolar, a Mila tem de dizer
*"não consigo separar o efeito"*, e não fingir causalidade.

---

## 3. O que a Mila JÁ faz (05/09/2026, em produção)

### 3.1 Com as consultoras

**Alicerce** — governança com carimbo por telefone (a identidade vem do
ambiente, nunca do modelo), RPCs canônicas, escopo por unidade dentro da função.
O modelo **não escreve SQL**: em 04/09 foram removidos 4 servidores MCP que
davam banco cru a 20 colaboradores.

**1º andar** — 8 leituras: pauta do dia, agenda (todas as experimentais com
situação real), fechamento do dia, números do mês contra a meta, estrelas do
programa Matriculador+LA, ficha completa do lead, pendências cadastrais.
Três crons: **08:30** briefing, **09h–18h** cutucada horária do que não pode
esperar, **18:30** fechamento + o mês.

**2º andar** — ligado em 05/09. Três leituras: `o_que_aprendemos` (os padrões
medidos, com amostra e idade), `onde_focar` (o público de reativação da unidade
dela, do mais quente ao mais frio, com o porquê), `desempenho_atendimento` (série
diária de conversas com o cliente esperando, com tendência).

**3º andar** — 6 escritas no cadastro (curso de interesse, motivo de perda,
canal, consultor, anotação, fechar sinal) + **recado com aprovação**: ela pede,
a Mila escreve, mostra, e só envia depois do "pode". Aceita revisão do texto no
meio da conversa.

### 3.2 Com a líder (Anne Krissya)

**1º andar** — já existia antes deste trabalho: o `anny-leads-watch.js` roda
**5×/dia** (12/14/16/18/20h) e entrega os leads parados há 2h+, por unidade e por
consultora, com tempo de espera.

**2º andar** — desde 05/09 ela vê os **padrões de gestão** (inclusive os que
nomeiam pessoas), a estratégia das três unidades com número por unidade, e a
série de atendimento da equipe.

**3º andar** — desde 05/09 ela manda recado, **e o recado tem volta**: ela pede
que a Mila avise a consultora → a consultora responde à Mila → a Mila leva a
resposta de volta, nas palavras dela.

### 3.3 Os padrões que já existem (o 2º andar medido)

| | aprendizado | amostra |
|---|---|---|
| **PC1** | O gargalo não é a aula, é chegar até ela. Quem faz a experimental converte 40–50% em **todos** os canais. O que muda é chegar: Indicação 77,4% × Instagram 9,6%. | 4.247 |
| **PC2** | Instagram traz 63% do volume e perde 90% antes da aula. | 2.998 |
| **PC3** | Ex-aluno converte 68,2% — a maior taxa de todas. E ninguém prospecta: 28 leads em 166 dias contra 2.998 do Instagram. | 28 |
| **PC4** | "Site" e Google são o mesmo canal (rótulo, não mercado). Juntos: 12,3% chegam à aula. | 1.252 |
| **PC5** | O ranking de anúncios **se inverte** quando se olha matrícula em vez de conversa. O campeão do painel (R$ 4,49/conversa) gastou R$ 1.223 e deu **zero** matrículas. | 231 |

⚠️ Todos medidos **uma vez**, em 03/09. Não há motor que recalcule. A mitigação
atual é a Mila devolver `idade_dias` e `envelhecido` (>45 dias) e ser obrigada a
dizer. **Padrão que não se remede vira folclore.**

---

## 4. O que vem — e em que camada cada coisa entra

### 4.1 Agenda de retomada (o "bumerangue") — 1º, 2º e 3º juntos

**O problema real:** a consultora atende muita gente e o lead que disse *"volto
a falar em janeiro"* some. Hoje sabemos **por que** o lead não fechou (a edge
`classificar-desinteresse` lê a conversa e extrai preço/horário/distância/
concorrente), mas **não sabemos quando ele disse para voltar**.

- **Alicerce:** tabela nova com *quando voltar*, *por quê* e **a frase original
  dele**, alimentada por extração semântica da conversa.
- **1º andar:** *"hoje é o dia da Juliana."*
- **2º andar:** *"lead que pediu para voltar e foi retomado no prazo converte X;
  fora do prazo, Y."* (a medir depois de ter volume)
- **3º andar:** a Mila redige a mensagem de retomada e manda com o "pode".

⚠️ **O lembrete tem de carregar a frase original.** *"A Juliana disse em 12/06
que voltaria a falar em setembro porque o filho estava em prova."* Lembrete sem a
frase é ruído — a consultora não lembra do caso e ignora. Aí a ferramenta morre.

⚠️ **Só lead quente.** Lead frio genérico entra na régua de reativação em massa,
não na agenda pessoal da consultora.

### 4.2 Cashback de indicação (R$ 50) — 🔴 hoje é impagável de forma auditável

**Regra do negócio:** aluno indica um amigo; se o amigo matricula, o **indicador
ganha R$ 50 de cashback**, e o comercial precisa passar ao financeiro para pagar.

**Medido em 05/09:** **209 leads por Indicação em 180 dias, 80 matricularam.**
E **nenhum registra quem indicou** — o campo não existe em `leads`; só 1 dos 209
tem qualquer observação escrita. São ~R$ 4.000 em cashback dos últimos 6 meses
sem rastro.

- **Alicerce:** campo/tabela de **quem indicou** (aluno indicador → lead
  indicado), preenchível pela Mila com uma escrita nova.
- **1º andar:** *"a Helena veio por indicação da Mariana Bonifácio."*
- **2º andar:** taxa de conversão da indicação por indicador; quem indica mais.
- **3º andar:** fila de cashback a pagar, com o aluno, o indicado, a data da
  matrícula e o valor — pronta para o financeiro.

⚠️ Isto conecta com **PC1**: indicação é o canal que mais leva gente à aula
(77,4%). Um programa de indicação bem controlado é a alavanca mais barata que a
escola tem — e hoje ela não é medida nem paga direito.

### 4.3 Provocação estratégica de início de mês (com a Krissya) — 2º → 3º

**Não é só "corridinha".** É a conversa de planejamento do mês:

- Qual a **campanha** de setembro?
- Tem **condição especial financeira** (desconto, parcelamento, matrícula
  bonificada)?
- Vai ter **ação de indicação**? (o cashback de R$ 50 entra aqui)
- Qual a **corridinha** do time? (ex.: bateu 30 matrículas → R$ 1.000 no Pix)
- Qual a **meta semanal**?

⚠️ **Hoje é 5 de setembro e não há corridinha definida.** É o argumento a favor
da provocação: sem ela, o mês começa sem desenho.

A Mila abre a conversa, e quando a Krissya responde, ela precisa de **repertório**
— é aí que entra a base de conhecimento (seção 5). E fecha com a medição: toda
campanha nasce com o desfecho previsto (seção 2.1).

### 4.4 Professor na experimental — 2º andar, com cuidado

O dado existe (`lead_experimentais` + a régua canônica do professor): dá para
saber qual professor converte mais e qual converte menos na aula experimental.

⚠️ **O número sozinho acusa injustamente.** Um professor pode ter baixa adesão
porque pegou as experimentais que ninguém mais tinha horário para pegar. Antes de
virar conversa com o professor, é preciso o **denominador honesto**. E a ação não
é cobrança: é a coordenação preparar treinamento, ou a Mila mandar uma dica de
preparação antes da aula.

### 4.5 Criativo e mídia falando sozinhos com a Krissya — 2º → 3º

Os dados **já estão prontos** e ela já os alcança: gasto diário por campanha
(Google e Meta, cron horário), funil por criativo ranqueado por **custo de
agendamento** (não por custo de conversa, que é o que inverte o ranking).

O que falta é a Mila **falar sozinha**: *"Krissya, esse criativo consumiu
R$ 1.223 em 30 dias e não trouxe matrícula. Vale falar com o Ryan (tráfego pago)
para trocar o criativo ou realocar."*

⚠️ **Limitação honesta:** a atribuição forte lead→anúncio só existe no **Meta**.
No Google o vínculo é o rótulo de canal, então o custo por matrícula é da
**plataforma**, não da campanha. Prometer recorte por campanha no Google seria
inventar.

---

## 5. 🎯 A BASE DE CONHECIMENTO DA MILA (o foco deste documento)

### 5.1 O problema

Hoje a Mila orienta com **dado** (os padrões medidos) e com **bom senso genérico
de LLM**. Falta a terceira perna: **método**. Quando a consultora pergunta *"como
eu faço um follow-up que não pareça cobrança?"* ou a Krissya pergunta *"como eu
falo com a Vitória que está caindo de rendimento?"*, a resposta hoje é o que
qualquer modelo diria — não o que **a LA decidiu que é o jeito certo**.

### 5.2 Onde isso já mora (não criar tabela nova)

Existe **`base_conhecimento_blocos`** desde 20/08/2026, criada para a Mila SDR:

- blocos com `titulo` e `conteudo`;
- `unidade_id` **NULL = global**, preenchido = exceção daquela unidade;
- `ordem` e `ativo`;
- editável por tela (Pré-Atendimento → Configurações → Conhecimento);
- montagem por **RPC única** (`get_base_conhecimento`), consumida tanto pela
  edge quanto pelo botão "Ver como a Mila vê".

⚠️ **Não reimplementar a concatenação em outro lugar** — preview e uso têm de
sair da mesma função, senão divergem (é o erro que gerou as duplicatas de
renovação neste projeto).

Hoje são **4 blocos, ~1.200 caracteres**, e eles não cobrem preço, reposição,
planos nem estrutura. Ou seja: **a estrutura existe e está quase vazia.**

A decisão pendente é se a base da Mila **de gestão** compartilha a mesma tabela
com um escopo novo (ex.: coluna `publico`: `lead` | `comercial` | `lideranca`)
ou vira tabela irmã. **Recomendação: mesma tabela, com escopo** — a régua de
edição, a RPC de montagem e a tela já existem.

### 5.3 🔴 Metodologia para construir os blocos

Esta é a parte que o Luciano vai executar com a Krissya. A regra de ouro:

> **O valor não está no volume, está na curadoria.** Uma página bem escrita do
> método que a LA quer usar vale mais que 40 transcrições de vídeo.

**Anatomia de um bloco bom.** Cada bloco deve caber em ~15–30 linhas e ter:

```markdown
## <Título curto e específico>       ← "Follow-up de lead que sumiu", não "Vendas"

**Quando usar:** <o gatilho concreto>
**O princípio:** <uma frase — o porquê, não o passo a passo>
**Como fazer:**
  1. <passo>
  2. <passo>
**O que NÃO fazer:** <o erro comum, nomeado>
**Exemplo de mensagem:** <texto pronto, no tom da LA>
**Fonte:** <de onde veio: livro/autor/método, ou "decisão interna LA">
**Escrito por:** <nome> em <data>
```

**Por que cada campo existe:**

- **Quando usar** — sem gatilho, o modelo cita o bloco fora de hora e vira ruído.
- **O princípio** — é o que permite a Mila adaptar. Só passo a passo faz ela
  ficar robótica quando o caso foge do script.
- **O que NÃO fazer** — LLM erra mais por excesso de zelo do que por falta.
  Nomear o antipadrão vale mais que dois parágrafos de teoria.
- **Exemplo de mensagem** — a consultora vai copiar. Se não tiver, ela inventa.
- **Fonte** — para a Mila poder dizer *"segundo o método X"* **sem inventar
  atribuição**. Se não houver fonte externa, escrever "decisão interna LA" é
  honesto e suficiente.
- **Escrito por / data** — conhecimento envelhece igual a padrão.

**Os 8 blocos que eu escreveria primeiro** (em ordem de retorno):

| # | bloco | por que primeiro |
|---|---|---|
| 1 | **Follow-up do lead que sumiu** | é a dor diária das 3 consultoras |
| 2 | **Retomada no prazo combinado (bumerangue)** | casa com a agenda de retomada (4.1) |
| 3 | **Programa de indicação / referidos** | indicação leva 77,4% à aula (PC1); é a alavanca mais barata |
| 4 | **Como levar o lead do Instagram até a aula** | PC2: perdemos 90% ali |
| 5 | **Reativação de ex-aluno** | PC3: 68,2% de conversão, ninguém prospecta |
| 6 | **Objeção de preço** | a mais comum, e a que mais gera desconto desnecessário |
| 7 | **Desenho de campanha e corridinha do mês** | é o que a Krissya vai pedir (4.3) |
| 8 | **Liderança: a conversa com quem está caindo** | ver 5.5 |

**Como pesquisar sem virar cópia:**

1. Escolha **um** método por assunto (ex.: para indicação, o modelo de
   "referidos" que a escola quiser adotar).
2. Leia/assista e escreva **com suas palavras** o que se aplica a uma escola de
   música com ticket de ~R$ 400/mês e ciclo de decisão familiar.
3. Traduza para o contexto: quem decide é o **responsável**, não o aluno; a
   experimental é o momento de verdade; o professor influencia a matrícula.
4. Registre a fonte no campo próprio.
5. **Peça à Krissya para vetar.** Se ela não usaria, não entra.

⚠️ **Não raspar YouTube/blog/livro para dentro do banco.** Duas razões: licença
de conteúdo de terceiro, e — mais importante — a Mila passaria a citar
"segundo Fulano" coisas que Fulano não disse. Resumo curto com atribuição, sim;
transcrição, não.

### 5.4 Como a Mila deve USAR a base (regra de comportamento)

- **Dado vence método.** Se existe padrão medido, ela cita o padrão com a
  amostra. O método entra para dizer **como fazer**, não **se compensa**.
- **Método vence intuição.** Se não há dado mas há bloco, ela cita o bloco.
- **Se não há nem um nem outro**, ela diz que é opinião — rotulada como tal.
- **Nunca inventa atribuição.** Sem fonte no bloco, não diz "segundo".

Isso espelha a regra que já está na SKILL e que nasceu de uma falha real: com a
ferramenta disponível, a Mila respondeu *"porque já mostrou interesse real"*
(intuição) em vez de *"em 4.247 leads, quem faz a aula fecha 40–50%"* (medição).
**Ter a informação não basta — tem de estar escrito quando usá-la.**

### 5.5 O bloco de liderança (para a Krissya) — o mais delicado

O Luciano foi preciso: *"o problema não é cobrança; o problema é sentar e
conversar com ela, perguntar o que está acontecendo, pegar na mão"*.

Isso tem consequência técnica direta: **a Mila não pode entregar à Krissya um
ranking de quem está pior e parar aí.** Ranking sozinho empurra para a cobrança.
O sinal tem de vir **junto com a pergunta**:

> *"A Vitória está com 14 conversas esperando; era 3 na semana passada. Vale
> perguntar o que mudou antes de cobrar."*

O bloco de liderança deve cobrir: como abrir a conversa sem acusar; a diferença
entre queda por capacidade e queda por circunstância; quando é problema de
processo e não de pessoa; e o registro do combinado (para a próxima conversa
partir de algum lugar).

### 5.6 Os valores no SOUL (não é a mesma coisa que a base)

Os valores da LA — **coragem, excelência, empatia, paixão pelo que faz** — vão no
**SOUL** da Mila, não na base de conhecimento. A distinção importa:

- **SOUL** muda o **tom**: como ela fala, o que ela recusa, como trata erro.
- **Base de conhecimento** muda o **conteúdo**: o que ela recomenda fazer.

Misturar os dois faz a base virar manifesto e o tom virar procedimento.

---

## 6. Governança — o que ainda não discutimos

Existe hoje `governanca.agente_usuarios` com nome, telefone, departamento,
nível, unidade e `pode_editar`, e a função `quem_eh(telefone)` que carimba a
identidade. É o que garante escopo por unidade e o que impede vazamento entre
consultoras.

**Perguntas abertas, para aprofundar:**

1. **Quem autoriza o quê.** Hoje `pode_editar` é booleano e ninguém do comercial
   tem. As escritas passam por aprovação humana na conversa. Escala?
2. **Trilha de decisão.** Toda escrita da Mila loga. Mas não existe revisão
   periódica: ninguém abre o log para ver se ela está registrando certo.
3. **Visibilidade de dado sensível.** Já classificamos padrões em `rede` e
   `gestao` (padrão que nomeia pessoa só alcança quem lidera). Falta a mesma
   régua para o resto: desempenho individual, custo de mídia, dado financeiro.
   ⚠️ Em 05/09 descobrimos que custo de mídia estava visível para 7 pessoas que
   não deviam ver (administrativo, financeiro, pedagógico, RH) — corrigido.
4. **Quem responde pelo que a Mila diz.** Se ela orientar errado e a consultora
   agir, de quem é a decisão? Hoje a resposta prática é "a consultora decide" —
   por isso tudo que sai passa por "pode". Mas isso precisa estar escrito.
5. **Direito de esquecimento e retenção.** Quanto tempo guardamos conversa de
   lead, resposta de recado, série de desempenho por pessoa.

---

## 7. Cicatrizes — o que já custou caro

1. 🔴 **O Hermes não propaga env do processo para o MCP.** Só o bloco `env:` do
   `mcp_servers` chega. Custou dois incidentes em 04/09: todas as consultoras
   falando como diretoria, e um teste que mandou WhatsApp real a um professor.
2. 🔴 **Validar no caminho REAL, não no wrapper.**
3. 🔴 **Tool nova não basta — tem que ENSINAR quando usar.**
4. 🔴 **Palavra solta nunca é comando** (lição vinda da Sol): gatilho por
   vocabulário precisa de rótulo, verbo, posição ou complemento.
5. ⚠️ **Formato é molde, não instrução.** "Formato de WhatsApp, curto" produz
   texto corrido; o molde literal produz o formato.
6. ⚠️ **Não inventar regra quando já existe a canônica.**
7. ⚠️ **Ambiguidade é recusa, não sorteio.** Há duas "Vitória" na governança; a
   Mila pergunta em vez de escolher.

---

## 8. Sequência acordada (05/09)

1. **Agenda de retomada** (bumerangue) — maior ganho por esforço.
2. **Base de conhecimento** — Luciano + Krissya ditam os blocos; Mila obrigada a
   citar a fonte.
3. **Provocação de início de mês com a Krissya** — setembro já está correndo.
4. **Professor na experimental** — com denominador honesto.
5. **Criativo/Google falando sozinho com a Krissya.**
6. **Pendentes:** remedir os padrões · `minha_pauta` citar o aprendizado · o elo
   estratégia→ação (*"quer que eu monte a lista?"*).
7. **Transversal, a partir de agora:** toda ação nasce com o desfecho previsto
   (seção 2.1), e `radar_estrategias.evidencia_eficacia` deixa de ser NULL.

---

## 9. O que pedir ao modelo externo

Ao levar este documento para aprofundamento, os pedidos mais úteis são:

1. **Escrever os 8 blocos da seção 5.3** no formato da anatomia, para uma escola
   de música com ticket ~R$ 400/mês, decisão familiar e aula experimental como
   momento de verdade.
2. **Criticar a seção 5.4** (a hierarquia dado > método > opinião): ela se
   sustenta? onde quebra?
3. **Propor a medição de cada ação** da seção 4 — o que olhar, quando, e contra
   o quê, sem cair em falsa causalidade.
4. **Ajudar na seção 6 (governança)**, que é a mais crua.

⚠️ O que **não** pedir: números da LA. Todos os números deste documento saíram
de medição no banco de produção e não devem ser recalculados por inferência.
