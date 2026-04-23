# Sol Sandbox — Teste e Validação do Bot

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um projeto isolado para testar e validar o agente Sol (conversa, tools, function calling) sem tocar no Supabase de produção. Testar via terminal e via HTTP, opcionalmente conectar WhatsApp.

**Architecture:** Fastify server com OpenAI function calling. Sem Supabase — tools usam dados mock (alunos fake). Conversa mantida em memória. Teste via curl/terminal ou conectando UAZAPI de teste.

**Tech Stack:** Node.js 20, TypeScript, Fastify, OpenAI SDK

**Project location:** `C:\Users\hugog\OneDrive\Desktop\Projects\LA Music\sol-sandbox\`

---

## File Structure

```
sol-sandbox/
├── src/
│   ├── index.ts              ← Entry: inicia server + CLI mode
│   ├── config.ts             ← Env vars (só OPENAI_API_KEY)
│   ├── engine.ts             ← OpenAI function calling loop
│   ├── prompt.ts             ← System prompt da Sol
│   ├── tools.ts              ← Tools com dados mock (sem banco)
│   ├── conversation.ts       ← Memória em Map (in-memory)
│   ├── server.ts             ← Fastify webhook + chat endpoint
│   └── mock-data.ts          ← Alunos, unidades, pagamentos fake
├── package.json
├── tsconfig.json
├── .env
└── .gitignore
```

**Total: 8 arquivos de código.** Sem Docker, sem Redis, sem Supabase, sem deploy.

---

## Task 1: Scaffolding

**Files:**
- Create: `sol-sandbox/package.json`
- Create: `sol-sandbox/tsconfig.json`
- Create: `sol-sandbox/.env`
- Create: `sol-sandbox/.gitignore`

- [ ] **Step 1: Criar diretório e package.json**

```bash
cd "C:\Users\hugog\OneDrive\Desktop\Projects\LA Music"
mkdir sol-sandbox && cd sol-sandbox
```

```json
{
  "name": "sol-sandbox",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "chat": "tsx src/index.ts --cli",
    "start": "tsx src/index.ts"
  },
  "dependencies": {
    "fastify": "^5.3.0",
    "openai": "^4.85.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.8.0"
  }
}
```

- [ ] **Step 2: tsconfig.json**

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
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: .env e .gitignore**

`.env`:
```env
OPENAI_API_KEY=sk-...
PORT=3000
MY_PHONE=5521999990001
```

> `MY_PHONE` define qual aluno mock você simula por padrão no modo CLI. Use um dos telefones mock (5521999990001, 5521999990002, 5521999990003) ou qualquer número para testar "não encontrado".

`.gitignore`:
```
node_modules/
dist/
.env
```

- [ ] **Step 4: npm install**

Run: `npm install`

- [ ] **Step 5: Commit**

```bash
git init && git add -A && git commit -m "chore: scaffold sol-sandbox"
```

---

## Task 2: Config + Mock Data

**Files:**
- Create: `src/config.ts`
- Create: `src/mock-data.ts`

- [ ] **Step 1: config.ts**

```typescript
export const config = {
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  port: parseInt(process.env.PORT ?? '3000', 10),
  myPhone: process.env.MY_PHONE ?? '5521999990001',
}

if (!config.openaiApiKey) {
  console.error('OPENAI_API_KEY não configurada no .env')
  process.exit(1)
}
```

- [ ] **Step 2: mock-data.ts — dados fake para testar as tools**

```typescript
export interface MockAluno {
  id: number
  nome: string
  telefone: string
  curso: string
  unidade: string
  unidade_codigo: string
  status: string
  valor_parcela: number
  data_matricula: string
  health_score: string
  health_score_numerico: number
  fase_jornada: string
  professor: string
  aulas_no_pacote: number
}

export interface MockPagamento {
  aluno_id: number
  mes: number
  ano: number
  status: string
  valor: number
  vencimento: string
}

export interface MockPresenca {
  aluno_id: number
  data_aula: string
  status: string
}

export interface MockColaborador {
  id: number
  nome: string
  tipo: string
  unidade_codigo: string
  whatsapp: string
}

// ─── ALUNOS FAKE ───

