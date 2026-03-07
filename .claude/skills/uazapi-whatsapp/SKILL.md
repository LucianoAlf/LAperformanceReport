---
name: uazapi-whatsapp
description: "UAZAPI WhatsApp integration for LA Music. Covers API endpoints, webhook handling, message normalization, credential resolution, and WhatsApp caixas. Use PROACTIVELY when working with WhatsApp, UAZAPI, webhooks, or edge functions that send/receive messages."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
risk: unknown
source: project-specific
---

# UAZAPI WhatsApp Integration

Skill para integracoes WhatsApp via UAZAPI no projeto LA Music. Consulte ao trabalhar com envio/recebimento de mensagens, webhooks, edge functions de WhatsApp, ou tabela `whatsapp_caixas`.

## Arquivos-chave

| Arquivo | Descricao |
|---------|-----------|
| `supabase/functions/_shared/uazapi.ts` | Modulo compartilhado — resolve credenciais UAZAPI |
| `supabase/functions/webhook-whatsapp-inbox/index.ts` | Webhook principal — recebe mensagens + status |
| `supabase/functions/enviar-mensagem-lead/index.ts` | Envia mensagens para leads (CRM) |
| `supabase/functions/enviar-mensagem-admin/index.ts` | Envia mensagens para alunos (admin inbox) |
| `docs/uazapi-openapi-spec.yaml` | OpenAPI spec completa da UAZAPI |

## Autenticacao

Header simples em todas as requests:
```
token: {uazapi_token}
```

Credenciais armazenadas em `whatsapp_caixas` (uazapi_url + uazapi_token).

## Resolucao de Credenciais

Usar `getUazapiCredentials()` de `_shared/uazapi.ts`:

```typescript
import { getUazapiCredentials } from '../_shared/uazapi.ts';

const creds = await getUazapiCredentials(supabase, {
  caixaId: conversa.caixa_id,       // prioridade 1: ID exato
  funcao: 'administrativo',          // prioridade 2-3: por funcao
  unidadeId: conversa.unidade_id,    // combinado com funcao
});

const response = await fetch(`${creds.baseUrl}/endpoint`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', token: creds.token },
  body: JSON.stringify(payload),
});
```

**Prioridade**: caixaId exato > funcao+unidadeId > funcao only > qualquer caixa ativa

## WhatsApp Caixas

Tabela `whatsapp_caixas`:

| Campo | Tipo | Descricao |
|-------|------|-----------|
| id | number | PK |
| nome | string | Nome display (ex: "Sol Agente") |
| numero | string? | Numero WhatsApp |
| unidade_id | string? | FK para unidades (null = global) |
| uazapi_url | string | Base URL (ex: `https://lamusic.uazapi.com`) |
| uazapi_token | string | Token de autenticacao |
| funcao | enum | `agente` / `sistema` / `administrativo` / `ambos` |
| ativo | boolean | Se a caixa esta ativa |

**Funcoes**:
- `agente` — leads/pre-atendimento (CRM)
- `sistema` — mensagens automatizadas
- `administrativo` — comunicacao com alunos (admin inbox)
- `ambos` — agente + sistema

## API Endpoints

### Enviar Texto — `POST /send/text`
```json
{
  "number": "5521999999999",
  "text": "conteudo da mensagem",
  "delay": 2000,
  "readchat": true,
  "linkPreview": true,
  "replyid": "msg_id_opcional"
}
```

### Enviar Midia — `POST /send/media`
```json
{
  "number": "5521999999999",
  "file": "https://url.com/arquivo.jpg",
  "type": "image|ptt|video|document|sticker",
  "text": "legenda opcional",
  "delay": 2000,
  "readchat": true,
  "docName": "arquivo.pdf",
  "mimetype": "application/pdf"
}
```

**Mapeamento de tipos DB → UAZAPI**:
- `audio` → `ptt` (Push-to-Talk / mensagem de voz)
- `imagem` → `image`
- `video` → `video`
- `documento` → `document`
- `sticker` → `sticker`

### Reagir — `POST /message/react`
```json
{
  "number": "5521999999999@s.whatsapp.net",
  "text": "emoji",
  "id": "message_id"
}
```
Emoji vazio = remover reacao.

### Deletar — `POST /message/delete`
```json
{ "id": "message_id" }
```

### Editar — `POST /message/edit`
```json
{ "id": "message_id", "text": "novo conteudo" }
```

### Transcrever Audio — `POST /message/download`
```json
{
  "id": "message_id",
  "transcribe": true,
  "return_link": true,
  "generate_mp3": true,
  "openai_apikey": "sk-..."
}
```
Resposta: `{ transcription: "texto", fileURL: "https://..." }`

### Foto de Perfil — `POST /chat/details`
```json
{ "number": "5521999999999", "preview": false }
```
Resposta: `{ image: "url", imagePreview: "url_thumbnail", name: "...", isGroup: false }`

**IMPORTANTE**: O endpoint `/misc/getProfilePicUrl` NAO existe. Usar `/chat/details`.

## Webhook — Payload de Mensagens Recebidas

### Estrutura UAZAPI (raw)

