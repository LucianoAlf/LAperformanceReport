-- CARGA DA BASE DE CONHECIMENTO COMERCIAL v1.0 — 11 blocos, PASSO 2.
--
-- ⚠️ ARQUIVO GERADO por `scripts/gerar-carga-base-comercial.mjs` a partir de
--    `docs/base-conhecimento-comercial/bloco-*.md`. Não editar o SQL à mão:
--    edite o markdown e gere de novo, senão a fonte e o banco divergem.
--
-- Conteúdo aprovado pelo Alf em 05/09/2026. Entram como **`candidato`**: a
-- Krissya é decisora "com Alf" e nada sai de candidato antes de ela ler
-- (passo 0 do plano de carga). `get_base_conhecimento` só devolve
-- `aprovado`, então **este INSERT não muda uma vírgula do que a Mila SDR
-- recebe hoje** — a prova está no bloco DO ao fim.
--
-- Idempotente por `titulo`: rodar de novo não duplica.

-- ── bloco-01-atendimento-bumerangue.md ──
insert into public.base_conhecimento_blocos
  (titulo, conteudo, unidade_id, ordem, ativo, publico, estado, versao)
select $bloco_md$Bloco 1 — Atendimento Bumerangue$bloco_md$, $bloco_md$**Escopo:** comercial · **Público:** consultor (Mila do consultor) e Mila SDR · **Status:** ✅ aprovado pelo Alf em 05/09/2026 · v0.2 (régua de preço + Como medir + Caso 3 reescrito) · v0.3 (+ *O Conselho*) · v0.4 (sinal medido corrigido pela pesquisa de 05/09)

---

## Quando usar
Em toda conversa ativa com lead — WhatsApp, Direct do Instagram, telefone e presencial (LA Tour, experimental, pitch). Do primeiro "olá" até a visita marcada.

**Sinal medido (para a Mila de gestão apontar):**
- Lead perguntou preço e a conversa morreu depois disso → o bumerangue não voltou. (Medido em 189 conversas pareadas: 0 de 5 que matricularam morreram após o preço, contra 7 de 21 que não matricularam — direção certa, base pequena.)
- Promessa de retorno ("vou verificar e te passo") sem resposta no prazo.
- ⚠️ **O que NÃO é sinal:** contar perguntas. Medido em 05/09, "2+ mensagens da escola sem pergunta" **inverte** (47% de quem fechou × 37% de quem não fechou), e quem não fechou recebeu *mais* perguntas (5,3 × 2,3) — é o laço de qualificação do bot insistindo com quem não engaja. O bumerangue é método de condução, não métrica de contagem. Não reconstruir esse alarme.
- Só 17% das conversas chegam a perguntar preço: o gargalo está antes do preço — na abertura (ver bloco 11).

## O princípio
**A pergunta fica sempre na mão do consultor.** O cliente pode perguntar à vontade; o consultor responde e devolve uma pergunta nova. Cada resposta do cliente vira gancho para a próxima pergunta, e cada pergunta avança um passo rumo à visita.

Por que isso importa na LA:
1. **Quem pergunta conduz.** Sem pergunta de retorno, o atendimento vira balcão de dúvidas e o cliente some.
2. **Não existe preço fixo pelo WhatsApp.** O preço depende da campanha do mês, do curso, do pacote e das condições — passar valor no zap é passar um número errado.
3. **WhatsApp é tela verde.** O cliente não vê a escola, o professor, a sala, os alunos. A conversa não vende a matrícula: ela vende a ida à escola. Quem vai, fecha; quem só pergunta, compara preço.
4. **Quem fala primeiro perde; quem pergunta melhor ganha; a melhor história vence** (Joel Jota, *O Conselho*). O bumerangue é a versão LA disso: mais perguntas que afirmações, porque é na resposta que aparece a dor real — e a dor é o que se resolve, não o preço.
5. **Consciência de graça, consequência paga.** O cliente só compra quando enxerga o problema (o filho sem rotina, o adulto que adiou o sonho 20 anos) e depois a solução. Ele compra por medo ou por ambição — a pergunta de motivação descobre qual. E cuidado: *todos os sentidos são percebidos* — consultor afobado pra fechar derruba a confiança que a conversa construiu.

## Como fazer
Responder curto + devolver uma pergunta que avance a etapa. A sequência é a do roteiro oficial da Mila SDR:

| etapa | o que descobrir | pergunta de retorno (exemplo) |
|---|---|---|
| 1 | nome | "Qual o seu nome?" |
| 2 | para quem é (idade → Kids ou School) | "Para quem seriam as aulas — criança, adolescente ou adulto?" |
| 3 | unidade | "Campo Grande, Recreio ou Barra — qual fica melhor pra você?" |
| 4 | motivação e interesse | "O que te motivou a procurar aula de música?" |
| 5 | rotina / disponibilidade | "Como funciona a semana de vocês? Manhã, tarde, noite ou sábado?" |
| 6 | visita / experimental | "Tenho [dia] e [dia] essa semana — qual fica melhor?" |

Regras de forma:
- **Uma pergunta por mensagem.** Duas perguntas juntas = o cliente responde uma e some.
- **Acolhe antes de perguntar.** A resposta do cliente merece uma frase de conexão ("nossa, entendi") e um diferencial ligado ao que ele disse, só então a pergunta.
- **Pergunta aberta no começo, pergunta de escolha no fim.** "O que te motivou?" abre; "manhã ou noite?" fecha.
- **Presencial também é bumerangue.** No LA Tour e na devolutiva da experimental, a pergunta é sobre o sonho ou a dor que trouxe a pessoa até ali.

Quando o cliente pergunta preço — **régua aprovada em 05/09/2026:**
1. **Lead novo pede preço** → bumerangue. Acolhe e devolve: *"Antes de valores, preciso entender melhor o perfil de vocês. A experiência é gratuita e é a melhor forma de conhecer tudo antes de decidir. É para criança ou adulto?"* (Mila SDR e consultor.)
2. **Insistiu de novo** → a Mila SDR passa pro consultor humano; o consultor passa o **valor promocional da campanha do mês** e diz que na escola existe condição de fechamento na hora. ⚠️ *Como os consultores passam o valor hoje — a raspagem do Devin vai mostrar e a gente ajusta o texto.*
3. **Lead que já fez experimental/visita, ou mora longe** → passa o preço direto, sem exigir nova visita. Distância não é objeção, é logística: resolve com horário que compense a viagem e os dois alunos no mesmo dia.
4. **Nunca silêncio.** Se prometeu verificar, diz *quando* volta — e volta. Quem cobra retorno já está com um pé fora.

## O que NÃO fazer
- Responder sem pergunta de retorno (mensagem que termina em ponto final).
- Mandar tabela, valor ou "a partir de R$" pelo WhatsApp ou Direct.
- Interrogatório: pergunta atrás de pergunta sem acolher a resposta anterior.
- Pergunta fechada de sim/não para agendar ("quer marcar?"). Sempre entre duas opções de dia/horário.
- Tentar fechar matrícula pelo WhatsApp. O objetivo da conversa é a visita.
- Inventar diferencial que a LA não tem. Os diferenciais válidos estão no Ecossistema de Vendas (metodologia própria, professores treinados, estrutura, CAEM, parcerias, eventos).

## Exemplo de mensagem
Cliente: *"Oi, quero saber sobre aula de música pro meu filho, foi indicação da terapeuta."*
Consultor: *"Que legal! A gente recebe muitas famílias por indicação terapêutica — nossos professores são treinados pra trabalhar com crianças neurodivergentes, e a aula é adaptada ao ritmo dele. Quantos anos ele tem?"*
Cliente: *"7."*
Consultor: *"Ótima idade pra começar 🎶 Como é a rotina de vocês na semana? Assim eu já vejo um horário pra vocês virem conhecer a escola e ele fazer uma aula experimental."*

## Exemplo real — Caso 3 (Jullyane, Santa Cruz) reescrito
O que aconteceu: pediu preço 2x, disse que já fez experimental e que não queria "viagem perdida"; recebeu roteiro genérico e 24h de silêncio; quando cobrou, entregou a venda pronta (ela teclado, namorado bateria) e ninguém agarrou.

Como deveria ter sido, em 3 mensagens:
1. *(Mila SDR, ao ouvir "somos de Santa Cruz, não queremos viagem perdida")* — *"Entendo, Jullyane, de Santa Cruz é uma viagem mesmo. Vou passar você agora pra Vitória, da unidade, que te fala os valores hoje e já vê horário pra vocês dois no mesmo dia. Vocês querem teclado e bateria, né?"*
2. *(Vitória, no mesmo dia)* — *"Oi Jullyane, sou a Vitória! A Mila me contou que vocês já fizeram a experimental aqui. Então vou direto ao ponto: [valor promocional do mês], em 12 parcelas, com o passaporte [condição]. Se fecharem na visita, tem condição especial na hora. Qual dia da semana vocês conseguem vir juntos?"*
3. *(se precisasse confirmar algo)* — *"Vou confirmar com a coordenação se dá pra repetir a experimental de vocês e te respondo até as 20h de hoje."* — e responder até as 20h.

## Como medir
- **Leads que pediram preço e sumiram** / leads que pediram preço (meta: cair mês a mês). Base pequena hoje — acumular.
- **Promessas de retorno cumpridas no prazo** (meta: 100%) — o "vou verificar e te passo" vira pendência com hora.
- **Agendamento por conversa atendida por humano** — o bumerangue existe pra levar à visita; é isso que ele tem que mover.
- ❌ Não medir por contagem de perguntas (inverte — ver Sinal medido).
- Comparador: mês anterior, mesma unidade.

## Fonte
- Metodologia própria do Alf, ditada em 05/09/2026 (bumerangue = a pergunta volta para o consultor).
- *Ecossistema de Vendas do Grupo LA — Playbook* (Mentoria Maestros da Gestão): jornada em 5 etapas, scripts de ligação e etapa 05 (pitch de fechamento).
- *Atendimento da Mila — Grupo LA Oficial 2025*: roteiro oficial de 12 passos e regra "não passamos valores no atendimento inicial".
- Referência externa (só para dar nome ao princípio, não é fonte de regra): "quem faz as perguntas direciona a conversa" — Jeffrey Gitomer, citado por Leandro Branquinho; sequência de perguntas em vendas consultivas — *SPIN Selling*, Neil Rackham.

**Escrito por:** Alf + Claude · **Data:** 05/09/2026 · **Aprovado por:** Alf, 05/09/2026 (v0.1 e régua de preço v0.2)
$bloco_md$, null, 100, true, 'comercial', 'candidato', '0.4'
where not exists (
  select 1 from public.base_conhecimento_blocos where titulo = $bloco_md$Bloco 1 — Atendimento Bumerangue$bloco_md$
);

-- ── bloco-02-indicacao-la-talent.md ──
insert into public.base_conhecimento_blocos
  (titulo, conteudo, unidade_id, ordem, ativo, publico, estado, versao)
