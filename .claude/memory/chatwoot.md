# Chatwoot — LA Music (Documentação)

> 🎯 **Fonte de verdade do atendimento comercial = Chatwoot** (confirmado Hugo, 2026-07-12).
> As tabelas `crm_mensagens`/`crm_conversas` (inbox UAZAPI interno) são **legado/residual** —
> 12 conversas na história inteira, ~6 mensagens de saída/mês, vs **507 conversas/mês no Chatwoot**.
> **NÃO** construir KPI de atendimento (tempo de resposta, volume, etc.) sobre `crm_mensagens`:
> daria estatística de tabela vazia. O **tempo médio de resposta** sai dos eventos **`reply_time`**
> do Chatwoot (pareamento entrada→resposta já pronto), por **mediana** — não de RPC em SQL.
> **Implementado 2026-07-12** na edge `chatwoot-atendimento-insights` (v6, ver seção abaixo).

## Acesso

| Campo        | Valor                                              |
|--------------|----------------------------------------------------|
| URL (REST)   | https://crmchat.agenticflowio.com.br               |
| Account ID   | 5                                                  |
| API Token    | ‹token — ver Supabase secret, NÃO versionar (redigido 07/07, rotacionar no Chatwoot)› |
| Header auth  | `api_access_token: <token>`                        |

> ⚠️ **URL corrigida (2026-07-11):** o domínio real da API REST é `crmchat.agenticflowio.com.br`.
> O antigo `chatmusic.poliredeomnichat.com.br` (versões anteriores desta doc) retorna **404** — não usar.
> ⚠️ **Token de BOT vs usuário:** o token no `.mcp.json` do projeto (`Api-Access-Token` do MCP `mcp-hugo`)
> é um token de **bot** — funciona via gateway MCP, mas o Chatwoot rejeita bots em endpoints REST
> (`401 "Access to this endpoint is not authorized for bots"`), inclusive `/agents` e `/summary_reports/agent`.
> Para chamar a API REST direto (ex.: edge `chatwoot-atendimento-insights`) é preciso o `api_access_token`
> de um **usuário administrador** (Luciano id 5 / Anne id 32), obtido em Profile Settings → Access Token.

---

## Business Hours / Horário útil (config 2026-07-11)

Ativado `working_hours_enabled` + `timezone: America/Sao_Paulo` nos inboxes com unidade clara,
com os horários reais de `unidades.horario_funcionamento` (LAReport). **Não dispara mensagem**:
`out_of_office_message` está `null` e `greeting_enabled=false` em TODOS os inboxes (verificado) —
ativar horário só afeta cálculo de SLA/relatório, nada é enviado ao cliente.

| Inbox (id) | Unidade | Seg–Sex | Sáb | wh_on |
|---|---|---|---|---|
| 50 ADM Recreio, 168 Secretaria Recreio, 148 Mila_Recreio | Recreio | 08–21 | 08–16 | ✅ |
| 179 Secretaria Barra, 147 Mila_Barra | Barra | 09–20 | 08–16 | ✅ |
| 180 Secretaria CG, 155 Mila_CG | Campo Grande | 10–21 | 08–15 | ✅ |
| 198 Sol-Atendimento, 209 instagram-direct | (global, sem unidade) | — | — | ❌ desativado (decisão Hugo) |

> ⚠️ **Business hours do Chatwoot é FORWARD-ONLY.** O valor "em horário útil" é gravado no
> `reporting_events` no momento do evento, com base nas working hours daquele instante — **não
> recalcula retroativamente**. Dados de jun/início-jul (registrados sem horário) retornam `0` com
> `business_hours=true`. Por isso a edge `chatwoot-atendimento-insights` roda em **tempo corrido
> (24/7) por ora**; ligar `business_hours=true` (só adicionar `&business_hours=true` no GET do
> `summary_reports/agent` — é parâmetro de LEITURA, não envia nada) planejado para **~fim de julho/2026**,
> quando houver massa de dados novos coletados com horário ativo.

> **Tabela de inboxes abaixo está DESATUALIZADA** (IDs 13/14/15… não existem mais). IDs reais
> atuais: ver tabela de business hours acima + `Mila_*`/`LA_Secretaria_*`/`Sol-Atendimento`.

---

## Caixas de Entrada (Inboxes)

