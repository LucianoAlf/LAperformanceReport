# Pesquisa: o atendimento comercial no WhatsApp

**05/09/2026** · Três estudos medidos contra a base de produção, mais um achado
de dado que apareceu no caminho e é o mais grave de todos.

**Para quem:** Luciano, Anne Krissya e a conversa de liderança com a equipe
comercial. Escrito para ser lido inteiro por quem não acompanhou a construção.

> ⚠️ **Uma divergência de cadastro a resolver antes da call.** O Luciano se refere
> à Kriss como **gerente da Barra**. Na governança, **Anne Krissya** está como
> `departamento=comercial, nivel=lider, unidade_id=NULL` — ou seja, **líder das
> três unidades**, e é assim que a Mila a trata (ela vê as três). Se o papel real
> for gerência de uma unidade, o cadastro precisa mudar; se for liderança da
> rede, está certo. Este documento cobre a rede **com um mergulho na Barra**,
> para servir nas duas leituras.

---

## A metodologia — onde cada achado entra

```
🧱 ALICERCE ......... motor de dados
1️⃣ PRIMEIRO ANDAR ... contexto → interpretação → orientação
2️⃣ SEGUNDO ANDAR .... padrões → aprendizados → estratégia
3️⃣ TERCEIRO ANDAR ... ação → execução → medir
```

As camadas são **capacidade, não persona** — a pilha inteira se repete para cada
agente. Esta pesquisa é **2º andar**: procura padrão e aprendizado. Cada achado
abaixo diz em que andar ele encaixa e o que ele destrava.

---

# PARTE 1 — O achado mais grave: o funil mede a si mesmo

## O que foi encontrado

Existe um gatilho no banco, `sync_aluno_to_leads`, que faz o seguinte: quando uma
matrícula chega do Emusys e **não existe lead correspondente**, ele **cria um
lead retroativamente**, já marcado como convertido, sem canal de origem, com a
observação:

> *"Lead orgânico - nenhum lead encontrado para vincular com o aluno"*

**Não são leads que viraram matrícula. São matrículas que viraram lead.**

## O tamanho

| medida | número |
|---|---|
| convertidos sem canal, últimos 6 meses | **201** |
| destes, com a frase acima em `observacoes` | **181** |
| leads com status `convertido` desde junho | 235 |
| **destes, sintéticos** | **97 (41%)** |

## O efeito no relatório que a equipe recebe

O KPI canônico tem um campo chamado **`matriculas_sem_lead_vinculado`** — existe
justamente para medir quem fecha sem passar pelo funil. Medido em agosto:

| unidade | matrículas | "conversões de lead" | **sem lead vinculado** |
|---|---|---|---|
| Barra | 19 | 19 | **0** |
| Campo Grande | 24 | 24 | **0** |
| Recreio | 23 | 23 | **0** |

**O relatório diz que 100% das matrículas vieram de lead, nas três unidades.**
O indicador está permanentemente zerado porque o gatilho fabrica o lead antes de
alguém contar. Só em agosto, **18 das 66 matrículas comerciais (27%)** tiveram
lead fabricado.

E a taxa de conversão do funil sai inflada:

| | com sintéticos | sem sintéticos |
|---|---|---|
| Recreio jun/26 | 15,8% | **6,1%** |
| Campo Grande jun/26 | 8,4% | **3,1%** |
| Barra ago/26 | 11,4% | **8,4%** |

Nenhuma das quatro funções canônicas (`get_kpis_comercial_canonicos_v2`,
`montar_relatorio_comercial_mensal_payload_sem_pagantes_v1`,
`recalcular_dados_mensais_unguarded`, `radar_trafego_canal_v1`) filtra esses
registros.

## Sugestão — e o que NÃO fazer

🔴 **Não apagar os sintéticos nem desligar o gatilho.** Eles existem por um
motivo (dar ficha ao aluno) e removê-los quebraria vínculos.

✅ **Marcá-los.** Hoje o único discriminador é o **texto** de `observacoes` — e
ele já tem duas grafias ("organico" e "orgânico"), o que é frágil por
construção. O que resolve é um campo (`origem_registro = 'sync_aluno'`) e as
funções canônicas passarem a distinguir. Aí `matriculas_sem_lead_vinculado`
volta a medir o que promete.

