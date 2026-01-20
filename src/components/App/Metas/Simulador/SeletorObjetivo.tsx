// Componente para selecionar o tipo de objetivo do simulador

import { TipoObjetivo } from '@/lib/simulador/tipos';

interface SeletorObjetivoProps {
  tipoObjetivo: TipoObjetivo;
  onChange: (tipo: TipoObjetivo) => void;
}

export function SeletorObjetivo({ tipoObjetivo, onChange }: SeletorObjetivoProps) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-slate-400">Qual é o seu objetivo principal?</span>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        {/* Objetivo 1: Alunos Pagantes */}
        <button
          onClick={() => onChange('alunos')}
          className={`border-2 rounded-xl p-4 text-left transition-all ${
            tipoObjetivo === 'alunos'
              ? 'border-cyan-500 bg-cyan-500/10'
              : 'border-slate-700 bg-transparent hover:border-slate-600 hover:bg-slate-700/20'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              tipoObjetivo === 'alunos' ? 'bg-cyan-500/20' : 'bg-slate-700/50'
            }`}>
              <span className="text-2xl">👥</span>
            </div>
            <div>
              <div className="font-semibold text-white">Alunos Pagantes</div>
              <div className="text-xs text-slate-400">Crescer a base de alunos</div>
            </div>
          </div>
          <div className={`mt-3 text-xs ${
            tipoObjetivo === 'alunos' ? 'text-cyan-400' : 'text-slate-500'
          }`}>
            {tipoObjetivo === 'alunos' ? '✓ Selecionado' : 'Clique para selecionar'}
          </div>
        </button>
        
        {/* Objetivo 2: MRR / Faturamento */}
        <button
          onClick={() => onChange('mrr')}
          className={`border-2 rounded-xl p-4 text-left transition-all ${
            tipoObjetivo === 'mrr'
              ? 'border-emerald-500 bg-emerald-500/10'
              : 'border-slate-700 bg-transparent hover:border-slate-600 hover:bg-slate-700/20'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              tipoObjetivo === 'mrr' ? 'bg-emerald-500/20' : 'bg-slate-700/50'
            }`}>
              <span className="text-2xl">💰</span>
            </div>
            <div>
              <div className="font-semibold text-white">MRR / Faturamento</div>
              <div className="text-xs text-slate-400">Crescer a receita recorrente</div>
            </div>
          </div>
          <div className={`mt-3 text-xs ${
            tipoObjetivo === 'mrr' ? 'text-emerald-400' : 'text-slate-500'
          }`}>
            {tipoObjetivo === 'mrr' ? '✓ Selecionado' : 'Clique para selecionar'}
          </div>
        </button>
      </div>
    </div>
  );
}
