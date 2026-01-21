// Componente: Parâmetros da Simulação
// Permite editar média atual, ticket médio, número de alunos e custos fixos

import { Settings, Users, DollarSign, TrendingUp, Building2 } from 'lucide-react';
import { InputsSimuladorTurma } from '@/lib/simulador-turma/tipos';

interface ParametrosSimulacaoProps {
  inputs: InputsSimuladorTurma;
  onChangeInput: <K extends keyof InputsSimuladorTurma>(key: K, value: InputsSimuladorTurma[K]) => void;
  temDadosReais?: boolean; // Se há dados reais do banco
}

export function ParametrosSimulacao({
  inputs,
  onChangeInput,
  temDadosReais = false,
}: ParametrosSimulacaoProps) {
  return (
    <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-white">
          <Settings className="w-5 h-5 text-cyan-400" />
          Parâmetros da Simulação
        </h2>
        {temDadosReais && (
          <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full">
            Dados reais carregados
          </span>
        )}
        {!temDadosReais && (
          <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded-full">
            Modo simulação
          </span>
        )}
      </div>

      <p className="text-sm text-slate-400 mb-6">
        Edite os valores abaixo para simular diferentes cenários
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Média Atual */}
        <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-rose-400" />
            <label className="text-sm text-slate-400">Média Atual</label>
          </div>
          <input
            type="number"
            min="1.0"
            max="3.0"
            step="0.1"
            value={Number(inputs.mediaAtual.toFixed(1))}
            onChange={(e) => onChangeInput('mediaAtual', Number(e.target.value))}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-lg font-semibold focus:outline-none focus:border-cyan-500 transition-colors"
          />
          <p className="text-xs text-slate-500 mt-1">Alunos/turma</p>
        </div>

        {/* Ticket Médio */}
        <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <label className="text-sm text-slate-400">Ticket Médio</label>
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
            <input
              type="number"
              min="0"
              step="10"
              value={Math.round(inputs.ticketMedio)}
              onChange={(e) => onChangeInput('ticketMedio', Number(e.target.value))}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg pl-10 pr-3 py-2 text-white text-lg font-semibold focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>
          <p className="text-xs text-slate-500 mt-1">Mensalidade média</p>
        </div>

        {/* Número de Alunos */}
        <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <label className="text-sm text-slate-400">Nº de Alunos</label>
          </div>
          <input
            type="number"
            min="1"
            step="1"
            value={inputs.totalAlunos}
            onChange={(e) => onChangeInput('totalAlunos', Number(e.target.value))}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-lg font-semibold focus:outline-none focus:border-cyan-500 transition-colors"
          />
          <p className="text-xs text-slate-500 mt-1">Total de alunos</p>
        </div>

        {/* Custos Fixos */}
        <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-4 h-4 text-amber-400" />
            <label className="text-sm text-slate-400">Custos Fixos</label>
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
            <input
              type="number"
              min="0"
              step="100"
              value={inputs.custosFixos}
              onChange={(e) => onChangeInput('custosFixos', Number(e.target.value))}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg pl-10 pr-3 py-2 text-white text-lg font-semibold focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>
          <p className="text-xs text-slate-500 mt-1">Aluguel, admin, etc</p>
        </div>
      </div>

      {/* Resumo calculado */}
      <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">MRR Projetado:</span>
          <span className="text-white font-semibold">
            R$ {(inputs.totalAlunos * inputs.ticketMedio).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>
        {inputs.custosFixos > 0 && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">(-) Custos Fixos:</span>
              <span className="text-amber-400 font-semibold">
                -R$ {inputs.custosFixos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm border-t border-slate-700/50 pt-2">
              <span className="text-slate-400">Lucro Líquido Projetado:</span>
              <span className="text-emerald-400 font-bold text-lg">
                R$ {((inputs.totalAlunos * inputs.ticketMedio) - inputs.custosFixos).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
