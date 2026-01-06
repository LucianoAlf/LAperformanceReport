import { useCursosData } from '../../hooks/useCursosData';
import { Music, Mic } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChartTooltip } from './ChartTooltip';

export function ComercialCursos() {
  const { cursos, loading } = useCursosData(2025, 'Consolidado');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-cyan"></div>
      </div>
    );
  }

  const top10 = cursos.slice(0, 10);
  const total = cursos.reduce((sum, c) => sum + c.total, 0);
  
  const cores = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#6366f1', '#84cc16', '#f97316'];

  // Separar cursos Kids vs Adultos
  const cursosKids = ['Musicalização', 'Musicalização Bebê', 'Musicalização Bebês', 'Musicalização Infantil', 'Musicalização Preparatória'];
  const totalKids = cursos
    .filter(c => cursosKids.some(k => c.curso.includes(k) || c.curso.includes('Bebê') || c.curso.includes('Preparatória') || c.curso.includes('Infantil')))
    .reduce((sum, c) => sum + c.total, 0);
  const totalAdultos = total - totalKids;

  const pieData = top10.map((c) => ({
    name: c.curso,
    value: c.total,
  }));

  return (
    <div className="p-8 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <span className="inline-block bg-accent-cyan/20 text-accent-cyan text-sm font-medium px-3 py-1 rounded-full mb-4">
          🎸 Cursos Matriculados
        </span>
        <h1 className="text-4xl font-bold text-white mb-2">
          Cursos Mais <span className="text-accent-cyan">Procurados</span>
        </h1>
        <p className="text-gray-400">
          Distribuição de matrículas por instrumento/curso em 2025
        </p>
      </div>

      {/* Cards LA Music vs Kids */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-blue-500/20 rounded-xl">
              <Mic className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <div className="text-blue-400 font-medium">Escola de Música LA</div>
              <div className="text-sm text-gray-400">12 anos em diante</div>
            </div>
          </div>
          <div className="text-4xl font-bold text-white mb-2">{totalAdultos}</div>
          <div className="text-sm text-gray-400">matrículas ({((totalAdultos / total) * 100).toFixed(0)}%)</div>
          <div className="mt-4 space-y-2">
            <div className="text-sm text-gray-300">Top Cursos:</div>
            {cursos.filter(c => !cursosKids.some(k => c.curso.includes(k))).slice(0, 3).map((c, idx) => (
              <div key={c.curso} className="flex justify-between text-sm">
                <span className="text-gray-400">{idx + 1}. {c.curso}</span>
                <span className="text-blue-400">{c.total}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gradient-to-br from-pink-500/20 to-purple-500/20 border border-pink-500/30 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-pink-500/20 rounded-xl">
              <Music className="w-6 h-6 text-pink-400" />
            </div>
            <div>
              <div className="text-pink-400 font-medium">LA Music Kids</div>
              <div className="text-sm text-gray-400">Até 11 anos</div>
            </div>
          </div>
          <div className="text-4xl font-bold text-white mb-2">{totalKids}</div>
          <div className="text-sm text-gray-400">matrículas ({((totalKids / total) * 100).toFixed(0)}%)</div>
          <div className="mt-4 space-y-2">
            <div className="text-sm text-gray-300">Top Cursos:</div>
            {cursos.filter(c => cursosKids.some(k => c.curso.includes(k))).slice(0, 3).map((c, idx) => (
              <div key={c.curso} className="flex justify-between text-sm">
                <span className="text-gray-400">{idx + 1}. {c.curso}</span>
                <span className="text-pink-400">{c.total}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Gráficos lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Gráfico de Pizza */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Distribuição por Curso</h3>
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
                >
                  {pieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={cores[index % cores.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  content={<ChartTooltip suffix=" matrículas" />}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico de Barras */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Top 10 Cursos</h3>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top10} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis type="number" stroke="#94a3b8" />
                <YAxis 
                  dataKey="curso" 
                  type="category" 
                  stroke="#94a3b8" 
                  width={100}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip 
                  content={<ChartTooltip />}
                />
                <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                  {top10.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={cores[index]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tabela por Unidade */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-6">Detalhamento por Unidade</h3>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-gray-400 text-sm font-medium py-3 px-4">#</th>
                <th className="text-left text-gray-400 text-sm font-medium py-3 px-4">Curso</th>
                <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Total</th>
                <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">C. Grande</th>
                <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Recreio</th>
                <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Barra</th>
                <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">%</th>
              </tr>
            </thead>
            <tbody>
              {cursos.slice(0, 15).map((curso, idx) => (
                <tr key={curso.curso} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                  <td className="py-3 px-4 text-gray-500">{idx + 1}</td>
                  <td className="py-3 px-4 text-white font-medium">{curso.curso}</td>
                  <td className="text-right py-3 px-4 text-accent-cyan font-bold">{curso.total}</td>
                  <td className="text-right py-3 px-4 text-cyan-400">{curso.unidades['Campo Grande'] || '-'}</td>
                  <td className="text-right py-3 px-4 text-purple-400">{curso.unidades['Recreio'] || '-'}</td>
                  <td className="text-right py-3 px-4 text-emerald-400">{curso.unidades['Barra'] || '-'}</td>
                  <td className="text-right py-3 px-4 text-gray-400">{((curso.total / total) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default ComercialCursos;
