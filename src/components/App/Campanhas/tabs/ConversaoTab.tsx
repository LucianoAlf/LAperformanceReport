import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { TrendingUp, Users, GraduationCap, Percent, Wallet, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { KPICard } from '@/components/ui/KPICard'
import { DonutChart } from '@/components/ui/DonutChart'
import { useConversaoCampanhas, type ConversaoCampanha } from '../hooks/useConversaoCampanhas'
import { useCotacaoUSDBRL } from '@/hooks/useCotacaoUSDBRL'

const TOOLTIP_STYLE = { background: '#0f172a', border: '1px solid rgba(148, 163, 184, 0.15)', borderRadius: 12, color: '#f1f5f9', fontSize: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }

export function ConversaoTab({ unidadeId }: { unidadeId: string | null }) {
  const { conversoes, loading, error } = useConversaoCampanhas(undefined, unidadeId)
  const { cotacao, loading: loadingCotacao, error: errorCotacao } = useCotacaoUSDBRL()
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-slate-400 py-16 justify-center">
        <TrendingUp className="w-5 h-5 animate-pulse text-amber-400" />
        <span className="text-sm">Carregando conversão...</span>
      </div>
    )
  }
  if (error) {
    return <div className="text-center py-16 text-red-400 text-sm">{error}</div>
  }
  if (conversoes.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Nenhuma campanha criada ainda.</p>
      </div>
    )
  }

  const totalLeads = conversoes.reduce((acc, c) => acc + c.leadsGerados, 0)
  const totalMatriculados = conversoes.reduce((acc, c) => acc + c.matriculados, 0)
  const taxaGeral = totalLeads > 0 ? (totalMatriculados / totalLeads) * 100 : 0
  const custoMedioBRL = calcularCustoMedioBRL(conversoes, cotacao)

  const comMovimento = conversoes.filter(c => c.leadsGerados > 0)
  const chartData = comMovimento
    .map(c => ({ nome: encurtarNome(c.campanhaNome), leads: c.leadsGerados, matriculados: c.matriculados }))
    .sort((a, b) => b.leads - a.leads)

  const donutData = comMovimento
    .filter(c => c.matriculados > 0)
    .map(c => ({ name: encurtarNome(c.campanhaNome), value: c.matriculados }))

  return (
    <div className="space-y-5">
      {/* Hero KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Leads gerados" value={totalLeads} icon={Users} variant="cyan" size="lg" />
        <KPICard label="Matriculados" value={totalMatriculados} icon={GraduationCap} variant="emerald" size="lg" />
        <KPICard label="Taxa de conversão" value={taxaGeral} format="percent" icon={Percent} variant="violet" size="lg" />
        <KPICard
          label="Custo médio / matrícula"
          value={
            loadingCotacao ? '…'
              : custoMedioBRL != null ? formatarReais(custoMedioBRL)
              : errorCotacao ? 'Câmbio indisponível'
              : '—'
          }
          icon={Wallet}
          variant="amber"
          size="lg"
        />
      </div>

      {/* Gráficos */}
      {chartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <ChartCard title="Leads x Matriculados" subtitle="Por campanha" className="lg:col-span-3">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ bottom: 40, left: 0, right: 10, top: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(51,65,85,0.4)" vertical={false} />
                <XAxis dataKey="nome" stroke="transparent" tick={{ fill: '#94a3b8', fontSize: 10 }} angle={-30} textAnchor="end" />
                <YAxis stroke="transparent" tick={{ fill: '#64748b', fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(148,163,184,0.05)' }} />
                <Bar dataKey="leads" fill="#38bdf8" name="Leads" radius={[4, 4, 0, 0]} />
                <Bar dataKey="matriculados" fill="#10b981" name="Matriculados" radius={[4, 4, 0, 0]} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 8 }} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="lg:col-span-2">
            {donutData.length > 0 ? (
              <DonutChart data={donutData} title="Matrículas por campanha" centerLabel="Matrículas" className="h-full" />
            ) : (
              <ChartCard title="Matrículas por campanha" subtitle="Nenhuma matrícula ainda">
                <div className="flex items-center justify-center h-48 text-slate-500 text-sm">Sem dados para exibir</div>
              </ChartCard>
            )}
          </div>
        </div>
      )}

      {/* Tabela detalhada */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 font-medium">Campanha</th>
              <th className="px-4 py-3 font-medium text-right">Leads gerados</th>
              <th className="px-4 py-3 font-medium text-right">Matriculados</th>
              <th className="px-4 py-3 font-medium">Taxa de conversão</th>
              <th className="px-4 py-3 font-medium text-right">Custo por matrícula</th>
              <th className="px-4 py-3 font-medium text-right"></th>
            </tr>
          </thead>
          <tbody>
            {conversoes.map(c => {
              const taxaPct = c.leadsGerados > 0 ? c.taxaConversao * 100 : 0
              return (
                <tr
                  key={c.campanhaId}
                  onClick={() => navigate(`/app/campanhas/${c.campanhaId}`)}
                  className="border-b border-slate-700/30 last:border-0 hover:bg-slate-700/30 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 text-white font-medium">{c.campanhaNome}</td>
                  <td className="px-4 py-3 text-right text-gray-300">{c.leadsGerados}</td>
                  <td className={cn('px-4 py-3 text-right font-medium', c.matriculados > 0 ? 'text-emerald-400' : 'text-gray-500')}>
                    {c.matriculados}
                  </td>
                  <td className="px-4 py-3">
                    {c.leadsGerados > 0 ? (
                      <div className="flex items-center gap-2 min-w-[110px]">
                        <div className="flex-1 h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-500"
                            style={{ width: `${Math.min(taxaPct, 100)}%` }}
                          />
                        </div>
                        <span className="text-gray-300 text-xs tabular-nums w-11 text-right">{taxaPct.toFixed(1)}%</span>
                      </div>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300">
                    {formatarCustoBRL(c.custoPorMatricula, c.custoMoeda, cotacao, loadingCotacao)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ArrowRight className="w-4 h-4 text-gray-600 inline-block" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ChartCard({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-slate-800/20 border border-slate-700/30 rounded-xl p-5', className)}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function encurtarNome(nome: string): string {
  return nome.replace(/^Feirão de Matrículas \d{4}\s*—\s*/i, '').trim() || nome
}

function formatarReais(valor: number): string {
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

/**
 * Converte pra BRL usando a cotação ao vivo (useCotacaoUSDBRL). Se a moeda já
 * é BRL, passa direto. Se é USD e a cotação ainda não chegou/falhou, retorna
 * null — quem chama decide o fallback (nunca inventa taxa de câmbio).
 */
function converterParaBRL(valor: number, moeda: string, cotacao: number | null): number | null {
  if (moeda === 'BRL') return valor
  if (moeda === 'USD') return cotacao != null ? valor * cotacao : null
  return null
}

function formatarCustoBRL(
  valorOriginal: number | null,
  moedaOriginal: string,
  cotacao: number | null,
  loadingCotacao: boolean,
): string {
  if (valorOriginal == null || valorOriginal <= 0) return '—'
  if (moedaOriginal === 'BRL') return formatarReais(valorOriginal)
  if (loadingCotacao) return '…'
  const emReais = converterParaBRL(valorOriginal, moedaOriginal, cotacao)
  if (emReais != null) return formatarReais(emReais)
  return `US$ ${valorOriginal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (câmbio indisp.)`
}

/**
 * Custo médio por matrícula agregado de todas as campanhas, já convertido pra
 * BRL. Campanhas cuja moeda não converteu (cotação indisponível) ficam de
 * fora do agregado — melhor omitir do que misturar moedas.
 */
function calcularCustoMedioBRL(conversoes: ConversaoCampanha[], cotacao: number | null): number | null {
  const comCusto = conversoes.filter(c => c.custoPorMatricula != null && c.custoPorMatricula > 0 && c.matriculados > 0)
  if (comCusto.length === 0) return null

  let custoTotal = 0
  let matriculados = 0
  for (const c of comCusto) {
    const emReais = converterParaBRL(c.custoPorMatricula!, c.custoMoeda, cotacao)
    if (emReais == null) continue
    custoTotal += emReais * c.matriculados
    matriculados += c.matriculados
  }

  return matriculados > 0 ? custoTotal / matriculados : null
}
