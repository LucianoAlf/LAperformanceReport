import { useOrigemData } from '../../hooks/useOrigemData';
import { Smartphone, TrendingUp, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { ChartTooltip } from './ChartTooltip';

export function ComercialOrigem() {
  const { origem, loading } = useOrigemData(2025, 'Consolidado');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-cyan"></div>
      </div>
    );
  }

  const totalLeads = origem.reduce((sum, o) => sum + o.leads, 0);
  const cores = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6'];

  const pieData = origem.slice(0, 6).map((o) => ({
    name: o.canal,
    value: o.leads,
  }));

  return (
    <div className="p-8 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <span className="inline-block bg-accent-cyan/20 text-accent-cyan text-sm font-medium px-3 py-1 rounded-full mb-4">
          📱 Origem dos Leads
        </span>
        <h1 className="text-4xl font-bold text-white mb-2">
          De Onde Vêm os <span className="text-accent-cyan">Leads</span>
        </h1>
        <p className="text-gray-400">
          Análise de canais de aquisição e taxa de conversão
        </p>
      </div>

      {/* Cards de Insight */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Melhor Canal (Volume) */}
        <div className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-blue-500/20 rounded-xl">
              <Smartphone className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <div className="text-blue-400 font-medium">Maior Volume</div>
              <div className="text-sm text-gray-400">Canal que mais gera leads</div>
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">{origem[0]?.canal}</div>
          <div className="text-2xl font-bold text-blue-400">
            {origem[0]?.leads.toLocaleString('pt-BR')} leads
          </div>
          <div className="text-sm text-gray-400 mt-2">
            {((origem[0]?.leads / totalLeads) * 100).toFixed(1)}% do total
          </div>
        </div>

        {/* Segundo Maior Canal */}
        <div className="bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-emerald-500/20 rounded-xl">
              <TrendingUp className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="text-emerald-400 font-medium">Segundo Maior</div>
              <div className="text-sm text-gray-400">Canal com potencial</div>
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">{origem[1]?.canal}</div>
          <div className="text-2xl font-bold text-emerald-400">
            {origem[1]?.leads.toLocaleString('pt-BR')} leads
          </div>
          <div className="text-sm text-gray-400 mt-2">
            {origem[1]?.percentual.toFixed(1)}% do total
          </div>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Pizza - Distribuição */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Distribuição de Leads por Canal</h3>
          <div className="h-[350px]">
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
                  label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                >
                  {pieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={cores[index % cores.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  content={<ChartTooltip suffix=" leads" />}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Barras - Volume */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Volume de Leads por Canal</h3>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={origem.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis type="number" stroke="#94a3b8" />
                <YAxis 
                  dataKey="canal" 
                  type="category" 
                  stroke="#94a3b8" 
                  width={90}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip 
                  content={<ChartTooltip suffix=" Leads" />}
                />
                <Bar dataKey="leads" radius={[0, 4, 4, 0]}>
                  {origem.slice(0, 8).map((_, index) => (
                    <Cell key={`cell-${index}`} fill={cores[index % cores.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tabela Completa */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 mb-8">
        <h3 className="text-lg font-semibold text-white mb-6">Análise Completa por Canal</h3>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-gray-400 text-sm font-medium py-3 px-4">Canal</th>
                <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Leads</th>
                <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">% do Total</th>
              </tr>
            </thead>
            <tbody>
              {origem.map((o, idx) => (
                <tr key={o.canal} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: cores[idx % cores.length] }}
                      />
                      <span className="text-white font-medium">{o.canal}</span>
                    </div>
                  </td>
                  <td className="text-right py-3 px-4 text-white">{o.leads.toLocaleString('pt-BR')}</td>
                  <td className="text-right py-3 px-4 text-gray-400">
                    {o.percentual.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Insight */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5" />
          <div>
            <div className="text-amber-400 font-medium mb-1">Concentração de Canais</div>
            <p className="text-gray-300 text-sm">
              <strong>Instagram</strong> gera {origem.find(o => o.canal === 'Instagram')?.percentual.toFixed(0) || 0}% dos leads - 
              alta dependência de um único canal.
              <br />
              <strong>Indicação</strong> representa apenas {origem.find(o => o.canal === 'Indicação')?.percentual.toFixed(1) || 0}% mas 
              historicamente tem maior taxa de conversão.
              <br />
              <span className="text-gray-400">
                Ação: Diversificar canais de aquisição e criar programa de indicação estruturado.
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ComercialOrigem;
