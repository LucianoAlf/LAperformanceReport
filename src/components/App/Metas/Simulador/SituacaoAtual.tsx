// Componente: Situação Atual da Unidade
// Adapta-se ao tipo de objetivo selecionado (Alunos ou MRR)

import { useState } from 'react';
import { BarChart3, Edit3, Check, X } from 'lucide-react';
import { DadosHistoricos, TipoObjetivo } from '@/lib/simulador/tipos';
import { formatarMoeda, formatarPercentual } from '@/lib/simulador/calculos';

interface SituacaoAtualProps {
  historico: DadosHistoricos | null;
  ano: number;
  mes: number;
  unidadeNome?: string;
  tipoObjetivo: TipoObjetivo;
  // Alunos Pagantes (único dado do banco, mas editável)
  alunosAtual: number;
  ticketMedio: number;
  onChangeAlunosAtual: (valor: number) => void;
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function SituacaoAtual({ 
  historico, 
  ano, 
  mes,
  unidadeNome,
  tipoObjetivo,
  alunosAtual,
  ticketMedio,
  onChangeAlunosAtual,
}: SituacaoAtualProps) {
  const [editando, setEditando] = useState(false);
  const [tempAlunos, setTempAlunos] = useState(alunosAtual);

  const iniciarEdicao = () => {
    setTempAlunos(alunosAtual);
    setEditando(true);
  };

  const salvarEdicao = () => {
    onChangeAlunosAtual(tempAlunos);
    setEditando(false);
  };

  const cancelarEdicao = () => {
    setEditando(false);
  };

  // MRR calculado automaticamente
  const mrr = alunosAtual * ticketMedio;
  const faturamentoAnual = mrr * 12;

  // Cores baseadas no tipo de objetivo
  const corDestaque = tipoObjetivo === 'mrr' ? 'emerald' : 'cyan';

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg bg-${corDestaque}-500/20 flex items-center justify-center`}>
            <BarChart3 className={`w-4 h-4 text-${corDestaque}-400`} />
          </div>
          <div>
            <h2 className="font-semibold text-white">SITUAÇÃO ATUAL</h2>
            <p className="text-xs text-amber-400">{unidadeNome} • {MESES[mes - 1]}/{ano}</p>
          </div>
        </div>
        
        {/* Botão de edição */}
        {!editando ? (
          <button
            onClick={iniciarEdicao}
            className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-slate-400 hover:text-white transition-colors"
            title="Editar alunos pagantes"
          >
            <Edit3 className="w-4 h-4" />
          </button>
        ) : (
          <div className="flex gap-1">
            <button
              onClick={salvarEdicao}
              className="p-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 transition-colors"
              title="Salvar"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={cancelarEdicao}
              className="p-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 transition-colors"
              title="Cancelar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
      
      {/* Modo MRR: MRR em destaque primeiro */}
      {tipoObjetivo === 'mrr' ? (
        <>
          {/* MRR Atual - em destaque */}
          <div className="bg-slate-700/30 rounded-xl p-4 mb-3">
            <div className="text-xs text-slate-500 mb-1">MRR Atual</div>
            <div className="text-3xl font-bold text-emerald-400">{formatarMoeda(mrr)}</div>
            <div className="text-xs text-slate-500 mt-1">Puxado do banco</div>
          </div>
          
          {/* Alunos e Ticket lado a lado */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-slate-700/30 rounded-xl p-3">
              <div className="text-xs text-slate-500 mb-1">Alunos Pagantes</div>
              <div className="text-lg font-bold text-white">{alunosAtual}</div>
            </div>
            <div className="bg-slate-700/30 rounded-xl p-3">
              <div className="text-xs text-slate-500 mb-1">Ticket Médio</div>
              <div className="text-lg font-bold text-white">{formatarMoeda(ticketMedio)}</div>
            </div>
          </div>
          
          {/* Faturamento Anual */}
          <div className="bg-slate-700/30 rounded-xl p-3">
            <div className="text-xs text-slate-500 mb-1">Faturamento Anual Atual</div>
            <div className="text-lg font-bold text-white">{formatarMoeda(faturamentoAnual)}</div>
            <div className="text-xs text-slate-500">MRR × 12</div>
          </div>
        </>
      ) : (
        <>
          {/* Modo Alunos: Alunos em destaque primeiro */}
          <div className="bg-slate-700/30 rounded-xl p-4 mb-4">
            <div className="text-xs text-slate-500 mb-1">Alunos Pagantes</div>
            {editando ? (
              <input
                type="number"
                value={tempAlunos}
                onChange={(e) => setTempAlunos(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-600/50 border border-slate-500 rounded-lg px-3 py-2 text-3xl font-bold text-white focus:outline-none focus:border-cyan-500"
                autoFocus
              />
            ) : (
              <div className="text-3xl font-bold text-white">{alunosAtual}</div>
            )}
            <div className="text-xs text-slate-500 mt-1">Puxado do banco (editável para simulação)</div>
          </div>
          
          {/* MRR Atual - calculado */}
          <div className="bg-slate-700/30 rounded-xl p-4">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-xs text-slate-500 mb-1">MRR Atual</div>
                <div className="text-2xl font-bold text-emerald-400">{formatarMoeda(mrr)}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">Ticket × Alunos</div>
                <div className="text-sm text-slate-400">{formatarMoeda(ticketMedio)} × {alunosAtual}</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Histórico */}
      {historico && historico.mesesAnalisados > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-700/50">
          <div className="text-xs text-slate-500 mb-2">Médias históricas ({historico.mesesAnalisados} meses)</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="text-center">
              <div className="text-slate-400">Matrículas</div>
              <div className="text-white font-medium">{historico.mediaMatriculas}/mês</div>
            </div>
            <div className="text-center">
              <div className="text-slate-400">Leads</div>
              <div className="text-white font-medium">{historico.mediaLeads}/mês</div>
            </div>
            <div className="text-center">
              <div className="text-slate-400">Conversão</div>
              <div className="text-white font-medium">{formatarPercentual(historico.taxaConversaoTotal)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SituacaoAtual;
