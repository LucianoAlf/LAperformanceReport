import { useState } from 'react'
import { RefreshCw, FileText, CheckCircle, XCircle, Clock, ChevronDown, MessageSquare, Send, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useNumerosMeta } from '../hooks/useNumerosMeta'
import { useTemplatesMeta, type TemplateMeta } from '../hooks/useTemplatesMeta'
import { Button } from '@/components/ui/button'

// ─── Badges ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  APPROVED:  { label: 'Aprovado',  icon: CheckCircle, cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  REJECTED:  { label: 'Rejeitado', icon: XCircle,     cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
  PENDING:   { label: 'Pendente',  icon: Clock,        cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  PAUSED:    { label: 'Pausado',   icon: Clock,        cls: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
}

const CATEGORIA_CONFIG: Record<string, { label: string; cls: string }> = {
  MARKETING:       { label: 'Marketing',       cls: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  UTILITY:         { label: 'Utilidade',        cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  AUTHENTICATION:  { label: 'Autenticação',    cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
}

function StatusBadge({ status }: { status: string | null }) {
  const cfg = STATUS_CONFIG[status ?? ''] ?? { label: status ?? '—', icon: Clock, cls: 'bg-slate-700 text-gray-400 border-slate-600' }
  const Icon = cfg.icon
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border', cfg.cls)}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  )
}

function CategoriaBadge({ categoria }: { categoria: string | null }) {
  const cfg = CATEGORIA_CONFIG[categoria ?? ''] ?? { label: categoria ?? '—', cls: 'bg-slate-700 text-gray-400 border-slate-600' }
  return (
    <span className={cn('text-xs px-2 py-0.5 rounded-full border', cfg.cls)}>
      {cfg.label}
    </span>
  )
}

// ─── Card de Template ─────────────────────────────────────────────────────────

function TemplateCard({ tpl, numeroMetaId }: { tpl: TemplateMeta; numeroMetaId: string }) {
  const [expandido, setExpandido] = useState(false)
  const [testeAberto, setTesteAberto] = useState(false)
  const [telefoneTeste, setTelefoneTeste] = useState('')
  const [enviandoTeste, setEnviandoTeste] = useState(false)

  async function handleTeste() {
    if (!telefoneTeste.trim()) { toast.error('Informe o telefone de teste'); return }
    setEnviandoTeste(true)
    try {
      const tel = telefoneTeste.replace(/\D/g, '')
      const { data, error } = await supabase.functions.invoke('enviar-mensagem-meta', {
        body: {
          numero_meta_id: numeroMetaId,
          telefone: tel.length <= 11 ? '55' + tel : tel,
          tipo: 'template',
          texto: `[Template: ${tpl.nome}]`,
        },
      })
      if (error || data?.error) throw new Error(error?.message || data?.error)
      toast.success(`Teste enviado para ${telefoneTeste}`)
      setTesteAberto(false)
      setTelefoneTeste('')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setEnviandoTeste(false)
    }
  }

  return (
    <div className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-medium text-sm truncate">{tpl.nome}</span>
            <span className="text-xs text-gray-500">{tpl.idioma}</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <StatusBadge status={tpl.status} />
            {tpl.categoria && <CategoriaBadge categoria={tpl.categoria} />}
            {tpl.has_buttons && (
              <span className="text-xs px-2 py-0.5 rounded-full border bg-slate-700/50 text-gray-400 border-slate-600">Com botões</span>
            )}
            {tpl.variaveis.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full border bg-slate-700/50 text-gray-400 border-slate-600">{tpl.variaveis.length} variável{tpl.variaveis.length !== 1 ? 'is' : ''}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {tpl.status === 'APPROVED' && (
            <button onClick={() => setTesteAberto(v => !v)} className="p-1.5 text-amber-400 hover:bg-amber-500/20 rounded transition-colors" title="Testar envio">
              <Send className="w-4 h-4" />
            </button>
          )}
          {tpl.body_text && (
            <button onClick={() => setExpandido(v => !v)} className="p-1.5 text-gray-400 hover:text-white hover:bg-slate-700 rounded transition-colors" title="Ver preview">
              <ChevronDown className={cn('w-4 h-4 transition-transform', expandido && 'rotate-180')} />
            </button>
          )}
        </div>
      </div>

      {/* Teste inline */}
      {testeAberto && (
        <div className="flex items-center gap-2 bg-amber-500/5 border border-amber-500/20 rounded-lg p-2.5">
          <input
            value={telefoneTeste}
            onChange={e => setTelefoneTeste(e.target.value)}
            placeholder="21999999999"
            className="flex-1 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
          />
          <button onClick={handleTeste} disabled={enviandoTeste} className="px-3 py-1.5 bg-amber-600 text-white text-xs rounded-lg hover:bg-amber-500 transition disabled:opacity-50">
            {enviandoTeste ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Enviar'}
          </button>
        </div>
      )}

      {expandido && tpl.body_text && (
        <div className="bg-slate-800 rounded-lg p-3 border border-slate-700/50">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
            <MessageSquare className="w-3 h-3" />Corpo da mensagem
          </div>
          <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{tpl.body_text}</p>
        </div>
      )}
    </div>
  )
}

// ─── TemplatesTab ─────────────────────────────────────────────────────────────

type FiltroStatus = 'todos' | 'APPROVED' | 'PENDING' | 'REJECTED'

export function TemplatesTab({ unidadeId }: { unidadeId: string | null }) {
  const { numeros, loading: loadingNumeros } = useNumerosMeta(unidadeId ?? undefined)

  const [numeroSelecionado, setNumeroSelecionado] = useState<string>('')
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('todos')

  const { templates, loading, sincronizando, sincronizar } = useTemplatesMeta(numeroSelecionado || null)

  async function handleSincronizar() {
    const resultado = await sincronizar()
    if (resultado.error) {
      toast.error(resultado.error)
    } else {
      toast.success(`${resultado.sincronizados} templates sincronizados (${resultado.total} no total)`)
    }
  }

  const templatesFiltrados = templates.filter(t =>
    filtroStatus === 'todos' || t.status === filtroStatus,
  )

  const contadores = {
    todos: templates.length,
    APPROVED: templates.filter(t => t.status === 'APPROVED').length,
    PENDING: templates.filter(t => t.status === 'PENDING').length,
    REJECTED: templates.filter(t => t.status === 'REJECTED').length,
  }

  return (
    <div className="space-y-5">
      {/* Seletor de número + sync */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-48">
          <select
            value={numeroSelecionado}
            onChange={e => setNumeroSelecionado(e.target.value)}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500/50"
            disabled={loadingNumeros}
          >
            <option value="">Selecionar número WhatsApp...</option>
            {numeros.map(n => (
              <option key={n.id} value={n.id}>{n.nome}</option>
            ))}
          </select>
        </div>

        <Button
          onClick={handleSincronizar}
          disabled={!numeroSelecionado || sincronizando}
          className="bg-amber-500 hover:bg-amber-600 text-black"
        >
          <RefreshCw className={cn('w-4 h-4 mr-2', sincronizando && 'animate-spin')} />
          {sincronizando ? 'Sincronizando...' : 'Sincronizar com Meta'}
        </Button>
      </div>

      {!numeroSelecionado ? (
        <div className="text-center py-16 text-gray-500">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Selecione um número WhatsApp para ver os templates.</p>
          {numeros.length === 0 && !loadingNumeros && (
            <p className="text-xs mt-1.5">Configure um número na aba <strong className="text-gray-400">Config</strong> primeiro.</p>
          )}
        </div>
      ) : (
        <>
          {/* Filtros de status */}
          <div className="flex gap-2 flex-wrap">
            {(['todos', 'APPROVED', 'PENDING', 'REJECTED'] as FiltroStatus[]).map(s => (
              <button
                key={s}
                onClick={() => setFiltroStatus(s)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                  filtroStatus === s
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                    : 'text-gray-400 border-slate-700 hover:text-white hover:border-slate-600',
                )}
              >
                {s === 'todos' ? 'Todos' : STATUS_CONFIG[s]?.label ?? s}
                <span className="ml-1.5 opacity-60">({contadores[s]})</span>
              </button>
            ))}
          </div>

          {/* Grid de templates */}
          {loading ? (
            <div className="flex items-center gap-2 text-gray-500 py-8 justify-center">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Carregando templates...
            </div>
          ) : templatesFiltrados.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p>Nenhum template encontrado.</p>
              <p className="text-xs mt-1">Clique em "Sincronizar com Meta" para importar os templates aprovados.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {templatesFiltrados.map(tpl => (
                <TemplateCard key={tpl.id} tpl={tpl} numeroMetaId={numeroSelecionado} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
