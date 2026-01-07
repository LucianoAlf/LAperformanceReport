import React from 'react';
import { 
  DollarSign, 
  Clock, 
  Home, 
  ThumbsDown, 
  AlertTriangle, 
  Frown, 
  Heart, 
  UserX, 
  User, 
  ArrowRightLeft, 
  Plane, 
  Building,
  PieChartIcon
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useEvasoesData } from '../../hooks/useEvasoesData';
import { UnidadeRetencao, CORES_MOTIVOS } from '../../types/retencao';

interface RetencaoMotivosProps {
  ano: number;
  unidade: UnidadeRetencao;
}

const ICONES_COMPONENTES: Record<string, React.ComponentType<{ className?: string }>> = {
  'Financeiro': DollarSign,
  'Horário': Clock,
  'Mudança': Home,
  'Desinteresse': ThumbsDown,
  'Inadimplência': AlertTriangle,
  'Insatisfação': Frown,
  'Saúde': Heart,
  'Abandono': UserX,
  'Pessoal': User,
  'Transferência': ArrowRightLeft,
  'Viagem': Plane,
  'Concorrência': Building,
};

export function RetencaoMotivos({ ano, unidade }: RetencaoMotivosProps) {
  const { motivos, loading } = useEvasoesData(ano, unidade);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Dados para o gráfico de pizza
  const dadosPizza = motivos.slice(0, 6).map(m => ({
    name: m.motivo_categoria,
    value: m.quantidade,
    color: CORES_MOTIVOS[m.motivo_categoria] || '#666',
  }));

  // Dados para o gráfico de barras
  const dadosBarras = motivos.map(m => ({
    motivo: m.motivo_categoria,
    quantidade: m.quantidade,
    mrr: m.mrr_perdido,
    fill: CORES_MOTIVOS[m.motivo_categoria] || '#666',
  }));

  return (
    <div className="min-h-screen p-8 bg-slate-950">
      {/* Header */}
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 bg-rose-500/20 text-rose-400 text-sm font-medium px-3 py-1 rounded-full mb-4">
          <PieChartIcon className="w-4 h-4" /> Motivos
        </span>
        <h1 className="text-4xl lg:text-5xl font-grotesk font-bold text-white mb-2">
          Motivos de <span className="text-rose-400">Evasão</span>
        </h1>
        <p className="text-gray-400">
          Análise detalhada das causas de cancelamento {unidade !== 'Consolidado' && <span className="text-rose-400">- {unidade}</span>}
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
          {/* Grid de Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Gráfico de Pizza */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
              <h3 className="text-lg font-grotesk font-semibold text-white mb-6">Distribuição por Motivo</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dadosPizza}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {dadosPizza.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
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
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Legenda */}
              <div className="flex flex-wrap justify-center gap-4 mt-4">
                {dadosPizza.map((item) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-gray-400 text-sm">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Gráfico de Barras */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-6">Quantidade por Motivo</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dadosBarras} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis type="number" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                    <YAxis 
                      type="category" 
                      dataKey="motivo" 
                      stroke="#94a3b8" 
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                      width={100}
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
                    <Bar 
                      dataKey="quantidade" 
                      radius={[0, 4, 4, 0]}
                      name="Evasões"
                    >
                      {dadosBarras.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Cards de Motivos */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-white mb-6">Detalhamento por Motivo</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {motivos.map((motivo) => {
                const Icon = ICONES_COMPONENTES[motivo.motivo_categoria] || AlertTriangle;
                const cor = CORES_MOTIVOS[motivo.motivo_categoria] || '#666';
                
                return (
                  <div
                    key={motivo.motivo_categoria}
                    className="bg-slate-900/50 border border-slate-700/30 rounded-xl p-4 hover:border-rose-500/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div 
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${cor}20` }}
                      >
                        <Icon className="w-5 h-5" style={{ color: cor }} />
                      </div>
                      <div>
                        <div className="text-white font-medium">{motivo.motivo_categoria}</div>
                        <div className="text-gray-400 text-sm">{motivo.percentual.toFixed(1)}% do total</div>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-2xl font-bold text-white">{motivo.quantidade}</div>
                        <div className="text-gray-400 text-xs">evasões</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold text-rose-400">
                          {formatCurrency(motivo.mrr_perdido)}
                        </div>
                        <div className="text-gray-400 text-xs">MRR perdido</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
