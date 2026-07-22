/**
 * meta-webhook-campanhas — Recebe webhooks do WhatsApp Cloud API (Meta).
 * Processa mensagens inbound + status updates.
 * Roteia para agente IA quando disponível.
 *
 * IMPORTANTE: Sempre retorna 200 imediatamente — Meta desativa webhook se timeout.
 */
import { createServiceClient } from '../_shared/supabase-client.ts'
import { marcarComoLida, baixarEArmazenarMedia, enviarMensagemTexto } from '../_shared/whatsapp-meta-api.ts'

Deno.serve(async (req) => {
  // GET: Verificação do webhook pela Meta
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (mode === 'subscribe') {
      // Buscar verify_token do número no banco
      const supabase = createServiceClient()
      const { data: numero } = await supabase
        .from('numeros_meta')
        .select('verify_token')
        .eq('verify_token', token)
        .maybeSingle()

      if (numero) {
        console.log('Webhook verificado com sucesso')
        return new Response(challenge, { status: 200 })
      }
    }
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  // POST: Processar webhook — sempre retorna 200
  try {
    const body = await req.json()
    const entry = body?.entry?.[0]
    const changes = entry?.changes?.[0]
    const value = changes?.value

    if (!value) return ok()

    const supabase = createServiceClient()
    const phoneNumberId = value.metadata?.phone_number_id

    // Processar mensagens inbound (fire-and-forget)
    if (value.messages?.length > 0) {
      for (const msg of value.messages) {
        processarMensagem(supabase, phoneNumberId, msg, value.contacts)
          .catch(err => console.error('Erro ao processar mensagem:', err))
      }
    }

    // Processar status updates (fire-and-forget)
    if (value.statuses?.length > 0) {
      for (const status of value.statuses) {
        processarStatus(supabase, status)
          .catch(err => console.error('Erro ao processar status:', err))
      }
    }

    return ok()
  } catch (err) {
    console.error('meta-webhook-campanhas error:', err)
    return ok() // Sempre 200 para Meta
  }
})

