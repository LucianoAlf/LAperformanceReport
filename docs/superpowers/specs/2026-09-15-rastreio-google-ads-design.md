# Rastreio de origem do Google Ads — design

**Data:** 2026-09-15
**Tasks:** LAPE-35 (Fase 0), LAPE-36 (Fases 1–3)
**Origem:** conversa sobre um "motor de análise de tráfego pago" para avaliar o gestor humano.
A investigação mostrou que o motor não é o primeiro problema — a atribuição do Google é.

---

## 1. O problema, medido

### Não existe atribuição do Google. Zero.

Últimos 90 dias, `leads` com `origem_registro='funil'`:

| | Instagram | Google |
|---|---|---|
| Leads | 1.404 | **551** |
| Com identificador técnico do clique | 926 (66%) | **10** |

Os 10 do Google são leads do **Meta** classificados errado (têm `meta_ctwa_clid`). Os 541
restantes são *"Google porque alguém digitou Google"* no cadastro — resposta declarada, não
rastreio. Não existe `gclid`, nem UTM, nem campanha em `leads`.

O Meta funciona porque a Meta é dona das duas pontas: o `ctwa_clid` viaja nos **metadados** da
mensagem, fora do alcance do usuário. O Google não tem como fazer isso e nunca vai ter,
enquanto o WhatsApp for da Meta.

### O número que o Google reporta é fumaça

90 dias, `google_ads_metricas_diarias`:

| Campanha | Tipo | Gasto | "Conversões" do Google |
|---|---|---|---|
| [P.MAX] [LEADS] [CPA] [RECREIO] | Performance Max | R$ 3.534 | 792 |
| [P.MAX] [LEADS] [BARRA] | Performance Max | R$ 3.522 | 640 |
| [CG] [P.MAX] [LEADS] | Performance Max | R$ 2.043 | 1.078 |
| [CG] [SEARCH] [L.A MUSIC] | Search | R$ 61 | 5 |

**2.510 conversões declaradas contra ~23 matrículas reais no banco.** A "conversão" do Google
conta clique em botão, pedido de rota e ligação iniciada — o que estiver configurado como ação
na conta. Hoje ninguém tem como contestar esse número, porque o elo com o resultado não existe.

### Consequência para o pedido original

O "motor de avaliação do gestor" não pode nascer antes disso: **96% da verba do Google é
Performance Max**, e sem atribuição a metade Google da verba é inauditável. O motor só poderia
opinar sobre o Meta.

---

## 2. Objetivo

Ligar o lead do Google ao clique que o originou, em três graus de precisão crescente:

1. **Campanha** — "esse lead veio da campanha P.Max de CG"
2. **Clique individual** — o `gclid` daquele lead
3. **Devolução** — informar ao Google que aquele clique virou matrícula

### Não-objetivos

- **Criativo.** Performance Max não expõe criativo; o grão mais fino possível é campanha /
  grupo de ativos. Não há o que buscar abaixo disso.
- **Retroatividade.** Forward-only, como toda a atribuição do módulo de Tráfego Pago.
- **Mexer no funil de vendas.** WhatsApp continua sendo a porta; nada de trocar por formulário
  sem decisão de negócio explícita.

---

## 3. A restrição que fecha o espaço de soluções

Quando o lead toca no botão, o navegador **sai do domínio**. O `wa.me` é redirecionador da Meta
que abre um app nativo de terceiro. Não existe gancho ali — nem via GTM, que roda apenas do
lado de cá.

Documentação de mercado confirma textualmente: *"o GCLID não pode seguir o usuário para dentro
do WhatsApp; como `wa.me` é domínio externo operado pela Meta, cookies não cruzam a fronteira
de domínio"*.

Logo, a ponte só pode ser feita por algo que **viaje junto com o lead**:

| O que viaja | Mecanismo | Grão | Fragilidade |
|---|---|---|---|
| Um texto | frase / código na mensagem | clique | o lead pode apagar |
| O telefone dele | ele digita antes (formulário) | clique | atrito no funil |
| O destino | número dedicado por campanha | campanha | nenhuma |

Não há uma quarta porta.

### Alternativas descartadas, com evidência

- **Casamento por janela de tempo.** Inviável: **481 cliques/dia** (1 a cada 1,5 min em horário
  diurno) contra ~6 conversas/dia. Numa janela de 5 min há 3 candidatos; em 30, vinte. Serve
  como rede marginal, jamais como método.
- **Pool de números rotativos** (tracking dinâmico de chamadas). Daria `gclid` individual sem
  texto e sem formulário, mas a reserva seria por **clique**: ~20–30 números simultâneos, cada
  um com sessão WAHA e inbox no Chatwoot. Absurdo para 6 leads/dia.