**Camada:** 🧱 alicerce. Enquanto isso não existir, todo número de funil e de
canal — inclusive custo por matrícula de mídia — carrega esse erro.

---

# PARTE 2 — Quem fecha passa pelo WhatsApp?

**364 matrículas** dos últimos 6 meses, cada uma cruzada com o Chatwoot para ver
se havia conversa nas caixas comerciais **antes** da matrícula.

```
antes       225  61,8%   ← o WhatsApp participou da venda
só depois    56  15,4%   ← só pós-venda (confirmação, dados, 1ª aula)
nenhuma      83  22,8%   ← nunca houve conversa nessas caixas
```

## Por unidade

| unidade | matrículas | passou antes | só depois | nenhuma |
|---|---|---|---|---|
| Campo Grande | 146 | **67,1%** | 9,6% | 23,3% |
| Recreio | 116 | 61,2% | 13,8% | 25,0% |
| **Barra** | 102 | **54,9%** | **25,5%** | 19,6% |

⚠️ **Na Barra, um quarto das conversas de WhatsApp só começa depois da venda.**
É o dobro das outras duas. Ou a Barra vende mais no presencial, ou a conversa
digital está começando tarde. É pergunta de liderança, não acusação.

## Por canal — o que explica a maior parte do "nenhuma"

| canal | matrículas | passou antes | nenhuma |
|---|---|---|---|
| Google | 46 | **82,6%** | 4,3% |
| Instagram | 76 | 76,3% | 3,9% |
| Indicação | 75 | 73,3% | 14,7% |
| Visita/Placa | 50 | 72,0% | 6,0% |
| **(sem canal)** | **82** | **22,0%** | **64,6%** |
| Ex-aluno | 13 | 38,5% | 38,5% |

**53 dos 83 "nenhuma" estão em "sem canal"** — e "sem canal" é exatamente o
balde dos leads sintéticos da Parte 1. **Dois métodos independentes apontando o
mesmo buraco.**

## Aprendizado

O WhatsApp participa de **~62%** das matrículas, e de **73% a 83%** quando o
lead tem canal digital identificado. O gargalo é real, **e vale para a fatia de
quem chega por Instagram, Google e indicação** — não para a escola inteira.

**Camada:** 2️⃣ — é padrão, e reenquadra a pergunta "onde investir".

---

# PARTE 3 — A Mila SDR ajuda ou atrapalha?

**900 conversas** das três caixas comerciais (**cota de 300 por unidade**), 4
meses.

## A intuição do preconceito com robô: medida, e não aparece

> **3 pessoas em 900 (0,3%)** pediram explicitamente para falar com uma pessoa.
> Dessas, **2 não foram atendidas**.

Eu esperava dezenas. Não há uma multidão dizendo "quero falar com um humano" e
sendo ignorada.

⚠️ **Ressalva honesta:** isto mede quem **pede**. Quem se incomoda e simplesmente
sai não aparece aqui — e sair é o que a maioria faz.

## O que aparece, e é grande

| | conversas | converteu | cliente sumiu |
|---|---|---|---|
| **só falou com o bot** | 403 | **0,5%** | **90,1%** |
| **chegou a um humano** | 455 | **11,2%** | 68,4% |

**45% das conversas nunca chegam a um humano.** Quando ficam só no bot, 9 em
cada 10 pessoas somem e praticamente ninguém matricula.

| quem respondeu primeiro | conversas | converteu |
|---|---|---|
| bot | 656 | **1,4%** |
| humano | 202 | **21,8%** |

## Por unidade — aqui a Barra aparece bem

| unidade | converteu | chegou a humano | só bot | cliente sumiu |
|---|---|---|---|---|
| **Barra** | **8,0%** | **71,7%** | 26,3% | 76,3% |
| Recreio | 6,0% | 37,0% | **57,3%** | **86,3%** |
| Campo Grande | 4,0% | 43,0% | 50,7% | 62,0% |

🔴 **No Recreio, 57,3% das conversas morrem sem nunca falar com gente**, e 86,3%
dos clientes somem. A Barra pega o dobro (71,7% chegam a humano) e converte o
dobro do CG.

Isso **contraria** a leitura da Parte 2, onde a Barra parecia a pior. As duas
coisas convivem: a Barra vende bastante para quem nunca foi lead de WhatsApp
**e** é quem melhor pega o lead que chega pelo WhatsApp.

