import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Play, Pause, RotateCw, RefreshCw, Send, CheckCircle, Eye, MessageSquare, AlertTriangle, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { Campanha } from './hooks/useCampanhas'
import { DeliveryCoverageRing } from './components/DeliveryCoverageRing'
import { CampanhaContatosPanel } from './components/CampanhaContatosPanel'

const STATUS_CFG: Record<string, { label: string; cls: string; bgCls: string }> = {
  rascunho:   { label: 'Rascunho',   cls: 'text-gray-400 border-gray-500/30', bgCls: 'bg-gray-500/10' },
  executando: { label: 'Executando', cls: 'text-blue-400 border-blue-500/30', bgCls: 'bg-blue-500/10' },
  pausada:    { label: 'Pausada',    cls: 'text-yellow-400 border-yellow-500/30', bgCls: 'bg-yellow-500/10' },
  concluida:  { label: 'Concluída',  cls: 'text-emerald-400 border-emerald-500/30', bgCls: 'bg-emerald-500/10' },
  falha:      { label: 'Falha',      cls: 'text-red-400 border-red-500/30', bgCls: 'bg-red-500/10' },
}

export function CampanhaDetalhePage() {
  const { campanhaId } = useParams<{ campanhaId: string }>()
  const navigate = useNavigate()
  const [campanha, setCampanha] = useState<Campanha | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [template, setTemplate] = useState<any>(null)

  const fetchCampanha = useCallback(async () => {
    if (!campanhaId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('campanhas')
      .select('*, templates_meta(nome), numeros_meta(nome)')
      .eq('id', campanhaId)
      .single()
    if (error || !data) {
      setNotFound(true)
      setCampanha(null)
    } else {
      const row = data as any
      setCampanha({ ...row, template_nome: row.templates_meta?.nome ?? null, numero_nome: row.numeros_meta?.nome ?? null })
    }
    setLoading(false)
  }, [campanhaId])

  useEffect(() => { fetchCampanha() }, [fetchCampanha])

  useEffect(() => {
    if (!campanha?.template_id) { setTemplate(null); return }
    supabase
      .from('templates_meta')
      .select('nome, header_type, media_url, body_text, componentes')
      .eq('id', campanha.template_id)
      .single()
      .then(({ data }) => setTemplate(data))
  }, [campanha?.template_id])

  async function handleAction(action: 'iniciar' | 'pausar' | 'retomar') {
    if (!campanhaId) return
    const { error } = await supabase.functions.invoke('controle-campanha', { body: { campanha_id: campanhaId, action } })
    if (error) { toast.error(error.message); return }
    toast.success(`Campanha ${action === 'iniciar' ? 'iniciada' : action === 'pausar' ? 'pausada' : 'retomada'}`)
    fetchCampanha()
  }

  async function handleReenviarFalhas() {
    if (!campanhaId) return
    const { error: resetErr } = await supabase.from('campanha_contatos').update({ status: 'pendente', erro: null }).eq('campanha_id', campanhaId).eq('status', 'falha')
    if (resetErr) { toast.error(resetErr.message); return }
    await supabase.from('campanhas').update({ falhas: 0, status: 'executando', updated_at: new Date().toISOString() }).eq('id', campanhaId)
    const { data, error } = await supabase.functions.invoke('enviar-campanha', { body: { campanha_id: campanhaId } })
    if (error) { toast.error(error.message); return }
    if (data?.error) { toast.error(data.error); return }
    toast.success(`Reenviando ${campanha?.falhas ?? 0} contatos com falha`)
    fetchCampanha()
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-gray-500"><RefreshCw className="w-5 h-5 animate-spin" /></div>
  }
  if (notFound || !campanha) {
    return (
      <div className="text-center py-24 text-gray-500">
        <p>Campanha não encontrada.</p>
        <button onClick={() => navigate('/app/campanhas')} className="mt-3 text-amber-400 hover:text-amber-300 text-sm">
          Voltar para Campanhas
        </button>
      </div>
    )
  }

  const cfg = STATUS_CFG[campanha.status] ?? STATUS_CFG.rascunho

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <button onClick={() => navigate('/app/campanhas')} className="p-2 text-gray-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0 mt-0.5">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-white truncate">{campanha.nome}</h1>
              <span className={cn('inline-flex items-center text-xs px-2 py-0.5 rounded-full border', cfg.cls, cfg.bgCls)}>
                {cfg.label}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {campanha.template_nome ?? 'Sem template'} · {campanha.numero_nome ?? 'Sem número'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {campanha.status === 'rascunho' && (
            <button onClick={() => handleAction('iniciar')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition-colors">
              <Play className="w-4 h-4" /> Iniciar
            </button>
          )}
          {campanha.status === 'executando' && (
            <button onClick={() => handleAction('pausar')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-yellow-400 hover:bg-yellow-500/20 rounded-lg transition-colors">
              <Pause className="w-4 h-4" /> Pausar
            </button>
          )}
          {campanha.status === 'pausada' && (
            <button onClick={() => handleAction('retomar')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors">
              <RotateCw className="w-4 h-4" /> Retomar
            </button>
          )}
        </div>
      </div>

      {/* Métricas de entrega */}
      <div className="flex gap-6 items-start bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <DeliveryCoverageRing total={campanha.total_contatos} entregues={campanha.entregues} lidos={campanha.lidos} size={100} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
          <MiniKPI icon={Send} label="Enviados" value={campanha.enviados} total={campanha.total_contatos} color="blue" />
          <MiniKPI icon={CheckCircle} label="Entregues" value={campanha.entregues} sub={campanha.enviados > 0 ? `${Math.round((campanha.entregues / campanha.enviados) * 100)}%` : undefined} color="emerald" />
          <MiniKPI icon={Eye} label="Lidos" value={campanha.lidos} sub={campanha.entregues > 0 ? `${Math.round((campanha.lidos / campanha.entregues) * 100)}%` : undefined} color="purple" />
          <MiniKPI icon={MessageSquare} label="Respostas" value={campanha.respondidos} sub={campanha.entregues > 0 ? `${Math.round((campanha.respondidos / campanha.entregues) * 100)}%` : undefined} color="amber" />
        </div>
      </div>

      {/* Alerta de falhas */}
      {campanha.falhas > 0 && (
        <div className="flex items-center justify-between px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-sm text-red-300">{campanha.falhas} mensagens com falha</span>
          </div>
          <button onClick={handleReenviarFalhas} className="text-sm text-amber-400 hover:text-amber-300 font-medium transition-colors">
            Reenviar
          </button>
        </div>
      )}

      {/* Template completo */}
      {template && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="flex items-center gap-1.5 px-4 pt-3 pb-1.5">
            <ImageIcon className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">Template</span>
          </div>
          {template.header_type === 'IMAGE' && (() => {
            const imgUrl = campanha.media_url_custom || template.media_url || template.componentes?.[0]?.example?.header_handle?.[0]
            return imgUrl ? (
              <div className="px-4 pb-2">
                <img src={imgUrl} alt="Header" className="w-full max-h-72 object-cover rounded-lg" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
              </div>
            ) : null
          })()}
          {template.body_text && (
            <div className="px-4 pb-3">
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{template.body_text}</p>
            </div>
          )}
          {template.componentes?.find((c: any) => c.type === 'BUTTONS')?.buttons && (
            <div className="px-4 pb-3 flex flex-wrap gap-2">
              {template.componentes.find((c: any) => c.type === 'BUTTONS').buttons.map((btn: any, i: number) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-slate-700/50 text-blue-400 border border-slate-600/50">
                  {btn.text}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <p className="text-xs text-gray-400 mb-3">Timeline</p>
        <div className="space-y-2">
          <TimelineItem label="Criada" data={campanha.created_at} />
          {campanha.iniciada_em && <TimelineItem label="Iniciada" data={campanha.iniciada_em} />}
          {campanha.concluida_em && <TimelineItem label="Concluída" data={campanha.concluida_em} />}
        </div>
      </div>

      {/* Contatos */}
      <CampanhaContatosPanel campanha={campanha} onReenviarFalhas={handleReenviarFalhas} />
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function MiniKPI({ icon: Icon, label, value, total, sub, color }: {
  icon: React.ElementType; label: string; value: number; total?: number; sub?: string
  color: 'blue' | 'emerald' | 'purple' | 'amber'
}) {
  const colors = { blue: 'text-blue-400', emerald: 'text-emerald-400', purple: 'text-purple-400', amber: 'text-amber-400' }
  return (
    <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={cn('w-3.5 h-3.5', colors[color])} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className="text-lg font-bold text-white leading-tight">
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
        <span className="text-sm text-gray-400">{label}</span>
        <span className="text-xs text-gray-500">
          {d.toLocaleDateString('pt-BR')} {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  )
}
