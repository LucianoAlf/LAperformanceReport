// Card compacto de sugestão para listas

import { Check } from 'lucide-react';
import type { Sugestao } from '@/lib/sugestoes-horarios';
import { EstrelaScore, scoreParaCor } from './EstrelaScore';

interface CardSugestaoCompactoProps {
  sugestao: Sugestao;
  onUsar: (sugestao: Sugestao) => void;
  capacidadeSala?: number;
}

export function CardSugestaoCompacto({ sugestao, onUsar, capacidadeSala }: CardSugestaoCompactoProps) {
  const cor = scoreParaCor(sugestao.score);

  return (
    <div className="flex items-center justify-between p-3 bg-slate-800/50 border border-slate-700 rounded-lg hover:border-slate-600 transition-all group">
      <div className="flex items-center gap-4">
        {/* Estrelas */}
        <EstrelaScore score={sugestao.score} tamanho="sm" />

        {/* Dia */}
        <span className="text-sm font-medium text-white w-20">
          {sugestao.diaSemana.slice(0, 3)}
        </span>

        {/* Horário */}
        <span className="text-sm text-slate-300">
          {sugestao.horarioInicio}
        </span>

        {/* Sala */}
        <span className="text-sm text-slate-400">
          {sugestao.salaNome}
          {capacidadeSala && <span className="text-slate-500 ml-1">({capacidadeSala})</span>}
        </span>

        {/* Indicadores */}
        <div className="flex items-center gap-1">
          {sugestao.motivos.length > 0 && (
            <span className="text-xs text-emerald-400">
              ✓{sugestao.motivos.length}
            </span>
          )}
          {sugestao.conflitos.length > 0 && (
            <span className="text-xs text-amber-400">
              ⚠{sugestao.conflitos.length}
            </span>
          )}
        </div>
      </div>

      {/* Botão usar */}
      <button
        onClick={() => onUsar(sugestao)}
        className="px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600 text-cyan-400 hover:text-white text-xs font-medium rounded-lg transition-all opacity-0 group-hover:opacity-100"
      >
        <Check className="w-4 h-4" />
      </button>
    </div>
  );
}
