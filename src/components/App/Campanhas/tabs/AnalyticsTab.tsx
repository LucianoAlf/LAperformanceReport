import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  CartesianGrid, Legend, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, AreaChart, Area, Line,
} from 'recharts'
import { RefreshCw, Calendar, TrendingUp, Send, Eye, MessageCircle, CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Periodo = '7d' | '30d' | 'mes' | 'custom'

interface DadosAnalytics {
  funil: { etapa: string; valor: number; pct: number }[]
  custoPorCampanha: { nome: string; estimado: number; real: number }[]
  taxasPorCampanha: { nome: string; entrega: number; leitura: number; resposta: number }[]
  custoAcumulado: { dia: string; acumulado: number; orcamento?: number }[]
  orcamentoLinha: boolean
  heatmap: { dia: number; hora: number; valor: number }[]
  campanhasParaAB: { id: string; nome: string; enviados: number; entregues: number; lidos: number; respondidos: number; custo_real: number; total_contatos: number }[]
}

const FUNNEL_COLORS = ['#3b82f6', '#10b981', '#a855f7', '#f59e0b']
const FUNNEL_ICONS = [Send, CheckCheck, Eye, MessageCircle]
const TOOLTIP_STYLE = { background: '#0f172a', border: '1px solid rgba(148, 163, 184, 0.15)', borderRadius: 12, color: '#f1f5f9', fontSize: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }
const DIAS_LABEL = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

// ─── AnalyticsTab ─────────────────────────────────────────────────────────────

export function AnalyticsTab({ unidadeId }: { unidadeId: string | null }) {
  const uid = unidadeId ?? undefined
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [abSelecionadas, setAbSelecionadas] = useState<[string, string]>(['', ''])
  const { dados, loading } = useAnalyticsCampanha(uid, periodo, dataInicio, dataFim)

  if (loading) return (
    <div className="flex items-center gap-3 text-slate-400 py-16 justify-center">
      <RefreshCw className="w-5 h-5 animate-spin text-amber-400" />
      <span className="text-sm">Carregando analytics...</span>
    </div>
  )

  if (!dados) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <TrendingUp className="w-10 h-10 text-slate-600" />
      <p className="text-slate-500 text-sm">Sem dados para o período selecionado</p>
    </div>
  )

  const campA = dados.campanhasParaAB.find(c => c.id === abSelecionadas[0])
  const campB = dados.campanhasParaAB.find(c => c.id === abSelecionadas[1])
  const radarData = campA && campB ? buildRadarData(campA, campB) : null

  return (
    <div className="space-y-5">
      {/* Filtro */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="w-4 h-4 text-amber-400/70" />
        {(['7d', '30d', 'mes', 'custom'] as Periodo[]).map(p => (
          <button key={p} onClick={() => setPeriodo(p)} className={cn(
            'px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all',
            periodo === p ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50',
          )}>
            {p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : p === 'mes' ? 'Mês atual' : 'Personalizado'}
          </button>
        ))}
        {periodo === 'custom' && (
          <div className="flex items-center gap-2 ml-1">
            <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="px-2.5 py-1.5 bg-slate-800/80 border border-slate-700/50 rounded-lg text-xs text-white outline-none focus:ring-1 focus:ring-amber-500/50" />
            <span className="text-slate-600 text-xs">—</span>
            <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="px-2.5 py-1.5 bg-slate-800/80 border border-slate-700/50 rounded-lg text-xs text-white outline-none focus:ring-1 focus:ring-amber-500/50" />
          </div>
        )}
      </div>

      {/* Funil — Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {dados.funil.map((item, i) => {
          const Icon = FUNNEL_ICONS[i] ?? Send
          const color = FUNNEL_COLORS[i] ?? '#f59e0b'
          const maxVal = Math.max(...dados.funil.map(f => f.valor), 1)
          const pctWidth = (item.valor / maxVal) * 100
          return (
            <div key={item.etapa} className="relative overflow-hidden rounded-xl border border-slate-700/30 bg-slate-800/30 p-4">
              <div className="absolute inset-y-0 left-0 opacity-[0.07]" style={{ width: `${pctWidth}%`, backgroundColor: color }} />
              <div className="relative flex items-start justify-between">
                <div>
                  <p className="text-xs text-slate-500 mb-1">{item.etapa}</p>
                  <p className="text-2xl font-bold text-white tracking-tight">{item.valor.toLocaleString('pt-BR')}</p>
                  {item.pct < 100 && <p className="text-xs mt-1" style={{ color }}>{item.pct}%</p>}
                </div>
                <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}15` }}>
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Custo + Taxas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Custo por Campanha" subtitle="Estimado vs Real (R$)">
          {dados.custoPorCampanha.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={dados.custoPorCampanha} margin={{ bottom: 50, left: 10, right: 10, top: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(51,65,85,0.4)" vertical={false} />
                <XAxis dataKey="nome" stroke="transparent" tick={{ fill: '#94a3b8', fontSize: 10 }} angle={-35} textAnchor="end" />
                <YAxis stroke="transparent" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => `R$${v}`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`R$ ${v.toFixed(2)}`]} cursor={{ fill: 'rgba(148,163,184,0.05)' }} />
                <Bar dataKey="estimado" fill="rgba(100,116,139,0.3)" name="Estimado" radius={[4, 4, 0, 0]} />
                <Bar dataKey="real" fill="#f59e0b" name="Real" radius={[4, 4, 0, 0]} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 8 }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Taxas por Campanha" subtitle="Entrega, Leitura e Resposta (%)">
          {dados.taxasPorCampanha.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={dados.taxasPorCampanha} margin={{ bottom: 50, left: 10, right: 10, top: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(51,65,85,0.4)" vertical={false} />
                <XAxis dataKey="nome" stroke="transparent" tick={{ fill: '#94a3b8', fontSize: 10 }} angle={-35} textAnchor="end" />
                <YAxis stroke="transparent" tick={{ fill: '#64748b', fontSize: 11 }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v}%`]} cursor={{ fill: 'rgba(148,163,184,0.05)' }} />
                <Bar dataKey="entrega" fill="#10b981" name="Entrega" radius={[4, 4, 0, 0]} />
                <Bar dataKey="leitura" fill="#a855f7" name="Leitura" radius={[4, 4, 0, 0]} />
                <Bar dataKey="resposta" fill="#f59e0b" name="Resposta" radius={[4, 4, 0, 0]} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 8 }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Custo acumulado — AreaChart */}
      {dados.custoAcumulado.length > 0 && (
        <ChartCard title="Custo Acumulado" subtitle="Evolução no período">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={dados.custoAcumulado} margin={{ left: 10, right: 10, top: 10 }}>
              <defs>
                <linearGradient id="gradCusto" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(51,65,85,0.4)" vertical={false} />
              <XAxis dataKey="dia" stroke="transparent" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis stroke="transparent" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => `R$${v}`} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`R$ ${v.toFixed(2)}`]} />
              <Area type="monotone" dataKey="acumulado" stroke="#f59e0b" strokeWidth={2} fill="url(#gradCusto)" name="Custo real" />
              {dados.orcamentoLinha && <Line type="monotone" dataKey="orcamento" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="6 4" dot={false} name="Orçamento" />}
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Heatmap — FULL WIDTH */}
      {dados.heatmap.length > 0 && (
        <ChartCard title="Melhores Horários" subtitle="Respostas recebidas por dia e hora">
          <HeatmapGrid data={dados.heatmap} />
        </ChartCard>
      )}

      {/* A/B */}
      {dados.campanhasParaAB.length >= 2 && (
        <ChartCard title="Comparação A/B" subtitle="Compare desempenho entre campanhas">
          <div className="flex gap-3 mb-5">
            <select value={abSelecionadas[0]} onChange={e => setAbSelecionadas([e.target.value, abSelecionadas[1]])} className="flex-1 px-3 py-2 bg-slate-900/80 border border-slate-700/50 rounded-lg text-sm text-white outline-none focus:ring-1 focus:ring-amber-500/50">
              <option value="">Campanha A...</option>
              {dados.campanhasParaAB.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <span className="text-slate-600 self-center text-sm font-medium">vs</span>
            <select value={abSelecionadas[1]} onChange={e => setAbSelecionadas([abSelecionadas[0], e.target.value])} className="flex-1 px-3 py-2 bg-slate-900/80 border border-slate-700/50 rounded-lg text-sm text-white outline-none focus:ring-1 focus:ring-amber-500/50">
              <option value="">Campanha B...</option>
              {dados.campanhasParaAB.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          {campA && campB ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-2">
                <ABRow label="Enviados" a={campA.enviados} b={campB.enviados} />
                <ABRow label="Entregues" a={campA.entregues} b={campB.entregues} />
                <ABRow label="Lidos" a={campA.lidos} b={campB.lidos} />
                <ABRow label="Respostas" a={campA.respondidos} b={campB.respondidos} />
                <ABRow label="Custo" a={campA.custo_real} b={campB.custo_real} format="currency" />
                <ABRow label="Taxa entrega" a={campA.enviados > 0 ? Math.round((campA.entregues / campA.enviados) * 100) : 0} b={campB.enviados > 0 ? Math.round((campB.entregues / campB.enviados) * 100) : 0} format="pct" />
              </div>
              {radarData && (
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="rgba(51,65,85,0.5)" />
                    <PolarAngleAxis dataKey="metrica" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <PolarRadiusAxis tick={false} axisLine={false} />
                    <Radar name={campA.nome.slice(0, 15)} dataKey="a" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} strokeWidth={2} />
                    <Radar name={campB.nome.slice(0, 15)} dataKey="b" stroke="#a855f7" fill="#a855f7" fillOpacity={0.15} strokeWidth={2} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                  </RadarChart>
                </ResponsiveContainer>
              )}
            </div>
          ) : (
            <p className="text-center text-slate-500 text-sm py-8">Selecione duas campanhas para comparar</p>
          )}
        </ChartCard>
      )}
    </div>
  )
}

