# Mila de gestão — plano completo (04/09/2026)

A Mila SDR fica onde está. Este plano é a **segunda Mila**: a que fala com o time
comercial, com os gerentes e com o Luciano — e que **escreve no cadastro**, não
só lê.

Régua declarada pelo Luciano e que vale para tudo aqui:

> **Número vem de RPC. Contexto vem de skill + LLM.** O LLM interpreta e redige;
> ele nunca calcula, nunca inventa e nunca decide dinheiro.

---

## O que a auditoria dos 6 blocos encontrou

| bloco | pronto | trava |
|---|---|---|
| 1 · SDR | **11/11** | — (não tocar) |
| 2 · Reports | 12/16 | consultor e meta por pessoa |
| 3 · Pendências | 7/8 | a volta |
| 4 · Apoio ao time | 0/7 | falta a ficha do lead |
| 5 · Tráfego | **14/16** | status/budget do Meta; série curta |
| 6 · Crescimento | 8/16 | motivo de perda, curso, calendário |

**Três dados travam metade da lista** — e os três têm a mesma raiz: ninguém
registra o que aconteceu.

| dado | cobertura | consequência |
|---|---|---|
| `leads.consultor_id` | **0 de 9.799** | sem ranking, sem meta por pessoa |
| `leads.motivo_nao_matricula_id` | **0 de 9.799** | bloco 6 sem insumo |
| `leads.curso_interesse_id` | 45% (5.407 em branco) | demanda por instrumento cega |

### As três chaves que o Luciano deu, e o que cada uma recupera

**1. Consultor = responsável comercial da unidade.** Já existe a tabela
`unidade_contato_comercial`, preenchida e ativa: Vitória (CG), Kailane (Barra),
Daiana (Recreio). **Recupera 100%, retroativamente**, sem depender de conversa
nem de inbox. ⚠️ A Vitória está com DDD 31 (`553171422022`) — conferir.

**2. Curso de interesse auto-preenchido pela experimental.** Retroativo recupera
**só 65** (60 por experimental + 5 por matrícula) — a maioria dos 5.407 nunca
chegou a agendar. **Mas para a frente vale**: quem agenda bateria passa a ter
"bateria" no interesse, sem ninguém digitar.

**3. Motivo de perda.** Vasculhei: **não existe em lugar nenhum.**
`motivos_saida` (24) e `movimentacoes_admin.motivo` (403) são de **aluno que
sai**, não de **lead que não fecha** — coisas diferentes. O Emusys não manda.
**Este só nasce da conversa** — e é por isso que a Mila escrevendo resolve.

---

## A decisão nova: a Mila ESCREVE

> *"O time entra pouco no sistema. Se a escrita estiver na mão deles pela Mila,
> ela não vai ser só ler."* — Luciano

O padrão já foi provado pela Sol no caixa. Copiamos a arquitetura, não o código.

### O que vale a Mila escrever

| # | escrita | por que | risco |
|---|---|---|---|
| **W1** | `curso_interesse_id` | 5.407 em branco; o time sabe e não digita | baixo — rótulo |
| **W2** | `motivo_nao_matricula` | 0 preenchidos; só nasce de conversa | baixo — rótulo |
| **W3** | `canal_origem_id` | 40% das matrículas sem canal | baixo — rótulo |
| **W4** | fechar sinal do radar | é a **volta**; resolve a dor da Vitória | baixo — reversível |
| **W5** | `consultor_id` | derivado da unidade, com override | baixo |
| **W6** | remarcar experimental | o time já faz isso na mão | **médio** — mexe em agenda |
| **W7** | observação no lead | contexto que hoje se perde | baixo |

### O que a Mila NÃO escreve

| nunca | por quê |
|---|---|
| valor, mensalidade, desconto | é dinheiro — é da Sol, com aprovação |
| `converteu = true` | matrícula nasce do Emusys; escrever aqui inventaria aluno |
| status de matrícula | vem do Emusys; escrever cria divergência silenciosa |
| **DELETE de qualquer coisa** | lixeira sim, apagar não |

### Como ela escreve — 5 invariantes

1. **Toda escrita atrás de RPC `SECURITY DEFINER`**, nunca SQL livre. O LLM
   escolhe a intenção; a RPC valida e grava.
2. **Preview + confirmação** para W6. Rótulo (W1–W3, W5, W7) grava direto — o
   custo de errar é reversível e a fricção mataria a adoção.
