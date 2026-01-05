import { Calendar } from 'lucide-react'

export function LearningsTimeline() {
  const meses = [
    { mes: 'Jan', cor: 'bg-cyan-500', acao: 'Campanha\nCaptação', corTexto: 'text-cyan-400' },
    { mes: 'Fev', cor: 'bg-red-500', acao: 'Protocolo\nRetenção', corTexto: 'text-red-400' },
    { mes: 'Mar', cor: 'bg-slate-600', acao: 'Review\nQ1', corTexto: 'text-gray-400' },
    { mes: 'Abr', cor: 'bg-amber-500', acao: 'Pesquisa\nNPS', corTexto: 'text-amber-400' },
    { mes: 'Mai', cor: 'bg-red-500', acao: 'Reajuste\nComunicar', corTexto: 'text-red-400' },
    { mes: 'Jun', cor: 'bg-slate-600', acao: 'Review\nS1', corTexto: 'text-gray-400' },
    { mes: 'Jul', cor: 'bg-purple-500', acao: 'Prep\nVolta Aulas', corTexto: 'text-purple-400' },
    { mes: 'Ago', cor: 'bg-cyan-500', acao: 'Campanha\nCaptação', corTexto: 'text-cyan-400' },
    { mes: 'Set', cor: 'bg-slate-600', acao: 'Review\nQ3', corTexto: 'text-gray-400' },
    { mes: 'Out', cor: 'bg-amber-500', acao: 'Pesquisa\nNPS', corTexto: 'text-amber-400' },
    { mes: 'Nov', cor: 'bg-emerald-500', acao: 'Black\nFriday', corTexto: 'text-emerald-400' },
    { mes: 'Dez', cor: 'bg-purple-500', acao: 'Comunicar\nReajuste 27', corTexto: 'text-purple-400' }
  ]

  return (
    <div className="bg-slate-800/30 rounded-xl p-6 mb-10">
      <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
        <Calendar className="w-5 h-5" />
        Timeline de Ações 2026
      </h3>
      
      <div className="relative">
        <div className="absolute top-6 left-0 right-0 h-1 bg-slate-700 rounded"></div>
        
        <div className="grid grid-cols-4 md:grid-cols-12 gap-2 relative">
          {meses.map((m, i) => (
            <div key={i} className="text-center">
              <div className={`w-12 h-12 mx-auto rounded-full ${m.cor} flex items-center justify-center text-white font-bold mb-2 relative z-10 text-sm`}>
                {m.mes}
              </div>
              <div className={`text-xs ${m.corTexto} whitespace-pre-line`}>{m.acao}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mt-8 justify-center text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-cyan-500"></div>
          <span className="text-gray-400">Captação</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-red-500"></div>
          <span className="text-gray-400">Retenção</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-amber-500"></div>
          <span className="text-gray-400">Pesquisa</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-purple-500"></div>
          <span className="text-gray-400">Planejamento</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-emerald-500"></div>
          <span className="text-gray-400">Campanha</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-slate-600"></div>
          <span className="text-gray-400">Review</span>
        </div>
      </div>
    </div>
  )
}

export default LearningsTimeline
