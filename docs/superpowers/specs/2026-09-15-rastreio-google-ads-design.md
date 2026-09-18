# Rastreio de origem do Google Ads — design

**Data:** 2026-09-15
**Tasks:** LAPE-35 (Fase 0), LAPE-36 (Fases 1–3)
**Origem:** conversa sobre um "motor de análise de tráfego pago" para avaliar o gestor humano.
A investigação mostrou que o motor não é o primeiro problema — a atribuição do Google é.

> ⚠️ **ATUALIZAÇÃO 2026-09-17 — o caminho mudou, e as Fases 0 e 2 foram DESCARTADAS.**
> Apareceu a quarta porta que a seção 3 dizia não existir: a **onpromedia já opera o
> redirect** entre o anúncio e o `wa.me` (domínio deles, não nosso), e passou a empurrar a
> atribuição resolvida por webhook. Não precisamos do prefixo "Vim pelo Google." (Fase 0)
> nem da nossa página-pedágio (Fase 2) — nem trocar o link do botão. O que foi construído
> está na **seção 9**, no fim deste documento. O resto do texto fica como registro do
> raciocínio original, que continua válido para explicar *por que* a solução tinha de vir
> de quem está antes do `wa.me`.

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
| Frase ≈ declarados | o texto sobrevive **e** quase todo o "Google" declarado é anúncio |
| Frase abaixo | **esperado** — ver ressalva do teto abaixo |
| Frase **acima** dos declarados | o texto sobrevive e a declaração manual **subconta** o Google |

⚠️ **O volume declarado NÃO é o teto.** "Google" é rótulo escolhido no cadastro do Emusys
(`upsert_lead` traduz 28 valores recebidos) e engloba **busca orgânica e Google Maps**, que
nunca passam pelo link do anúncio. Nenhuma fonte separa orgânico de pago hoje — é o que este
projeto existe para criar. Medido em 90 dias: `GOOGLE` + `Google` = 1.434 eventos vindos do
Emusys, e `SITE DA ESCOLA` (que o mapeamento também traduz para Google) **zero** — o rótulo
existe no `case` mas está morto, então ao menos o site não contamina a conta.

**Critério de pronto:** 15 ou mais conversas com a frase em 7 dias (~2/dia) → seguem as Fases
1–3. Abaixo de 5 → o caminho vira número dedicado por unidade. Entre 5 e 14, estender por mais
7 dias.

⚠️ **A Fase 0 responde "funciona?", não "funciona quanto?"** — medir a fração de cliques que
sobrevive exigiria saber quantos clicaram no link, e isso só o pedágio da Fase 2 informa.

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

---

## 9. O que foi construído (2026-09-17) — a rota pela onpromedia

### O que mudou em relação ao desenho original

A seção 3 concluiu que, como o `wa.me` é domínio da Meta, a ponte só poderia ser feita por
algo que viajasse junto com o lead (texto, telefone ou número dedicado) — "não há uma quarta
porta". **Havia**: quem está *antes* do `wa.me`. A onpromedia (plataforma "CQC"), que opera
as campanhas, já redireciona o clique pelo domínio dela antes de abrir o WhatsApp, e é ali
que o `gclid` é capturado. O que faltava não era mecanismo, era o **repasse** — e ele agora
existe, por webhook.

| Fase do desenho original | Situação |
|---|---|
| Fase 0 (prefixo "Vim pelo Google.") | ❌ **descartada** — existia só porque não víamos como obter o gclid |
| Fase 1 (origem chega ao banco) | ✅ **feita**, por outro caminho (webhook, não varredura do Chatwoot) |
| Fase 2 (página-pedágio própria) | ❌ **descartada** — o pedágio é da onpromedia; não construímos nem mantemos |
| Fase 3 (devolver a matrícula ao Google) | ⏳ pendente, e agora destravada: o `gclid` existe |

⚠️ **O link do botão NÃO mudou** do nosso lado, e não precisa mudar.

### As peças