select $bloco_md$Bloco 2 — Indicação: de campanha a programa$bloco_md$, $bloco_md$**LA Talent + o pedido na hora da matrícula + Método VPI (Rodrigo Noll)**
**Escopo:** comercial · **Público:** Krissya (dona do programa) e consultor (método) · **Estado:** candidato **v0.2** (05/09/2026 — absorve *Criando Clientes Vendedores*) · **Decisor:** Krissya, com Alf

---

## Quando usar
**Consultor:** na hora em que a matrícula fecha (passaporte pago) — o "primeiro sim". Momentos secundários: feedback da 4ª aula (onboarding do Playbook), marco batido na Jornada do Aluno, NPS 9–10 (Lia), recital/Julina, renovação — e **lead que não fechou** (ver abaixo).
**Krissya:** planejamento do mês; leitura mensal das 3 taxas; aceleradores sazonais.

**Sinal medido:** % de matrículas novas com `indicado_por` preenchido — hoje **0 de 80** em 180 dias. Show-up de indicados **77%** contra **~10%** do Instagram. Indicação já é o canal que mais leva gente pra dentro da escola — sem ninguém pedir.

## O princípio
Indicação é canal, não campanha. Boca a boca é sorte; campanha de indicação é pico que acaba; **programa** roda o ano inteiro, tem regra pública, recompensa validada com quem indica e métrica mensal (Noll). Hoje a LA recebe indicação de forma passiva. O LA Talent dá o "porquê"; o que falta é o "quando pedir", o "como registrar" e o "como manter vivo".

Duas convergências que valem ouro:
- **Flávio Augusto** e **Noll** apontam o mesmo momento: pede-se **na hora da compra**, o pico de confiança — não no fim do curso, não com "se lembrar de alguém, me avisa".
- **Noll:** a recompensa é só 5–10% do resultado; **90% é disciplina de ativação** — lembrar a base, com frequência, no contexto certo. É exatamente o trabalho que a Mila pode fazer sozinha.

## O que é o LA Talent hoje (regra da LA — desenhado, ainda NÃO em vigor)
5 passos; os 4 primeiros valem 5% de desconto cada, o 5º é condição: 1) Avaliação musical · 2) Compromisso com a jornada · 3) Influencer LA · 4) **Indique 5 amigos → 5% + cashback R$ 50 por amigo matriculado** · 5) Adimplência até o dia 5.

## Como fazer

### A) Consultor — o pedido na hora da matrícula (Flávio Augusto + Noll, adaptado à LA)
1. **Momento:** passaporte pago, antes do checklist de dados.
2. **Contexto:** *"Salomé, quem te falou da LA foi a [fulana], né? A maioria das nossas famílias chega assim — a gente prefere cuidar bem de quem já está aqui do que gastar em anúncio. Enquanto preparo o cadastro da Leticia, quero te dar a chance de fazer o mesmo por 5 amigos, e ganhar com isso."*
3. **Ação imediata:** *"Pega o celular e abre os contatos…"* — ajuda a lembrar: mães da escola, colegas do futebol, vizinhos, primos.
4. **Mensagem de validação sai do celular DELA, na hora:** *"Gente, acabei de matricular a Leticia na LA Music 🎶 A [consultora] vai te chamar pra contar como funciona, porque acho que tem a ver com vocês. Se não fizer sentido, é só avisar que ela tira da lista."*
5. **Registro na hora:** 5 nomes/telefones no CRM com `indicado_por = Salomé`.
6. **Objeção "não quero ser chata com meus amigos":** *"Entendo. Mas se alguém tivesse te contado da LA um ano antes, teria te poupado tempo procurando, né? Você não está vendendo nada — está presenteando um amigo com uma condição que ele não teria sozinho. E se ele disser que não é o momento, a gente respeita e para."*

### B) Consultor — o acolhimento do indicado (Noll: fluxo de conversão)
- **Velocidade:** contato em até **15 minutos**, no máximo 2 horas. Indicado esperando 24h esfria e envergonha quem indicou. ⚠️ *Hoje o alerta de lead esperando dispara em 2h+ para todos — indicado precisa de SLA próprio.*
- **Script:** *"Oi Renata, aqui é a Kailane, da LA Barra. A Salomé me pediu pra te atender com atenção especial — ela me falou de você com muito carinho. Por ser indicação dela, você tem [condição do indicado]. Tenho sábado 10h ou terça 18h pra vocês virem fazer uma Experiência com a [filha]. Qual encaixa?"*
- Nunca *"me passaram seu contato"*. Sempre *"a Salomé me pediu"*.

### C) Consultor — o lead que NÃO fechou também indica (Noll)
Quem passou pela Experiência e não matriculou confia na escola; só não é o momento. Junto da retomada (bloco 5): *"Entendo que agora não dá. Mas você viu como a gente trabalha — tem algum amigo que está procurando música pro filho? Se ele matricular, o [recompensa] é seu, mesmo você não tendo fechado agora."*

### D) Mila — transparência radical (automática)
Três avisos pra quem indicou, sem a consultora precisar lembrar:
1. **Entrada:** *"Salomé, a Renata que você indicou já está sendo atendida pela Kailane 🎶"*
2. **Marco:** *"A Renata veio com a filha fazer a Experiência hoje — e adorou!"*
3. **Vitória:** *"A Renata matriculou! Seu [recompensa] está liberado — a Kailane te passa os detalhes. Obrigada por crescer com a gente."*
Quem indica coloca a própria reputação na mesa; se o amigo for esquecido, ela nunca mais indica.

### E) Krissya — do LA Talent ao programa (30 dias)
1. **Campo `indicado_por` no lead** + pergunta obrigatória no cadastro: "Como conheceu? Quem indicou?" — sem isso nada é pagável.
2. **Pesquisa qualitativa por telefone** — Alf ou Krissya (não terceiriza) liga pra 10–12 famílias mais satisfeitas e pergunta o que gostariam de ganhar. Quem responde "desconto" ou "não precisa de nada" está economizando energia: pergunta de novo, além do dinheiro.
3. **Ajuste interno** da lista com a equipe.
4. **Pesquisa quantitativa** por WhatsApp pra toda a base ativa (1 escolha se ≤5 opções).
5. **Conferir o custo:** o que baliza é o custo real de entrega da recompensa (não o preço de tabela) contra o CAC do Instagram.
6. **Mecânica:** gatilho = **matrícula** (venda), como já é; formato = **escada**, com a recompensa mais votada no **degrau 3** (nem no 1º, que satisfaz e para; nem no topo, que desanima).
7. **Duplo-ganha:** o indicado também ganha (condição no LA Pass / Experiência prioritária).
8. **Regulamento simples e público** (1 página).
9. **Lançamento em 3 tempos:** D-3 aquece a base; D dispara em tudo (WhatsApp, grupos de turma, recepção, app Emusys, recital); D+1 a D+7 consultoras colhem as primeiras indicações em lote.
10. **Multicanal permanente:** rodapé do boleto/Asaas, QR na recepção, grupos das turmas, fala do consultor. "E", não "ou".

### F) Aceleradores sazonais (o que hoje chamamos de campanha)
O sorteio "traga um amiguinho" da Semana das Crianças, o dobro de cashback na Black Friday, o ranking de famílias no fim do semestre — são **aceleradores em cima do programa**, não o programa. Entram no cardápio do bloco 6.

## Como a Mila traz pra Krissya
*"Krissya, 80 matrículas em 6 meses vieram por indicação e nenhuma registra quem indicou — uns R$ 4 mil de cashback sem rastro. O LA Talent está desenhado, mas é campanha, não programa. Quer que eu monte os 30 dias: campo no CRM, as 12 ligações da pesquisa e o piloto do pedido na hora da matrícula em uma unidade?"*

## 💬 Pra discutir — Alf, acho que funcionaria assim, o que tu acha?
1. **Recompensa pesquisada, não decidida.** Os R$ 50 e os 5% saíram da diretoria. Noll é taxativo: pergunta pra quem indica. 12 ligações suas ou da Krissya resolvem.
2. **Escada em vez de linear.** Ex. de estrutura (os prêmios vêm da pesquisa): 1ª matrícula indicada → brinde LA de pertencimento (camiseta/boné) · 2ª → R$ 50 ou voucher · **3ª → o prêmio mais votado** · 5ª → 1 parcela isenta ou LA Pass do próximo módulo.
3. **Duplo-ganha.** Indicado ganha condição no LA Pass. Empodera quem indica: ela presenteia, não vende.
4. **Nome funcional.** "LA Talent" junta 5 coisas e não diz "indicação". Noll: nome que explica ("Indique e Ganhe LA", "Amigo LA"). LA Talent pode ficar como programa de compromisso; a indicação ganha nome próprio.
5. **Programa 365 dias**, com Semana das Crianças e Black Friday como aceleradores — não campanha que nasce e morre.
6. **20% permanente pesa** (mantido da v0.1): desconto por semestre revalidado, e o passo Influencer vira benefício não monetário.
7. **Indicado tem SLA de 15 min**, separado do alerta geral de 2h.

## Como medir (as 3 taxas de Noll + as nossas)
| taxa | fórmula | benchmark (Noll) | hoje na LA |
|---|---|---|---|
| **Adesão** | famílias que indicaram ≥1 / famílias ativas | 15–30% ao ano | não medível (sem `indicado_por`) |
| **Engajamento** | indicações / famílias que indicaram | 2,5–5 por indicador | não medível |
| **Conversão** | matrículas via indicação / indicações | 25–50% | 80/209 = **38%** ✅ |
Mais: % de matrículas novas com indicador registrado (meta piloto >50%); tempo até o 1º contato com o indicado (meta 15 min); cashback pago = auditado (100%); funil do indicado lado a lado com Instagram; comparador = unidades sem piloto no mesmo mês; rótulo observado / atribuído / incremental.

**Conta de padeiro (benchmark, NÃO previsão):** 1.200 famílias × 20% adesão × 3 indicações × 38% conversão ≈ 270 matrículas/ano só de indicação — hoje são ~160/ano sem programa nenhum. É hipótese pra testar, não meta.

## O que NÃO fazer
- Pedir com "se lembrar de alguém, me avisa" ou só no fim do curso.
- Decidir a recompensa na diretoria sem perguntar a quem indica.
- Deixar o indicado esperar mais de 2h.
- Prometer cashback antes de o programa estar em vigor; registrar indicador por palpite.
- Disparo frio em massa sem a mensagem de validação do próprio aluno.
- Abrir mensagem com "indique e ganhe R$ 50" — sempre ponte com o que a família está vivendo (marco, elogio, recital).
- Desmontar o programa em 30 dias: indicação matura no ritmo do ciclo (aqui, semanas).
- Consultor negociar desconto fora da mecânica do programa.

