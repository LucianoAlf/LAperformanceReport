# LA Agents — Multi-Agent Framework + Sol (Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-agent framework on Node.js/TypeScript that runs as a Docker container on VPS banco.de.dados (72.60.15.4), with Sol as the first registered agent — handling WhatsApp conversations for student admin/financial support.

**Architecture:** Fastify webhook server receives UAZAPI messages, debounces via Redis, routes to the correct agent by webhook path. Each agent is a self-contained module (prompt + tools + crons) registered in a central registry. The LLM engine handles OpenAI function calling loops. All data lives in Supabase (existing tables for alunos/unidades/colaboradores + new sol_ tables).

**Tech Stack:** Node.js 20 LTS, TypeScript 5, Fastify, OpenAI SDK, @supabase/supabase-js, ioredis, node-cron, Docker

**Project location:** `C:\Users\hugog\OneDrive\Desktop\Projects\LA Music\la-agents\`

**VPS deploy:** `banco.de.dados` (72.60.15.4) — Docker container

---

## Scope

This plan covers **Phases 1-2** from the Sol proposta:
- Phase 1: Foundation (project, webhook, clients, debounce, Docker)
- Phase 2: Conversational agent (LLM engine, tools, memory, Sol registration)

Phases 3-6 (financial crons, presence, images, admin) will be **separate plans** built on top of this core.

---

## File Structure

```
la-agents/
├── src/
│   ├── index.ts                  ← Entry: start server + register agents + start crons
│   ├── config.ts                 ← Env vars with validation
│   │
│   ├── core/
│   │   ├── types.ts              ← AgentDefinition, Tool, Message, Config types
│   │   ├── registry.ts           ← Agent registry (register/get/list)
│   │   ├── engine.ts             ← LLM engine (OpenAI function calling loop)
│   │   ├── memory.ts             ← Conversation memory (load/save from Supabase)
│   │   ├── cron.ts               ← Cron scheduler wrapper (node-cron)
│   │   └── logger.ts             ← Structured logger (pino)
│   │
│   ├── channels/
│   │   ├── server.ts             ← Fastify server + webhook routes
│   │   ├── uazapi.ts             ← UAZAPI client (send text/media, download media)
│   │   ├── debounce.ts           ← Redis debounce (accumulate msgs, process after delay)
│   │   └── media.ts              ← Audio transcription (Whisper) + image download
│   │
│   ├── db/
│   │   ├── supabase.ts           ← Supabase service-role client
│   │   └── redis.ts              ← ioredis client
│   │
│   ├── shared/
│   │   └── phone.ts              ← Phone formatting (55-prefix, strip non-digits)
│   │
│   └── agents/
│       └── sol/
│           ├── index.ts           ← registerSol() — wires prompt + tools + config
│           ├── prompt.ts          ← System prompt (from sol_system_prompt_v1.md)
│           ├── tools/
│           │   ├── consultar-aluno.ts
│           │   ├── consultar-pagamentos.ts
│           │   ├── consultar-presenca.ts
│           │   ├── escalar-farmer.ts
│           │   └── index.ts       ← exports all tools as array
│           └── crons.ts           ← Placeholder for Phase 3+
│
├── tests/
│   ├── core/
│   │   ├── registry.test.ts
│   │   ├── engine.test.ts
│   │   └── memory.test.ts
│   ├── channels/
│   │   ├── debounce.test.ts
│   │   ├── uazapi.test.ts
│   │   └── server.test.ts
│   ├── shared/
│   │   └── phone.test.ts
│   └── agents/sol/
│       └── tools.test.ts
│
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example
└── .gitignore
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `la-agents/package.json`
- Create: `la-agents/tsconfig.json`
- Create: `la-agents/vitest.config.ts`
- Create: `la-agents/.env.example`
- Create: `la-agents/.gitignore`

- [ ] **Step 1: Create project directory and package.json**

```bash
cd "C:\Users\hugog\OneDrive\Desktop\Projects\LA Music"
mkdir la-agents && cd la-agents
```

```json
{
  "name": "la-agents",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.49.0",
    "fastify": "^5.3.0",
    "ioredis": "^5.6.0",
    "node-cron": "^3.0.3",
    "openai": "^4.85.0",
    "pino": "^9.6.0",
    "pino-pretty": "^13.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/node-cron": "^3.0.11",
    "tsx": "^4.19.0",
    "typescript": "^5.8.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "paths": {
      "@/*": ["./src/*"]
    },
    "baseUrl": "."
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 4: Create .env.example and .gitignore**

`.env.example`:
```env
# Supabase
SUPABASE_URL=https://ouqwbbermlzqqvtqwlul.supabase.co
SUPABASE_SERVICE_ROLE_KEY=

# OpenAI
OPENAI_API_KEY=

# Redis (same VPS)
REDIS_URL=redis://localhost:6379

# Server
PORT=3000
NODE_ENV=production

# Timezone
TZ=America/Sao_Paulo
```

`.gitignore`:
```
node_modules/
dist/
.env
*.log
```

- [ ] **Step 5: Install dependencies**

Run: `cd "C:/Users/hugog/OneDrive/Desktop/Projects/LA Music/la-agents" && npm install`
Expected: `node_modules/` created, no errors

- [ ] **Step 6: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold la-agents project with TypeScript, Fastify, OpenAI, Supabase"
```

---

## Task 2: Core Types

**Files:**
- Create: `src/core/types.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/core/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import type { AgentDefinition, AgentTool, IncomingMessage, ConversationState, AgentConfig } from '@/core/types'

describe('Core Types', () => {
  it('should allow creating a valid AgentDefinition', () => {
    const agent: AgentDefinition = {
      id: 'sol',
      name: 'Sol',
      description: 'Assistente de atendimento e sucesso do aluno',
      systemPrompt: 'Você é a Sol...',
      tools: [],
      crons: [],
      config: {
        model: 'gpt-4.1-mini',
        temperature: 0.7,
        maxTokens: 1024,
        maxToolRounds: 5,
        operatingHours: {
          weekday: { start: 8, end: 21 },
          saturday: { start: 8, end: 16 },
          sunday: null,
        },
      },
    }
    expect(agent.id).toBe('sol')
    expect(agent.config.maxToolRounds).toBe(5)
  })

  it('should allow creating a valid AgentTool', () => {
    const tool: AgentTool = {
      definition: {
        type: 'function' as const,
        function: {
          name: 'consultar_aluno',
          description: 'Busca dados do aluno',
          parameters: {
            type: 'object',
            properties: {
              telefone: { type: 'string', description: 'Telefone do aluno' },
            },
            required: ['telefone'],
          },
        },
      },
      handler: async (args) => JSON.stringify({ nome: 'Test' }),
    }
    expect(tool.definition.function.name).toBe('consultar_aluno')
  })

  it('should allow creating a valid IncomingMessage', () => {
    const msg: IncomingMessage = {
      phone: '5521999999999',
      type: 'text',
      content: 'Oi, preciso de ajuda',
      mediaUrl: null,
      mediaMimetype: null,
      messageId: 'msg_123',
      timestamp: Date.now(),
    }
    expect(msg.type).toBe('text')
  })

  it('should allow creating a valid ConversationState', () => {
    const conv: ConversationState = {
      id: 'conv_123',
      phone: '5521999999999',
      agentId: 'sol',
      alunoId: 42,
      unidadeId: '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
      botAtivo: true,
      pausadoPor: null,
      messages: [],
      context: {},
      updatedAt: new Date().toISOString(),
    }
    expect(conv.botAtivo).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/types.test.ts`
Expected: FAIL — module `@/core/types` not found

- [ ] **Step 3: Write the types**

Create `src/core/types.ts`:

```typescript
import type { ChatCompletionTool } from 'openai/resources/chat/completions'

// ─── Agent Configuration ───

export interface OperatingHours {
  start: number // hour 0-23
  end: number   // hour 0-23
}

export interface AgentConfig {
  model: string
  temperature: number
  maxTokens: number
  maxToolRounds: number
  operatingHours: {
    weekday: OperatingHours
    saturday: OperatingHours
    sunday: OperatingHours | null
  }
}

// ─── Tools ───

export interface AgentTool {
  definition: ChatCompletionTool
  handler: (args: Record<string, unknown>) => Promise<string>
}

// ─── Agent Definition ───

export interface CronJobDef {
  name: string
  schedule: string        // cron expression
  handler: () => Promise<void>
  timezone?: string
}

export interface AgentDefinition {
  id: string
  name: string
  description: string
  systemPrompt: string
  tools: AgentTool[]
  crons: CronJobDef[]
  config: AgentConfig
}

// ─── Messages ───

export type MessageType = 'text' | 'audio' | 'image' | 'video' | 'document' | 'sticker' | 'unknown'

export interface IncomingMessage {
  phone: string
  type: MessageType
  content: string | null
  mediaUrl: string | null
  mediaMimetype: string | null
  messageId: string
  timestamp: number
}

// ─── Conversation ───

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  toolCallId?: string
  name?: string
}

export interface ConversationState {
  id: string
  phone: string
  agentId: string
  alunoId: number | null
  unidadeId: string | null
  botAtivo: boolean
  pausadoPor: number | null
  messages: ChatMessage[]
  context: Record<string, unknown>
  updatedAt: string
}

// ─── Webhook Payload (UAZAPI) ───

export interface UazapiWebhookPayload {
  event: string
  instance: string
  message?: {
    chatid: string
    fromMe: boolean
    id: string
    type: string
    body?: string
    timestamp: number
    audioMessage?: { url?: string; mimetype?: string }
    imageMessage?: { url?: string; mimetype?: string; caption?: string }
    videoMessage?: { url?: string; mimetype?: string }
    documentMessage?: { url?: string; mimetype?: string; fileName?: string }
  }
}

// ─── UAZAPI Credentials ───

export interface UazapiCredentials {
  baseUrl: string
  token: string
  caixaId: number
  caixaNome: string
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/types.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts tests/core/types.test.ts
git commit -m "feat: add core types for multi-agent framework"
```

