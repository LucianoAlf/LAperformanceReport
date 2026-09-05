# Mila de gestão — checkpoint vivo (atualizado 05/09/2026)

Onde a frente parou, o que está no ar, o que falta. **Ler antes de retomar.**
Plano e histórico em `docs/superpowers/specs/2026-09-04-mila-gestao-plano.md`.

---

## 🔴 A arquitetura (corrigida pelo Luciano em 04/09 — não confundir de novo)

```
🧱 ALICERCE ......... motor de dados
1️⃣ PRIMEIRO ANDAR ... contexto → interpretação → orientação
2️⃣ SEGUNDO ANDAR .... padrões → aprendizados → estratégia
3️⃣ TERCEIRO ANDAR ... ação → execução → medir
```

**Os andares são CAPACIDADE, não persona.** A pilha inteira se repete **para cada
agente**: a Mila do consultor tem os quatro dela, a Mila da líder comercial tem os
quatro dela, a Sol tem os dela.

⚠️ O erro anterior deste documento foi rotular andar por QUEM USA ("1º =
operacional/consultoras, 2º = tático/gerentes"). Isso faz parecer que subir de
andar é trocar de público, quando subir de andar é a **mesma pessoa ganhando uma
capacidade nova**. Um consultor precisa dos quatro.

Como reconhecer em conversa: 1º = *"o que está acontecendo"*; 2º = *"o que isso
quer dizer e o que aprendemos"* (padrão com amostra); 3º = *"então faz isso"*.

---

## Estado por agente

### Mila do CONSULTOR (Vitória/CG · Daiana/Recreio · Kailane/Barra)

| andar | estado |
|---|---|
| 🧱 alicerce | ✅ RPCs canônicas, governança, carimbo, escopo por unidade |
| 1️⃣ contexto/interpretação/orientação | ✅ no ar desde 04/09 — pauta, agenda, mês, estrelas, ficha, pendências + 3 crons |
| 2️⃣ padrões/aprendizados/estratégia | ✅ **ligado em 05/09** — ver abaixo |
| 3️⃣ ação/execução | ✅ escrita no cadastro (6 tools) + recado com aprovação e revisão |

### Mila da LÍDER COMERCIAL (Anne Krissya)

| andar | estado |
|---|---|
| 🧱 alicerce | ✅ ads (Google+Meta, cron horário), Instagram, atendimento, radar comercial diário |
| 1️⃣ | ✅ **já existia e eu não sabia**: `anny-leads-watch.js` (cron do `mila`, 5×/dia — 12/14/16/18/20h BRT) manda a ela os leads aguardando resposta 2h+, por unidade e por consultora, na conversa 8809 (inbox 147). E desde 05/09 ela conversa com a Mila com as 3 unidades no escopo. |
| 2️⃣ | ✅ 05/09 — vê os padrões de `gestao` (inclusive P7, que nomeia gente), a estratégia das 3 unidades e a série de atendimento da equipe |
| 3️⃣ | ✅ **corrigido em 05/09** — a unidade do recado passou a ser a do DESTINO, e o recado ganhou VOLTA: ela pede, a consultora responde à Mila, a Mila leva de volta |

---

## O que entrou em 05/09 (2º andar do comercial)

**O andar já existia medido e estava MUDO.** Em 03/09 mediu-se `radar_padroes`
com 5 padrões comerciais (PC1..PC5) e `radar_estrategias` com as ações
dimensionadas (EC1..EC3), e nada chegava à conversa. Não faltava medir: faltava
ligar.

### Migrations
- `20260905120000_segundo_andar_comercial.sql`
  - `radar_padroes` ganhou **`dominio`** e **`visibilidade`** (`rede` | `gestao`).
    PC1..PC5 = comercial/rede; **P7 = comercial/gestao** porque nomeia consultoras
    ("a Vitória prometeu 38 e deixou 8 sem retorno") — mostrá-lo a uma consultora
    repetiria o vazamento de 04/09.
  - `radar_regras.padrao_codigo`: **R15/R16/R17 → PC1**, **R18 → PC2**.
    O mapa é DADO, não código — vale retroativo para os 122 sinais já abertos, e
    a leitura resolve por `coalesce(sinal.padrao_codigo, regra.padrao_codigo)`.
    ⚠️ **R7/R8 NÃO são mapeados para P7 de propósito** (P7 é `gestao`).
  - `radar_estrategias.publico_codigo` liga cada ação a um público de
    `radar_publico_reativacao_v1(unidade)` — é o que transforma "179 pessoas na
    rede" em "74 na Barra". EC5 (indicação) e EC6 (remarcar falta) criadas.
  - `radar_padrao_estrategia` ganhou o elo comercial (existia só para aluno).
  - RPCs **`mila_padroes_v1`** e **`mila_estrategias_v1`**.
- `20260905130000_serie_diaria_atendimento_comercial.sql`
  - Tabela **`atendimento_consultor_diario`** + `snapshot_atendimento_consultor_v1`
    + cron **`snapshot-atendimento-comercial-diario`** (22:10 UTC = 19:10 BRT).
  - RPC **`mila_atendimento_serie_v1`** com tendência
    (piorando/estável/melhorando/**serie_curta**).

### Tools novas (MCP `mila-gestao-tools`, agora 20/23)
`o_que_aprendemos` · `onde_focar` · `desempenho_atendimento`

### Gate de tráfego corrigido
O gate era `escopo === 'todas' || departamento in ('diretoria','lider','marketing')`
— e `'lider'` é **nível**, não departamento. Como `mila_quem_sou_v1` devolve
`escopo: 'todas'` para quem não tem unidade, **custo de mídia estava visível para
7 pessoas** que não deviam ver: Fabi e Jessyca (ADM colaboradoras), Rose
(financeiro), Juliana e Quintela (pedagógico), Ana Paula (RH).
Hoje: `departamento in ('diretoria','marketing','comercial') && nivel in ('lider','diretoria')`
→ exatamente Anne Krissya, Anne Susan, Hugo, Luciano e Yuri. Provado no caminho
real (handshake MCP `tools/list` por telefone).

---

## Regras de negócio travadas (não reabrir sem medir)

- **Matrícula do comercial** = `matriculas_comerciais_v1`. Ago/2026: **CG 24 ·
  REC 23 · BAR 19**, idêntico ao snapshot do relatório (reconferido em 05/09).
  ⚠️ O 3º argumento é **exclusivo** (`data_matricula < p_ate`): passar `31/08`
  perde o dia 31 — a Barra tem 3 matrículas nesse dia. Os 3 chamadores usam
  meia-aberta corretamente.
- **Show-up** = experimentais **+ visitas**. Visita não tem confirmação de
  comparecimento e só CG registra.
- **Mês fechado vem do snapshot**, nunca do vivo.
- **Escopo**: só a unidade de quem pergunta. Quem lidera (unidade nula) vê as três.
- **Quando existe medição, a Mila não opina.** Regra nova na SKILL, nascida de
  falha real no ensaio de 05/09 (ver abaixo).

---

## Metodologia, base de conhecimento e o que vem

📄 **`docs/handoffs/2026-09-05-mila-comercial-metodologia-e-base-de-conhecimento.md`**
— documento autossuficiente, feito para levar a modelo externo. Traz a sequência
acordada, o desenho do bumerangue (agenda de retomada), o **cashback de indicação**
(R$ 50, hoje impagável de forma auditável: 80 matrículas por indicação em 180
dias e nenhuma registra quem indicou) e a governança em aberto.

### Onde entra MEDIR (resolvido em 05/09)

**Não é um 4º andar** — criar um quinto nível quebraria a metodologia.
**Medir é a ARESTA DE VOLTA do 3º andar para o 2º**: sem ela a pilha é
encanamento, com ela vira ciclo. O campo `radar_estrategias.evidencia_eficacia`
existe e está **vazio nas 14 estratégias** — é literalmente onde mora "essa
corridinha funcionou". A partir de agora, **toda ação nasce com o desfecho
previsto**: o que olhar, quando, contra o quê.
⚠️ "Bateu a meta" não é "a campanha funcionou" — setembro bate por volta às
aulas. Comparar contra o mesmo mês do ano anterior ou contra as unidades que não
fizeram; quando não der para isolar, dizer que não dá.

## Bumerangue (agenda de retomada) — no ar em 05/09

**Migrations** `20260905150000` (agenda) + `20260905160000` (extração pela conversa).

- Tabela **`lead_retomada`**: quando a pessoa pediu para voltar, **a frase
  original** (`NOT NULL`), o motivo e o desfecho.
- **`fn_resolver_prazo_retomada`** converte o inequívoco e **recusa o vago**
  ("depois das férias" → NULL, balde "sem data"). Aceita número por extenso,
  porque é assim que a pessoa fala.
- **Dois caminhos de escrita, UMA regra:** `fn_upsert_retomada` é o núcleo;
  a consultora entra por `mila_registrar_retomada_v1` e o extrator por
  `registrar_retomada_de_conversa_v1`. ⚠️ **O modelo não sobrescreve registro
  humano** — quem falou com o cliente sabe mais que o LLM lendo depois.
- **Extrator semântico** (`extrair-sinais-conversa`, prompt **v5-r1**): tipo novo
  `retomar_depois` + campo `prazo_texto`. ⚠️ `retomar_depois` **não vira sinal
  do radar** de propósito — sinal significa "aja agora", e uma retomada de
  janeiro ficaria meses na pauta. Roteia para `lead_retomada`.
  ⚠️ **Só vale para LEAD**: aluno adiando é assunto de retenção.
- **Proatividade:** `mila_briefing_manha_v1` ganhou `retomar_hoje` lendo a fonte
  única, e o molde da manhã tem o bloco 🔄 RETOMAR HOJE com a frase em itálico.
- **Medir:** `desfecho_retomada` + `vw_retomada_eficacia_v1` (ainda zerada — é o
  ponto: nasce medindo, não vira retrofit).
- Travado por `tests/retomadaBumerangue.test.mjs` (8 casos, função real via
  esbuild). Ensaio contra produção achou a 1ª retomada real na primeira
  execução: *"Semana que vem volto aí pra fazer minha matrícula."*

## 🔴 ONDE PARAMOS — 05/09/2026, fim da tarde

**As quatro camadas estão de pé nos DOIS agentes.** O que falta não é camada: é
conteúdo (base de conhecimento), decisão sua, e os 7 itens de construção abaixo.

### 12 PRs mergeados em 05/09

| PR | o quê |
|---|---|
| #331 | matrícula do comercial replica o predicado do relatório (CG 24 · REC 23 · BAR 19) |
| #332 | **2º andar do comercial** — padrões → aprendizados → estratégia |
| #333 | mapa do banco regenerado |
| #334 | **recado da líder + o recado ganha volta** |
| #335 | metodologia das 4 camadas + base de conhecimento (handoff) |
| #336 | **agenda de retomada (bumerangue)** |
| #337 | o bumerangue passa a nascer da conversa |
| #338 | amostra pareada + estudo do atendimento |
| #339 | o estudo derrubou o sinal S1 — não reconstruir |
| #340 | **pesquisa do atendimento no WhatsApp** — 3 estudos + 1 achado grave |
| #341 | marcar o lead sintético e devolver sentido ao indicador |
| #342 | corrige a explicação do lead sintético |

### Estado dos crons (conferido 13:34 BRT de 05/09)

- 08:30 briefing — saiu para as três; a Dai respondeu e a Mila respondeu de volta
- 09h–18h cutucada — rodou; "nada novo, tudo já cutucado hoje"
- 18:30 fechamento · 19:10 snapshot de atendimento (2º ponto da série)
- vigia a cada 5 min — "nada a reportar" o dia inteiro

### Decisões que são do Luciano — não construir sem ele

1. **Base de conhecimento** — ele está curando. Bloco 1 (bumerangue) pronto e bom;
   faltam os outros 7 da lista do §5.3 do handoff de metodologia.
2. **Denominador do funil** — tirar ou não o lead sintético de `leads_novos`.
   A view `vw_leads_sinteticos_por_mes` mede; o peso caiu de 10,3% (jun) para
   1,1% (ago). **Recomendação: esperar mais um mês.**
3. **Horários dos crons** — 8:30 / 9-18h / 18:30 são escolha minha, não da equipe.
4. **Cadastro da Kriss** — governança diz `lider` sem unidade (as três); o Luciano
   se refere a ela como **gerente da Barra**. Resolver antes da call.
5. **Experimento do bot** — uma unidade, um mês, humano entrando em toda conversa
   que o bot não converteu em 24h. É a ÚNICA forma de responder "manter a Mila SDR".

### Os 7 itens de construção, na ordem que eu faria

1. **Provocação de início de mês com a Krissya** — campanha, corridinha, condição
   financeira, ação de indicação. ⏰ **É a única com prazo correndo**: setembro já
   está no dia 5 sem nada definido.
2. **Cashback de indicação** — R$ 50 por indicação matriculada e o banco não guarda
   quem indicou (~R$ 4.000 em 6 meses sem rastro). Conecta com o PC1.
3. **Professor na experimental** — quem converte mais e menos, com denominador honesto.
4. **Criativo e mídia falando sozinhos com a Krissya** — dados prontos, falta a voz.
5. **Remedir os padrões** — todos de 03/09, sem cron que recalcule. Mitigado pelo
   aviso de idade (`envelhecido` > 45 dias).
6. **`minha_pauta` citar o aprendizado** — a cutucada cita, a pauta não.
7. **Elo estratégia→ação** — hoje diz "74 pessoas na Barra" e não emenda "quer que
   eu monte a lista?".

### 🚫 Descartado hoje — não ressuscitar

- **O avaliador de atendimento com a régua S1.** Medido em amostra pareada:
  **inverte**. Ver [[sinal-bumerangue-s1-nao-separa]].
- **Raspar YouTube/blog para a base de conhecimento.** Curadoria, não volume.

### Onde estão os materiais

| | |
|---|---|
| pesquisa do atendimento (para a call) | `docs/handoffs/2026-09-05-pesquisa-atendimento-comercial-whatsapp.md` |
| metodologia + base de conhecimento | `docs/handoffs/2026-09-05-mila-comercial-metodologia-e-base-de-conhecimento.md` |
| 4 conversas reais (transcrição) | `.local/conversas-comerciais-para-base-de-conhecimento.md` |
| planilhas dos 3 estudos | `.local/estudos/` (cada uma com cópia `SEM-PII`) |

---

## Cicatrizes (não repetir)

1. 🔴 **O Hermes NÃO propaga env do processo para o MCP.** Só o bloco `env:` do
   `mcp_servers` chega, e ele interpola. Dois incidentes em 04/09.
2. 🔴 **Arquivo de segredo sobrescreve o `env:` do perfil** (o `source` é
   incondicional). O wrapper captura antes e restaura depois.
3. 🔴 **Validar no caminho REAL, não no wrapper.**
4. 🔴 **Antes de liberar perfil Hermes para gente:** `hermes chat -q "ok"` com `rc=0`.
5. ⚠️ **Formato é molde, não instrução.**
6. ⚠️ **O proxy do Chatwoot devolve 403 sem User-Agent explícito.**
7. ⚠️ **Não inventar regra quando o relatório já tem a canônica.**
8. 🔴 **Tool nova não basta — tem que ENSINAR quando usar.** No 1º ensaio de
   05/09 a Mila tinha `o_que_aprendemos` disponível e mesmo assim respondeu
   *"por que ligar? porque já mostrou interesse real"* — intuição de vendas, zero
   medição. Só depois da seção "Quando existe medição, eu não opino" na SKILL ela
   passou a citar *"em 4.247 leads, quem faz o experimental fecha 40–50%"*.
9. ⚠️ **Expressão de `select` tem de bater LITERALMENTE com a do `group by`.**
   `coalesce(x,'')` no select e `coalesce(x,'(sem dono)')` no group by = 42803.
10. ⚠️ **`automacao_log.aluno_nome` é NOT NULL** — log sem rótulo derruba a função
    DEPOIS de gravar, e o snapshot volta atrás em silêncio.
11. ⚠️ **Somar as unidades ANTES de montar a série por pessoa.** A Vitória tem
    linha em CG e no Recreio; sem isso a líder leria "1 esperando" onde são 14.

---

## Como testar

```bash
sudo -u mila /usr/bin/python3 /home/mila/.openclaw/workspace/scripts/mila-shadow.py --listar
sudo -u mila /usr/bin/python3 /home/mila/.openclaw/workspace/scripts/mila-shadow.py
```

14 cenários no caminho real, com 3 novos do 2º andar: `padrao-porque`,
`onde-focar` e **`padrao-gestao-nao-vaza`** (consultora pedindo nome de quem está
devendo resposta — a Mila não pode entregar o P7).

⚠️ Roda no perfil `mila-shadow`, que tem `MILA_GESTAO_DRY_RUN: "1"` no config.
**Nunca apontar o shadow para o perfil de produção.**

Handshake de tools por pessoa (prova o gate no caminho real):

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize",...}\n...\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' \
| MILA_SOLICITANTE_TELEFONE=<tel> MILA_CARIMBO_OBRIGATORIO=1 MILA_GESTAO_DRY_RUN=1 \
  /home/mila/.openclaw/workspace/scripts/mila-gestao-tools-mcp.sh
```

---

## O fio da conversa

A consultora **não precisa citar/marcar** a mensagem da Mila: a sessão é por
pessoa (`chatwoot-consultor-v2-<telefone>`), então o histórico já é o fio.
A citação é característica da **Maria**, que trabalha em grupo com várias
propostas abertas ao mesmo tempo. `recado_pendente` só entra quando o fio se
perde de verdade.

---

## 06/09/2026 — base de conhecimento comercial v1 chegou (PR #348, **draft**)

O Alf entregou o pacote curado: **11 blocos**, índice com plano de carga em 6
passos, uma seção de SKILL e uma estratégia candidata. Fontes versionadas em
`docs/base-conhecimento-comercial/`.

**Passos 1 e 2 escritos e NÃO aplicados** — o combinado é ele revisar o diff
antes do `apply_migration`. PR em draft por isso.

### Conflitos entre os blocos e o que existe hoje

| citado no bloco | estado real |
|---|---|
| `leads.indicado_por` (bloco 2) | 🔴 **não existe** — já está na tabela de alicerce do índice |
| `lead_retomada` "em construção" (bloco 5) | ✅ **já existe** desde 05/09 (PR #336) — o índice está defasado; o bloco 5 pode rodar hoje |
| `matriculas_comerciais_v1`, `mila_atendimento_serie_v1`, `radar_publico_reativacao_v1` | ✅ existem |
| tools `onde_focar`, `trafego_por_criativo` | ✅ existem (das 29 do MCP) |
| `origem_registro='sync_aluno'` (blocos 6, 7, 11) | ✅ existe (PR #341) |
| `radar_estrategias.evidencia_eficacia` (o laço de medir) | ⚠️ coluna existe e está **vazia nas 14 estratégias** |
| PC1 "4.247 leads" | ✅ confere (`radar_padroes.amostra_n` = 4247), medido 03/09 |
| checkpoint em `docs/superpowers/specs/…` | ⚠️ o arquivo real é `docs/handoffs/2026-09-04-mila-gestao-checkpoint.md` |

**Conflito que a carga criaria e foi fechado no mesmo PR:** a subaba Conhecimento
lista a tabela inteira sem filtro — 4 blocos virariam 15, misturando script de
bot com material de liderança no mesmo editor. Passou a filtrar `publico='lead'`.
⚠️ Deploy: **migration antes do front**.

### Pendências do índice que o banco respondeu

**#4 — corridinha de agosto: RESPONDIDA pelo Alf.** Era **por consultora**, e a
meta era **31**. Agosto fechou, na medida canônica (`matriculas_comerciais_v1`):
**Barra 19 · Recreio 23 · Campo Grande 24**. **Ninguém bateu.** Fim.

⚠️ **Cicatriz de método, minha, em 06/09:** ao ver que nenhuma unidade chegava a
31, saí procurando uma contagem alternativa que produzisse 31 — e achei uma (CG
canônico + segundo curso = 31), tratando a coincidência como explicação. Isso é
**ajustar a régua ao resultado**. O Alf cortou na hora: a medida canônica está
certa e ninguém ganhou. Quando um número esperado não aparece, a primeira
hipótese é que **ele não aconteceu**, não que a métrica é outra.

**#5 — janela de maturação da coorte de mídia.** Convertidos dos últimos 6 meses,
dias entre lead e matrícula: **Instagram (n=65) mediana 10 dias, 84,6% em 30 dias**,
89,2% em 45, 92,3% em 60 · Google (n=48) 85,4% em 30 · Indicação (n=56) 76,8% em
30, e é a mais lenta na cauda (p90 = 63 dias). **Os 30 dias provisórios seguram
~85% da coorte**; 45 dias levaria a 89% ao custo de uma leitura mais lenta.
⚠️ Só os atribuídos a anúncio Meta (`meta_ad_source_id`) são **n=16** — pequeno
demais para decidir sozinho; por isso a leitura é por canal.

**#9 — as conversas de uma mensagem.** Remedidas do zero (o CSV de 05/09 saiu
anonimizado da extração, então o telefone não existia mais para cruzar):
**215 conversas em 900, e 1 converteu (0,5%)**.
🔴 **Elas não são perguntas que o bot não soube responder — são cliques.**
**90 (42%)** são exatamente *"Olá! Posso ter mais informações sobre isso?"*, o
texto que o **Click-to-WhatsApp da Meta preenche sozinho**; outras **45 (21%)**
são *"Quero informações das aulas de música na LA Music Kids &lt;unidade&gt;"*, outro
texto pré-preenchido. **~63% do que a equipe vê como "conversa morta" é template
automático, não alguém digitando.** Bate com o resto: Instagram é 43,7% delas, e
**21,4% chegaram entre meia-noite e 8h**. Por unidade: **Recreio 48,8%**, Barra
27,0%, CG 24,2%. Amostra (sem telefone, sem nome) em
`.local/estudos/conversas-uma-mensagem-SEM-PII.csv`.

### Continua com o Alf e a Krissya
LA Talent em vigor · validade do valor de fechamento · quem escreve a devolutiva
· Krissya líder das 3 ou gerente da Barra · e o passo 0 (a Krissya ler os 11).
