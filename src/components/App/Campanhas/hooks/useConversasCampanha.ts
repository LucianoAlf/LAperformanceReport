import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export interface ConversaCampanha {
  id: string
  unidade_id: string
  numero_meta_id: string | null
  telefone: string
  nome_contato: string | null
  ultima_mensagem_em: string | null
  nao_lidas: number
  status: string
  created_at: string
}

export interface MensagemCampanha {
  id: string
  conversa_id: string
  campanha_id: string | null
  telefone: string
  direcao: 'inbound' | 'outbound'
  tipo: string
  texto: string | null
  media_url: string | null
  media_mime: string | null
  media_filename: string | null
  reaction_emoji: string | null
  meta_message_id: string | null
  status: string
  enviado_por_agente: string | null
  created_at: string
}

export function useConversasCampanha(unidadeId?: string | null) {
  const [conversas, setConversas] = useState<ConversaCampanha[]>([])
  const [loading, setLoading] = useState(true)

  const fetchConversas = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('conversas_campanha')
        .select('*')
        .order('ultima_mensagem_em', { ascending: false })
        .limit(100)
      if (unidadeId) query = query.eq('unidade_id', unidadeId)
      const { data } = await query
      // Deduplicar por telefone — manter a conversa mais recente
      const porTelefone = new Map<string, typeof data extends (infer T)[] ? T : never>()
      for (const c of (data ?? [])) {
        const existing = porTelefone.get(c.telefone)
        if (!existing || (c.ultima_mensagem_em && (!existing.ultima_mensagem_em || c.ultima_mensagem_em > existing.ultima_mensagem_em))) {
          // Mesclar nao_lidas de conversas duplicadas
          if (existing) c.nao_lidas = (c.nao_lidas ?? 0) + (existing.nao_lidas ?? 0)
          porTelefone.set(c.telefone, c)
        } else if (existing) {
          existing.nao_lidas = (existing.nao_lidas ?? 0) + (c.nao_lidas ?? 0)
        }
      }
      setConversas(Array.from(porTelefone.values()))
    } finally {
      setLoading(false)
    }
  }, [unidadeId])

  useEffect(() => { fetchConversas() }, [fetchConversas])

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('conversas_campanha_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas_campanha' }, () => {
        fetchConversas()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchConversas])

  return { conversas, loading, refetch: fetchConversas }
}

