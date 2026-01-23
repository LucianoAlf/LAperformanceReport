// Lista de sugestões de horários ordenada por score

import { useState } from 'react';
import { Lightbulb, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import type { Sugestao } from '@/lib/sugestoes-horarios';
import { CardSugestao } from './CardSugestao';
import { CardSugestaoCompacto } from './CardSugestaoCompacto';

interface ListaSugestoesProps {
  sugestoes: Sugestao[];
  onUsarSugestao: (sugestao: Sugestao) => void;
  carregando?: boolean;
  modoCompacto?: boolean;
  limiteInicial?: number;
  salasCapacidade?: Map<number, number>;
  numAlunos?: number;
}

export function ListaSugestoes({ 
  sugestoes, 
  onUsarSugestao, 
  carregando = false,
  modoCompacto = false,
  limiteInicial = 3,
  salasCapacidade,
  numAlunos
}: ListaSugestoesProps) {
  const [expandido, setExpandido] = useState(false);
  const [mostrarTodas, setMostrarTodas] = useState(false);

  const sugestoesVisiveis = mostrarTodas ? sugestoes : sugestoes.slice(0, limiteInicial);
  const temMais = sugestoes.length > limiteInicial;

  if (carregando) {
    return (
      <div className="flex items-center justify-center p-6 bg-slate-800/30 border border-slate-700 rounded-xl">
        <div className="flex items-center gap-3 text-slate-400">
          <Sparkles className="w-5 h-5 animate-pulse" />
          <span className="text-sm">Buscando melhores horários...</span>
        </div>
      </div>
    );
  }

  if (sugestoes.length === 0) {
    return (
      <div className="flex items-center gap-3 p-4 bg-slate-800/30 border border-slate-700 rounded-xl">
        <Lightbulb className="w-5 h-5 text-slate-500" />
        <div>
          <p className="text-sm font-medium text-slate-400">Nenhuma sugestão disponível</p>
          <p className="text-xs text-slate-500">Tente ajustar os filtros ou selecionar outro professor</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header colapsável */}
      <button
        onClick={() => setExpandido(!expandido)}
        className="w-full flex items-center justify-between p-3 bg-slate-800/50 border border-slate-700 rounded-lg hover:bg-slate-800/70 transition-all"
      >
        <div className="flex items-center gap-3">
          <Lightbulb className="w-5 h-5 text-amber-400" />
          <span className="text-sm font-medium text-white">
            Sugestões de Horário
          </span>
          <span className="text-xs text-slate-400 bg-slate-700 px-2 py-0.5 rounded-full">
            {sugestoes.length} encontrada{sugestoes.length > 1 ? 's' : ''}
          </span>
        </div>
        {expandido ? (
          <ChevronUp className="w-5 h-5 text-slate-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400" />
        )}
      </button>

      {/* Lista de sugestões */}
      {expandido && (
        <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
          {modoCompacto ? (
            // Modo compacto - lista simples
            <div className="space-y-1">
              {sugestoesVisiveis.map((sugestao, index) => (
                <CardSugestaoCompacto
                  key={`${sugestao.diaSemana}-${sugestao.horarioInicio}-${sugestao.salaId}-${index}`}
                  sugestao={sugestao}
                  onUsar={onUsarSugestao}
                  capacidadeSala={salasCapacidade?.get(sugestao.salaId)}
                />
              ))}
            </div>
          ) : (
            // Modo detalhado - cards grandes
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {sugestoesVisiveis.map((sugestao, index) => (
                <CardSugestao
                  key={`${sugestao.diaSemana}-${sugestao.horarioInicio}-${sugestao.salaId}-${index}`}
                  sugestao={sugestao}
                  onUsar={onUsarSugestao}
                  capacidadeSala={salasCapacidade?.get(sugestao.salaId)}
                  numAlunos={numAlunos}
                />
              ))}
            </div>
          )}

          {/* Botão ver mais */}
          {temMais && (
            <button
              onClick={() => setMostrarTodas(!mostrarTodas)}
              className="w-full py-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              {mostrarTodas 
                ? `Mostrar menos` 
                : `Ver mais ${sugestoes.length - limiteInicial} sugestões...`
              }
            </button>
          )}
        </div>
      )}
    </div>
  );
}