## Fonte
- Infográfico *LA Talent* (Alf) · *Ecossistema de Vendas — Playbook* (script de ligação pra lead indicado; "campanha de indicação pronta que a equipe não usa").
- Medição no banco (handoff 05/09/2026): 209 leads por indicação/180 dias, 80 matrículas, 0 com indicador; show-up 77,4% × 9,6%.
- Exame, *"Venda ativa x sofrer vendas"*, 17/01/2026 — script de Flávio Augusto (5 passos), adaptado.
- **Rodrigo Noll, *Criando Clientes Vendedores* (Editora Gente, 2023)** e dois podcasts do autor — Método VPI: recompensa certa (pesquisa qualitativa + quantitativa + custo × CAC), mecânica clara (gatilho, escada, duplo-ganha, transparência), lançamento e ativação (3 fluxos, multicanal, 3 taxas). Síntese própria; nenhum trecho reproduzido.
- Gershon, Cryder & John, *JMR* 2019 — recompensa ao indicado × indicador (só resumo).

**Escrito por:** Alf + Claude · **v0.1** 05/09/2026 · **v0.2** 05/09/2026 (Noll) · **Estado:** candidato · **Decisor:** Krissya com Alf
$bloco_md$, null, 110, true, 'comercial', 'candidato', '0.2'
where not exists (
  select 1 from public.base_conhecimento_blocos where titulo = $bloco_md$Bloco 2 — Indicação: de campanha a programa$bloco_md$
);

-- ── bloco-03-experiencia-antes-durante-depois.md ──
insert into public.base_conhecimento_blocos
  (titulo, conteudo, unidade_id, ordem, ativo, publico, estado, versao)
select $bloco_md$Bloco 3 — A Experiência: antes, durante e depois da experimental$bloco_md$, $bloco_md$**Escopo:** comercial · **Público:** consultor (dono do fluxo) e professor (dono da aula) · **Estado:** candidato v0.1 · **Decisor:** Krissya, com Alf · v0.2 (+ podcasts de vendas)

---

## Quando usar
Da experimental marcada até a matrícula ou a perda. Três momentos: **antes** (confirmar e preparar), **durante** (Tour + aula + pitch, tudo no mesmo dia) e **depois** (devolutiva escrita em até 24h + retomada).

**Sinal medido:**
- Show-up (canônico: experimentais + visitas) por canal — indicados 77%, Instagram ~10%.
- Conversão experimental → matrícula: em 4.247 leads, quem faz a experimental fecha **40–50%**. Quem não faz, quase não fecha. A experimental é o produto.
- Conversão por professor — existe (`lead_experimentais`), mas só vale com denominador honesto: quantas experimentais ele pegou "porque não tinha outro horário".
- ⚠️ Devolutiva enviada em <24h — **hoje não registrado**. Pra medir, precisa de um evento no LA Report.

## O princípio
O WhatsApp é tela verde; a escola vende na escola. A experimental é o dia em que a família vê o professor, a sala e a criança tocando — e é o único dia em que o preço faz sentido. Tudo antes prepara esse dia; tudo depois protege o que ele produziu.

## Como fazer

### ANTES (consultor)
1. Confirmação na véspera e 2h antes (já automático). **Junto, mandar endereço, nome do professor e o que levar.** A família do Caso 1 errou o condomínio por falta disso.
2. **Brief pro professor** antes da aula: idade, instrumento, o que motivou a busca, experiência prévia, quem indicou. O professor recebe o aluno pelo nome e já sabe o que a família espera.
3. Se a experimental é de um lead de tráfego pago, vale o extra: professor grava 15s chamando o aluno pelo nome ("te espero sábado!"). Quem recebe vídeo, aparece.

### DURANTE — LA Tour (consultor, ~10 min)
1. Recebe de pé, pelo nome, oferece água/banheiro.
2. Trajeto pelo perfil do cliente (Kids: sala de musicalização; adulto: estúdio).
3. Bumerangue presencial: *"O que fez vocês procurarem música agora?"* — a resposta guia o Tour.
4. Duas paradas obrigatórias: **placa do CAEM** (somos afiliados à instituição que chancela as melhores escolas do Brasil) e um **símbolo da cultura** (mural de valores, foto de recital) pra falar de propósito.
5. Entrega o aluno ao professor com o brief já dado.

### DURANTE — a aula (professor, script do Playbook)
1. Recepção: chama aluno e responsável pelo primeiro nome; explica em 1 minuto o que vai acontecer.
2. Aquecimento e apresentação do instrumento.
3. Conexão: atividades que criam vínculo; se o responsável está na sala, convida a participar.
4. Encerramento: elogio genuíno e específico; **grava vídeo curto** do aluno tocando.
5. **Devolutiva ao vivo ao responsável**, em 2 minutos: o que viu de ponto forte, onde indica começar (instrumento/curso) e **qual turma** já cabe pra ele. O professor aponta a turma; o consultor fecha.

### DURANTE — o pitch (consultor, no mesmo dia, na escola)
Ordem do Playbook, etapa 05:
1. **Feedback positivo** — repete os pontos fortes que o professor disse. Colhe o feedback do professor ANTES de sentar com a família.
2. **Metodologia e diferenciais** — propósito, professores treinados, jornada do aluno.
3. **Estrutura** — 40 aulas em 12 parcelas (feriados e recessos não descontam), LA Pass e o que ele dá (eventos, 4 aulas extras, Free Study Room, parceiros).
4. **Investimento** — passa o valor cheio e, na sequência, o **valor promocional de fechamento na hora** (campanha do mês). Explica a diferença entre LA Pass e taxa de matrícula antes de a família perguntar.
5. **Negociação** — primeiro dias/horários, depois forma de pagamento. Se falar em preço: descontos por indicação (LA Talent) e por forma de pagamento. Nunca desconto sem contrapartida.

**Duas regras do pitch que vieram dos podcasts de vendas:**
- **Quando a família já decidiu, para de vender.** Sobre-vender é o maior erro (Thiago Nigro, *O Conselho*): o cliente entra decidido, o vendedor continua argumentando e o cliente vai embora. Sinal de compra ("vou fazer com vocês", "posso pagar sexta?") = ir direto pro fechamento.
- **Não pular etapa mesmo com pressa** (Dani Martins). Se a família tem 10 minutos, os 5 passos acontecem em 10 minutos — feedback, metodologia, estrutura, investimento, negociação. Pular do feedback pro preço é o que gera "vou pensar".

**Se a família diz "vou pensar / falar com meu marido / ver em casa":**
- É normal e o Alf confirma: o cliente leva a proposta pra casa. Não briga.
- Bumerangue: *"Claro. Pra vocês decidirem tranquilos, o que precisa estar resolvido — horário, valor ou os dois?"* — a resposta é a objeção real.
- Condição com prazo: *"O valor de fechamento vale até [data]. Se fizer sentido até lá, eu garanto a vaga da turma de [dia/hora]."* ⚠️ *Até quando vale o valor de fechamento — 48h? fim da semana? Pendente do Alf/Krissya.*
- Combina a retomada com dia e hora: *"Posso te chamar quinta às 19h?"* → entra na `lead_retomada` com a frase original.

**Se pede prazo de pagamento** (Caso 1 real, Kailane): não é sim nem não — **condição + meio-termo**: *"Hoje precisa ser pago o passaporte, ou pelo menos uma parte, pra condição valer."* Fechou em 35 minutos.

### DEPOIS (consultor, até 24h — obrigatório)
1. **Devolutiva escrita do professor**, mesmo que a família não peça (texto padrão abaixo). No Caso 4 a mãe pediu, esperou 2 dias e não recebeu — e ainda perguntou *"quero ouvir um especialista"*: é o momento mais fácil de fechar do funil.
2. Dúvida pedagógica da família (*"violão ou teclado primeiro?"*) → responde no mesmo dia **com a palavra do professor**, não com opinião do consultor.
3. Se matriculou: **lembrete da 1ª aula na véspera, com endereço e nome do professor.**
4. Se não matriculou: registra motivo e data de retomada.

## Texto padrão — devolutiva pós-experimental (não existia)
> Oi [responsável]! Passando a devolutiva do professor [nome] sobre a experiência da [aluna] hoje 🎶
>
> ✅ **O que ele viu:** [ponto forte 1 — ex.: senso rítmico bom pra idade] e [ponto forte 2 — ex.: concentração do começo ao fim].
> 🎯 **Onde ele indica começar:** [curso/instrumento], porque [motivo em 1 linha — ex.: a coordenação dela já pede o instrumento, não a musicalização].
> 👥 **Turma que já cabe:** [dia e hora], com crianças de [faixa].
>
> A condição de hoje vale até [data]. Ficou alguma dúvida do que vocês viram?

Termina em pergunta. Sai da consultora, com o conteúdo do professor. ⚠️ *Quem escreve — a consultora a partir do que o professor disse, ou o próprio professor manda pra consultora? Pendente.*

## O que NÃO fazer
- Deixar a devolutiva depender de a família pedir.
- Responder dúvida pedagógica com achismo do consultor — a autoridade é o professor.
- Passar preço antes do feedback e da metodologia (inverte a ordem do pitch).
- Reagir a "vou pensar" com *"tá bom, qualquer coisa me chama"* — sem pergunta, sem prazo, sem data de retomada.
- Condição comercial em áudio. Áudio não fica registrado nem pesquisável (Caso 1).
- Lembrete de 1ª aula sem endereço.
- Ranquear professor por conversão sem o denominador de "não tinha outro horário".

## Exemplo real — Caso 4 (Renata, Barra) como deveria ter sido
Mãe, 22h33 do dia da aula: *"Gostaria da avaliação do professor. Meu marido diz que ela deveria aprender violão primeiro, mas quero ouvir um especialista."*
Consultora, até 9h do dia seguinte: *"Bom dia, Renata! Falei com o professor [nome] agora. Ele viu na Olivia [ponto forte] e a indicação dele é começar em [instrumento] porque [motivo]. Sobre o violão: [posição do professor em 1 linha]. A turma de [dia/hora] tem vaga — quer que eu segure até quinta pra vocês conversarem em casa?"*

## Como medir
- Show-up por canal e unidade (canônico).
- Conversão experimental → matrícula, por unidade e por professor com denominador honesto.
- **% de devolutivas enviadas em <24h** (meta 100%) — precisa do evento no LA Report.
- **Tempo experimental → matrícula** (Caso 1: 3 dias).
- Retomadas combinadas no pitch que viraram matrícula, na janela.
- Comparador: mês anterior, mesma unidade. Rótulo: observado / atribuído / incremental.

## Fonte
- *Ecossistema de Vendas do Grupo LA — Playbook*: etapas 03 (LA Tour), 04 (Aula Experimental, script do professor), 05 (Pitch de Fechamento), LA Pass, Pacote de 40 aulas, Onboarding.
- Alf, 05/09/2026: valor promocional de fechamento na hora; "vou pensar" = cliente leva a proposta pra casa.
- Conversas reais do Chatwoot (05/09/2026): Caso 1 (condição + meio-termo; lembrete da 1ª aula; condomínio errado) e Caso 4 (devolutiva não enviada; pedido de autoridade sem resposta).
- Medição no banco (checkpoint 05/09/2026): conversão 40–50% em 4.247 leads; show-up por canal.
- Emusys blog, mai/2026: professor gravar vídeo curto chamando o aluno pelo nome antes da aula (referência externa, pra testar).