- **GTM atravessando o domínio.** Não existe. GTM é a ferramenta com que se implementa o lado
  de cá, não uma alternativa à barreira.

### O que sustenta a aposta no texto

`sol_chatwoot_mensagens`, 180 dias, primeiras mensagens de contato com texto pré-preenchido:

| O que aconteceu | Casos |
|---|---|
| Chegou exatamente como o link mandou | **115** |
| Acrescentou algo (no fim ou no começo) | 6 |
| Editou o meio | 1 |
| **Truncou o final** | **1** |

**~99% de preservação**, e quem mexe **acrescenta** em vez de apagar.

⚠️ Ressalva que a Fase 0 existe para resolver: esses 123 preservaram uma **frase natural**,
vinda de site e Instagram. Um código com cara de lixo técnico convida mais à deleção, e o
tráfego do Google pode se comportar diferente. Os 99% são **teto**, não previsão.

---

## 4. Fases

### Fase 0 — medir, sem código (LAPE-35)

1. Confirmar para onde as 3 campanhas P.Max apontam hoje: site, `wa.me` direto, mapa ou
   ligação. ⚠️ **Bloqueia todo o resto** — define se a mudança é na URL de destino do Google
   Ads ou no link do botão do site.
2. Dar a cada campanha uma frase de abertura própria, que declare a origem:

   | Hoje | Passa a ser |
   |---|---|
   | `Quero informações das aulas de música na LA Music Kids Campo Grande` | `Vim pelo Google e quero informações das aulas na LA Music Kids Campo Grande` |

3. Esperar 7 dias e contar conversas que chegaram com a frase nova.

A informação fica **só na conversa do Chatwoot**. É medição, não produto.

⚠️ **O denominador é o problema desta fase, e precisa ser declarado.** Não existe verdade sobre
quantos leads do Google chegaram — é justamente o que falta. Então a comparação é contra a
**declaração manual** (`canal_origem_id = 3`) no mesmo período, e os dois desfechos são
informativos:

| Resultado | Leitura |
|---|---|
| Frase ≈ declarados | o texto sobrevive **e** a declaração manual é razoável |
| Frase muito abaixo | ou o texto morre, ou os declarados não eram Google — indistinguível sem a Fase 1 |
| Frase **acima** dos declarados | o texto sobrevive e a declaração manual **subconta** o Google |

Como baseline, o volume esperado é ~6 conversas/dia (551 em 90 dias), ou seja **~42 em 7 dias**.

**Critério de pronto:** 25 ou mais conversas com a frase em 7 dias (≈60% do baseline) → seguem
as Fases 1–3. Abaixo de 13 (≈30%) → o caminho vira número dedicado por unidade. Entre os dois,
estender a medição por mais 7 dias antes de decidir.

O site já faz isso sem saber: 30 leads chegaram com *"Estava no site da LA Music School e
gostaria…"*. As frases atuais já separam marca (Kids/School) e unidade — só falta a origem.
A técnica é padrão de mercado ("unique pre-filled links"), não invenção local.

### Fase 1 — a origem chega ao banco

**Estender a `varrer-atribuicao-meta-ads`**, não criar edge nova. Ela já roda de hora em hora,
já lê conversas via `POST /conversations/filter` numa janela de 3 dias, já casa por telefone e
já grava `canal_origem_id` **apenas quando vazio** (first-touch + trava contra corrida).
Reconhecer a frase do Google é um caso a mais na mesma função.

**Modelo de dados:** coluna nova em `leads` para a campanha de origem. Hoje só existem
`meta_ad_source_id` e `meta_ctwa_clid`, ambos específicos do Meta.

⚠️ `candidatosTelefone()` é **cópia** entre duas edges — mudar a regra de telefone exigiria
mudar nas duas. Esta fase **não toca** nessa função.

**Resultado:** os ~550 leads/trimestre que hoje são declaração manual passam a ter prova, por
campanha.

### Fase 2 — `gclid` individual (página-pedágio)

```
anúncio → ads.<dominio>/ir?u=cg&t=bateria
        → registra {gclid|gbraid|wbraid, código, unidade, criativo}
        → 302 → wa.me/<unidade>?text=…(cód. G-7K2P)
```

- O que vai no texto é um **código curto**, nunca o `gclid` cru: 60–100 caracteres de lixo
  visual fazem o lead apagar.
- Página única, conteúdo por parâmetro (`u` = unidade, `t` = tema). Seis elementos: logo +
  unidade, headline espelhando o anúncio, botão de WhatsApp, microcopy do que vai acontecer,
  endereço real, política de privacidade. Sem menu, sem segundo CTA, sem preço.