| ID  | Nome                            | Uso                          |
|-----|---------------------------------|------------------------------|
| 13  | Comercial CG                    | Leads Campo Grande           |
| 14  | Comercial Recreio               | Leads Recreio (SDR Mila)     |
| 15  | Comercial Barra                 | Leads Barra                  |
| 48  | ADM CG                          | Administrativo CG            |
| 50  | ADM Recreio                     | Administrativo Recreio       |
| 51  | Secretaria Barra                | Secretaria Barra             |
| 52  | Secretaria Recreio              | Secretaria Recreio           |
| 53  | Secretaria CG                   | Secretaria CG                |
| 54  | Caixa Teste                     | Testes                       |
| 59  | NotificaMe - LA MUSIC KIDS - Instagram | Instagram Kids        |

---

## Agentes

| ID  | Nome              | Email                            | Role          |
|-----|-------------------|----------------------------------|---------------|
| 5   | Luciano Alf       | lucianoalf.la@gmail.com          | administrator |
| 30  | Kailane Barbosa   | kailanecomercial.emla@gmail.com  | agent         |
| 31  | Clayton Queiroz   | claytonqueirozqueiroz@gmail.com  | agent         |
| 32  | Anne Krissya      | annecomercial.emla@gmail.com     | administrator |
| 33  | Vitória Santos    | comercialcg.emla@gmail.com       | agent (CG)    |
| 56  | Hugo Milesi       | hugogmilesi@gmail.com            | agent         |
| 79  | Jonathan Lima     | johnlamusic@gmail.com            | agent         |
| 80  | Arthur Côrtes     | arthuradmla@gmail.com            | agent (ADM)   |
| 81  | Daiana Amorim     | daianaamorim@outlook.com         | agent         |
| 82  | Gabriela Leal     | gabrielaleal.emla@gmail.com      | agent         |
| 83  | Fernanda Silva    | feerdasilvaa@gmail.com           | agent         |
| 84  | Eduarda Bonfim    | eduardadarochabonfim@gmail.com   | agent         |
| 85  | Beatriz Frossard  | beatriz.emla1@gmail.com          | agent         |
| 86  | Jeremias Júnior   | jerehjunior@gmail.com            | agent         |
| 87  | Ana Paula Alves   | anapaula.emla@gmail.com          | agent         |
| 88  | Fabi Valdevino    | gerencia.recreiola@gmail.com     | agent (Recreio) |
| 109 | Rayan Roger       | contato@musicleads.com.br        | agent         |
| 201 | jhonatan          | jhonatan.7274@gmail.com          | agent         |
| 232 | Andreza           | andrezaravini00@gmail.com        | agent         |

---

## Times (Teams)

| ID | Nome                 |
|----|----------------------|
| 14 | comercial            |
| 15 | administrativo       |
| 16 | sucesso do cliente   |

---

## Status de Conversa

- `open` — em atendimento
- `pending` — aguardando (bot/fila)
- `resolved` — resolvida/fechada
- `snoozed` — adiada

---

## Atributos Customizados

### Contato (`contact_attribute`)

| Chave                    | Nome                     | Tipo     | Notas                            |
|--------------------------|--------------------------|----------|----------------------------------|
| origem_do_contato        | Origem do Contato        | list     | Instagram, Google, Site, etc.    |
| instrumento_de_interesse | Instrumento de Interesse | text     | Livre                            |
| publico                  | Publico                  | list     | criança, adulto, adolescente     |
| skipevaluation           | Skip Evaluation          | checkbox | Pula avaliação CSAT              |
| skipgreetings            | Skip Greetings           | checkbox | Pula saudações automáticas       |
| skipagenttitle           | Skip Agent Title         | checkbox |                                  |
| skipcontact              | Skip Contact             | checkbox |                                  |
| skipaudiotranscript      | Skip Audio Transcript    | checkbox | Não transcreve áudio             |
| skip_responde_ia         | Skip Responde IA         | checkbox | IA não responde este contato     |
| skip_professor_ia        | Skip Professor IA        | checkbox | IA de professor não atua         |

### Conversa (`conversation_attribute`)

| Chave           | Nome               | Tipo     | Valores conhecidos         |
|-----------------|--------------------|----------|----------------------------|
| funil_de_leads  | Funil de Leads     | list     | "Novos Leads", ...         |
| typebot_session | TypeBot Session Id | text     | ID da sessão TypeBot       |
| typebot_status  | TypeBot Status     | text     | Estado do bot              |
| skipevaluation  | Skip Evaluation    | checkbox |                            |

---

## Labels Importantes