**Escrito por:** Alf + Claude · **Data:** 05/09/2026 · **Estado:** candidato · **Decisor:** Krissya com Alf
$bloco_md$, null, 120, true, 'comercial', 'candidato', '0.2'
where not exists (
  select 1 from public.base_conhecimento_blocos where titulo = $bloco_md$Bloco 3 — A Experiência: antes, durante e depois da experimental$bloco_md$
);

-- ── bloco-04-objecoes.md ──
insert into public.base_conhecimento_blocos
  (titulo, conteudo, unidade_id, ordem, ativo, publico, estado, versao)
select $bloco_md$Bloco 4 — Objeções: responder e devolver a pergunta$bloco_md$, $bloco_md$**Escopo:** comercial · **Público:** consultor (Mila do consultor) e Mila SDR · **Estado:** candidato v0.1 · **Decisor:** Krissya, com Alf · v0.2 (+ *O Conselho*)

---

## Quando usar
Toda vez que o lead trava — no WhatsApp, no pitch ou depois dele. As cinco objeções que o motor de perda (`classificar-desinteresse`) já extrai da conversa: **preço, horário, distância, concorrente, "só pesquisando"** — mais as cinco que aparecem no pitch e nos casos reais: **prazo de pagamento, "vou pensar", "por que 12 parcelas?", "o que é o passaporte?", "e se ele não gostar?"**

**Sinal medido:** distribuição de motivos de perda por unidade e mês (já em produção). Quando um motivo dispara numa unidade, é onde focar.

## O princípio
Objeção não é "não" — é pedido de informação com um medo por baixo. A resposta tem três partes, sempre: **acolhe → responde curto e verdadeiro → devolve uma pergunta** (bumerangue). E uma regra que não quebra: **nunca desconto sem contrapartida** (indicação, forma de pagamento, fechamento na hora).

Mais duas, de *O Conselho*: **a objeção se responde com as razões do cliente, não com as do consultor** — não importa por que *você* acha que ele deveria matricular; importa o que ele disse que procura. E **objeção que não é objeção**: se o lead não é perfil (não tem como pagar, não tem como vir), insistir é vender Ferrari pra estudante — qualifica e registra a retomada, não gasta a semana nele.

## Como fazer — as 10 objeções

| objeção | o que está por baixo | resposta + pergunta de retorno |
|---|---|---|
| **"Quanto custa?"** (antes da visita) | quer comparar sem se deslocar | Régua do bloco 1: lead novo → convite; insistiu → valor promocional da campanha; já fez experimental ou mora longe → preço direto. *"…qual dia vocês conseguem vir juntos?"* |
| **"Tá caro"** (no pitch) | comparação com outra escola ou com o orçamento | Não baixa o preço: mostra o que está dentro (40 aulas garantidas, LA Pass, eventos, aulas extras). Depois: *"O que pesa mais — o valor da parcela ou a forma de pagamento?"* A resposta abre a contrapartida certa: indicação (LA Talent) ou forma de pagamento. |
| **"Posso pagar na sexta / mês que vem?"** | quer fechar, mas o caixa não fecha hoje | Condição + meio-termo (Caso 1): *"Hoje precisa ser pago o passaporte, ou pelo menos uma parte, pra condição valer. Consegue uma parte hoje e o resto na sexta?"* |
| **"Não tenho horário"** | rotina cheia; na Kids, a agenda da criança | Oferece dois horários reais, nunca "temos vários": *"Tenho terça 18h e sábado 10h — qual encaixa melhor na semana de vocês?"* Se nenhum: registra e entra na retomada quando abrir turma. |
| **"É longe"** | medo de viagem perdida (Caso 3) | Distância é logística, não objeção: *"Entendo. Se eu conseguir os dois no mesmo dia e horário, compensa a viagem? Vou te passar os valores agora pra vocês virem decididos."* |
| **"Vou pensar / falar com meu marido"** | precisa de outra pessoa ou de tempo; às vezes esconde preço | Normal — leva a proposta. *"Pra vocês decidirem tranquilos, o que precisa estar resolvido: horário, valor ou os dois?"* + condição com prazo + dia e hora da retomada. |
| **"Só estou pesquisando"** | baixa intenção agora, não nunca | Não insiste. Uma pergunta e a porta aberta: *"Perfeito. O que te fez pesquisar agora?"* Se responder, tem gancho; se não, registra data de retomada (janeiro, volta às aulas). |
| **"Na escola X é mais barato"** | preço como único critério | Não fala mal de ninguém. Pergunta o que compara: *"Lá são quantas aulas garantidas? Tem reposição? Eventos?"* Depois traz a experimental: *"Traz ele pra uma aula aqui e compara."* |
| **"40 aulas dá 10 meses, por que 12 parcelas?"** | acha que está pagando 2 meses a mais | Script do Playbook: 40 aulas com feriados e recessos duram em média 12 meses — por isso não é mensalidade, é pacote parcelado em 12; nenhuma aula é descontada por feriado. *"Faz sentido? Ele viria em que dia da semana?"* |
| **"O que é esse passaporte? É taxa de matrícula?"** | associa a taxa que não volta | Explica antes de perguntarem: pago uma vez, vale enquanto estiver matriculado, dá eventos, 4 aulas extras por módulo, Free Study Room, descontos em parceiros — e paga a experimental que ele já fez. *"Quer que eu mostre o que vem no LA Pass desse semestre?"* |
| **"E se ele não gostar / quiser parar?"** | medo de contrato que prende | Verdade curta: não tem multa de rescisão, tem aviso prévio (parcela do mês + a seguinte), pedido por escrito. *"Nos primeiros 30 dias eu mesma te chamo pra saber como está indo — pode ser?"* |

## O que NÃO fazer
- Desconto sem contrapartida, ou desconto por WhatsApp.
- Urgência inventada ("última vaga", "só hoje"). Urgência só com fato: vaga real da turma X, condição da campanha até a data Y.
- Falar mal de concorrente.
- Responder objeção com texto longo. Uma objeção, uma resposta, uma pergunta.
- Argumento genérico pra objeção específica (*"muitas pessoas de bairros distantes também procuram a LA"* — Caso 3).
- Tratar "vou pensar" como perda ou como vitória: é retomada com data.
- Esconder o aviso prévio. A família descobre depois e vira reclamação.

## Exemplo de mensagem
Cliente: *"Achei caro, na escola perto de casa é 30 reais menos."*
Consultor: *"Entendo, 30 reais por mês faz diferença. Deixa eu te perguntar uma coisa: lá são 40 aulas garantidas com reposição de feriado? Porque aqui, se cair feriado, a aula não conta — e o LA Pass dá 4 aulas extras por módulo e os eventos. Se a Leticia fizer uma aula aqui e vocês compararem, eu segura a turma de terça pra vocês até quinta. Fechado?"*

## Como medir
- Motivos de perda por unidade e mês (canônico) — meta: preço e horário caindo como % das perdas.
- Conversão pós-objeção: leads com objeção registrada que fecharam / leads com objeção.
- Concessões dadas × contrapartida registrada (meta: 100% com contrapartida).
- Comparador: mês anterior, mesma unidade.

## Fonte
- *Ecossistema de Vendas do Grupo LA — Playbook*: resposta a objeções (ligação pró-ativa), etapa 05 (negociação: desconto só por indicação e forma de pagamento), Pacote de 40 aulas ("por que 12 parcelas"), LA Pass, Cancelamento de contrato.
- Motor `classificar-desinteresse` (em produção): motivos preço, horário, distância, concorrente, "só pesquisando".
- Conversas reais (05/09/2026): Caso 1 (prazo → condição + meio-termo), Caso 3 (distância → logística), Caso 4 (dúvida pedagógica → autoridade do professor).
- Alf, 05/09/2026: bumerangue; "vou pensar" = leva a proposta pra casa; valor de fechamento na hora.

**Escrito por:** Alf + Claude · **Data:** 05/09/2026 · **Estado:** candidato · **Decisor:** Krissya com Alf
$bloco_md$, null, 130, true, 'comercial', 'candidato', '0.2'
where not exists (
  select 1 from public.base_conhecimento_blocos where titulo = $bloco_md$Bloco 4 — Objeções: responder e devolver a pergunta$bloco_md$
);

-- ── bloco-05-retomada-com-data.md ──
insert into public.base_conhecimento_blocos
  (titulo, conteudo, unidade_id, ordem, ativo, publico, estado, versao)
select $bloco_md$Bloco 5 — Retomada com data: o "lembrei de você" do lead$bloco_md$, $bloco_md$**Escopo:** comercial · **Público:** consultor (Mila do consultor) · **Estado:** candidato v0.1 · **Decisor:** Krissya, com Alf
**Irmão técnico:** `lead_retomada` (agenda de retomada, em construção)

---

## Quando usar
Lead **quente** que não fechou e disse quando voltar: *"só em janeiro"*, *"depois das férias"*, *"quando o filho sair da prova"*, *"quando eu me organizar"*. E o segundo caso, que ninguém lembra sozinho: lead perdido por **preço** ou **horário** quando chega um gatilho — campanha do mês, volta às aulas, Semana das Crianças, Black Friday, turma nova no horário que ele pediu.

Não confundir com a régua automática de follow-up (5 estágios, dias 1 a 14, já roda e classifica o motivo no fim). A régua é curta e automática; a retomada é longa e humana, com data.

**Sinal medido:** retomadas vencendo hoje (`lead_retomada`); leads perdidos por preço/horário nos últimos 6 meses por unidade (público do gatilho).

## O princípio
Consultor atende muita gente e o que fica pra trás, fica. A Mila guarda o que ele não consegue guardar: **a frase original, a data e o motivo**. E o lembrete só funciona com a frase — sem ela a consultora não lembra do caso e ignora. Alf: *"lembrete sem a frase é ruído"*.

## Como fazer

### Mila — no fim da conversa que não fechou
1. Extrai três coisas: **frase original** do lead, **data ou janela** de volta, **motivo**.
2. Marca a precisão: data explícita (*"dia 15"*) · mês (*"em setembro"* = janela do mês inteiro) · vaga (*"quando me organizar"* = sem data; a consultora pergunta na hora: *"me chama em que mês?"*).
3. Fala do lead ≠ fato ≠ inferência. *"Disse que volta em janeiro"* é frase registrada. *"Vai matricular em janeiro"* é chute — não entra.

### Mila — no dia
1. Antes de lembrar, confere o estado: já matriculou? voltou antes? pediu pra parar? Se sim, cancela.
2. Entrega à consultora: frase + data em que disse + motivo + gancho do momento + rascunho.
   *"Dai, a Juliana te disse em 12/06 que voltaria a falar em setembro porque o Pedro estava em prova. Hoje é o dia. Abriu turma de teclado terça 17h — quer que eu prepare a mensagem?"*
3. Uma retomada por lead por vez. Sem resposta em 2 tentativas → nova data ou perda com motivo.

