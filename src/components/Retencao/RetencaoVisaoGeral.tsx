import { Users, DollarSign, TrendingDown, AlertTriangle, Target, UserMinus, RefreshCcw } from 'lucide-react';
import { useEvasoesData } from '../../hooks/useEvasoesData';
import { UnidadeRetencao } from '../../types/retencao';

interface RetencaoVisaoGeralProps {
  ano: number;
  unidade: UnidadeRetencao;
  onAnoChange: (ano: number) => void;
  onUnidadeChange: (unidade: UnidadeRetencao) => void;
}

export function RetencaoVisaoGeral({ ano, unidade, onAnoChange, onUnidadeChange }: RetencaoVisaoGeralProps) {
  const { kpis, dadosPorUnidade, loading } = useEvasoesData(ano, unidade);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const kpiCards = [
    {
      title: 'Total de Evasões',
      value: kpis?.totalEvasoes || 0,
      icon: Users,
      color: 'rose',
      description: 'Alunos que saíram em 2025',
    },
    {
      title: 'MRR Perdido',
      value: formatCurrency(kpis?.mrrPerdidoTotal || 0),
      icon: DollarSign,
      color: 'red',
      description: 'Receita mensal perdida',
    },
    {
      title: 'Churn Médio',
      value: `${kpis?.churnMedio || 0}%`,
      icon: TrendingDown,
      color: 'orange',
      description: 'Taxa média de cancelamento',
    },
    {
      title: 'Ticket Médio Evasão',
      value: formatCurrency(kpis?.ticketMedioEvasao || 0),
      icon: Target,
      color: 'amber',
      description: 'Valor médio por aluno perdido',
    },
    {
      title: 'Interrompidos',
      value: kpis?.totalInterrompidos || 0,
      icon: UserMinus,
      color: 'pink',
      description: 'Cancelamentos durante contrato',
    },
    {
      title: 'Não Renovações',
      value: kpis?.totalNaoRenovacoes || 0,
      icon: RefreshCcw,
      color: 'purple',
      description: 'Não renovaram ao fim do contrato',
    },
  ];

  const getColorClasses = (color: string) => {
    const colors: Record<string, { bg: string; border: string; text: string; icon: string }> = {
      rose: { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-400', icon: 'text-rose-400' },
      red: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', icon: 'text-red-400' },
      orange: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', icon: 'text-orange-400' },
      amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', icon: 'text-amber-400' },
      pink: { bg: 'bg-pink-500/10', border: 'border-pink-500/30', text: 'text-pink-400', icon: 'text-pink-400' },
      purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', icon: 'text-purple-400' },
    };
    return colors[color] || colors.rose;
  };

  return (
    <div className="min-h-screen p-8 bg-slate-950">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Visão Geral</h2>
          <p className="text-gray-400">Panorama completo das evasões em {ano}</p>
        </div>

        {/* Filtros */}
        <div className="flex gap-3">
          <select
            value={ano}
            onChange={(e) => onAnoChange(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500"
          >
            <option value={2025}>2025</option>
            <option value={2024}>2024</option>
          </select>

          <select
            value={unidade}
            onChange={(e) => onUnidadeChange(e.target.value as UnidadeRetencao)}
            className="bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500"
          >
            <option value="Consolidado">Consolidado</option>
            <option value="Campo Grande">Campo Grande</option>
            <option value="Recreio">Recreio</option>
            <option value="Barra">Barra</option>
          </select>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rose-500"></div>
        </div>
      )}

      {/* KPI Cards */}
      {!loading && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {kpiCards.map((kpi, index) => {
              const colors = getColorClasses(kpi.color);
              const Icon = kpi.icon;
              
              return (
                <div
                  key={index}
                  className={`${colors.bg} ${colors.border} border rounded-2xl p-6 hover:scale-[1.02] transition-transform`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-12 h-12 rounded-xl ${colors.bg} flex items-center justify-center`}>
                      <Icon className={`w-6 h-6 ${colors.icon}`} />
                    </div>
                  </div>
                  <div className={`text-3xl font-bold ${colors.text} mb-1`}>
                    {kpi.value}
                  </div>
                  <div className="text-white font-medium mb-1">{kpi.title}</div>
                  <div className="text-gray-400 text-sm">{kpi.description}</div>
                </div>
              );
            })}
          </div>

          {/* Insights */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Motivo Principal */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-orange-400" />
                <h3 className="text-lg font-semibold text-white">Motivo Principal</h3>
              </div>
              <div className="text-2xl font-bold text-orange-400 mb-2">
                {kpis?.motivoPrincipal || 'N/A'}
              </div>
              <p className="text-gray-400 text-sm">
                Principal causa de evasão identificada no período
              </p>
            </div>

            {/* Professor Crítico */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <Users className="w-6 h-6 text-rose-400" />
                <h3 className="text-lg font-semibold text-white">Professor com Mais Evasões</h3>
              </div>
              <div className="text-2xl font-bold text-rose-400 mb-2">
                {kpis?.professorCritico || 'N/A'}
              </div>
              <p className="text-gray-400 text-sm">
                Requer atenção especial e acompanhamento
              </p>
            </div>
          </div>

          {/* Distribuição por Unidade */}
          {unidade === 'Consolidado' && dadosPorUnidade.length > 0 && (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-6">Distribuição por Unidade</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {dadosPorUnidade.map((unidadeData) => (
                  <div
                    key={unidadeData.unidade}
                    className="bg-slate-900/50 border border-slate-700/30 rounded-xl p-4"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: unidadeData.cor }}
                      />
                      <span className="text-white font-medium">{unidadeData.unidade}</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-400 text-sm">Evasões</span>
                        <span className="text-white font-semibold">{unidadeData.totalEvasoes}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400 text-sm">MRR Perdido</span>
                        <span className="text-rose-400 font-semibold">
                          {formatCurrency(unidadeData.mrrPerdido)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
