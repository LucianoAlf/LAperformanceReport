// Componente: Projeção de Lucro
// Mostra MRR, Lucro Bruto e Lucro Líquido comparando situação atual vs meta

import { Wallet, TrendingUp, ArrowRight } from 'lucide-react';
import { ResultadoSimuladorTurma } from '@/lib/simulador-turma/tipos';

interface ProjecaoLucroProps {
  resultado: ResultadoSimuladorTurma;
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function ProjecaoLucro({ resultado }: ProjecaoLucroProps) {
  const temCustosFixos = resultado.custosFixos > 0;
  
  return (
    <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
        <Wallet className="w-5 h-5 text-emerald-400" />
        Projeção de Lucro
      </h2>

      <p className="text-sm text-slate-400 mb-6">
        Comparativo de lucro entre situação atual e meta projetada
      </p>

      {/* Grid de comparação */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Situação Atual */}
        <div className="bg-slate-900/50 border border-rose-500/30 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full bg-rose-500" />
            <h3 className="font-semibold text-rose-400">Situação Atual</h3>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">MRR</span>
              <span className="font-semibold text-white">{formatarMoeda(resultado.mrrTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">(-) Folha</span>
              <span className="font-semibold text-rose-400">-{formatarMoeda(resultado.folhaAtual)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-700 pt-2">
              <span className="text-slate-400 text-sm">Lucro Bruto</span>
              <span className="font-bold text-white">{formatarMoeda(resultado.lucroBrutoAtual)}</span>
            </div>
            {temCustosFixos && (
              <>
                <div className="flex justify-between">
                  <span className="text-slate-400 text-sm">(-) Custos Fixos</span>
                  <span className="font-semibold text-amber-400">-{formatarMoeda(resultado.custosFixos)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-700 pt-2">
                  <span className="text-slate-400 text-sm">Lucro Líquido</span>
                  <span className={`font-bold text-lg ${resultado.lucroLiquidoAtual >= 0 ? 'text-white' : 'text-rose-400'}`}>
                    {formatarMoeda(resultado.lucroLiquidoAtual)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Seta de transição */}
        <div className="hidden md:flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <ArrowRight className="w-8 h-8 text-cyan-400" />
            <span className="text-xs text-slate-400">Transição</span>
          </div>
        </div>

        {/* Meta Projetada */}
        <div className="bg-slate-900/50 border border-emerald-500/30 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <h3 className="font-semibold text-emerald-400">Meta Projetada</h3>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">MRR</span>
              <span className="font-semibold text-white">{formatarMoeda(resultado.mrrTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">(-) Folha</span>
              <span className="font-semibold text-emerald-400">-{formatarMoeda(resultado.folhaMeta)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-700 pt-2">
              <span className="text-slate-400 text-sm">Lucro Bruto</span>
              <span className="font-bold text-white">{formatarMoeda(resultado.lucroBrutoMeta)}</span>
            </div>
            {temCustosFixos && (
              <>
                <div className="flex justify-between">
                  <span className="text-slate-400 text-sm">(-) Custos Fixos</span>
                  <span className="font-semibold text-amber-400">-{formatarMoeda(resultado.custosFixos)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-700 pt-2">
                  <span className="text-slate-400 text-sm">Lucro Líquido</span>
                  <span className={`font-bold text-lg ${resultado.lucroLiquidoMeta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {formatarMoeda(resultado.lucroLiquidoMeta)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Cards de Ganho de Lucro */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
          <p className="text-sm text-emerald-400 mb-1">Ganho de Lucro Bruto</p>
          <p className="text-3xl font-bold text-emerald-400">
            +{formatarMoeda(resultado.ganhoLucroBruto)}
          </p>
          <p className="text-xs text-slate-400 mt-1">/mês</p>
        </div>
        
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
          <p className="text-sm text-emerald-400 mb-1">Ganho Anual</p>
          <p className="text-3xl font-bold text-emerald-400">
            +{formatarMoeda(resultado.ganhoLucroBruto * 12)}
          </p>
          <p className="text-xs text-slate-400 mt-1">/ano</p>
        </div>
      </div>

      {/* Alerta sobre custos fixos */}
      {!temCustosFixos && (
        <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <p className="text-sm text-amber-400">
            💡 <strong>Dica:</strong> Adicione os custos fixos nos parâmetros acima para ver o lucro líquido projetado
          </p>
        </div>
      )}
    </section>
  );
}