### Pipeline de leads
| Slug                   | ID  | Significado                        |
|------------------------|-----|------------------------------------|
| lead                   | 58  | É um lead                          |
| lead-em-atendimento    | 309 | Sendo atendido agora               |
| lead_atendido          | 828 | Já atendido                        |
| lead-antigo            | 308 | Lead de período anterior           |
| lead-ano-que-vem       | 307 | Quer para o próximo ano            |
| lead-volta-as-aulas    | 819 | Campanha volta às aulas 2026       |

### Experimental
| Slug                      | ID  |
|---------------------------|-----|
| experimental-marcada      | 72  |
| fez-aula-experimental     | 286 |
| faltou-experimental       | 73  |
| faltou-a-experimental     | 284 |
| fez-visita                | 287 |
| visita-marcada            | 403 |
| visitou-a-escola          | 404 |

### Resultado final
| Slug            | ID  |
|-----------------|-----|
| sem-interesse   | 75  |
| sem-resposta    | 74  |
| nao-respondeu   | 330 |
| fora-do-orcamento | 288 |
| mora-longe      | 313 |

### Origem do lead
| Slug             | ID  |
|------------------|-----|
| instagram        | 56  |
| site             | 76  |
| indicacao/indicado | 298/297 |
| google           | 291 |
| facebook         | 282 |
| whatsapp         | 836 |
| organico         | 812 |
| instagram-direct | 299 |

### Instrumento
`violao`, `guitarra`, `bateria`, `piano`, `teclado`, `canto`, `musicalizacao`,
`violino`, `flauta-transversal`, `ukulele`, `cavaquinho`, `contrabaixo`, `sax-t`,
`musicalizacao-infantil`, `musicalizacao-para-bebes`, `musicalizacao-preparatoria`,
`power-kids`, `circuito-musical`, `home-studio`, `teoria-musical`

### Público
`criança`, `adolescente`, `adulto`, `kids`, `bolsista`, `comunidade`, `colaborador`

### Unidade
| Slug    | ID  |
|---------|-----|
| cg      | 81  |
| recreio | 82  |
| barra   | 83  |

---

## Endpoints Principais

```
BASE = https://chatmusic.poliredeomnichat.com.br
ACCOUNT = 5
```

### Conversas
```
GET  /api/v1/accounts/5/conversations                     # lista (sort: last_activity_at desc)
GET  /api/v1/accounts/5/conversations/{id}                # conversa completa
POST /api/v1/accounts/5/conversations/filter              # filtro avançado (ver abaixo)
```

### Contatos
```
GET  /api/v1/accounts/5/contacts?page=N                   # lista
POST /api/v1/accounts/5/contacts/filter                   # filtro avançado
GET  /api/v1/accounts/5/contacts/{id}                     # contato
GET  /api/v1/accounts/5/contacts/{id}/conversations       # conversas do contato
```

### Metadados
```
GET /api/v1/accounts/5/inboxes
GET /api/v1/accounts/5/agents
GET /api/v1/accounts/5/labels
GET /api/v1/accounts/5/teams
GET /api/v1/accounts/5/custom_attribute_definitions?attribute_model=contact_attribute
GET /api/v1/accounts/5/custom_attribute_definitions?attribute_model=conversation_attribute
```

### Relatórios
```
GET /api/v2/accounts/5/reports/summary?since=<unix>&until=<unix>&type=account
# retorna: conversations_count, incoming_messages_count, outgoing_messages_count,
#          avg_first_response_time (seg), avg_resolution_time (seg),
#          resolutions_count, reply_time (seg)
GET /api/v2/accounts/5/summary_reports/agent?since=&until=   # por agente (JSON limpo)
GET /api/v2/accounts/5/summary_reports/inbox?since=&until=   # por caixa (mesma estrutura)
#   → id, conversations_count, resolved_conversations_count,
#     avg_resolution_time, avg_first_response_time, avg_reply_time (todos seg)
```