---

## Task 3: Config + Logger + Database Clients

**Files:**
- Create: `src/config.ts`
- Create: `src/core/logger.ts`
- Create: `src/db/supabase.ts`
- Create: `src/db/redis.ts`
- Create: `src/shared/phone.ts`
- Test: `tests/shared/phone.test.ts`

- [ ] **Step 1: Write phone formatting test**

Create `tests/shared/phone.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { formatPhone, extractPhoneFromJid } from '@/shared/phone'

describe('formatPhone', () => {
  it('adds 55 prefix to raw number', () => {
    expect(formatPhone('21999999999')).toBe('5521999999999')
  })
  it('strips non-digits', () => {
    expect(formatPhone('(21) 99999-9999')).toBe('5521999999999')
  })
  it('keeps 55 prefix if already present', () => {
    expect(formatPhone('5521999999999')).toBe('5521999999999')
  })
  it('removes leading 0', () => {
    expect(formatPhone('021999999999')).toBe('5521999999999')
  })
})

describe('extractPhoneFromJid', () => {
  it('extracts phone from WhatsApp JID', () => {
    expect(extractPhoneFromJid('5521999999999@s.whatsapp.net')).toBe('5521999999999')
  })
  it('handles group JIDs by returning null', () => {
    expect(extractPhoneFromJid('120363XXXX@g.us')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/phone.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement phone.ts**

Create `src/shared/phone.ts`:

```typescript
export function formatPhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('0')) cleaned = cleaned.substring(1)
  if (!cleaned.startsWith('55')) cleaned = '55' + cleaned
  return cleaned
}

