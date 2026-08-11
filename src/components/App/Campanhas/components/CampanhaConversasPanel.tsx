import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, RefreshCw, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

interface ContatoConversa {
  conversaId: string
  telefone: string
  nomeContato: string | null
  ultimaMensagem: string | null
  ultimaMensagemEm: string | null
}

interface MensagemPreview {
  id: string
  direcao: 'inbound' | 'outbound'
  tipo: string
  texto: string | null
  created_at: string
}

/**
 * Quem "respondeu" a uma campanha vem de `campanha_contatos.respondeu` — não dá
 * pra filtrar `mensagens_campanha.campanha_id`, porque esse campo é gravado só
 * no outbound (enviar-campanha); o inbound nunca recebe campanha_id (o webhook
 * identifica a campanha casando telefone com campanha_contatos). Ver Achado 1
 * da revisão de 2026-08-11.
 */
export function CampanhaConversasPanel({ campanhaId, numeroMetaId }: { campanhaId: string; numeroMetaId?: string | null }) {
  const [contatos, setContatos] = useState<ContatoConversa[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    setError(null)

    async function carregar() {
      // 1. Quem respondeu, segundo a fonte canônica (bate com campanhas.respondidos)
      const { data: respondentes, error: errRespondentes } = await supabase
        .from('campanha_contatos')
        .select('telefone')
        .eq('campanha_id', campanhaId)
        .eq('respondeu', true)

      if (errRespondentes) {
        console.error('Erro ao carregar contatos que responderam à campanha:', errRespondentes)
        if (!cancelado) { setError('Erro ao carregar conversas.'); setContatos([]); setLoading(false) }
        return
      }

      const telefones = Array.from(new Set((respondentes ?? []).map(r => r.telefone)))
      if (telefones.length === 0) {
        if (!cancelado) { setContatos([]); setLoading(false) }
        return
      }

      // 2. Conversa correspondente (mesmo número Meta da campanha, quando conhecido)
      let convQuery = supabase
        .from('conversas_campanha')
        .select('id, telefone, nome_contato, ultima_mensagem_em')
        .in('telefone', telefones)
      if (numeroMetaId) convQuery = convQuery.eq('numero_meta_id', numeroMetaId)

      const { data: conversas, error: errConversas } = await convQuery.order('ultima_mensagem_em', { ascending: false })
      if (errConversas) {
        console.error('Erro ao carregar conversas da campanha:', errConversas)
        if (!cancelado) { setError('Erro ao carregar conversas.'); setContatos([]); setLoading(false) }
        return
      }

      const porTelefone = new Map<string, { id: string; telefone: string; nomeContato: string | null; ultimaMensagemEm: string | null }>()
      for (const conv of (conversas ?? []) as any[]) {
        if (!porTelefone.has(conv.telefone)) {
          porTelefone.set(conv.telefone, {
            id: conv.id,
            telefone: conv.telefone,
            nomeContato: conv.nome_contato,
            ultimaMensagemEm: conv.ultima_mensagem_em,
          })
        }
      }

      // 3. Preview: última mensagem inbound de cada conversa
      const conversaIds = Array.from(porTelefone.values()).map(c => c.id)
      const ultimaMsgPorConversa = new Map<string, { texto: string | null; createdAt: string }>()
      if (conversaIds.length > 0) {
        const { data: mensagens, error: errMensagens } = await supabase
          .from('mensagens_campanha')
          .select('conversa_id, texto, created_at')
          .in('conversa_id', conversaIds)
          .eq('direcao', 'inbound')
          .order('created_at', { ascending: false })

        if (errMensagens) {
          // Não bloqueia a lista de contatos — só o preview da última mensagem fica vazio
          console.error('Erro ao carregar preview das últimas mensagens:', errMensagens)
        } else {
          for (const m of (mensagens ?? []) as any[]) {
            if (!ultimaMsgPorConversa.has(m.conversa_id)) {
              ultimaMsgPorConversa.set(m.conversa_id, { texto: m.texto, createdAt: m.created_at })
            }
          }
        }
      }

      const resultado: ContatoConversa[] = Array.from(porTelefone.values())
        .map(c => ({
          conversaId: c.id,
          telefone: c.telefone,
          nomeContato: c.nomeContato,
          ultimaMensagem: ultimaMsgPorConversa.get(c.id)?.texto ?? null,
          ultimaMensagemEm: ultimaMsgPorConversa.get(c.id)?.createdAt ?? c.ultimaMensagemEm,
        }))
        .sort((a, b) => (b.ultimaMensagemEm ?? '').localeCompare(a.ultimaMensagemEm ?? ''))

      if (!cancelado) { setContatos(resultado); setLoading(false) }
    }

    carregar()
    return () => { cancelado = true }
  }, [campanhaId, numeroMetaId])

  if (loading) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4">
        <div className="flex items-center justify-center py-6"><RefreshCw className="w-4 h-4 text-slate-500 animate-spin" /></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4">
        <div className="flex items-center gap-2 text-sm text-red-400 py-4 justify-center">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 space-y-2">
      <p className="text-xs text-gray-400">Conversas ({contatos.length} responderam)</p>
      {contatos.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">Ninguém respondeu a esta campanha ainda.</p>
      ) : (
        contatos.map(c => (
          <div key={c.conversaId} className="bg-slate-900/50 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpandido(expandido === c.conversaId ? null : c.conversaId)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-900 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm text-gray-200 truncate">{c.nomeContato ?? c.telefone}</p>
                <p className="text-xs text-gray-500 truncate">{c.ultimaMensagem ?? '—'}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span className="text-xs text-gray-600">
                  {c.ultimaMensagemEm ? new Date(c.ultimaMensagemEm).toLocaleDateString('pt-BR') : ''}
                </span>
                {expandido === c.conversaId ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
              </div>
            </button>
            {expandido === c.conversaId && <ThreadSomenteLeitura conversaId={c.conversaId} />}
          </div>
        ))
      )}
    </div>
  )
}