3. **Trilha sempre**: quem pediu, quando, valor antes e depois.
4. **Nunca deleta.** Correção é nova versão.
5. **Ambiguidade vira recusa, não sorteio.** Dois leads com o mesmo nome → ela
   pergunta. É a lição do `word_similarity` da Sol.

---

## ✅ Passo 5 — a Mila MANDA (manhã e fim do dia) · construído em 04/09 (noite)

**Exigência do Luciano que decidiu o desenho:** *"ela tem que saber o que ela
enviou"* — se a consultora responder "não é nada disso", a Mila tem que saber do
quê. Então o cron **não dispara texto por fora**: ele sobe o Hermes **na mesma
sessão que o bridge usa com cada consultora** (`chatwoot-consultor-v2-<telefone>`,
perfil `mila-consultor-readonly`, carimbo por env — o spawn é cópia do
`runHermesMeta` do bridge), entrega um envelope `[MILA PROATIVA · manhã|fim do
dia · DD/MM]` com os dados canônicos, e o que a Mila escreve vai para o WhatsApp
dela pela WAHA da unidade. A próxima mensagem dela cai na mesma sessão. Contexto
intacto, sem tabela nova de "o que eu mandei".

| peça | onde | o que faz |
|---|---|---|
| `mila_briefing_manha_v1(tel, data)` | migrations `20260904150000` + `151000` | experimentais e visitas de HOJE (hora/aluno/curso/professor), ONTEM (último dia útil; segunda olha sábado): fez e está sem desfecho · faltou sem remarcar **e abaixo do teto de 3 tentativas**, QUENTES agora (só R18, 24h), pendências **só dos leads de hoje** (curso/canal vazio), estrela mais perto (`mila_estrela_mais_perto_v1`: menor `faltam/meta`), `nada_para_hoje` |
| `mila_fechamento_dia_v1(tel, data)` | idem | fez hoje (desfecho de cada uma), faltou hoje (remarcada? teto?), matrículas de hoje, **de dias anteriores** ainda sem desfecho (3 dias, sem repetir os de hoje), pendências só de hoje, amanhã (próximo dia útil; sábado → segunda) |
| `mila_consultoras_ativas_v1()` | idem | as 3 (governança: comercial + colaborador + unidade) com apelido (`Dai` sai do parêntese) |
| `mila-proativa.py` | `vps/la-hq/mila/scripts/` → `/home/mila/.openclaw/workspace/scripts/` | `--tipo manha|fim_do_dia [--dry-run] [--so tel] [--data]`; **reserva `automacao_log.idempotency_key` ANTES** de rodar (`mila_proativa|tipo|tel|dia` — cron vira 2-4 execuções); `nada_para_hoje` ou `[SEM ENVIO]` = não manda; DRY-RUN roda numa sessão de ensaio, **nunca na real** |
| skill `mila-gestao` | seção "Quando fui EU que mandei" | como tratar "não é nada disso", correção vira tool na hora, chama pelo nome, silêncio > ruído |

**ACL:** `service_role` + `mila_acesso_restrito`, nunca anon/authenticated (conferido `proacl`).