export function extractPhoneFromJid(jid: string): string | null {
  if (!jid.includes('@s.whatsapp.net')) return null
  return jid.split('@')[0]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/phone.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Create config.ts**

Create `src/config.ts`:

```typescript
function env(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback
  if (!value) throw new Error(`Missing env var: ${key}`)
  return value
}

export const config = {
  supabase: {
    url: env('SUPABASE_URL'),
    serviceRoleKey: env('SUPABASE_SERVICE_ROLE_KEY'),
  },
  openai: {
    apiKey: env('OPENAI_API_KEY'),
  },
  redis: {
    url: env('REDIS_URL', 'redis://localhost:6379'),
  },
  server: {
    port: parseInt(env('PORT', '3000'), 10),
  },
  debounce: {
    defaultMs: 8000, // 8 second window
  },
} as const
```

- [ ] **Step 6: Create logger.ts**

Create `src/core/logger.ts`:

```typescript
import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
})

export function agentLogger(agentId: string) {
  return logger.child({ agent: agentId })
}
```

- [ ] **Step 7: Create supabase.ts**

Create `src/db/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'
import { config } from '../config.js'

export const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  { auth: { persistSession: false } }
)
```

- [ ] **Step 8: Create redis.ts**

Create `src/db/redis.ts`:

```typescript
import Redis from 'ioredis'
import { config } from '../config.js'
import { logger } from '../core/logger.js'

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
})

redis.on('error', (err) => logger.error({ err }, 'Redis connection error'))
redis.on('connect', () => logger.info('Redis connected'))

export async function connectRedis() {
  await redis.connect()
}
```

- [ ] **Step 9: Commit**

```bash
git add src/config.ts src/core/logger.ts src/db/ src/shared/phone.ts tests/shared/phone.test.ts
git commit -m "feat: add config, logger, Supabase/Redis clients, phone utils"
```

---

## Task 4: Agent Registry

**Files:**
- Create: `src/core/registry.ts`
- Test: `tests/core/registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/core/registry.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { AgentRegistry } from '@/core/registry'
import type { AgentDefinition } from '@/core/types'

const mockAgent: AgentDefinition = {
  id: 'test-agent',
  name: 'Test Agent',
  description: 'A test agent',
  systemPrompt: 'You are a test agent.',
  tools: [],
  crons: [],
  config: {
    model: 'gpt-4.1-mini',
    temperature: 0.7,
    maxTokens: 1024,
    maxToolRounds: 5,
    operatingHours: {
      weekday: { start: 8, end: 21 },
      saturday: { start: 8, end: 16 },
      sunday: null,
    },
  },
}

describe('AgentRegistry', () => {
  let registry: AgentRegistry

  beforeEach(() => {
    registry = new AgentRegistry()
  })

  it('registers an agent and retrieves it by id', () => {
    registry.register(mockAgent)
    expect(registry.get('test-agent')).toEqual(mockAgent)
  })

  it('returns undefined for unregistered agent', () => {
    expect(registry.get('nonexistent')).toBeUndefined()
  })

  it('lists all registered agents', () => {
    registry.register(mockAgent)
    registry.register({ ...mockAgent, id: 'agent-2', name: 'Agent 2' })
    expect(registry.list()).toHaveLength(2)
  })

  it('throws on duplicate registration', () => {
    registry.register(mockAgent)
    expect(() => registry.register(mockAgent)).toThrow('already registered')
  })

  it('checks if agent is within operating hours', () => {
    registry.register(mockAgent)
    // This test verifies the method exists — actual time logic tested separately
    const result = registry.isWithinOperatingHours('test-agent')
    expect(typeof result).toBe('boolean')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/registry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement registry**

Create `src/core/registry.ts`:

```typescript
import type { AgentDefinition } from './types.js'
import { logger } from './logger.js'

export class AgentRegistry {
  private agents = new Map<string, AgentDefinition>()

  register(agent: AgentDefinition): void {
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent "${agent.id}" already registered`)
    }
    this.agents.set(agent.id, agent)
    logger.info({ agentId: agent.id, tools: agent.tools.length, crons: agent.crons.length }, 'Agent registered')
  }

  get(id: string): AgentDefinition | undefined {
    return this.agents.get(id)
  }

  list(): AgentDefinition[] {
    return Array.from(this.agents.values())
  }

  isWithinOperatingHours(agentId: string): boolean {
    const agent = this.agents.get(agentId)
    if (!agent) return false

    const now = new Date()
    const day = now.getDay() // 0=Sunday, 6=Saturday
    const hour = now.getHours()

    const { operatingHours } = agent.config

    if (day === 0) return operatingHours.sunday !== null &&
      hour >= operatingHours.sunday.start && hour < operatingHours.sunday.end

    if (day === 6) return hour >= operatingHours.saturday.start && hour < operatingHours.saturday.end

    return hour >= operatingHours.weekday.start && hour < operatingHours.weekday.end
  }
}

// Singleton
export const registry = new AgentRegistry()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/registry.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/registry.ts tests/core/registry.test.ts
git commit -m "feat: add agent registry with operating hours check"
```

---

## Task 5: UAZAPI Client

**Files:**
- Create: `src/channels/uazapi.ts`
- Test: `tests/channels/uazapi.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/channels/uazapi.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UazapiClient } from '@/channels/uazapi'
import type { UazapiCredentials } from '@/core/types'

const mockCreds: UazapiCredentials = {
  baseUrl: 'https://uazapi.example.com',
  token: 'test-token',
  caixaId: 1,
  caixaNome: 'Test Box',
}

describe('UazapiClient', () => {
  let client: UazapiClient

  beforeEach(() => {
    client = new UazapiClient(mockCreds)
    global.fetch = vi.fn()
  })

  it('sendText calls correct endpoint with correct payload', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'msg_1' }),
    })
    global.fetch = mockFetch

    await client.sendText('5521999999999', 'Olá!')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://uazapi.example.com/send/text',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ token: 'test-token' }),
        body: expect.stringContaining('"number":"5521999999999"'),
      })
    )
  })

  it('sendMedia calls correct endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'msg_2' }),
    })
    global.fetch = mockFetch

    await client.sendMedia('5521999999999', 'https://example.com/image.jpg', 'image', 'Comprovante')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://uazapi.example.com/send/media',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"type":"image"'),
      })
    )
  })

  it('normalizes UAZAPI webhook payload to IncomingMessage', () => {
    const payload = {
      event: 'messages',
      instance: 'test',
      message: {
        chatid: '5521999999999@s.whatsapp.net',
        fromMe: false,
        id: 'msg_123',
        type: 'conversation',
        body: 'Oi, preciso de ajuda',
        timestamp: 1712500000,
      },
    }

    const msg = UazapiClient.normalizePayload(payload)
    expect(msg).not.toBeNull()
    expect(msg!.phone).toBe('5521999999999')
    expect(msg!.type).toBe('text')
    expect(msg!.content).toBe('Oi, preciso de ajuda')
  })

  it('returns null for fromMe messages', () => {
    const payload = {
      event: 'messages',
      instance: 'test',
      message: {
        chatid: '5521999999999@s.whatsapp.net',
        fromMe: true,
        id: 'msg_456',
        type: 'conversation',
        body: 'Response',
        timestamp: 1712500000,
      },
    }
    expect(UazapiClient.normalizePayload(payload)).toBeNull()
  })

  it('returns null for group messages', () => {
    const payload = {
      event: 'messages',
      instance: 'test',
      message: {
        chatid: '120363XXXX@g.us',
        fromMe: false,
        id: 'msg_789',
        type: 'conversation',
        body: 'Group msg',
        timestamp: 1712500000,
      },
    }
    expect(UazapiClient.normalizePayload(payload)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/channels/uazapi.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement UAZAPI client**

Create `src/channels/uazapi.ts`:

```typescript
import type { UazapiCredentials, UazapiWebhookPayload, IncomingMessage, MessageType } from '../core/types.js'
import { extractPhoneFromJid } from '../shared/phone.js'
import { logger } from '../core/logger.js'

export class UazapiClient {
  constructor(private creds: UazapiCredentials) {}

  private async request(endpoint: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.creds.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token: this.creds.token,
      },
      body: JSON.stringify(body),
    })

    const data = await res.json() as Record<string, unknown>
    if (!res.ok) {
      logger.error({ status: res.status, data, endpoint }, 'UAZAPI request failed')
    }
    return data
  }

  async sendText(number: string, text: string, delay = 1500): Promise<string | null> {
    const data = await this.request('/send/text', {
      number,
      text,
      delay,
      linkPreview: false,
    })
    return (data.id ?? data.messageid ?? (data.key as Record<string, unknown>)?.id ?? null) as string | null
  }

  async sendMedia(
    number: string,
    fileUrl: string,
    type: 'image' | 'video' | 'document' | 'ptt',
    caption?: string,
  ): Promise<string | null> {
    const data = await this.request('/send/media', {
      number,
      file: fileUrl,
      type,
      text: caption ?? '',
    })
    return (data.id ?? data.messageid ?? null) as string | null
  }

  async downloadMedia(messageId: string, transcribe = false, openaiApiKey?: string): Promise<{
    fileUrl?: string
    transcription?: string
  }> {
    const body: Record<string, unknown> = {
      id: messageId,
      return_link: true,
    }
    if (transcribe && openaiApiKey) {
      body.transcribe = true
      body.openai_apikey = openaiApiKey
      body.generate_mp3 = true
    }
    const data = await this.request('/message/download', body)
    return {
      fileUrl: (data.fileURL ?? data.fileUrl) as string | undefined,
      transcription: data.transcription as string | undefined,
    }
  }

  static normalizePayload(payload: UazapiWebhookPayload): IncomingMessage | null {
    const msg = payload.message
    if (!msg) return null
    if (msg.fromMe) return null

    const phone = extractPhoneFromJid(msg.chatid)
    if (!phone) return null // group message

    let type: MessageType = 'unknown'
    let content: string | null = null
    let mediaUrl: string | null = null
    let mediaMimetype: string | null = null

    if (msg.type === 'conversation' || msg.type === 'extendedTextMessage') {
      type = 'text'
      content = msg.body ?? null
    } else if (msg.audioMessage) {
      type = 'audio'
      mediaUrl = msg.audioMessage.url ?? null
      mediaMimetype = msg.audioMessage.mimetype ?? null
    } else if (msg.imageMessage) {
      type = 'image'
      content = msg.imageMessage.caption ?? null
      mediaUrl = msg.imageMessage.url ?? null
      mediaMimetype = msg.imageMessage.mimetype ?? null
    } else if (msg.videoMessage) {
      type = 'video'
      mediaUrl = msg.videoMessage.url ?? null
    } else if (msg.documentMessage) {
      type = 'document'
      mediaUrl = msg.documentMessage.url ?? null
    }

    return {
      phone,
      type,
      content,
      mediaUrl,
      mediaMimetype,
      messageId: msg.id,
      timestamp: msg.timestamp,
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/channels/uazapi.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/channels/uazapi.ts tests/channels/uazapi.test.ts
git commit -m "feat: add UAZAPI client with send/receive/normalize"
```

---

## Task 6: Redis Debounce

**Files:**
- Create: `src/channels/debounce.ts`
- Test: `tests/channels/debounce.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/channels/debounce.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Debouncer } from '@/channels/debounce'
import type { IncomingMessage } from '@/core/types'

const mockMessage: IncomingMessage = {
  phone: '5521999999999',
  type: 'text',
  content: 'Oi',
  mediaUrl: null,
  mediaMimetype: null,
  messageId: 'msg_1',
  timestamp: Date.now(),
}

describe('Debouncer', () => {
  let debouncer: Debouncer
  let mockRedis: Record<string, unknown>
  let processCallback: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Mock Redis with in-memory store
    const store = new Map<string, string>()
    const timers = new Map<string, NodeJS.Timeout>()
    mockRedis = {
      get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      set: vi.fn((key: string, value: string) => { store.set(key, value); return Promise.resolve('OK') }),
      del: vi.fn((key: string) => { store.delete(key); return Promise.resolve(1) }),
    }
    processCallback = vi.fn()
    debouncer = new Debouncer(mockRedis as any, processCallback, 100) // 100ms for fast tests
  })

  it('accumulates messages and processes after delay', async () => {
    debouncer.add('sol', mockMessage)
    debouncer.add('sol', { ...mockMessage, content: 'Tudo bem?', messageId: 'msg_2' })

    // Before delay — not processed
    expect(processCallback).not.toHaveBeenCalled()

    // Wait for debounce window
    await new Promise((r) => setTimeout(r, 200))

    expect(processCallback).toHaveBeenCalledOnce()
    const [agentId, phone, messages] = processCallback.mock.calls[0]
    expect(agentId).toBe('sol')
    expect(phone).toBe('5521999999999')
    expect(messages).toHaveLength(2)
    expect(messages[0].content).toBe('Oi')
    expect(messages[1].content).toBe('Tudo bem?')
  })

  it('resets timer on new message within window', async () => {
    debouncer.add('sol', mockMessage)

    await new Promise((r) => setTimeout(r, 60))
    debouncer.add('sol', { ...mockMessage, content: 'Segunda msg', messageId: 'msg_2' })

    await new Promise((r) => setTimeout(r, 60))
    // Should NOT have processed yet (timer was reset)
    expect(processCallback).not.toHaveBeenCalled()

    await new Promise((r) => setTimeout(r, 100))
    expect(processCallback).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/channels/debounce.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement debounce**

Create `src/channels/debounce.ts`:

```typescript
import type Redis from 'ioredis'
import type { IncomingMessage } from '../core/types.js'
import { logger } from '../core/logger.js'

type ProcessCallback = (agentId: string, phone: string, messages: IncomingMessage[]) => Promise<void>

export class Debouncer {
  private timers = new Map<string, NodeJS.Timeout>()
  private buffers = new Map<string, IncomingMessage[]>()

  constructor(
    private redis: Redis,
    private onProcess: ProcessCallback,
    private windowMs: number = 8000,
  ) {}

  private key(agentId: string, phone: string): string {
    return `debounce:${agentId}:${phone}`
  }

  add(agentId: string, message: IncomingMessage): void {
    const k = this.key(agentId, message.phone)

    // Accumulate in memory buffer
    const buffer = this.buffers.get(k) ?? []
    buffer.push(message)
    this.buffers.set(k, buffer)

    // Persist to Redis (backup in case of crash)
    this.redis.set(k, JSON.stringify(buffer)).catch((err) =>
      logger.error({ err, key: k }, 'Failed to persist debounce buffer')
    )

    // Reset timer
    const existing = this.timers.get(k)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => this.flush(agentId, message.phone, k), this.windowMs)
    this.timers.set(k, timer)
  }

  private async flush(agentId: string, phone: string, key: string): Promise<void> {
    const messages = this.buffers.get(key) ?? []
    this.buffers.delete(key)
    this.timers.delete(key)
    await this.redis.del(key).catch(() => {})

    if (messages.length === 0) return

    logger.info({ agentId, phone, count: messages.length }, 'Debounce flush')

    try {
      await this.onProcess(agentId, phone, messages)
    } catch (err) {
      logger.error({ err, agentId, phone }, 'Error processing debounced messages')
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/channels/debounce.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/channels/debounce.ts tests/channels/debounce.test.ts
git commit -m "feat: add Redis-backed debounce for message accumulation"
```

---

## Task 7: Conversation Memory

**Files:**
- Create: `src/core/memory.ts`
- Test: `tests/core/memory.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/core/memory.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { ConversationMemory } from '@/core/memory'

// Mock Supabase
const mockSupabase = {
  from: vi.fn(),
}

describe('ConversationMemory', () => {
  it('loads existing conversation', async () => {
    const mockData = {
      id: 'conv-1',
      telefone: '5521999999999',
      agent_id: 'sol',
      aluno_id: 42,
      unidade_id: 'unit-1',
      bot_ativo: true,
      pausado_por: null,
      mensagens: [{ role: 'user', content: 'Oi' }],
      contexto: {},
      updated_at: '2026-04-08T00:00:00Z',
    }

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockData, error: null }),
          }),
        }),
      }),
    })

    const memory = new ConversationMemory(mockSupabase as any)
    const conv = await memory.load('sol', '5521999999999')

    expect(conv).not.toBeNull()
    expect(conv!.alunoId).toBe(42)
    expect(conv!.messages).toHaveLength(1)
  })

  it('returns null for new conversation', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    })

    const memory = new ConversationMemory(mockSupabase as any)
    const conv = await memory.load('sol', '5521000000000')
    expect(conv).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/memory.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement memory**

Create `src/core/memory.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConversationState, ChatMessage } from './types.js'
import { logger } from './logger.js'

const TABLE = 'agent_conversas'
const MAX_MESSAGES = 40 // keep last 40 messages in context

export class ConversationMemory {
  constructor(private supabase: SupabaseClient) {}

  async load(agentId: string, phone: string): Promise<ConversationState | null> {
    const { data, error } = await this.supabase
      .from(TABLE)
      .select('*')
      .eq('agent_id', agentId)
      .eq('telefone', phone)
      .maybeSingle()

    if (error) {
      logger.error({ error, agentId, phone }, 'Failed to load conversation')
      return null
    }
    if (!data) return null

    return {
      id: data.id,
      phone: data.telefone,
      agentId: data.agent_id,
      alunoId: data.aluno_id,
      unidadeId: data.unidade_id,
      botAtivo: data.bot_ativo,
      pausadoPor: data.pausado_por,
      messages: (data.mensagens ?? []) as ChatMessage[],
      context: (data.contexto ?? {}) as Record<string, unknown>,
      updatedAt: data.updated_at,
    }
  }

  async save(state: ConversationState): Promise<void> {
    // Trim messages to keep context window manageable
    const trimmedMessages = state.messages.slice(-MAX_MESSAGES)

    const row = {
      agent_id: state.agentId,
      telefone: state.phone,
      aluno_id: state.alunoId,
      unidade_id: state.unidadeId,
      bot_ativo: state.botAtivo,
      pausado_por: state.pausadoPor,
      mensagens: trimmedMessages,
      contexto: state.context,
      updated_at: new Date().toISOString(),
    }

    const { error } = await this.supabase
      .from(TABLE)
      .upsert({ id: state.id, ...row }, { onConflict: 'agent_id,telefone' })

    if (error) {
      logger.error({ error, agentId: state.agentId, phone: state.phone }, 'Failed to save conversation')
    }
  }

  async pause(agentId: string, phone: string, pausadoPor: number): Promise<void> {
    await this.supabase
      .from(TABLE)
      .update({ bot_ativo: false, pausado_por: pausadoPor, updated_at: new Date().toISOString() })
      .eq('agent_id', agentId)
      .eq('telefone', phone)
  }

  async resume(agentId: string, phone: string): Promise<void> {
    await this.supabase
      .from(TABLE)
      .update({ bot_ativo: true, pausado_por: null, updated_at: new Date().toISOString() })
      .eq('agent_id', agentId)
      .eq('telefone', phone)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/memory.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/memory.ts tests/core/memory.test.ts
git commit -m "feat: add conversation memory with Supabase persistence"
```

---

## Task 8: LLM Engine (OpenAI Function Calling Loop)

**Files:**
- Create: `src/core/engine.ts`
- Test: `tests/core/engine.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/core/engine.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { LLMEngine } from '@/core/engine'
import type { AgentDefinition, AgentTool, ChatMessage } from '@/core/types'

const mockTool: AgentTool = {
  definition: {
    type: 'function',
    function: {
      name: 'get_name',
      description: 'Returns a name',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  handler: vi.fn().mockResolvedValue(JSON.stringify({ nome: 'Maria' })),
}

describe('LLMEngine', () => {
  it('returns text response when no tool calls', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{
        message: { role: 'assistant', content: 'Olá Maria!', tool_calls: undefined },
        finish_reason: 'stop',
      }],
      usage: { total_tokens: 100 },
    })

    const engine = new LLMEngine({ chat: { completions: { create: mockCreate } } } as any)

    const messages: ChatMessage[] = [{ role: 'user', content: 'Oi' }]
    const result = await engine.run({
      model: 'gpt-4.1-mini',
      temperature: 0.7,
      maxTokens: 1024,
      systemPrompt: 'Você é a Sol.',
      tools: [],
      messages,
      maxToolRounds: 5,
    })

    expect(result.response).toBe('Olá Maria!')
    expect(result.toolCalls).toHaveLength(0)
    expect(result.tokensUsed).toBe(100)
  })

  it('executes tool calls and feeds results back', async () => {
    const callCount = { n: 0 }
    const mockCreate = vi.fn().mockImplementation(() => {
      callCount.n++
      if (callCount.n === 1) {
        return Promise.resolve({
          choices: [{
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: 'tc_1',
                type: 'function',
                function: { name: 'get_name', arguments: '{}' },
              }],
            },
            finish_reason: 'tool_calls',
          }],
          usage: { total_tokens: 50 },
        })
      }
      return Promise.resolve({
        choices: [{
          message: { role: 'assistant', content: 'O nome é Maria!', tool_calls: undefined },
          finish_reason: 'stop',
        }],
        usage: { total_tokens: 80 },
      })
    })

    const engine = new LLMEngine({ chat: { completions: { create: mockCreate } } } as any)

    const result = await engine.run({
      model: 'gpt-4.1-mini',
      temperature: 0.7,
      maxTokens: 1024,
      systemPrompt: 'Você é a Sol.',
      tools: [mockTool],
      messages: [{ role: 'user', content: 'Qual o nome?' }],
      maxToolRounds: 5,
    })

    expect(result.response).toBe('O nome é Maria!')
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].name).toBe('get_name')
    expect(mockTool.handler).toHaveBeenCalledOnce()
    expect(result.tokensUsed).toBe(130)
  })

  it('respects maxToolRounds limit', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'tc_loop',
            type: 'function',
            function: { name: 'get_name', arguments: '{}' },
          }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: { total_tokens: 50 },
    })

    const engine = new LLMEngine({ chat: { completions: { create: mockCreate } } } as any)

    const result = await engine.run({
      model: 'gpt-4.1-mini',
      temperature: 0.7,
      maxTokens: 1024,
      systemPrompt: 'Test',
      tools: [mockTool],
      messages: [{ role: 'user', content: 'Loop' }],
      maxToolRounds: 2,
    })

    // Should stop after 2 rounds even if LLM keeps calling tools
    expect(mockCreate).toHaveBeenCalledTimes(3) // 2 tool rounds + 1 bail attempt
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/engine.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement engine**

