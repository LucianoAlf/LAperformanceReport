import React, { useState, useMemo } from 'react';
import { Users, AlertTriangle, TrendingDown, ArrowUpDown, Filter, GraduationCap } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis } from 'recharts';
import { useProfessoresPerformance } from '../../hooks/useProfessoresPerformance';
import { UnidadeRetencao } from '../../types/retencao';

interface RetencaoProfessoresProps {
  ano: number;
  unidade: UnidadeRetencao;
}

type OrdenacaoTipo = 'evasoes' | 'taxa_renovacao' | 'taxa_conversao' | 'score_saude';

export function RetencaoProfessores({ ano, unidade }: RetencaoProfessoresProps) {
  const { professores, porRisco, loading } = useProfessoresPerformance(ano, unidade === 'Consolidado' ? undefined : unidade);
  const [ordenarPor, setOrdenarPor] = useState<OrdenacaoTipo>('evasoes');
  const [filtroRisco, setFiltroRisco] = useState<string>('todos');

  // Professores ordenados e filtrados
  const professoresProcessados = useMemo(() => {
    let lista = [...professores];
    
    // Filtrar por risco
    if (filtroRisco !== 'todos') {
      lista = lista.filter(p => p.nivel_risco === filtroRisco);
    }
    
    // Ordenar
    lista.sort((a, b) => {
      switch (ordenarPor) {
        case 'evasoes': return b.evasoes - a.evasoes;
        case 'taxa_renovacao': return a.taxa_renovacao - b.taxa_renovacao;
        case 'taxa_conversao': return b.taxa_conversao - a.taxa_conversao;
        case 'score_saude': return (a.score_saude || 0) - (b.score_saude || 0);
        default: return 0;
      }
    });
    
    return lista;
  }, [professores, ordenarPor, filtroRisco]);

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
      case 'crítico': return { bg: 'bg-red-500/20', border: 'border-red-500/50', text: 'text-red-400', bar: '#ef4444', badge: 'bg-red-500' };
      case 'alto': return { bg: 'bg-orange-500/20', border: 'border-orange-500/50', text: 'text-orange-400', bar: '#f97316', badge: 'bg-orange-500' };
      case 'médio': return { bg: 'bg-yellow-500/20', border: 'border-yellow-500/50', text: 'text-yellow-400', bar: '#eab308', badge: 'bg-yellow-500' };
      default: return { bg: 'bg-green-500/20', border: 'border-green-500/50', text: 'text-green-400', bar: '#22c55e', badge: 'bg-green-500' };
    }
  };

  // Labels para cada tipo de ordenação
  const getMetricaLabel = (tipo: OrdenacaoTipo) => {
    switch (tipo) {
      case 'evasoes': return 'Evasões';
      case 'taxa_renovacao': return 'Renovação %';
      case 'taxa_conversao': return 'Conversão %';
      case 'score_saude': return 'Score';
      default: return 'Evasões';
    }
  };

  // Dados para gráfico de barras - baseado na métrica selecionada
  const dadosGrafico = professoresProcessados.slice(0, 10).map(p => {
    let valor: number;
    switch (ordenarPor) {
      case 'evasoes': valor = p.evasoes; break;
      case 'taxa_renovacao': valor = p.taxa_renovacao; break;
      case 'taxa_conversao': valor = p.taxa_conversao; break;
      case 'score_saude': valor = p.score_saude || 0; break;
      default: valor = p.evasoes;
    }
    return {
      nome: p.professor.split(' ').slice(0, 2).join(' '),
      valor,
      risco: p.nivel_risco || 'normal',
    };
  });

  // Dados para scatter plot (Conversão vs Evasão)
  const dadosScatter = professores.map(p => ({
    nome: p.professor,
    conversao: p.taxa_conversao,
    evasoes: p.evasoes,
    renovacao: p.taxa_renovacao,
    risco: p.nivel_risco || 'normal',
    fill: getCoresRisco(p.nivel_risco || 'normal').bar,
  }));

  return (
    <div className="min-h-screen p-8 bg-slate-950">
      {/* Header */}
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 bg-rose-500/20 text-rose-400 text-sm font-medium px-3 py-1 rounded-full mb-4">
          <GraduationCap className="w-4 h-4" /> Performance Professores
        </span>
        <h1 className="text-4xl lg:text-5xl font-grotesk font-bold text-white mb-2">
          Evasões por <span className="text-rose-400">Professor</span>
        </h1>
        <p className="text-gray-400">
          Ranking de professores com maior número de evasões {unidade !== 'Consolidado' && <span className="text-rose-400">- {unidade}</span>}
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
          {/* Resumo por Risco */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 hover:border-slate-600/50 transition-all">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-red-500/20 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
              </div>
              <div className="text-3xl font-grotesk font-bold text-white">
                {porRisco.critico}
              </div>
              <span className="text-gray-400 text-sm">Críticos</span>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 hover:border-slate-600/50 transition-all">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-orange-500/20 rounded-lg">
                  <TrendingDown className="w-5 h-5 text-orange-400" />
                </div>
              </div>
              <div className="text-3xl font-grotesk font-bold text-white">
                {porRisco.alto}
              </div>
              <span className="text-gray-400 text-sm">Alto Risco</span>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 hover:border-slate-600/50 transition-all">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-yellow-500/20 rounded-lg">
                  <Users className="w-5 h-5 text-yellow-400" />
                </div>
              </div>
              <div className="text-3xl font-grotesk font-bold text-white">
                {porRisco.medio}
              </div>
              <span className="text-gray-400 text-sm">Médio Risco</span>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 hover:border-slate-600/50 transition-all">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <Users className="w-5 h-5 text-green-400" />
                </div>
              </div>
              <div className="text-3xl font-grotesk font-bold text-white">
                {porRisco.normal}
              </div>
              <span className="text-gray-400 text-sm">Normal</span>
            </div>
          </div>

          {/* Filtros e Ordenação */}
          <div className="flex flex-wrap gap-3 mb-6">
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-gray-400" />
              <span className="text-gray-400 text-sm">Ordenar:</span>
              {(['evasoes', 'taxa_renovacao', 'taxa_conversao', 'score_saude'] as OrdenacaoTipo[]).map(tipo => (
                <button
                  key={tipo}
                  onClick={() => setOrdenarPor(tipo)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                    ordenarPor === tipo
                      ? 'bg-rose-500 text-white'
                      : 'bg-slate-700 text-gray-400 hover:bg-slate-600'
                  }`}
                >
                  {tipo === 'evasoes' ? 'Evasões' : 
                   tipo === 'taxa_renovacao' ? 'Renovação' :
                   tipo === 'taxa_conversao' ? 'Conversão' : 'Score'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <span className="text-gray-400 text-sm">Risco:</span>
              {['todos', 'crítico', 'alto', 'médio', 'normal'].map(risco => (
                <button
                  key={risco}
                  onClick={() => setFiltroRisco(risco)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all capitalize ${
                    filtroRisco === risco
                      ? 'bg-rose-500 text-white'
                      : 'bg-slate-700 text-gray-400 hover:bg-slate-600'
                  }`}
                >
                  {risco}
                </button>
              ))}
            </div>
          </div>

          {/* Gráfico */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 mb-8">
            <h3 className="text-lg font-grotesk font-semibold text-white mb-6">
              Top 10 Professores - {getMetricaLabel(ordenarPor)}
            </h3>
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
                    itemStyle={{ color: '#fff' }}
                    cursor={{ fill: '#1e293b' }}
                    formatter={(value: number) => [
                      ordenarPor === 'taxa_renovacao' || ordenarPor === 'taxa_conversao' 
                        ? `${value.toFixed(1)}%` 
                        : value,
                      getMetricaLabel(ordenarPor)
                    ]}
                  />
                  <Bar dataKey="valor" radius={[0, 4, 4, 0]} name={getMetricaLabel(ordenarPor)}>
                    {dadosGrafico.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getCoresRisco(entry.risco).bar} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabela Completa de Professores */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-700/50">
              <h3 className="text-lg font-grotesk font-semibold text-white">Ranking Completo de Professores</h3>
              <p className="text-gray-400 text-sm">{professoresProcessados.length} professores encontrados</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-700/50">
                  <tr>
                    <th className="text-left p-4 text-gray-400 text-sm font-medium">#</th>
                    <th className="text-left p-4 text-gray-400 text-sm font-medium">Professor</th>
                    <th className="text-left p-4 text-gray-400 text-sm font-medium">Unidade</th>
                    <th className="text-right p-4 text-gray-400 text-sm font-medium">Exp</th>
                    <th className="text-right p-4 text-gray-400 text-sm font-medium">Mat</th>
                    <th className="text-right p-4 text-gray-400 text-sm font-medium">Conv%</th>
                    <th className="text-right p-4 text-gray-400 text-sm font-medium">Eva</th>
                    <th className="text-right p-4 text-gray-400 text-sm font-medium">Ren</th>
                    <th className="text-right p-4 text-gray-400 text-sm font-medium">Ren%</th>
                    <th className="text-center p-4 text-gray-400 text-sm font-medium">Risco</th>
                  </tr>
                </thead>
                <tbody>
                  {professoresProcessados.map((prof, index) => {
                    const cores = getCoresRisco(prof.nivel_risco || 'normal');
                    
                    return (
                      <tr 
                        key={`${prof.unidade}-${prof.professor}-${prof.id}`} 
                        className="border-t border-slate-700/30 hover:bg-slate-700/20 transition-colors"
                      >
                        <td className="p-4 text-gray-500 text-sm">{index + 1}</td>
                        <td className="p-4 text-white font-medium">{prof.professor}</td>
                        <td className="p-4 text-gray-400 text-sm">{prof.unidade}</td>
                        <td className="p-4 text-right text-gray-300">{prof.experimentais}</td>
                        <td className="p-4 text-right text-gray-300">{prof.matriculas}</td>
                        <td className="p-4 text-right text-cyan-400 font-medium">{prof.taxa_conversao.toFixed(1)}%</td>
                        <td className="p-4 text-right text-rose-400 font-bold">{prof.evasoes}</td>
                        <td className="p-4 text-right text-gray-300">{prof.renovacoes}</td>
                        <td className="p-4 text-right text-emerald-400 font-medium">{prof.taxa_renovacao.toFixed(1)}%</td>
                        <td className="p-4 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${cores.badge} text-white`}>
                            {prof.nivel_risco?.toUpperCase() || 'NORMAL'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Gráfico Scatter: Conversão vs Evasão */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 mt-8">
            <h3 className="text-lg font-grotesk font-semibold text-white mb-2">Conversão vs Evasão</h3>
            <p className="text-gray-400 text-sm mb-6">Relação entre taxa de conversão e número de evasões por professor</p>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis 
                    type="number" 
                    dataKey="evasoes" 
                    name="Evasões" 
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8' }}
                    label={{ value: 'Evasões', position: 'bottom', fill: '#94a3b8' }}
                  />
                  <YAxis 
                    type="number" 
                    dataKey="conversao" 
                    name="Conversão %" 
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8' }}
                    label={{ value: 'Conversão %', angle: -90, position: 'insideLeft', fill: '#94a3b8' }}
                  />
                  <ZAxis type="number" dataKey="evasoes" range={[50, 400]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '12px',
                    }}
                    labelStyle={{ color: '#fff' }}
                    itemStyle={{ color: '#fff' }}
                    formatter={(value: number, name: string) => [
                      name === 'conversao' ? `${value.toFixed(1)}%` : value,
                      name === 'conversao' ? 'Conversão' : name === 'evasoes' ? 'Evasões' : name
                    ]}
                    labelFormatter={(label) => `Professor`}
                  />
                  <Scatter name="Professores" data={dadosScatter} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-gray-400 text-sm">Crítico</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                <span className="text-gray-400 text-sm">Alto</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <span className="text-gray-400 text-sm">Médio</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-gray-400 text-sm">Normal</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
