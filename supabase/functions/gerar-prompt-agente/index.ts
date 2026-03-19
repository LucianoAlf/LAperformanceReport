/**
 * gerar-prompt-agente — Gera system prompts otimizados para agentes WhatsApp
 * usando GPT-4o-mini como meta-prompter.
 *
 * POST body: { objetivo, tom_voz, info_escola, regras, perguntas, idioma, tools_habilitadas }
 * Response: { prompt: string }
 */
import { createServiceClient } from '../_shared/supabase-client.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Tools descriptions para incluir no meta-prompt ──────────────────────────

const TOOL_DESCRIPTIONS: Record<string, string> = {
  transfer: 'Transfere o lead para um consultor humano. Use quando o lead estiver qualificado, pedir atendente, ou você não conseguir resolver.',
  think: 'Raciocínio interno antes de responder (não visível ao lead). Use para planejar respostas complexas.',
  send_buttons: 'Envia mensagem com até 3 botões de resposta rápida. Use para perguntas com opções claras (ex: "Quer agendar?", "Qual unidade?"). Cada botão tem no máximo 20 caracteres.',
  send_list: 'Envia menu expandível com até 10 opções. Use quando há muitas opções (ex: lista de cursos, horários). Cada item tem título (24 chars) e descrição opcional (72 chars).',
}

// ─── Meta-prompt ─────────────────────────────────────────────────────────────

function buildMetaPrompt(params: {
  objetivo: string
  tom_voz: string
  info_escola: string
  regras: string
  perguntas: string
  idioma: string
  tools_habilitadas: string[]
}): string {
  const toolsSection = params.tools_habilitadas
    .filter(t => TOOL_DESCRIPTIONS[t])
    .map(t => `- \`${t}\`: ${TOOL_DESCRIPTIONS[t]}`)
    .join('\n')

  return `Você é um arquiteto de agentes IA especializado em criar system prompts para agentes de WhatsApp de escolas de música.

## Sua tarefa
Gere um system prompt otimizado seguindo a hierarquia:
[Contexto/Persona] → [Objetivo] → [Regras] → [Tools disponíveis] → [Formato de resposta]

## Informações do agente
- **Objetivo:** ${params.objetivo}
- **Tom de voz:** ${params.tom_voz}
- **Informações da escola:** ${params.info_escola || 'Não fornecidas — peça ao agente para ser genérico'}
- **Regras específicas:** ${params.regras || 'Nenhuma regra especial'}
- **Perguntas que deve fazer ao lead:** ${params.perguntas || 'Nome, curso de interesse, horário preferido'}
- **Idioma:** ${params.idioma}

## Tools disponíveis que o agente pode usar
${toolsSection || 'Nenhuma tool especial — apenas texto.'}

## Requisitos do prompt gerado
1. Começar com persona clara (quem é, para quem trabalha)
2. Definir objetivo principal e limites explícitos (o que NÃO fazer)
3. Listar informações que deve coletar do lead antes de transferir
4. Se houver tools, instruir QUANDO usar cada uma com exemplos concretos:
   - send_buttons: para perguntas com 2-3 opções claras
   - send_list: para muitas opções (cursos, horários)
   - transfer: quando lead qualificado ou pede humano
   - think: para decisões complexas
5. Incluir fallback: o que fazer quando não sabe a resposta
6. Máximo ~600 palavras, conciso e direto
7. Estar em ${params.idioma}

## Exemplo de prompt bem estruturado (use como referência de formato)

Você é Luna, assistente virtual da Escola de Música Harmonia. Seu objetivo é qualificar leads interessados e agendar aulas experimentais.

## Informações da escola
- Cursos: Guitarra, Piano, Bateria, Canto, Violão
- Unidades: Centro e Zona Sul
- Horários: Segunda a Sábado, 8h às 21h
- Aula experimental gratuita para novos alunos

## Seu comportamento
- Sempre cumprimente pelo nome quando souber
- Seja amigável mas profissional
- NUNCA invente informações sobre preços ou vagas
- Responda em mensagens curtas (máx 3 parágrafos)

## Coleta de dados
Antes de transferir para um consultor, colete:
1. Nome do lead
2. Curso de interesse
3. Unidade preferida
4. Melhor horário

## Uso de ferramentas
- Use send_buttons quando oferecer opções binárias (ex: "Quer agendar uma experimental?" → [Quero agendar] [Tenho dúvidas])
- Use send_list para mostrar cursos ou horários disponíveis
- Use transfer quando o lead confirmar interesse e você tiver os dados coletados
- Use think antes de respostas que exigem raciocínio (ex: lead indeciso)

## Limites
- Não discuta preços (diga "nosso consultor pode detalhar os valores")
- Não agende sem confirmar curso + horário + nome
- Se o lead pedir algo fora do escopo, transfira educadamente

---

Retorne APENAS o system prompt final. Sem explicações, sem markdown de código, sem blocos \`\`\`. Apenas o texto puro do prompt.`
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const {
      objetivo = 'Qualificar leads',
      tom_voz = 'Amigável',
      info_escola = '',
      regras = '',
      perguntas = '',
      idioma = 'Português BR',
      tools_habilitadas = [],
    } = body

    // Buscar API key
    const supabase = createServiceClient()
    const { data: iaConfig } = await supabase
      .from('assistente_ia_config')
      .select('openai_api_key')
      .limit(1)
      .single()
    const apiKey = iaConfig?.openai_api_key ?? Deno.env.get('OPENAI_API_KEY') ?? ''

    if (!apiKey) {
      return json({ error: 'API key da OpenAI não configurada' }, 500)
    }

    const metaPrompt = buildMetaPrompt({ objetivo, tom_voz, info_escola, regras, perguntas, idioma, tools_habilitadas })

    // Chamar GPT-4o-mini
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: metaPrompt },
          { role: 'user', content: `Gere o system prompt para um agente com objetivo "${objetivo}" e tom "${tom_voz}".` },
        ],
        temperature: 0.7,
        max_tokens: 2048,
      }),
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.message ?? 'OpenAI API error')

    const prompt = data.choices?.[0]?.message?.content?.trim() ?? ''
    if (!prompt) throw new Error('Resposta vazia da OpenAI')

    return json({ prompt })
  } catch (err) {
    console.error('gerar-prompt-agente error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
