// Componente: Alertas de Viabilidade para Simulador de Turma
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AlertaViabilidade } from '@/lib/simulador-turma/tipos';

interface AlertasViabilidadeTurmaProps {
  alertas: AlertaViabilidade[];
  score: number;
}

const iconeMap = {
  sucesso: CheckCircle,
  aviso: AlertTriangle,
  erro: XCircle,
};

const corMap = {
  sucesso: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500',
    text: 'text-emerald-400',
  },
  aviso: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500',
    text: 'text-amber-400',
  },
  erro: {
    bg: 'bg-rose-500/10',
    border: 'border-rose-500',
    text: 'text-rose-400',
  },
};

export function AlertasViabilidadeTurma({ alertas, score }: AlertasViabilidadeTurmaProps) {
  const scoreColor = score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-rose-400';
  const scoreBg = score >= 80 ? 'bg-emerald-500/20' : score >= 60 ? 'bg-amber-500/20' : 'bg-rose-500/20';

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <h3 className="font-semibold text-white">ALERTAS DE VIABILIDADE</h3>
        </div>
        <div className={cn('flex items-center gap-2 px-3 py-1 rounded-full', scoreBg, scoreColor)}>
          Score: <span className="font-bold">{score}%</span>
        </div>
      </div>

      <div className="space-y-4">
        {alertas.map((alerta, index) => {
          const Icone = iconeMap[alerta.tipo];
          const cores = corMap[alerta.tipo];

          return (
            <div
              key={index}
              className={cn(
                'p-4 rounded-xl border-l-4',
                cores.bg,
                cores.border
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icone className={cn('w-4 h-4', cores.text)} />
                <span className={cn('font-medium', cores.text)}>{alerta.titulo}</span>
              </div>
              <p className="text-slate-400 text-sm">{alerta.mensagem}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