### Consultor — a mensagem
Pessoal, com a frase dele, com um gancho novo e terminando em pergunta (bumerangue):
1. **Lembrei de você** + o que ele disse: *"em junho você me disse que…"*
2. **O que mudou desde então** (gancho real): turma nova, condição do mês, evento.
3. **Uma pergunta:** *"faz sentido agora?"* / *"quer vir na terça?"*

### Gatilho sazonal (Krissya + Mila)
Na campanha do mês, a Mila puxa os leads perdidos por **preço** e **horário** que batem com o gatilho: preço → condição do mês; horário → turma nova. A consultora manda a retomada com o gancho. Alf: *"em janeiro, no volta às aulas, na Semana das Crianças — 'estou com uma condição especial'"*.

## O que NÃO fazer
- Lembrete sem a frase original.
- *"Você prometeu voltar"* — ele disse, não prometeu.
- Converter *"talvez"* em compromisso, ou *"em setembro"* em *"dia 1º"*.
- Retomar quem pediu pra parar.
- Retomar sem gancho novo — *"e aí, pensou?"* é cobrança, não retomada.
- Mesma mensagem pra todos.
- Mais de duas tentativas sem resposta.

## Exemplo de mensagem
*"Oi Juliana! Aqui é a Daiana, da LA Recreio. Lembrei de você — em junho você me disse que o Pedro estava em prova e que setembro seria melhor pra começar o teclado. Como foi a prova? Abriu uma turma de terça às 17h, que era o horário que você tinha pedido. Quer vir com ele fazer uma aula na próxima semana?"*

## Como medir
- Retomadas feitas na data / retomadas vencidas (meta: 100%).
- Leads quentes perdidos com data extraída / leads quentes perdidos (cobertura da extração).
- Retomadas que viraram resposta → visita → matrícula, na janela.
- Gatilho sazonal: matrículas de leads antigos reativados na campanha, contra o mesmo mês do ano anterior.
- Rótulo: observado / atribuído / incremental.

## Fonte
- Alf, 05/09/2026: o cliente que disse "daqui a 3 meses" e a Mila lembra; "lembrei de você"; gatilhos sazonais.
- Brainstorm 05/09/2026: desenho da `lead_retomada` (quando voltar, por quê, frase original; lembrete carrega a frase).
- Régua automática de follow-up + `classificar-desinteresse` (em produção): motivo de perda.
- Regra "fala do lead ≠ fato ≠ inferência" (absorvida em 05/09/2026).

**Escrito por:** Alf + Claude · **Data:** 05/09/2026 · **Estado:** candidato · **Decisor:** Krissya com Alf
$bloco_md$, null, 140, true, 'comercial', 'candidato', '0.1'
where not exists (
  select 1 from public.base_conhecimento_blocos where titulo = $bloco_md$Bloco 5 — Retomada com data: o "lembrei de você" do lead$bloco_md$
);

-- ── bloco-06-campanha-e-corridinha.md ──
insert into public.base_conhecimento_blocos
  (titulo, conteudo, unidade_id, ordem, ativo, publico, estado, versao)
select $bloco_md$Bloco 6 — Campanha e corridinha: ataca um gargalo, nasce com desfecho previsto$bloco_md$, $bloco_md$**Escopo:** comercial · **Público:** Krissya (Mila da líder) · **Estado:** candidato v0.1 · **Decisor:** Krissya, com Alf

---

## Quando usar
- **Dias 1 a 5 do mês:** se não há campanha ou corridinha registrada, a Mila provoca. Se já há, acompanha o combinado — não cobra de novo.
- **Gargalo no funil:** `onde_focar` aponta captação, agendamento ou fechamento numa unidade.
- **Gatilho sazonal:** janeiro, volta às aulas (fev/ago), Semana das Crianças, Black Friday, recital.
- **Fim do mês:** a Mila fecha a leitura da ação e preenche `evidencia_eficacia`.

**Sinal medido:** matrículas do mês por unidade (`matriculas_comerciais_v1`) contra a meta; dia do mês sem ação registrada; gargalo por unidade.

## O princípio
Campanha não é "vender mais" — é atacar **um** gargalo com **uma** mudança. Duas camadas que não se misturam na leitura:
- **Campanha pro público:** oferta, condição, evento, indicação. Muda o que o cliente vê.
- **Corridinha pro time:** meta curta + prêmio imediato. Muda o que o consultor faz.

E a regra do Alf: **toda ação nasce com o desfecho previsto** — o que olhar, quando, contra o quê. *Bateu a meta ≠ a campanha funcionou*: setembro bate por volta às aulas. Compara-se com o mesmo mês do ano anterior ou com as unidades que não fizeram; quando não dá pra isolar, a Mila diz que não dá.

## Como fazer

### Anatomia de uma campanha (6 campos — se faltar um, não roda)
1. **Gargalo + evidência:** *"Barra: 74 experimentais sem matrícula nos últimos 90 dias"* — número canônico, com data.
2. **Público:** quem exatamente, quantos, em qual unidade (`radar_publico_reativacao_v1`).
3. **A mudança (uma só):** condição, evento, sorteio, retomada. Não empilhar desconto + criativo novo + corridinha e depois atribuir o resultado a um deles.
4. **Execução:** quem faz, até quando, qual peça (texto/arte), qual bloco da base usa.
5. **Meta e prêmio** (se tiver corridinha): ver abaixo.
6. **Desfecho previsto:** métrica, janela, comparador. Escrito antes de começar.

### Anatomia de uma corridinha (o sprint em cima do campeonato)
O Matriculador+LA é o campeonato mensal (estrelas: Matrícula Plus, Indicação/Family, Ticket, Show-Up, Hunter 360°). A corridinha é o **sprint**: curta, prêmio na hora, uma métrica.
- **Meta curta:** semanal ou até o dia X. Ex. do Alf, agosto: bateu 30 matrículas → R$ 1.000 no Pix na hora. ⚠️ *30 era por unidade ou do time? Confirmar pra virar regra.*
- **Regra canônica do que conta:** matrícula = `matriculas_comerciais_v1`, até o último dia inclusive (o fim do intervalo é exclusivo — passar dia 1 do mês seguinte). Mês fechado vem do snapshot.
- **O que NÃO conta:** rematrícula, mudança de canal do lead pra caber no critério, matrícula sem passaporte pago.
- **Critério de desempate** e **data do Pix** definidos antes.
- **Uma métrica por corridinha.** Show-up ou matrícula ou indicação — nunca as três.

### Cardápio de campanhas prontas (cada uma já tem bloco)
| gatilho | campanha | bloco |
|---|---|---|
| Semana das Crianças | *"Traga um amiguinho"*: aluno traz amigo pra Experiência, os dois concorrem a um prêmio (videogame) | 2 |
| Black Friday / janeiro | Retomada dos perdidos por **preço** com a condição do mês | 5 |
| Qualquer mês com público alto | Condição de ex-aluno no LA Pass | 10 |
| Show-up baixo numa unidade | Piloto da Experiência Musical paga | estratégia candidata |
| Recital | Família convida quem quiser pra assistir → lista de leads mornos | 2 + 3 |
| Turma nova aberta | Retomada dos perdidos por **horário** | 5 |

### Como a Mila traz pra Krissya
- **Dia 1:** *"Krissya, bom dia. Setembro começou e não tem corridinha registrada. Em agosto foi 30 matrículas = R$ 1.000 no Pix. O gargalo do mês passado foi agendamento na Barra (X leads, Y agendados). Quer que eu desenhe uma corridinha de show-up pra Barra e uma campanha de indicação pras três?"*
- **Elo estratégia → ação:** nunca só o número. *"74 pessoas na Barra — quer que eu monte a lista e prepare a mensagem?"*
- **Fim do mês:** *"A corridinha de setembro fechou com X matrículas. Setembro de 2025, sem corridinha, deu Y. Observado: X. Atribuído: a diferença que sobra depois da volta às aulas — não dá pra isolar. Vale repetir em outubro pra comparar sem sazonalidade?"*

## O que NÃO fazer
- Campanha + corridinha + criativo novo + desconto no mesmo mês e atribuir o resultado a um.
- "Bateu a meta = funcionou."
- Meta sem regra canônica (o que conta, até que dia, quem confere).
- Prêmio que paga jogo sujo: mudar origem de lead, contar rematrícula.
- Campanha sem peça e sem data — ideia não é campanha.
- Cron eterno cobrando corridinha depois de ela existir.
- Deixar `evidencia_eficacia` vazia no fim do mês (hoje: vazia nas 14 estratégias).

## Exemplo de mensagem (Krissya → time, corridinha)
*"Time, corridinha de setembro: quem levar a unidade a 12 experimentais realizadas até dia 20 ganha R$ 500 no Pix no dia 21. Conta experimental realizada com presença confirmada no LA Report — visita não conta. Desempate: quem chegou primeiro. Bora?"*
*(valores de exemplo — quem define é a Krissya com o Alf)*

## Como medir
- Matrículas (ou a métrica da corridinha) do público, no mês, contra: mesmo mês do ano anterior **e** unidades que não fizeram.
- Custo da ação (prêmio + desconto + peça) por matrícula atribuída.
- `evidencia_eficacia` preenchida em 100% das ações, com rótulo observado / atribuído / incremental.
- Corridinha: efeito na semana seguinte (caiu depois do prêmio? antecipou matrícula que viria de qualquer jeito?).

## Fonte
- Alf, 05/09/2026: corridinha de agosto (30 = R$ 1.000), tipos de meta (corridinha, semanal), sorteio "traga um amiguinho", provocar a Krissya no início do mês.
- Brainstorm 05/09/2026: toda ação nasce com desfecho previsto; bateu meta ≠ funcionou; comparador honesto; elo estratégia → ação.
- Programa Matriculador+LA (ago/2026): estrelas mensais, metas de Show-Up por unidade (CG 40, REC 40, BAR 35), premiação anual.
- Regras travadas (checkpoint 05/09/2026): `matriculas_comerciais_v1`, intervalo exclusivo, snapshot do mês fechado.
- Método absorvido em 05/09/2026: campanha ≠ incentivo interno; uma mudança por vez; início do mês checa se o plano já existe.

**Escrito por:** Alf + Claude · **Data:** 05/09/2026 · **Estado:** candidato · **Decisor:** Krissya com Alf
$bloco_md$, null, 150, true, 'lideranca', 'candidato', '0.1'
where not exists (
  select 1 from public.base_conhecimento_blocos where titulo = $bloco_md$Bloco 6 — Campanha e corridinha: ataca um gargalo, nasce com desfecho previsto$bloco_md$
);

-- ── bloco-07-midia-paga.md ──
insert into public.base_conhecimento_blocos
  (titulo, conteudo, unidade_id, ordem, ativo, publico, estado, versao)
select $bloco_md$Bloco 7 — Mídia paga: o número que manda é custo por matrícula$bloco_md$, $bloco_md$**Escopo:** comercial/marketing · **Público:** Krissya (Mila da líder); só quem passa no gate de tráfego (diretoria, marketing, líder comercial) · **Estado:** candidato v0.1 · **Decisor:** Krissya, com Alf; quem mexe na verba é o Ryan (gestor de tráfego)