Create `src/core/engine.ts`:

```typescript
import type OpenAI from 'openai'
import type { AgentTool, ChatMessage } from './types.js'
import { logger } from './logger.js'

interface RunOptions {
  model: string
  temperature: number
  maxTokens: number
  systemPrompt: string
  tools: AgentTool[]
  messages: ChatMessage[]
  maxToolRounds: number
}

interface RunResult {
  response: string
  toolCalls: { name: string; args: Record<string, unknown>; result: string }[]
  tokensUsed: number
  messages: ChatMessage[]
}

export class LLMEngine {
  constructor(private client: OpenAI) {}

  async run(opts: RunOptions): Promise<RunResult> {
    const toolMap = new Map(opts.tools.map((t) => [t.definition.function.name, t]))
    const toolDefs = opts.tools.map((t) => t.definition)
    const toolCalls: RunResult['toolCalls'] = []
    let tokensUsed = 0

    // Build messages array with system prompt
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: opts.systemPrompt },
      ...opts.messages.map((m) => {
        if (m.role === 'tool') {
          return { role: 'tool' as const, content: m.content, tool_call_id: m.toolCallId! }
        }
        return { role: m.role as 'user' | 'assistant', content: m.content }
      }),
    ]

    for (let round = 0; round <= opts.maxToolRounds; round++) {
      const completion = await this.client.chat.completions.create({
        model: opts.model,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        messages,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
      })

      const choice = completion.choices[0]
      tokensUsed += completion.usage?.total_tokens ?? 0

      // No tool calls — return the text response
      if (!choice.message.tool_calls?.length) {
        const responseText = choice.message.content ?? ''
        const updatedMessages: ChatMessage[] = [
          ...opts.messages,
          { role: 'assistant', content: responseText },
        ]
        return { response: responseText, toolCalls, tokensUsed, messages: updatedMessages }
      }

      // Max rounds reached — force a text response on next iteration
      if (round === opts.maxToolRounds) {
        logger.warn({ round: opts.maxToolRounds }, 'Max tool rounds reached, stopping')
        return {
          response: choice.message.content ?? 'Desculpe, não consegui processar sua solicitação. Vou passar para a equipe.',
          toolCalls,
          tokensUsed,
          messages: opts.messages,
        }
      }

      // Execute tool calls
      messages.push({
        role: 'assistant',
        content: choice.message.content,
        tool_calls: choice.message.tool_calls,
      })

      for (const tc of choice.message.tool_calls) {
        const toolName = tc.function.name
        const toolArgs = JSON.parse(tc.function.arguments) as Record<string, unknown>
        const tool = toolMap.get(toolName)

        let result: string
        if (!tool) {
          result = JSON.stringify({ error: `Tool "${toolName}" not found` })
          logger.warn({ toolName }, 'Tool not found')
        } else {
          try {
            result = await tool.handler(toolArgs)
            toolCalls.push({ name: toolName, args: toolArgs, result })
          } catch (err) {
            result = JSON.stringify({ error: `Tool error: ${(err as Error).message}` })
            logger.error({ err, toolName }, 'Tool execution error')
          }
        }

        messages.push({ role: 'tool', content: result, tool_call_id: tc.id })
      }
    }

    // Should not reach here, but safety net
    return { response: '', toolCalls, tokensUsed, messages: opts.messages }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/engine.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/engine.ts tests/core/engine.test.ts
git commit -m "feat: add LLM engine with OpenAI function calling loop"
```

