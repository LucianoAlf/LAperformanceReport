/**
 * Tipos para tools dos agentes IA.
 */

export interface AgentToolParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description: string
  required: boolean
  enum?: string[]
}

export interface AgentToolDefinition {
  name: string
  description: string
  parameters: AgentToolParameter[]
  enabled: boolean
  config?: Record<string, unknown>
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface ToolResult {
  tool_call_id: string
  content: string
}

export interface AIResponse {
  type: 'text' | 'tool_calls'
  content: string | null
  tool_calls: ToolCall[] | null
}

// ─── Transfer tool types ──────────────────────────────────────────────────────

export interface TransferUnit {
  name: string
  inbox_id: string
  consultant_phone?: string
  consultant_name?: string
  quepasa_bot_token?: string
}

export interface TransferToolConfig {
  units?: TransferUnit[]
  chatwoot_api_url?: string
  chatwoot_api_token?: string
  chatwoot_account_id?: string
  quepasa_url?: string
  campanha_label?: string  // ex: "lead-volta-as-aulas-2026"
}

// ─── Built-in tools ───────────────────────────────────────────────────────────

export const BUILTIN_TOOLS: AgentToolDefinition[] = [
  {
    name: 'transfer',
    description: 'Transfere o lead para um consultor humano na unidade especificada. Colete antes: nome, unidade preferida, instrumento de interesse.',
    parameters: [
      { name: 'unit', type: 'string', description: 'Nome da unidade para transferir (ex: Campo Grande, Barra, Recreio)', required: true },
      { name: 'lead_name', type: 'string', description: 'Nome do lead', required: true },
      { name: 'summary', type: 'string', description: 'Resumo da conversa e dados coletados', required: false },
      { name: 'instrumento', type: 'string', description: 'Instrumento de interesse (ex: guitarra, piano, bateria)', required: false },
      { name: 'classificacao', type: 'string', description: 'Classificação do lead: quente, morno ou frio', required: false },
    ],
    enabled: true,
    config: {},
  },
  {
    name: 'think',
    description: 'Permite raciocinar internamente antes de responder ao usuário. Não visível ao usuário.',
    parameters: [
      { name: 'thought', type: 'string', description: 'Seu raciocínio interno', required: true },
    ],
    enabled: true,
  },
  {
    name: 'send_buttons',
    description: 'Envia uma mensagem com botões de resposta rápida via WhatsApp. Use quando fizer sentido dar opções claras ao lead (ex: "Quer agendar?", "Qual unidade?"). Máximo 3 botões, cada um com até 20 caracteres. IMPORTANTE: quando usar esta tool, NÃO envie texto adicional — a mensagem com botões já é a resposta.',
    parameters: [
      { name: 'body', type: 'string', description: 'Texto principal da mensagem (obrigatório)', required: true },
      { name: 'buttons', type: 'array', description: 'Array de strings com os textos dos botões (máx 3, cada um máx 20 chars). Ex: ["Quero agendar", "Tenho dúvidas", "Ver preços"]', required: true },
      { name: 'header', type: 'string', description: 'Texto do header (opcional, curto)', required: false },
      { name: 'footer', type: 'string', description: 'Texto do footer (opcional, discreto)', required: false },
    ],
    enabled: true,
  },
  {
    name: 'send_list',
    description: 'Envia uma mensagem com lista de opções (menu expandível) via WhatsApp. Use quando houver muitas opções (ex: lista de cursos, horários, unidades). Máximo 10 itens. IMPORTANTE: quando usar esta tool, NÃO envie texto adicional — a lista já é a resposta.',
    parameters: [
      { name: 'body', type: 'string', description: 'Texto principal explicando as opções', required: true },
      { name: 'button_text', type: 'string', description: 'Texto do botão que abre a lista (máx 20 chars). Ex: "Ver opções"', required: true },
      { name: 'items', type: 'array', description: 'Array de objetos {title, description?} com as opções. Ex: [{"title":"Guitarra","description":"Aulas individuais"},{"title":"Bateria"}]', required: true },
      { name: 'header', type: 'string', description: 'Texto do header (opcional)', required: false },
      { name: 'footer', type: 'string', description: 'Texto do footer (opcional)', required: false },
    ],
    enabled: true,
  },
]
