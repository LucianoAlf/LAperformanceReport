import { BarChart3 } from 'lucide-react'

export function LearningsKPIs() {
  const kpis = [
    { label: 'Evasão Mensal Máxima', valor: '< 35', detalhe: 'por unidade (vs 40 em 2025)', progresso: 75 },
    { label: 'Saldo Líquido Mensal', valor: '> +15', detalhe: 'matrículas - evasões', progresso: 50 },
    { label: 'Taxa de Renovação', valor: '> 88%', detalhe: 'média do grupo', progresso: 80 },
    { label: 'NPS Score', valor: '> 70', detalhe: 'pesquisa semestral', progresso: 67 },
    { label: 'Matrículas Jan/Ago', valor: '> 200', detalhe: 'nos 2 meses de pico', progresso: 60 },
    { label: 'Evasão Fevereiro', valor: '< 50', detalhe: 'vs 81 em 2025 (-38%)', progresso: 50, cor: 'from-red-500 to-amber-500' },
    { label: 'Indicações/Mês', valor: '> 15', detalhe: '20% das matrículas', progresso: 33, cor: 'from-purple-500 to-pink-500' },
    { label: 'Tempo de Permanência', valor: '> 17m', detalhe: 'vs 16m em 2025', progresso: 80 }
  ]

  return (
    <div className="bg-slate-800/30 rounded-xl p-6 mb-10">
      <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
        <BarChart3 className="w-5 h-5" />
        KPIs de Acompanhamento 2026
      </h3>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <div key={i} className="bg-slate-900/50 rounded-lg p-4">
            <div className="text-gray-400 text-sm mb-2">{kpi.label}</div>
            <div className="text-2xl font-bold text-white">{kpi.valor}</div>
            <div className="text-xs text-gray-500 mt-1">{kpi.detalhe}</div>
            <div className="mt-3 h-2 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className={`h-full bg-gradient-to-r ${kpi.cor || 'from-emerald-500 to-cyan-500'}`}
                style={{ width: `${kpi.progresso}%` }}
              ></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default LearningsKPIs