// ─── ChartCard ────────────────────────────────────────────────────────────────

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: import('react').ReactNode }) {
  return (
    <div className="bg-slate-800/20 border border-slate-700/30 rounded-xl p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

// ─── Heatmap FULL WIDTH ───────────────────────────────────────────────────────

function HeatmapGrid({ data }: { data: { dia: number; hora: number; valor: number }[] }) {
  const maxVal = Math.max(...data.map(d => d.valor), 1)
  const map = new Map(data.map(d => [`${d.dia}-${d.hora}`, d.valor]))

  return (
    <div className="w-full">
      <div className="flex gap-[3px] ml-12 mb-1.5">
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="flex-1 text-center text-[10px] text-slate-600 font-mono">{h}</div>
        ))}
      </div>
      {DIAS_LABEL.map((label, diaIdx) => (
        <div key={diaIdx} className="flex gap-[3px] items-center mb-[3px]">
          <span className="w-12 text-xs text-slate-500 text-right pr-3 font-medium">{label}</span>
          {Array.from({ length: 24 }, (_, h) => {
            const val = map.get(`${diaIdx + 1}-${h}`) ?? 0
            const intensity = maxVal > 0 ? val / maxVal : 0
            return (
              <div
                key={h}
                className="flex-1 aspect-square rounded-[3px] transition-all duration-200 hover:scale-110 hover:z-10 cursor-default"
                style={{
                  backgroundColor: intensity > 0 ? `rgba(245,158,11,${0.12 + intensity * 0.78})` : 'rgba(51,65,85,0.15)',
                  boxShadow: intensity > 0.5 ? `0 0 8px rgba(245,158,11,${intensity * 0.3})` : 'none',
                }}
                title={`${label} ${h}h: ${val} respostas`}
              />
            )
          })}
        </div>
      ))}
      <div className="flex items-center justify-end gap-1.5 mt-3 pr-1">
        <span className="text-[10px] text-slate-600">Menos</span>
        {[0, 0.25, 0.5, 0.75, 1].map((intensity, i) => (
          <div key={i} className="w-3 h-3 rounded-[2px]" style={{
            backgroundColor: intensity > 0 ? `rgba(245,158,11,${0.12 + intensity * 0.78})` : 'rgba(51,65,85,0.15)',
          }} />
        ))}
        <span className="text-[10px] text-slate-600">Mais</span>
      </div>
    </div>
  )
}

