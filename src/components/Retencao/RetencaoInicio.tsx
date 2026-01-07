import { TrendingDown, Users, DollarSign, AlertTriangle } from 'lucide-react';
import { useEvasoesData } from '../../hooks/useEvasoesData';

interface RetencaoInicioProps {
  onStart: () => void;
}

export function RetencaoInicio({ onStart }: RetencaoInicioProps) {
  const { kpis, loading } = useEvasoesData(2025, 'Consolidado');

  const formatCurrency = (value: number) => {
    if (value >= 1000) {
      return `R$ ${(value / 1000).toFixed(0)}k`;
    }
    return `R$ ${value.toFixed(0)}`;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 relative overflow-hidden">
      {/* Background decorativo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-rose-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-red-500/5 rounded-full blur-3xl" />
      </div>

      {/* Ícone */}
      <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center mb-8 shadow-lg shadow-rose-500/25 relative z-10">
        <TrendingDown className="w-12 h-12 text-white" />
      </div>

      {/* Título */}
      <h1 className="text-5xl md:text-7xl font-grotesk font-bold text-center mb-4 relative z-10">
        <span className="text-white">RETENÇÃO</span>{' '}
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-red-400">
          2025
        </span>
      </h1>

      <p className="text-xl text-gray-400 text-center mb-12 max-w-2xl relative z-10">
        Análise Completa de Evasão: Entenda por que os alunos saem e como reduzir o churn
      </p>

      {/* KPIs Destaque */}
      <div className="flex flex-wrap justify-center gap-6 mb-12 relative z-10">
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 text-center min-w-[180px] hover:border-rose-500/30 transition-colors">
          <Users className="w-8 h-8 text-rose-400 mx-auto mb-3" />
          <div className="text-3xl font-bold text-white">
            {loading ? '...' : kpis?.totalEvasoes || 0}
          </div>
          <div className="text-sm text-gray-400">Alunos Perdidos</div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 text-center min-w-[180px] hover:border-rose-500/30 transition-colors">
          <DollarSign className="w-8 h-8 text-red-400 mx-auto mb-3" />
          <div className="text-3xl font-bold text-white">
            {loading ? '...' : formatCurrency(kpis?.mrrPerdidoTotal || 0)}
          </div>
          <div className="text-sm text-gray-400">MRR Perdido</div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 text-center min-w-[180px] hover:border-rose-500/30 transition-colors">
          <AlertTriangle className="w-8 h-8 text-orange-400 mx-auto mb-3" />
          <div className="text-3xl font-bold text-white">
            {loading ? '...' : `${kpis?.churnMedio || 0}%`}
          </div>
          <div className="text-sm text-gray-400">Churn Médio</div>
        </div>
      </div>

      {/* Badge */}
      <div className="bg-rose-500/10 border border-rose-500/30 rounded-full px-6 py-2 mb-8 relative z-10">
        <span className="text-rose-400 font-medium">
          🔍 Diagnóstico Completo de Retenção
        </span>
      </div>

      {/* Botão CTA */}
      <button
        onClick={onStart}
        className="group bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 
                   text-white font-semibold text-lg px-8 py-4 rounded-xl
                   shadow-lg shadow-rose-500/25 hover:shadow-rose-500/40
                   transition-all duration-300 flex items-center gap-3 relative z-10"
      >
        Analisar Evasões
        <span className="group-hover:translate-x-1 transition-transform">→</span>
      </button>
    </div>
  );
}
