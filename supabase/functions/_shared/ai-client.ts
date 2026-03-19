/**
 * Cliente de IA para os agentes — suporta OpenAI e Gemini.
 * Inclui transcrição de áudio via Whisper.
 */

import type { AgentToolDefinition, ToolCall, AIResponse } from './tool-types.ts'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls: OpenAIToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

interface OpenAIToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface AIConfig {
  provider: 'openai' | 'gemini'
  model: string
  apiKey: string
  temperature?: number
  maxTokens?: number
}

// ─── Entrada principal ────────────────────────────────────────────────────────

export async function chatCompletion(
  config: AIConfig,
  messages: ChatMessage[],
  tools?: AgentToolDefinition[],
): Promise<AIResponse> {
  const toolsAtivos = tools?.filter(t => t.enabled)
  if (config.provider === 'openai') {
    return openaiChat(config, messages, toolsAtivos)
  } else {
    return geminiChat(config, messages, toolsAtivos)
  }
}

// ─── OpenAI ───────────────────────────────────────────────────────────────────

function toOpenAITools(tools: AgentToolDefinition[]) {
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          t.parameters.map(p => [
            p.name,
            { type: p.type, description: p.description, ...(p.enum ? { enum: p.enum } : {}), ...(p.type === 'array' ? { items: { type: 'string' } } : {}) },
          ]),
        ),
        required: t.parameters.filter(p => p.required).map(p => p.name),
      },
    },
  }))
}

function serializarMensagensOpenAI(messages: ChatMessage[]): any[] {
  return messages.map(m => {
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.tool_call_id, content: m.content }
    if (m.role === 'assistant' && 'tool_calls' in m && m.tool_calls) {
      return { role: 'assistant', content: m.content, tool_calls: m.tool_calls }
    }
    return { role: m.role, content: m.content }
  })
}

async function openaiChat(
  config: AIConfig,
  messages: ChatMessage[],
  tools?: AgentToolDefinition[],
): Promise<AIResponse> {
  const body: any = {
    model: config.model,
    messages: serializarMensagensOpenAI(messages),
    temperature: config.temperature ?? 0.7,
    max_tokens: config.maxTokens ?? 1024,
  }

  if (tools && tools.length > 0) {
    body.tools = toOpenAITools(tools)
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message ?? 'OpenAI API error')

  const choice = data.choices[0]?.message
  if (!choice) throw new Error('Sem resposta da OpenAI')

  if (choice.tool_calls && choice.tool_calls.length > 0) {
    const toolCalls: ToolCall[] = choice.tool_calls.map((tc: any) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: parseJsonSeguro(tc.function.arguments),
    }))
    return { type: 'tool_calls', content: choice.content ?? null, tool_calls: toolCalls }
  }

  return { type: 'text', content: choice.content ?? '', tool_calls: null }
}

// ─── Gemini ───────────────────────────────────────────────────────────────────

function toGeminiTools(tools: AgentToolDefinition[]) {
  return [{
    functionDeclarations: tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: {
        type: 'OBJECT',
        properties: Object.fromEntries(
          t.parameters.map(p => [
            p.name,
            { type: p.type.toUpperCase(), description: p.description, ...(p.enum ? { enum: p.enum } : {}) },
          ]),
        ),
        required: t.parameters.filter(p => p.required).map(p => p.name),
      },
    })),
  }]
}

function serializarConteudosGemini(messages: ChatMessage[]): any[] {
  const contents: any[] = []
  for (const m of messages) {
    if (m.role === 'system') continue
    if (m.role === 'assistant' && 'tool_calls' in m && m.tool_calls) {
      contents.push({
        role: 'model',
        parts: m.tool_calls.map(tc => ({
          functionCall: { name: tc.function.name, args: parseJsonSeguro(tc.function.arguments) },
        })),
      })
    } else if (m.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: '', response: { content: m.content } } }],
      })
    } else if (m.role === 'assistant') {
      contents.push({ role: 'model', parts: [{ text: m.content }] })
    } else {
      contents.push({ role: 'user', parts: [{ text: m.content }] })
    }
  }
  return contents
}

async function geminiChat(
  config: AIConfig,
  messages: ChatMessage[],
  tools?: AgentToolDefinition[],
): Promise<AIResponse> {
  const systemMsg = messages.find(m => m.role === 'system')
  const body: any = {
    contents: serializarConteudosGemini(messages),
    generationConfig: { temperature: config.temperature ?? 0.7, maxOutputTokens: config.maxTokens ?? 1024 },
  }
  if (systemMsg) body.systemInstruction = { parts: [{ text: systemMsg.content }] }
  if (tools && tools.length > 0) body.tools = toGeminiTools(tools)

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message ?? 'Gemini API error')

  const parts = data.candidates?.[0]?.content?.parts
  if (!parts || parts.length === 0) return { type: 'text', content: '', tool_calls: null }

  const functionCalls = parts.filter((p: any) => p.functionCall)
  if (functionCalls.length > 0) {
    const toolCalls: ToolCall[] = functionCalls.map((p: any, i: number) => ({
      id: `gemini_tc_${Date.now()}_${i}`,
      name: p.functionCall.name,
      arguments: p.functionCall.args ?? {},
    }))
    return { type: 'tool_calls', content: null, tool_calls: toolCalls }
  }

  const text = parts.find((p: any) => p.text)?.text ?? ''
  return { type: 'text', content: text, tool_calls: null }
}

// ─── Transcrição de áudio ─────────────────────────────────────────────────────

export async function transcreverAudio(
  apiKey: string,
  audioUrl: string,
  accessToken: string,
): Promise<string> {
  const audioRes = await fetch(audioUrl, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!audioRes.ok) throw new Error('Falha ao baixar áudio para transcrição')
  const audioBlob = await audioRes.blob()

  const formData = new FormData()
  formData.append('file', audioBlob, 'audio.ogg')
  formData.append('model', 'whisper-1')
  formData.append('language', 'pt')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message ?? 'Whisper API error')
  return data.text ?? ''
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJsonSeguro(str: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof str === 'object') return str
  try { return JSON.parse(str) } catch { return {} }
}
