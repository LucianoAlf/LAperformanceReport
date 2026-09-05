# Bloco 11 — Pré-atendimento da Mila SDR: o bot não converte, ele passa o bastão
**Escopo:** comercial · **Público:** Krissya e Alf (Mila da líder) · **Estado:** candidato v0.1 · **Decisor:** Alf (produto) e Krissya (operação)

---

## Quando usar
- Toda vez que alguém disser *"o bot atrapalha"* ou *"o bot resolve"* — nenhuma das duas está provada.
- Leitura semanal das 3 caixas comerciais do WhatsApp.
- Desenho e leitura do **experimento de repasse ao humano** (abaixo).
- Antes de ler qualquer taxa de conversão do funil — até os leads sintéticos serem marcados, o número carrega erro.

**Sinal medido** (pesquisa de 05/09/2026 — 900 conversas, 4 meses, 300 por unidade; 364 matrículas cruzadas; 189 conversas pareadas):

| o que | número |
|---|---|
| conversas que **nunca chegam a um humano** | **45%** (Recreio 57% · CG 51% · Barra 26%) |
| só bot → converteu / cliente sumiu | **0,5%** / **90%** |
| humano abriu a conversa → converteu | **21,8%** |
| **bot abriu e humano entrou depois → converteu** | **2,8%** (Barra 0,7% · CG 4,2% · Recreio 6,4%) |
| só bot: cliente mandou **≤ 2 mensagens** e sumiu | **58%** (194 de 445 mandaram uma só) |
| pediram explicitamente pra falar com gente | **3 em 900** (2 não foram atendidas) |
| WhatsApp participou da venda (conversa antes da matrícula) | **62%** — 73–83% nos canais digitais |
| Barra: conversa só começou **depois** da venda | **25%** (dobro das outras) |

## O princípio
São **dois públicos, não duas técnicas**: o bot pega o volume frio que entra pelo anúncio; o humano abre conversa com quem já está morno (indicação, retorno de visita). Comparar 0,5% com 21,8% e concluir que "humano converte 40× mais" é comparar Instagram com indicação.

O que os números permitem dizer:
1. **O bot não é rejeitado** — 0,3% pedem gente. O problema é a conversa **morrer antes de alguém entrar**.
2. **A morte é na abertura.** 58% de quem fica só no bot manda uma ou duas mensagens e some. O funil não vaza no preço (só 17% chegam a perguntar) — vaza na primeira troca.
3. **O repasse tardio não salva.** Bot abriu e humano entrou: 2,8%. Quando o humano chega depois, o lead já esfriou — ou nunca foi quente.
4. **A pergunta que importa não se responde com histórico:** *as 403 conversas que morreram só no bot converteriam mais com um humano entrando cedo?* Só experimento responde.

O papel do bot, portanto, não é converter: é **não perder o lead na abertura e passar o bastão rápido**, com contexto.

## Como fazer

### A) Leitura semanal por unidade (Mila → Krissya) — 4 números
1. % de conversas só-bot (meta: cair).
2. % que morrem com ≤ 2 mensagens do cliente — **separado por canal** (ver hipótese abaixo).
3. Taxa de passagem bot → humano e **tempo** até o humano entrar.
4. Conversão bot → humano (hoje 2,8%).

### B) A hipótese da abertura — checar antes de mexer no bot
194 conversas com **uma** mensagem do cliente. Duas explicações possíveis, com correções opostas:
- **Anúncio de clique-pro-WhatsApp com texto pré-preenchido** ("Olá, quero saber mais"): a pessoa clicou, nunca leu a resposta. Se for isso, a correção é no anúncio (texto pré-preenchido que já pergunte algo concreto: *"Quero uma aula experimental de ___ pra ___"*) e no critério de lead — não conta como conversa.
- **A pessoa escreveu de verdade e a primeira resposta do bot não acolheu.** O roteiro oficial abre com *"Qual o seu nome?"* — pra quem escreveu *"quero saber de bateria pra minha filha de 7 anos"*, isso ignora o que ela disse. A correção é o bloco 1 aplicado ao bot: **acolhe o que a pessoa escreveu → responde em uma linha → uma pergunta**. ⚠️ *Cruzar as 194 com o canal e o texto da 1ª mensagem antes de decidir.*

### C) O experimento de repasse (3º andar — fecha o laço)
- **Onde:** Recreio (57% só-bot, 86% somem — o maior espaço pra melhorar). CG e Barra são o controle.
- **Regra:** toda conversa em que o cliente respondeu ao bot ao menos uma vez e **não agendou em 2 horas** (horário comercial) vai pra Daiana, com o contexto que o bot já colheu. Fora do horário, primeira coisa da manhã.
- **Duração:** 30 dias.
- **O que não muda junto:** roteiro do bot, campanha, preço.
- **Desfecho previsto:** agendamentos por conversa, show-up e matrículas por conversa no Recreio × CG e Barra no mesmo mês; horas da Daiana gastas; conversão bot→humano (sai de 6,4%?).
- **Leitura honesta:** se subir no Recreio e não nas outras, é sinal atribuído; incremento só com repetição noutra unidade.

