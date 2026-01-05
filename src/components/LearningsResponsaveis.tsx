import { Users, Rocket } from 'lucide-react'

export function LearningsResponsaveis() {
  const responsaveis = [
    { area: 'Marketing & Captação', detalhe: 'Campanhas Jan/Ago + Indicação', responsavel: 'Yuri', cor: 'bg-cyan-500/20', corTexto: 'text-cyan-400', emoji: '📢' },
    { area: 'Retenção & Churn', detalhe: 'Protocolo 30d + Comunicação', responsavel: 'Gestores', cor: 'bg-red-500/20', corTexto: 'text-red-400', emoji: '🛡️' },
    { area: 'Tecnologia & Dados', detalhe: 'Dashboard + Alertas + CRM', responsavel: 'Hugo', cor: 'bg-purple-500/20', corTexto: 'text-purple-400', emoji: '💻' },
    { area: 'Financeiro & Pricing', detalhe: 'Reajuste + Inadimplência', responsavel: 'Alf', cor: 'bg-amber-500/20', corTexto: 'text-amber-400', emoji: '💰' }
  ]

  const proximosPassos = [
    { tarefa: 'Lançar campanha de Janeiro', prazo: 'Até 05/01', responsavel: 'Marketing' },
    { tarefa: 'Identificar alunos em risco para Fevereiro', prazo: 'Até 15/01', responsavel: 'Gestores' },
    { tarefa: 'Configurar alertas no LA DashFinance', prazo: 'Até 20/01', responsavel: 'Hugo' },
    { tarefa: 'Primeira reunião quinzenal de KPIs', prazo: 'Até 31/01', responsavel: 'Todos' },
    { tarefa: 'Estruturar programa de indicação', prazo: 'Até 31/01', responsavel: 'Alf + Marketing' },
    { tarefa: 'Benchmark: visita à Barra', prazo: 'Até 15/02', responsavel: 'Gestores CG + Recreio' }
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      
      {/* Responsáveis por Frente */}
      <div className="bg-slate-800/30 rounded-xl p-6">
        <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
          <Users className="w-5 h-5" />
          Responsáveis por Frente
        </h3>
        
        <div className="space-y-4">
          {responsaveis.map((r, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full ${r.cor} flex items-center justify-center text-xl`}>
                  {r.emoji}
                </div>
                <div>
                  <div className="text-white font-medium">{r.area}</div>
                  <div className="text-gray-400 text-sm">{r.detalhe}</div>
                </div>
              </div>
              <div className={`${r.corTexto} font-medium`}>{r.responsavel}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Próximos Passos Imediatos */}
      <div className="bg-slate-800/30 rounded-xl p-6">
        <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
          <Rocket className="w-5 h-5" />
          Próximos Passos (Jan/2026)
        </h3>
        
        <div className="space-y-3">
          {proximosPassos.map((p, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-slate-900/50 rounded-lg">
              <input 
                type="checkbox" 
                className="mt-1 w-5 h-5 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500 cursor-pointer" 
              />
              <div>
                <div className="text-white font-medium">{p.tarefa}</div>
                <div className="text-gray-400 text-sm">{p.prazo} • {p.responsavel}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

export default LearningsResponsaveis
