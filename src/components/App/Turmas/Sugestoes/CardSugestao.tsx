// Card detalhado com informações da sugestão de horário

import { Calendar, MapPin, Clock, Check, AlertTriangle, Users } from 'lucide-react';
import type { Sugestao } from '@/lib/sugestoes-horarios';
import { EstrelaScore, scoreParaTexto, scoreParaCor } from './EstrelaScore';

interface CardSugestaoProps {
  sugestao: Sugestao;
  onUsar: (sugestao: Sugestao) => void;
  capacidadeSala?: number;
  numAlunos?: number;
}

export function CardSugestao({ sugestao, onUsar, capacidadeSala, numAlunos }: CardSugestaoProps) {
  const cor = scoreParaCor(sugestao.score);
  const texto = scoreParaTexto(sugestao.score);

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden hover:border-slate-600 transition-all">
      {/* Header com score */}
      <div className="flex items-center justify-between p-3 bg-slate-800/80 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <EstrelaScore score={sugestao.score} tamanho="md" />
          <span className={`text-sm font-semibold ${cor}`}>{texto}</span>
        </div>
        <span className="text-xs text-slate-500">Score: {sugestao.score}</span>
      </div>

      {/* Conteúdo */}
      <div className="p-4 space-y-4">
        {/* Informações principais */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-cyan-400" />
            <div>
              <p className="text-xs text-slate-400">Dia</p>
              <p className="text-sm font-medium text-white">{sugestao.diaSemana}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-400" />
            <div>
              <p className="text-xs text-slate-400">Horário</p>
              <p className="text-sm font-medium text-white">
                {sugestao.horarioInicio} - {sugestao.horarioFim}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 col-span-2">
            <MapPin className="w-4 h-4 text-emerald-400" />
            <div>
              <p className="text-xs text-slate-400">Sala</p>
              <p className="text-sm font-medium text-white">
                {sugestao.salaNome}
                {capacidadeSala && (
                  <span className="text-slate-400 ml-1">
                    ({numAlunos || 0}/{capacidadeSala} lugares)
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Motivos positivos */}
        {sugestao.motivos.length > 0 && (
          <div className="space-y-1">
            {sugestao.motivos.map((motivo, index) => (
              <div key={index} className="flex items-center gap-2 text-xs">
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-300">{motivo}</span>
              </div>
            ))}
          </div>
        )}

        {/* Avisos */}
        {sugestao.conflitos.length > 0 && (
          <div className="space-y-1">
            {sugestao.conflitos.map((conflito, index) => (
              <div key={index} className="flex items-center gap-2 text-xs">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span className="text-amber-300">{conflito}</span>
              </div>
            ))}
          </div>
        )}

        {/* Botão usar */}
        <button
          onClick={() => onUsar(sugestao)}
          className="w-full py-2 px-4 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" />
          Usar esta sugestão
        </button>
      </div>
    </div>
  );
}
