/**
 * WhatsApp Cloud API client (Meta Graph API v21.0)
 * Usado pelo módulo de Campanhas — separado do UAZAPI existente.
 */

import { createServiceClient } from './supabase-client.ts'

const GRAPH_API = 'https://graph.facebook.com/v21.0'

export interface MetaNumeroConfig {
  phone_number_id: string
  access_token: string
}

// ─── Envio de mensagens ───────────────────────────────────────────────────────

export async function enviarMensagemTexto(config: MetaNumeroConfig, para: string, texto: string) {
  return enviarWhatsApp(config, {
    messaging_product: 'whatsapp',
    to: para,
    type: 'text',
    text: { body: texto },
  })
}

export async function enviarMensagemTemplate(
  config: MetaNumeroConfig,
  para: string,
  nomeTemplate: string,
  idioma: string,
  componentes?: any[],
) {
  const body: any = {
    messaging_product: 'whatsapp',
    to: para,
    type: 'template',
    template: {
      name: nomeTemplate,
      language: { code: idioma },
    },
  }
  if (componentes?.length) {
    body.template.components = componentes
  }
  return enviarWhatsApp(config, body)
}

export async function enviarMensagemMedia(
  config: MetaNumeroConfig,
  para: string,
  tipoMedia: 'image' | 'video' | 'audio' | 'document',
  mediaUrl: string,
  legenda?: string,
  filename?: string,
) {
  if (tipoMedia === 'audio') {
    return enviarAudioViaUpload(config, para, mediaUrl)
  }

  const mediaObj: any = { link: mediaUrl }
  if (legenda) mediaObj.caption = legenda
  if (filename) mediaObj.filename = filename

  return enviarWhatsApp(config, {
    messaging_product: 'whatsapp',
    to: para,
    type: tipoMedia,
    [tipoMedia]: mediaObj,
  })
}

async function enviarAudioViaUpload(config: MetaNumeroConfig, para: string, mediaUrl: string) {
  const downloadRes = await fetch(mediaUrl)
  if (!downloadRes.ok) throw new Error(`Falha ao baixar áudio: ${downloadRes.status}`)
  const audioBytes = await downloadRes.arrayBuffer()

  const formData = new FormData()
  formData.append('file', new Blob([audioBytes], { type: 'audio/ogg' }), 'audio.ogg')
  formData.append('type', 'audio/ogg')
  formData.append('messaging_product', 'whatsapp')

  const uploadRes = await fetch(`${GRAPH_API}/${config.phone_number_id}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.access_token}` },
    body: formData,
  })
  const uploadData = await uploadRes.json()
  if (!uploadRes.ok) throw new Error(uploadData.error?.message ?? `Upload de mídia falhou: ${uploadRes.status}`)

  return enviarWhatsApp(config, {
    messaging_product: 'whatsapp',
    to: para,
    type: 'audio',
    audio: { id: uploadData.id },
  })
}

// ─── Mensagens interativas (botões e listas) ─────────────────────────────────

export interface BotaoResposta {
  id: string
  title: string // máx 20 chars
}

export interface SecaoLista {
  title: string
  rows: { id: string; title: string; description?: string }[]
}

export async function enviarMensagemBotoes(
  config: MetaNumeroConfig,
  para: string,
  corpo: string,
  botoes: BotaoResposta[],
  header?: string,
  footer?: string,
) {
  const interactive: any = {
    type: 'button',
    body: { text: corpo },
    action: {
      buttons: botoes.slice(0, 3).map(b => ({
        type: 'reply',
        reply: { id: b.id, title: b.title.slice(0, 20) },
      })),
    },
  }
  if (header) interactive.header = { type: 'text', text: header }
  if (footer) interactive.footer = { text: footer }

  return enviarWhatsApp(config, {
    messaging_product: 'whatsapp',
    to: para,
    type: 'interactive',
    interactive,
  })
}