## O que NÃO dá para concluir

🔴 **Isto não prova que o bot atrapalha.** O humano abre a conversa justamente
quando o contato é quente (retorno de indicação, follow-up de visita); o bot pega
o volume frio de entrada. Comparar os dois é comparar **dois públicos**, não duas
técnicas.

## A pergunta que fica — e como respondê-la

> Aquelas **403 conversas que morreram só com o bot** converteriam mais se um
> humano tivesse entrado?

**Não se responde com dado histórico. Só com experimento.** Uma unidade, um mês,
humano entrando em todas as conversas que o bot não converteu em 24h. Comparar
com as outras duas.

**Camada:** 3️⃣ — ação → execução → **medir**. É o desenho que fecha o laço.

---

# PARTE 4 — A régua do "bumerangue" não se sustentou como métrica

Foi medida numa **amostra pareada** (mesma unidade, canal e mês), 189 conversas,
cortadas no dia da matrícula.

| sinal | matricularam | não matricularam | veredito |
|---|---|---|---|
| **S1** — 2+ mensagens da escola sem pergunta | **47,3%** | 36,5% | ❌ **inverte** |
| **S2** — perguntou preço e nunca mais falou | 0 de 5 | 7 de 21 (33,3%) | ✅ direção certa, base pequena |

E o mais desconfortável, estável em duas rodadas:

> mensagens da escola **com** pergunta: quem fechou **2,3** · quem não fechou **5,3**

## Aprendizado

Isso **não desmente o bumerangue como método** — desmente **contar perguntas como
medida dele**. O que a contagem captura é provavelmente o laço de qualificação do
bot, que pergunta de novo e de novo justamente com quem não engaja. Casa com a
Parte 3: 656 conversas abertas pelo bot, 1,4% de conversão.

⚠️ **S1 não vira alarme.** Está registrado em memória permanente para não ser
reconstruído daqui a três meses.

**Só 17% das conversas chegam a perguntar preço.** O gargalo provavelmente não é
preço — é antes disso.

---

# PARTE 5 — Quatro conversas reais, e o que elas ensinam

Transcrições completas em `.local/conversas-comerciais-para-base-de-conhecimento.md`
(fora do repositório, por conter conversa de cliente).

## ✅ O que funcionou

**Fechamento com condição e prazo** — Barra, lead entrou 28/08 e matriculou
31/08. A cliente perguntou *"posso pagar tudo na sexta?"* e a resposta não foi
sim nem não:

> *"hoje precisa ser pago o passaporte ou pelo menos uma parte dele para as
> condições serem válidas"*

Condição ancorada no benefício, com meio-termo. A cliente pagou em 35 minutos.

**A liderança entrando para destravar** — os dados de pagamento vieram da própria
líder às 22h36, não deixando a consultora sozinha.

**O lembrete da 1ª aula, quatro dias depois** — *"Lembrando da primeira aula hoje
da Leticia!"* A família respondeu que estava a caminho. E **errou o condomínio**
— o lembrete deveria trazer o endereço.

**Confirmar data por extenso** — quando a mãe perguntou "qual data?", o bot
respondeu *"hoje é sexta-feira, então o próximo sábado é dia 05/09/2026"*. Parece
pequeno; é o que evita o "achei que era o outro sábado".

## ❌ O que não funcionou

**Preço pedido duas vezes, e silêncio de 24h.** Cliente de Santa Cruz:

> *"somos de Santa Cruz, é um pouco distante, não queríamos fazer viagem perdida
> sabe? Já queríamos ir até a visita já com um valor preparado"*

Não recebeu valor. Ficou de receber retorno, esperou **24 horas**, e foi **ela**
quem cobrou. E quando cobrou, entregou a venda pronta:

> *"E eu estou interessada, em teclado e meu namorado em bateria"*

Dois alunos, instrumentos definidos, intenção declarada. Ninguém agarrou.

