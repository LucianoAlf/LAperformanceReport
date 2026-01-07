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
        <h1 className="text-4xl lg:text-5xl font-grotesk font-bold text-white mb-2">
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

      {/* Cards de Destaque - Estilo Pódio */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {professores.slice(0, 3).map((prof, idx) => (
          <div 
            key={prof.professor}
            className="relative bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 overflow-hidden"
          >
            {/* Ícone de posição com gradiente - Estilo Gestão */}
            <div className={`absolute top-4 left-4 w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black ${
              idx === 0 
                ? 'bg-gradient-to-br from-[#FFD700] via-[#FFFACD] to-[#DAA520] text-yellow-950 shadow-lg shadow-yellow-500/40 border border-yellow-200/50' 
                : idx === 1 
                ? 'bg-gradient-to-br from-[#C0C0C0] via-[#F8F8F8] to-[#808080] text-slate-800 shadow-lg shadow-slate-400/30 border border-slate-100/50' 
                : 'bg-gradient-to-br from-[#CD7F32] via-[#E6B8A2] to-[#8B4513] text-white shadow-lg shadow-orange-900/30 border border-orange-300/50'
            }`}>
              {idx + 1}
            </div>
            
            {/* Posição no canto direito */}
            <div className="absolute top-4 right-4">
              <span className={`text-sm font-medium ${
                idx === 0 ? 'text-yellow-400' :
                idx === 1 ? 'text-gray-300' :
                'text-amber-500'
              }`}>
                #{idx + 1}
              </span>
            </div>

            {/* Conteúdo */}
            <div className="mt-14">
              <div className="text-2xl font-grotesk font-bold text-white mb-1">{prof.professor}</div>
              <div className={`text-4xl font-grotesk font-bold mb-2 ${
                idx === 0 ? 'text-yellow-400' :
                idx === 1 ? 'text-gray-300' :
                'text-amber-500'
              }`}>{prof.total}</div>
              <div className="text-sm text-gray-400">aulas experimentais</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {unidade === 'Consolidado' ? (
                  Object.entries(prof.unidades).map(([unid, qty]) => (
                    <span 
                      key={unid}
                      className={`text-xs px-2 py-1 rounded ${
                        idx === 0 ? 'bg-yellow-500/20 text-yellow-300' :
                        idx === 1 ? 'bg-gray-500/20 text-gray-300' :
                        'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {unid === 'Campo Grande' ? 'CG' : unid}: {qty}
                    </span>
                  ))
                ) : (
                  <span className={`text-xs px-2 py-1 rounded ${
                    idx === 0 ? 'bg-yellow-500/20 text-yellow-300' :
                    idx === 1 ? 'bg-gray-500/20 text-gray-300' :
                    'bg-amber-500/20 text-amber-300'
                  }`}>
                    {unidade === 'Campo Grande' ? 'CG' : unidade}: {prof.total}
                  </span>
                )}
              </div>
            </div>

            {/* Borda inferior colorida */}
            <div className={`absolute bottom-0 left-0 right-0 h-1 ${
              idx === 0 
                ? 'bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500' 
                : idx === 1 
                ? 'bg-gradient-to-r from-gray-300 via-gray-400 to-gray-300' 
                : 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500'
            }`} />
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
                cursor={{fill: '#1e293b'}}
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