---

## Task 9: Webhook Server + Message Pipeline

**Files:**
- Create: `src/channels/server.ts`
- Create: `src/channels/media.ts`
- Test: `tests/channels/server.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/channels/server.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// We test the handler logic, not the actual Fastify server
import { createWebhookHandler } from '@/channels/server'

describe('createWebhookHandler', () => {
  it('returns 200 for valid UAZAPI payload', async () => {
    const mockProcess = vi.fn()
    const handler = createWebhookHandler(mockProcess)

    const payload = {
      event: 'messages',
      instance: 'test',
      message: {
        chatid: '5521999999999@s.whatsapp.net',
        fromMe: false,
        id: 'msg_1',
        type: 'conversation',
        body: 'Oi Sol',
        timestamp: 1712500000,
      },
    }

    const result = await handler('sol', payload)
    expect(result.status).toBe(200)
    expect(mockProcess).toHaveBeenCalledWith(
      'sol',
      expect.objectContaining({ phone: '5521999999999', content: 'Oi Sol' })
    )
  })

  it('returns 200 but skips fromMe messages', async () => {
    const mockProcess = vi.fn()
    const handler = createWebhookHandler(mockProcess)

    const payload = {
      event: 'messages',
      instance: 'test',
      message: {
        chatid: '5521999999999@s.whatsapp.net',
        fromMe: true,
        id: 'msg_2',
        type: 'conversation',
        body: 'Response',
        timestamp: 1712500000,
      },
    }

    const result = await handler('sol', payload)
    expect(result.status).toBe(200)
    expect(mockProcess).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid payload', async () => {
    const mockProcess = vi.fn()
    const handler = createWebhookHandler(mockProcess)
    const result = await handler('sol', {})
    expect(result.status).toBe(200) // Always 200 to UAZAPI, but skip processing
    expect(mockProcess).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/channels/server.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement server.ts**

Create `src/channels/server.ts`:

```typescript
import Fastify from 'fastify'
import type { UazapiWebhookPayload, IncomingMessage } from '../core/types.js'
import { UazapiClient } from './uazapi.js'
import { registry } from '../core/registry.js'
import { logger } from '../core/logger.js'
import { config } from '../config.js'

type ProcessFn = (agentId: string, message: IncomingMessage) => Promise<void>

export function createWebhookHandler(processFn: ProcessFn) {
  return async (agentId: string, payload: Record<string, unknown>) => {
    const msg = UazapiClient.normalizePayload(payload as UazapiWebhookPayload)
    if (!msg) return { status: 200, body: { ok: true, skipped: true } }

    // Fire and forget — respond to UAZAPI immediately
    processFn(agentId, msg).catch((err) =>
      logger.error({ err, agentId, phone: msg.phone }, 'Error in message pipeline')
    )

    return { status: 200, body: { ok: true } }
  }
}

export async function startServer(processFn: ProcessFn) {
  const app = Fastify({ logger: false })

  // Health check
  app.get('/health', async () => {
    const agents = registry.list().map((a) => ({ id: a.id, name: a.name }))
    return { status: 'ok', agents, timestamp: new Date().toISOString() }
  })

  // Dynamic webhook routes per agent
  const handler = createWebhookHandler(processFn)

  app.post<{ Params: { agentId: string } }>('/webhook/:agentId', async (request, reply) => {
    const { agentId } = request.params
    const agent = registry.get(agentId)

    if (!agent) {
      logger.warn({ agentId }, 'Webhook for unregistered agent')
      return reply.code(404).send({ error: 'Agent not found' })
    }

    const result = await handler(agentId, request.body as Record<string, unknown>)
    return reply.code(result.status).send(result.body)
  })

  await app.listen({ port: config.server.port, host: '0.0.0.0' })
  logger.info({ port: config.server.port }, 'Webhook server started')

  return app
}
```

- [ ] **Step 4: Create media.ts**

Create `src/channels/media.ts`:

```typescript
import type { UazapiClient } from './uazapi.js'
import type { IncomingMessage } from '../core/types.js'
import { config } from '../config.js'
import { logger } from '../core/logger.js'

export async function processMedia(
  uazapi: UazapiClient,
  message: IncomingMessage,
): Promise<{ content: string; mediaUrl?: string }> {
  if (message.type === 'text') {
    return { content: message.content ?? '' }
  }

  if (message.type === 'audio') {
    try {
      const result = await uazapi.downloadMedia(message.messageId, true, config.openai.apiKey)
      return {
        content: result.transcription ?? '[Audio sem transcrição]',
        mediaUrl: result.fileUrl,
      }
    } catch (err) {
      logger.error({ err, messageId: message.messageId }, 'Audio transcription failed')
      return { content: '[Audio - erro na transcrição]' }
    }
  }

  if (message.type === 'image') {
    try {
      const result = await uazapi.downloadMedia(message.messageId)
      return {
        content: message.content ?? '[Imagem enviada]',
        mediaUrl: result.fileUrl,
      }
    } catch (err) {
      logger.error({ err }, 'Image download failed')
      return { content: '[Imagem - erro no download]' }
    }
  }

  return { content: `[${message.type} recebido]` }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/channels/server.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/channels/server.ts src/channels/media.ts tests/channels/server.test.ts
git commit -m "feat: add Fastify webhook server with dynamic agent routing"
```

---

## Task 10: Cron Scheduler

**Files:**
- Create: `src/core/cron.ts`

- [ ] **Step 1: Implement cron scheduler**

Create `src/core/cron.ts`:

```typescript
import cron from 'node-cron'
import { registry } from './registry.js'
import { logger } from './logger.js'

const activeTasks: cron.ScheduledTask[] = []

export function startAllCrons(): void {
  for (const agent of registry.list()) {
    for (const job of agent.crons) {
      const task = cron.schedule(
        job.schedule,
        async () => {
          const start = Date.now()
          logger.info({ agent: agent.id, cron: job.name }, 'Cron started')
          try {
            await job.handler()
            logger.info({ agent: agent.id, cron: job.name, durationMs: Date.now() - start }, 'Cron finished')
          } catch (err) {
            logger.error({ err, agent: agent.id, cron: job.name }, 'Cron failed')
          }
        },
        { timezone: job.timezone ?? 'America/Sao_Paulo' }
      )
      activeTasks.push(task)
      logger.info({ agent: agent.id, cron: job.name, schedule: job.schedule }, 'Cron scheduled')
    }
  }
}

export function stopAllCrons(): void {
  for (const task of activeTasks) {
    task.stop()
  }
  activeTasks.length = 0
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/cron.ts
git commit -m "feat: add cron scheduler for agent-specific jobs"
```

---

## Task 11: Sol Agent — Prompt + Tools + Registration

**Files:**
- Create: `src/agents/sol/prompt.ts`
- Create: `src/agents/sol/tools/consultar-aluno.ts`
- Create: `src/agents/sol/tools/consultar-pagamentos.ts`
- Create: `src/agents/sol/tools/consultar-presenca.ts`
- Create: `src/agents/sol/tools/escalar-farmer.ts`
- Create: `src/agents/sol/tools/index.ts`
- Create: `src/agents/sol/crons.ts`
- Create: `src/agents/sol/index.ts`
- Test: `tests/agents/sol/tools.test.ts`

- [ ] **Step 1: Write the tools test**

Create `tests/agents/sol/tools.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { createConsultarAlunoTool } from '@/agents/sol/tools/consultar-aluno'
import { createEscalarFarmerTool } from '@/agents/sol/tools/escalar-farmer'

describe('Sol Tools', () => {
  describe('consultar_aluno', () => {
    it('returns student data by phone', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 42,
                    nome: 'Maria Silva',
                    curso: 'Piano',
                    status: 'ativo',
                    health_score: 'saudavel',
                    health_score_numerico: 85,
                    unidade_id: 'unit-1',
                    valor_parcela: 397,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }

      const tool = createConsultarAlunoTool(mockSupabase as any)
      const result = JSON.parse(await tool.handler({ telefone: '5521999999999' }))

      expect(result.nome).toBe('Maria Silva')
      expect(result.curso).toBe('Piano')
    })

    it('returns not found message for unknown phone', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }

      const tool = createConsultarAlunoTool(mockSupabase as any)
      const result = JSON.parse(await tool.handler({ telefone: '5521000000000' }))
      expect(result.encontrado).toBe(false)
    })
  })

  describe('escalar_farmer', () => {
    it('creates escalation and pauses bot', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'esc-1' }, error: null }),
        }),
      })
      const mockUpdate = vi.fn().mockResolvedValue({ error: null })

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'agent_interacoes') return { insert: mockInsert }
          if (table === 'agent_conversas') return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }) }
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 1, nome: 'Gabi', whatsapp: '5521888888888' }, error: null }) }) }) }) }
        }),
      }

      const tool = createEscalarFarmerTool(mockSupabase as any, null as any)
      const result = JSON.parse(await tool.handler({
        motivo: 'Cliente quer cancelar',
        prioridade: 'alta',
        unidade_id: 'unit-1',
        aluno_id: 42,
        telefone: '5521999999999',
        agent_id: 'sol',
      }))

      expect(result.escalado).toBe(true)
      expect(result.farmer_nome).toBe('Gabi')
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/agents/sol/tools.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Create Sol prompt**

