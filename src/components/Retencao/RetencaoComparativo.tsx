import { GitCompare, TrendingDown, DollarSign, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { useEvasoesData } from '../../hooks/useEvasoesData';

interface RetencaoComparativoProps {
  ano: number;
}

export function RetencaoComparativo({ ano }: RetencaoComparativoProps) {
  const { dadosPorUnidade: dadosCG } = useEvasoesData(ano, 'Campo Grande');
  const { dadosPorUnidade: dadosRecreioBruto } = useEvasoesData(ano, 'Recreio');
  const { dadosPorUnidade: dadosBarraBruto } = useEvasoesData(ano, 'Barra');
  const { dadosPorUnidade, loading } = useEvasoesData(ano, 'Consolidado');

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Dados para gráfico de barras comparativo
  const dadosBarras = dadosPorUnidade.map(u => ({
    unidade: u.unidade,
    evasoes: u.totalEvasoes,
    mrrPerdido: u.mrrPerdido / 1000, // Em milhares
    fill: u.cor,
  }));

  // Dados para radar chart
  const maxEvasoes = Math.max(...dadosPorUnidade.map(u => u.totalEvasoes), 1);
  const maxMRR = Math.max(...dadosPorUnidade.map(u => u.mrrPerdido), 1);
  
  const dadosRadar = [
    {
      metrica: 'Evasões',
      'Campo Grande': (dadosPorUnidade.find(u => u.unidade === 'Campo Grande')?.totalEvasoes || 0) / maxEvasoes * 100,
      'Recreio': (dadosPorUnidade.find(u => u.unidade === 'Recreio')?.totalEvasoes || 0) / maxEvasoes * 100,
      'Barra': (dadosPorUnidade.find(u => u.unidade === 'Barra')?.totalEvasoes || 0) / maxEvasoes * 100,
    },
    {
      metrica: 'MRR Perdido',
      'Campo Grande': (dadosPorUnidade.find(u => u.unidade === 'Campo Grande')?.mrrPerdido || 0) / maxMRR * 100,
      'Recreio': (dadosPorUnidade.find(u => u.unidade === 'Recreio')?.mrrPerdido || 0) / maxMRR * 100,
      'Barra': (dadosPorUnidade.find(u => u.unidade === 'Barra')?.mrrPerdido || 0) / maxMRR * 100,
    },
  ];

  // Calcular totais
  const totalEvasoes = dadosPorUnidade.reduce((sum, u) => sum + u.totalEvasoes, 0);
  const totalMRR = dadosPorUnidade.reduce((sum, u) => sum + u.mrrPerdido, 0);

  return (
    <div className="min-h-screen p-8 bg-slate-950">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Comparativo entre Unidades</h2>
        <p className="text-gray-400">Análise comparativa de evasões por unidade em {ano}</p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rose-500"></div>
        </div>
      )}

      {!loading && (
        <>
          {/* Cards de Unidades */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {dadosPorUnidade.map((unidadeData) => {
              const percentual = totalEvasoes > 0 ? ((unidadeData.totalEvasoes / totalEvasoes) * 100).toFixed(1) : 0;
              
              return (
                <div
                  key={unidadeData.unidade}
                  className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 hover:border-rose-500/30 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: unidadeData.cor }}
                    />
                    <h3 className="text-lg font-semibold text-white">{unidadeData.unidade}</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-400 text-sm">Evasões</span>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-bold text-white">{unidadeData.totalEvasoes}</span>
                        <span className="text-gray-400 text-sm ml-2">({percentual}%)</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-400 text-sm">MRR Perdido</span>
                      </div>
                      <span className="text-xl font-semibold text-rose-400">
                        {formatCurrency(unidadeData.mrrPerdido)}
                      </span>
                    </div>
                    
                    {/* Barra de progresso */}
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          width: `${percentual}%`,
                          backgroundColor: unidadeData.cor,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Gráfico de Barras */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-6">Evasões por Unidade</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dadosBarras}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="unidade" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                    <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '12px',
                      }}
                      labelStyle={{ color: '#fff' }}
                      cursor={{ fill: '#1e293b' }}
                    />
                    <Bar dataKey="evasoes" name="Evasões" radius={[4, 4, 0, 0]}>
                      {dadosBarras.map((entry, index) => (
                        <Bar key={`bar-${index}`} dataKey="evasoes" fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Radar Chart */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-6">Comparativo Radar</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={dadosRadar}>
                    <PolarGrid stroke="#334155" />
                    <PolarAngleAxis dataKey="metrica" tick={{ fill: '#94a3b8' }} />
                    <PolarRadiusAxis tick={{ fill: '#94a3b8' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '12px',
                      }}
                      cursor={{ fill: '#1e293b' }}
                    />
                    <Radar name="Campo Grande" dataKey="Campo Grande" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.3} />
                    <Radar name="Recreio" dataKey="Recreio" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
                    <Radar name="Barra" dataKey="Barra" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Resumo Consolidado */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <GitCompare className="w-6 h-6 text-rose-400" />
              <h3 className="text-lg font-semibold text-white">Resumo Consolidado</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="text-4xl font-bold text-white mb-2">{totalEvasoes}</div>
                <div className="text-gray-400">Total de Evasões</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-rose-400 mb-2">{formatCurrency(totalMRR)}</div>
                <div className="text-gray-400">MRR Total Perdido</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-orange-400 mb-2">
                  {totalEvasoes > 0 ? formatCurrency(totalMRR / totalEvasoes) : 'R$ 0'}
                </div>
                <div className="text-gray-400">Ticket Médio por Evasão</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
