import { useNavigate } from 'react-router-dom'
import { TrendingUp, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConversaoCampanhas } from '../hooks/useConversaoCampanhas'

export function ConversaoTab({ unidadeId }: { unidadeId: string | null }) {
  const { conversoes, loading, error } = useConversaoCampanhas(undefined, unidadeId)
  const navigate = useNavigate()

  if (loading) {
    return <div className="text-center py-16 text-gray-500">Carregando conversão...</div>
  }
  if (error) {
    return <div className="text-center py-16 text-red-400">{error}</div>
  }
  if (conversoes.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Nenhuma campanha criada ainda.</p>
      </div>
    )
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700/50 text-left text-xs text-gray-500 uppercase tracking-wide">
            <th className="px-4 py-3 font-medium">Campanha</th>
            <th className="px-4 py-3 font-medium text-right">Leads gerados</th>
            <th className="px-4 py-3 font-medium text-right">Matriculados</th>
            <th className="px-4 py-3 font-medium text-right">Taxa de conversão</th>
            <th className="px-4 py-3 font-medium text-right">Custo por matrícula</th>
            <th className="px-4 py-3 font-medium text-right"></th>
          </tr>
        </thead>
        <tbody>
          {conversoes.map(c => (
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
              <td className="px-4 py-3 text-right text-gray-300">
                {c.leadsGerados > 0 ? `${(c.taxaConversao * 100).toFixed(1)}%` : '—'}
              </td>
              <td className="px-4 py-3 text-right text-gray-300">
                {c.custoPorMatricula != null && c.custoPorMatricula > 0
                  ? `${c.custoMoeda === 'USD' ? 'US$' : 'R$'} ${c.custoPorMatricula.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  : '—'}
              </td>
              <td className="px-4 py-3 text-right">
                <ArrowRight className="w-4 h-4 text-gray-600 inline-block" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