function ok() {
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─── Processar mensagem inbound ───────────────────────────────────────────────

async function processarMensagem(supabase: any, phoneNumberId: string, msg: any, contacts: any[]) {
  const telefone = msg.from
  const metaMessageId = msg.id
  const timestamp = msg.timestamp
  const nomeContato = contacts?.[0]?.profile?.name ?? null

  // 1. Buscar número Meta pelo phone_number_id
  const { data: numero, error: numErr } = await supabase
    .from('numeros_meta')
    .select('id, unidade_id, access_token, auto_reply_ativo, auto_reply_message')
    .eq('phone_number_id', phoneNumberId)
    .single()

  if (numErr || !numero) {
    console.error('Número Meta não encontrado para phone_number_id:', phoneNumberId)
    return
  }

  const unidadeId = numero.unidade_id
  const numeroMetaId = numero.id

  // 2. Idempotência — verificar se já processamos este wamid
  const { data: msgExistente } = await supabase
    .from('mensagens_campanha')
    .select('id')
    .eq('meta_message_id', metaMessageId)
    .maybeSingle()

  if (msgExistente) return // Duplicata

  // 3. Upsert conversa
  const { data: conversa } = await supabase
    .from('conversas_campanha')
    .upsert({
      unidade_id: unidadeId,
      numero_meta_id: numeroMetaId,
      telefone,
      nome_contato: nomeContato,
      ultima_mensagem_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'numero_meta_id,telefone', ignoreDuplicates: false })
    .select('id, nao_lidas')
    .single()

  if (!conversa) return

  // Incrementar não lidas
  await supabase.from('conversas_campanha')
    .update({ nao_lidas: (conversa.nao_lidas ?? 0) + 1 })
    .eq('id', conversa.id)

  // 4. Parse conteúdo da mensagem
  const parsed = parseMessage(msg)

  // 4b. Reações: atualizar mensagem existente
  if (parsed.tipo === 'reaction' && parsed.reactionMessageId) {
    await supabase.from('mensagens_campanha')
      .update({ reaction_emoji: parsed.reactionEmoji })
      .eq('meta_message_id', parsed.reactionMessageId)
    return
  }

  // 4c. Resolver mídia
  let mediaUrl = parsed.mediaUrl
  let mediaMime: string | null = null

  if (parsed.mediaUrl && ['image', 'video', 'audio', 'document', 'sticker'].includes(parsed.tipo)) {
    try {
      const { publicUrl, mimeType } = await baixarEArmazenarMedia(
        numero.access_token, parsed.mediaUrl, unidadeId ?? 'global', parsed.tipo,
      )
      mediaUrl = publicUrl
      mediaMime = mimeType
    } catch (err) {
      console.error('Erro ao resolver mídia:', (err as Error).message)
    }
  }

  // 5. Salvar mensagem
  await supabase.from('mensagens_campanha').insert({
    conversa_id: conversa.id,
    telefone,
    direcao: 'inbound',
    tipo: parsed.tipo,
    texto: parsed.conteudo,
    media_url: mediaUrl,
    media_mime: mediaMime,
    media_filename: parsed.filename,
    sticker_id: parsed.stickerId,
    reaction_emoji: parsed.reactionEmoji,
    reaction_message_id: parsed.reactionMessageId,
    meta_message_id: metaMessageId,
    wa_id: msg.wa_id ?? telefone,
    status: 'received',
    created_at: timestamp ? new Date(parseInt(timestamp) * 1000).toISOString() : new Date().toISOString(),
  })

  // 6. Marcar como lida
  try {
    await marcarComoLida({ phone_number_id: phoneNumberId, access_token: numero.access_token }, metaMessageId)
  } catch (err) {
    console.error('Erro ao marcar como lida:', (err as Error).message)
  }

  // 7. Roteamento de agente
  let agenteParaInvocar: string | null = null

  // Helper: .eq() não funciona com null, precisa .is() para campos nullable
  function eqOrNull(query: any, field: string, value: any) {
    return value != null ? query.eq(field, value) : query.is(field, null)
  }

  // 7a. Descobrir o agente ATUALMENTE ativo/atribuído a esta caixa (número específico, ou fallback da unidade)
  // Isso é a fonte da verdade de roteamento — cada caixa tem no máximo 1 agente ativo respondendo.
  let qAgNum = supabase.from('agentes').select('id, modo_teste, telefone_teste')
    .eq('numero_meta_id', numeroMetaId).eq('is_active', true).eq('status', 'active')
  qAgNum = eqOrNull(qAgNum, 'unidade_id', unidadeId)
  const { data: agenteRoteado } = await qAgNum.limit(1).maybeSingle()

  let agenteCaixa = agenteRoteado
  if (!agenteCaixa) {
    let qAgFallback = supabase.from('agentes').select('id, modo_teste, telefone_teste')
      .eq('is_active', true).eq('status', 'active').is('numero_meta_id', null)
    qAgFallback = eqOrNull(qAgFallback, 'unidade_id', unidadeId)
    const { data } = await qAgFallback.limit(1).maybeSingle()
    agenteCaixa = data
  }

  // 7b. Conversa em aberto (bot_ativo=true) com QUALQUER agente
  let qAgConv = supabase.from('agente_conversas').select('id, agente_id, bot_ativo')
    .eq('telefone', telefone).eq('bot_ativo', true)
  qAgConv = eqOrNull(qAgConv, 'unidade_id', unidadeId)
  const { data: agConvExistente } = await qAgConv.maybeSingle()

  if (agConvExistente && agenteCaixa && agConvExistente.agente_id === agenteCaixa.id) {
    // Continua a conversa em aberto — já é o agente ativo desta caixa
    if (!agenteCaixa.modo_teste || agenteCaixa.telefone_teste === telefone) {
      agenteParaInvocar = agenteCaixa.id
    }
  } else {
    // Conversa presa em outro agente (desativado/trocado) — encerrar antes de rotear pro atual
    if (agConvExistente) {
      await supabase.from('agente_conversas').update({ bot_ativo: false }).eq('id', agConvExistente.id)
    }

    // 7c. Lead já transferido DENTRO da janela de reengajamento? (anti-spam)
    // Após 4 dias da transferência, o lead volta a ser triado (cai no 7d, que reseta a conversa).
    const cutoffReengajamento = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
    let qTransf = supabase.from('agente_conversas').select('id, agente_id, session_data')
      .eq('telefone', telefone).eq('status', 'transferred').gte('transferido_em', cutoffReengajamento)
    qTransf = eqOrNull(qTransf, 'unidade_id', unidadeId)
    const { data: convTransferida } = await qTransf.order('ultima_mensagem_em', { ascending: false }).limit(1).maybeSingle()

    if (convTransferida) {
      // Enviar mensagem de recontato
      try {
        const { data: transferAgente } = await supabase.from('agentes').select('tools').eq('id', convTransferida.agente_id).single()
        const transferTool = (transferAgente?.tools as any[])?.find((t: any) => t.name === 'transfer')
        const recontactMsg = (transferTool?.config as any)?.recontact_message
          ?? 'Olá! Seu atendimento já está sendo encaminhado. Em breve um consultor entrará em contato. Obrigado!'

        await enviarMensagemTexto(
          { phone_number_id: phoneNumberId, access_token: numero.access_token },
          telefone, recontactMsg,
        )
        await supabase.from('mensagens_campanha').insert({
          conversa_id: conversa.id, telefone, direcao: 'outbound',
          tipo: 'text', texto: recontactMsg, status: 'sent',
          enviado_por_agente: convTransferida.agente_id,
        })
      } catch (err) { console.error('Recontact msg falhou:', err) }
      return
    }

    // 7d. Rotear pro agente ativo da caixa atual
    // Agente em modo_teste e número não é o de teste = agente indisponível pra
    // esse lead (equivale a não ter agente na caixa) — cai no autoreply, se houver.
    const agenteDisponivel = agenteCaixa && (!agenteCaixa.modo_teste || agenteCaixa.telefone_teste === telefone)

    if (agenteDisponivel) {
      // Reabrir conversa já existente com esse agente, ou criar
      const { data: convDoAgente } = await supabase.from('agente_conversas')
        .select('id').eq('agente_id', agenteCaixa.id).eq('telefone', telefone).maybeSingle()

      if (convDoAgente) {
        // Reabrir = triagem NOVA. Reseta o estado (inclusive uma transferência já
        // vencida pela janela) pra o bot não puxar o histórico/dados antigos:
        // status volta a 'active', zera session_data/contador e move o corte de
        // histórico (created_at) pra agora.
        const agoraIso = new Date().toISOString()
        await supabase.from('agente_conversas').update({
          bot_ativo: true, unidade_id: unidadeId, ultima_mensagem_em: agoraIso,
          status: 'active', transferido_em: null,
          session_data: {}, total_mensagens: 0, created_at: agoraIso,
        }).eq('id', convDoAgente.id)
      } else {
        await supabase.from('agente_conversas').insert({
          agente_id: agenteCaixa.id, unidade_id: unidadeId, telefone,
          bot_ativo: true, total_mensagens: 0,
          ultima_mensagem_em: new Date().toISOString(),
        })
      }

      agenteParaInvocar = agenteCaixa.id
    } else if (numero.auto_reply_ativo && numero.auto_reply_message) {
      // Caixa de disparo sem agente — autoreply reorientando para os canais de atendimento.
      // Responde a QUALQUER um que escreve (sem trava de campanha).
      // Debounce: não reenvia se já respondeu este contato nos últimos 10 minutos.
      const dezMinAtras = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      const { data: autoReplyRecente } = await supabase
        .from('mensagens_campanha')
        .select('id')
        .eq('conversa_id', conversa.id)
        .eq('direcao', 'outbound')
        .eq('metadata->>auto_reply', 'true')
        .gte('created_at', dezMinAtras)
        .maybeSingle()

      if (!autoReplyRecente) {
        await enviarMensagemTexto(
          { phone_number_id: phoneNumberId, access_token: numero.access_token },
          telefone, numero.auto_reply_message,
        ).catch(e => console.error('Auto-reply falhou:', e))

        await supabase.from('mensagens_campanha').insert({
          conversa_id: conversa.id, telefone, direcao: 'outbound',
          tipo: 'text', texto: numero.auto_reply_message,
          status: 'sent', metadata: { auto_reply: true },
        })
      }
    }
  }

  // 7e. Invocar agente-webhook
  if (agenteParaInvocar) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    fetch(`${supabaseUrl}/functions/v1/agente-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        unidade_id: unidadeId,
        agente_id: agenteParaInvocar,
        telefone,
        texto: parsed.conteudo,
        tipo_mensagem: parsed.tipo,
        media_url: mediaUrl,
        meta_message_id: metaMessageId,
      }),
    }).catch(err => console.error('Erro ao invocar agente-webhook:', err))
  }
}

// ─── Processar status updates ─────────────────────────────────────────────────

async function processarStatus(supabase: any, statusData: any) {
  const metaMessageId = statusData.id
  const status = statusData.status // sent | delivered | read | failed
  const pricing = statusData.pricing

  if (!metaMessageId || !status) return

  const { data: msg } = await supabase
    .from('mensagens_campanha')
    .select('id, status')
    .eq('meta_message_id', metaMessageId)
    .maybeSingle()

  if (!msg) return

  const statusOrder: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3, failed: -1 }
  const atual = statusOrder[msg.status] ?? 0
  const novo = statusOrder[status] ?? 0

  if (status === 'failed' || novo > atual) {
    const updateData: any = { status, status_atualizado_em: new Date().toISOString() }
    if (pricing) {
      updateData.custo_billable = pricing.billable ?? null
      updateData.custo_categoria = pricing.category ?? null
    }
    await supabase.from('mensagens_campanha').update(updateData).eq('id', msg.id)
  }

  // Atualizar contadores da campanha
  const { data: msgFull } = await supabase
    .from('mensagens_campanha')
    .select('campanha_id')
    .eq('id', msg.id)
    .single()

  if (msgFull?.campanha_id) {
    const { data: msgTel } = await supabase.from('mensagens_campanha').select('telefone').eq('id', msg.id).single()

    if (status === 'delivered' || status === 'read') {
      // Atualizar status do contato (só avançar, nunca regredir)
      const contatoStatus = status === 'read' ? 'lido' : 'entregue'
      if (msgTel?.telefone) {
        await supabase.from('campanha_contatos')
          .update({ status: contatoStatus })
          .eq('campanha_id', msgFull.campanha_id)
          .eq('telefone', msgTel.telefone)
          .in('status', ['enviado', 'entregue'])
      }
    }

    if (status === 'failed') {
      const erroMsg = statusData.errors?.[0]?.message
        ?? statusData.errors?.[0]?.error_data?.details
        ?? 'Falha na entrega'
      const errCode = statusData.errors?.[0]?.code?.toString() ?? ''
      const isOptOut = errCode === '131050' || erroMsg.toLowerCase().includes('marketing') || erroMsg.toLowerCase().includes('opt')
      const isEcossistema = errCode === '131049' || erroMsg.toLowerCase().includes('ecossistema') || erroMsg.toLowerCase().includes('ecosystem')
      const isNotWhatsApp = errCode === '131030'
      const contatoStatus = (isOptOut || isEcossistema) ? 'bloqueado' : isNotWhatsApp ? 'invalido' : 'falha'

      if (msgTel?.telefone) {
        await supabase.from('campanha_contatos')
          .update({ status: contatoStatus, erro: erroMsg })
          .eq('campanha_id', msgFull.campanha_id)
          .eq('telefone', msgTel.telefone)
          .eq('status', 'enviado')
      }
    }

    // Recalcular contadores baseado nos contatos reais (evita duplicatas)
    const campanhaId = msgFull.campanha_id
    const { count: entregues } = await supabase.from('campanha_contatos').select('id', { count: 'exact', head: true }).eq('campanha_id', campanhaId).eq('status', 'entregue')
    const { count: lidos } = await supabase.from('campanha_contatos').select('id', { count: 'exact', head: true }).eq('campanha_id', campanhaId).eq('status', 'lido')
    const { count: falhasCount } = await supabase.from('campanha_contatos').select('id', { count: 'exact', head: true }).eq('campanha_id', campanhaId).in('status', ['falha', 'bloqueado', 'invalido'])
    await supabase.from('campanhas').update({
      entregues: (entregues ?? 0) + (lidos ?? 0),
      lidos: lidos ?? 0,
      falhas: falhasCount ?? 0,
      updated_at: new Date().toISOString(),
    }).eq('id', campanhaId)
  }
}

// ─── Parser de mensagens WhatsApp ─────────────────────────────────────────────

interface ParsedMsg {
  conteudo: string
  mediaUrl: string | null
  tipo: string
  reactionEmoji: string | null
  reactionMessageId: string | null
  stickerId: string | null
  filename: string | null
}

function parseMessage(msg: any): ParsedMsg {
  const type = msg.type ?? 'text'
  const base = { reactionEmoji: null, reactionMessageId: null, stickerId: null, filename: null }

  switch (type) {
    case 'text':
      return { ...base, conteudo: msg.text?.body ?? '', mediaUrl: null, tipo: 'text' }
    case 'image':
      return { ...base, conteudo: msg.image?.caption ?? '', mediaUrl: msg.image?.id ?? null, tipo: 'image' }
    case 'video':
      return { ...base, conteudo: msg.video?.caption ?? '', mediaUrl: msg.video?.id ?? null, tipo: 'video' }
    case 'audio':
      return { ...base, conteudo: '', mediaUrl: msg.audio?.id ?? null, tipo: 'audio' }
    case 'document':
      return { ...base, conteudo: msg.document?.caption ?? '', mediaUrl: msg.document?.id ?? null, tipo: 'document', filename: msg.document?.filename ?? null }
    case 'sticker':
      return { ...base, conteudo: '', mediaUrl: msg.sticker?.id ?? null, tipo: 'sticker', stickerId: msg.sticker?.id ?? null }
    case 'location':
      return { ...base, conteudo: `[Localização: ${msg.location?.latitude}, ${msg.location?.longitude}]`, mediaUrl: null, tipo: 'location' }
    case 'contacts':
      return { ...base, conteudo: `[Contato: ${msg.contacts?.[0]?.name?.formatted_name ?? 'Desconhecido'}]`, mediaUrl: null, tipo: 'contacts' }
    case 'reaction':
      return { ...base, conteudo: msg.reaction?.emoji ?? '', mediaUrl: null, tipo: 'reaction', reactionEmoji: msg.reaction?.emoji ?? null, reactionMessageId: msg.reaction?.message_id ?? null }
    case 'button':
      return { ...base, conteudo: msg.button?.text ?? '[Botão]', mediaUrl: null, tipo: 'button' }
    case 'interactive':
      return { ...base, conteudo: msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? '[Interativo]', mediaUrl: null, tipo: 'interactive' }
    default:
      return { ...base, conteudo: `[${type}]`, mediaUrl: null, tipo: type }
  }
}
