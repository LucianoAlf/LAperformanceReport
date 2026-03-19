import { useState } from 'react'
import { Plus, Bot, Power, PowerOff, Pencil, Trash2, RefreshCw, TestTube } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAgentes, useMetricasAgentes, type Agente } from '../hooks/useAgentes'
import { useNumerosMeta } from '../hooks/useNumerosMeta'
import { ModalEditarAgente } from '../components/ModalEditarAgente'
import { Button } from '@/components/ui/button'

export function AgentesTab({ unidadeId }: { unidadeId: string | null }) {
  const { agentes, loading, toggleAtivo, excluir } = useAgentes(unidadeId ?? undefined)
  const { numeros } = useNumerosMeta()
  const metricas = useMetricasAgentes(agentes.map(a => a.id))
  const [modalAberto, setModalAberto] = useState(false)
  const [agenteEditando, setAgenteEditando] = useState<Agente | null>(null)

  function abrirCriar() { setAgenteEditando(null); setModalAberto(true) }
  function abrirEditar(a: Agente) { setAgenteEditando(a); setModalAberto(true) }

  async function handleToggle(a: Agente) {
    const { error } = await toggleAtivo(a.id, !a.is_active)
    if (error) toast.error(error)
    else toast.success(a.is_active ? 'Agente desativado' : 'Agente ativado')
  }

  async function handleExcluir(a: Agente) {
    if (!confirm(`Excluir agente "${a.nome}"?`)) return
    const { error } = await excluir(a.id)
    if (error) toast.error(error)
    else toast.success('Agente excluído')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">{agentes.length} agente(s) configurado(s)</p>
        <Button onClick={abrirCriar} className="bg-amber-500 hover:bg-amber-600 text-black">
          <Plus className="w-4 h-4 mr-1.5" />
          Novo Agente
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 py-8 justify-center">
          <RefreshCw className="w-4 h-4 animate-spin" /> Carregando...
        </div>
      ) : agentes.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Bot className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nenhum agente configurado.</p>
          <p className="text-xs mt-1">Crie um agente IA para responder automaticamente seus leads.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agentes.map(a => (
            <div key={a.id} className={cn(
              'bg-slate-800/50 border rounded-xl p-5 space-y-3 transition-colors',
              a.is_active ? 'border-slate-700/50' : 'border-slate-700/30 opacity-60',
            )}>
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center',
                    a.is_active ? 'bg-emerald-500/20' : 'bg-slate-700',
                  )}>
                    <Bot className={cn('w-5 h-5', a.is_active ? 'text-emerald-400' : 'text-gray-500')} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-white font-medium">{a.nome}</h3>
                      {a.modo_teste && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center gap-1">
                          <TestTube className="w-3 h-3" /> Teste
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {a.modelo} · {a.provider}
                      {a.numero_meta_id && <> · <span className="text-amber-400/70">{numeros.find(n => n.id === a.numero_meta_id)?.nome ?? 'Número vinculado'}</span></>}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => handleToggle(a)} className={cn('p-1.5 rounded transition-colors', a.is_active ? 'text-emerald-400 hover:bg-emerald-500/20' : 'text-gray-500 hover:bg-slate-700')} title={a.is_active ? 'Desativar' : 'Ativar'}>
                    {a.is_active ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                  </button>
                  <button onClick={() => abrirEditar(a)} className="p-1.5 text-gray-400 hover:text-white hover:bg-slate-700 rounded transition-colors" title="Editar">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleExcluir(a)} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors" title="Excluir">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Info */}
              {a.descricao && <p className="text-xs text-gray-400 line-clamp-2">{a.descricao}</p>}

              <div className="flex gap-2 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded-full border border-slate-700 text-gray-400">
                  {a.tools?.filter(t => t.enabled).length ?? 0} tools
                </span>
                {a.horario_funcionamento?.start && (
                  <span className="text-xs px-2 py-0.5 rounded-full border border-slate-700 text-gray-400">
                    {a.horario_funcionamento.start}-{a.horario_funcionamento.end}
                  </span>
                )}
                <span className="text-xs px-2 py-0.5 rounded-full border border-slate-700 text-gray-400">
                  T: {a.temperature}
                </span>
              </div>

              {/* Métricas */}
              {metricas[a.id] && (
                <div className="flex gap-3 text-xs">
                  <span className="text-blue-400">{metricas[a.id].total_conversas} conversas</span>
                  <span className="text-emerald-400">{metricas[a.id].total_mensagens} msgs</span>
                  {metricas[a.id].transferencias > 0 && (
                    <span className="text-amber-400">{metricas[a.id].transferencias} transfers ({metricas[a.id].taxa_transfer}%)</span>
                  )}
                </div>
              )}

              {/* Prompt preview */}
              <div className="bg-slate-900/50 rounded-lg p-2.5 border border-slate-700/30">
                <p className="text-xs text-gray-500 line-clamp-3 font-mono">{a.system_prompt}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <ModalEditarAgente
        open={modalAberto}
        onOpenChange={setModalAberto}
        agente={agenteEditando}
        onSalvo={() => {}}
        unidadeId={unidadeId}
      />
    </div>
  )
}
