import { useState, useEffect, useMemo } from 'react'
import { Search, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Campanha } from '../hooks/useCampanhas'
import { useContatosCampanha, type TabStatus } from '../hooks/useContatosCampanha'
import { BulkActionBar } from './BulkActionBar'
import { Paginacao } from '@/components/App/Automacoes/Paginacao'

const POR_PAGINA_PADRAO = 10

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

export function CampanhaContatosPanel({ campanha, onReenviarFalhas }: { campanha: Campanha; onReenviarFalhas: () => Promise<void> }) {
  const {
    loading, contadores, filtrados,
    searchTerm, setSearchTerm, activeTab, setActiveTab,
    copiarNaoEntregues, exportarCSV,
  } = useContatosCampanha(campanha.id)

  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(POR_PAGINA_PADRAO)

  useEffect(() => { setPagina(1) }, [campanha.id, activeTab, searchTerm, porPagina])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina))
  const filtradosPagina = useMemo(
    () => filtrados.slice((pagina - 1) * porPagina, pagina * porPagina),
    [filtrados, pagina, porPagina],
  )

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 flex flex-col h-full space-y-3">
      <p className="text-xs text-gray-400">Contatos ({campanha.total_contatos})</p>

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
                isActive ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'text-gray-400 border-slate-700 hover:text-white hover:border-slate-600',
              )}
            >
              {tab.label}
              {count > 0 && <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', TAB_BADGE_COLORS[tab.color])}>{count}</span>}
            </button>
          )
        })}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Buscar por telefone..."
          className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:border-amber-500/50 focus:outline-none transition"
        />
      </div>

      <div className="space-y-1 flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8"><RefreshCw className="w-4 h-4 text-slate-500 animate-spin" /></div>
        ) : filtrados.length === 0 ? (
          <p className="text-center text-gray-500 text-sm py-6">Nenhum contato nesta categoria</p>
        ) : (
          filtradosPagina.map(ct => {
            const badge = STATUS_BADGE[ct.status] ?? STATUS_BADGE.pendente
            const isFalha = ct.status === 'falha'
            return (
              <div key={ct.id} className={cn('flex items-center justify-between px-3 py-2 rounded-lg transition-colors', isFalha ? 'bg-red-500/5 border-l-2 border-red-500' : 'bg-slate-900/50 hover:bg-slate-900')}>
                <span className="text-xs text-gray-300 font-mono">{ct.telefone}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap', badge.cls)}>{badge.label}</span>
                  {ct.erro && <span className="text-[10px] text-red-400 truncate max-w-[150px]" title={ct.erro}>{ct.erro}</span>}
                  {ct.enviado_em && <span className="text-[10px] text-gray-600 whitespace-nowrap">{new Date(ct.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
                </div>
              </div>
            )
          })
        )}
      </div>

      {filtrados.length > 0 && (
        <Paginacao
          pagina={pagina}
          totalPaginas={totalPaginas}
          totalItens={filtrados.length}
          porPagina={porPagina}
          onMudarPagina={setPagina}
          onMudarPorPagina={setPorPagina}
        />
      )}

      <BulkActionBar
        falhas={campanha.falhas}
        onReenviarFalhas={onReenviarFalhas}
        onCopiarNumeros={copiarNaoEntregues}
        onExportarCSV={() => exportarCSV(campanha.nome)}
      />
    </div>
  )
}