// ─── A/B helpers ──────────────────────────────────────────────────────────────

function ABRow({ label, a, b, format }: { label: string; a: number; b: number; format?: 'currency' | 'pct' }) {
  const fmtVal = (v: number) => format === 'currency' ? `R$ ${v.toFixed(2)}` : format === 'pct' ? `${v}%` : v.toLocaleString('pt-BR')
  const winner = format === 'currency' ? (a < b ? 'a' : b < a ? 'b' : null) : (a > b ? 'a' : b > a ? 'b' : null)
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-slate-900/40 rounded-lg border border-slate-800/50">
      <span className={cn('text-xs font-mono tabular-nums', winner === 'a' ? 'text-amber-400 font-semibold' : 'text-slate-400')}>{fmtVal(a)}</span>
      <span className="text-[10px] text-slate-600 flex-shrink-0 px-3 uppercase tracking-wider font-medium">{label}</span>
      <span className={cn('text-xs font-mono tabular-nums', winner === 'b' ? 'text-purple-400 font-semibold' : 'text-slate-400')}>{fmtVal(b)}</span>
    </div>
  )
}

function buildRadarData(a: any, b: any) {
  return [
    { metrica: 'Entrega %', a: a.enviados > 0 ? Math.round((a.entregues / a.enviados) * 100) : 0, b: b.enviados > 0 ? Math.round((b.entregues / b.enviados) * 100) : 0 },
    { metrica: 'Leitura %', a: a.entregues > 0 ? Math.round((a.lidos / a.entregues) * 100) : 0, b: b.entregues > 0 ? Math.round((b.lidos / b.entregues) * 100) : 0 },
    { metrica: 'Resposta %', a: a.entregues > 0 ? Math.round((a.respondidos / a.entregues) * 100) : 0, b: b.entregues > 0 ? Math.round((b.respondidos / b.entregues) * 100) : 0 },
    { metrica: 'Volume', a: Math.min(100, Math.round((a.total_contatos / Math.max(a.total_contatos, b.total_contatos)) * 100)), b: Math.min(100, Math.round((b.total_contatos / Math.max(a.total_contatos, b.total_contatos)) * 100)) },
  ]
}