---

## Quando usar
- **Semanal:** leitura de Meta + Google por criativo e campanha.
- **Alerta imediato:** custo disparou, desempenho caiu, campanha pausada, saldo baixo, verba parada, verba concentrada em criativo que não converte.
- **Mensal:** realocação de verba entre criativos, campanhas e canais — inclusive tirar de mídia e pôr em indicação.
- **Antes de falar com o Ryan:** a Mila prepara o diagnóstico; a Krissya leva.

**Sinal medido:** gasto por plataforma/campanha/criativo (cron horário, no banco desde 03/09); custo por lead, por agendamento e por matrícula — **Meta por criativo, Google só por plataforma/unidade** (a atribuição lead → anúncio só existe no Meta). Hoje ~70% dos leads vêm do Instagram.

## O princípio
Lead barato que não agenda é o lead mais caro que existe. A ordem de leitura é **custo por matrícula → custo por agendamento → custo por lead** — nunca custo por conversa. Foi essa inversão que fez "Kids bateria" ser campeão do painel com zero matrícula.

Quatro regras antes de qualquer conclusão:
1. **Cobertura primeiro.** Sem foto de gasto no período ou sem vínculo lead → anúncio, a Mila diz "não sei", não estima.
2. **Coorte imatura muda.** Criativo com leads de ontem e zero matrícula não é fracasso — é cedo. ⚠️ *Janela de maturação: definir pela jornada real (dias do lead até a matrícula). Até então, 30 dias como provisório.*
3. **Google não fecha o funil por campanha.** Custo por matrícula do Google é da plataforma, não da campanha. A Mila não distribui matrícula por gasto.
4. **Orgânico e indicação não são custo zero** — são *sem mídia*. Têm custo de gente e de cashback.

## Como fazer — leitura semanal (Mila → Krissya)
1. **Cobertura:** gasto do período por plataforma; % dos leads com anúncio identificado.
2. **Funil por criativo (Meta):** conversas → agendamentos → presença → matrícula, com idade da coorte.
3. **Ranking** por custo de agendamento (todos) e por custo de matrícula (só coortes maduras).
4. **Diagnóstico** pela tabela de sinais — onde o funil quebra diz o que mexer.
5. **Recomendação** com hipótese, uma mudança, e o que olhar depois.

| sinal | o que checar antes | o que a Mila propõe |
|---|---|---|
| Muitas conversas, pouco agendamento | promessa do anúncio × o que a Mila SDR oferece; público; tempo de resposta | Rever anúncio e conversa juntos. Problema pode ser o criativo (promete o que não tem) ou o atendimento. |
| Agenda bem, presença baixa | confirmação, distância, canal (Instagram ~10% de show-up) | Não é mídia: é bloco 3 (antes da experimental) ou piloto da Experiência paga. |
| Vem, não matricula | pitch, horário, preço, professor | Não é mídia: é bloco 3/4. Não trocar criativo pra resolver fechamento. |
| Criativo recente sem matrícula | idade da coorte, volume | Esperar a janela. Propor teto de gasto até maturar. |
| Criativo maduro, caro por agendamento, sem matrícula | cobertura do vínculo, concentração de verba | **Pausar e realocar.** Levar pro Ryan com número. |
| Criativo barato por conversa e caro por agendamento | o clássico "Kids bateria" | Tirar do topo do ranking. Verba pra quem agenda. |
| Google com gasto e sem matrícula rastreada | limite de atribuição | Ler por plataforma/unidade; propor melhorar mensuração, não julgar campanha. |
| Campanha pausada / saldo baixo / verba parada | é intencional? | Alerta pra Krissya e Ryan no dia. |

### Realocação — o mesmo dinheiro, outro destino
Quando o criativo maduro não converte, a pergunta não é só "qual outro criativo" — é "onde esse dinheiro converte mais". Alf: *"vamos pegar essa grana e fazer um sorteio; traga um amiguinho e concorra"*. Indicação (77% de show-up) e retomada (bloco 5) competem pela verba com o Instagram (10%). A Mila mostra o custo por matrícula lado a lado; a Krissya decide; o Ryan executa a parte de mídia.

## Como a Mila traz pra Krissya
Formato fixo do alerta: **o que mudou / evidência / limite / próxima ação.**
*"Krissya, o criativo 'Kids bateria' é o mais barato por conversa (R$ [x]) e o pior por agendamento (R$ [y]), com 0 matrículas em 45 dias — coorte madura. Concentra [z]% da verba do Meta. Limite: o vínculo cobre [n]% dos leads. Sugestão: pausar e mover pra 'Canto adulto', que agenda a R$ [w]. Quer que eu mande o resumo pro Ryan e marque a reunião?"*

## O que NÃO fazer
- Ranquear criativo por custo por conversa ou por lead.
- Concluir sobre criativo antes da janela de maturação.
- Atribuir matrícula a campanha do Google.
- Realocar verba sozinha — Mila propõe, Krissya decide, Ryan aplica.
- Trocar criativo pra resolver problema de show-up ou de pitch.
- Mostrar custo de mídia a quem não passa no gate (em 05/09, 7 pessoas viam sem dever — corrigido).
- Mexer em criativo, público e verba ao mesmo tempo — depois ninguém sabe o que funcionou.
- Chamar orgânico e indicação de "grátis".

## Exemplo de mensagem (Krissya → Ryan)
*"Ryan, a Mila fechou a leitura da semana: 'Kids bateria' tá com 0 matrícula em 45 dias e [z]% da verba. 'Canto adulto' agenda por um terço do custo. Pausa o primeiro e joga a verba no segundo? E preciso de uma peça nova pra Semana das Crianças com o 'traga um amiguinho' — te mando o briefing."*

## Como medir
- Custo por matrícula por plataforma, mensal, só coortes maduras — contra o mês anterior e o mesmo mês do ano anterior.
- % da verba em criativos com custo de agendamento acima da mediana (meta: cair).
- Tempo entre alerta da Mila e ação do Ryan.
- Matrículas por canal (Instagram, Google, indicação, orgânico) lado a lado, com custo total de cada um — inclusive cashback e gente.
- Rótulo: observado / atribuído / incremental.

## Fonte
- Alf, 05/09/2026: "essa campanha não está performando, fala com o Ryan"; realocar pra indicação/sorteio; Instagram funcionando ou não.
- Brainstorm 05/09/2026: `trafego_por_criativo` ranqueia por custo de agendamento; caso "Kids bateria" (PC5).
- Capacidades da Mila estratégica (declaradas pelo Alf): investimento por plataforma, custo por lead/agendamento/matrícula, coorte imatura, "não sei" sem gasto, orgânico ≠ custo zero, alertas de campanha.
- Checkpoint 05/09/2026: gate de tráfego (5 pessoas), atribuição Google só por plataforma, cron horário de ads.
- Playbook: ~70% dos leads do Instagram (tráfego pago), ~5% do Google.
- Método absorvido em 05/09/2026: tabela de sinais; alerta em 4 partes.

**Escrito por:** Alf + Claude · **Data:** 05/09/2026 · **Estado:** candidato · **Decisor:** Krissya com Alf · **Executor de mídia:** Ryan
$bloco_md$, null, 160, true, 'lideranca', 'candidato', '0.1'
where not exists (
  select 1 from public.base_conhecimento_blocos where titulo = $bloco_md$Bloco 7 — Mídia paga: o número que manda é custo por matrícula$bloco_md$
);

-- ── bloco-08-lideranca-comercial.md ──
insert into public.base_conhecimento_blocos
  (titulo, conteudo, unidade_id, ordem, ativo, publico, estado, versao)
select $bloco_md$Bloco 8 — Liderança comercial: sinal + pergunta, nunca cobrança seca$bloco_md$, $bloco_md$**Escopo:** comercial · **Público:** Krissya (Mila da líder) — conteúdo nominal só pra quem passa no gate de gestão · **Estado:** candidato v0.1 · **Decisor:** Krissya, com Alf

---

## Quando usar
- **Sinal em alguém do time:** fila de conversas esperando subiu, tempo de resposta piorou, conversão caiu, promessa de retorno furou — com série suficiente e denominador honesto.
- **Ritual semanal:** segunda (funil numa tela), meio da semana (roleplay), sexta (3 números + 1 aprendizado).
- **Contratação** de consultor.
- **Fim de mês** difícil: quando a Krissya sente vontade de "descer e salvar o mês" sozinha.

**Sinal medido:** série diária de atendimento por consultora (`mila_atendimento_serie_v1` — piorando / estável / melhorando / série curta); padrão P7 (visibilidade `gestao`, nomeia gente — só a líder vê); matrículas por consultor **com contexto** (leads recebidos, unidade, jornada); Ficha Técnica LA de cada consultora.

## O princípio
Alf: *"o problema não é cobrança, é sentar e conversar"*. Por isso a Mila nunca entrega à Krissya um ranking de quem está pior e para aí — entrega **o sinal junto com a pergunta**: *"a Vitória está com 14 esperando, era 3 semana passada. Vale perguntar o que mudou antes de cobrar."*

Quatro ideias dos podcasts de vendas que sustentam isso:
- **Vendas = ambição + técnica + gestão das emoções** (*O Conselho*). Técnica se treina; ambição se contrata; emoção se lidera. Quando o resultado cai, a pergunta é *qual dos três* caiu.
- **Técnica melhora 20–30%; identidade dá o teto** (Dani Martins). Quem começa o dia achando que não é bom vendedor vende menos com a mesma técnica. Autoconfiança vende tanto quanto técnica — e se treina.
- **Líder é maestro emocional** (Caio Carneiro): sobe a confiança de quem está baixo, segura a euforia de quem está alto. Vendas é processo seletivo — o líder existe pra que o "não" do cliente não vire "não sirvo" na cabeça da consultora.
- **Comportamento observado ≠ traço de personalidade.** Fila alta é fato; "desinteressada" é julgamento. A conversa é sobre o fato.

## Como fazer

### A) Quando o sinal aparece — a conversa, não a cobrança
1. **Mila confere antes de avisar:** período comparável, série ≥ 5 dias, pessoa somada entre unidades (a Vitória tem linha em CG e Recreio), distribuição de leads. Sem isso, não há sinal — há ruído.
2. **Krissya descreve, não acusa** — situação + comportamento observável + impacto: *"esta semana ficaram 14 conversas sem resposta em 2h; semana passada eram 3; dois leads cobraram retorno."*
3. **Pergunta de intenção:** *"o que mudou? o que está travando? que ajuda você precisa?"* — e escuta. Volume de leads? Agenda? Um lead difícil? Algo fora do trabalho (não pergunta o quê — pergunta se precisa de ajuda)?
4. **Combinam ação + apoio + data de revisão.** *"Vou tirar as remarcações da sua fila por 2 semanas; a gente olha de novo dia 19."*
5. **Mila lembra a data** e traz a série de novo: melhorou? Aí a Krissya reconhece em público. Não melhorou? Segunda conversa, sem ranking.

