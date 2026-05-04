import { useState } from 'react'
import { Plus, Play, Pause, RotateCw, Trash2, RefreshCw, Megaphone, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useCampanhas, type Campanha, type FiltroStatus } from '../hooks/useCampanhas'
import { ModalNovaCampanha } from '../components/ModalNovaCampanha'
import { CampanhaDrawer } from '../components/CampanhaDrawer'
import { Button } from '@/components/ui/button'

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; icon: React.ElementType; cls: string; bgCls: string }> = {
  rascunho:   { label: 'Rascunho',   icon: Clock,          cls: 'text-gray-400 border-gray-500/30', bgCls: 'bg-gray-500/10' },
  executando: { label: 'Executando',  icon: Play,           cls: 'text-blue-400 border-blue-500/30', bgCls: 'bg-blue-500/10' },
  pausada:    { label: 'Pausada',     icon: Pause,          cls: 'text-yellow-400 border-yellow-500/30', bgCls: 'bg-yellow-500/10' },
  concluida:  { label: 'Concluída',   icon: CheckCircle,    cls: 'text-emerald-400 border-emerald-500/30', bgCls: 'bg-emerald-500/10' },
  falha:      { label: 'Falha',       icon: XCircle,        cls: 'text-red-400 border-red-500/30', bgCls: 'bg-red-500/10' },
}

// ─── CampanhasTab ─────────────────────────────────────────────────────────────

export function CampanhasTab({ unidadeId }: { unidadeId: string | null }) {
  const { campanhas, loading, refetch, controlar, excluir, reenviarFalhas } = useCampanhas(unidadeId ?? undefined)
  const [filtro, setFiltro] = useState<FiltroStatus>('todos')
  const [modalAberta, setModalAberta] = useState(false)
  const [drawerCampanha, setDrawerCampanha] = useState<Campanha | null>(null)

  const filtradas = campanhas.filter(c => filtro === 'todos' || c.status === filtro)

  const contadores: Record<FiltroStatus, number> = {
    todos: campanhas.length,
    rascunho: campanhas.filter(c => c.status === 'rascunho').length,
    executando: campanhas.filter(c => c.status === 'executando').length,
    pausada: campanhas.filter(c => c.status === 'pausada').length,
    concluida: campanhas.filter(c => c.status === 'concluida').length,
    falha: campanhas.filter(c => c.status === 'falha').length,
  }

  async function handleAction(campanha: Campanha, action: 'iniciar' | 'pausar' | 'retomar') {
    const { error } = await controlar(campanha.id, action)
    if (error) toast.error(error)
    else toast.success(`Campanha ${action === 'iniciar' ? 'iniciada' : action === 'pausar' ? 'pausada' : 'retomada'}`)
  }

  async function handleExcluir(campanha: Campanha) {
    if (!confirm(`Excluir "${campanha.nome}"? Todos os contatos e mensagens serão perdidos.`)) return
    const { error } = await excluir(campanha.id)
    if (error) toast.error(error)
    else toast.success('Campanha excluída')
  }

  async function handleRetry(campanha: Campanha) {
    const { error } = await reenviarFalhas(campanha.id)
    if (error) toast.error(error)
    else toast.success(`Reenviando ${campanha.falhas} contatos com falha`)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {(['todos', 'rascunho', 'executando', 'pausada', 'concluida', 'falha'] as FiltroStatus[]).map(s => (
            <button
              key={s}
              onClick={() => setFiltro(s)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                filtro === s
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  : 'text-gray-400 border-slate-700 hover:text-white hover:border-slate-600',
              )}
            >
              {s === 'todos' ? 'Todas' : STATUS_CFG[s]?.label ?? s}
              <span className="ml-1 opacity-60">({contadores[s]})</span>
            </button>
          ))}
        </div>
        <Button onClick={() => setModalAberta(true)} className="bg-amber-500 hover:bg-amber-600 text-black">
          <Plus className="w-4 h-4 mr-1.5" />
          Nova Campanha
        </Button>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 py-8 justify-center">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Carregando...
        </div>
      ) : filtradas.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>{campanhas.length === 0 ? 'Nenhuma campanha criada ainda.' : 'Nenhuma campanha com esse filtro.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtradas.map(c => (
            <CampanhaCard
              key={c.id}
              campanha={c}
              onAction={handleAction}
              onExcluir={handleExcluir}
              onRetry={handleRetry}
              onClick={() => setDrawerCampanha(c)}
            />
          ))}
        </div>
      )}

      <ModalNovaCampanha
        open={modalAberta}
        onOpenChange={setModalAberta}
        onCriada={() => refetch()}
        unidadeId={unidadeId}
      />

      <CampanhaDrawer campanha={drawerCampanha} onClose={() => setDrawerCampanha(null)} onReenviarFalhas={handleRetry} />
    </div>
  )
}