export const alunos: MockAluno[] = [
  {
    id: 1,
    nome: 'Maria Silva',
    telefone: '5521999990001',
    curso: 'Piano',
    unidade: 'Campo Grande',
    unidade_codigo: 'CG',
    status: 'ativo',
    valor_parcela: 397,
    data_matricula: '2025-06-15',
    health_score: 'saudavel',
    health_score_numerico: 85,
    fase_jornada: 'encantamento',
    professor: 'Prof. Rafael',
    aulas_no_pacote: 28,
  },
  {
    id: 2,
    nome: 'João Pedro Santos',
    telefone: '5521999990002',
    curso: 'Guitarra',
    unidade: 'Recreio',
    unidade_codigo: 'REC',
    status: 'ativo',
    valor_parcela: 450,
    data_matricula: '2025-11-01',
    health_score: 'atencao',
    health_score_numerico: 55,
    fase_jornada: 'consolidacao',
    professor: 'Prof. Lucas',
    aulas_no_pacote: 12,
  },
  {
    id: 3,
    nome: 'Ana Beatriz Oliveira',
    telefone: '5521999990003',
    curso: 'Canto',
    unidade: 'Centro Metropolitano',
    unidade_codigo: 'BAR',
    status: 'ativo',
    valor_parcela: 380,
    data_matricula: '2026-01-10',
    health_score: 'critico',
    health_score_numerico: 30,
    fase_jornada: 'onboarding',
    professor: 'Prof. Camila',
    aulas_no_pacote: 5,
  },
]

// ─── PAGAMENTOS FAKE ───

export const pagamentos: MockPagamento[] = [
  // Maria — em dia
  { aluno_id: 1, mes: 4, ano: 2026, status: 'pago', valor: 397, vencimento: '2026-04-10' },
  { aluno_id: 1, mes: 3, ano: 2026, status: 'pago', valor: 397, vencimento: '2026-03-10' },
  { aluno_id: 1, mes: 2, ano: 2026, status: 'pago', valor: 397, vencimento: '2026-02-10' },
  // João — atrasado mês atual
  { aluno_id: 2, mes: 4, ano: 2026, status: 'pendente', valor: 450, vencimento: '2026-04-05' },
  { aluno_id: 2, mes: 3, ano: 2026, status: 'pago', valor: 450, vencimento: '2026-03-05' },
  // Ana — 2 meses atrasada
  { aluno_id: 3, mes: 4, ano: 2026, status: 'pendente', valor: 380, vencimento: '2026-04-15' },
  { aluno_id: 3, mes: 3, ano: 2026, status: 'pendente', valor: 380, vencimento: '2026-03-15' },
  { aluno_id: 3, mes: 2, ano: 2026, status: 'pago', valor: 380, vencimento: '2026-02-15' },
]

// ─── PRESENÇA FAKE ───

export const presencas: MockPresenca[] = [
  // Maria — frequente
  { aluno_id: 1, data_aula: '2026-04-07', status: 'presente' },
  { aluno_id: 1, data_aula: '2026-03-31', status: 'presente' },
  { aluno_id: 1, data_aula: '2026-03-24', status: 'presente' },
  { aluno_id: 1, data_aula: '2026-03-17', status: 'ausente' },
  { aluno_id: 1, data_aula: '2026-03-10', status: 'presente' },
  // João — faltando
  { aluno_id: 2, data_aula: '2026-04-05', status: 'ausente' },
  { aluno_id: 2, data_aula: '2026-03-29', status: 'ausente' },
  { aluno_id: 2, data_aula: '2026-03-22', status: 'presente' },
  { aluno_id: 2, data_aula: '2026-03-15', status: 'ausente' },
  // Ana — quase nenhuma
  { aluno_id: 3, data_aula: '2026-04-03', status: 'ausente' },
  { aluno_id: 3, data_aula: '2026-03-27', status: 'ausente' },
  { aluno_id: 3, data_aula: '2026-03-20', status: 'ausente' },
]

// ─── EQUIPE FAKE ───

