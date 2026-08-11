import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useMensagensCampanha } from '../hooks/useConversasCampanha'

interface ContatoConversa {
  conversaId: string
  telefone: string
  nomeContato: string | null
  ultimaMensagem: string | null
  ultimaMensagemEm: string | null
}

export function CampanhaConversasPanel({ campanhaId }: { campanhaId: string }) {
  const [contatos, setContatos] = useState<ContatoConversa[]>([])
  const [loading, setLoading] = useState(true)
  const [expandido, setExpandido] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    supabase
      .from('mensagens_campanha')
      .select('conversa_id, telefone, texto, created_at, conversas_campanha(nome_contato)')
      .eq('campanha_id', campanhaId)
      .eq('direcao', 'inbound')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const porConversa = new Map<string, ContatoConversa>()
        for (const row of (data ?? []) as any[]) {
          if (porConversa.has(row.conversa_id)) continue
          porConversa.set(row.conversa_id, {
            conversaId: row.conversa_id,
            telefone: row.telefone,
            nomeContato: row.conversas_campanha?.nome_contato ?? null,
            ultimaMensagem: row.texto,
            ultimaMensagemEm: row.created_at,
          })
        }
        setContatos(Array.from(porConversa.values()))
        setLoading(false)
      })
      .catch((error) => {
        console.error('Erro ao carregar conversas da campanha:', error)
        setContatos([])
        setLoading(false)
      })
  }, [campanhaId])

  if (loading) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="flex items-center justify-center py-6"><RefreshCw className="w-4 h-4 text-slate-500 animate-spin" /></div>
      </div>
    )
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-2">
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
            {expandido === c.conversaId && <ThreadSomenteLeitura conversaId={c.conversaId} telefone={c.telefone} />}
          </div>
        ))
      )}
    </div>
  )
}

function ThreadSomenteLeitura({ conversaId, telefone }: { conversaId: string; telefone: string }) {
  const { mensagens, loading } = useMensagensCampanha(conversaId, telefone)

  if (loading) {
    return <div className="px-3 pb-3"><RefreshCw className="w-4 h-4 text-slate-500 animate-spin" /></div>
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
