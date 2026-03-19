import { useState, useEffect } from 'react'
import { X, Send, CheckCircle, Eye, MessageSquare, AlertTriangle, Clock, ChevronDown, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { Campanha } from '../hooks/useCampanhas'

interface Props {
  campanha: Campanha | null
  onClose: () => void
}

interface ContatoStatus {
  id: string
  telefone: string
  status: string
  erro: string | null
  enviado_em: string | null
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pendente: { label: 'Pendente', cls: 'bg-gray-500/20 text-gray-400' },
  enviado: { label: 'Enviado', cls: 'bg-blue-500/20 text-blue-400' },
  entregue: { label: 'Entregue', cls: 'bg-emerald-500/20 text-emerald-400' },
  lido: { label: 'Lido', cls: 'bg-purple-500/20 text-purple-400' },
  falha: { label: 'Falha', cls: 'bg-red-500/20 text-red-400' },
  ignorado: { label: 'Ignorado', cls: 'bg-yellow-500/20 text-yellow-400' },
}

export function CampanhaDrawer({ campanha: c, onClose }: Props) {
  const [contatos, setContatos] = useState<ContatoStatus[]>([])
  const [loadingContatos, setLoadingContatos] = useState(false)
  const [mostrarContatos, setMostrarContatos] = useState(false)

  useEffect(() => {
    if (!c) return
    if (mostrarContatos) {
      setLoadingContatos(true)
      supabase
        .from('campanha_contatos')
        .select('id, telefone, status, erro, enviado_em')
        .eq('campanha_id', c.id)
        .order('created_at', { ascending: true })
        .limit(200)
        .then(({ data }) => { setContatos(data ?? []); setLoadingContatos(false) })
    }
  }, [c?.id, mostrarContatos])

  // Realtime — atualizar contatos do drawer
  useEffect(() => {
    if (!c || !mostrarContatos) return
    const channel = supabase
      .channel(`contatos_realtime_${c.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'campanha_contatos',
        filter: `campanha_id=eq.${c.id}`,
      }, (payload) => {
        const updated = payload.new as ContatoStatus
        setContatos(prev => prev.map(ct => ct.id === updated.id ? updated : ct))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [c?.id, mostrarContatos])

  if (!c) return null

  const progresso = c.total_contatos > 0 ? Math.round(((c.enviados + c.falhas) / c.total_contatos) * 100) : 0
  const taxaEntrega = c.enviados > 0 ? Math.round((c.entregues / c.enviados) * 100) : 0
  const taxaLeitura = c.entregues > 0 ? Math.round((c.lidos / c.entregues) * 100) : 0
  const taxaResposta = c.entregues > 0 ? Math.round((c.respondidos / c.entregues) * 100) : 0

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[420px] max-w-[90vw] bg-slate-900 border-l border-slate-700 z-50 flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
          <div>
            <h2 className="text-white font-semibold">{c.nome}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{c.template_nome ?? 'Sem template'} · {c.numero_nome ?? 'Sem número'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white hover:bg-slate-700 rounded transition"><X className="w-5 h-5" /></button>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Progresso */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400">Progresso</span>
              <span className="text-xs text-white font-medium">{progresso}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all" style={{ width: `${progresso}%` }} />
            </div>
          </div>

          {/* Mini funil */}
          <div className="grid grid-cols-2 gap-3">
            <MiniKPI icon={Send} label="Enviados" value={c.enviados} total={c.total_contatos} color="blue" />
            <MiniKPI icon={CheckCircle} label="Entregues" value={c.entregues} sub={`${taxaEntrega}%`} color="emerald" />
            <MiniKPI icon={Eye} label="Lidos" value={c.lidos} sub={`${taxaLeitura}%`} color="purple" />
            <MiniKPI icon={MessageSquare} label="Respostas" value={c.respondidos} sub={`${taxaResposta}%`} color="amber" />
          </div>

          {c.falhas > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-sm text-red-300">{c.falhas} mensagens com falha</span>
            </div>
          )}

          {/* Custo */}
          {(c.custo_estimado > 0 || c.custo_real > 0) && (
            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
              <p className="text-xs text-gray-500 mb-1">Custo</p>
              <div className="flex items-baseline gap-3">
                <span className="text-lg font-bold text-white">R$ {(c.custo_real || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                {c.custo_estimado > 0 && <span className="text-xs text-gray-500">est. R$ {c.custo_estimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div>
            <p className="text-xs text-gray-400 mb-2">Timeline</p>
            <div className="space-y-2">
              <TimelineItem label="Criada" data={c.created_at} />
              {c.iniciada_em && <TimelineItem label="Iniciada" data={c.iniciada_em} />}
              {c.concluida_em && <TimelineItem label="Concluída" data={c.concluida_em} />}
            </div>
          </div>

          {/* Lista de contatos */}
          <div>
            <button onClick={() => setMostrarContatos(v => !v)} className="flex items-center gap-2 text-xs text-amber-400 hover:text-amber-300 transition">
              <ChevronDown className={cn('w-4 h-4 transition-transform', mostrarContatos && 'rotate-180')} />
              {mostrarContatos ? 'Esconder' : 'Ver'} contatos ({c.total_contatos})
            </button>

            {mostrarContatos && (
              <div className="mt-3 space-y-1.5 max-h-64 overflow-y-auto">
                {loadingContatos ? (
                  <div className="text-center py-4"><RefreshCw className="w-4 h-4 text-slate-500 animate-spin mx-auto" /></div>
                ) : (
                  contatos.map(ct => {
                    const badge = STATUS_BADGE[ct.status] ?? STATUS_BADGE.pendente
                    return (
                      <div key={ct.id} className="flex items-center justify-between px-3 py-1.5 bg-slate-800/50 rounded-lg">
                        <span className="text-xs text-gray-300 font-mono">{ct.telefone}</span>
                        <div className="flex items-center gap-2">
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', badge.cls)}>{badge.label}</span>
                          {ct.erro && (
                            <span className="text-[10px] text-red-400 truncate max-w-[120px]" title={ct.erro}>{ct.erro}</span>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function MiniKPI({ icon: Icon, label, value, total, sub, color }: {
  icon: React.ElementType; label: string; value: number; total?: number; sub?: string
  color: 'blue' | 'emerald' | 'purple' | 'amber'
}) {
  const colors = { blue: 'text-blue-400', emerald: 'text-emerald-400', purple: 'text-purple-400', amber: 'text-amber-400' }
  return (
    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={cn('w-3.5 h-3.5', colors[color])} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className="text-lg font-bold text-white">
        {value.toLocaleString('pt-BR')}
        {total !== undefined && <span className="text-xs text-gray-600 font-normal ml-1">/ {total}</span>}
      </div>
      {sub && <span className={cn('text-xs', colors[color])}>{sub}</span>}
    </div>
  )
}

function TimelineItem({ label, data }: { label: string; data: string }) {
  const d = new Date(data)
  return (
    <div className="flex items-center gap-3">
      <div className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
      <div className="flex-1 flex items-center justify-between">
        <span className="text-xs text-gray-400">{label}</span>
        <span className="text-xs text-gray-500">
          {d.toLocaleDateString('pt-BR')} {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  )
}
