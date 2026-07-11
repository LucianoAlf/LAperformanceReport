# Chatwoot — LA Music (Documentação)

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
```

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
