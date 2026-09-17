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

### Política de escrita

```
teste: true ....................... ignora (não grava nem loga)
origem != google OU sem gclid ..... ignora
sem telefone / telefone inválido .. loga sem_telefone
nenhum lead com o telefone ........ loga nao_encontrado
todos os leads já com gclid ....... ja_completo (é o 2º evento ecoando o mesmo dado)
2+ leads sem gclid no telefone .... loga ambiguo_pendente, NÃO escolhe
exatamente 1 lead sem gclid ....... grava
```

- **First-touch:** a trava `IS NULL` fica no `WHERE` do próprio `UPDATE`, então sobrevive a
  evento duplicado e a corrida entre os dois eventos da mesma conversa.
- **`canal_origem_id = 3` (Google) vai em UPDATE separado**, com trava própria — mesmo
  motivo documentado em `varrer-atribuicao-meta-ads`: num update só, uma coluna já
  preenchida bloquearia a gravação da outra.

### Medido no dia do deploy

Lead 14201 (José Arimateia Carneiro, CG) recebeu `gclid`,
`google_ads_campanha_id = 23155373713` e `canal_origem_id = 3`, com 1 linha `vinculado` em
`leads_automacao_log`. Segunda chamada com o mesmo payload devolveu `ja_completo` sem
escrever de novo. Pelo webhook real: `teste: true` → `ignorado_teste`, payload Meta →
`ignorado_nao_google`.

⚠️ **O `onError` do node HTTP foi deixado no padrão (derruba a execução).** Como o webhook
responde `200` no recebimento (`responseMode: onReceived`), falhar depois **não** afeta a
onpromedia — e faz a falha aparecer vermelha na lista de execuções do n8n em vez de sumir.
Conferir sempre pelo efeito:

```sql
select acao, count(*), max(created_at) as ultimo
from leads_automacao_log where evento = 'google_ads'
group by acao order by 2 desc;
```

### O que ainda não está resolvido

1. **`gbraid`/`wbraid` (iOS e app) não foram vistos preenchidos em nenhum evento.** O
   payload tem o campo `gclid` e nada equivalente para os outros dois. Performance Max gera
   muito tráfego iOS — **perder essa fatia seria silencioso**. Confirmar com a onpromedia.
2. **Cobertura desconhecida.** 1 evento com `gclid` em 17 não diz qual fração dos cliques
   pagos chega atribuída. Comparar `leads` com `gclid` contra os cliques que o Google
   reporta em `google_ads_metricas_diarias`.
3. **Fase 3** (importar a matrícula como conversão no Google) continua de pé, e agora tem
   o insumo que faltava.