| Peça | Onde |
|---|---|
| Webhook que a onpromedia chama | `https://webhookla.latecnology.com.br/webhook/onpromedia-google-ads-clique` |
| Workflow n8n | `DVqC4ihArH1Pz1vg` — Webhook → `registrarAtribuicaoGoogle` (HTTP) |
| Edge function | `supabase/functions/registrar-atribuicao-google-ads/index.ts` |
| Colunas em `leads` | `gclid` (já existia) e `google_ads_campanha_id` (migration `20260917220000`) |
| Log | `leads_automacao_log`, `evento='google_ads'` |

### O formato que chega

Dois eventos por conversa (`conversa.criada` e depois `conversa.evento_disparado`, este
quando uma palavra-chave dispara etapa de funil), ambos ecoando o **mesmo** bloco
`atribuicao`. Medido em 17 execuções no dia 17/09:

| `atribuicao.origem` | Conversas | O que traz |
|---|---|---|
| `organico` | 7 | nada |
| `meta` | 3 | `ctwa_clid`, `ad_id`, `ad_source_url` (post do Instagram) |
| `google` | 1 | `gclid`, `page_url_origem` (com `gad_campaignid`), `tracking_link_id` |

⚠️ **O mesmo endpoint mistura os três canais** — a onpromedia não separa por canal do lado
dela. Por isso o nome do webhook (`...-google-ads-clique`) é enganoso: ele recebe tudo.

⚠️ **O braço do Meta NÃO é processado aqui, de propósito.** Ele já tem dono
(`registrar-atribuicao-meta-ads` em tempo real + `varrer-atribuicao-meta-ads` de hora em
hora, com first-touch e trava contra corrida). Processar Meta também nesta função criaria
duas fontes escrevendo na mesma coluna. O filtro `origem === 'google' && gclid` é o
**primeiro passo**, antes de qualquer leitura no banco.

⚠️ **`gad_campaignid` não é campo próprio** — vem dentro da query string de
`page_url_origem`. Ausente não é erro; nem todo clique carrega.

### A lacuna que só apareceu ao medir: o webhook chega ANTES do lead existir

A primeira versão desta função era one-shot — recebia, casava, acabou. Medindo os 7
telefones do dia 17/09 contra o `created_at` do lead:

| Lead | Nasceu em relação ao webhook | Veredito |
|---|---|---|
| Cristiane | +1,8s | perderia |
| (emoji) | +2,1s | perderia |
| Renata | +2,4s | perderia |
| Marcelly | +3,0s | perderia |
| Danilo | +3,9s | perderia |
| Paula | nunca virou lead | perderia |
| Izadora | lead de março | ok |

**5 de 7 leads não existiam no banco quando o webhook chegou.** O único caso que funcionou
no teste inicial (José Arimateia) só funcionou por ser lead antigo — caso atípico, não o
padrão. A raiz: o braço do Meta tem *duas* camadas (tempo real + varredura horária) e eu
tinha copiado só a primeira.

Por isso existem a tabela `google_ads_cliques` e a varredura.

### As três coisas que a tabela `google_ads_cliques` resolve

1. **A corrida de segundos** — o clique fica gravado como `pendente` e a varredura casa no
   ciclo seguinte (cron `*/10`, janela de 7 dias).
2. **O clique órfão** — conversa que nunca virou lead (2 de 10 no dia) passa a deixar
   rastro: é verba gasta que não gerou nem cadastro, e antes era invisível.
3. **O histórico por lead** — `leads.gclid` guarda **um** clique só. Quem clica em três
   anúncios ao longo de dois meses tem dois cliques sem onde existir. Isso também é o que
   destrava a Fase 3: o Google usa **last click** na importação de conversão, não o
   first-touch que a coluna guarda.

⚠️ **`leads` continua fonte única do lead.** A tabela guarda EVENTO de clique e aponta para
o lead quando casa — não duplica cadastro.

### A regra de canal: fato vence declaração, mas só quando o clique trouxe a pessoa

```
canal vazio ........................... preenche Google (tapa-buraco — 18% dos leads hoje)
lead criado DEPOIS da conversa ........ sobrescreve (foi o clique que trouxe)
lead já existia antes da conversa ..... canal intacto (reengajamento)
gclid e campanha ...................... sempre gravados, nos três casos
```