### B) O ritual semanal (Dani: quem não tem rotina de time não bate meta)
| dia | ritual | quem | tempo |
|---|---|---|---|
| segunda | **Funil numa tela**: leads → agendados → show-up → matrículas, por unidade, contra a meta e a corridinha. Todo mundo olha o mesmo número. | Krissya + 3 consultoras | 15 min |
| quarta | **Roleplay de 15 min** com um bloco da base: a Mila escolhe pelo motivo de perda da semana (*"6 perdas por preço na Barra — roleplay do bloco 4, objeção de preço"*). Uma consultora é o lead, outra atende, Krissya dá o feedback. Treinar não vende, vender treina — mas o erro em roleplay não custa matrícula. | Krissya + time | 15 min |
| sexta | **3 números + 1 aprendizado:** matrículas da semana, retomadas cumpridas, promessas de retorno furadas — e uma frase de aprendizado que a Mila registra em `evidencia_eficacia`. | Krissya | 10 min |

### C) Adequar ao perfil — da consultora e do cliente
- **Da consultora:** a Ficha Técnica LA diz como cada uma reage sob pressão. A conversa do item A muda de tom conforme o perfil: quem precisa de dado recebe dado; quem precisa de reconhecimento recebe reconhecimento antes do problema.
- **Do cliente:** vender de verdade é se adequar ao ritmo do cliente e mudar a consciência dele (Dani). O consultor dominante que "tá aqui pra fechar" atropela — e o cliente se arrepende duas horas depois. No roleplay, treinar o oposto do perfil natural.

### D) Contratação de consultor (Dani Martins, adaptado)
1. **Perfil antes da entrevista:** Ficha Técnica LA. Mostra ritmo, flexibilidade, como decide.
2. **Entrevista de identidade — 4 perguntas:** quais 3 competências você tem pra bater meta todo mês? · me dá 3 evidências dos últimos 5 anos de que essas competências deram resultado · qual é a sua ambição, o que você acredita que merece? · onde estão suas fragilidades?
3. **Roleplay de 15 min** com um lead real da LA (do bloco 1): a pessoa pergunta ou afirma? escuta ou atropela? se adapta quando o "lead" muda de tom?
4. **Verde:** coração ensinável + ambição + disciplina. Técnica se ensina.
5. **Vermelho:** incapacidade de se adequar ao perfil do cliente, arrogância, "só vendo pra quem decide rápido". O *cavalo de corrida* sem escuta perde venda e perde cliente.

### E) Incentivo e presença
- **Vendedor precisa poder mudar de vida vendendo** (Thiago Nigro). Comissão + Matriculador+LA (estrelas) + corridinha (bloco 6). A Krissya garante que cada consultora sabe, em qualquer dia do mês, quanto falta e quanto ganha.
- **Descer pra salvar o mês** (Dani): se a líder precisa entrar pessoalmente na última semana pra fechar, o processo depende dela — não escala. Entrar pra destravar um caso (a Krissya às 22h36 mandando o Pix do Caso 1) é apoio; entrar todo fim de mês é sintoma.
- **Última voz de vendas é o dono** (Dani): Alf define a estratégia, Krissya conduz, Mila mede. Ninguém "convence" a estratégia por fora desse trio.

## Como a Mila traz pra Krissya
- **Sinal:** *"Krissya, a Vitória fechou a semana com 14 conversas esperando 2h+ (era 3). Antes de cobrar: os leads de CG subiram 40% e ela pegou 6 remarcações. Vale perguntar o que está travando e se dá pra redistribuir?"*
- **Ritual:** *"Segunda 9h — funil das três unidades pronto. Barra: agendamento caiu, show-up subiu. Quer que eu prepare o roleplay de quarta sobre agendamento?"*
- **Reconhecimento:** *"A Daiana cumpriu 100% das retomadas da semana. Vale um elogio no grupo — em público."*

## O que NÃO fazer
- Ranking nominal exposto ao time (o vazamento de 04/09 não pode se repetir).
- Cobrar antes de perguntar; perguntar sem escutar.
- Diagnosticar problema pessoal ("ela deve estar com problema em casa").
- *"Vai, confia em você"* — motivação sem preparo é o "motivado despreparado" (Joel Jota). Motiva com dado, técnica e apoio.
- Treinar só quando o mês vai mal. Roleplay é toda semana.
- Contratar pelo currículo e pela lábia. Vendedor bom não é quem fala bem; é quem pergunta bem.
- Líder desabafando pro time (Dani: "líder mimado"). O time é reflexo do líder.
- Avaliar por matrícula bruta sem denominador de leads, unidade e jornada.

## Exemplo de mensagem (Krissya → consultora, WhatsApp)
*"Vi, tudo bem? Reparei que essa semana ficaram 14 conversas esperando resposta, semana passada eram 3. Não é bronca — quero entender o que mudou. Foi volume de lead, as remarcações, ou tem algo travando? Me conta que a gente ajusta junto. Te chamo às 17h?"*

## Como medir
- Série de atendimento da consultora **depois** da conversa: melhorou em 2 semanas? (meta: sim, em ≥70% das conversas de sinal).
- % de sinais que viraram conversa com ação + data registrada (meta 100%).
- Roleplays realizados / semanas (meta 1/semana).
- Promessas de retorno furadas por consultora (meta: zero).
- Rotatividade e tempo até a 1ª meta batida de consultor novo.
- Rótulo: observado / atribuído / incremental.

## Fonte
- Alf, 05/09/2026: "o problema não é cobrança, é sentar e conversar"; a Mila entrega sinal + pergunta.
- Checkpoint 05/09/2026: `mila_atendimento_serie_v1`, P7 visibilidade `gestao`, somar unidades antes da série por pessoa, vazamento de 04/09.
- *O Conselho* (Flávio Augusto com Caio Carneiro, Joel Jota, Thiago Nigro, Carlos Bush): três pilares de vendas; maestro emocional; "treinar não vende, vender treina"; processo ensinável e mensurável numa tela; incentivo que permita mudar de vida; "quem pergunta melhor ganha"; "motivado despreparado" (Joel, JJ Podcast).
- *JJ Podcast — Dani Martins*: 5 inteligências de vendas; técnica = 20–30%, identidade = teto; contratação (perfil + identidade + roleplay); cavalo de corrida × coração ensinável; rituais e metas; dono é a última voz de vendas; descer pra salvar o mês é dependência.
- Ficha Técnica LA (perfil comportamental já implantado).
- Método absorvido em 05/09/2026: SBI + pergunta de intenção (CCL).

**Escrito por:** Alf + Claude · **Data:** 05/09/2026 · **Estado:** candidato · **Decisor:** Krissya com Alf
$bloco_md$, null, 170, true, 'lideranca', 'candidato', '0.1'
where not exists (
  select 1 from public.base_conhecimento_blocos where titulo = $bloco_md$Bloco 8 — Liderança comercial: sinal + pergunta, nunca cobrança seca$bloco_md$
);

-- ── bloco-09-calendario-comercial.md ──
insert into public.base_conhecimento_blocos
  (titulo, conteudo, unidade_id, ordem, ativo, publico, estado, versao)
select $bloco_md$Bloco 9 — Calendário comercial: vender com a maré, não contra$bloco_md$, $bloco_md$**Escopo:** comercial · **Público:** Krissya (planeja) e Mila (lembra 30 dias antes) · **Estado:** candidato v0.1 · **Decisor:** Krissya, com Alf

---

## Quando usar
- **Dia 1 de cada mês** (junto com o bloco 6) e no planejamento do trimestre.
- **30 dias antes de cada gatilho** do ano — a Mila avisa; a Krissya desenha.
- **Retomada sazonal** (bloco 5): quais perdidos casam com o gatilho que vem.
- **Leitura de resultado:** antes de dizer que uma campanha funcionou, olhar em que maré ela rodou.

**Sinal medido:** matrículas por mês do ano anterior (`matriculas_comerciais_v1`, snapshot) — a linha de base da maré. Ago/2026: CG 24 · REC 23 · BAR 19. Leads e show-up por mês.

## O princípio
Escola de música tem duas marés: **entrada** (janeiro/fevereiro e agosto) e **evasão** (julho e dezembro, os recessos). Vende-se com a maré: captação forte antes da maré alta, retenção e indicação na maré baixa. E a regra que já vale no bloco 6: *"bateu a meta em setembro" prova maré, não campanha* — compara-se sempre com o mesmo mês do ano anterior.

## Como fazer

### O ano da LA
| mês | o que acontece | oportunidade comercial | bloco |
|---|---|---|---|
| **janeiro** | matrícula / volta às aulas; família organiza o ano | retomada dos perdidos por **preço** com "condição de janeiro"; ex-alunos | 5, 10 |
| **fevereiro** | início do ano letivo; Bailinho de Carnaval | experimentais em volume; parcerias com escolas do bairro | 3 |
| **março** | ritmo cheio | corridinha de show-up; pedido de indicação na 4ª aula dos novos | 6, 2 |
| **abril–maio** | ritmo normal; Dia das Mães | campanha adulto ("o sonho que ficou pra depois") ⚠️ *nunca testada — hipótese* | 6 |
| **junho** | Julina Rock Fest (bandas) | vitrine: cada família traz um amigo pro show → lista morna | 2 |
| **julho** | recesso (~2 semanas); Circuito Musical de Férias; LA Drum Games; LAQ3T Day (interno) | **maré baixa = retenção**; indicação; pré-matrícula pra agosto | 10, 2 |
| **agosto** | volta às aulas do 2º semestre — **maré alta**; abre a janela anual do Matriculador+LA (ago–nov) | captação; corridinha; não desperdiçar lead: SLA de resposta apertado | 6, 1 |
| **setembro** | ainda maré alta | ler campanha contra setembro do ano anterior, não contra agosto | 6 |
| **outubro** | Semana das Crianças (12/10) | **"traga um amiguinho"** + sorteio (acelerador do programa de indicação) | 2, 6 |
| **novembro** | Black Friday; ⚠️ *recital — confirmar data com a coordenação* | retomada por preço com condição; recital como vitrine pra indicação | 5, 2 |
| **dezembro** | recesso; renovações; fechamento do ano | retenção e renovação; convite de volta pra janeiro; ex-alunos | 10 |

⚠️ Datas de Piquenique Musical, LA Sunset e Recital 2026: confirmar com a coordenação e cravar no calendário da Mila.

### O ritmo do mês (o que a Mila lembra sozinha)
| quando | o que |
|---|---|
| dia 1 | campanha e corridinha do mês definidas? Se não, provoca a Krissya (bloco 6) |
| dia 5 | vencimento — adimplência é condição do LA Talent |
| semana 2 | leitura de mídia (bloco 7); retomadas do mês na mesa das consultoras (bloco 5) |
| semana 3 | check da meta: faltam X pra corridinha; `onde_focar` por unidade |
| último dia | snapshot fecha; `evidencia_eficacia` preenchida; 3 taxas de indicação |
| 30 dias antes de cada gatilho | "Krissya, [gatilho] em 30 dias — bora desenhar? Peça com o Ryan, público, desfecho previsto" |