```javascript
{
  message: {
    chatid: "5521999999999@s.whatsapp.net",
    messageid: "3EB0538DA65A...",
    fromMe: false,
    type: "text|media|reaction",
    messageType: "Conversation|ImageMessage|AudioMessage|StickerMessage|ReactionMessage",
    mediaType: "image|ptt|audio|video|document|sticker",
    text: "conteudo ou emoji",
    content: {
      URL: "https://...",       // URL da midia
      mimetype: "image/webp",
      PTT: true,                // para audio
      key: { ID: "msg_id" },   // para reacoes
      fileName: "doc.pdf"
    },
    reaction: "msg_id_reagida", // ID da msg quando eh reacao
    senderName: "Nome WhatsApp",
    messageTimestamp: 1234567890
  },
  owner: "5521966583325",
  EventType: "messages",
  instanceName: "Sol"
}
```

### Normalizacao (normalizeUazapiPayload)

Converte para formato interno (Baileys-like):

```javascript
{
  key: { remoteJid, fromMe, id },
  message: {
    conversation: "texto",
    imageMessage: { url, caption, mimetype },
    audioMessage: { url, mimetype, ptt },
    videoMessage: { url, caption, mimetype },
    documentMessage: { url, fileName, mimetype },
    stickerMessage: { url, mimetype },
    reactionMessage: { key: { id }, text: "emoji" }
  }
}
```

**Regras criticas na normalizacao**:
- Reacoes (`type === 'reaction'`): NAO capturar `msg.text` como `conversation` (senao emoji vira mensagem de texto)
- Stickers (`mediaType === 'sticker'`): criar `stickerMessage` com URL de `content.URL`

### Tipos de Mensagem (detectMessageType)

| Tipo DB | Campo no payload normalizado |
|---------|------------------------------|
| texto | conversation / extendedTextMessage |
| imagem | imageMessage |
| audio | audioMessage |
| video | videoMessage |
| documento | documentMessage |
| sticker | stickerMessage |
| localizacao | locationMessage |
| contato | contactMessage |

## Status de Entrega (messages_update)

Mapeamento UAZAPI → DB:

| UAZAPI | DB |
|--------|-----|
| 1 / SERVER_ACK | enviada |
| 2 / DELIVERY_ACK | entregue |
| 3 / READ | lida |
| 4 / PLAYED | lida |
| 5 / ERROR | erro |

Detectar status update: payload tem `status`/`ack` mas NAO tem `message`.

## Edge Functions que Usam UAZAPI

**Envio de mensagens:**
- `enviar-mensagem-lead` — texto/midia para leads
- `enviar-mensagem-admin` — texto/midia para alunos
- `project-alertas-whatsapp` — alertas de projetos
- `lojinha-enviar-comprovante` — comprovantes da lojinha
- `enviar-pesquisa-evasao` — pesquisas de evasao
- `relatorio-coordenacao-whatsapp` — relatorios de coordenacao
- `relatorio-admin-whatsapp` — relatorios administrativos
- `professor-360-whatsapp` — insights de professores

**Operacoes:**
- `reagir-mensagem` — adicionar/remover reacoes
- `deletar-mensagem-lead` — deletar mensagens
- `editar-mensagem-lead` — editar mensagens
- `transcrever-audio` — transcrever audio via OpenAI
- `buscar-foto-perfil` — buscar foto de perfil WhatsApp

**Webhooks:**
- `webhook-whatsapp-inbox` — recebe mensagens novas + status updates + reacoes

## Gotchas e Padroes

### Telefone
- Sempre armazenar com prefixo `55`: `5521999999999`
- UAZAPI retorna com sufixo: `5521999999999@s.whatsapp.net`
- Limpar: `phone.split('@')[0].replace(/\D/g, '')`
- Adicionar prefixo se ausente: `if (!phone.startsWith('55')) phone = '55' + phone`

### Message ID
- Resposta UAZAPI pode retornar ID em campos diferentes: `data.id`, `data.messageid`, `data.key?.id`
- Sempre extrair com fallback: `const msgId = data.id || data.messageid || data.key?.id`

### Reacoes (JSONB)
- Armazenadas como array em `reacoes`: `[{ emoji, de, timestamp }]`
- `de` = `'lead'` | `'operador'` | `'aluno'` | `'externo'`
- Para atualizar: filtrar por `de`, substituir/adicionar, salvar array inteiro

### Roteamento Admin vs CRM
- Verificar `funcao` da caixa para determinar tabela destino
- `administrativo` → `admin_conversas` / `admin_mensagens`
- `agente` → `crm_conversas` / `crm_mensagens`
- Reacoes devem ser tratadas ANTES do roteamento (buscam em ambas tabelas)

### Erro Comum: Endpoint Inexistente
- `/misc/getProfilePicUrl` NAO existe — usar `/chat/details`
- Sempre verificar em `docs/uazapi-openapi-spec.yaml` antes de usar endpoints

### Audio: PTT vs Audio
- Mensagem de voz (PTT) e audio regular sao tratados igual no DB (tipo `audio`)
- No envio: sempre usar `type: 'ptt'` para mensagens de voz
- No recebimento: `mediaType === 'ptt'` OU `mediaType === 'audio'` OU `messageType === 'AudioMessage'`