export const colaboradores: MockColaborador[] = [
  { id: 1, nome: 'Gabi', tipo: 'farmer', unidade_codigo: 'CG', whatsapp: '5521888880001' },
  { id: 2, nome: 'Fernanda', tipo: 'farmer', unidade_codigo: 'REC', whatsapp: '5521888880002' },
  { id: 3, nome: 'Duda', tipo: 'farmer', unidade_codigo: 'BAR', whatsapp: '5521888880003' },
  { id: 4, nome: 'Jeremias', tipo: 'gerente', unidade_codigo: 'CG', whatsapp: '5521888880004' },
  { id: 5, nome: 'Críssia', tipo: 'gerente', unidade_codigo: 'REC', whatsapp: '5521888880005' },
]

// ─── HELPERS ───

export function findAlunoByPhone(phone: string): MockAluno | undefined {
  const cleaned = phone.replace(/\D/g, '')
  return alunos.find((a) => a.telefone === cleaned)
}

export function findPagamentos(alunoId: number): MockPagamento[] {
  return pagamentos
    .filter((p) => p.aluno_id === alunoId)
    .sort((a, b) => b.ano - a.ano || b.mes - a.mes)
}

export function findPresencas(alunoId: number): MockPresenca[] {
  return presencas.filter((p) => p.aluno_id === alunoId)
}

export function findFarmer(unidadeCodigo: string): MockColaborador | undefined {
  return colaboradores.find((c) => c.unidade_codigo === unidadeCodigo && c.tipo === 'farmer')
}
```

- [ ] **Step 3: Commit**

```bash
git add src/config.ts src/mock-data.ts && git commit -m "feat: add config and mock data (3 alunos, pagamentos, presença)"
```

---

## Task 3: OpenAI Engine (Function Calling Loop)

**Files:**
- Create: `src/engine.ts`

- [ ] **Step 1: Implement engine**

```typescript
import OpenAI from 'openai'
import type { ChatCompletionTool, ChatCompletionMessageParam } from 'openai/resources/chat/completions'

export interface Tool {
  definition: ChatCompletionTool
  handler: (args: Record<string, unknown>) => Promise<string>
}

export interface EngineResult {
  response: string
  toolCalls: { name: string; args: Record<string, unknown>; result: string }[]
  tokensUsed: number
}

export class Engine {
  private client: OpenAI

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey })
  }

  async run(opts: {
    model: string
    systemPrompt: string
    messages: ChatCompletionMessageParam[]
    tools: Tool[]
    maxRounds?: number
  }): Promise<EngineResult> {
    const { model, systemPrompt, tools, maxRounds = 5 } = opts
    const toolMap = new Map(tools.map((t) => [t.definition.function.name, t]))
    const toolDefs = tools.map((t) => t.definition)
    const toolCalls: EngineResult['toolCalls'] = []
    let tokensUsed = 0

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...opts.messages,
    ]

    for (let round = 0; round <= maxRounds; round++) {
      const completion = await this.client.chat.completions.create({
        model,
        temperature: 0.7,
        max_tokens: 1024,
        messages,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
      })

      const choice = completion.choices[0]
      tokensUsed += completion.usage?.total_tokens ?? 0

      // Text response — done
      if (!choice.message.tool_calls?.length) {
        return {
          response: choice.message.content ?? '',
          toolCalls,
          tokensUsed,
        }
      }

      // Max rounds — bail
      if (round === maxRounds) {
        return {
          response: choice.message.content ?? 'Desculpe, não consegui processar. Vou passar para a equipe.',
          toolCalls,
          tokensUsed,
        }
      }

      // Execute tools
      messages.push(choice.message)

      for (const tc of choice.message.tool_calls) {
        const tool = toolMap.get(tc.function.name)
        const args = JSON.parse(tc.function.arguments) as Record<string, unknown>
        let result: string

        if (!tool) {
          result = JSON.stringify({ error: `Tool "${tc.function.name}" not found` })
        } else {
          try {
            result = await tool.handler(args)
            toolCalls.push({ name: tc.function.name, args, result })
            console.log(`  🔧 ${tc.function.name}(${JSON.stringify(args)}) → ${result.substring(0, 100)}...`)
          } catch (err) {
            result = JSON.stringify({ error: (err as Error).message })
          }
        }

        messages.push({ role: 'tool', content: result, tool_call_id: tc.id })
      }
    }

    return { response: '', toolCalls, tokensUsed }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/engine.ts && git commit -m "feat: add OpenAI function calling engine"
