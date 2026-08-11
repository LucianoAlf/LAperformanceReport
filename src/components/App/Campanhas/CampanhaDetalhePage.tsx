import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Play, Pause, RotateCw, RefreshCw, Send, CheckCheck, Eye, MessageCircle,
  AlertTriangle, GraduationCap, Percent, Wallet, Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { KPICard } from '@/components/ui/KPICard'
import { DonutChart } from '@/components/ui/DonutChart'
import type { Campanha } from './hooks/useCampanhas'
import { useConversaoCampanhas } from './hooks/useConversaoCampanhas'
import { CampanhaConversasPanel } from './components/CampanhaConversasPanel'
import { CampanhaContatosPanel } from './components/CampanhaContatosPanel'

const STATUS_CFG: Record<string, { label: string; cls: string; bgCls: string; dot: string }> = {
  rascunho:   { label: 'Rascunho',   cls: 'text-gray-400 border-gray-500/30', bgCls: 'bg-gray-500/10', dot: 'bg-gray-400' },
  executando: { label: 'Executando', cls: 'text-blue-400 border-blue-500/30', bgCls: 'bg-blue-500/10', dot: 'bg-blue-400 animate-pulse' },
  pausada:    { label: 'Pausada',    cls: 'text-yellow-400 border-yellow-500/30', bgCls: 'bg-yellow-500/10', dot: 'bg-yellow-400' },
  concluida:  { label: 'Concluída',  cls: 'text-emerald-400 border-emerald-500/30', bgCls: 'bg-emerald-500/10', dot: 'bg-emerald-400' },
  falha:      { label: 'Falha',      cls: 'text-red-400 border-red-500/30', bgCls: 'bg-red-500/10', dot: 'bg-red-400' },
}

const FUNIL_COLORS = ['#3b82f6', '#10b981', '#a855f7', '#f59e0b']
const FUNIL_ICONS = [Send, CheckCheck, Eye, MessageCircle]