⚠️ **O critério é BINÁRIO — "o lead já existia?" — não uma janela de tempo.** Chegou-se a
propor uma janela de 24h, medindo a distribuição real (88% dos cliques chegam em até 10 min
do lead nascer; 10,5% acima de 7 dias; quase nada entre 1h e 7 dias). Mas a janela era
constante arbitrária para uma pergunta que os dados já respondem de forma exata.

⚠️ **Compara com `conversa.created_at` do payload, NUNCA com a hora de chegada do webhook.**
O webhook chega ~1-2s depois da conversa nascer e o lead ~2-4s depois disso: comparar pela
chegada classificaria errado justamente o caso mais comum.

⚠️ **Por que não reatribuir lead antigo:** o `gclid` prova que houve um clique, não que ele
foi o primeiro toque. O lead 9323 (Meta) foi criado em 23/05 declarado Google e recebeu o
`ctwa_clid` em **17/09** — 117 dias depois. Reatribuir faria o canal de retargeting roubar o
crédito de quem trouxe a pessoa, e mudaria a série histórica para trás.

### `upsert_lead` parou de desfazer a atribuição

`canal_origem_id = coalesce(v_canal_id, canal_origem_id)` fazia o **último a falar ganhar**:
como o Emusys manda o canal a cada atualização, ele desfazia o que a atribuição apurou.
Flagrado no log — o lead 9674 tinha canal Instagram (correto) e virou "Indicação" em 11/06.

A regra nova protege **só quando o canal gravado concorda com a prova**:

| Situação | Emusys pode sobrescrever? |
|---|---|
| `gclid` + canal Google | ❌ protegido |
| `ctwa_clid` + canal Instagram/Facebook | ❌ protegido |
| `gclid` + canal Indicação (divergente) | ✅ livre — pode ser reengajamento, e aí a declaração é que está certa |

⚠️ **Não é trigger, de propósito.** Um trigger em `leads` protegeria a coluna em todo caminho
de escrita — inclusive a edição humana pela tela, que ficaria revertida em silêncio. O escopo
aqui é só o sync automático (emusys/nocodb/campanha).

Testado com rollback garantido: o protegido continuou Google (3) depois de o Emusys mandar
INSTAGRAM; o divergente virou Instagram (1), como deve.

### A tela

`SecaoGoogleAds.tsx` ganhou a tabela **"Leads atribuídos a anúncios"**, gêmea da do Meta.

⚠️ **Sem coluna "Anúncio"** — o Performance Max não expõe anúncio individual; o grão mais
fino é campanha. Inventar a coluna faria a tabela parecer comparável com a do Meta, e ela
não é.

O nome da campanha sai de `google_ads_metricas_diarias` (equivalente ao `meta_ads_cache`);
sem nome conhecido, mostra o id cru em vez de "—", para a lacuna se denunciar.

Os helpers de paginação saíram de `TrafegoPagoPage.tsx` para `PaginacaoTabela.tsx` — as duas
abas usam, e `TrafegoPagoPage` já importa `SecaoGoogleAds` (deixar lá faria ciclo de import).

### Inventário das peças

| Peça | Onde |
|---|---|
| Webhook da onpromedia | `https://webhookla.latecnology.com.br/webhook/onpromedia-google-ads-clique` |
| Workflow n8n | `DVqC4ihArH1Pz1vg` — Webhook → `registrarAtribuicaoGoogle` |
| Edge (webhook + varredura, 2 modos) | `supabase/functions/registrar-atribuicao-google-ads/index.ts` |
| Tabela de cliques | `google_ads_cliques` (migration `20260917230000`) |
| Colunas em `leads` | `gclid`, `google_ads_campanha_id` (`20260917220000`) |
| Cron da varredura | `varrer-atribuicao-google-ads`, `*/10 * * * *` (`20260917234500`) |
| Proteção do canal | `upsert_lead` (`20260917235500`) |
| Tela | `src/components/App/TrafegoPago/SecaoGoogleAds.tsx` |
| Log | `leads_automacao_log`, `evento='google_ads'` |

### Como conferir que está vivo (nunca pelo status do cron)

```sql
select situacao, count(*), max(created_at) from public.google_ads_cliques group by 1;
select acao, count(*), max(created_at) from public.leads_automacao_log
 where evento='google_ads' group by 1;
```

### `gad_campaignid` NÃO é `campaign.id` — e isso quase virou uma conclusão errada

