import { useState, useEffect } from 'react'
import { X, Send, CheckCircle, Eye, MessageSquare, AlertTriangle, Clock, Search, Maximize2, Minimize2, ArrowRight, RefreshCw, ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { Campanha } from '../hooks/useCampanhas'
import { useContatosCampanha, type TabStatus } from '../hooks/useContatosCampanha'
import { DeliveryCoverageRing } from './DeliveryCoverageRing'
import { BulkActionBar } from './BulkActionBar'

interface Props {
  campanha: Campanha | null
  onClose: () => void
  onReenviarFalhas?: (c: Campanha) => void
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pendente: { label: 'Pendente', cls: 'bg-gray-500/20 text-gray-400' },
  enviado: { label: 'Enviado', cls: 'bg-blue-500/20 text-blue-400' },
  entregue: { label: 'Entregue', cls: 'bg-emerald-500/20 text-emerald-400' },
  lido: { label: 'Lido', cls: 'bg-purple-500/20 text-purple-400' },
  falha: { label: 'Falha', cls: 'bg-red-500/20 text-red-400' },
  bloqueado: { label: 'Opt-out', cls: 'bg-orange-500/20 text-orange-400' },
  invalido: { label: 'Não WhatsApp', cls: 'bg-zinc-500/20 text-zinc-400' },
  ignorado: { label: 'Ignorado', cls: 'bg-yellow-500/20 text-yellow-400' },
}

const TABS: { id: TabStatus; label: string; color: string }[] = [
  { id: 'todos', label: 'Todos', color: 'gray' },
  { id: 'pendentes', label: 'Pendentes', color: 'gray' },
  { id: 'falhas', label: 'Falhas', color: 'red' },
  { id: 'nao_entregues', label: 'Não entregues', color: 'yellow' },
  { id: 'entregues', label: 'Entregues', color: 'emerald' },
]

const TAB_BADGE_COLORS: Record<string, string> = {
  gray: 'bg-gray-500/20 text-gray-400',
  red: 'bg-red-500/20 text-red-400',
  yellow: 'bg-yellow-500/20 text-yellow-400',
  emerald: 'bg-emerald-500/20 text-emerald-400',
}

export function CampanhaDrawer({ campanha: c, onClose, onReenviarFalhas }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [template, setTemplate] = useState<any>(null)

  // Fetch template data
  useEffect(() => {
    if (!c?.template_id) { setTemplate(null); return }
    supabase
      .from('templates_meta')
      .select('nome, header_type, media_url, body_text, componentes')
      .eq('id', c.template_id)
      .single()
      .then(({ data }) => setTemplate(data))
  }, [c?.template_id])

  const {
    loading, contadores, filtrados,
    searchTerm, setSearchTerm, activeTab, setActiveTab,
    copiarNaoEntregues, exportarCSV,
  } = useContatosCampanha(c?.id ?? null)

  if (!c) return null

  const taxaEntrega = c.enviados > 0 ? Math.round((c.entregues / c.enviados) * 100) : 0
  const taxaLeitura = c.entregues > 0 ? Math.round((c.lidos / c.entregues) * 100) : 0
  const taxaResposta = c.entregues > 0 ? Math.round((c.respondidos / c.entregues) * 100) : 0

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className={cn(
        'fixed right-0 top-0 h-full bg-slate-900 border-l border-slate-700 z-50 flex flex-col animate-in slide-in-from-right duration-200 transition-all',
        expanded ? 'w-[640px] max-w-[95vw]' : 'w-[420px] max-w-[90vw]',
      )}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-white font-semibold truncate">{c.nome}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{c.template_nome ?? 'Sem template'} · {c.numero_nome ?? 'Sem número'}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setExpanded(v => !v)}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-slate-700 rounded transition"
              title={expanded ? 'Colapsar' : 'Expandir'}
            >
              {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white hover:bg-slate-700 rounded transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Ring + KPIs */}
          <div className={cn('flex gap-4', expanded ? 'items-start' : 'flex-col items-center')}>
            <DeliveryCoverageRing
              total={c.total_contatos}
              entregues={c.entregues}
              lidos={c.lidos}
              size={expanded ? 80 : 120}
            />
            <div className={cn('grid grid-cols-2 gap-2 flex-1', expanded ? 'w-full' : 'w-full')}>
              <MiniKPI icon={Send} label="Enviados" value={c.enviados} total={c.total_contatos} color="blue" />
              <MiniKPI icon={CheckCircle} label="Entregues" value={c.entregues} sub={`${taxaEntrega}%`} color="emerald" />
              <MiniKPI icon={Eye} label="Lidos" value={c.lidos} sub={`${taxaLeitura}%`} color="purple" />
              <MiniKPI icon={MessageSquare} label="Respostas" value={c.respondidos} sub={`${taxaResposta}%`} color="amber" />
            </div>
          </div>

          {/* Alerta de falhas */}
          {c.falhas > 0 && (
            <div className="flex items-center justify-between px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse" />
                <span className="text-sm text-red-300">{c.falhas} mensagens com falha</span>
              </div>
              {onReenviarFalhas && (
                <button
                  onClick={() => onReenviarFalhas(c)}
                  className="text-xs text-amber-400 hover:text-amber-300 font-medium transition"
                >
                  Reenviar
                </button>
              )}
            </div>
          )}

          {/* Preview do template */}
          {template && !expanded && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
              <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1">
                <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">Preview do Template</span>
              </div>
              {/* Header image */}
              {template.header_type === 'IMAGE' && (() => {
                const imgUrl = c.media_url_custom
                  || template.media_url
                  || template.componentes?.[0]?.example?.header_handle?.[0]
                return imgUrl ? (
                  <div className="px-3 pb-1">
                    <img
                      src={imgUrl}
                      alt="Header"
                      className="w-full max-h-40 object-cover rounded-lg"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    />
                  </div>
                ) : null
              })()}
              {/* Body text */}
              {template.body_text && (
                <div className="px-3 pb-2.5">
                  <p className="text-xs text-gray-300 whitespace-pre-wrap line-clamp-6">{template.body_text}</p>
                </div>
              )}
              {/* Buttons */}
              {template.componentes?.find((c: any) => c.type === 'BUTTONS')?.buttons && (
                <div className="px-3 pb-2.5 flex flex-wrap gap-1.5">
                  {template.componentes.find((c: any) => c.type === 'BUTTONS').buttons.map((btn: any, i: number) => (
                    <span key={i} className="text-[10px] px-2 py-1 rounded-full bg-slate-700/50 text-blue-400 border border-slate-600/50">
                      {btn.text}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Modo colapsado: custo + timeline + botão expandir */}
          {!expanded && (
            <>
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

              {/* Botão expandir */}
              <button
                onClick={() => setExpanded(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-amber-500/30 rounded-lg text-sm text-amber-400 hover:text-amber-300 transition-colors"
              >
                Ver contatos ({c.total_contatos})
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Modo expandido: tabs + busca + contatos */}
          {expanded && (
            <>
              {/* Tabs */}
              <div className="flex gap-1.5 flex-wrap">
                {TABS.map(tab => {
                  const count = contadores[tab.id]
                  const isActive = activeTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                        isActive
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          : 'text-gray-400 border-slate-700 hover:text-white hover:border-slate-600',
                      )}
                    >
                      {tab.label}
                      {count > 0 && (
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', TAB_BADGE_COLORS[tab.color])}>
                          {count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Busca */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Buscar por telefone..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:border-amber-500/50 focus:outline-none transition"
                />
              </div>

              {/* Lista de contatos */}
              <div className="space-y-1 max-h-[calc(100vh-460px)] overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="w-4 h-4 text-slate-500 animate-spin" />
                  </div>
                ) : filtrados.length === 0 ? (
                  <p className="text-center text-gray-500 text-sm py-6">Nenhum contato nesta categoria</p>
                ) : (
                  filtrados.map(ct => {
                    const badge = STATUS_BADGE[ct.status] ?? STATUS_BADGE.pendente
                    const isFalha = ct.status === 'falha'
                    return (
                      <div
                        key={ct.id}
                        className={cn(
                          'flex items-center justify-between px-3 py-2 rounded-lg transition-colors',
                          isFalha
                            ? 'bg-red-500/5 border-l-2 border-red-500'
                            : 'bg-slate-800/50 hover:bg-slate-800',
                        )}
                      >
                        <span className="text-xs text-gray-300 font-mono">{ct.telefone}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap', badge.cls)}>
                            {badge.label}
                          </span>
                          {ct.erro && (
                            <span className="text-[10px] text-red-400 truncate max-w-[150px]" title={ct.erro}>
                              {ct.erro}
                            </span>
                          )}
                          {ct.enviado_em && (
                            <span className="text-[10px] text-gray-600 whitespace-nowrap">
                              {new Date(ct.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </>
          )}
        </div>

        {/* Bulk Action Bar (só no modo expandido) */}
        {expanded && (
          <BulkActionBar
            falhas={c.falhas}
            onReenviarFalhas={async () => { onReenviarFalhas?.(c) }}
            onCopiarNumeros={copiarNaoEntregues}
            onExportarCSV={() => exportarCSV(c.nome)}
          />
        )}
      </div>
    </>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function MiniKPI({ icon: Icon, label, value, total, sub, color }: {
  icon: React.ElementType; label: string; value: number; total?: number; sub?: string
  color: 'blue' | 'emerald' | 'purple' | 'amber'
}) {
  const colors = { blue: 'text-blue-400', emerald: 'text-emerald-400', purple: 'text-purple-400', amber: 'text-amber-400' }
  return (
    <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-700/50">
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon className={cn('w-3 h-3', colors[color])} />
        <span className="text-[10px] text-gray-500">{label}</span>
      </div>
      <div className="text-base font-bold text-white leading-tight">
        {value.toLocaleString('pt-BR')}
        {total !== undefined && <span className="text-[10px] text-gray-600 font-normal ml-0.5">/ {total}</span>}
      </div>
      {sub && <span className={cn('text-[10px]', colors[color])}>{sub}</span>}
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