export function useMensagensCampanha(conversaId: string | null, telefone?: string) {
  const [mensagens, setMensagens] = useState<MensagemCampanha[]>([])
  const [loading, setLoading] = useState(false)
  const [allConversaIds, setAllConversaIds] = useState<string[]>([])

  // Buscar todas as conversas desse telefone (para unificar mensagens de conversas duplicadas)
  useEffect(() => {
    if (!conversaId || !telefone) { setAllConversaIds([]); return }
    supabase.from('conversas_campanha').select('id').eq('telefone', telefone).then(({ data }) => {
      setAllConversaIds((data ?? []).map(c => c.id))
    })
  }, [conversaId, telefone])

  const fetchMensagens = useCallback(async () => {
    const ids = allConversaIds.length > 0 ? allConversaIds : (conversaId ? [conversaId] : [])
    if (!ids.length) { setMensagens([]); return }
    setLoading(true)
    try {
      const { data } = await supabase
        .from('mensagens_campanha')
        .select('*')
        .in('conversa_id', ids)
        .order('created_at', { ascending: true })
        .limit(200)
      setMensagens(data ?? [])
    } finally {
      setLoading(false)
    }
  }, [conversaId, allConversaIds.join(',')])

  useEffect(() => { fetchMensagens() }, [fetchMensagens])

  // Realtime — escutar todas as conversas desse telefone
  useEffect(() => {
    const ids = allConversaIds.length > 0 ? allConversaIds : (conversaId ? [conversaId] : [])
    if (!ids.length) return
    const channels = ids.map(id =>
      supabase
        .channel(`msgs_${id}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'mensagens_campanha',
          filter: `conversa_id=eq.${id}`,
        }, (payload) => {
          setMensagens(prev => {
            if (prev.some(m => m.id === (payload.new as any).id)) return prev
            return [...prev, payload.new as MensagemCampanha]
          })
        })
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'mensagens_campanha',
          filter: `conversa_id=eq.${id}`,
        }, (payload) => {
          setMensagens(prev =>
            prev.map(m => m.id === (payload.new as any).id ? { ...m, ...payload.new as MensagemCampanha } : m)
          )
        })
        .subscribe()
    )
    return () => { channels.forEach(ch => supabase.removeChannel(ch)) }
  }, [conversaId, allConversaIds.join(',')])

  // Marcar como lidas
  useEffect(() => {
    if (!conversaId) return
    supabase.from('conversas_campanha').update({ nao_lidas: 0 }).eq('id', conversaId).then(() => {})
  }, [conversaId])

  async function getConvData() {
    const { data } = await supabase.from('conversas_campanha').select('numero_meta_id, telefone').eq('id', conversaId!).single()
    return data
  }

  async function enviar(texto: string): Promise<{ error: string | null }> {
    if (!conversaId) return { error: 'Nenhuma conversa selecionada' }
    const conv = await getConvData()
    if (!conv) return { error: 'Conversa não encontrada' }

    const { data, error } = await supabase.functions.invoke('enviar-mensagem-meta', {
      body: { numero_meta_id: conv.numero_meta_id, telefone: conv.telefone, tipo: 'text', texto },
    })
    if (error) return { error: error.message }
    if (data?.error) return { error: data.error }
    return { error: null }
  }

  async function enviarMidia(arquivo: File, tipo: string): Promise<{ error: string | null }> {
    if (!conversaId) return { error: 'Nenhuma conversa selecionada' }
    const conv = await getConvData()
    if (!conv) return { error: 'Conversa não encontrada' }

    // Upload ao Storage
    const filePath = `campanhas/${conversaId}/${Date.now()}_${arquivo.name}`
    const { error: uploadErr } = await supabase.storage.from('whatsapp-media-campanhas').upload(filePath, arquivo, { contentType: arquivo.type })
    if (uploadErr) return { error: 'Falha no upload: ' + uploadErr.message }
    const { data: { publicUrl } } = supabase.storage.from('whatsapp-media-campanhas').getPublicUrl(filePath)

    const { data, error } = await supabase.functions.invoke('enviar-mensagem-meta', {
      body: { numero_meta_id: conv.numero_meta_id, telefone: conv.telefone, tipo, media_url: publicUrl, tipo_media: tipo },
    })
    if (error) return { error: error.message }
    if (data?.error) return { error: data.error }
    return { error: null }
  }

  async function reagir(metaMessageId: string, emoji: string): Promise<{ error: string | null }> {
    if (!conversaId) return { error: 'Nenhuma conversa selecionada' }
    const conv = await getConvData()
    if (!conv) return { error: 'Conversa não encontrada' }

    // Optimistic update
    setMensagens(prev => prev.map(m => m.meta_message_id === metaMessageId ? { ...m, reaction_emoji: emoji } : m))

    // 1. Salvar reação no banco (update direto, sem edge function)
    const { error: dbErr } = await supabase.from('mensagens_campanha')
      .update({ reaction_emoji: emoji })
      .eq('meta_message_id', metaMessageId)

    // 2. Enviar reação via WhatsApp (edge function)
    const { data, error } = await supabase.functions.invoke('enviar-mensagem-meta', {
      body: { numero_meta_id: conv.numero_meta_id, telefone: conv.telefone, tipo: 'reaction', meta_message_id: metaMessageId, emoji },
    })

    // Se o banco salvou mas a API falhou, manter a reação local (visual) mas logar o erro
    if (error || data?.error) {
      console.warn('Reação salva no banco mas falhou no WhatsApp:', error?.message || data?.error)
      // Se o DB também falhou, reverter
      if (dbErr) {
        setMensagens(prev => prev.map(m => m.meta_message_id === metaMessageId ? { ...m, reaction_emoji: null } : m))
        return { error: dbErr.message }
      }
    }
    return { error: null }
  }

  return { mensagens, loading, refetch: fetchMensagens, enviar, enviarMidia, reagir }
}