function EmptyChart() { return <p className="text-slate-500 text-sm text-center py-12">Sem dados para este período</p> }

// ─── Hook analytics ───────────────────────────────────────────────────────────

function useAnalyticsCampanha(unidadeId?: string | null, periodo: Periodo = 'mes', dataInicio?: string, dataFim?: string) {
  const [dados, setDados] = useState<DadosAnalytics | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const now = new Date()
      let desde: Date
      if (periodo === '7d') desde = new Date(now.getTime() - 7 * 86400000)
      else if (periodo === '30d') desde = new Date(now.getTime() - 30 * 86400000)
      else if (periodo === 'custom' && dataInicio) desde = new Date(dataInicio)
      else desde = new Date(now.getFullYear(), now.getMonth(), 1)
      const ate = periodo === 'custom' && dataFim ? new Date(dataFim + 'T23:59:59') : now

      let q = supabase.from('campanhas').select('id, nome, enviados, entregues, lidos, respondidos, falhas, custo_estimado, custo_real, created_at, total_contatos')
        .gte('created_at', desde.toISOString()).lte('created_at', ate.toISOString())
      if (unidadeId) q = q.eq('unidade_id', unidadeId)
      const { data: campanhas } = await q
      if (!campanhas?.length) { setDados(null); return }

      const totais = campanhas.reduce((acc, c) => ({
        enviados: acc.enviados + (c.enviados ?? 0), entregues: acc.entregues + (c.entregues ?? 0),
        lidos: acc.lidos + (c.lidos ?? 0), respondidos: acc.respondidos + (c.respondidos ?? 0),
      }), { enviados: 0, entregues: 0, lidos: 0, respondidos: 0 })

      const maxF = Math.max(totais.enviados, 1)
      const funil = [
        { etapa: 'Enviados', valor: totais.enviados, pct: 100 },
        { etapa: 'Entregues', valor: totais.entregues, pct: Math.round((totais.entregues / maxF) * 100) },
        { etapa: 'Lidos', valor: totais.lidos, pct: Math.round((totais.lidos / maxF) * 100) },
        { etapa: 'Respostas', valor: totais.respondidos, pct: Math.round((totais.respondidos / maxF) * 100) },
      ]

      const custoPorCampanha = campanhas.filter(c => (c.custo_estimado ?? 0) > 0 || (c.custo_real ?? 0) > 0).slice(0, 10)
        .map(c => ({ nome: c.nome.slice(0, 20), estimado: c.custo_estimado ?? 0, real: c.custo_real ?? 0 }))

      const taxasPorCampanha = campanhas.filter(c => (c.enviados ?? 0) > 0).slice(0, 10).map(c => ({
        nome: c.nome.slice(0, 20),
        entrega: c.enviados > 0 ? Math.round(((c.entregues ?? 0) / c.enviados) * 100) : 0,
        leitura: (c.entregues ?? 0) > 0 ? Math.round(((c.lidos ?? 0) / c.entregues) * 100) : 0,
        resposta: (c.entregues ?? 0) > 0 ? Math.round(((c.respondidos ?? 0) / c.entregues) * 100) : 0,
      }))

      let qNum = supabase.from('numeros_meta').select('orcamento_mensal').limit(1)
      if (unidadeId) qNum = qNum.eq('unidade_id', unidadeId)
      const { data: numeros } = await qNum
      const orcamento = numeros?.[0]?.orcamento_mensal ?? null

      const custoPorDia: Record<number, number> = {}
      for (const c of campanhas) { const dia = new Date(c.created_at).getDate(); custoPorDia[dia] = (custoPorDia[dia] ?? 0) + (c.custo_real ?? 0) }
      let acumulado = 0
      const custoAcumulado = Object.entries(custoPorDia).sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([dia, custo]) => { acumulado += custo; return { dia: `${dia}`, acumulado, ...(orcamento ? { orcamento } : {}) } })

      const { data: msgs } = await supabase.from('mensagens_campanha').select('created_at').eq('direcao', 'inbound')
        .gte('created_at', desde.toISOString()).lte('created_at', ate.toISOString())

      const heatmapMap: Record<string, number> = {}
      for (const m of (msgs ?? [])) {
        const d = new Date(m.created_at); const dia = d.getDay() === 0 ? 7 : d.getDay(); const hora = d.getHours()
        heatmapMap[`${dia}-${hora}`] = (heatmapMap[`${dia}-${hora}`] ?? 0) + 1
      }
      const heatmap = Object.entries(heatmapMap).map(([key, valor]) => { const [dia, hora] = key.split('-').map(Number); return { dia, hora, valor } })

      const campanhasParaAB = campanhas.map(c => ({
        id: c.id, nome: c.nome, enviados: c.enviados ?? 0, entregues: c.entregues ?? 0,
        lidos: c.lidos ?? 0, respondidos: c.respondidos ?? 0, custo_real: c.custo_real ?? 0, total_contatos: c.total_contatos ?? 0,
      }))

      setDados({ funil, custoPorCampanha, taxasPorCampanha, custoAcumulado, orcamentoLinha: !!orcamento, heatmap, campanhasParaAB })
    } finally { setLoading(false) }
  }, [unidadeId, periodo, dataInicio, dataFim])

  useEffect(() => { fetchData() }, [fetchData])
  return { dados, loading }
}
