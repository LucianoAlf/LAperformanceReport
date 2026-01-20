// Componente: Inputs Editáveis (parâmetros do simulador)
// Adapta-se ao tipo de objetivo (destaca Ticket no modo MRR)

import { Settings, TrendingDown, Percent, DollarSign, Star, AlertTriangle } from 'lucide-react';
import { InputsSimulacao, DadosHistoricos, TipoObjetivo } from '@/lib/simulador/tipos';

interface InputsEditaveisProps {
  inputs: InputsSimulacao;
  historico: DadosHistoricos | null;
  tipoObjetivo: TipoObjetivo;
  onChange: <K extends keyof InputsSimulacao>(campo: K, valor: InputsSimulacao[K]) => void;
}

export function InputsEditaveis({ inputs, historico, tipoObjetivo, onChange }: InputsEditaveisProps) {
  const isModeMRR = tipoObjetivo === 'mrr';
  
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center">
          <Settings className="w-4 h-4 text-slate-400" />
        </div>
        <div>
          <h2 className="font-semibold text-white">PARÂMETROS</h2>
          <p className="text-xs text-slate-500">Ajuste os valores para simular diferentes cenários</p>
        </div>
      </div>
      
      <div className={`grid grid-cols-2 md:grid-cols-3 gap-4 ${isModeMRR ? 'lg:grid-cols-6' : 'lg:grid-cols-5'}`}>
        {/* Ticket Médio - em destaque no modo MRR */}
        <div className={isModeMRR ? 'border border-emerald-500/50 rounded-lg p-1' : ''}>
          <label className={`text-xs mb-1 flex items-center gap-1 ${isModeMRR ? 'text-emerald-400 px-1' : 'text-slate-500'}`}>
            {isModeMRR && <Star className="w-3 h-3" />}
            <DollarSign className="w-3 h-3" />
            Ticket Médio
          </label>
          <div className="relative">
            <span className={`absolute left-2 top-1/2 -translate-y-1/2 text-sm ${isModeMRR ? 'text-emerald-400' : 'text-slate-500'}`}>R$</span>
            <input
              type="number"
              step="10"
              min="0"
              value={inputs.ticketMedio}
              onChange={(e) => onChange('ticketMedio', parseFloat(e.target.value) || 0)}
              className={`w-full bg-slate-700 border rounded-lg p-2 pl-8
                         text-lg font-bold text-center transition-colors outline-none
                         ${isModeMRR 
                           ? 'border-emerald-500/30 focus:border-emerald-500 text-emerald-400' 
                           : 'border-slate-600 focus:border-cyan-500 text-white'}`}
            />
          </div>
          {isModeMRR && (
            <div className="text-[10px] text-emerald-400/70 mt-1 text-center px-1">
              Impacta diretamente o MRR
            </div>
          )}
        </div>

        {/* Churn Projetado */}
        <div>
          <label className="text-xs text-slate-500 mb-1 flex items-center gap-1">
            <TrendingDown className="w-3 h-3" />
            Churn Projetado
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.1"
              min="0"
              max="20"
              value={inputs.churnProjetado}
              onChange={(e) => onChange('churnProjetado', parseFloat(e.target.value) || 0)}
              className="w-full bg-slate-700 border border-slate-600 focus:border-cyan-500 
                         text-lg font-bold text-center text-white rounded-lg p-2 pr-6
                         transition-colors outline-none"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500">%</span>
          </div>
          {historico && (
            <div className="text-[10px] text-slate-500 mt-1 text-center">
              Histórico: {historico.churnHistorico?.toFixed(1) || '?'}%
            </div>
          )}
        </div>

        {/* Taxa Lead → Exp */}
        <div>
          <label className="text-xs text-slate-500 mb-1 flex items-center gap-1">
            <Percent className="w-3 h-3" />
            Lead → Exp
          </label>
          <div className="relative">
            <input
              type="number"
              step="5"
              min="0"
              max="100"
              value={inputs.taxaLeadExp}
              onChange={(e) => onChange('taxaLeadExp', parseFloat(e.target.value) || 0)}
              className="w-full bg-slate-700 border border-slate-600 focus:border-cyan-500 
                         text-lg font-bold text-center text-white rounded-lg p-2 pr-6
                         transition-colors outline-none"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500">%</span>
          </div>
          {historico && (
            <div className="text-[10px] text-slate-500 mt-1 text-center">
              Histórico: {historico.taxaConversaoLeadExp.toFixed(1)}%
            </div>
          )}
        </div>

        {/* Taxa Exp → Mat */}
        <div>
          <label className="text-xs text-slate-500 mb-1 flex items-center gap-1">
            <Percent className="w-3 h-3" />
            Exp → Mat
          </label>
          <div className="relative">
            <input
              type="number"
              step="5"
              min="0"
              max="100"
              value={inputs.taxaExpMat}
              onChange={(e) => onChange('taxaExpMat', parseFloat(e.target.value) || 0)}
              className="w-full bg-slate-700 border border-slate-600 focus:border-cyan-500 
                         text-lg font-bold text-center text-white rounded-lg p-2 pr-6
                         transition-colors outline-none"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500">%</span>
          </div>
          {historico && (
            <div className="text-[10px] text-slate-500 mt-1 text-center">
              Histórico: {historico.taxaConversaoExpMat.toFixed(1)}%
            </div>
          )}
        </div>

        {/* Conversão Total (somente leitura) */}
        <div>
          <label className="text-xs text-slate-500 mb-1 flex items-center gap-1">
            <Percent className="w-3 h-3" />
            Conversão Total
          </label>
          <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-2 text-center">
            <span className="text-lg font-bold text-cyan-400">
              {((inputs.taxaLeadExp / 100) * (inputs.taxaExpMat / 100) * 100).toFixed(1)}%
            </span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1 text-center">
            Lead → Matrícula
          </div>
        </div>

        {/* Inadimplência - apenas no modo MRR */}
        {isModeMRR && (
          <div className="border border-amber-500/50 rounded-lg p-1">
            <label className="text-xs text-amber-400 mb-1 flex items-center gap-1 px-1">
              <AlertTriangle className="w-3 h-3" />
              Inadimplência
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.5"
                min="0"
                max="30"
                value={inputs.inadimplenciaPct}
                onChange={(e) => onChange('inadimplenciaPct', parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-700 border border-amber-500/30 focus:border-amber-500 
                           text-lg font-bold text-center text-amber-400 rounded-lg p-2 pr-6
                           transition-colors outline-none"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-400">%</span>
            </div>
            <div className="text-[10px] text-amber-400/70 mt-1 text-center px-1">
              Reduz faturamento realizado
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default InputsEditaveis;
