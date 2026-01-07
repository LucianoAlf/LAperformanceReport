import { Users, DollarSign, TrendingDown, AlertTriangle, Target, UserMinus, RefreshCcw, FileText, CheckCircle, Percent, XCircle, BarChart3 } from 'lucide-react';
import { useEvasoesData } from '../../hooks/useEvasoesData';
import { useProfessoresPerformance } from '../../hooks/useProfessoresPerformance';
import { UnidadeRetencao } from '../../types/retencao';

interface RetencaoVisaoGeralProps {
  ano: number;
  unidade: UnidadeRetencao;
  onAnoChange: (ano: number) => void;
  onUnidadeChange: (unidade: UnidadeRetencao) => void;
}

export function RetencaoVisaoGeral({ ano, unidade, onAnoChange, onUnidadeChange }: RetencaoVisaoGeralProps) {
  const { kpis, dadosPorUnidade, loading } = useEvasoesData(ano, unidade);
  const { totais: totaisPerformance, loading: loadingPerformance } = useProfessoresPerformance(ano, unidade === 'Consolidado' ? undefined : unidade);

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
      blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', icon: 'text-blue-400' },
      green: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', icon: 'text-green-400' },
      emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', icon: 'text-emerald-400' },
    };
    return colors[color] || colors.rose;
  };

  // KPIs de Renovação
  const renovacaoCards = totaisPerformance ? [
    {
      title: 'Contratos Vencidos',
      value: totaisPerformance.contratos_vencer.toLocaleString('pt-BR'),
      icon: FileText,
      color: 'blue',
      description: 'Total de contratos que venceram',
    },
    {
      title: 'Renovados',
      value: totaisPerformance.renovacoes.toLocaleString('pt-BR'),
      icon: CheckCircle,
      color: 'green',
      description: 'Contratos que renovaram',
    },
    {
      title: 'Taxa de Renovação',
      value: `${totaisPerformance.taxa_renovacao.toFixed(1)}%`,
      icon: Percent,
      color: 'emerald',
      description: 'Percentual de renovação',
    },
    {
      title: 'Não Renovaram',
      value: totaisPerformance.nao_renovados.toLocaleString('pt-BR'),
      icon: XCircle,
      color: 'rose',
      description: 'Contratos perdidos',
    },
  ] : [];

  return (
    <div className="min-h-screen p-8 bg-slate-950">
      {/* Header */}
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 bg-rose-500/20 text-rose-400 text-sm font-medium px-3 py-1 rounded-full mb-4">
          <BarChart3 className="w-4 h-4" /> Visão Geral
        </span>
        <h1 className="text-4xl lg:text-5xl font-grotesk font-bold text-white mb-2">
          Análise de <span className="text-rose-400">Retenção</span>
        </h1>
        <p className="text-gray-400">
          Panorama completo das evasões {unidade === 'Consolidado' ? 'do Grupo LA Music' : `da unidade ${unidade}`} em {ano}
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-4 mb-8">
        <div className="flex gap-2 items-center">
          <span className="text-gray-400 text-sm">Ano:</span>
          {[2025, 2024].map((y) => (
            <button
              key={y}
              onClick={() => onAnoChange(y)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                ano === y
                  ? 'bg-rose-500 text-white'
                  : 'bg-slate-800 text-gray-400 hover:bg-slate-700'
              }`}
            >
              {y}
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-center">
          <span className="text-gray-400 text-sm">Unidade:</span>
          {(['Consolidado', 'Campo Grande', 'Recreio', 'Barra'] as UnidadeRetencao[]).map((u) => (
            <button
              key={u}
              onClick={() => onUnidadeChange(u)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                unidade === u
                  ? 'bg-rose-500 text-white'
                  : 'bg-slate-800 text-gray-400 hover:bg-slate-700'
              }`}
            >
              {u === 'Campo Grande' ? 'C. Grande' : u}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {(loading || loadingPerformance) && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rose-500"></div>
        </div>
      )}

      {/* KPI Cards */}
      {!loading && !loadingPerformance && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {kpiCards.map((kpi, index) => {
              const colors = getColorClasses(kpi.color);
              const Icon = kpi.icon;
              
              return (
                <div
                  key={index}
                  className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 hover:border-slate-600/50 transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 ${colors.bg} rounded-xl`}>
                      <Icon className={`w-6 h-6 ${colors.icon}`} />
                    </div>
                  </div>
                  <div className="text-4xl font-grotesk font-bold text-white mb-1">
                    {kpi.value}
                  </div>
                  <div className="text-sm text-gray-400">{kpi.title}</div>
                </div>
              );
            })}
          </div>

          {/* KPIs de Renovação */}
          {renovacaoCards.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg font-grotesk font-semibold text-white mb-4 flex items-center gap-2">
                <RefreshCcw className="w-5 h-5 text-emerald-400" />
                Indicadores de Renovação
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {renovacaoCards.map((kpi, index) => {
                  const colors = getColorClasses(kpi.color);
                  const Icon = kpi.icon;
                  
                  return (
                    <div
                      key={index}
                      className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5 hover:border-slate-600/50 transition-all"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className={`p-2.5 ${colors.bg} rounded-xl`}>
                          <Icon className={`w-5 h-5 ${colors.icon}`} />
                        </div>
                      </div>
                      <div className="text-2xl font-grotesk font-bold text-white mb-1">
                        {kpi.value}
                      </div>
                      <div className="text-sm text-gray-400">{kpi.title}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Insights */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Motivo Principal */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-orange-400" />
                <h3 className="text-lg font-semibold text-white">Motivo Principal</h3>
              </div>
              <div className="text-2xl font-grotesk font-bold text-orange-400 mb-2">
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
              <div className="text-2xl font-grotesk font-bold text-rose-400 mb-2">
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
              <h3 className="text-lg font-grotesk font-semibold text-white mb-6">Distribuição por Unidade</h3>
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
