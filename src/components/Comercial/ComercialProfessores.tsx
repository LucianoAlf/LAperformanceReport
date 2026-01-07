import { useState } from 'react';
import { useProfessoresData } from '../../hooks/useProfessoresData';
import { UnidadeComercial } from '../../types/comercial';
import { Trophy, Award, Medal, GraduationCap } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ChartTooltip } from './ChartTooltip';

export function ComercialProfessores() {
  const [unidade, setUnidade] = useState<UnidadeComercial>('Consolidado');
  const { professores, loading } = useProfessoresData(2025, unidade);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  const top10 = professores.slice(0, 10);
  const cores = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#6366f1', '#84cc16', '#f97316'];

  const getMedalIcon = (index: number) => {
    if (index === 0) return <Trophy className="w-5 h-5 text-yellow-400" />;
    if (index === 1) return <Award className="w-5 h-5 text-gray-300" />;
    if (index === 2) return <Medal className="w-5 h-5 text-amber-600" />;
    return <span className="w-5 h-5 flex items-center justify-center text-gray-500 font-bold">{index + 1}</span>;
  };

  return (
    <div className="p-8 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 text-sm font-medium px-3 py-1 rounded-full mb-4">
          <GraduationCap className="w-4 h-4" /> Performance Professores
        </span>
        <h1 className="text-4xl font-bold text-white mb-2">
          Ranking de <span className="text-emerald-400">Professores</span>
        </h1>
        <p className="text-gray-400">
          Professores que mais matricularam em 2025
          {unidade !== 'Consolidado' && (
            <span className="text-emerald-400"> - {unidade}</span>
          )}
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-4 mb-8">
        <div className="flex gap-2">
          <span className="text-gray-400 self-center text-sm">Unidade:</span>
          {(['Consolidado', 'Campo Grande', 'Recreio', 'Barra'] as UnidadeComercial[]).map((u) => (
            <button
              key={u}
              onClick={() => setUnidade(u)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                unidade === u
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-800 text-gray-400 hover:bg-slate-700'
              }`}
            >
              {u === 'Campo Grande' ? 'C. Grande' : u}
            </button>
          ))}
        </div>
      </div>

      {/* Cards de Destaque */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {professores.slice(0, 3).map((prof, idx) => (
          <div 
            key={prof.professor}
            className={`bg-gradient-to-br ${
              idx === 0 ? 'from-yellow-500/20 to-amber-500/20 border-yellow-500/30' :
              idx === 1 ? 'from-gray-500/20 to-slate-500/20 border-gray-500/30' :
              'from-amber-600/20 to-orange-600/20 border-amber-600/30'
            } border rounded-2xl p-6`}
          >
            <div className="flex items-center justify-between mb-4">
              {getMedalIcon(idx)}
              <span className={`text-sm font-medium ${
                idx === 0 ? 'text-yellow-400' :
                idx === 1 ? 'text-gray-300' :
                'text-amber-500'
              }`}>
                #{idx + 1}
              </span>
            </div>
            <div className="text-2xl font-bold text-white mb-1">{prof.professor}</div>
            <div className="text-4xl font-bold text-emerald-400 mb-2">{prof.total}</div>
            <div className="text-sm text-gray-400">aulas experimentais</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {unidade === 'Consolidado' ? (
                Object.entries(prof.unidades).map(([unid, qty]) => (
                  <span 
                    key={unid}
                    className="text-xs bg-slate-700/50 px-2 py-1 rounded text-gray-300"
                  >
                    {unid === 'Campo Grande' ? 'CG' : unid}: {qty}
                  </span>
                ))
              ) : (
                <span className="text-xs bg-slate-700/50 px-2 py-1 rounded text-gray-300">
                  {unidade === 'Campo Grande' ? 'CG' : unidade}: {prof.total}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Gráfico de Barras */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 mb-8">
        <h3 className="text-lg font-semibold text-white mb-6">
          Top 10 Professores - Aulas Experimentais 2025
        </h3>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top10} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis type="number" stroke="#94a3b8" />
              <YAxis 
                dataKey="professor" 
                type="category" 
                stroke="#94a3b8" 
                width={120}
                tick={{ fontSize: 12 }}
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

      {/* Tabela Completa */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-6">Ranking Completo</h3>
        
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-slate-800">
              <tr className="border-b border-slate-700">
                <th className="text-left text-gray-400 text-sm font-medium py-3 px-4">#</th>
                <th className="text-left text-gray-400 text-sm font-medium py-3 px-4">Professor</th>
                <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Total</th>
                {unidade === 'Consolidado' && (
                  <>
                    <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">C. Grande</th>
                    <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Recreio</th>
                    <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Barra</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {professores.map((prof, idx) => (
                <tr key={prof.professor} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                  <td className="py-3 px-4">
                    <div className="w-6 h-6 flex items-center justify-center">
                      {idx < 3 ? getMedalIcon(idx) : <span className="text-gray-500">{idx + 1}</span>}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-white font-medium">{prof.professor}</td>
                  <td className="text-right py-3 px-4 text-emerald-400 font-bold">{prof.total}</td>
                  {unidade === 'Consolidado' && (
                    <>
                      <td className="text-right py-3 px-4 text-cyan-400">{prof.unidades['Campo Grande'] || '-'}</td>
                      <td className="text-right py-3 px-4 text-purple-400">{prof.unidades['Recreio'] || '-'}</td>
                      <td className="text-right py-3 px-4 text-emerald-400">{prof.unidades['Barra'] || '-'}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default ComercialProfessores;
