import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Play, Pause, RotateCw, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { Campanha } from './hooks/useCampanhas'

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

  async function handleAction(action: 'iniciar' | 'pausar' | 'retomar') {
    if (!campanhaId) return
    const { error } = await supabase.functions.invoke('controle-campanha', { body: { campanha_id: campanhaId, action } })
    if (error) { toast.error(error.message); return }
    toast.success(`Campanha ${action === 'iniciar' ? 'iniciada' : action === 'pausar' ? 'pausada' : 'retomada'}`)
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
    </div>
  )
}
