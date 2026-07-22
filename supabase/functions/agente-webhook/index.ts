/**
 * agente-webhook — Orquestração do agente IA.
 * Recebe mensagem do lead, processa com IA (OpenAI/Gemini),
 * executa tools (transfer, think) e responde via WhatsApp Cloud API.
 *
 * Chamado internamente pelo meta-webhook-campanhas (service role).
 */
import { createServiceClient } from '../_shared/supabase-client.ts'
import { enviarMensagemTexto, enviarMensagemBotoes, enviarMensagemLista } from '../_shared/whatsapp-meta-api.ts'
import type { BotaoResposta, SecaoLista } from '../_shared/whatsapp-meta-api.ts'
import { chatCompletion, transcreverAudio } from '../_shared/ai-client.ts'
import type { ChatMessage, AIConfig } from '../_shared/ai-client.ts'
import type { AgentToolDefinition, ToolCall, ToolResult, AIResponse, TransferToolConfig, TransferUnit } from '../_shared/tool-types.ts'
import {
  buscarContato, criarContato, criarConversa, enviarNotaPrivada, enviarMensagem,
  buscarLabelsContato, atualizarLabelsContato, buscarLabelsConversa,
  atualizarLabelsConversa, toggleStatusConversa, garantirLabelsExistem,
} from '../_shared/chatwoot-api.ts'
import type { ChatwootConfig } from '../_shared/chatwoot-api.ts'

const DEFAULT_DEBOUNCE_MS = 3000
const DEFAULT_MAX_PER_MINUTE = 20
const MAX_TOOL_ITERATIONS = 5