export function CampanhaDetalhePage() {
  const { campanhaId } = useParams<{ campanhaId: string }>()
  const navigate = useNavigate()
  const [campanha, setCampanha] = useState<Campanha | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [template, setTemplate] = useState<any>(null)
  const [erroTemplate, setErroTemplate] = useState<string | null>(null)
  const { conversoes, loading: loadingConversao } = useConversaoCampanhas(campanhaId)
  const conversao = conversoes[0]

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
    if (!campanha?.template_id) { setTemplate(null); setErroTemplate(null); return }
    setErroTemplate(null)
    supabase
      .from('templates_meta')
      .select('nome, header_type, media_url, body_text, componentes')
      .eq('id', campanha.template_id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error('Erro ao carregar template da campanha:', error)
          setTemplate(null)
          setErroTemplate('Erro ao carregar template.')
          return
        }
        setTemplate(data)
      })
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

  const funil = [
    { etapa: 'Enviados', valor: campanha.enviados, pct: 100 },
    { etapa: 'Entregues', valor: campanha.entregues, pct: campanha.enviados > 0 ? Math.round((campanha.entregues / campanha.enviados) * 100) : 0 },
    { etapa: 'Lidos', valor: campanha.lidos, pct: campanha.entregues > 0 ? Math.round((campanha.lidos / campanha.entregues) * 100) : 0 },
    { etapa: 'Respostas', valor: campanha.respondidos, pct: campanha.entregues > 0 ? Math.round((campanha.respondidos / campanha.entregues) * 100) : 0 },
  ]
  const maxFunil = Math.max(...funil.map(f => f.valor), 1)

  const donutConversao = conversao && conversao.leadsGerados > 0
    ? [
        { name: 'Matriculados', value: conversao.matriculados, color: '#10b981' },
        { name: 'Ainda não converteu', value: conversao.leadsGerados - conversao.matriculados, color: '#334155' },
      ].filter(d => d.value > 0)
    : []

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-800/70 via-slate-800/40 to-slate-800/70 p-5">
        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <button onClick={() => navigate('/app/campanhas')} className="p-2 text-gray-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0 mt-0.5">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-white truncate">{campanha.nome}</h1>
                <span className={cn('inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border', cfg.cls, cfg.bgCls)}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
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

        {/* Timeline horizontal, embutida no header */}
        <div className="relative flex items-center gap-2 mt-4 text-xs text-gray-500 flex-wrap">
          <TimelinePonto label="Criada" data={campanha.created_at} ativo />
          <TimelineTraco />
          <TimelinePonto label="Iniciada" data={campanha.iniciada_em} ativo={!!campanha.iniciada_em} />
          <TimelineTraco />
          <TimelinePonto label="Concluída" data={campanha.concluida_em} ativo={!!campanha.concluida_em} />
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

      {/* Funil de entrega — cards visuais */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-2.5">Funil de entrega</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {funil.map((item, i) => {
            const Icon = FUNIL_ICONS[i]
            const color = FUNIL_COLORS[i]
            const pctWidth = (item.valor / maxFunil) * 100
            return (
              <div key={item.etapa} className="relative overflow-hidden rounded-xl border border-slate-700/30 bg-slate-800/30 p-4">
                <div className="absolute inset-y-0 left-0 opacity-[0.08]" style={{ width: `${pctWidth}%`, backgroundColor: color }} />
                <div className="relative flex items-start justify-between">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">{item.etapa}</p>
                    <p className="text-2xl font-bold text-white tracking-tight">{item.valor.toLocaleString('pt-BR')}</p>
                    {i > 0 && <p className="text-xs mt-1" style={{ color }}>{item.pct}% do anterior</p>}
                  </div>
                  <div className="p-2 rounded-lg flex-shrink-0" style={{ backgroundColor: `${color}15` }}>
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Conversão — mesmo padrão visual (KPICard + DonutChart) usado na aba Conversão */}
      <div className="space-y-4">
        <p className="text-xs text-gray-500 uppercase tracking-wide">Conversão</p>

        {loadingConversao ? (
          <div className="flex items-center justify-center py-10"><RefreshCw className="w-4 h-4 text-slate-500 animate-spin" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard label="Leads gerados" value={conversao?.leadsGerados ?? 0} icon={Users} variant="cyan" />
              <KPICard label="Matriculados" value={conversao?.matriculados ?? 0} icon={GraduationCap} variant="emerald" />
              <KPICard label="Taxa de conversão" value={(conversao?.taxaConversao ?? 0) * 100} format="percent" icon={Percent} variant="violet" />
              <KPICard
                label={conversao?.custoMoeda ? `Custo / matrícula (${conversao.custoMoeda})` : 'Custo / matrícula'}
                value={
                  conversao?.custoPorMatricula != null && conversao.custoPorMatricula > 0
                    ? formatarMoeda(conversao.custoPorMatricula, conversao.custoMoeda)
                    : '—'
                }
                icon={Wallet}
                variant="amber"
              />
            </div>

            {!conversao || conversao.leadsGerados === 0 ? (
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8 text-center text-sm text-gray-500">
                Nenhum lead atribuído a esta campanha ainda.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-stretch">
                <DonutChart
                  data={donutConversao}
                  title="Matriculados x ainda não converteu"
                  centerLabel="Leads"
                  className="lg:col-span-2 h-full"
                />
                <div className="lg:col-span-3 bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5 flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-bold text-white">Quem matriculou</h3>
                    <span className="text-xs text-slate-500">{conversao.matriculasDetalhe.length}</span>
                  </div>
                  {conversao.matriculasDetalhe.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-sm text-gray-500 py-6">
                      Nenhuma matrícula ainda.
                    </div>
                  ) : (
                    <div className="space-y-1.5 flex-1 overflow-y-auto max-h-[280px]">
                      {conversao.matriculasDetalhe.map(m => (
                        <div key={m.leadId} className="flex items-center justify-between px-3 py-2.5 bg-slate-900/50 hover:bg-slate-900 rounded-lg transition-colors">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                            <span className="text-sm text-gray-200 truncate">{m.nome}</span>
                          </div>
                          <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                            {formatarDataMatricula(m.dataMatricula)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Template — mockup de bolha de WhatsApp */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-2.5">Como chega no WhatsApp</p>
        {erroTemplate && (
          <div className="flex items-center gap-2 px-4 py-3 mb-3 bg-red-500/10 border border-red-500/20 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-sm text-red-300">{erroTemplate}</span>
          </div>
        )}
        {template && (
          <div className="rounded-2xl border border-slate-700/50 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.06),_transparent_55%)] bg-slate-900/40 p-6 flex justify-center">
            <div className="max-w-[380px] w-full rounded-2xl rounded-tl-sm bg-[#202c33] border border-black/20 shadow-lg shadow-black/30 overflow-hidden">
              {template.header_type === 'IMAGE' && (() => {
                const imgUrl = campanha.media_url_custom || template.media_url || template.componentes?.[0]?.example?.header_handle?.[0]
                return imgUrl ? (
                  <img src={imgUrl} alt="Header" className="w-full max-h-48 object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                ) : null
              })()}
              {template.body_text && (
                <p className="px-3.5 pt-2.5 pb-1 text-[13px] leading-snug text-[#e9edef] whitespace-pre-wrap">{template.body_text}</p>
              )}
              {template.componentes?.find((c: any) => c.type === 'BUTTONS')?.buttons && (
                <div className="border-t border-white/10">
                  {template.componentes.find((c: any) => c.type === 'BUTTONS').buttons.map((btn: any, i: number) => (
                    <div key={i} className="px-3.5 py-2 text-center text-[13px] text-[#00a5f4] border-t border-white/10 first:border-t-0">
                      {btn.text}
                    </div>
                  ))}
                </div>
              )}
              <div className="px-3.5 pb-1.5 text-right">
                <span className="text-[10px] text-[#8696a0]">
                  {new Date(campanha.iniciada_em ?? campanha.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Conversas + Contatos lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <CampanhaConversasPanel campanhaId={campanha.id} numeroMetaId={campanha.numero_meta_id} />
        <CampanhaContatosPanel campanha={campanha} onReenviarFalhas={handleReenviarFalhas} />
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * `alunos.data_matricula` é uma coluna `date` (sem hora) — o PostgREST manda
 * "2026-08-01" e `new Date(...)` interpreta como meia-noite UTC, exibindo o
 * dia anterior em BRT (UTC-3). Parseia por partes em vez de deixar o Date
 * nativo assumir UTC. Mesmo padrão de `parseDateOnly` em
 * src/lib/retencaoOperacionalCanonica.ts. Ver Achado 4 da revisão de 2026-08-11.
 */
function formatarDataMatricula(value: string | null): string {
  if (!value) return '—'
  const [ano, mes, dia] = value.split('T')[0].split('-').map(Number)
  if (!ano || !mes || !dia) return '—'
  const data = new Date(ano, mes - 1, dia)
  if (Number.isNaN(data.getTime())) return '—'
  return data.toLocaleDateString('pt-BR')
}

function TimelinePonto({ label, data, ativo }: { label: string; data: string | null; ativo: boolean }) {
  return (
    <div className={cn('flex items-center gap-1.5', !ativo && 'opacity-40')}>
      <span className={cn('w-1.5 h-1.5 rounded-full', ativo ? 'bg-amber-400' : 'bg-slate-600')} />
      <span className={ativo ? 'text-gray-300' : 'text-gray-600'}>{label}</span>
      {data && <span className="text-gray-600">· {new Date(data).toLocaleDateString('pt-BR')}</span>}
    </div>
  )
}

function TimelineTraco() {
  return <div className="w-6 h-px bg-slate-700 flex-shrink-0" />
}

function formatarMoeda(valor: number, moeda: string): string {
  const simbolo = moeda === 'USD' ? 'US$' : 'R$'
  return `${simbolo} ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}
