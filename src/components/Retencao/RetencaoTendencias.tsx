import { TrendingDown, TrendingUp, LineChartIcon } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { useEvasoesData } from '../../hooks/useEvasoesData';
import { UnidadeRetencao } from '../../types/retencao';

interface RetencaoTendenciasProps {
  ano: number;
  unidade: UnidadeRetencao;
}

export function RetencaoTendencias({ ano, unidade }: RetencaoTendenciasProps) {
  const { dadosMensais, loading } = useEvasoesData(ano, unidade);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Calcular tendência
  const calcularTendencia = () => {
    if (dadosMensais.length < 2) return { valor: 0, tipo: 'neutro' };
    const primeiro = dadosMensais[0]?.evasoes || 0;
    const ultimo = dadosMensais[dadosMensais.length - 1]?.evasoes || 0;
    const variacao = ((ultimo - primeiro) / primeiro) * 100;
    return {
      valor: Math.abs(variacao).toFixed(1),
      tipo: variacao > 0 ? 'alta' : variacao < 0 ? 'baixa' : 'neutro',
    };
  };

  const tendencia = calcularTendencia();

  // Encontrar pico
  const picoMes = dadosMensais.reduce((max, item) => 
    item.evasoes > (max?.evasoes || 0) ? item : max, dadosMensais[0]);

  return (
    <div className="min-h-screen p-8 bg-slate-950">
      {/* Header */}
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 bg-rose-500/20 text-rose-400 text-sm font-medium px-3 py-1 rounded-full mb-4">
          <LineChartIcon className="w-4 h-4" /> Tendências
        </span>
        <h1 className="text-4xl lg:text-5xl font-grotesk font-bold text-white mb-2">
          Tendências de <span className="text-rose-400">Evasão</span>
        </h1>
        <p className="text-gray-400">
          Evolução mensal das evasões {unidade !== 'Consolidado' && <span className="text-rose-400">- {unidade}</span>} em {ano}
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rose-500"></div>
        </div>
      )}

      {!loading && (
        <>
          {/* Cards de Insight */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Tendência Geral */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                {tendencia.tipo === 'alta' ? (
                  <TrendingUp className="w-6 h-6 text-red-400" />
                ) : (
                  <TrendingDown className="w-6 h-6 text-green-400" />
                )}
                <h3 className="text-lg font-grotesk font-semibold text-white">Tendência Geral</h3>
              </div>
              <div className={`text-2xl font-grotesk font-bold mb-2 ${
                tendencia.tipo === 'alta' ? 'text-red-400' : 'text-green-400'
              }`}>
                {tendencia.tipo === 'alta' ? '+' : '-'}{tendencia.valor}%
              </div>
              <p className="text-gray-400 text-sm">
                {tendencia.tipo === 'alta' 
                  ? 'Evasões aumentando ao longo do ano' 
                  : 'Evasões diminuindo ao longo do ano'}
              </p>
            </div>

            {/* Mês Crítico */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-6 h-6 rounded-full bg-rose-500/20 flex items-center justify-center">
                  <span className="text-rose-400 text-xs font-bold">!</span>
                </div>
                <h3 className="text-lg font-grotesk font-semibold text-white">Mês Crítico</h3>
              </div>
              <div className="text-2xl font-grotesk font-bold text-rose-400 mb-2">
                {picoMes?.mesAbrev || 'N/A'}
              </div>
              <p className="text-gray-400 text-sm">
                {picoMes?.evasoes || 0} evasões - maior pico do ano
              </p>
            </div>

            {/* MRR Total Perdido */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                  <span className="text-red-400 text-xs font-bold">$</span>
                </div>
                <h3 className="text-lg font-semibold text-white">MRR Perdido no Pico</h3>
              </div>
              <div className="text-2xl font-bold text-red-400 mb-2">
                {formatCurrency(picoMes?.mrrPerdido || 0)}
              </div>
              <p className="text-gray-400 text-sm">
                Receita perdida no mês de maior evasão
              </p>
            </div>
          </div>

          {/* Gráfico de Evasões */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 mb-8">
            <h3 className="text-lg font-semibold text-white mb-6">Evolução Mensal de Evasões</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dadosMensais}>
                  <defs>
                    <linearGradient id="colorEvasoes" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis 
                    dataKey="mesAbrev" 
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8' }}
                  />
                  <YAxis 
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '12px',
                    }}
                    labelStyle={{ color: '#fff' }}
                    itemStyle={{ color: '#fff' }}
                    cursor={{ fill: '#1e293b' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="evasoes"
                    stroke="#f43f5e"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorEvasoes)"
                    name="Evasões"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gráfico de MRR Perdido */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-white mb-6">MRR Perdido por Mês</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dadosMensais}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis 
                    dataKey="mesAbrev" 
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8' }}
                  />
                  <YAxis 
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8' }}
                    tickFormatter={(value) => `R$${(value/1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '12px',
                    }}
                    labelStyle={{ color: '#fff' }}
                    itemStyle={{ color: '#fff' }}
                    formatter={(value: number) => [formatCurrency(value), 'MRR Perdido']}
                    cursor={{ fill: '#1e293b' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="mrrPerdido"
                    stroke="#ef4444"
                    strokeWidth={3}
                    dot={{ fill: '#ef4444', strokeWidth: 2 }}
                    activeDot={{ r: 8, fill: '#ef4444' }}
                    name="MRR Perdido"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