### D) Regras que valem desde já (não precisam de experimento)
- **Pediu gente, recebe gente** — em 15 minutos. 2 de 3 pedidos ficaram sem resposta.
- **Repasse com contexto:** o humano recebe idade, unidade, instrumento, motivação e a última frase do lead. Não re-pergunta o que o bot já perguntou (Caso 3: "o roteiro venceu a pessoa").
- **Lead que já fez experimental ou disse que mora longe** → sai do roteiro do bot e vai pro humano com a régua de preço do bloco 1.
- **Alicerce primeiro:** marcar os leads sintéticos (`origem_registro = 'sync_aluno'`) antes de comparar conversão entre meses — em junho a conversão do Recreio caía de 15,8% pra 6,1% ao tirá-los.

### E) As perguntas de liderança por unidade (bloco 8: sinal + pergunta)
- **Recreio:** *"57% das conversas morrem sem falar com gente, contra 26% da Barra. O que está diferente — volume, horário, quem assume?"*
- **Barra:** *"Um quarto das conversas só começa depois da venda. Vocês vendem no presencial e o WhatsApp entra depois, ou a conversa está começando tarde?"*
- **Campo Grande:** *"Melhor passagem pelo funil (67% das matrículas passaram pelo WhatsApp) e menor conversão na conversa (4%). Onde está perdendo?"*

## Como a Mila traz pra Krissya
*"Krissya, no Recreio 57% das conversas morrem sem ninguém entrar, e 58% das que ficam só comigo param depois de duas mensagens. Quer rodar em setembro o teste: toda conversa que eu não agendar em 2h vai pra Daiana com o contexto, e a gente compara com CG e Barra? Eu monto a medição."*

## O que NÃO fazer
- Concluir "o bot atrapalha" ou "o bot funciona" com dado histórico.
- Ranquear consultora pela conversão das conversas do bot — o público de cada caixa é diferente.
- Medir bumerangue contando perguntas (inverte — bloco 1).
- Deixar "quero falar com uma pessoa" sem resposta.
- Humano re-perguntar nome, idade e unidade que o bot já colheu.
- Comparar conversão de meses diferentes sem marcar os leads sintéticos.
- Mexer no roteiro do bot, no anúncio e no repasse ao mesmo tempo.

## Exemplo — primeira resposta do bot, hoje e como poderia ser
Lead: *"Boa tarde, quero saber sobre aula de bateria pra minha filha de 7 anos."*
Hoje: *"Olá! 😊 Sou a Mila, assistente especialista de atendimento do Grupo LA Music! Qual o seu nome?"*
Poderia ser: *"Boa tarde! Que legal — 7 anos é uma idade ótima pra bateria, a gente tem turma de Iniciação ao Instrumento pra essa faixa 🥁 Sou a Mila, da LA Music. Vocês são de qual região — Campo Grande, Recreio ou Barra?"*
(acolhe, responde em uma linha, uma pergunta — e o nome vem naturalmente na sequência)

## Como medir
- % só-bot por unidade (meta: Recreio abaixo de 40% em 60 dias, se o experimento confirmar).
- Morte na abertura (≤ 2 msgs) por canal.
- Tempo bot → humano (meta: ≤ 2h em horário comercial).
- Conversão bot → humano (linha de base 2,8%).
- Pedidos de humano atendidos (meta 100%).
- Rótulo: observado / atribuído / incremental. Tudo aqui é correlação até o experimento rodar.

## Fonte
- *Pesquisa: o atendimento comercial no WhatsApp* (05/09/2026) — 3 estudos contra a base de produção: leads sintéticos (`sync_aluno_to_leads`), passagem pelo WhatsApp (364 matrículas), Mila SDR (900 conversas, cota por caixa), régua do bumerangue (189 pareadas).
- Cortes adicionais feitos em 05/09 sobre a planilha SEM-PII do estudo da Mila SDR: bot abriu + humano entrou = 2,8%; ≤ 2 mensagens do cliente = 58% das só-bot. Arquivos com PII não foram abertos.
- *Atendimento da Mila — Grupo LA Oficial 2025*: roteiro oficial (abre com nome).
- Casos reais 3 e 4 (05/09/2026).
- Bloco 1 (bumerangue), bloco 8 (sinal + pergunta).

**Escrito por:** Alf + Claude · **Data:** 05/09/2026 · **Estado:** candidato · **Decisor:** Alf (produto) e Krissya (operação)