> ⚠️ **`summary_reports/*` INFLA os tempos — não usar para métrica de atendimento.** O `avg_*`
> é a média dos EVENTOS ocorridos no período: uma conversa criada há meses e respondida agora
> entra com 1ª resposta de centenas de horas. Comprovado (jul/2026): Vitória deu
> `avg_first_response_time` ~5 dias. `summary_reports/agent` também **ignora `inbox_id`**.
>
> ### 🏗️ Arquitetura SDR bot → humano (essencial pra entender a métrica)
> Os leads entram numa caixa (ex.: `Mila_CG` id 155) e o **bot SDR IA (Mila)** — um `agent_bot`
> do Chatwoot (Milla CG/Recreio/Barra etc.) — atende PRIMEIRO. Só quando escala é que um humano
> (consultor/SDR) assume. Consequências:
> - **`first_reply_created_at` só marca a 1ª msg de agente HUMANO** (`sender.type: user`); msgs do
>   bot e do "WhatsApp Device" (agent_bot) NÃO contam. Conversa 100% atendida pelo bot →
>   `first_reply_created_at = 0` (fica fora de qualquer mediana). ~80% das conversas ficam em 0.
> - **`created_at → first_reply` NÃO é o tempo do humano** — empacota junto a janela em que a Mila
>   segurou o lead + a madrugada. Ex. real (conv 17876): criada 00:18 BRT (Mila atende), handoff
>   ~10:55, Vitória responde 14:40 → `created→reply` = **14h22**, mas a espera real do humano foi
>   **3h45**.
>
> ### ✅ Métrica canônica (edge `chatwoot-atendimento-insights` v5+)
> Varre `conversations/filter` (conversas CRIADAS no período) e, para cada uma com resposta humana
> (`first_reply>0`), lê o **evento `first_response`** de
> `GET /conversations/{id}/reporting_events`. Esse evento mede **handoff → 1ª resposta humana**
> (`value` em seg), já descontando a janela do bot. Agrega por **MEDIANA**. Custo: **1 chamada
> reporting_events por conversa com resposta** (~20% do total; concorrência 12; ~20-25s/mês) → fetch
> lazy. Eventos com **`value` 0** (conversa iniciada pelo agente, sem espera do lead) ficam fora da
> mediana. **Efeito medido jul/2026:** Kailane 22h52→**6min** (janela do bot era o vilão); Vitória
> subiu p/ **~6,9h** (o que sobra são esperas reais, muitas na madrugada). Atribuição:
> agente=`assignee`, caixa=`inbox_id`, unidade=nome da caixa.
>
> ### ⏰ Off-hours ainda pesa — próximo passo
> Os tempos são 24/7 (relógio corrido). O evento traz `value_in_business_hours` (hoje **0** porque
> o horário comercial não está configurado no Chatwoot). **Próximo passo:** ligar business hours em
> todas as caixas (só métrica, `out_of_office_message: null` garante que nada dispara) e trocar
> `value` → `value_in_business_hours` na edge — aí Vitória/CG caem pro tempo real de resposta em
> horário útil. É forward-only (não recalcula histórico).
>
> ### Tempo médio de resposta (implementado 2026-07-12, edge v6)
> Mediana dos eventos **`reply_time`** (1 por turno lead→resposta, só de agente humano → filtra por
> `user_id` presente). Vem no **mesmo GET reporting_events** do first_response → **custo de API zero
> a mais**. Atribuído ao `assignee`/inbox da conversa. Campos no retorno: `tempoRespostaMedianaSeg`
> + `amostraTempoResposta` (nº de turnos). **Complementa** a 1ª resposta: first_response =
> velocidade de PEGAR o lead; reply_time = ritmo AO LONGO da conversa. Ex. jul/2026: Vitória 1ª
> resposta 7,4h (lenta pra pegar, madrugada) mas tempo de resposta 14min (ritmo rápido). Mesma
> pendência de off-hours (`value_in_business_hours`=0 até ligar horário comercial).
>
> ### Escopo + truncamento (v7, 2026-07-12)
> **Só caixas com unidade** (nome mapeia p/ CG/Recreio/Barra) entram na análise. As caixas órfãs —
> **Instagram (209, bot)** e **Sol-Atendimento (198, adm)** — ficam FORA de contagem, medianas e
> breakdown. Motivo: antes o `geral` (base das medianas do headline) somava as órfãs mas as
> contagens não → dois universos diferentes no "Consolidado". Agora `geral` = soma das unidades por
> construção. (Em jul/2026 o efeito era nulo: IG=40 e Sol=12 conversas, ambas com **0 resposta
> humana**, então nunca entravam nas medianas — mas fica blindado p/ quando isso mudar.) Verificado
> ao vivo p/ decidir o corte. A edge passou a devolver **`truncado:{conversas,eventos}`** (bateu em
> `MAX_PAGINAS`=1.500 / `MAX_EVENTOS`=600) e a sub-aba mostra banner de amostra parcial.
>
> ### Métricas fora por ora
> **Resolução** — objeto de conversa não expõe `resolved_at`; fora. Sub-aba mostra Volume + 1ª
> resposta (mediana) + tempo de resposta (mediana).

---

