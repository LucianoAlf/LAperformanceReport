import { Users, AlertTriangle, TrendingDown, DollarSign } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useEvasoesData } from '../../hooks/useEvasoesData';
import { UnidadeRetencao } from '../../types/retencao';

interface RetencaoProfessoresProps {
  ano: number;
  unidade: UnidadeRetencao;
}

export function RetencaoProfessores({ ano, unidade }: RetencaoProfessoresProps) {
  const { professores, loading } = useEvasoesData(ano, unidade);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Cores por nível de risco
  const getCoresRisco = (risco: string) => {
    switch (risco) {
      case 'crítico': return { bg: 'bg-red-500/20', border: 'border-red-500/50', text: 'text-red-400', bar: '#ef4444' };
      case 'alto': return { bg: 'bg-orange-500/20', border: 'border-orange-500/50', text: 'text-orange-400', bar: '#f97316' };
      case 'médio': return { bg: 'bg-yellow-500/20', border: 'border-yellow-500/50', text: 'text-yellow-400', bar: '#eab308' };
      default: return { bg: 'bg-green-500/20', border: 'border-green-500/50', text: 'text-green-400', bar: '#22c55e' };
    }
  };

  // Gradientes para top 3
  const getGradiente = (index: number) => {
    if (index === 0) return 'from-amber-400 via-yellow-500 to-amber-600'; // Ouro
    if (index === 1) return 'from-gray-300 via-gray-400 to-gray-500'; // Prata
    if (index === 2) return 'from-amber-600 via-amber-700 to-amber-800'; // Bronze
    return '';
  };

  // Dados para o gráfico
  const dadosGrafico = professores.slice(0, 10).map(p => ({
    nome: p.professor.split(' ').slice(0, 2).join(' '),
    evasoes: p.total_evasoes,
    risco: p.risco,
  }));

  return (
    <div className="min-h-screen p-8 bg-slate-950">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Evasões por Professor</h2>
        <p className="text-gray-400">Ranking de professores com maior número de evasões</p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rose-500"></div>
        </div>
      )}

      {!loading && (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <span className="text-gray-400 text-sm">Críticos</span>
              </div>
              <div className="text-2xl font-bold text-red-400">
                {professores.filter(p => p.risco === 'crítico').length}
              </div>
            </div>
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-5 h-5 text-orange-400" />
                <span className="text-gray-400 text-sm">Alto Risco</span>
              </div>
              <div className="text-2xl font-bold text-orange-400">
                {professores.filter(p => p.risco === 'alto').length}
              </div>
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-yellow-400" />
                <span className="text-gray-400 text-sm">Médio Risco</span>
              </div>
              <div className="text-2xl font-bold text-yellow-400">
                {professores.filter(p => p.risco === 'médio').length}
              </div>
            </div>
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-green-400" />
                <span className="text-gray-400 text-sm">Normal</span>
              </div>
              <div className="text-2xl font-bold text-green-400">
                {professores.filter(p => p.risco === 'normal').length}
              </div>
            </div>
          </div>

          {/* Gráfico */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 mb-8">
            <h3 className="text-lg font-semibold text-white mb-6">Top 10 Professores com Mais Evasões</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dadosGrafico} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis type="number" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                  <YAxis 
                    type="category" 
                    dataKey="nome" 
                    stroke="#94a3b8" 
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    width={120}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '12px',
                    }}
                    labelStyle={{ color: '#fff' }}
                    cursor={{ fill: '#1e293b' }}
                  />
                  <Bar dataKey="evasoes" radius={[0, 4, 4, 0]} name="Evasões">
                    {dadosGrafico.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getCoresRisco(entry.risco).bar} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Cards de Professores */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-white mb-6">Detalhamento por Professor</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {professores.slice(0, 12).map((prof, index) => {
                const cores = getCoresRisco(prof.risco);
                const gradiente = getGradiente(index);
                
                return (
                  <div
                    key={`${prof.unidade}-${prof.professor}`}
                    className={`${cores.bg} ${cores.border} border rounded-xl p-4 relative overflow-hidden`}
                  >
                    {/* Badge de posição para top 3 */}
                    {index < 3 && (
                      <div className={`absolute top-2 right-2 w-8 h-8 rounded-full bg-gradient-to-br ${gradiente} flex items-center justify-center shadow-lg`}>
                        <span className="text-white font-bold text-sm">{index + 1}</span>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-full ${cores.bg} flex items-center justify-center`}>
                        <Users className={`w-5 h-5 ${cores.text}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-medium truncate">{prof.professor}</div>
                        <div className="text-gray-400 text-sm">{prof.unidade}</div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className={`text-xl font-bold ${cores.text}`}>{prof.total_evasoes}</div>
                        <div className="text-gray-400 text-xs">evasões</div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-rose-400">
                          {formatCurrency(prof.mrr_perdido)}
                        </div>
                        <div className="text-gray-400 text-xs">MRR perdido</div>
                      </div>
                    </div>
                    
                    {/* Badge de risco */}
                    <div className={`mt-3 inline-flex items-center gap-1 px-2 py-1 rounded-full ${cores.bg} ${cores.border} border`}>
                      <span className={`text-xs font-medium ${cores.text} capitalize`}>
                        Risco {prof.risco}
                      </span>
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
