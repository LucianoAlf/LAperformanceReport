import { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts'
import { RefreshCw, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Periodo = '7d' | '30d' | 'mes' | 'custom'

interface DadosAnalytics {
  funil: { etapa: string; valor: number }[]
  custoPorCampanha: { nome: string; estimado: number; real: number }[]
  taxasPorCampanha: { nome: string; entrega: number; leitura: number; resposta: number }[]
  custoAcumulado: { dia: string; acumulado: number; orcamento?: number }[]
  orcamentoLinha: boolean
  heatmap: { dia: number; hora: number; valor: number }[]
  campanhasParaAB: { id: string; nome: string; enviados: number; entregues: number; lidos: number; respondidos: number; custo_real: number; total_contatos: number }[]
}

// ─── AnalyticsTab ─────────────────────────────────────────────────────────────

export function AnalyticsTab({ unidadeId }: { unidadeId: string | null }) {
  const uid = unidadeId ?? undefined

  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [abSelecionadas, setAbSelecionadas] = useState<[string, string]>(['', ''])

  const { dados, loading } = useAnalyticsCampanha(uid, periodo, dataInicio, dataFim)

  if (loading) {
    return <div className="flex items-center gap-2 text-gray-500 py-8 justify-center"><RefreshCw className="w-4 h-4 animate-spin" /> Carregando analytics...</div>
  }
  if (!dados) return <div className="text-gray-500 py-8 text-center text-sm">Sem dados disponíveis</div>

  // A/B comparison
  const campA = dados.campanhasParaAB.find(c => c.id === abSelecionadas[0])
  const campB = dados.campanhasParaAB.find(c => c.id === abSelecionadas[1])
  const radarData = campA && campB ? buildRadarData(campA, campB) : null

  return (
    <div className="space-y-6">
      {/* Filtro de período */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="w-4 h-4 text-amber-400" />
        {(['7d', '30d', 'mes', 'custom'] as Periodo[]).map(p => (
          <button key={p} onClick={() => setPeriodo(p)} className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
            periodo === p ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'text-gray-400 border-slate-700 hover:text-white',
          )}>
            {p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : p === 'mes' ? 'Mês atual' : 'Personalizado'}
          </button>
        ))}
        {periodo === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white" />
            <span className="text-gray-500 text-xs">até</span>
            <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white" />
          </div>
        )}
      </div>

      {/* Funil */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <h3 className="text-white font-medium mb-4">Funil de Campanhas</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={dados.funil} layout="vertical" margin={{ left: 80 }}>
            <XAxis type="number" stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 12 }} />
            <YAxis type="category" dataKey="etapa" stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 12 }} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v.toLocaleString('pt-BR'), 'Total']} />
            <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
              {dados.funil.map((_, i) => <Cell key={i} fill={FUNNEL_COLORS[i] ?? '#f59e0b'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Custo por campanha */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <h3 className="text-white font-medium mb-4">Custo por Campanha (R$)</h3>
          {dados.custoPorCampanha.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dados.custoPorCampanha} margin={{ bottom: 40 }}>
                <XAxis dataKey="nome" stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 10 }} angle={-30} textAnchor="end" />
                <YAxis stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`R$ ${v.toFixed(2)}`]} />
                <Bar dataKey="estimado" fill="#475569" name="Estimado" radius={[2, 2, 0, 0]} />
                <Bar dataKey="real" fill="#f59e0b" name="Real" radius={[2, 2, 0, 0]} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Taxas por campanha */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <h3 className="text-white font-medium mb-4">Taxas por Campanha (%)</h3>
          {dados.taxasPorCampanha.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dados.taxasPorCampanha} margin={{ bottom: 40 }}>
                <XAxis dataKey="nome" stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 10 }} angle={-30} textAnchor="end" />
                <YAxis stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 11 }} domain={[0, 100]} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`]} />
                <Bar dataKey="entrega" fill="#10b981" name="Entrega" radius={[2, 2, 0, 0]} />
                <Bar dataKey="leitura" fill="#8b5cf6" name="Leitura" radius={[2, 2, 0, 0]} />
                <Bar dataKey="resposta" fill="#f59e0b" name="Resposta" radius={[2, 2, 0, 0]} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Custo acumulado */}
      {dados.custoAcumulado.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <h3 className="text-white font-medium mb-4">Custo Acumulado no Mês</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dados.custoAcumulado}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="dia" stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`R$ ${v.toFixed(2)}`]} />
              <Line type="monotone" dataKey="acumulado" stroke="#f59e0b" strokeWidth={2} dot={false} name="Custo real" />
              {dados.orcamentoLinha && <Line type="monotone" dataKey="orcamento" stroke="#ef4444" strokeWidth={1} strokeDasharray="5 5" dot={false} name="Orçamento" />}
              <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Heatmap de horários */}
      {dados.heatmap.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <h3 className="text-white font-medium mb-4">Melhores Horários (respostas recebidas)</h3>
          <HeatmapGrid data={dados.heatmap} />
        </div>
      )}

      {/* Comparação A/B */}
      {dados.campanhasParaAB.length >= 2 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <h3 className="text-white font-medium mb-4">Comparação A/B</h3>
          <div className="flex gap-3 mb-4">
            <select value={abSelecionadas[0]} onChange={e => setAbSelecionadas([e.target.value, abSelecionadas[1]])} className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white">
              <option value="">Campanha A...</option>
              {dados.campanhasParaAB.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <span className="text-gray-500 self-center text-sm">vs</span>
            <select value={abSelecionadas[1]} onChange={e => setAbSelecionadas([abSelecionadas[0], e.target.value])} className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white">
              <option value="">Campanha B...</option>
              {dados.campanhasParaAB.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>

          {campA && campB ? (
            <div className="grid grid-cols-2 gap-4">
              {/* Tabela comparativa */}
              <div className="space-y-2">
                <ABRow label="Enviados" a={campA.enviados} b={campB.enviados} />
                <ABRow label="Entregues" a={campA.entregues} b={campB.entregues} />
                <ABRow label="Lidos" a={campA.lidos} b={campB.lidos} />
                <ABRow label="Respostas" a={campA.respondidos} b={campB.respondidos} />
                <ABRow label="Custo (R$)" a={campA.custo_real} b={campB.custo_real} format="currency" />
                <ABRow label="Taxa entrega" a={campA.enviados > 0 ? Math.round((campA.entregues / campA.enviados) * 100) : 0} b={campB.enviados > 0 ? Math.round((campB.entregues / campB.enviados) * 100) : 0} format="pct" />
              </div>

              {/* Radar */}
              {radarData && (
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#334155" />
                    <PolarAngleAxis dataKey="metrica" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                    <PolarRadiusAxis tick={false} axisLine={false} />
                    <Radar name={campA.nome.slice(0, 15)} dataKey="a" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} />
                    <Radar name={campB.nome.slice(0, 15)} dataKey="b" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
                    <Legend wrapperStyle={{ fontSize: 10, color: '#9ca3af' }} />
                  </RadarChart>
                </ResponsiveContainer>
              )}
            </div>
          ) : (
            <p className="text-center text-gray-500 text-sm py-4">Selecione duas campanhas para comparar</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────

const DIAS_LABEL = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

function HeatmapGrid({ data }: { data: { dia: number; hora: number; valor: number }[] }) {
  const maxVal = Math.max(...data.map(d => d.valor), 1)
  const map = new Map(data.map(d => [`${d.dia}-${d.hora}`, d.valor]))

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Header horas */}
        <div className="flex gap-0.5 ml-10 mb-1">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="w-5 text-center text-[9px] text-gray-600">{h}</div>
          ))}
        </div>
        {/* Linhas por dia */}
        {DIAS_LABEL.map((label, diaIdx) => (
          <div key={diaIdx} className="flex gap-0.5 items-center mb-0.5">
            <span className="w-10 text-[10px] text-gray-500 text-right pr-2">{label}</span>
            {Array.from({ length: 24 }, (_, h) => {
              const val = map.get(`${diaIdx + 1}-${h}`) ?? 0
              const intensity = maxVal > 0 ? val / maxVal : 0
              return (
                <div
                  key={h}
                  className="w-5 h-5 rounded-sm transition-colors"
                  style={{ backgroundColor: intensity > 0 ? `rgba(245, 158, 11, ${0.1 + intensity * 0.8})` : 'rgba(51, 65, 85, 0.3)' }}
                  title={`${label} ${h}h: ${val} respostas`}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── A/B helpers ──────────────────────────────────────────────────────────────

function ABRow({ label, a, b, format }: { label: string; a: number; b: number; format?: 'currency' | 'pct' }) {
  const fmtVal = (v: number) => format === 'currency' ? `R$ ${v.toFixed(2)}` : format === 'pct' ? `${v}%` : v.toLocaleString('pt-BR')
  const winner = a > b ? 'a' : b > a ? 'b' : null
  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/50 rounded-lg">
      <span className={cn('text-xs font-mono', winner === 'a' ? 'text-amber-400 font-bold' : 'text-gray-400')}>{fmtVal(a)}</span>
      <span className="text-[10px] text-gray-500 flex-shrink-0 px-2">{label}</span>
      <span className={cn('text-xs font-mono', winner === 'b' ? 'text-purple-400 font-bold' : 'text-gray-400')}>{fmtVal(b)}</span>
    </div>
  )
}

function buildRadarData(a: any, b: any) {
  const metrics = [
    { key: 'entrega', label: 'Entrega %', aVal: a.enviados > 0 ? (a.entregues / a.enviados) * 100 : 0, bVal: b.enviados > 0 ? (b.entregues / b.enviados) * 100 : 0 },
    { key: 'leitura', label: 'Leitura %', aVal: a.entregues > 0 ? (a.lidos / a.entregues) * 100 : 0, bVal: b.entregues > 0 ? (b.lidos / b.entregues) * 100 : 0 },
    { key: 'resposta', label: 'Resposta %', aVal: a.entregues > 0 ? (a.respondidos / a.entregues) * 100 : 0, bVal: b.entregues > 0 ? (b.respondidos / b.entregues) * 100 : 0 },
    { key: 'volume', label: 'Volume', aVal: Math.min(100, (a.total_contatos / Math.max(a.total_contatos, b.total_contatos)) * 100), bVal: Math.min(100, (b.total_contatos / Math.max(a.total_contatos, b.total_contatos)) * 100) },
  ]
  return metrics.map(m => ({ metrica: m.label, a: Math.round(m.aVal), b: Math.round(m.bVal) }))
}

// ─── Hook analytics ───────────────────────────────────────────────────────────

function useAnalyticsCampanha(unidadeId?: string | null, periodo: Periodo = 'mes', dataInicio?: string, dataFim?: string) {
  const [dados, setDados] = useState<DadosAnalytics | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // Calcular range de datas
      const now = new Date()
      let desde: Date
      if (periodo === '7d') { desde = new Date(now.getTime() - 7 * 86400000) }
      else if (periodo === '30d') { desde = new Date(now.getTime() - 30 * 86400000) }
      else if (periodo === 'custom' && dataInicio) { desde = new Date(dataInicio) }
      else { desde = new Date(now.getFullYear(), now.getMonth(), 1) }

      const ate = periodo === 'custom' && dataFim ? new Date(dataFim + 'T23:59:59') : now

      let q = supabase.from('campanhas').select('id, nome, enviados, entregues, lidos, respondidos, falhas, custo_estimado, custo_real, created_at, total_contatos')
        .gte('created_at', desde.toISOString()).lte('created_at', ate.toISOString())
      if (unidadeId) q = q.eq('unidade_id', unidadeId)
      const { data: campanhas } = await q

      if (!campanhas?.length) { setDados(null); return }

      // Funil
      const totais = campanhas.reduce((acc, c) => ({
        enviados: acc.enviados + (c.enviados ?? 0), entregues: acc.entregues + (c.entregues ?? 0),
        lidos: acc.lidos + (c.lidos ?? 0), respondidos: acc.respondidos + (c.respondidos ?? 0),
      }), { enviados: 0, entregues: 0, lidos: 0, respondidos: 0 })
      const funil = [
        { etapa: 'Enviados', valor: totais.enviados }, { etapa: 'Entregues', valor: totais.entregues },
        { etapa: 'Lidos', valor: totais.lidos }, { etapa: 'Respostas', valor: totais.respondidos },
      ]

      const custoPorCampanha = campanhas.filter(c => (c.custo_estimado ?? 0) > 0 || (c.custo_real ?? 0) > 0).slice(0, 10)
        .map(c => ({ nome: c.nome.slice(0, 20), estimado: c.custo_estimado ?? 0, real: c.custo_real ?? 0 }))

      const taxasPorCampanha = campanhas.filter(c => (c.enviados ?? 0) > 0).slice(0, 10).map(c => ({
        nome: c.nome.slice(0, 20),
        entrega: c.enviados > 0 ? Math.round(((c.entregues ?? 0) / c.enviados) * 100) : 0,
        leitura: (c.entregues ?? 0) > 0 ? Math.round(((c.lidos ?? 0) / c.entregues) * 100) : 0,
        resposta: (c.entregues ?? 0) > 0 ? Math.round(((c.respondidos ?? 0) / c.entregues) * 100) : 0,
      }))

      // Custo acumulado
      let qNum = supabase.from('numeros_meta').select('orcamento_mensal').limit(1)
      if (unidadeId) qNum = qNum.eq('unidade_id', unidadeId)
      const { data: numeros } = await qNum
      const orcamento = numeros?.[0]?.orcamento_mensal ?? null

      const custoPorDia: Record<number, number> = {}
      for (const c of campanhas) { const dia = new Date(c.created_at).getDate(); custoPorDia[dia] = (custoPorDia[dia] ?? 0) + (c.custo_real ?? 0) }
      let acumulado = 0
      const custoAcumulado = Object.entries(custoPorDia).sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([dia, custo]) => { acumulado += custo; return { dia: `${dia}`, acumulado, ...(orcamento ? { orcamento } : {}) } })

      // Heatmap — buscar mensagens inbound por hora/dia
      let qMsgs = supabase.from('mensagens_campanha').select('created_at').eq('direcao', 'inbound')
        .gte('created_at', desde.toISOString()).lte('created_at', ate.toISOString())
      const { data: msgs } = await qMsgs

      const heatmapMap: Record<string, number> = {}
      for (const m of (msgs ?? [])) {
        const d = new Date(m.created_at)
        const dia = d.getDay() === 0 ? 7 : d.getDay() // 1=Mon..7=Sun
        const hora = d.getHours()
        const key = `${dia}-${hora}`
        heatmapMap[key] = (heatmapMap[key] ?? 0) + 1
      }
      const heatmap = Object.entries(heatmapMap).map(([key, valor]) => {
        const [dia, hora] = key.split('-').map(Number)
        return { dia, hora, valor }
      })

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FUNNEL_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b']
const tooltipStyle = { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#fff', fontSize: 12 }
function EmptyChart() { return <p className="text-gray-500 text-sm text-center py-8">Sem dados</p> }