O clique real carimbou `gad_campaignid=23155373713` na URL. Esse id **não existe**: nem na
conta que lemos (`717-909-7170`), nem em nenhuma das **38 contas** do MCC que gerencia a
escola, nem como `asset_group`, `ad_group` ou `campaign_budget`.

A conclusão apressada foi *"as campanhas rodam numa conta que não enxergamos"* — e estava
**errada**. Perguntando ao Google pelo próprio `gclid` (recurso `click_view`):

```
campaign.id   : 23150914508
campaign.name : [CG] [P.MAX] [LEADS] 18.10.2025
```

Que **está** na nossa conta, e cuja URL final é exatamente a landing do clique
(`laescolademusica.com.br/music-kids/`), batendo também com a unidade do lead (CG).

⚠️ **São dois identificadores diferentes.** O da URL não cruza com
`google_ads_metricas_diarias` e não serve para nomear campanha nem dividir custo.

⚠️ **Não há conta oculta nem verba invisível.** O gestor administra a conta da escola pelo
MCC dele (`716-163-9915`, 38 escolas) — é a mesma conta que o LAReport já lê.

### O resolvedor de campanha (3º modo da edge)

`POST {"resolver_campanhas": true}` — cron `25 */6 * * *`. Pega os cliques sem campanha
real, pergunta ao Google pelo `gclid` e grava `campanha_id` + `campanha_nome`, propagando o
id real para `leads.google_ads_campanha_id`.

| Coluna | O que guarda |
|---|---|
| `gad_campaignid` | o que o Google carimbou na URL — só registro, não cruza com nada |
| `campanha_id` | o **real**, do `click_view` — cruza com `google_ads_metricas_diarias` |
| `campanha_nome` | o nome, direto da API |

⚠️ **`click_view` exige `segments.date` de UM dia exato** e cobre só **90 dias**. Por isso a
consulta é por dia, e clique mais antigo que isso nunca terá campanha — é fato sobre a API.

⚠️ **4x por dia, não a cada 10 min: o `click_view` tem latência.** Medido no mesmo dia — o
clique das 18h34 resolveu na hora, o das 23h58 só apareceu depois. Consultar de minuto em
minuto só gastaria chamada para ouvir "ainda não".

⚠️ **Sem data da conversa, a janela é de 7 dias.** É o caso das linhas de backfill, cujo
`created_at` é a data do **lead**, não a do clique — procurar ali erraria o dia por semanas.
Foi exatamente o que aconteceu com o lead 13871 até a janela ser ampliada.

⚠️ **Usa as credenciais do próprio LAReport** (`GOOGLE_ADS_*`), as mesmas da captura diária.
Nada de terceiros.

### Medido no fim (3 cliques, 3 leads)

| Lead | Motivo do canal | Campanha resolvida |
|---|---|---|
| José Arimateia | `preservado_reengajamento` | [CG] [P.MAX] [LEADS] |
| José Carlos | `vazio_preenchido` | [CG] [P.MAX] [LEADS] |
| Paulo | `backfill_v1` | [CG] [P.MAX] [LEADS] |

Os três caminhos da regra de canal exercitados com tráfego real, e os três leads com
`canal_origem_id = 3` e o id de campanha que cruza com as métricas.

### Como conferir que está vivo (nunca pelo status do cron)

```sql
select situacao, count(*), count(campanha_id) as com_campanha, max(created_at)
from public.google_ads_cliques group by 1;

select acao, count(*), max(created_at) from public.leads_automacao_log
 where evento='google_ads' group by 1;
```

### O que ainda não está resolvido

1. ⚠️ **`gbraid`/`wbraid` não aparecem no payload da onpromedia.** Só `gclid`. Performance
   Max gera muito tráfego iOS/app, e essa perda seria **silenciosa**. Confirmar com o Rayan —
   a coluna já existe, esperando.
2. **Cobertura desconhecida.** 3 cliques atribuídos contra ~480 cliques/dia que o Google
   reporta. Falta medir que fração das conversas chega com `gclid`.
3. **Fase 3** (importar a matrícula como conversão) — agora com os dois insumos que faltavam:
   o `gclid` validado e o caminho do `click_view` já provado.
