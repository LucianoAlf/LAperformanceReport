import { Send, CheckCircle, Eye, MessageSquare, AlertTriangle, DollarSign, Bot, TrendingUp, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useKPIsCampanha } from '../hooks/useKPIsCampanha'
import { useCampanhas } from '../hooks/useCampanhas'

export function DashboardTab({ unidadeId }: { unidadeId: string | null }) {
  const uid = unidadeId ?? undefined
  const { kpis, loading } = useKPIsCampanha(uid)
  const { campanhas } = useCampanhas(uid)

  if (loading || !kpis) {
    return <div className="text-gray-500 py-8 text-center text-sm">Carregando KPIs...</div>
  }

  const campanhasRecentes = campanhas.slice(0, 5)
  const cotaPct = kpis.cotaDiariaLimite > 0 ? Math.min(100, Math.round((kpis.cotaDiariaUsada / kpis.cotaDiariaLimite) * 100)) : 0

  return (
    <div className="space-y-6">
      {/* KPIs principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard icon={Send} label="Enviados" value={kpis.totalEnviados} color="blue" />
        <KPICard icon={CheckCircle} label="Entregues" value={kpis.totalEntregues} sub={`${kpis.taxaEntrega}%`} color="emerald" />
        <KPICard icon={Eye} label="Lidos" value={kpis.totalLidos} sub={`${kpis.taxaLeitura}%`} color="purple" />
        <KPICard icon={MessageSquare} label="Respostas" value={kpis.totalRespondidos} sub={`${kpis.taxaResposta}%`} color="amber" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Custo mensal */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4 text-amber-400" />
            <span className="text-sm text-gray-400">Custo do mês</span>
          </div>
          <div className="text-2xl font-bold text-white">
            R$ {kpis.custoRealMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          {kpis.orcamentoMensal && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-500">Orçamento: R$ {kpis.orcamentoMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                <span className={cn(
                  kpis.custoRealMes > kpis.orcamentoMensal ? 'text-red-400' : 'text-gray-400',
                )}>
                  {Math.round((kpis.custoRealMes / kpis.orcamentoMensal) * 100)}%
                </span>
              </div>
              <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    kpis.custoRealMes > kpis.orcamentoMensal ? 'bg-red-500' : 'bg-amber-500',
                  )}
                  style={{ width: `${Math.min(100, (kpis.custoRealMes / kpis.orcamentoMensal) * 100)}%` }}
                />
              </div>
            </div>
          )}
          {kpis.custoEstimadoMes > 0 && (
            <p className="text-xs text-gray-600 mt-2">Estimado: R$ {kpis.custoEstimadoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          )}
        </div>

        {/* Cota diária */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-gray-400">Cota diária</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {kpis.cotaDiariaUsada.toLocaleString('pt-BR')}
            <span className="text-sm text-gray-500 font-normal"> / {kpis.cotaDiariaLimite.toLocaleString('pt-BR')}</span>
          </div>
          <div className="mt-2">
            <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  cotaPct > 90 ? 'bg-red-500' : cotaPct > 70 ? 'bg-yellow-500' : 'bg-blue-500',
                )}
                style={{ width: `${cotaPct}%` }}
              />
            </div>
            <p className="text-xs text-gray-600 mt-1">{cotaPct}% utilizado hoje</p>
          </div>
        </div>

        {/* Status geral */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="text-sm text-gray-400">Status geral</span>
          </div>
          <div className="space-y-2.5">
            <StatusItem label="Campanhas ativas" value={kpis.campanhasAtivas} total={kpis.totalCampanhas} />
            <StatusItem label="Agentes IA ativos" value={kpis.agentesAtivos} icon={Bot} />
            <StatusItem label="Conversas abertas" value={kpis.conversasAbertas} icon={MessageSquare} />
            {kpis.totalFalhas > 0 && (
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span className="text-xs">{kpis.totalFalhas} mensagens com falha</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Campanhas recentes */}
      {campanhasRecentes.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <h3 className="text-white font-medium mb-3">Campanhas recentes</h3>
          <div className="space-y-2">
            {campanhasRecentes.map(c => {
              const pct = c.total_contatos > 0 ? Math.round(((c.enviados + c.falhas) / c.total_contatos) * 100) : 0
              return (
                <div key={c.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white truncate">{c.nome}</span>
                      <span className={cn('text-xs px-1.5 py-0.5 rounded',
                        c.status === 'executando' ? 'bg-blue-500/20 text-blue-400' :
                        c.status === 'concluida' ? 'bg-emerald-500/20 text-emerald-400' :
                        c.status === 'rascunho' ? 'bg-gray-500/20 text-gray-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      )}>
                        {c.status}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-700 rounded-full mt-1.5 overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 flex-shrink-0">{pct}%</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function KPICard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: number; sub?: string
  color: 'blue' | 'emerald' | 'purple' | 'amber'
}) {
  const colors = {
    blue: 'text-blue-400 bg-blue-500/20',
    emerald: 'text-emerald-400 bg-emerald-500/20',
    purple: 'text-purple-400 bg-purple-500/20',
    amber: 'text-amber-400 bg-amber-500/20',
  }
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', colors[color])}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-2xl font-bold text-white">{value.toLocaleString('pt-BR')}</div>
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className="text-xs text-gray-500">{label}</span>
        {sub && <span className={cn('text-xs font-medium', `text-${color}-400`)}>{sub}</span>}
      </div>
    </div>
  )
}

function StatusItem({ label, value, total, icon: Icon }: {
  label: string; value: number; total?: number; icon?: React.ElementType
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-3.5 h-3.5 text-gray-500" />}
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <span className="text-sm text-white font-medium">
        {value}{total !== undefined && <span className="text-gray-500 text-xs font-normal"> / {total}</span>}
      </span>
    </div>
  )
}