- **Variante opcional:** 1 campo de WhatsApp na página, casando por **telefone** em vez de
  texto — imune tanto à deleção quanto ao volume de cliques, e reaproveitando a regra de
  telefone que a varredura do Meta já usa. Cobra atrito (20–40% de quem clicou) e é decisão de
  negócio.

### Fase 3 — devolver a matrícula ao Google

Quando o lead matricula, enviar ao Google *"esse clique virou matrícula, valor R$ X"*. Exige o
`gclid` da Fase 2 e a tag do Google na página. É o **maior ganho isolado** de todo o projeto: o
Google deixa de otimizar para as 2.510 conversões fantasma e passa a otimizar para as ~23
reais. Independe de motor, de IA e do gestor.

---

## 5. Falha diagnosticável

Vale a regra da casa: nenhum caminho de falha pode ser mudo.

| Caminho | Como ele grita |
|---|---|
| Frase não reconhecida na varredura | log com `chatwoot_conversation_id` + trecho da mensagem |
| Telefone ambíguo | `ambiguo_pendente`, **não escolhe** — mesma política do Meta |
| Clique registrado sem conversa correspondente | fica como clique órfão na tabela: é informação, não erro |
| `gclid` ausente (marcação automática desligada) | contador de cliques sem parâmetro; se maior que zero por um dia, alarme |
| Import de conversão recusado pelo Google | resposta da API gravada com o `gclid` e o motivo |

⚠️ **Nada de `catch` vazio.** Toda falha carrega o identificador do registro e o valor que a
causou.

⚠️ **`pg_cron` mente** — ele marca `succeeded` quando apenas enfileirou o `net.http_post`. Já
mordeu esta mesma área em 11/09/2026, quando a `capturar-google-ads-diario` ficou parada com
9 execuções "bem-sucedidas" por dia. Conferir pelo **efeito** (linha gravada), nunca pelo cron.

---

## 6. Riscos

| Risco | Efeito | Mitigação |
|---|---|---|
| **Marcação automática desligada** na conta | nenhum `gclid` chega | verificar antes de escrever código |
| **`gbraid`/`wbraid`** (iOS e app) | perde fatia grande **em silêncio**; P.Max gera muito | capturar os três parâmetros desde o dia 1 |
| Texto editável | perde o código naquele lead | a atribuição de campanha não depende dele se houver número dedicado |
| P.Max manda para mapa/ligação | esses cliques nunca passam pelo pedágio | nenhuma — o relatório precisa declarar |
| LGPD (se entrar formulário) | escola vira controladora de dado pessoal | aviso de privacidade + base legal declarada |

---

## 7. Questões em aberto

1. **Para onde as 3 campanhas P.Max apontam hoje?** Bloqueia a Fase 0.
2. **Números de WhatsApp dedicados por unidade** — piso de 100% de atribuição, mas custa três
   linhas, três inboxes no Chatwoot, três sessões no WAHA e a Mila atendendo em todos. Decisão
   adiada de propósito: se a frase sobreviver bem na Fase 0, pode ser desnecessário.
3. **Formulário na landing** — troca robustez por atrito. Decisão de negócio, não de
   engenharia.
4. **Domínio da página-pedágio** (Fase 2). Não há domínio da escola nas contas Hostinger
   auditadas, e o `latecnology.com.br` é da tecnologia, não da escola. Definir antes da Fase 2 —
   não bloqueia a Fase 0 nem a Fase 1.

---

## 8. Relação com o pedido original

O pedido era um motor que respondesse *"quanto gastamos esse mês"* e *"qual criativo converte
melhor"*, para avaliar o gestor humano. A investigação mostrou que:

- As duas perguntas **já têm resposta viva**: `radar_trafego_canal_v1` e
  `radar_trafego_criativo_v1`, expostas à diretoria pelas tools `trafego_por_canal` e
  `trafego_por_criativo` da Mila.
- Ranquear **criativo** por matrícula é estatisticamente vazio: ~5 matrículas/mês divididas
  entre 15–27 criativos. Foi exatamente o erro que o Alf pegou em 08/09.
- E metade da verba (Google) é inauditável por falta de atribuição.

Por isso a ordem inverteu: **rastreio primeiro, motor depois.** O motor de avaliação do gestor
continua de pé como projeto seguinte, e o desenho dele — auditor de decisões em modo sombra,
lendo Activity Log do Meta e `change_event` do Google, julgando só as divergências — fica
registrado para quando a base existir.