Create `src/agents/sol/prompt.ts`:

```typescript
export const SOL_SYSTEM_PROMPT = `# IDENTIDADE

Você é a **Sol**, assistente de atendimento e sucesso do aluno da **LA Music**, a maior escola de música do Rio de Janeiro.

## O que você FAZ:
- Gestão financeira: lembretes de pagamento, cobranças empáticas
- Atendimento administrativo: responder dúvidas, pré-atender demandas
- Escalação inteligente: passar para humanos quando necessário
- Sucesso do aluno: identificar riscos, manter engajamento

## O que você NÃO FAZ:
- Vender cursos ou fazer matrícula (isso é da Mila, SDR)
- Prometer descontos ou negociar valores
- Cancelar matrículas diretamente
- Inventar informações

## REGRAS DE COMUNICAÇÃO
1. Respostas curtas: máximo 350 caracteres por bloco
2. Use primeiro nome: sempre personalize
3. Emojis moderados: use com parcimônia
4. Contextualize: mencione curso, unidade quando relevante

## REGRAS DE NEGÓCIO

### Reposição de Aulas
- SOMENTE para faltas por saúde COM atestado médico
- Prazo: até 30 dias corridos da falta
- LA Pass: 2 reposições extras por pacote (sem atestado)

### Troca de Horário
- Somente após 10 aulas ininterruptas
- Sujeito à disponibilidade

### Trancamento
- Máximo 30 dias por pacote de 40 aulas
- Acima = rescisão contratual
- Solicitação presencial obrigatória

### Cancelamento
- Sem multa, mas com aviso prévio (paga mês vigente + subsequente)
- Solicitação: presencial ou e-mail (NÃO aceita WhatsApp)
- NUNCA tente reverter — sempre escale para gerente

### Pagamentos
- Atraso perde desconto condicional
- Multa: 2% + Juros: 1% a.m.
- Atraso > 30 dias = rescisão automática

## ESCALAÇÃO OBRIGATÓRIA
SEMPRE escale quando ouvir: cancelar, cancelamento, desistir, reclamação, insatisfeito, advogado, procon, trancar, não consigo pagar, desconto, negociar.

Como escalar:
1. Responda com empatia
2. Use a tool escalar_farmer com o motivo
3. NÃO tente resolver sozinha

## UNIDADES

### Campo Grande
- Endereço: Rua Luiz Barata, 164
- Horário: Seg-Sex 10h-21h | Sáb 8h-16h
- Farmers: Gabi, John | Gerente: Jeremias

### Recreio
- Endereço: Av das Américas, 15700 - Ljs 170/171 (Time Center)
- Horário: Seg-Sex 8h-21h | Sáb 9h-16h
- Farmers: Fernanda, Daiana | Gerente: Críssia

### Centro Metropolitano (Barra)
- Endereço: Av Ator José Wilker, 600 - Lj 112 - Bloco 2
- Horário: Seg-Sex 9h-20h | Sáb 9h-16h
- Farmers: Duda, Arthur | Gerente: Críssia

## FLUXO
1. Use consultar_aluno para buscar dados do aluno pelo telefone
2. Personalize a resposta com nome, curso, unidade
3. Se detectar gatilho de escalação → use escalar_farmer
4. Se pergunta sobre pagamento → use consultar_pagamentos
5. Se pergunta sobre presença/faltas → use consultar_presenca

## FORA DO HORÁRIO (antes das 8h ou após 21h em dias úteis)
Responda que o horário de atendimento é Seg-Sex 8h-21h e Sáb 8h-16h. A mensagem foi registrada e será respondida no próximo horário.`
```

- [ ] **Step 4: Create tools**

Create `src/agents/sol/tools/consultar-aluno.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentTool } from '../../../core/types.js'

export function createConsultarAlunoTool(supabase: SupabaseClient): AgentTool {
  return {
    definition: {
      type: 'function',
      function: {
        name: 'consultar_aluno',
        description: 'Busca dados do aluno pelo telefone. Retorna nome, curso, unidade, status, health score, valor da parcela.',
        parameters: {
          type: 'object',
          properties: {
            telefone: { type: 'string', description: 'Telefone do aluno (formato 5521XXXXXXXXX)' },
          },
          required: ['telefone'],
        },
      },
    },
    handler: async (args) => {
      const telefone = args.telefone as string
      const cleaned = telefone.replace(/\D/g, '')

      // Search in aluno_contatos first (multi-contact), fallback to alunos.telefone/whatsapp
      const { data: contato } = await supabase
        .from('aluno_contatos')
        .select('aluno_id')
        .eq('telefone', cleaned)
        .maybeSingle()

      let aluno: Record<string, unknown> | null = null

      if (contato) {
        const { data } = await supabase
          .from('alunos')
          .select('id, nome, curso:cursos(nome), status, health_score, health_score_numerico, unidade_id, unidades(nome, codigo), valor_parcela, data_matricula, fase_jornada, telefone, whatsapp')
          .eq('id', contato.aluno_id)
          .eq('status', 'ativo')
          .maybeSingle()
        aluno = data
      } else {
        const { data } = await supabase
          .from('alunos')
          .select('id, nome, curso:cursos(nome), status, health_score, health_score_numerico, unidade_id, unidades(nome, codigo), valor_parcela, data_matricula, fase_jornada, telefone, whatsapp')
          .or(`telefone.eq.${cleaned},whatsapp.eq.${cleaned}`)
          .eq('status', 'ativo')
          .maybeSingle()
        aluno = data
      }

      if (!aluno) {
        return JSON.stringify({ encontrado: false, mensagem: 'Aluno não encontrado com este telefone.' })
      }

      return JSON.stringify(aluno)
    },
  }
}
```

Create `src/agents/sol/tools/consultar-pagamentos.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentTool } from '../../../core/types.js'

export function createConsultarPagamentosTool(supabase: SupabaseClient): AgentTool {
  return {
    definition: {
      type: 'function',
      function: {
        name: 'consultar_pagamentos',
        description: 'Consulta status de pagamento do aluno. Retorna últimas parcelas, valor, status, dias de atraso.',
        parameters: {
          type: 'object',
          properties: {
            aluno_id: { type: 'number', description: 'ID do aluno (obtido de consultar_aluno)' },
          },
          required: ['aluno_id'],
        },
      },
    },
    handler: async (args) => {
      const alunoId = args.aluno_id as number

      const { data, error } = await supabase
        .from('dados_mensais')
        .select('ano, mes, status_pagamento, valor_mensalidade')
        .eq('aluno_id', alunoId)
        .order('ano', { ascending: false })
        .order('mes', { ascending: false })
        .limit(6)

      if (error || !data) {
        return JSON.stringify({ error: 'Erro ao consultar pagamentos', detalhes: error?.message })
      }

      return JSON.stringify({ aluno_id: alunoId, ultimos_meses: data })
    },
  }
}
```