**O que o 1º ensaio real (Dai, fim do dia 04/09) mostrou e foi corrigido na
fonte:** a v1 puxava o backlog GLOBAL de pendências ("250 sem anamnese", "64 sem
ficha") — exatamente a "coisa antiga" que o Luciano mandou tirar — e repetia os
10 nomes de hoje em dois blocos. Agora pendências = só dos leads que ela tocou
hoje; `fica_para_amanha` = só dias anteriores. **R16 (lead parado) não entra na
DM** — não é uma das 5 situações aprovadas e foi o ruído do relatório de 03/09.

**Textos de ensaio (dry-run, nada enviado):**

> *Dai, hoje foram 10 experimentais: Bento Lima, Sophie Figueiredo Soriano e
> Beatriz Lombardi; as outras 7 ficaram sem desfecho no dia, normal. Teve 1
> falta: Sofia Mena, Canto, 09:00 — não remarcada, 2 tentativas. Matrículas
> hoje: 0. De dias anteriores e ainda sem desfecho: 5 (…). Amanhã já tem 3
> experimentais: Thomás, Laura e Vincenzo. Quer que eu te deixe esses 5 antigos
> no radar cedo?*

> *Vitória, teu dia tá assim: 3 experimentais — Canto com Daiana Pacifico:
> 10:00 Luci Machado Viegas e 12:00 Simone Lima Alves; 11:00 Pedro Sandes,
> Musicalização para Bebês, Adriana. Ontem zerou. 2 quentes agora. Ticket
> Premiado é a estrela mais perto: faltam R$ 3 (387 → 390). Quer que eu
> priorize os 3 de hoje?*

**Cron INSTALADO em 04/09 às 15:56 BRT (user `mila`, VPS em UTC):** `30 11 * * 1-6`
manhã (08:30 BRT) · `30 21 * * 1-6` fim do dia (18:30 BRT). **1ª execução real:
04/09 18:30 BRT (fim do dia, para as 3).** Log `logs/mila-proativa.log` +
`logs/mila-proativa.cron.log`; rastro por envio em `automacao_log`
(`evento='mila_proativa'`, texto + dados no `detalhes`). Desligar = comentar as 2
linhas no `crontab -u mila -e`.

🔴 **Achado grave do ensaio — o perfil das consultoras estava MORTO.**
`mila-consultor-readonly` respondia `Primary auth failed` (xai-oauth) e caía em
`HTTP 401` — qualquer consultora que escrevesse "Mila" teria erro, e nada acusou
porque **nenhuma tinha escrito ainda** (0 sessões). `auth.json` era cópia idêntica
do da raiz, sem `refresh_token`; só o `mila-sdr` tinha o par completo. Trocado
para `openai-api / gpt-5.4-mini` (API key já no `.env` do perfil; sem OAuth,
sem rotação). Backup `config.yaml.bak-20260904T184827Z-pre-openai-api`.
**Regra nova:** antes de liberar perfil Hermes para gente, `hermes chat -q ok`
naquele `HERMES_HOME` com `rc=0` e sem aviso de fallback.

**Fora deste passo (próximo):** cutucada de hora em hora (R18 em tempo real,
"uma vez por pessoa"), e a situação "escola prometeu retorno em 24h", que ainda
não tem sinal.

## ✅ MILA DE GESTÃO — CONCLUÍDA (04/09, noite)

Tudo que o time toca vem da **mesma fonte que monta o relatório comercial**.
Provado contra o relatório de agosto que a equipe recebeu:

| | relatório | Mila |
|---|---|---|
| matrículas CG · REC · BAR | 24 · 23 · 19 | **idêntico** |
| leads / experimentais / faltas (REC ago) | 278 / 51 / 17 | **idêntico** (lê o snapshot) |
| ticket parcela · passaporte | 404,13 · 402,17 | **idêntico** |

⚠️ **Mês fechado vem do SNAPSHOT, não do vivo.** O cálculo ao vivo dava 279
leads e 61 experimentais em ago/Recreio — o relatório é uma foto de 01/09 15:53
e o banco continuou andando. A consultora recebeu 51; se a Mila disser 61, ela
desconfia dos dois. Mês corrente vem ao vivo e é anunciado como parcial.

### As 13 ferramentas

**Leitura** — `minha_pauta`, `agenda_do_dia`, `fechamento_do_dia`,
`numeros_do_mes`, `estrelas_matriculador`, `ficha_lead`, `pendencias_comerciais`.
**Escrita** — `registrar_curso_interesse`, `registrar_motivo_perda`,
`registrar_canal_origem`, `registrar_consultor`, `anotar_lead`, `fechar_sinal`.

### Os 4 crons

| quando | o quê |
|---|---|
| **08:30** seg-sáb | briefing do dia: experimentais, visitas, quentes, o que ficou de ontem, estrela mais perto |
| **de hora em hora** 09h-19h | cutucada: **só** preso no bot (R18) e promessa sem retorno (R7). Teto 5/dia, 1× por pessoa |
| **18:30** seg-sáb | fechamento: o dia + **o mês contra a meta** + o funil + amanhã |
| **a cada 5 min** | vigia: avisa no tópico Logs quando a Mila falha ou cala com alguém |

⚠️ **R7 "promessa de retorno não cumprida" já existia** e estava ativa desde
03/09, detectada por LLM na conversa, com 7 sinais abertos e **nenhum
consumidor**. Era a 5ª situação aprovada; não precisou ser criada, só ligada.

### Formato: molde, não instrução

A instrução abstrata ("formato de WhatsApp, curto") produzia parágrafo corrido.
Hoje o envelope leva o **molde literal** — cabeçalho, separadores, blocos com
emoji e contagem, uma informação por linha, nome em negrito, detalhe indentado,
uma pergunta no fim. Bloco vazio não aparece; campo sem valor some da linha; o
número do cabeçalho tem que bater com o que está listado embaixo.

### O que fica de fora, e por quê

- **Segundo andar (gerentes) e terceiro (diretoria)** — não construídos.
- **Visita não tem confirmação de comparecimento**: toda linha fica `agendada` e
  só CG registra visita. O número vai com ressalva explícita.
- **Sinal com `emusys_aula_id` de EVENTO** não cruza com a grade e cai no status
  gravado — dívida antiga do webhook de experimental.

## 🟢 LIBERADO PARA O TIME (04/09, 18h30) — pode mandar testar

**Como falar com ela:** no WhatsApp da **Mila da própria unidade** (privado ou
no grupo), com **"Mila"** na mensagem. Depois do primeiro "Mila", ela fica 30
min na conversa sem precisar do nome. Mensagem sem "Mila" ela guarda como
contexto e não responde (regra de 24/08, `consultor-gatilho.js`).

**Verificado antes de liberar:**

| consultora | contato no Chatwoot | telefone | governança | inbox da Mila |
|---|---|---|---|---|
| Vitória (CG) | **"Vick"** | `553171422022` (DDD 31 — é o número dela mesmo) | id 23, CG, comercial | 155 ✅ |
| Daiana (Recreio) | "Daiana" | `5521968060404` | id 7, Recreio, comercial | 148 ✅ |
| Kailane (Barra) | "Kailane" | `5521984690143` | id 12, Barra, comercial | 147 ✅ |

- O bridge decide modo consultor **só pela governança** (`consultor_permitido`);
  o `custom_attribute consultor=true` do Chatwoot não é exigido (só log).
- O extrator tira o `+` e tudo que não é dígito → bate exato com a governança
  (provado: `+5521…` falha no banco, `5521…` passa; o bridge manda `5521…`).
- Grupo cai no mesmo caminho (consultor autorizado), e **grupo nunca vira lead**.
- Carimbo por mensagem = `MILA_CONSULTOR_TELEFONE` que o bridge já exporta.

**O que o time consegue hoje:** pauta do dia, situação no MATRICULADOR + LA,
ficha de lead, pendências cadastrais, e **registrar** curso, motivo de perda,
canal, quem atendeu, anotação, e **fechar item da pauta**. Só a própria unidade.

**Passo 5 (a Mila MANDA) construído na mesma noite — ver seção acima.** O que
segue fora: a cutucada de hora em hora e o sinal "escola prometeu 24h".

⚠️ Lição registrada: a prioridade era o time e eu instalei primeiro no canal do
Luciano. Corrigido no mesmo dia, mas custou uma tarde de confusão.

## ✅ CORREÇÃO DE PRIORIDADE (04/09, 18h) — o pacote está no perfil das CONSULTORAS

**Erro meu, apontado pelo Luciano:** instalei o pacote primeiro no perfil raiz
(o canal dele, Telegram) em vez do perfil que atende a Vitória, a Daiana e a
Kailane. A prioridade sempre foi o time. Corrigido:

| | perfil | quem cai nele (bridge `pickHermesProfile`) | estado |
|---|---|---|---|
| **consultoras** | `mila-consultor-readonly` | `pode_editar=false` → Vitória, Daiana, Kailane | ✅ MCP + skill + alma **instalados e provados** |
| diretoria | raiz `/home/mila/.hermes` | `pode_editar=true` → Luciano, Hugo, Anne Susan (+ Telegram) | ✅ já estava |

**Como a Mila sabe quem é a consultora, sem ninguém digitar:** o
`chatwoot-mila-bridge.js` sobe **um processo por mensagem** e já exporta
`MILA_CONSULTOR_TELEFONE=<telefone do remetente>` a cada spawn (fora do alcance
do modelo). O wrapper do MCP passou a usar esse env como carimbo, com
precedência sobre o arquivo de segredo. **Zero mudança no bridge, zero risco no
caminho de lead.**

**Prova, exatamente como o bridge chama** (`MILA_CONSULTOR_TELEFONE=5521968060404`, Daiana):

| chamada | resultado |
|---|---|
| carimbo resolvido | `Daiana (Dai)`, escopo `unidade` |
| `tools/list` | **10 tools — tráfego não aparece** |
| `ficha_lead` Jullyane (Recreio) | ✅ |
| `ficha_lead` Hetiene (CG) | `nao_encontrado_no_escopo` — **nem descobre que existe** |
| `anotar_lead` em lead de CG | `fora_do_escopo` |
| `estrelas_matriculador` | só Recreio |

⚠️ **CRLF:** o wrapper `.sh` editado no Windows subiu com `\r\n` e o bash
recusou (`$'do\r'`) — a instalação passou, a prova não rodou até o
`sed 's/\r$//'`. `.gitattributes` agora força LF em `vps/**`.

⚠️ **Nenhuma das três consultoras aparece ainda como remetente nas caixas da
Mila** (espelho da Sol, inboxes 147/148/155) — bate com o log "nenhum consultor
conversou". O formato do telefone da Vitória (DDD 31 na governança) só se
confirma quando ela escrever; se cair `nao_autorizado`, é isso.

## ✅ Passo 3 — FEITO em 04/09 (fim da tarde) · pronto para o passo 4

| peça | onde | prova |
|---|---|---|
| 6 RPCs de escrita + 2 helpers | banco (`mila_registrar_*`, `mila_fechar_sinal_v1`, `mila_anotar_lead_v1`) | guardas: ambíguo→candidatos, canal já preenchido→recusa, fora do escopo→recusa, desconhecido→recusa; 3 escritas no lead de teste com trilha |
| MCP `mila-gestao-tools` (7 leitura + 6 escrita) | `/home/mila/.openclaw/workspace/scripts/mila-gestao-tools-mcp.{mjs,sh}` | 13 tools listadas com o carimbo do Luciano; estrelas, ficha e escrita ok |
| carimbo do solicitante | `secrets/mila-gestao-tools.env` → `MILA_SOLICITANTE_TELEFONE=5521981278047` | quem pede vem da env, nunca do modelo |
| skill `mila-gestao` + `references/programa-matriculador.md` | `/home/mila/.hermes/skills/mila-gestao/` (perfil RAIZ) | instalada |
| SOUL de parceira | `/home/mila/.hermes/SOUL.md` (backup `.bak-20260904T174702Z-pre-gestao`) | trocada |
| fiação no `config.yaml` raiz + restart | `hermes-gateway-mila.service` | gateway `active` 17:47:05Z; `mila-gestao-tools-mcp.mjs` vivo como filho (pid 1500770); Telegram reconectou |

**Arquitetura, como o Luciano pediu — agent-first, não regex-first:** zero
regex de diálogo. A skill diz *o que fazer com cada pedido*; a alma diz *como
falar*; as tools são estreitas e nomeadas; o número vem de RPC; a escrita tem
trilha; nada deleta. Tráfego só aparece para diretoria/líder/marketing (o MCP
resolve `mila_quem_sou_v1` no start e omite as tools).

⚠️ **O carimbo é por instância.** Hoje é o Luciano (passo 4). Para dar acesso a
uma consultora: (1) ela já está em `governanca.agente_usuarios`; (2) a instância
que a atende precisa de `MILA_SOLICITANTE_TELEFONE` com o telefone dela. O
gateway do Hermes não entrega o remetente às tools — por isso carimbo, não
argumento. **É a garantia de "não vaza outra unidade": no banco e no MCP, não
no prompt.**

⚠️ **O que mudou no Telegram do Luciano:** a alma (era SDR), o MCP novo, a
skill. Os MCPs antigos (lareport read-only, n8n, governança, chatwoot)
continuam. O SELECT livre do lareport read-only **continua lendo zero** por RLS
— esperado; o dado vem pelas RPCs.

### Passo 4 — teste na DM do Luciano (próximo, com ele)

Roteiro que exercita tudo: *"como tá o programa esse mês?"* → *"o que tenho pra
hoje no Recreio?"* → *"como tá a Jullyane?"* → *"o curso dela é guitarra"* →
*"tem pendência cadastral em CG?"* → *"quanto gastei em mídia esse mês?"* →
*"anota na Jullyane que a mãe decide"* → *"esse item da pauta já resolvi, ela
não quer"*.

## ✅ Passos 1 e 2 — FEITOS em 04/09 (tarde)

| entrega | prova |
|---|---|
| `get_estrelas_matriculador_v1` — as 5 estrelas do PDF, com "faltam X" | Luciano vê 3 unidades; Daiana só Recreio; desconhecido recusado |
| `get_situacao_lead_v1` — a ficha | Daiana vê Jullyane; **nem descobre** a Hetiene (CG); "Graciele" → 3 candidatas |
| `radar_pendencias_comerciais_v1` — 5 buckets | Vitória/CG: 376 · 39 · 33 · 12 · 21 |
| tráfego liberado para a role da Mila | 10 linhas pelo MCP real dela |
| **consultor 0 → 100%** (`unidade_contato_comercial`, trigger) | 9.802 leads, 0 sem consultor |
| **curso pela experimental** (trigger + backfill) | 5.407 → 5.342; porta fechada pra frente |

**A prova que importa:** pelo MCP real da Mila (sem JWT, role restrita),
`select count(*) from alunos` continua devolvendo **0** — e as quatro RPCs
devolvem dado. É a régua funcionando: **número vem de RPC.**

⚠️ **Descoberto no caminho:** o programa no banco (`programa_matriculador_config`,
pontos, nota 80) é a versão ANTERIOR e nunca foi usada — histórico vazio. O que
vale é o PDF (estrelas). Modelado em `programa_matriculador_estrelas_config`.

⚠️ **Isolação por unidade = `governanca.quem_eh(telefone)`.** Toda RPC nova
recebe `p_solicitante_telefone`; unidade nula (diretoria) vê tudo. A Vitória de
CG está com DDD 31 na governança — conferir com ela.

**Próximo: passo 3** — o MCP de tools de gestão (leitura + as escritas W1–W5,
W7) e a skill/SOUL de parceira. Depois o **passo 4**: teste na DM do Luciano.

## O plano, em 6 passos

### Passo 1 — Destravar o que já existe *(hoje)*

A Mila tem `SELECT` em 465 tabelas e **lê zero**: conecta sem JWT e a RLS
devolve vazio em tudo. Não vou dar `bypassrls` — a saída é RPC.

- `GRANT EXECUTE` no conjunto de tráfego → **bloco 5 no ar**
- RPC de pendências (`radar_pendencias_comerciais_v1`) → **bloco 3 no ar**,
  com 875 alunos sem anamnese e 135 experimentais sem ficha esperando
- `get_situacao_lead_v1` → **bloco 4 no ar**

### Passo 2 — Fechar as portas de dado *(hoje)*

- Trigger: experimental agendada preenche `curso_interesse_id` se vazio
- Backfill do consultor por `unidade_contato_comercial` → **0% vira 100%**
- Backfill de curso pelos 65 recuperáveis

### Passo 3 — As ferramentas de escrita *(W1–W5, W7)*

Uma RPC por intenção, com trilha. A Mila passa a fechar os buracos **falando**
com o time, em vez de reclamar deles.

### Passo 4 — Teste no privado do Luciano

Antes de qualquer consultora. Acesso total, todas as RPCs. É onde a régua é
exercitada: ela erra na sua DM, não na da Vitória.

### Passo 5 — A volta e a DM da consultora

W4 ligado + as 5 situações já aprovadas. Só depois do passo 4 passar.

### Passo 6 — O que depende de tempo

- Status e budget na captura do Meta (o Google já tem) → 2 alertas do bloco 5
- Alerta de queda de desempenho → precisa de ~2 semanas de série
- Bloco 6 completo → depende de motivo de perda começar a existir

---

## Oportunidades que o Luciano não listou

Achei na auditoria e não estavam na lista:

- **Lead que fala com a Mila e nunca chega a humano** — já medido: 50% das
  conversas comerciais. Vira R18, já no ar.
- **Divergência de nome cadastro × conversa** — a Mila vê o nome real na conversa
  e o cadastro tem outro (caso Lucas Nunes de Salles/Souza).
- **Consultora sem resposta há X horas** — o espelho já sabe; ninguém vigia.
- **Lead que voltou depois de frio** — hoje quem esfria não é reavaliado.
- **Anúncio que gera pergunta repetida** — os leads perguntam a mesma coisa; isso
  é briefing de criativo pronto, e ninguém lê.

---

## O que muda de fato

Hoje a Mila reclama de buraco de cadastro. Depois disso, **ela fecha o buraco
conversando** — e os blocos 2 e 6, que estão em zero, passam a ter insumo sem
ninguém abrir o app.