```

---

## Task 4: Sol Prompt + Tools (Mock)

**Files:**
- Create: `src/prompt.ts`
- Create: `src/tools.ts`

- [ ] **Step 1: prompt.ts — system prompt da Sol**

```typescript
export const SOL_PROMPT = `# IDENTIDADE

Você é a **Sol**, assistente de atendimento e sucesso do aluno da **LA Music**, a maior escola de música do Rio de Janeiro.

## O que você FAZ:
- Gestão financeira: informar status de pagamento, orientar
- Atendimento administrativo: responder dúvidas, orientar sobre regras
- Escalação inteligente: passar para humanos quando necessário
- Sucesso do aluno: identificar riscos, demonstrar cuidado

## O que você NÃO FAZ:
- Vender cursos ou fazer matrícula
- Prometer descontos ou negociar valores
- Cancelar matrículas diretamente
- Inventar informações

## REGRAS DE COMUNICAÇÃO
1. Respostas curtas: máximo 350 caracteres por bloco
2. Use primeiro nome: sempre personalize
3. Emojis moderados
4. Quebre mensagens longas em blocos separados por \\n\\n

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
- Solicitação presencial obrigatória

### Cancelamento
- Sem multa, mas com aviso prévio (mês vigente + subsequente)
- Solicitação: presencial ou e-mail (NÃO aceita WhatsApp)
- NUNCA tente reverter — sempre escale

### Pagamentos
- Atraso perde desconto condicional
- Multa: 2% + Juros: 1% a.m.
- Atraso > 30 dias = rescisão automática

## ESCALAÇÃO OBRIGATÓRIA
SEMPRE escale quando ouvir: cancelar, desistir, reclamação, insatisfeito, advogado, procon, trancar, não consigo pagar, desconto, negociar.

Como escalar:
1. Responda com empatia
2. Use a tool escalar_farmer
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
1. SEMPRE comece usando consultar_aluno com o telefone do remetente
2. Personalize com nome, curso, unidade
3. Se não encontrar o aluno, pergunte se é aluno ou responsável
4. Se detectar gatilho de escalação → use escalar_farmer
5. Se pergunta sobre pagamento → use consultar_pagamentos
6. Se pergunta sobre presença/faltas → use consultar_presenca`
```

- [ ] **Step 2: tools.ts — tools que usam mock-data**

```typescript
import type { Tool } from './engine.js'
import { findAlunoByPhone, findPagamentos, findPresencas, findFarmer } from './mock-data.js'