Create `src/agents/sol/tools/consultar-presenca.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentTool } from '../../../core/types.js'

export function createConsultarPresencaTool(supabase: SupabaseClient): AgentTool {
  return {
    definition: {
      type: 'function',
      function: {
        name: 'consultar_presenca',
        description: 'Consulta presença/faltas do aluno nas últimas aulas.',
        parameters: {
          type: 'object',
          properties: {
            aluno_id: { type: 'number', description: 'ID do aluno' },
          },
          required: ['aluno_id'],
        },
      },
    },
    handler: async (args) => {
      const alunoId = args.aluno_id as number

      const { data, error } = await supabase
        .from('aluno_presenca')
        .select('data_aula, status, horario_aula')
        .eq('aluno_id', alunoId)
        .order('data_aula', { ascending: false })
        .limit(10)

      if (error || !data) {
        return JSON.stringify({ error: 'Erro ao consultar presença' })
      }

      const total = data.length
      const presentes = data.filter((p) => p.status === 'presente').length
      const ausentes = data.filter((p) => p.status === 'ausente').length

      return JSON.stringify({
        aluno_id: alunoId,
        ultimas_aulas: data,
        resumo: { total, presentes, ausentes, percentual: total > 0 ? Math.round((presentes / total) * 100) : 0 },
      })
    },
  }
}
```

Create `src/agents/sol/tools/escalar-farmer.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentTool } from '../../../core/types.js'
import type { UazapiClient } from '../../../channels/uazapi.js'
import { logger } from '../../../core/logger.js'

export function createEscalarFarmerTool(supabase: SupabaseClient, uazapi: UazapiClient | null): AgentTool {
  return {
    definition: {
      type: 'function',
      function: {
        name: 'escalar_farmer',
        description: 'Escala o atendimento para um farmer humano. Pausa o bot para esse aluno e notifica o farmer via WhatsApp.',
        parameters: {
          type: 'object',
          properties: {
            motivo: { type: 'string', description: 'Motivo da escalação' },
            prioridade: { type: 'string', enum: ['baixa', 'media', 'alta', 'urgente'], description: 'Prioridade' },
            unidade_id: { type: 'string', description: 'UUID da unidade do aluno' },
            aluno_id: { type: 'number', description: 'ID do aluno' },
            telefone: { type: 'string', description: 'Telefone do aluno' },
            agent_id: { type: 'string', description: 'ID do agente que está escalando' },
          },
          required: ['motivo', 'prioridade', 'unidade_id', 'aluno_id', 'telefone', 'agent_id'],
        },
      },
    },
    handler: async (args) => {
      const { motivo, prioridade, unidade_id, aluno_id, telefone, agent_id } = args as {
        motivo: string; prioridade: string; unidade_id: string
        aluno_id: number; telefone: string; agent_id: string
      }

      // Find active farmer for this unit
      const { data: farmer } = await supabase
        .from('colaboradores')
        .select('id, nome, whatsapp')
        .eq('unidade_id', unidade_id)
        .eq('tipo', 'farmer')
        .eq('ativo', true)
        .single()

      if (!farmer) {
        return JSON.stringify({ escalado: false, erro: 'Nenhum farmer ativo encontrado para esta unidade' })
      }

      // Pause bot for this conversation
      await supabase
        .from('agent_conversas')
        .update({ bot_ativo: false, pausado_por: farmer.id, updated_at: new Date().toISOString() })
        .eq('agent_id', agent_id)
        .eq('telefone', telefone)

      // Log the escalation
      await supabase.from('agent_interacoes').insert({
        agent_id,
        aluno_id,
        unidade_id,
        telefone,
        tipo: 'escalacao',
        motivo,
        prioridade,
        escalado_para: farmer.id,
      })

      // Notify farmer via WhatsApp
      if (uazapi && farmer.whatsapp) {
        const msg = `🔔 *Escalação Sol*\n\nAluno ID: ${aluno_id}\nTelefone: ${telefone}\nMotivo: ${motivo}\nPrioridade: ${prioridade}`
        await uazapi.sendText(farmer.whatsapp, msg).catch((err) =>
          logger.error({ err }, 'Failed to notify farmer')
        )
      }

      return JSON.stringify({
        escalado: true,
        farmer_nome: farmer.nome,
        farmer_id: farmer.id,
        mensagem: `Escalado para ${farmer.nome}. Bot pausado para este aluno.`,
      })
    },
  }
}
```

Create `src/agents/sol/tools/index.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentTool } from '../../../core/types.js'
import type { UazapiClient } from '../../../channels/uazapi.js'
import { createConsultarAlunoTool } from './consultar-aluno.js'
import { createConsultarPagamentosTool } from './consultar-pagamentos.js'
import { createConsultarPresencaTool } from './consultar-presenca.js'
import { createEscalarFarmerTool } from './escalar-farmer.js'

export function createSolTools(supabase: SupabaseClient, uazapi: UazapiClient | null): AgentTool[] {
  return [
    createConsultarAlunoTool(supabase),
    createConsultarPagamentosTool(supabase),
    createConsultarPresencaTool(supabase),
    createEscalarFarmerTool(supabase, uazapi),
  ]
}
```

- [ ] **Step 5: Create Sol crons placeholder**

Create `src/agents/sol/crons.ts`:

```typescript
import type { CronJobDef } from '../../core/types.js'

// Crons will be implemented in Phase 3+ plans
// This file exports an empty array for now
export function createSolCrons(): CronJobDef[] {
  return []
}
```

- [ ] **Step 6: Create Sol agent registration**

Create `src/agents/sol/index.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { UazapiClient } from '../../channels/uazapi.js'
import type { AgentDefinition } from '../../core/types.js'
import { SOL_SYSTEM_PROMPT } from './prompt.js'
import { createSolTools } from './tools/index.js'
import { createSolCrons } from './crons.js'

export function createSolAgent(supabase: SupabaseClient, uazapi: UazapiClient | null): AgentDefinition {
  return {
    id: 'sol',
    name: 'Sol',
    description: 'Assistente de atendimento e sucesso do aluno da LA Music',
    systemPrompt: SOL_SYSTEM_PROMPT,
    tools: createSolTools(supabase, uazapi),
    crons: createSolCrons(),
    config: {
      model: 'gpt-4.1-mini',
      temperature: 0.7,
      maxTokens: 1024,
      maxToolRounds: 5,
      operatingHours: {
        weekday: { start: 8, end: 21 },
        saturday: { start: 8, end: 16 },
        sunday: null,
      },
    },
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run tests/agents/sol/tools.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 8: Commit**

```bash
git add src/agents/sol/ tests/agents/sol/
git commit -m "feat: add Sol agent with prompt, tools, and registration"
```

---

## Task 12: Main Entry Point — Wire Everything Together

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Create the main entry point**

Create `src/index.ts`:

```typescript
import 'dotenv/config'
import { config } from './config.js'
import { logger } from './core/logger.js'
import { registry } from './core/registry.js'
import { LLMEngine } from './core/engine.js'
import { ConversationMemory } from './core/memory.js'
import { Debouncer } from './channels/debounce.js'
import { UazapiClient } from './channels/uazapi.js'
import { processMedia } from './channels/media.js'
import { startServer } from './channels/server.js'
import { startAllCrons } from './core/cron.js'
import { supabase } from './db/supabase.js'
import { redis, connectRedis } from './db/redis.js'
import { createSolAgent } from './agents/sol/index.js'
import type { IncomingMessage } from './core/types.js'
import OpenAI from 'openai'

