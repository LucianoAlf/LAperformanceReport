/**
 * enviar-mensagem-meta — envia texto, mídia ou reação via WhatsApp Cloud API.
 * Persiste a mensagem em conversas_campanha + mensagens_campanha.
 *
 * POST body:
 *   { numero_meta_id, telefone, tipo, texto?, media_url?, tipo_media?, legenda?, filename?,
 *     meta_message_id?, emoji? }
 *
 * tipo: 'text' | 'image' | 'video' | 'audio' | 'document' | 'reaction'
 */
import { createServiceClient, createUserClient } from '../_shared/supabase-client.ts'
import {
  enviarMensagemTexto,
  enviarMensagemMedia,
  enviarReacao,
} from '../_shared/whatsapp-meta-api.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonError('Token de autenticação ausente', 401)

    const userClient = createUserClient(authHeader)
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) return jsonError('Não autorizado', 401)

    const body = await req.json()
    const { numero_meta_id, telefone, tipo, texto, media_url, tipo_media, legenda, filename, meta_message_id, emoji } = body

    if (!numero_meta_id || !telefone) return jsonError('numero_meta_id e telefone são obrigatórios', 400)
    if (!tipo) return jsonError('tipo é obrigatório', 400)

    const supabase = createServiceClient()

    // 2. Verificar permissão
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('perfil, unidade_id')
      .eq('auth_user_id', user.id)
      .single()

    if (!usuario) return jsonError('Usuário não encontrado', 403)

    // 3. Buscar número Meta
    const numQuery = supabase
      .from('numeros_meta')
      .select('id, phone_number_id, access_token, unidade_id')
      .eq('id', numero_meta_id)

    if (usuario.perfil !== 'admin') numQuery.eq('unidade_id', usuario.unidade_id)

    const { data: numero, error: numErr } = await numQuery.single()
    if (numErr || !numero) return jsonError('Número Meta não encontrado', 404)

    const config = { phone_number_id: numero.phone_number_id, access_token: numero.access_token }

    // 4. Enviar via WhatsApp Cloud API
    let waResponse: any

    if (tipo === 'reaction') {
      if (!meta_message_id || !emoji) return jsonError('meta_message_id e emoji são obrigatórios para reação', 400)
      waResponse = await enviarReacao(config, telefone, meta_message_id, emoji)
      // Atualizar reaction_emoji na mensagem alvo (sem criar nova mensagem)
      await supabase.from('mensagens_campanha')
        .update({ reaction_emoji: emoji })
        .eq('meta_message_id', meta_message_id)
      return new Response(JSON.stringify({ success: true, emoji }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } else if (tipo === 'text') {
      if (!texto) return jsonError('texto é obrigatório para tipo text', 400)
      waResponse = await enviarMensagemTexto(config, telefone, texto)
    } else {
      if (!media_url) return jsonError('media_url é obrigatório para mensagens de mídia', 400)
      const mediaType = tipo_media ?? tipo
      waResponse = await enviarMensagemMedia(config, telefone, mediaType, media_url, legenda, filename)
    }

    const novoMetaMessageId = waResponse?.messages?.[0]?.id ?? null

    // 5. Upsert conversa
    const { data: conversa, error: convErr } = await supabase
      .from('conversas_campanha')
      .upsert(
        {
          numero_meta_id: numero.id,
          unidade_id: numero.unidade_id,
          telefone,
          ultima_mensagem_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'numero_meta_id,telefone', ignoreDuplicates: false },
      )
      .select('id')
      .single()

    if (convErr || !conversa) throw new Error('Falha ao criar/atualizar conversa: ' + convErr?.message)

    // 6. Inserir mensagem
    const { data: mensagem, error: msgErr } = await supabase
      .from('mensagens_campanha')
      .insert({
        conversa_id: conversa.id,
        telefone,
        direcao: 'outbound',
        tipo,
        texto: texto ?? null,
        media_url: media_url ?? null,
        reaction_emoji: tipo === 'reaction' ? emoji : null,
        reaction_message_id: tipo === 'reaction' ? meta_message_id : null,
        meta_message_id: novoMetaMessageId,
        status: 'sent',
        status_atualizado_em: new Date().toISOString(),
      })
      .select()
      .single()

    if (msgErr) throw new Error('Falha ao salvar mensagem: ' + msgErr.message)

    return json({ success: true, mensagem })
  } catch (err) {
    console.error('enviar-mensagem-meta error:', err)
    return jsonError((err as Error).message, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function jsonError(message: string, status: number) {
  return json({ error: message }, status)
}