export async function enviarMensagemLista(
  config: MetaNumeroConfig,
  para: string,
  corpo: string,
  botaoTexto: string,
  secoes: SecaoLista[],
  header?: string,
  footer?: string,
) {
  const interactive: any = {
    type: 'list',
    body: { text: corpo },
    action: {
      button: botaoTexto.slice(0, 20),
      sections: secoes.map(s => ({
        title: s.title,
        rows: s.rows.slice(0, 10).map(r => ({
          id: r.id, title: r.title.slice(0, 24),
          ...(r.description ? { description: r.description.slice(0, 72) } : {}),
        })),
      })),
    },
  }
  if (header) interactive.header = { type: 'text', text: header }
  if (footer) interactive.footer = { text: footer }

  return enviarWhatsApp(config, {
    messaging_product: 'whatsapp',
    to: para,
    type: 'interactive',
    interactive,
  })
}

export async function enviarReacao(
  config: MetaNumeroConfig,
  para: string,
  messageId: string,
  emoji: string,
) {
  return enviarWhatsApp(config, {
    messaging_product: 'whatsapp',
    to: para,
    type: 'reaction',
    reaction: { message_id: messageId, emoji },
  })
}

export async function marcarComoLida(config: MetaNumeroConfig, messageId: string) {
  return enviarWhatsApp(config, {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  })
}

// ─── Media ────────────────────────────────────────────────────────────────────

export async function baixarMedia(
  accessToken: string,
  mediaId: string,
): Promise<{ url: string; mime_type: string }> {
  const res = await fetch(`${GRAPH_API}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Falha ao obter URL da mídia: ${res.statusText}`)
  const data = await res.json()
  return { url: data.url, mime_type: data.mime_type }
}

export async function baixarEArmazenarMedia(
  accessToken: string,
  mediaId: string,
  unidadeId: string,
  tipoMensagem: string,
): Promise<{ publicUrl: string; mimeType: string }> {
  const { url: tempUrl, mime_type } = await baixarMedia(accessToken, mediaId)

  const mediaRes = await fetch(tempUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!mediaRes.ok) throw new Error(`Falha ao baixar mídia: ${mediaRes.statusText}`)
  const arrayBuffer = await mediaRes.arrayBuffer()

  const ext = extensaoDeMime(mime_type)
  const filePath = `${unidadeId}/${tipoMensagem}/${crypto.randomUUID()}.${ext}`

  const supabase = createServiceClient()
  const { error: uploadErr } = await supabase.storage
    .from('whatsapp-media-campanhas')
    .upload(filePath, arrayBuffer, { contentType: mime_type, upsert: false })

  if (uploadErr) throw new Error(`Falha ao fazer upload: ${uploadErr.message}`)

  const { data: { publicUrl } } = supabase.storage
    .from('whatsapp-media-campanhas')
    .getPublicUrl(filePath)

  return { publicUrl, mimeType: mime_type }
}

function extensaoDeMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'video/3gpp': '3gp',
    'audio/aac': 'aac', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/amr': 'amr', 'audio/ogg': 'ogg',
    'application/pdf': 'pdf', 'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  }
  return map[mime] ?? 'bin'
}

// ─── Templates ────────────────────────────────────────────────────────────────

export async function buscarTemplates(accessToken: string, wabaId: string) {
  const url = `${GRAPH_API}/${wabaId}/message_templates?limit=100`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`Falha ao buscar templates: ${res.statusText}`)
  const data = await res.json()
  return data.data ?? []
}

// ─── Core ─────────────────────────────────────────────────────────────────────

async function enviarWhatsApp(config: MetaNumeroConfig, body: any) {
  const url = `${GRAPH_API}/${config.phone_number_id}/messages`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.access_token}`,
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  if (!res.ok) {
    console.error('WhatsApp API error:', JSON.stringify(data))
    throw new Error(data.error?.message ?? `WhatsApp API error: ${res.status}`)
  }
  return data
}