/**
 * Busca direta e somente-leitura em mensagens_campanha, SEM passar por
 * useMensagensCampanha — aquele hook é feito pra o chat de verdade (aba
 * Conversas) e, como efeito colateral de montar, zera
 * conversas_campanha.nao_lidas. Usá-lo aqui apagaria o badge de "não lida"
 * só de alguém abrir esta página de análise. Ver Achado 5 da revisão de
 * 2026-08-11.
 */
function ThreadSomenteLeitura({ conversaId }: { conversaId: string }) {
  const [mensagens, setMensagens] = useState<MensagemPreview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    setError(null)
    supabase
      .from('mensagens_campanha')
      .select('id, direcao, tipo, texto, created_at')
      .eq('conversa_id', conversaId)
      .order('created_at', { ascending: true })
      .then(({ data, error: errMensagens }) => {
        if (cancelado) return
        if (errMensagens) {
          console.error('Erro ao carregar mensagens da conversa:', errMensagens)
          setError('Erro ao carregar mensagens.')
          setMensagens([])
        } else {
          setMensagens((data ?? []) as MensagemPreview[])
        }
        setLoading(false)
      })
    return () => { cancelado = true }
  }, [conversaId])

  if (loading) {
    return <div className="px-3 pb-3"><RefreshCw className="w-4 h-4 text-slate-500 animate-spin" /></div>
  }

  if (error) {
    return <div className="px-3 pb-3 text-xs text-red-400">{error}</div>
  }

  return (
    <div className="px-3 pb-3 space-y-1.5 max-h-64 overflow-y-auto border-t border-slate-800">
      {mensagens.map(m => (
        <div key={m.id} className={cn('flex', m.direcao === 'outbound' ? 'justify-end' : 'justify-start')}>
          <div className={cn(
            'max-w-[80%] px-3 py-1.5 rounded-lg text-xs mt-2',
            m.direcao === 'outbound' ? 'bg-amber-500/15 text-amber-100' : 'bg-slate-800 text-gray-200',
          )}>
            {m.texto || `[${m.tipo}]`}
          </div>
        </div>
      ))}
    </div>
  )
}