## Como a Mila traz pra Krissya
*"Krissya, faltam 30 dias pra Semana das Crianças. Outubro do ano passado deu [X] matrículas contra [Y] em setembro. Quer que eu monte o 'traga um amiguinho': lista de famílias ativas por unidade, briefing da peça pro Ryan e o desfecho previsto?"*

## O que NÃO fazer
- Lançar campanha na semana do gatilho — peça, público e time precisam de 30 dias.
- Atribuir à campanha o que é maré.
- Tratar julho e dezembro como meses de captação — são meses de retenção.
- Dois gatilhos, duas campanhas no mesmo mês.
- Esquecer o calendário local: Time Center (Recreio) tem agenda própria de eventos do shopping.

## Como medir
- Matrículas por mês contra o mesmo mês do ano anterior (linha de base).
- Gatilhos do ano com campanha desenhada 30 dias antes / total de gatilhos (meta 100%).
- Evasão em julho e dezembro, ano contra ano — a retenção medida.
- Rótulo: observado / atribuído / incremental.

## Fonte
- *Ecossistema de Vendas — Playbook*: exemplo do recesso de julho; eventos do LA Pass (Bailinho de Carnaval, Circuito Musical de Férias, Julina Rock Fest, Piquenique Musical, LA Sunset).
- Alf, 05/09/2026: janeiro, volta às aulas, Semana das Crianças, Black Friday; "setembro bate por volta às aulas".
- Programa Matriculador+LA (ago/2026): janela anual ago–nov.
- Agenda LA 2026: LA Drum Games (18/07), LAQ3T Day (21/07), Julina Rock Fest 2026, Projeto Recital 2026.
- Regras travadas (checkpoint 05/09/2026): mês fechado vem do snapshot; ago/2026 = CG 24 · REC 23 · BAR 19.

**Escrito por:** Alf + Claude · **Data:** 05/09/2026 · **Estado:** candidato · **Decisor:** Krissya com Alf
$bloco_md$, null, 180, true, 'lideranca', 'candidato', '0.1'
where not exists (
  select 1 from public.base_conhecimento_blocos where titulo = $bloco_md$Bloco 9 — Calendário comercial: vender com a maré, não contra$bloco_md$
);

-- ── bloco-10-ex-aluno-reativacao.md ──
insert into public.base_conhecimento_blocos
  (titulo, conteudo, unidade_id, ordem, ativo, publico, estado, versao)
select $bloco_md$Bloco 10 — Ex-aluno: "lembrei de você"$bloco_md$, $bloco_md$**Escopo:** comercial · **Público:** Krissya (quem decide a campanha) e consultor (quem liga) · **Estado:** candidato v0.1 · **Decisor:** Krissya, com Alf

---

## Quando usar
- **Consultor:** quando a Mila entrega a lista de ex-alunos elegíveis com motivo de saída e frase original, ou quando um ex-aluno volta a falar sozinho.
- **Krissya:** nos gatilhos sazonais — janeiro/volta às aulas, agosto, Semana das Crianças, Black Friday — e quando o público de reativação (`radar_publico_reativacao_v1`) mostra volume numa unidade.

**Sinal medido:** ex-alunos que voltaram a procurar a escola sozinhos fecharam **68%** — mas são **28 leads**, e quem volta sozinho já decidiu. Não vale como previsão pra base inteira; vale como prova de que a porta está aberta. Carteira de ex-alunos é grande, principalmente em Campo Grande; muitos saíram na pandemia e estão voltando aos poucos (Playbook).

## O princípio
Ex-aluno já confiou uma vez — o que precisa é de um motivo real pra voltar agora e da certeza de que o motivo da saída foi resolvido. A abordagem é pessoal ("lembrei de você"), nunca disparo igual pra todo mundo. E a conversa começa pela história dele, não pela oferta.

## Como fazer

### Krissya — desenhar a campanha (início do mês ou gatilho sazonal)
1. A Mila traz o público por unidade, **separado por motivo de saída**: horário · financeiro · mudança/pandemia · reclamação · conclusão/idade.
2. Cada motivo tem uma resposta diferente — ver tabela. Reclamação **não** recebe oferta antes de receber cuidado.
3. Define a condição de retorno do mês (⚠️ ver ponto de discussão sobre o LA Pass).
4. Fecha o desfecho previsto antes de começar (ver Como medir).

### Consultor — a conversa (script do Playbook, encurtado pro WhatsApp)
1. **Preparação:** instrumento, tempo de casa, professor, conquista (recital, banda) e motivo de saída. Sem isso, não liga.
2. **Abertura pessoal:** *"Oi [nome], aqui é a [consultora] da LA. Lembrei de você — você fez bateria com o [professor] e tocou no Julina de 2024. Como está a música na sua vida hoje?"*
3. **Escuta o que mudou.** Bumerangue: *"O que faria sentido pra você agora — voltar no mesmo instrumento ou experimentar outro?"*
4. **Resolve o motivo de saída** (tabela) antes de falar em valor.
5. **Convite:** visita ou aula de volta, com a condição de ex-aluno do mês. *"Tenho a turma de [dia/hora] — quer vir fazer uma aula e sentir?"*
6. **Registra** retorno, recusa ou nova data (`lead_retomada` com a frase dele).

| motivo da saída | o que resolver antes da oferta | gancho |
|---|---|---|
| horário | turma nova que caiba | *"Abriu turma de sábado de manhã — era isso que faltava, né?"* |
| financeiro | condição de ex-aluno do mês | *"Esse mês quem volta tem [condição]. Ajuda?"* |
| mudança / pandemia | novidade real (unidade, curso, evento) | *"Agora temos [novidade]. Ficou mais perto de vocês?"* |
| reclamação | pedir desculpa e mostrar o que mudou — sem oferta na 1ª mensagem | *"Você saiu por [motivo]. Queria te contar o que mudou desde então."* |
| conclusão / idade | próximo passo pedagógico | *"Você parou no [nível]. Tem a turma de [banda/avançado] pra quem quer seguir."* |

## Como a Mila traz pra Krissya
*"Krissya, na Barra tem [N] ex-alunos elegíveis: [x] saíram por horário, [y] por financeiro, [z] por mudança. Com a Semana das Crianças chegando, quer que eu monte a lista com a frase de saída de cada um e um rascunho por motivo?"*

## 💬 Pra discutir
- **LA Pass do ex-aluno.** A regra do Playbook diz: quem sai e volta paga LA Pass novo. É a primeira barreira de quem volta. Proposta: a "condição de ex-aluno" ser desconto ou isenção do LA Pass, em vez de mexer na parcela — cabe no financeiro e não cria precedente de mensalidade menor.
- **Ritmo.** Não convidar a base inteira de uma vez: 20–30 por semana por unidade. O que sobra vira controle natural.

## O que NÃO fazer
- Disparo em massa com o mesmo texto pra 300 ex-alunos.
- Ligar oferecendo desconto pra quem saiu por reclamação.
- Prometer novidade que não existe.
- Projetar os 68% de quem voltou sozinho sobre quem vai ser convidado.
- Tratar silêncio como autorização pra insistir toda semana: duas tentativas e retomada em data.
- Culpa (*"você sumiu"*) ou cobrança do passado.

## Exemplo de mensagem
*"Oi Rafael! Aqui é a Daiana, da LA Recreio. Lembrei de você: você fez guitarra com o Peds e parou em 2023 quando mudou de horário no trabalho. Como está a música por aí? Abriu uma turma de sábado às 10h que talvez encaixe agora — quer vir tocar uma aula e ver como está a mão?"*

## Como medir
- Convidados → responderam → vieram → rematricularam, por motivo de saída e unidade.
- Comparador: ex-alunos elegíveis **ainda não convidados** no mesmo período (o ritmo semanal cria o controle sozinho).
- Continuidade: quantos seguem matriculados 3 meses depois.
- Rótulo: observado / atribuído / incremental.

## Fonte
- *Ecossistema de Vendas do Grupo LA — Playbook*: "Contato com ex-alunos — pró-ativo" (preparação, abordagem, explorar experiência, oferta personalizada, CTA), seção "Ex-alunos" (carteira robusta em CG, saída na pandemia), regra do LA Pass.
- Medição no banco (handoff 05/09/2026, PC3): 28 leads de ex-alunos, 68,2% de conversão — público auto-selecionado.
- Alf, 05/09/2026: "lembrei de você"; gatilhos sazonais (janeiro, volta às aulas, Semana das Crianças, Black Friday).
- Público de reativação: `radar_publico_reativacao_v1` (Mila estratégica).

**Escrito por:** Alf + Claude · **Data:** 05/09/2026 · **Estado:** candidato · **Decisor:** Krissya com Alf
$bloco_md$, null, 190, true, 'comercial', 'candidato', '0.1'
where not exists (
  select 1 from public.base_conhecimento_blocos where titulo = $bloco_md$Bloco 10 — Ex-aluno: "lembrei de você"$bloco_md$
);

-- ── bloco-11-pre-atendimento-mila-sdr.md ──
insert into public.base_conhecimento_blocos
  (titulo, conteudo, unidade_id, ordem, ativo, publico, estado, versao)
select $bloco_md$Bloco 11 — Pré-atendimento da Mila SDR: o bot não converte, ele passa o bastão$bloco_md$, $bloco_md$**Escopo:** comercial · **Público:** Krissya e Alf (Mila da líder) · **Estado:** candidato v0.1 · **Decisor:** Alf (produto) e Krissya (operação)

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
$bloco_md$, null, 200, true, 'lideranca', 'candidato', '0.1'
where not exists (
  select 1 from public.base_conhecimento_blocos where titulo = $bloco_md$Bloco 11 — Pré-atendimento da Mila SDR: o bot não converte, ele passa o bastão$bloco_md$
);

-- ── prova: 11 candidatos entraram e a SDR não se mexeu ──────────────────────
do $carga$
declare v_novos int; v_lead int; v_texto text;
begin
  select count(*) into v_novos from public.base_conhecimento_blocos
   where estado = 'candidato' and publico in ('comercial', 'lideranca');
  if v_novos <> 11 then
    raise exception 'esperava 11 blocos candidatos, achei %', v_novos;
  end if;

  select count(*) into v_lead from public.base_conhecimento_blocos
   where publico = 'lead' and estado = 'aprovado' and ativo;
  if v_lead <> 4 then
    raise exception 'os 4 blocos da Mila SDR mudaram: achei %', v_lead;
  end if;

  -- O que a edge e a tela recebem tem de continuar sendo SO a SDR.
  select get_base_conhecimento(null) into v_texto;
  if position('Bloco 8' in v_texto) > 0 or position('Bloco 11' in v_texto) > 0
     or position('Bumerangue' in v_texto) > 0 then
    raise exception 'VAZAMENTO: bloco comercial/lideranca chegou na montagem da SDR';
  end if;

  raise notice 'carga ok: 11 candidatos · SDR intacta (4 blocos, % chars)', length(v_texto);
end $carga$;
