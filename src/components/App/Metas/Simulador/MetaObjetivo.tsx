// Componente: Meta Objetivo (input principal)
// Suporta dois modos: Alunos e MRR

import { Target, TrendingUp } from 'lucide-react';
import { TipoObjetivo, TipoMetaFinanceira } from '@/lib/simulador/tipos';
import { formatarMoeda } from '@/lib/simulador/calculos';

interface MetaObjetivoProps {
  tipoObjetivo: TipoObjetivo;
  tipoMetaFinanceira: TipoMetaFinanceira;
  alunosAtual: number;
  alunosObjetivo: number;
  mrrAtual: number;
  mrrObjetivo: number;
  mesObjetivo: number;
  ticketMedio: number;
  onChange: (campo: string, valor: number | string) => void;
}

const MESES = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
];

export function MetaObjetivo({ 
  tipoObjetivo,
  tipoMetaFinanceira,
  alunosAtual, 
  alunosObjetivo, 
  mrrAtual,
  mrrObjetivo,
  mesObjetivo, 
  ticketMedio,
  onChange 
}: MetaObjetivoProps) {
  
  // Cálculos para modo Alunos
  const crescimentoAlunos = alunosObjetivo - alunosAtual;
  const crescimentoAlunosPct = alunosAtual > 0 ? (crescimentoAlunos / alunosAtual) * 100 : 0;
  
  // Cálculos para modo MRR
  // O valor armazenado em mrrObjetivo sempre reflete o tipo selecionado:
  // - Se mensal: mrrObjetivo = valor mensal
  // - Se anual: mrrObjetivo = valor anual
  // Para cálculos, sempre usamos o valor mensal
  const mrrObjetivoMensal = tipoMetaFinanceira === 'anual' ? mrrObjetivo / 12 : mrrObjetivo;
  const faturamentoAnualProjetado = tipoMetaFinanceira === 'anual' ? mrrObjetivo : mrrObjetivo * 12;
  
  // Crescimento sempre comparado com MRR atual (mensal)
  const crescimentoMrr = mrrObjetivoMensal - mrrAtual;
  const crescimentoMrrPct = mrrAtual > 0 ? (crescimentoMrr / mrrAtual) * 100 : 0;
  
  // Para exibição: se anual, mostra crescimento anual; se mensal, mostra crescimento mensal
  const crescimentoExibido = tipoMetaFinanceira === 'anual' 
    ? (mrrObjetivo - (mrrAtual * 12))  // Crescimento anual
    : crescimentoMrr;  // Crescimento mensal
  const baseComparacao = tipoMetaFinanceira === 'anual' ? mrrAtual * 12 : mrrAtual;
  const crescimentoExibidoPct = baseComparacao > 0 ? (crescimentoExibido / baseComparacao) * 100 : 0;
  
  const isPositivo = tipoObjetivo === 'mrr' ? crescimentoMrr >= 0 : crescimentoAlunos >= 0;
  const corDestaque = tipoObjetivo === 'mrr' ? 'emerald' : 'cyan';

  return (
    <div className={`bg-gradient-to-br from-${corDestaque}-500/10 to-transparent border border-${corDestaque}-500/30 rounded-2xl p-5`}>
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-8 h-8 rounded-lg bg-${corDestaque}-500/20 flex items-center justify-center`}>
          <Target className={`w-4 h-4 text-${corDestaque}-400`} />
        </div>
        <div>
          <h2 className="font-semibold text-white">META OBJETIVO</h2>
          <p className="text-xs text-slate-500">
            {tipoObjetivo === 'mrr' ? 'Quanto você quer faturar?' : 'Quantos alunos você quer ter?'}
          </p>
        </div>
      </div>
      
      {tipoObjetivo === 'mrr' ? (
        <>
          {/* Toggle MRR Mensal / Faturamento Anual */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => {
                if (tipoMetaFinanceira === 'anual') {
                  // Convertendo de Anual → Mensal: divide por 12
                  onChange('mrrObjetivo', Math.round(mrrObjetivo / 12));
                }
                onChange('tipoMetaFinanceira', 'mensal');
              }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                tipoMetaFinanceira === 'mensal'
                  ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400'
                  : 'bg-slate-700/50 border border-slate-600 text-slate-400 hover:bg-slate-700'
              }`}
            >
              MRR Mensal
            </button>
            <button
              onClick={() => {
                if (tipoMetaFinanceira === 'mensal') {
                  // Convertendo de Mensal → Anual: multiplica por 12
                  onChange('mrrObjetivo', Math.round(mrrObjetivo * 12));
                }
                onChange('tipoMetaFinanceira', 'anual');
              }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                tipoMetaFinanceira === 'anual'
                  ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400'
                  : 'bg-slate-700/50 border border-slate-600 text-slate-400 hover:bg-slate-700'
              }`}
            >
              Faturamento Anual
            </button>
          </div>
          
          {/* Input MRR */}
          <div className="mb-4">
            <label className="text-sm text-slate-400 mb-2 block">
              {tipoMetaFinanceira === 'anual' ? 'Faturamento Anual em:' : 'MRR em:'}
            </label>
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400 font-bold">R$</span>
                <input
                  type="number"
                  value={mrrObjetivo}
                  onChange={(e) => onChange('mrrObjetivo', parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-800 border-2 border-emerald-500/50 focus:border-emerald-500 
                             text-2xl font-black text-center text-emerald-400 rounded-xl p-3 pl-12
                             transition-colors outline-none"
                />
              </div>
              <select
                value={mesObjetivo}
                onChange={(e) => onChange('mesObjetivo', parseInt(e.target.value))}
                className="bg-slate-800 border-2 border-slate-600 focus:border-emerald-500 
                           text-sm text-slate-300 rounded-xl px-3
                           transition-colors outline-none cursor-pointer"
              >
                {MESES.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>
          
          {/* Crescimento MRR */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-slate-800/50 rounded-xl p-3 text-center">
              <div className="text-xs text-slate-500 mb-1">Crescimento</div>
              <div className={`text-lg font-bold ${crescimentoExibido >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {crescimentoExibido >= 0 ? '+' : ''}{formatarMoeda(crescimentoExibido)}
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-3 text-center">
              <div className="text-xs text-slate-500 mb-1">Percentual</div>
              <div className={`text-lg font-bold ${crescimentoExibidoPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {crescimentoExibidoPct >= 0 ? '+' : ''}{crescimentoExibidoPct.toFixed(1)}%
              </div>
            </div>
          </div>
          
          {/* Faturamento Anual Projetado */}
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
            <div className="flex justify-between items-center">
              <div className="text-xs text-emerald-400">
                {tipoMetaFinanceira === 'mensal' ? 'Faturamento Anual Projetado' : 'MRR Mensal Equivalente'}
              </div>
              <div className="text-lg font-bold text-emerald-400">
                {tipoMetaFinanceira === 'mensal' 
                  ? formatarMoeda(faturamentoAnualProjetado)
                  : formatarMoeda(mrrObjetivoMensal)
                }
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Input Alunos (modo original) */}
          <div className="mb-4">
            <label className="text-sm text-slate-400 mb-2 block">Alunos Pagantes em:</label>
            <div className="flex gap-3">
              <input
                type="number"
                value={alunosObjetivo}
                onChange={(e) => onChange('alunosObjetivo', parseInt(e.target.value) || 0)}
                className="flex-1 bg-slate-800 border-2 border-cyan-500/50 focus:border-cyan-500 
                           text-3xl font-black text-center text-cyan-400 rounded-xl p-3
                           transition-colors outline-none"
              />
              <select
                value={mesObjetivo}
                onChange={(e) => onChange('mesObjetivo', parseInt(e.target.value))}
                className="bg-slate-800 border-2 border-slate-600 focus:border-cyan-500 
                           text-sm text-slate-300 rounded-xl px-3
                           transition-colors outline-none cursor-pointer"
              >
                {MESES.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>
          
          {/* Crescimento Alunos */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800/50 rounded-xl p-3 text-center">
              <div className="text-xs text-slate-500 mb-1">Crescimento</div>
              <div className={`text-xl font-bold flex items-center justify-center gap-1 ${isPositivo ? 'text-cyan-400' : 'text-rose-400'}`}>
                {isPositivo ? <TrendingUp className="w-4 h-4" /> : null}
                {isPositivo ? '+' : ''}{crescimentoAlunos}
              </div>
              <div className="text-xs text-slate-500">alunos</div>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-3 text-center">
              <div className="text-xs text-slate-500 mb-1">Percentual</div>
              <div className={`text-xl font-bold ${isPositivo ? 'text-cyan-400' : 'text-rose-400'}`}>
                {isPositivo ? '+' : ''}{crescimentoAlunosPct.toFixed(1)}%
              </div>
              <div className="text-xs text-slate-500">de crescimento</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default MetaObjetivo;
