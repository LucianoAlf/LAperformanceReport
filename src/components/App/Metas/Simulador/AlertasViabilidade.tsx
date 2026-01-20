// Componente: Alertas de Viabilidade

import { AlertTriangle, CheckCircle, XCircle, Info, Lightbulb } from 'lucide-react';
import { Alerta } from '@/lib/simulador/tipos';

// Formatar valores numéricos para exibição limpa
function formatarValor(valor: number): string {
  if (Number.isInteger(valor)) {
    return valor.toString();
  }
  // Limitar a 1 casa decimal para valores com decimais
  return valor.toFixed(1);
}

interface AlertasViabilidadeProps {
  alertas: Alerta[];
  score: number;
}

const ICONES = {
  'check-circle': CheckCircle,
  'alert-triangle': AlertTriangle,
  'x-circle': XCircle,
  'info': Info,
  'lightbulb': Lightbulb,
  'trending-down': AlertTriangle,
  'rocket': Info,
  'percent': Info,
};

const CORES_TIPO = {
  sucesso: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    icon: 'bg-emerald-500/20 text-emerald-400',
    titulo: 'text-emerald-400',
  },
  aviso: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    icon: 'bg-amber-500/20 text-amber-400',
    titulo: 'text-amber-400',
  },
  erro: {
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    icon: 'bg-rose-500/20 text-rose-400',
    titulo: 'text-rose-400',
  },
  info: {
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    icon: 'bg-cyan-500/20 text-cyan-400',
    titulo: 'text-cyan-400',
  },
};

function getScoreColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500/20 text-emerald-400';
  if (score >= 60) return 'bg-cyan-500/20 text-cyan-400';
  if (score >= 40) return 'bg-amber-500/20 text-amber-400';
  return 'bg-rose-500/20 text-rose-400';
}

export function AlertasViabilidade({ alertas, score }: AlertasViabilidadeProps) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <h2 className="font-semibold text-white">ALERTAS DE VIABILIDADE</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Score:</span>
          <span className={`px-3 py-1 rounded-full font-bold ${getScoreColor(score)}`}>
            {score}%
          </span>
        </div>
      </div>
      
      <div className="space-y-3">
        {alertas.map((alerta) => {
          const cores = CORES_TIPO[alerta.tipo];
          const Icone = ICONES[alerta.icone as keyof typeof ICONES] || Info;
          
          return (
            <div 
              key={alerta.id}
              className={`flex items-start gap-3 ${cores.bg} border ${cores.border} rounded-xl p-4`}
            >
              <div className={`w-6 h-6 rounded-full ${cores.icon} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                <Icone className="w-3 h-3" />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`font-medium ${cores.titulo}`}>{alerta.titulo}</div>
                <div className="text-sm text-slate-400 mt-0.5">{alerta.mensagem}</div>
                
                {/* Valores comparativos */}
                {(alerta.valorAtual !== undefined || alerta.valorNecessario !== undefined) && (
                  <div className="text-xs text-slate-500 mt-1">
                    {alerta.valorAtual !== undefined && (
                      <span>Atual: <span className="text-white">{formatarValor(alerta.valorAtual)}</span></span>
                    )}
                    {alerta.valorAtual !== undefined && alerta.valorNecessario !== undefined && (
                      <span className="mx-2">•</span>
                    )}
                    {alerta.valorNecessario !== undefined && (
                      <span>Necessário: <span className="text-white">{formatarValor(alerta.valorNecessario)}</span></span>
                    )}
                    {alerta.diferencaPercent !== undefined && (
                      <span className={`ml-2 ${alerta.diferencaPercent > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        ({alerta.diferencaPercent > 0 ? '+' : ''}{alerta.diferencaPercent.toFixed(0)}%)
                      </span>
                    )}
                  </div>
                )}
                
                {/* Sugestão */}
                {alerta.sugestao && (
                  <div className="flex items-center gap-2 text-xs mt-2">
                    <Lightbulb className="w-3 h-3 text-cyan-400" />
                    <span className="text-cyan-300">{alerta.sugestao}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AlertasViabilidade;
