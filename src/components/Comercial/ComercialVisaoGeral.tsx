import React from 'react';
import { 
  TrendingUp, 
  Users, 
  Target, 
  Percent, 
  DollarSign, 
  Baby,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3
} from 'lucide-react';
import { useComercialData } from '../../hooks/useComercialData';
import { UnidadeComercial, CORES_UNIDADES } from '../../types/comercial';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartTooltip } from './ChartTooltip';

interface Props {
  ano: number;
  unidade: UnidadeComercial;
  onAnoChange: (ano: number) => void;
  onUnidadeChange: (unidade: UnidadeComercial) => void;
}

export function ComercialVisaoGeral({ ano, unidade, onAnoChange, onUnidadeChange }: Props) {
  const { kpis, dadosPorUnidade, loading, error } = useComercialData(ano, unidade);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
          <span className="text-gray-400">Carregando dados...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-400">
        <div className="text-xl mb-2">❌ Erro ao carregar dados</div>
        <div className="text-sm">{error}</div>
      </div>
    );
  }

  // Dados para o gráfico de pizza
  const pieData = dadosPorUnidade.map(u => ({
    name: u.unidade,
    value: u.novasMatriculas,
    color: CORES_UNIDADES[u.unidade as keyof typeof CORES_UNIDADES] || '#6b7280',
  }));

  const totalMatriculas = dadosPorUnidade.reduce((sum, u) => sum + u.novasMatriculas, 0);

  return (
    <div className="p-8 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 text-sm font-medium px-3 py-1 rounded-full mb-4">
          <BarChart3 className="w-4 h-4" /> Visão Geral
        </span>
        <h1 className="text-4xl font-bold text-white mb-2">
          O Ano de {ano} em <span className="text-emerald-400">Números</span>
        </h1>
        <p className="text-gray-400">
          Performance comercial {unidade === 'Consolidado' ? 'consolidada do Grupo LA Music' : `da unidade ${unidade}`}
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-4 mb-8">
        <div className="flex gap-2 items-center">
          <span className="text-gray-400 text-sm">Ano:</span>
          {[2025].map((y) => (
            <button
              key={y}
              onClick={() => onAnoChange(y)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                ano === y
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-800 text-gray-400 hover:bg-slate-700'
              }`}
            >
              {y}
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-center">
          <span className="text-gray-400 text-sm">Unidade:</span>
          {(['Consolidado', 'Campo Grande', 'Recreio', 'Barra'] as UnidadeComercial[]).map((u) => (
            <button
              key={u}
              onClick={() => onUnidadeChange(u)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                unidade === u
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-800 text-gray-400 hover:bg-slate-700'
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      {kpis && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Total Leads */}
          <KPICard
            icon={TrendingUp}
            iconColor="text-blue-400"
            iconBg="bg-blue-500/20"
            value={kpis.totalLeads.toLocaleString('pt-BR')}
            label="Total de Leads"
          />

          {/* Aulas Experimentais */}
          <KPICard
            icon={Users}
            iconColor="text-cyan-400"
            iconBg="bg-cyan-500/20"
            value={kpis.aulasExperimentais.toLocaleString('pt-BR')}
            label="Aulas Experimentais"
            meta={1000}
            metaLabel="Meta"
          />

          {/* Novas Matrículas */}
          <KPICard
            icon={Target}
            iconColor="text-emerald-400"
            iconBg="bg-emerald-500/20"
            value={kpis.novasMatriculas.toLocaleString('pt-BR')}
            label="Novas Matrículas"
            meta={700}
            metaLabel="Meta"
          />

          {/* Taxa de Conversão */}
          <KPICard
            icon={Percent}
            iconColor="text-purple-400"
            iconBg="bg-purple-500/20"
            value={`${kpis.taxaConversaoTotal.toFixed(1)}%`}
            label="Taxa de Conversão Total"
            meta={10}
            metaLabel="Meta %"
            isPercent
          />

          {/* Taxa Lead→Exp */}
          <KPICard
            icon={TrendingUp}
            iconColor="text-orange-400"
            iconBg="bg-orange-500/20"
            value={`${kpis.taxaLeadExp.toFixed(1)}%`}
            label="Taxa Lead → Experimental"
            meta={15}
            metaLabel="Meta %"
            isPercent
          />

          {/* Taxa Exp→Mat */}
          <KPICard
            icon={Target}
            iconColor="text-green-400"
            iconBg="bg-green-500/20"
            value={`${kpis.taxaExpMat.toFixed(1)}%`}
            label="Taxa Experimental → Matrícula"
            meta={75}
            metaLabel="Meta %"
            isPercent
          />

          {/* Ticket Médio */}
          <KPICard
            icon={DollarSign}
            iconColor="text-yellow-400"
            iconBg="bg-yellow-500/20"
            value={`R$ ${kpis.ticketMedioParcelas.toFixed(0)}`}
            label="Ticket Médio Parcelas"
            meta={400}
            metaLabel="Meta R$"
            isCurrency
          />

          {/* LA Music Kids */}
          <KPICard
            icon={Baby}
            iconColor="text-pink-400"
            iconBg="bg-pink-500/20"
            value={`${kpis.novasMatriculas > 0 
              ? ((kpis.matriculasLAMK / kpis.novasMatriculas) * 100).toFixed(0) 
              : 0}%`}
            label="Matrículas LA Music Kids"
          />
        </div>
      )}

      {/* Gráfico de Distribuição por Unidade */}
      {unidade === 'Consolidado' && dadosPorUnidade.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Donut Chart */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Matrículas por Unidade</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    content={<ChartTooltip suffix=" matrículas" />}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-4">
              {pieData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm text-gray-400">
                    {item.name}: {((item.value / totalMatriculas) * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Tabela Resumo */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Resumo por Unidade</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-gray-400 text-sm border-b border-slate-700">
                    <th className="pb-3">Unidade</th>
                    <th className="pb-3 text-right">Leads</th>
                    <th className="pb-3 text-right">Exp.</th>
                    <th className="pb-3 text-right">Mat.</th>
                    <th className="pb-3 text-right">Conv.</th>
                  </tr>
                </thead>
                <tbody>
                  {dadosPorUnidade.map((u) => (
                    <tr key={u.unidade} className="border-b border-slate-700/50">
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: CORES_UNIDADES[u.unidade as keyof typeof CORES_UNIDADES] }}
                          />
                          <span className="text-white">{u.unidade}</span>
                        </div>
                      </td>
                      <td className="py-3 text-right text-gray-300">{u.totalLeads.toLocaleString('pt-BR')}</td>
                      <td className="py-3 text-right text-gray-300">{u.aulasExperimentais}</td>
                      <td className="py-3 text-right text-gray-300">{u.novasMatriculas}</td>
                      <td className="py-3 text-right">
                        <span className={`font-medium ${
                          u.taxaConversaoTotal >= 10 ? 'text-green-400' :
                          u.taxaConversaoTotal >= 8 ? 'text-yellow-400' :
                          'text-red-400'
                        }`}>
                          {u.taxaConversaoTotal.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Componente de Card KPI
interface KPICardProps {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  value: string;
  label: string;
  meta?: number;
  metaLabel?: string;
  isPercent?: boolean;
  isCurrency?: boolean;
}

function KPICard({ icon: Icon, iconColor, iconBg, value, label, meta, metaLabel, isPercent, isCurrency }: KPICardProps) {
  const numericValue = parseFloat(value.replace(/[^0-9.,]/g, '').replace(',', '.'));
  const atingimento = meta ? (numericValue / meta) * 100 : null;
  
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 hover:border-slate-600/50 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 ${iconBg} rounded-xl`}>
          <Icon className={`w-6 h-6 ${iconColor}`} />
        </div>
        {atingimento !== null && (
          <div className={`flex items-center gap-1 text-sm ${
            atingimento >= 100 ? 'text-green-400' :
            atingimento >= 80 ? 'text-yellow-400' :
            'text-red-400'
          }`}>
            {atingimento >= 100 ? (
              <ArrowUpRight className="w-4 h-4" />
            ) : (
              <ArrowDownRight className="w-4 h-4" />
            )}
            {atingimento.toFixed(0)}%
          </div>
        )}
      </div>
      <div className="text-3xl font-bold text-white mb-1">{value}</div>
      <div className="text-sm text-gray-400">{label}</div>
      {meta && metaLabel && (
        <div className="mt-2 text-xs text-gray-500">
          Meta: {isCurrency ? 'R$ ' : ''}{meta}{isPercent ? '%' : ''}
        </div>
      )}
    </div>
  );
}

export default ComercialVisaoGeral;