// ─── Card de Campanha ─────────────────────────────────────────────────────────

function CampanhaCard({ campanha: c, onAction, onExcluir, onRetry, onClick }: {
  campanha: Campanha
  onAction: (c: Campanha, a: 'iniciar' | 'pausar' | 'retomar') => void
  onExcluir: (c: Campanha) => void
  onRetry: (c: Campanha) => void
  onClick: () => void
}) {
  const cfg = STATUS_CFG[c.status] ?? STATUS_CFG.rascunho
  const Icon = cfg.icon
  const progresso = c.total_contatos > 0 ? Math.round(((c.enviados + c.falhas) / c.total_contatos) * 100) : 0
  const taxaEntrega = c.enviados > 0 && c.entregues > 0 ? Math.round((c.entregues / c.enviados) * 100) : null

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-3 cursor-pointer hover:border-slate-600/50 transition-colors" onClick={onClick}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-white font-semibold truncate">{c.nome}</h3>
            <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border', cfg.cls, cfg.bgCls)}>
              <Icon className="w-3 h-3" />
              {cfg.label}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-1 flex gap-3 flex-wrap">
            {c.template_nome && <span>Template: {c.template_nome}</span>}
            {c.numero_nome && <span>Número: {c.numero_nome}</span>}
            <span>Criada: {new Date(c.created_at).toLocaleDateString('pt-BR')}</span>
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {c.status === 'rascunho' && (
            <button onClick={() => onAction(c, 'iniciar')} className="p-1.5 text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors" title="Iniciar">
              <Play className="w-4 h-4" />
            </button>
          )}
          {c.status === 'executando' && (
            <button onClick={() => onAction(c, 'pausar')} className="p-1.5 text-yellow-400 hover:bg-yellow-500/20 rounded transition-colors" title="Pausar">
              <Pause className="w-4 h-4" />
            </button>
          )}
          {c.status === 'pausada' && (
            <button onClick={() => onAction(c, 'retomar')} className="p-1.5 text-blue-400 hover:bg-blue-500/20 rounded transition-colors" title="Retomar">
              <RotateCw className="w-4 h-4" />
            </button>
          )}
          {c.falhas > 0 && (c.status === 'concluida' || c.status === 'pausada' || c.status === 'falha') && (
            <button onClick={() => onRetry(c)} className="p-1.5 text-orange-400 hover:bg-orange-500/20 rounded transition-colors" title={`Reenviar ${c.falhas} falhas`}>
              <AlertTriangle className="w-4 h-4" />
            </button>
          )}
          {(c.status === 'rascunho' || c.status === 'concluida' || c.status === 'falha') && (
            <button onClick={() => onExcluir(c)} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors" title="Excluir">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Barra de progresso */}
      {c.total_contatos > 0 && (
        <div className="space-y-1.5">
          <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-amber-500 to-amber-400"
              style={{ width: `${progresso}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex gap-3">
              <span>{c.enviados} enviados</span>
              {c.entregues > 0 && <span className="text-emerald-400">{c.entregues} entregues</span>}
              {c.lidos > 0 && <span className="text-blue-400">{c.lidos} lidos</span>}
              {c.respondidos > 0 && <span className="text-purple-400">{c.respondidos} respostas</span>}
              {(() => {
                const naoEntregues = c.enviados - c.entregues - c.falhas;
                return naoEntregues > 0 ? (
                  <span className="text-amber-400" title="Saíram da plataforma mas WhatsApp ainda não confirmou entrega">
                    {naoEntregues} não entregues
                  </span>
                ) : null;
              })()}
              {c.falhas > 0 && <span className="text-red-400">{c.falhas} falhas</span>}
            </div>
            <span>{progresso}% · {c.total_contatos} total</span>
          </div>
        </div>
      )}

      {/* Custo */}
      {(c.custo_estimado > 0 || c.custo_real > 0) && (
        <div className="flex items-center gap-4 text-xs">
          {c.custo_estimado > 0 && (
            <span className="text-gray-500">
              Est: R$ {c.custo_estimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          )}
          {c.custo_real > 0 && (
            <span className="text-amber-400 font-medium">
              Real: R$ {c.custo_real.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          )}
          {taxaEntrega !== null && (
            <span className="text-gray-500">Entrega: {taxaEntrega}%</span>
          )}
        </div>
      )}
    </div>
  )
}