⚠️ **Objeção de distância foi respondida com argumento genérico** ("muitas
pessoas de bairros distantes também procuram a LA") em vez de resolvida: horário
que compense a viagem, os dois no mesmo dia, ou o próprio valor por telefone.

**A melhor pergunta do funil sem resposta.** Depois da experimental, a mãe
escreveu:

> *"Meu marido toca violão e diz que ela deveria aprender violão primeiro. Mas
> gostaria de ouvir um especialista."*

Ela está escolhendo a escola como fonte de verdade **contra a opinião do
marido** — o momento mais fácil de fechar que existe. Passaram-se dois dias.
⚠️ E a família **matriculou mesmo assim** — o que mostra o tamanho do que se
ganha fechando esse buraco, não que o buraco seja inofensivo.

---

# PARTE 6 — O que levar para a call

## Os quatro números

1. **27% das matrículas de agosto não tinham lead** — e o relatório diz 0%.
2. **45% das conversas nunca chegam a um humano.** No Recreio, 57%.
3. **62% de quem fecha passou pelo WhatsApp** — 73–83% entre os canais digitais.
4. **3 pessoas em 900 pediram para falar com gente.** O problema não é rejeição
   ao bot; é a conversa morrer antes de alguém entrar.

## As três perguntas de liderança (não de cobrança)

- **Recreio:** *"57% das conversas de vocês morrem sem falar com gente, contra
  26% da Barra. O que está diferente — volume, horário, quem assume?"*
- **Barra:** *"Um quarto das suas conversas de WhatsApp só começa depois da
  venda. Vocês estão vendendo no presencial e o WhatsApp entra depois, ou a
  conversa está começando tarde?"*
- **Campo Grande:** *"Vocês têm a melhor passagem pelo funil (67%) e a menor
  conversão na conversa (4%). Onde está perdendo?"*

## As três decisões que este material sustenta

| decisão | camada | o que ela destrava |
|---|---|---|
| **Marcar os leads sintéticos** | 🧱 | todo número de funil e de canal volta a ser real |
| **Experimento de repasse ao humano** em uma unidade por um mês | 3️⃣ | responde "vale manter o bot no pré-atendimento" com dado, não com intuição |
| **Devolutiva do professor pós-experimental**, automática | 3️⃣ | fecha o buraco da Parte 5, que é o mais barato de todos |

## O que este material NÃO sustenta

- ❌ Ranking de consultora. Nada aqui isola técnica de público.
- ❌ "O bot atrapalha." Não foi provado e a comparação é enviesada.
- ❌ "Perguntar mais converte mais." Medido, aponta o contrário.

---

# Como remedir tudo isto

```bash
# a régua do bumerangue (amostra pareada)
sudo -u mila /usr/bin/python3 ~/.openclaw/workspace/scripts/estudo-atendimento-pareado.py \
  --pares 120 --meses 6 --csv saida.csv

# quem fecha passou pelo WhatsApp
sudo -u mila /usr/bin/python3 ~/.openclaw/workspace/scripts/estudo-passagem-whatsapp.py \
  --meses 6 --csv saida.csv

# o bot ajuda ou atrapalha (cota igual por unidade)
sudo -u mila /usr/bin/python3 ~/.openclaw/workspace/scripts/estudo-mila-sdr.py \
  --meses 4 --max 900 --csv saida.csv
```

Planilhas em `.local/estudos/` — cada uma com uma cópia `SEM-PII` para uso
externo.

## Erros de método cometidos e corrigidos (para não repetir)

1. 🔴 **Corte alfabético** na amostra pareada: os 120 pares saíram de 2 unidades
   e o **Recreio sumiu**. Corrigido para rodízio entre estratos.
2. 🔴 **Teto global** no estudo do bot: 784 Barra, 116 Recreio, **zero Campo
   Grande** — eu ia comparar unidades com uma amostra sem uma delas. Corrigido
   para cota por caixa. **É o mesmo erro duas vezes**: sempre que houver limite
   sobre grupos, o limite tem de ser por grupo.
3. ⚠️ **Contaminação pós-venda**: medir a conversa inteira incluía confirmação,
   checklist e lembrete — mensagens sem pergunta que **só existem em quem
   comprou**. Corrigido cortando na data da matrícula.
4. ⚠️ **Diagnóstico errado antes de olhar a fonte**: chamei os "sem canal" de
   buraco de cadastro da equipe. Era o gatilho do sync. Ler a fonte antes de
   afirmar.

## O limite de tudo isto

**Todos os achados são correlação.** Conversa boa pode ser consequência de lead
bom. Sair da correlação exige experimento — e é por isso que a Parte 3 termina
propondo um, e não uma conclusão.