// Tools cuja execução JÁ é a resposta final ao lead (mandam mensagem direto pelo
// WhatsApp) — depois delas não há nada a narrar, então o loop de tool-calling
// deve parar em vez de perguntar de novo à IA (evita chamada e mensagem extras).
const TOOLS_TERMINAIS = ['send_buttons', 'send_list']

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Auto-agenda o disparo da fila em background (sem depender do tick do cron
// processar-mensagens-agendadas, que só varre a cada minuto). Espera a janela do
// debounce fechar, tenta o MESMO atomic claim do cron escopado a esta fila e, se
// vencer, re-invoca a própria função com debounce_trigger. Se uma mensagem nova
// tiver empurrado processar_apos pra frente, o claim não pega (processar_apos
// ainda futuro) e a tarefa agendada por essa mensagem nova é quem dispara — o que
// preserva o debounce (N mensagens seguidas = 1 turno). O cron continua ativo só
// como rede de segurança (worker despejado antes desta tarefa rodar).
function agendarDisparoDebounce(
  supabase: any,
  ids: { agente_id: string; telefone: string; unidade_id: string },
  debounceMs: number,
) {
  // @ts-ignore EdgeRuntime existe no runtime Supabase (Deno Deploy)
  EdgeRuntime.waitUntil((async () => {
    await sleep(debounceMs + 300)
    const { data: claimed } = await supabase
      .from('agente_fila_mensagens')
      .update({ processando: true })
      .eq('agente_id', ids.agente_id)
      .eq('telefone', ids.telefone)
      .eq('processando', false)
      .lte('processar_apos', new Date().toISOString())
      .select('id')
      .maybeSingle()
    if (!claimed) return
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/agente-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        agente_id: ids.agente_id,
        unidade_id: ids.unidade_id,
        telefone: ids.telefone,
        texto: '',
        tipo_mensagem: 'debounce_trigger',
      }),
    }).catch(e => console.error('[agente-webhook] auto-disparo debounce falhou:', e))
  })())
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { unidade_id, agente_id, telefone, texto, tipo_mensagem, media_url, meta_message_id } = await req.json()

    if (!agente_id || !telefone) {
      return json({ error: 'agente_id e telefone são obrigatórios' }, 400)
    }

    const supabase = createServiceClient()
    const agora = new Date()

    // 1. Buscar agente
    const { data: agente, error: agenteErr } = await supabase
      .from('agentes')
      .select('*')
      .eq('id', agente_id)
      .single()

    if (agenteErr || !agente) return json({ error: 'Agente não encontrado' }, 404)

    // 1b. Validar status
    if (!agente.is_active || agente.status !== 'active') {
      await supabase.from('agente_fila_mensagens').delete()
        .eq('agente_id', agente_id).eq('telefone', telefone)
      return json({ status: 'skipped', message: 'Agente inativo' })
    }

    // 1c. Verificar horário de funcionamento
    const wh = agente.horario_funcionamento as {
      start?: string; end?: string; timezone?: string; days?: number[]; outside_message?: string
    } | null

    if (wh?.start && wh?.end && wh?.timezone && wh?.days?.length) {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: wh.timezone, hour: '2-digit', minute: '2-digit', hour12: false,
      })
      const parts = formatter.formatToParts(agora)
      const currentTime = `${parts.find(p => p.type === 'hour')?.value ?? '00'}:${parts.find(p => p.type === 'minute')?.value ?? '00'}`
      const nowInTz = new Date(agora.toLocaleString('en-US', { timeZone: wh.timezone }))
      const jsDay = nowInTz.getDay()
      const dayOfWeek = jsDay === 0 ? 7 : jsDay

      if (!wh.days.includes(dayOfWeek) || currentTime < wh.start || currentTime > wh.end) {
        if (wh.outside_message) {
          const metaNum = await getNumeroMeta(supabase, agente)
          if (metaNum) {
            await enviarMensagemTexto(metaNum, telefone, wh.outside_message).catch(e => console.error('Msg fora horário:', e))
          }
        }
        await supabase.from('agente_fila_mensagens').delete().eq('agente_id', agente_id).eq('telefone', telefone)
        return json({ status: 'fora_horario' })
      }
    }

    // 2. Anti-spam / debounce
    const antiSpam = agente.anti_spam as { min_interval_ms?: number; max_messages_per_minute?: number } | null
    const debounceMs = antiSpam?.min_interval_ms ?? DEFAULT_DEBOUNCE_MS
    const processarApos = new Date(agora.getTime() + debounceMs)

    const { data: filaExistente } = await supabase
      .from('agente_fila_mensagens')
      .select('*')
      .eq('agente_id', agente_id)
      .eq('telefone', telefone)
      .maybeSingle()

    const novaMensagem = {
      text: texto ?? '', type: tipo_mensagem ?? 'text',
      media_url: media_url ?? null, meta_message_id: meta_message_id ?? null,
      received_at: agora.toISOString(),
    }

    if (filaExistente) {
      const acumuladas = filaExistente.mensagens_acumuladas ?? []
      // Não adicionar mensagens vazias (ex: debounce_trigger)
      if (novaMensagem.text || novaMensagem.media_url) acumuladas.push(novaMensagem)

      // debounce_trigger é a própria chamada autorizada pelo cron (que já marcou
      // processando=true ao reivindicar a fila) — não é um concorrente, deve seguir.
      if (filaExistente.processando && tipo_mensagem !== 'debounce_trigger') {
        await supabase.from('agente_fila_mensagens').update({ mensagens_acumuladas: acumuladas }).eq('id', filaExistente.id)
        return json({ status: 'queued' })
      }
      if (new Date(filaExistente.processar_apos) > agora) {
        await supabase.from('agente_fila_mensagens')
          .update({ mensagens_acumuladas: acumuladas, processar_apos: processarApos.toISOString() })
          .eq('id', filaExistente.id)
        agendarDisparoDebounce(supabase, { agente_id, telefone, unidade_id }, debounceMs)
        return json({ status: 'debounced' })
      }
      await supabase.from('agente_fila_mensagens')
        .update({ mensagens_acumuladas: acumuladas, processando: true })
        .eq('id', filaExistente.id)
    } else {
      // Primeira mensagem: criar fila e agendar auto-processamento
      await supabase.from('agente_fila_mensagens').insert({
        agente_id, unidade_id, telefone,
        mensagens_acumuladas: [novaMensagem],
        processar_apos: processarApos.toISOString(),
        processando: false,
      })

      // Auto-agenda o disparo (~debounce) sem esperar o cron. O cron segue como
      // rede de segurança caso o worker seja despejado antes da tarefa rodar.
      agendarDisparoDebounce(supabase, { agente_id, telefone, unidade_id }, debounceMs)
      return json({ status: 'debounced', message: 'Primeira mensagem, disparo auto-agendado' })
    }

    // 3. Get ou criar agente_conversas
    const { data: convExistente } = await supabase
      .from('agente_conversas')
      .select('*')
      .eq('agente_id', agente_id)
      .eq('telefone', telefone)
      .maybeSingle()

    let conversa: any
    let novaConversa = false

    if (convExistente) {
      conversa = convExistente
    } else {
      novaConversa = true
      const { data: novaConv, error: convErr } = await supabase
        .from('agente_conversas')
        .insert({
          agente_id, unidade_id, telefone,
          bot_ativo: true, total_mensagens: 0,
          ultima_mensagem_em: agora.toISOString(),
        })
        .select()
        .single()
      if (convErr || !novaConv) throw new Error('Falha ao criar conversa do agente: ' + convErr?.message)
      conversa = novaConv
    }

    // 4. Se bot desativado (human takeover), sair
    if (!conversa.bot_ativo) {
      await supabase.from('agente_fila_mensagens').delete().eq('agente_id', agente_id).eq('telefone', telefone)
      return json({ status: 'skipped', message: 'Bot desativado (human takeover)' })
    }

    // 5. Buscar número Meta (a caixa). Feito ANTES do rate limiting e do histórico
    // porque o numero_meta_id é o que identifica a conversa desta caixa — sem ele,
    // a busca por telefone pega conversa de outra campanha/caixa do mesmo lead.
    const metaConfig = await getNumeroMeta(supabase, agente)
    if (!metaConfig) throw new Error('Número Meta não configurado para este agente')

    // 3b. Rate limiting — conta inbounds recentes NESTA caixa (numero_meta_id),
    // não em qualquer conversa do telefone.
    const maxPerMinute = antiSpam?.max_messages_per_minute ?? DEFAULT_MAX_PER_MINUTE
    if (maxPerMinute > 0 && !novaConversa) {
      const umMinutoAtras = new Date(agora.getTime() - 60000).toISOString()
      const { data: convPrincipal } = await supabase
        .from('conversas_campanha').select('id')
        .eq('telefone', telefone).eq('numero_meta_id', metaConfig.id)
        .maybeSingle()

      if (convPrincipal) {
        const { count } = await supabase
          .from('mensagens_campanha')
          .select('*', { count: 'exact', head: true })
          .eq('conversa_id', convPrincipal.id)
          .eq('direcao', 'inbound')
          .gte('created_at', umMinutoAtras)

        if ((count ?? 0) >= maxPerMinute) {
          await supabase.from('agente_fila_mensagens').delete().eq('agente_id', agente_id).eq('telefone', telefone)
          return json({ status: 'rate_limited' })
        }
      }
    }

    // 5b. Mensagem de boas-vindas para novas conversas
    if (novaConversa && agente.mensagem_boas_vindas) {
      const welcomeRes = await enviarMensagemTexto(metaConfig, telefone, agente.mensagem_boas_vindas).catch(e => { console.error('Welcome msg:', e); return null })
      const welcomeWamid = welcomeRes?.messages?.[0]?.id ?? null
      await salvarMensagemSaida(supabase, unidade_id, metaConfig, telefone, agente.mensagem_boas_vindas, agente_id, agente.numero_meta_id, welcomeWamid)
    }

    // 6. Ler fila atualizada e processar mensagens acumuladas
    const { data: filaAtual } = await supabase
      .from('agente_fila_mensagens')
      .select('mensagens_acumuladas')
      .eq('agente_id', agente_id).eq('telefone', telefone)
      .single()

    const msgsAcumuladas: Array<{ text: string; type: string; media_url: string | null; meta_message_id: string | null }> =
      filaAtual?.mensagens_acumuladas ?? []

    // 6b. Buscar API key do banco (fallback para env var)
    const { data: iaConfig } = await supabase
      .from('assistente_ia_config')
      .select('openai_api_key')
      .limit(1)
      .single()
    const openaiKey = iaConfig?.openai_api_key ?? Deno.env.get('OPENAI_API_KEY') ?? ''
    const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? Deno.env.get('VITE_GEMINI_API_KEY') ?? ''

    // 7. Transcrever áudio + montar texto final
    let textoFinal = ''
    for (const msg of msgsAcumuladas) {
      if (msg.type === 'audio' && msg.media_url) {
        const transcricao = await transcreverAudio(openaiKey, msg.media_url, metaConfig.access_token)
          .catch(e => { console.error('Transcrição falhou:', e); return '' })
        textoFinal += (textoFinal ? '\n' : '') + transcricao
      } else if (msg.text) {
        textoFinal += (textoFinal ? '\n' : '') + msg.text
      }
    }

    if (!textoFinal.trim()) {
      await supabase.from('agente_fila_mensagens').delete().eq('agente_id', agente_id).eq('telefone', telefone)
      return json({ status: 'skipped', message: 'Nenhum texto para processar' })
    }

    // 8. Montar contexto para IA — histórico de mensagens DESTA caixa (numero_meta_id
    // + telefone = conversa única), cortando o que é anterior ao início desta conversa
    // do agente (conversa.created_at). Sem o corte, uma campanha nova que reusa o mesmo
    // número puxaria as mensagens da campanha antiga (mesma linha de conversas_campanha).
    const { data: convPrincipal } = await supabase
      .from('conversas_campanha').select('id')
      .eq('telefone', telefone).eq('numero_meta_id', metaConfig.id)
      .maybeSingle()

    const { data: historico } = await supabase
      .from('mensagens_campanha')
      .select('direcao, texto, tipo, created_at, enviado_por_agente')
      .eq('conversa_id', convPrincipal?.id ?? '')
      .gte('created_at', conversa.created_at)
      .order('created_at', { ascending: true })
      .limit(30)

    // Injetar dados já coletados no system prompt para evitar re-perguntas
    let systemPrompt = agente.system_prompt ?? 'Você é um assistente útil.'
    const sd = conversa.session_data ?? {}
    const dadosConhecidos: string[] = []
    if (sd.lead_name) dadosConhecidos.push(`Nome do lead: ${sd.lead_name}`)
    if (sd.curso_interesse) dadosConhecidos.push(`Curso de interesse: ${sd.curso_interesse}`)
    if (sd.unidade_preferida) dadosConhecidos.push(`Unidade preferida: ${sd.unidade_preferida}`)
    if (sd.idade) dadosConhecidos.push(`Idade: ${sd.idade}`)
    if (dadosConhecidos.length > 0) {
      systemPrompt += `\n\n## Dados já coletados nesta conversa\n${dadosConhecidos.join('\n')}\nIMPORTANTE: NÃO pergunte novamente dados que já foram coletados acima. Prossiga para coletar os dados faltantes.`
    }

    const chatMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
    ]

    if (historico) {
      for (const msg of historico) {
        // Pular mensagens outbound manuais (operador) — só incluir respostas do bot
        if (msg.direcao === 'outbound' && !msg.enviado_por_agente) continue
        // Pular mensagens sem texto
        if (!msg.texto?.trim()) continue
        chatMessages.push({
          role: msg.direcao === 'inbound' ? 'user' : 'assistant',
          content: msg.texto,
        })
      }
    }

    chatMessages.push({ role: 'user', content: textoFinal })

    // 9. Chamar IA com tools
    const aiCfg: AIConfig = {
      provider: (agente.provider ?? 'openai') as 'openai' | 'gemini',
      model: agente.modelo ?? 'gpt-4o-mini',
      apiKey: agente.provider === 'gemini' ? geminiKey : openaiKey,
      temperature: agente.temperature ?? 0.7,
      maxTokens: agente.max_tokens ?? 1024,
    }

    const enabledTools: AgentToolDefinition[] = ((agente.tools as AgentToolDefinition[]) ?? []).filter(t => t.enabled)

    let lastResponse: AIResponse | null = null
    let transferRealizada = false
    let interativoEnviado = false
    let toolMessages: ChatMessage[] = []
    let iaFalhou = false
    const dadosColetados: Record<string, string> = {}

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      try {
        lastResponse = await chatCompletion(aiCfg, [...chatMessages, ...toolMessages], enabledTools.length > 0 ? enabledTools : undefined)
      } catch (aiErr) {
        console.error('AI API falhou:', aiErr)
        const fallback = agente.mensagem_fallback ?? 'Desculpe, estou com dificuldades no momento. Um atendente irá te ajudar em breve.'
        const fbRes = await enviarMensagemTexto(metaConfig, telefone, fallback).catch(e => { console.error('Fallback:', e); return null })
        await supabase.from('agente_conversas').update({ bot_ativo: false, status: 'error' }).eq('id', conversa.id)
        await salvarMensagemSaida(supabase, unidade_id, metaConfig, telefone, fallback, agente_id, agente.numero_meta_id, fbRes?.messages?.[0]?.id)
        await supabase.from('agente_fila_mensagens').delete().eq('agente_id', agente_id).eq('telefone', telefone)
        iaFalhou = true
        break
      }

      if (lastResponse.type === 'text') break

      if (lastResponse.tool_calls?.length) {
        toolMessages.push({
          role: 'assistant', content: lastResponse.content,
          tool_calls: lastResponse.tool_calls.map(tc => ({
            id: tc.id, type: 'function' as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        })

        for (const tc of lastResponse.tool_calls) {
          const resultado = await executarTool(tc, { supabase, conversa, agente, unidade_id, telefone, agora, metaConfig })
          if (tc.name === 'transfer' && !resultado.content.startsWith('TRANSFERÊNCIA BLOQUEADA')) transferRealizada = true
          if (tc.name === 'send_buttons' || tc.name === 'send_list') interativoEnviado = true
          // Capturar dados coletados das tool calls
          if (tc.name === 'transfer' || tc.name === 'save_lead_data') {
            if (tc.arguments?.lead_name || tc.arguments?.nome) dadosColetados.lead_name = (tc.arguments.lead_name ?? tc.arguments.nome) as string
            if (tc.arguments?.unit || tc.arguments?.unidade) dadosColetados.unidade_preferida = (tc.arguments.unit ?? tc.arguments.unidade) as string
            if (tc.arguments?.instrumento || tc.arguments?.curso) dadosColetados.curso_interesse = (tc.arguments.instrumento ?? tc.arguments.curso) as string
            if (tc.arguments?.idade) dadosColetados.idade = tc.arguments.idade as string
          }
          toolMessages.push({ role: 'tool', tool_call_id: tc.id, content: resultado.content })
        }

        // Alguma tool terminal rodou (ex: send_buttons) — a resposta já foi
        // enviada, não há necessidade de perguntar à IA de novo.
        if (lastResponse.tool_calls.some(tc => TOOLS_TERMINAIS.includes(tc.name))) break
      }
    }

    if (iaFalhou) return json({ status: 'error', message: 'IA falhou, fallback enviado' })

    // 10. Montar resposta final
    let respostaTexto = lastResponse?.type === 'text' ? (lastResponse.content?.trim() ?? '') : ''

    if (!respostaTexto && transferRealizada) {
      const transferTool = enabledTools.find(t => t.name === 'transfer')
      respostaTexto = (transferTool?.config as Record<string, unknown>)?.transfer_message as string
        ?? 'Você será atendido por um de nossos atendentes em breve. Obrigado pela paciência!'
    }

    // Se mensagem interativa já foi enviada pela tool, não enviar texto adicional
    if (interativoEnviado) {
      if (respostaTexto) {
        const compRes = await enviarMensagemTexto(metaConfig, telefone, respostaTexto)
        await salvarMensagemSaida(supabase, unidade_id, metaConfig, telefone, respostaTexto, agente_id, agente.numero_meta_id, compRes?.messages?.[0]?.id)
      }
    } else {
      if (!respostaTexto) respostaTexto = 'Desculpe, não consegui processar sua mensagem. Tente novamente.'
      const mainRes = await enviarMensagemTexto(metaConfig, telefone, respostaTexto)
      await salvarMensagemSaida(supabase, unidade_id, metaConfig, telefone, respostaTexto, agente_id, agente.numero_meta_id, mainRes?.messages?.[0]?.id)
    }

    // 12. Atualizar agente_conversas com dados coletados
    await supabase.from('agente_conversas').update({
      ultima_mensagem_em: agora.toISOString(),
      total_mensagens: (conversa.total_mensagens ?? 0) + msgsAcumuladas.length + 1,
      session_data: { ...(conversa.session_data ?? {}), ...dadosColetados, last_ai_response_at: agora.toISOString(), transfer: transferRealizada },
    }).eq('id', conversa.id)

    // 13. Limpar fila
    await supabase.from('agente_fila_mensagens').delete().eq('agente_id', agente_id).eq('telefone', telefone)

    return json({ success: true, resposta: respostaTexto, transfer: transferRealizada, mensagens_processadas: msgsAcumuladas.length })
  } catch (err) {
    console.error('agente-webhook error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getNumeroMeta(supabase: any, agente: any) {
  if (agente.numero_meta_id) {
    const { data } = await supabase.from('numeros_meta').select('id, phone_number_id, access_token').eq('id', agente.numero_meta_id).single()
    return data ? { id: data.id, phone_number_id: data.phone_number_id, access_token: data.access_token } : null
  }
  const { data } = await supabase.from('numeros_meta').select('id, phone_number_id, access_token').eq('unidade_id', agente.unidade_id).eq('is_default', true).single()
  return data ? { id: data.id, phone_number_id: data.phone_number_id, access_token: data.access_token } : null
}

async function salvarMensagemSaida(supabase: any, unidadeId: string, metaConfig: any, telefone: string, texto: string, agenteId: string, numeroMetaId?: string, waMessageId?: string) {
  // Buscar conversa existente pelo numero_meta_id (preferencial) ou telefone
  let conv: any = null
  if (numeroMetaId) {
    const { data } = await supabase.from('conversas_campanha').select('id')
      .eq('telefone', telefone).eq('numero_meta_id', numeroMetaId)
      .order('ultima_mensagem_em', { ascending: false }).limit(1).maybeSingle()
    conv = data
  }
  if (!conv) {
    const { data } = await supabase.from('conversas_campanha').select('id')
      .eq('telefone', telefone)
      .order('ultima_mensagem_em', { ascending: false }).limit(1).maybeSingle()
    conv = data
  }
  let conversaId = conv?.id
  if (!conversaId) {
    const { data: novaConv } = await supabase.from('conversas_campanha')
      .insert({ unidade_id: unidadeId, numero_meta_id: numeroMetaId ?? null, telefone, ultima_mensagem_em: new Date().toISOString() })
      .select('id').single()
    conversaId = novaConv?.id
  }
  if (!conversaId) return

  await supabase.from('mensagens_campanha').insert({
    conversa_id: conversaId, telefone, direcao: 'outbound',
    tipo: 'text', texto, status: 'sent', enviado_por_agente: agenteId,
    meta_message_id: waMessageId ?? null,
  })
}

// ─── Tool executors ───────────────────────────────────────────────────────────

interface ToolContext {
  supabase: any; conversa: any; agente: any
  unidade_id: string; telefone: string; agora: Date
  metaConfig: { phone_number_id: string; access_token: string }
}

async function executarTool(tc: ToolCall, ctx: ToolContext): Promise<ToolResult> {
  if (tc.name === 'transfer') return executarTransfer(tc, ctx)
  if (tc.name === 'think') return { tool_call_id: tc.id, content: `Pensamento registrado: "${tc.arguments?.thought ?? ''}". Continue com sua resposta.` }
  if (tc.name === 'send_buttons') return executarSendButtons(tc, ctx)
  if (tc.name === 'send_list') return executarSendList(tc, ctx)
  if (tc.name === 'save_lead_data') return { tool_call_id: tc.id, content: 'Dados do lead salvos com sucesso. Continue a conversa normalmente.' }
  return { tool_call_id: tc.id, content: `Ferramenta "${tc.name}" não encontrada.` }
}

async function executarTransfer(tc: ToolCall, ctx: ToolContext): Promise<ToolResult> {
  const unitRaw = (tc.arguments?.unit as string) ?? ''
  const leadName = (tc.arguments?.lead_name as string) ?? ''
  const summary = (tc.arguments?.summary as string) ?? ''
  const instrumento = (tc.arguments?.instrumento as string) ?? ''
  const classificacao = (tc.arguments?.classificacao as string) ?? ''
  const perfil = (tc.arguments?.perfil as string) ?? ''

  // 0. Validar dados obrigatórios antes de transferir
  const dadosFaltando: string[] = []
  if (!leadName.trim()) dadosFaltando.push('nome do lead')
  if (!unitRaw.trim()) dadosFaltando.push('unidade desejada')
  if (!perfil.trim()) dadosFaltando.push('perfil (criança ou adulto)')

  if (dadosFaltando.length > 0) {
    return {
      tool_call_id: tc.id,
      content: `TRANSFERÊNCIA BLOQUEADA: faltam dados obrigatórios: ${dadosFaltando.join(', ')}. Você DEVE coletar essas informações antes de transferir. Pergunte ao lead de forma natural.`,
    }
  }

  const transferTool = ((ctx.agente.tools as AgentToolDefinition[]) ?? []).find(t => t.name === 'transfer')
  const config = (transferTool?.config ?? {}) as unknown as TransferToolConfig

  // 1. Normalizar unidade
  const unitNorm = (() => {
    const u = unitRaw.toLowerCase().trim()
    if (u.includes('campo grande') || u === 'cg') return 'CG'
    if (u.includes('barra')) return 'Barra'
    if (u.includes('recreio')) return 'Recreio'
    return unitRaw
  })()

  const matchedUnit: TransferUnit | undefined = config.units?.find(
    u => u.name.toLowerCase() === unitNorm.toLowerCase()
  )

  // 2. Check se já foi transferido
  const { data: jaTransferido } = await ctx.supabase
    .from('agente_conversas')
    .select('id')
    .eq('telefone', ctx.telefone)
    .eq('status', 'transferred')
    .limit(1)
    .maybeSingle()

  if (jaTransferido) {
    return {
      tool_call_id: tc.id,
      content: 'Lead já foi transferido anteriormente. Não é possível transferir novamente. Informe-o que em breve o consultor da unidade escolhida irá entrar em contato para tirar todas as dúvidas.',
    }
  }

  // 3. Marcar conversa como transferida
  await ctx.supabase.from('agente_conversas').update({
    bot_ativo: false, status: 'transferred',
    session_data: {
      ...(ctx.conversa.session_data ?? {}),
      transferred_at: ctx.agora.toISOString(),
      transfer_unit: unitNorm, lead_name: leadName,
      summary, instrumento, classificacao, perfil,
    },
  }).eq('id', ctx.conversa.id)

  // 3b. Registrar/marcar o lead no funil comercial (LAReport).
  // Isolado em try/catch: NUNCA bloqueia a transferência (o crítico é o Chatwoot/consultor abaixo).
  // Reusa a RPC canônica upsert_lead (source_type='campanha') — dedup por telefone+unidade e
  // convergência futura com o Emusys pelo mesmo registro. Histórico da campanha vai em leads_campanhas.
  try {
    // Resolver unidade_id real: unitNorm ('CG'/'Barra'/'Recreio') -> unidades.nome
    const nomeUnidade = unitNorm === 'CG' ? 'Campo Grande' : unitNorm
    const { data: uni } = await ctx.supabase
      .from('unidades').select('id')
      .eq('nome', nomeUnidade).eq('ativo', true).maybeSingle()

    if (uni?.id) {
      const { data: leadRes } = await ctx.supabase.rpc('upsert_lead', {
        p_nome: leadName || null,
        p_telefone: ctx.telefone,
        p_email: null,
        p_unidade_id: uni.id,
        p_curso: null,
        p_canal: null,
        p_source_id: null,
        p_source_type: 'campanha',
        p_arquivar: false,
        p_data_contato: null,
      })
      const leadId = leadRes?.lead_id
      const campanhaSlug = (config.campanha_label as string) || null
      if (leadId && campanhaSlug) {
        await ctx.supabase.from('leads_campanhas').upsert({
          lead_id: leadId,
          agente_id: ctx.agente.id,
          campanha_slug: campanhaSlug,
          campanha_nome: ctx.agente.nome,
        }, { onConflict: 'lead_id,campanha_slug', ignoreDuplicates: true })
      }
    } else {
      console.error('upsert_lead campanha: unidade não resolvida para', unitNorm)
    }
  } catch (e) {
    console.error('Erro ao registrar lead da campanha no LAReport:', e)
  }

  // 4. Integração Chatwoot completa
  const hasCW = config.chatwoot_api_url && config.chatwoot_api_token && config.chatwoot_account_id
  if (hasCW && matchedUnit) {
    const cwCfg: ChatwootConfig = {
      apiUrl: config.chatwoot_api_url!,
      apiToken: config.chatwoot_api_token!,
      accountId: config.chatwoot_account_id!,
    }

    try {
      // 4a. Buscar ou criar contato
      let contato = await buscarContato(cwCfg, ctx.telefone)
      if (!contato) contato = await criarContato(cwCfg, ctx.telefone, leadName || undefined)

      // 4b. Etiquetar contato
      const unitTag = unitNorm.toLowerCase() === 'campo grande' ? 'cg' : unitNorm.toLowerCase().replace(/\s+/g, '-')
      const campanhaLabel = (config.campanha_label as string) || 'campanha-meta'
      const newLabels = [campanhaLabel, unitTag]
      // Perfil crianca/adulto define a marca (LA Music Kids vs Escola/adultos)
      const perfilTag = perfil.toLowerCase().includes('crian') ? 'lamk'
        : perfil.toLowerCase().includes('adult') ? 'emla' : null
      if (perfilTag) newLabels.push(perfilTag)
      if (classificacao) newLabels.push(classificacao.toLowerCase())
      if (instrumento) {
        const instrumentoTag = instrumento.normalize('NFD').replace(/[\u0300-\u0326\u0328-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, '-')
        newLabels.push(instrumentoTag)
      }

      // Garante que as labels existam na conta antes de aplicar (Chatwoot não
      // cria label de conta automaticamente ao etiquetar — sem isso, a etiqueta não "pega").
      await garantirLabelsExistem(cwCfg, newLabels)

      const existingContactLabels = await buscarLabelsContato(cwCfg, contato.id)
      const allContactLabels = [...new Set([...existingContactLabels, ...newLabels])]
      await atualizarLabelsContato(cwCfg, contato.id, allContactLabels)

      // 4c. Criar conversa na inbox da unidade
      const conversa = await criarConversa(cwCfg, contato.id, matchedUnit.inbox_id)

      // 4d. Garantir status open
      await toggleStatusConversa(cwCfg, conversa.id, 'open')

      // 4e. Etiquetar conversa
      const existingConvLabels = await buscarLabelsConversa(cwCfg, conversa.id)
      const allConvLabels = [...new Set([...existingConvLabels, ...newLabels])]
      await atualizarLabelsConversa(cwCfg, conversa.id, allConvLabels)

      // 4f. Nota privada com resumo — contexto pro consultor entender a ORIGEM do lead.
      const perfilLabel = perfil.toLowerCase().includes('crian') ? 'Criança (LA Music Kids)'
        : perfil.toLowerCase().includes('adult') ? 'Adulto' : null
      const nota = [
        `🤖 *Lead qualificado via Agente IA*`,
        `📣 *Campanha:* ${ctx.agente.nome}`,
        '',
        leadName ? `*Lead:* ${leadName}` : null,
        `*Telefone:* ${ctx.telefone}`,
        `*Unidade:* ${unitNorm}`,
        perfilLabel ? `*Perfil:* ${perfilLabel}` : null,
        instrumento ? `*Instrumento:* ${instrumento}` : null,
        classificacao ? `*Classificação:* ${classificacao}` : null,
        summary ? `\n*Resumo da conversa:* ${summary}` : null,
        '',
        '---',
        `Esse lead veio da campanha *${ctx.agente.nome}* e já foi qualificado pelo agente. Está aguardando seu contato! ⚡`,
      ].filter(Boolean).join('\n')
      await enviarNotaPrivada(cwCfg, conversa.id, nota)

      // 4g. Notificar consultor via WhatsApp — pela própria inbox do Chatwoot (WAHA por trás),
      // sem credencial própria: usa o mesmo contato/conversa do consultor nessa inbox.
      if (matchedUnit.consultant_phone) {
        const linkConversa = `${config.chatwoot_api_url}/app/accounts/${config.chatwoot_account_id}/conversations/${conversa.id}`
        const msg = [
          `Olá ${matchedUnit.consultant_name || 'Consultor'}! 👋`,
          '',
          `Você tem um novo lead qualificado da campanha *${ctx.agente.nome}*! 🎓`,
          '',
          '📋 *Detalhes do Lead:*',
          leadName ? `• *Nome:* ${leadName}` : null,
          `• *Telefone:* ${ctx.telefone}`,
          `• *Unidade:* ${unitNorm}`,
          perfilLabel ? `• *Perfil:* ${perfilLabel}` : null,
          instrumento ? `• *Instrumento:* ${instrumento}` : null,
          '',
          `🔗 *Link da Conversa:*`,
          linkConversa,
          '',
          'Por favor, entre em contato o mais rápido possível! ⚡',
        ].filter(Boolean).join('\n')

        try {
          let contatoConsultor = await buscarContato(cwCfg, matchedUnit.consultant_phone)
          if (!contatoConsultor) contatoConsultor = await criarContato(cwCfg, matchedUnit.consultant_phone, matchedUnit.consultant_name)
          const conversaConsultor = await criarConversa(cwCfg, contatoConsultor.id, matchedUnit.inbox_id)
          await enviarMensagem(cwCfg, conversaConsultor.id, msg)
        } catch (e) {
          console.error('Falha ao notificar consultor via Chatwoot:', e)
        }
      }
    } catch (e) {
      console.error('Chatwoot/Quepasa integration error:', e)
    }
  }

  return { tool_call_id: tc.id, content: 'Transferência realizada com sucesso. Bot desativado. Envie uma mensagem de despedida ao lead informando que um consultor entrará em contato em breve.' }
}

async function executarSendButtons(tc: ToolCall, ctx: ToolContext): Promise<ToolResult> {
  const body = (tc.arguments?.body as string) ?? ''
  const buttonsRaw = (tc.arguments?.buttons as string[]) ?? []
  const header = tc.arguments?.header as string | undefined
  const footer = tc.arguments?.footer as string | undefined

  if (!body || !buttonsRaw.length) {
    return { tool_call_id: tc.id, content: 'Erro: body e buttons são obrigatórios.' }
  }

  const botoes: BotaoResposta[] = buttonsRaw.slice(0, 3).map((title, i) => ({
    id: `btn_${i}`,
    title: String(title).slice(0, 20),
  }))

  try {
    await enviarMensagemBotoes(ctx.metaConfig, ctx.telefone, body, botoes, header, footer)
    // Salvar no banco como mensagem interativa
    const textoSalvo = `${body}\n[Botões: ${botoes.map(b => b.title).join(' | ')}]`
    await salvarMensagemSaida(ctx.supabase, ctx.unidade_id, ctx.metaConfig, ctx.telefone, textoSalvo, ctx.agente.id, ctx.agente.numero_meta_id)
    return { tool_call_id: tc.id, content: `Mensagem com ${botoes.length} botões enviada com sucesso. Aguarde a resposta do lead. NÃO envie texto adicional.` }
  } catch (e) {
    console.error('send_buttons error:', e)
    return { tool_call_id: tc.id, content: `Erro ao enviar botões: ${(e as Error).message}. Envie a mensagem como texto normal.` }
  }
}

async function executarSendList(tc: ToolCall, ctx: ToolContext): Promise<ToolResult> {
  const body = (tc.arguments?.body as string) ?? ''
  const buttonText = (tc.arguments?.button_text as string) ?? 'Ver opções'
  const itemsRaw = (tc.arguments?.items as Array<{ title: string; description?: string }>) ?? []
  const header = tc.arguments?.header as string | undefined
  const footer = tc.arguments?.footer as string | undefined

  if (!body || !itemsRaw.length) {
    return { tool_call_id: tc.id, content: 'Erro: body e items são obrigatórios.' }
  }

  const secoes: SecaoLista[] = [{
    title: 'Opções',
    rows: itemsRaw.slice(0, 10).map((item, i) => ({
      id: `item_${i}`,
      title: String(item.title).slice(0, 24),
      ...(item.description ? { description: String(item.description).slice(0, 72) } : {}),
    })),
  }]

  try {
    await enviarMensagemLista(ctx.metaConfig, ctx.telefone, body, buttonText, secoes, header, footer)
    const textoSalvo = `${body}\n[Lista: ${itemsRaw.map(i => i.title).join(', ')}]`
    await salvarMensagemSaida(ctx.supabase, ctx.unidade_id, ctx.metaConfig, ctx.telefone, textoSalvo, ctx.agente.id, ctx.agente.numero_meta_id)
    return { tool_call_id: tc.id, content: `Lista com ${itemsRaw.length} opções enviada com sucesso. Aguarde a resposta do lead. NÃO envie texto adicional.` }
  } catch (e) {
    console.error('send_list error:', e)
    return { tool_call_id: tc.id, content: `Erro ao enviar lista: ${(e as Error).message}. Envie a mensagem como texto normal.` }
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
