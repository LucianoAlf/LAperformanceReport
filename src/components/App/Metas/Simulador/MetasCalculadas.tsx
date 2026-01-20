// Componente: Metas Calculadas (prontas para aplicar) - Layout igual wireframe

import { useState } from 'react';
import { CheckCircle2, Save, Rocket, Loader2, RefreshCw, LineChart } from 'lucide-react';
import { ResultadoSimulacao } from '@/lib/simulador/tipos';
import { formatarMoeda, formatarPercentual } from '@/lib/simulador/calculos';

interface MetasCalculadasProps {
  resultado: ResultadoSimulacao;
  salvando: boolean;
  onSalvar: (nome: string, descricao?: string) => Promise<void>;
  onAplicar: () => Promise<void>;
  onRecalcular?: () => void;
  onVerProjecao?: () => void;
}

export function MetasCalculadas({ resultado, salvando, onSalvar, onAplicar, onRecalcular, onVerProjecao }: MetasCalculadasProps) {
  const [showSalvarModal, setShowSalvarModal] = useState(false);
  const [nomeCenario, setNomeCenario] = useState('');
  const [descricaoCenario, setDescricaoCenario] = useState('');

  const handleSalvar = async () => {
    if (!nomeCenario.trim()) return;
    await onSalvar(nomeCenario.trim(), descricaoCenario.trim() || undefined);
    setShowSalvarModal(false);
    setNomeCenario('');
    setDescricaoCenario('');
  };

  const { inputs, leadsMensais, experimentaisMensais, matriculasMensais, mrrProjetado, ltvProjetado } = resultado;

  return (
    <>
      <div className="bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/30 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <h2 className="font-semibold text-white">METAS CALCULADAS</h2>
          <span className="text-xs text-slate-500">(prontas para aplicar)</span>
        </div>
        
        {/* Grid de metas */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          <div className="bg-slate-800/50 rounded-xl p-3 text-center">
            <div className="text-xs text-slate-500 mb-1">Leads/mês</div>
            <div className="text-xl font-bold text-cyan-400">{leadsMensais}</div>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-3 text-center">
            <div className="text-xs text-slate-500 mb-1">Experimentais/mês</div>
            <div className="text-xl font-bold text-violet-400">{experimentaisMensais}</div>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-3 text-center">
            <div className="text-xs text-slate-500 mb-1">Matrículas/mês</div>
            <div className="text-xl font-bold text-emerald-400">{matriculasMensais}</div>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-3 text-center">
            <div className="text-xs text-slate-500 mb-1">Churn máximo</div>
            <div className="text-xl font-bold text-amber-400">{formatarPercentual(inputs.churnProjetado)}</div>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-3 text-center">
            <div className="text-xs text-slate-500 mb-1">Alunos Pagantes</div>
            <div className="text-xl font-bold text-white">{inputs.alunosObjetivo}</div>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-3 text-center">
            <div className="text-xs text-slate-500 mb-1">MRR</div>
            <div className="text-xl font-bold text-amber-400">{formatarMoeda(mrrProjetado)}</div>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-3 text-center">
            <div className="text-xs text-slate-500 mb-1">LTV</div>
            <div className="text-xl font-bold text-cyan-400">{formatarMoeda(ltvProjetado)}</div>
          </div>
        </div>
        
        {/* Botões de ação - Layout igual wireframe */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={onAplicar}
            disabled={salvando}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 
                       text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
            Aplicar Metas
          </button>
          {onRecalcular && (
            <button
              onClick={onRecalcular}
              disabled={salvando}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-600 
                         text-white font-medium rounded-xl transition-colors disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" />
              Recalcular
            </button>
          )}
          {onVerProjecao && (
            <button
              onClick={onVerProjecao}
              disabled={salvando}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-600 
                         text-white font-medium rounded-xl transition-colors disabled:opacity-50"
            >
              <LineChart className="w-4 h-4" />
              Ver Projeção Mensal
            </button>
          )}
          <button
            onClick={() => setShowSalvarModal(true)}
            disabled={salvando}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-600 
                       text-white font-medium rounded-xl transition-colors disabled:opacity-50"
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar Cenário
          </button>
        </div>
      </div>

      {/* Modal de Salvar Cenário */}
      {showSalvarModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">Salvar Cenário</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Nome do cenário *</label>
                <input
                  type="text"
                  value={nomeCenario}
                  onChange={(e) => setNomeCenario(e.target.value)}
                  placeholder="Ex: Cenário Conservador"
                  className="w-full bg-slate-700 border border-slate-600 focus:border-cyan-500 
                             text-white rounded-lg p-3 transition-colors outline-none"
                />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Descrição (opcional)</label>
                <textarea
                  value={descricaoCenario}
                  onChange={(e) => setDescricaoCenario(e.target.value)}
                  placeholder="Descreva as premissas deste cenário..."
                  rows={3}
                  className="w-full bg-slate-700 border border-slate-600 focus:border-cyan-500 
                             text-white rounded-lg p-3 transition-colors outline-none resize-none"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowSalvarModal(false)}
                className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 
                           text-white rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvar}
                disabled={!nomeCenario.trim() || salvando}
                className="flex-1 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 
                           text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default MetasCalculadas;