async function main() {
  logger.info('Starting LA Agents...')

  // Connect Redis
  await connectRedis()

  // Initialize OpenAI
  const openai = new OpenAI({ apiKey: config.openai.apiKey })
  const engine = new LLMEngine(openai)
  const memory = new ConversationMemory(supabase)

  // Resolve UAZAPI credentials (first active box)
  const { data: caixa } = await supabase
    .from('whatsapp_caixas')
    .select('id, nome, uazapi_url, uazapi_token')
    .eq('ativo', true)
    .limit(1)
    .single()

  const uazapi = caixa
    ? new UazapiClient({ baseUrl: caixa.uazapi_url, token: caixa.uazapi_token, caixaId: caixa.id, caixaNome: caixa.nome })
    : null

  if (!uazapi) logger.warn('No active UAZAPI box found — WhatsApp sending disabled')

  // Register agents
  const sol = createSolAgent(supabase, uazapi)
  registry.register(sol)

  // Message processing pipeline
  async function processMessage(agentId: string, phone: string, messages: IncomingMessage[]) {
    const agent = registry.get(agentId)
    if (!agent) return

    // Check operating hours
    if (!registry.isWithinOperatingHours(agentId)) {
      if (uazapi) {
        await uazapi.sendText(phone,
          'Olá! 😊\n\nNosso horário de atendimento é de segunda a sexta das 8h às 21h, e aos sábados das 8h às 16h.\n\nSua mensagem foi registrada e vou te responder assim que voltarmos!\n\nAté breve! ☀️'
        )
      }
      return
    }

    // Load conversation
    let conv = await memory.load(agentId, phone)
    if (!conv) {
      conv = {
        id: crypto.randomUUID(),
        phone,
        agentId,
        alunoId: null,
        unidadeId: null,
        botAtivo: true,
        pausadoPor: null,
        messages: [],
        context: {},
        updatedAt: new Date().toISOString(),
      }
    }

    // Check if bot is paused
    if (!conv.botAtivo) {
      logger.info({ agentId, phone }, 'Bot paused for this conversation, skipping')
      return
    }

    // Process media (transcribe audio, etc.) and combine all messages
    const processedParts: string[] = []
    for (const msg of messages) {
      const processed = await processMedia(uazapi!, msg)
      if (processed.content) processedParts.push(processed.content)
    }

    const combinedContent = processedParts.join('\n')
    if (!combinedContent.trim()) return

    // Add user message to conversation
    conv.messages.push({ role: 'user', content: combinedContent })

    // Run LLM
    const result = await engine.run({
      model: agent.config.model,
      temperature: agent.config.temperature,
      maxTokens: agent.config.maxTokens,
      systemPrompt: agent.systemPrompt,
      tools: agent.tools,
      messages: conv.messages,
      maxToolRounds: agent.config.maxToolRounds,
    })

    // Update conversation with full message history
    conv.messages = result.messages

    // Save conversation
    await memory.save(conv)

    // Log interaction
    await supabase.from('agent_interacoes').insert({
      agent_id: agentId,
      aluno_id: conv.alunoId,
      unidade_id: conv.unidadeId,
      telefone: phone,
      tipo: 'conversa',
      mensagem_entrada: combinedContent,
      resposta: result.response,
      tools_usadas: result.toolCalls.map((t) => t.name),
      tokens_usados: result.tokensUsed,
      modelo: agent.config.model,
    }).catch((err) => logger.error({ err }, 'Failed to log interaction'))

    // Send response via WhatsApp
    if (uazapi && result.response) {
      // Split long messages into chunks of ~350 chars at sentence boundaries
      const chunks = splitMessage(result.response, 350)
      for (const chunk of chunks) {
        await uazapi.sendText(phone, chunk)
      }
    }
  }

  // Debouncer
  const debouncer = new Debouncer(redis, processMessage, config.debounce.defaultMs)

  // Start webhook server
  await startServer((agentId, message) => {
    debouncer.add(agentId, message)
    return Promise.resolve()
  })

  // Start crons
  startAllCrons()

  logger.info({ agents: registry.list().map((a) => a.id) }, 'LA Agents ready')
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > maxLen) {
    let splitAt = remaining.lastIndexOf('\n', maxLen)
    if (splitAt < maxLen * 0.5) splitAt = remaining.lastIndexOf('. ', maxLen)
    if (splitAt < maxLen * 0.5) splitAt = remaining.lastIndexOf(' ', maxLen)
    if (splitAt < maxLen * 0.5) splitAt = maxLen

    chunks.push(remaining.substring(0, splitAt + 1).trim())
    remaining = remaining.substring(splitAt + 1).trim()
  }
  if (remaining) chunks.push(remaining)

  return chunks
}

main().catch((err) => {
  logger.fatal({ err }, 'Fatal error')
  process.exit(1)
})
```

- [ ] **Step 2: Add dotenv dependency**

Run: `cd "C:/Users/hugog/OneDrive/Desktop/Projects/LA Music/la-agents" && npm install dotenv`

- [ ] **Step 3: Commit**

```bash
git add src/index.ts package.json package-lock.json
git commit -m "feat: add main entry point wiring agents, server, debounce, crons"
```

---

## Task 13: Supabase Migration — Agent Tables

**Files:**
- Create: migration SQL (run via Supabase MCP or migration file)

- [ ] **Step 1: Create the migration**

Run via Supabase MCP `apply_migration`:

```sql
-- Multi-agent conversation state
CREATE TABLE agent_conversas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    agent_id VARCHAR(50) NOT NULL,
    telefone VARCHAR(20) NOT NULL,
    aluno_id INTEGER REFERENCES alunos(id),
    unidade_id UUID REFERENCES unidades(id),
    bot_ativo BOOLEAN DEFAULT true,
    pausado_por INTEGER REFERENCES colaboradores(id),
    mensagens JSONB DEFAULT '[]',
    contexto JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(agent_id, telefone)
);

CREATE INDEX idx_agent_conversas_lookup ON agent_conversas(agent_id, telefone);
CREATE INDEX idx_agent_conversas_ativo ON agent_conversas(agent_id, bot_ativo);

-- Multi-agent interaction log
CREATE TABLE agent_interacoes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    agent_id VARCHAR(50) NOT NULL,
    aluno_id INTEGER REFERENCES alunos(id),
    unidade_id UUID REFERENCES unidades(id),
    telefone VARCHAR(20),
    tipo VARCHAR(50) NOT NULL,
    mensagem_entrada TEXT,
    resposta TEXT,
    motivo TEXT,
    prioridade VARCHAR(20),
    escalado_para INTEGER REFERENCES colaboradores(id),
    tools_usadas TEXT[],
    tokens_usados INTEGER,
    modelo VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agent_interacoes_agent ON agent_interacoes(agent_id, created_at DESC);
CREATE INDEX idx_agent_interacoes_aluno ON agent_interacoes(aluno_id);
CREATE INDEX idx_agent_interacoes_tipo ON agent_interacoes(tipo);
```

- [ ] **Step 2: Verify tables were created**

Run via Supabase MCP `execute_sql`:
```sql
SELECT tablename FROM pg_tables WHERE tablename LIKE 'agent_%' ORDER BY tablename;
```
Expected: `agent_conversas`, `agent_interacoes`

- [ ] **Step 3: Commit migration file if using local migrations**

```bash
git add supabase/migrations/
git commit -m "feat: add agent_conversas and agent_interacoes tables"
```

---

## Task 14: Docker Setup

**Files:**
- Create: `la-agents/Dockerfile`
- Create: `la-agents/docker-compose.yml`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Create docker-compose.yml**

```yaml
version: '3.8'

services:
  la-agents:
    build: .
    container_name: la-agents
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - .env
    environment:
      - NODE_ENV=production
      - TZ=America/Sao_Paulo
      - REDIS_URL=redis://redis_n8n:6379
    networks:
      - agent_net
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

networks:
  agent_net:
    external: true
    name: redis_n8n_default  # same network as existing Redis
```

> **Note:** The exact Redis network name must be verified on the VPS with `docker network ls`. Adjust `agent_net.name` to match the network where `redis_n8n` is attached.

- [ ] **Step 3: Test Docker build locally**

Run: `cd "C:/Users/hugog/OneDrive/Desktop/Projects/LA Music/la-agents" && docker build -t la-agents:test .`
Expected: Build completes without errors

- [ ] **Step 4: Commit**

```bash
git add Dockerfile docker-compose.yml
git commit -m "feat: add Dockerfile and docker-compose for VPS deployment"
```

---

## Task 15: Run All Tests

- [ ] **Step 1: Run full test suite**

Run: `cd "C:/Users/hugog/OneDrive/Desktop/Projects/LA Music/la-agents" && npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Fix any failures, then commit**

```bash
git add -A
git commit -m "test: all core tests passing"
```

---

## Deployment Checklist (Post-Implementation)

After all tasks are done, deploy to VPS:

1. **Push code** to git remote
2. **SSH into banco.de.dados:** `ssh root@72.60.15.4`
3. **Clone repo** and create `.env` with real credentials
4. **Verify Redis network:** `docker network ls` — find the network name
5. **Build and start:** `docker compose up -d --build`
6. **Verify:** `curl http://72.60.15.4:3000/health`
7. **Configure UAZAPI webhook** to point to `http://72.60.15.4:3000/webhook/sol`
8. **Test:** send a WhatsApp message to the UAZAPI number
9. **Activate UFW:** `ufw allow from 217.196.63.23 to any port 3000 && ufw enable`

---

## Adding a New Agent (Future)

To add a new agent (e.g., "fiscal"), just:

1. Create `src/agents/fiscal/index.ts`, `prompt.ts`, `tools/`
2. Register in `src/index.ts`: `registry.register(createFiscalAgent(supabase))`
3. Configure UAZAPI webhook to `http://72.60.15.4:3000/webhook/fiscal`
4. Redeploy: `docker compose up -d --build`

No infrastructure changes needed.