## Filtros (POST /filter)

Payload padrão:
```json
{
  "payload": [
    {
      "attribute_key": "created_at",
      "filter_operator": "is_greater_than",
      "values": ["2026-03-10"],
      "query_operator": "AND"
    },
    {
      "attribute_key": "inbox_id",
      "filter_operator": "equal_to",
      "values": [14],
      "query_operator": null
    }
  ]
}
```

### Operadores disponíveis
| Operator           | Uso                  |
|--------------------|----------------------|
| equal_to           | =                    |
| not_equal_to       | !=                   |
| is_greater_than    | > (datas e números)  |
| is_less_than       | < (datas e números)  |
| contains           | texto livre          |
| is_present         | campo preenchido     |
| is_not_present     | campo vazio          |

### Chaves filtrável em conversas
`created_at`, `inbox_id`, `status`, `assignee_id`, `labels`, `team_id`,
`conversation_language`, `priority`, `id`, `contact_name`, `phone_number`

### Chaves filtráveis em contatos
`created_at`, `phone_number`, `name`, `email`, `city`, `country`,
`id`, `last_activity_at`, `label`, `inbox_id`

---

## Regras Críticas de Uso

### 1. Lead = Conversa, NÃO contato
Um mesmo contato pode ter múltiplas conversas. Para contar leads únicos,
deduplicar por `meta.sender.id` (contact_id), usando a conversa mais antiga.

### 2. Timezone: Filtro em UTC, negócio em BRT (UTC-3)
O filtro `is_greater_than "2026-03-11"` compara pela **data UTC**.
- Para pegar "hoje em BRT": usar `is_greater_than "ontem"` e filtrar client-side por `created_at >= meia_noite_BRT`
- Ex: "hoje 11/03 BRT" → filtro `is_greater_than "2026-03-10"` + Python: `ct >= 1773198000`

```python
from datetime import datetime, timezone, timedelta
BRT = timezone(timedelta(hours=-3))
ts_hoje = int(datetime(2026, 3, 11, 0, 0, 0, tzinfo=BRT).timestamp())
# Filtro: is_greater_than "2026-03-10" → depois filtra ct >= ts_hoje
```

### 3. Ordenação padrão
- **Conversas** sem sort → `last_activity_at DESC` (mais recentemente ativas primeiro)
- **Contatos** com `sort=created_at` → ASCENDENTE (mais antigos primeiro, mesmo com `order=desc` o param pode ser ignorado)
- Para contatos recentes, usar filter API com `is_greater_than` em `created_at`

### 4. Paginação
- Cada página retorna 25 itens
- `meta.all_count` informa o total
- Paginar com `?page=N` incrementando até `len(acumulado) >= all_count`

### 5. Conversas com inbox_id misto
Uma conversa pertence a um único `inbox_id`, mas o contato pode ter `contact_inboxes`
com vários inboxes. Sempre filtrar conversas (não contatos) para análise de caixa.

---

## Estrutura de Conversa (campos-chave)

```json
{
  "id": 11323,
  "status": "open|pending|resolved|snoozed",
  "created_at": 1773247225,
  "last_activity_at": 1773256649,
  "first_reply_created_at": 1773248653,
  "inbox_id": 13,
  "labels": ["lead", "instagram", "cg", "criança"],
  "custom_attributes": {
    "funil_de_leads": "Novos Leads"
  },
  "priority": null,
  "meta": {
    "sender": {
      "id": 105068,
      "name": "Carol",
      "phone_number": "+5521974501574",
      "identifier": "5521974501574@s.whatsapp.net",
      "created_at": 1773247224
    },
    "assignee": { "id": 232, "name": "Andreza" },
    "channel": "Channel::Api",
    "whatsapp_bridge": true
  }
}
```

---

## Totais (referência em 11/03/2026)

| Métrica                   | Valor  |
|---------------------------|--------|
| Total de contatos         | ~45k+  |
| Total de conversas        | 11.157 |
| Conversas abertas         | 4.310  |
| Conversas não atribuídas  | 709    |

---

## Integração Técnica

- **Bridge**: poliredeomnichat.apibridge.top
- **Webhook saída**: poliredeomnichat.conector.top/webhook/from-chatwoot
- **Provedor WhatsApp**: `whatsapp_bridge: true` — usa bridge (não WABA oficial)
- **TypeBot**: integrado, controla fluxo via `typebot_session` e `typebot_status`
- **Bot AgentBot** (ID=9): "LA Music " — envia mensagens automáticas