export function createTools(): Tool[] {
  return [
    {
      definition: {
        type: 'function',
        function: {
          name: 'consultar_aluno',
          description: 'Busca dados do aluno pelo telefone. Use SEMPRE no início da conversa.',
          parameters: {
            type: 'object',
            properties: {
              telefone: { type: 'string', description: 'Telefone do aluno (ex: 5521999990001)' },
            },
            required: ['telefone'],
          },
        },
      },
      handler: async (args) => {
        const aluno = findAlunoByPhone(args.telefone as string)
        if (!aluno) {
          return JSON.stringify({ encontrado: false, mensagem: 'Aluno não encontrado com este telefone.' })
        }
        return JSON.stringify({ encontrado: true, ...aluno })
      },
    },

    {
      definition: {
        type: 'function',
        function: {
          name: 'consultar_pagamentos',
          description: 'Consulta últimas parcelas do aluno.',
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
        const pags = findPagamentos(args.aluno_id as number)
        if (pags.length === 0) return JSON.stringify({ erro: 'Nenhum pagamento encontrado' })

        const hoje = new Date()
        const comAtraso = pags.map((p) => {
          const venc = new Date(p.vencimento)
          const diasAtraso = p.status === 'pendente' ? Math.max(0, Math.floor((hoje.getTime() - venc.getTime()) / 86400000)) : 0
          return { ...p, dias_atraso: diasAtraso }
        })

        return JSON.stringify({ aluno_id: args.aluno_id, parcelas: comAtraso })
      },
    },

    {
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
        const lista = findPresencas(args.aluno_id as number)
        const total = lista.length
        const presentes = lista.filter((p) => p.status === 'presente').length
        const ausentes = total - presentes

        return JSON.stringify({
          aluno_id: args.aluno_id,
          aulas: lista,
          resumo: { total, presentes, ausentes, percentual: total > 0 ? Math.round((presentes / total) * 100) : 0 },
        })
      },
    },

    {
      definition: {
        type: 'function',
        function: {
          name: 'escalar_farmer',
          description: 'Escala o atendimento para um farmer humano. Use quando detectar gatilhos de escalação.',
          parameters: {
            type: 'object',
            properties: {
              motivo: { type: 'string', description: 'Motivo da escalação' },
              prioridade: { type: 'string', enum: ['baixa', 'media', 'alta', 'urgente'] },
              unidade_codigo: { type: 'string', description: 'Código da unidade (CG, REC, BAR)' },
            },
            required: ['motivo', 'prioridade', 'unidade_codigo'],
          },
        },
      },
      handler: async (args) => {
        const farmer = findFarmer(args.unidade_codigo as string)
        if (!farmer) {
          return JSON.stringify({ escalado: false, erro: 'Farmer não encontrado' })
        }
        console.log(`\n  🚨 ESCALAÇÃO → ${farmer.nome} (${farmer.whatsapp}) | Motivo: ${args.motivo}\n`)
        return JSON.stringify({
          escalado: true,
          farmer_nome: farmer.nome,
          mensagem: `Escalado para ${farmer.nome}. Bot seria pausado para este aluno.`,
        })
      },
    },
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add src/prompt.ts src/tools.ts && git commit -m "feat: add Sol prompt and mock tools"
```

---

## Task 5: Conversation Memory (In-Memory)

**Files:**
- Create: `src/conversation.ts`

- [ ] **Step 1: Implement in-memory conversation store**

```typescript
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

const MAX_MESSAGES = 30

export class ConversationStore {
  private conversations = new Map<string, ChatCompletionMessageParam[]>()

  get(phone: string): ChatCompletionMessageParam[] {
    return this.conversations.get(phone) ?? []
  }

  addUser(phone: string, content: string): ChatCompletionMessageParam[] {
    const msgs = this.get(phone)
    msgs.push({ role: 'user', content })
    const trimmed = msgs.slice(-MAX_MESSAGES)
    this.conversations.set(phone, trimmed)
    return trimmed
  }

  addAssistant(phone: string, content: string): void {
    const msgs = this.get(phone)
    msgs.push({ role: 'assistant', content })
    this.conversations.set(phone, msgs.slice(-MAX_MESSAGES))
  }

  clear(phone: string): void {
    this.conversations.delete(phone)
  }

  list(): string[] {
    return Array.from(this.conversations.keys())
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/conversation.ts && git commit -m "feat: add in-memory conversation store"
```

---

## Task 6: Server + CLI — Dois Modos de Teste

**Files:**
- Create: `src/server.ts`
- Create: `src/index.ts`

- [ ] **Step 1: server.ts — Fastify com 2 endpoints**

```typescript
import Fastify from 'fastify'
import { Engine } from './engine.js'
import { SOL_PROMPT } from './prompt.js'
import { createTools } from './tools.js'
import { ConversationStore } from './conversation.js'
import { config } from './config.js'

export async function startServer() {
  const app = Fastify({ logger: false })
  const engine = new Engine(config.openaiApiKey)
  const tools = createTools()
  const store = new ConversationStore()

  // ─── POST /chat — teste via curl/Postman ───
  // Body: { "phone": "5521999990001", "message": "Oi" }
  // Response: { "response": "...", "toolCalls": [...], "tokens": 123 }

  app.post<{ Body: { phone: string; message: string } }>('/chat', async (request) => {
    const { phone, message } = request.body
    const messages = store.addUser(phone, message)

    const result = await engine.run({
      model: 'gpt-4.1-mini',
      systemPrompt: SOL_PROMPT,
      messages,
      tools,
    })

    store.addAssistant(phone, result.response)

    return {
      response: result.response,
      toolCalls: result.toolCalls.map((t) => ({ name: t.name, args: t.args })),
      tokens: result.tokensUsed,
    }
  })

  // ─── POST /webhook/sol — simula webhook UAZAPI ───
  // Mesmo formato que UAZAPI mandaria
  app.post('/webhook/sol', async (request) => {
    const body = request.body as Record<string, unknown>
    const msg = body.message as Record<string, unknown> | undefined
    if (!msg) return { ok: true, skipped: true }

    const chatid = msg.chatid as string
    if (!chatid?.includes('@s.whatsapp.net')) return { ok: true, skipped: true }
    if (msg.fromMe) return { ok: true, skipped: true }

    const phone = chatid.split('@')[0]
    const content = (msg.body as string) ?? ''

    const messages = store.addUser(phone, content)
    const result = await engine.run({
      model: 'gpt-4.1-mini',
      systemPrompt: SOL_PROMPT,
      messages,
      tools,
    })

    store.addAssistant(phone, result.response)

    console.log(`\n📱 ${phone}: ${content}`)
    console.log(`☀️ Sol: ${result.response}\n`)

    return { ok: true, response: result.response }
  })

  // ─── GET /health ───
  app.get('/health', async () => ({
    status: 'ok',
    agent: 'sol-sandbox',
    conversations: store.list().length,
  }))

  // ─── GET /conversations — ver estado atual ───
  app.get('/conversations', async () => {
    const phones = store.list()
    return phones.map((phone) => ({
      phone,
      messageCount: store.get(phone).length,
      lastMessage: store.get(phone).at(-1)?.content?.toString().substring(0, 100),
    }))
  })

  // ─── POST /reset — limpar conversa ───
  app.post<{ Body: { phone: string } }>('/reset', async (request) => {
    store.clear(request.body.phone)
    return { ok: true, cleared: request.body.phone }
  })

  await app.listen({ port: config.port, host: '0.0.0.0' })
  console.log(`\n🌞 Sol Sandbox rodando em http://localhost:${config.port}`)
  console.log(`\n  Endpoints:`)
  console.log(`    POST /chat         — { "phone": "5521999990001", "message": "Oi" }`)
  console.log(`    POST /webhook/sol  — formato UAZAPI`)
  console.log(`    GET  /health       — status`)
  console.log(`    GET  /conversations — conversas ativas`)
  console.log(`    POST /reset        — { "phone": "..." } limpa conversa`)
  console.log(`\n  Alunos mock:`)
  console.log(`    5521999990001 — Maria (Piano/CG, em dia, saudável)`)
  console.log(`    5521999990002 — João (Guitarra/REC, parcela atrasada, atenção)`)
  console.log(`    5521999990003 — Ana (Canto/Barra, 2 meses atrasada, crítico)`)
  console.log(`    5521000000000 — Número desconhecido\n`)

  return app
}
```

- [ ] **Step 2: index.ts — entry point com modo CLI e modo server**

```typescript
import 'dotenv/config'
import { config } from './config.js'
import { startServer } from './server.js'
import { Engine } from './engine.js'
import { SOL_PROMPT } from './prompt.js'
import { createTools } from './tools.js'
import { ConversationStore } from './conversation.js'
import * as readline from 'readline'

const isCli = process.argv.includes('--cli')

if (isCli) {
  // ─── MODO CLI — conversa direto no terminal ───
  const engine = new Engine(config.openaiApiKey)
  const tools = createTools()
  const store = new ConversationStore()
  const phone = '5521999990001' // simula Maria por padrão

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  console.log('\n🌞 Sol Sandbox — Modo CLI')
  console.log(`Simulando conversa como telefone: ${phone} (Maria/Piano/CG)`)
  console.log('Digite "trocar NUMERO" para mudar de aluno')
  console.log('Digite "sair" para encerrar\n')

  let currentPhone = phone

  const ask = () => {
    rl.question('Você: ', async (input) => {
      const trimmed = input.trim()
      if (!trimmed) return ask()

      if (trimmed.toLowerCase() === 'sair') {
        console.log('\n👋 Até mais!')
        rl.close()
        process.exit(0)
      }

      if (trimmed.toLowerCase().startsWith('trocar ')) {
        currentPhone = trimmed.split(' ')[1]
        console.log(`\n📱 Agora simulando telefone: ${currentPhone}\n`)
        return ask()
      }

      const messages = store.addUser(currentPhone, trimmed)

      try {
        const result = await engine.run({
          model: 'gpt-4.1-mini',
          systemPrompt: SOL_PROMPT,
          messages,
          tools,
        })

        store.addAssistant(currentPhone, result.response)

        console.log(`\n☀️ Sol: ${result.response}`)
        console.log(`   [tokens: ${result.tokensUsed} | tools: ${result.toolCalls.map((t) => t.name).join(', ') || 'nenhuma'}]\n`)
      } catch (err) {
        console.error(`\n❌ Erro: ${(err as Error).message}\n`)
      }

      ask()
    })
  }

  ask()
} else {
  // ─── MODO SERVER ───
  startServer().catch((err) => {
    console.error('Fatal:', err)
    process.exit(1)
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add src/server.ts src/index.ts && git commit -m "feat: add server (HTTP) and CLI modes for testing"
```

---

## Task 7: Testar

- [ ] **Step 1: Testar modo CLI**

```bash
cd "C:/Users/hugog/OneDrive/Desktop/Projects/LA Music/sol-sandbox"
npm run chat
```

Cenários para testar:
1. `Oi` → Sol deve usar consultar_aluno e saudar Maria pelo nome
2. `Qual o status do meu pagamento?` → Sol deve usar consultar_pagamentos
3. `Faltei nas últimas aulas, como faço reposição?` → Sol deve explicar regra do atestado
4. `Quero cancelar minha matrícula` → Sol deve escalar para farmer
5. `trocar 5521999990002` + `Oi` → Sol sauda João
6. `trocar 5521999990003` + `Como tá meu pagamento?` → Sol informa 2 meses atrasados
7. `trocar 5521000000000` + `Oi` → Sol não encontra aluno

- [ ] **Step 2: Testar modo HTTP**

```bash
# Terminal 1: iniciar server
npm start

# Terminal 2: testar via curl
curl -s http://localhost:3000/health | jq .

curl -s -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"phone":"5521999990001","message":"Oi, tudo bem?"}' | jq .

curl -s -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"phone":"5521999990001","message":"Quero cancelar"}' | jq .

# Ver conversas ativas
curl -s http://localhost:3000/conversations | jq .

# Limpar conversa
curl -s -X POST http://localhost:3000/reset \
  -H "Content-Type: application/json" \
  -d '{"phone":"5521999990001"}' | jq .
```

- [ ] **Step 3: Testar webhook simulando UAZAPI**

```bash
curl -s -X POST http://localhost:3000/webhook/sol \
  -H "Content-Type: application/json" \
  -d '{
    "event": "messages",
    "instance": "test",
    "message": {
      "chatid": "5521999990002@s.whatsapp.net",
      "fromMe": false,
      "id": "msg_test_1",
      "type": "conversation",
      "body": "Oi, meu pagamento tá atrasado?",
      "timestamp": 1712500000
    }
  }' | jq .
```

- [ ] **Step 4: Documentar resultados e ajustar prompt se necessário**

Após cada teste, avaliar:
- Sol está usando as tools corretamente?
- Respostas estão curtas e empáticas?
- Escalação funciona nos gatilhos certos?
- Informações das unidades estão corretas?

Ajustar `src/prompt.ts` conforme necessário e re-testar.

- [ ] **Step 5: Commit final**

```bash
git add -A && git commit -m "test: validated Sol conversation flow with mock data"
```

---

## Como Rodar (Resumo)

```bash
# Modo CLI (conversa no terminal)
npm run chat

# Modo servidor (teste via curl/Postman)
npm start

# Dev mode (hot reload)
npm run dev
```

## Próximos Passos (após validar)

1. Satisfeito com o prompt e tools? → Voltar ao plano `2026-04-08-la-agents-core.md`
2. Ajustar prompt? → Editar `src/prompt.ts` e re-testar
3. Adicionar tools? → Criar nova function em `src/tools.ts`
4. Conectar WhatsApp real? → Apontar webhook UAZAPI para `http://IP:3000/webhook/sol`
