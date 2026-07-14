/**
 * Cliente Chatwoot CRM — buscar/criar contatos, conversas e notas.
 */

export interface ChatwootConfig {
  apiUrl: string
  apiToken: string
  accountId: string
}

interface ChatwootContact {
  id: number
  name: string | null
  phone_number: string | null
}

interface ChatwootConversation {
  id: number
  inbox_id: number
  status: string
}

// ─── Contatos ─────────────────────────────────────────────────────────────────

export async function buscarContato(
  config: ChatwootConfig,
  telefone: string,
): Promise<ChatwootContact | null> {
  const url = `${config.apiUrl}/api/v1/accounts/${config.accountId}/contacts/search?q=${encodeURIComponent(telefone)}`
  const res = await fetch(url, { headers: { api_access_token: config.apiToken } })
  if (!res.ok) {
    console.error('Chatwoot buscarContato error:', res.status, await res.text())
    return null
  }
  const data = await res.json()
  const contatos: ChatwootContact[] = data.payload ?? []
  return contatos.find(c => c.phone_number?.replace(/\D/g, '').includes(telefone.replace(/\D/g, ''))) ?? null
}

export async function criarContato(
  config: ChatwootConfig,
  telefone: string,
  nome?: string,
): Promise<ChatwootContact> {
  const url = `${config.apiUrl}/api/v1/accounts/${config.accountId}/contacts`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', api_access_token: config.apiToken },
    body: JSON.stringify({ name: nome || telefone, phone_number: `+${telefone.replace(/\D/g, '')}` }),
  })
  if (!res.ok) throw new Error(`Chatwoot criarContato failed: ${res.status}`)
  const data = await res.json()
  return data.payload?.contact ?? data.payload ?? data
}

// ─── Conversas ────────────────────────────────────────────────────────────────

export async function criarConversa(
  config: ChatwootConfig,
  contatoId: number,
  inboxId: string,
): Promise<ChatwootConversation> {
  const url = `${config.apiUrl}/api/v1/accounts/${config.accountId}/conversations`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', api_access_token: config.apiToken },
    body: JSON.stringify({ contact_id: contatoId, inbox_id: parseInt(inboxId, 10), status: 'open' }),
  })
  if (!res.ok) throw new Error(`Chatwoot criarConversa failed: ${res.status}`)
  return await res.json()
}

// ─── Mensagens ────────────────────────────────────────────────────────────────

export async function enviarNotaPrivada(
  config: ChatwootConfig,
  conversaId: number,
  conteudo: string,
): Promise<void> {
  const url = `${config.apiUrl}/api/v1/accounts/${config.accountId}/conversations/${conversaId}/messages`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', api_access_token: config.apiToken },
    body: JSON.stringify({ content: conteudo, private: true, message_type: 'outgoing' }),
  })
  if (!res.ok) console.error('Chatwoot enviarNotaPrivada error:', res.status, await res.text())
}

export async function enviarMensagem(
  config: ChatwootConfig,
  conversaId: number,
  conteudo: string,
): Promise<void> {
  const url = `${config.apiUrl}/api/v1/accounts/${config.accountId}/conversations/${conversaId}/messages`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', api_access_token: config.apiToken },
    body: JSON.stringify({ content: conteudo, message_type: 'outgoing' }),
  })
  if (!res.ok) console.error('Chatwoot enviarMensagem error:', res.status, await res.text())
}

// ─── Labels ──────────────────────────────────────────────────────────────────

export async function buscarLabelsContato(config: ChatwootConfig, contactId: number): Promise<string[]> {
  const url = `${config.apiUrl}/api/v1/accounts/${config.accountId}/contacts/${contactId}/labels`
  try {
    const res = await fetch(url, { headers: { api_access_token: config.apiToken } })
    if (!res.ok) return []
    const data = await res.json()
    if (Array.isArray(data)) return data
    if (data.payload && Array.isArray(data.payload)) return data.payload
    return data.labels ?? []
  } catch { return [] }
}

export async function atualizarLabelsContato(config: ChatwootConfig, contactId: number, labels: string[]): Promise<void> {
  const url = `${config.apiUrl}/api/v1/accounts/${config.accountId}/contacts/${contactId}/labels`
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', api_access_token: config.apiToken },
    body: JSON.stringify({ labels }),
  })
}

export async function buscarLabelsConversa(config: ChatwootConfig, conversationId: number): Promise<string[]> {
  const url = `${config.apiUrl}/api/v1/accounts/${config.accountId}/conversations/${conversationId}`
  try {
    const res = await fetch(url, { headers: { api_access_token: config.apiToken } })
    if (!res.ok) return []
    const data = await res.json()
    return data.labels ?? data.payload?.labels ?? []
  } catch { return [] }
}

export async function atualizarLabelsConversa(config: ChatwootConfig, conversationId: number, labels: string[]): Promise<void> {
  const url = `${config.apiUrl}/api/v1/accounts/${config.accountId}/conversations/${conversationId}/labels`
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', api_access_token: config.apiToken },
    body: JSON.stringify({ labels }),
  })
}

// ─── Status ──────────────────────────────────────────────────────────────────

export async function toggleStatusConversa(config: ChatwootConfig, conversationId: number, status: 'open' | 'resolved' | 'pending'): Promise<void> {
  const url = `${config.apiUrl}/api/v1/accounts/${config.accountId}/conversations/${conversationId}/toggle_status`
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', api_access_token: config.apiToken },
    body: JSON.stringify({ status }),
  })
}

// ─── Helper ───────────────────────────────────────────────────────────────────

export async function garantirContatoEConversa(
  config: ChatwootConfig,
  telefone: string,
  nome: string | undefined,
  inboxId: string,
): Promise<{ contatoId: number; conversaId: number }> {
  let contato = await buscarContato(config, telefone)
  if (!contato) contato = await criarContato(config, telefone, nome)
  const conversa = await criarConversa(config, contato.id, inboxId)
  return { contatoId: contato.id, conversaId: conversa.id }
}
