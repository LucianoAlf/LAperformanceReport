/** Tipos compartilhados do módulo de Campanhas WhatsApp */

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

export interface TransferUnit {
  name: string
  inbox_id: string
  consultant_phone?: string
  consultant_name?: string
}

export interface TransferToolConfig {
  units?: TransferUnit[]
  transfer_message?: string
  recontact_message?: string
  chatwoot_api_url?: string
  chatwoot_api_token?: string
  chatwoot_account_id?: string
}
