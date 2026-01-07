import { useComercialData } from '../../hooks/useComercialData';
import { Trophy, TrendingUp, Target, DollarSign } from 'lucide-react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartTooltip } from './ChartTooltip';

export function ComercialRanking() {
  const { kpis: kpisCG } = useComercialData(2025, 'Campo Grande');
  const { kpis: kpisRec } = useComercialData(2025, 'Recreio');
  const { kpis: kpisBarra } = useComercialData(2025, 'Barra');

  if (!kpisCG || !kpisRec || !kpisBarra) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  // Normalizar dados para radar (0-100)
  const maxConversao = Math.max(kpisCG.taxaConversaoTotal, kpisRec.taxaConversaoTotal, kpisBarra.taxaConversaoTotal);
  const maxTicket = Math.max(kpisCG.ticketMedioParcelas, kpisRec.ticketMedioParcelas, kpisBarra.ticketMedioParcelas);
  const maxLeadExp = Math.max(kpisCG.taxaLeadExp, kpisRec.taxaLeadExp, kpisBarra.taxaLeadExp);
  const maxExpMat = Math.max(kpisCG.taxaExpMat, kpisRec.taxaExpMat, kpisBarra.taxaExpMat);
  
  const radarData = [
    {
      metric: 'Conversão Total',
      'Campo Grande': (kpisCG.taxaConversaoTotal / maxConversao) * 100,
      'Recreio': (kpisRec.taxaConversaoTotal / maxConversao) * 100,
      'Barra': (kpisBarra.taxaConversaoTotal / maxConversao) * 100,
    },
    {
      metric: 'Lead→Exp',
      'Campo Grande': (kpisCG.taxaLeadExp / maxLeadExp) * 100,
      'Recreio': (kpisRec.taxaLeadExp / maxLeadExp) * 100,
      'Barra': (kpisBarra.taxaLeadExp / maxLeadExp) * 100,
    },
    {
      metric: 'Exp→Mat',
      'Campo Grande': (kpisCG.taxaExpMat / maxExpMat) * 100,
      'Recreio': (kpisRec.taxaExpMat / maxExpMat) * 100,
      'Barra': (kpisBarra.taxaExpMat / maxExpMat) * 100,
    },
    {
      metric: 'Ticket Médio',
      'Campo Grande': (kpisCG.ticketMedioParcelas / maxTicket) * 100,
      'Recreio': (kpisRec.ticketMedioParcelas / maxTicket) * 100,
      'Barra': (kpisBarra.ticketMedioParcelas / maxTicket) * 100,
    },
    {
      metric: '% Kids',
      'Campo Grande': kpisCG.novasMatriculas > 0 ? (kpisCG.matriculasLAMK / kpisCG.novasMatriculas) * 100 : 0,
      'Recreio': kpisRec.novasMatriculas > 0 ? (kpisRec.matriculasLAMK / kpisRec.novasMatriculas) * 100 : 0,
      'Barra': kpisBarra.novasMatriculas > 0 ? (kpisBarra.matriculasLAMK / kpisBarra.novasMatriculas) * 100 : 0,
    },
  ];

  // Rankings
  const rankings = {
    conversao: [
      { nome: 'Recreio', valor: kpisRec.taxaConversaoTotal },
      { nome: 'Barra', valor: kpisBarra.taxaConversaoTotal },
      { nome: 'Campo Grande', valor: kpisCG.taxaConversaoTotal },
    ].sort((a, b) => b.valor - a.valor),
    
    volume: [
      { nome: 'Campo Grande', valor: kpisCG.totalLeads },
      { nome: 'Barra', valor: kpisBarra.totalLeads },
      { nome: 'Recreio', valor: kpisRec.totalLeads },
    ].sort((a, b) => b.valor - a.valor),
    
    ticket: [
      { nome: 'Barra', valor: kpisBarra.ticketMedioParcelas },
      { nome: 'Recreio', valor: kpisRec.ticketMedioParcelas },
      { nome: 'Campo Grande', valor: kpisCG.ticketMedioParcelas },
    ].sort((a, b) => b.valor - a.valor),
    
    matriculas: [
      { nome: 'Campo Grande', valor: kpisCG.novasMatriculas },
      { nome: 'Recreio', valor: kpisRec.novasMatriculas },
      { nome: 'Barra', valor: kpisBarra.novasMatriculas },
    ].sort((a, b) => b.valor - a.valor),
  };

  const getMedalColor = (index: number) => {
    if (index === 0) return 'text-yellow-400';
    if (index === 1) return 'text-gray-300';
    return 'text-amber-600';
  };

  const getMedalBg = (index: number) => {
    if (index === 0) return 'bg-yellow-500/20';
    if (index === 1) return 'bg-gray-500/20';
    return 'bg-amber-600/20';
  };

  // Determinar melhor em cada métrica
  const melhorConversaoNome = rankings.conversao[0].nome;
  const melhorLeadExp = kpisRec.taxaLeadExp >= kpisCG.taxaLeadExp && kpisRec.taxaLeadExp >= kpisBarra.taxaLeadExp ? 'Recreio' :
                        kpisCG.taxaLeadExp >= kpisBarra.taxaLeadExp ? 'C. Grande' : 'Barra';
  const melhorExpMat = kpisCG.taxaExpMat >= kpisRec.taxaExpMat && kpisCG.taxaExpMat >= kpisBarra.taxaExpMat ? 'C. Grande' :
                       kpisRec.taxaExpMat >= kpisBarra.taxaExpMat ? 'Recreio' : 'Barra';
  const melhorTicket = rankings.ticket[0].nome;

  return (
    <div className="p-8 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <span className="inline-block bg-emerald-500/20 text-emerald-500 text-sm font-medium px-3 py-1 rounded-full mb-4">
          🏆 Ranking
        </span>
        <h1 className="text-4xl lg:text-5xl font-grotesk font-bold text-white mb-2">
          Ranking entre <span className="text-emerald-500">Unidades</span>
        </h1>
        <p className="text-gray-400">
          Quem performou melhor em cada KPI comercial
        </p>
      </div>

      {/* 4 Quadrantes de Rankings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Taxa de Conversão */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Target className="w-5 h-5 text-emerald-500" />
            <h3 className="text-lg font-semibold text-white">Taxa de Conversão</h3>
          </div>
          <div className="space-y-3">
            {rankings.conversao.map((item, idx) => (
              <div key={item.nome} className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full ${getMedalBg(idx)} flex items-center justify-center`}>
                  <span className={`font-bold ${getMedalColor(idx)}`}>{idx + 1}</span>
                </div>
                <div className="flex-1">
                  <span className="text-white">{item.nome}</span>
                </div>
                <span className={`font-bold ${idx === 0 ? 'text-emerald-500' : 'text-gray-400'}`}>
                  {item.valor.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Volume de Leads */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-semibold text-white">Volume de Leads</h3>
          </div>
          <div className="space-y-3">
            {rankings.volume.map((item, idx) => (
              <div key={item.nome} className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full ${getMedalBg(idx)} flex items-center justify-center`}>
                  <span className={`font-bold ${getMedalColor(idx)}`}>{idx + 1}</span>
                </div>
                <div className="flex-1">
                  <span className="text-white">{item.nome}</span>
                </div>
                <span className={`font-bold ${idx === 0 ? 'text-blue-400' : 'text-gray-400'}`}>
                  {item.valor.toLocaleString('pt-BR')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Ticket Médio */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <DollarSign className="w-5 h-5 text-yellow-400" />
            <h3 className="text-lg font-semibold text-white">Ticket Médio Parcelas</h3>
          </div>
          <div className="space-y-3">
            {rankings.ticket.map((item, idx) => (
              <div key={item.nome} className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full ${getMedalBg(idx)} flex items-center justify-center`}>
                  <span className={`font-bold ${getMedalColor(idx)}`}>{idx + 1}</span>
                </div>
                <div className="flex-1">
                  <span className="text-white">{item.nome}</span>
                </div>
                <span className={`font-bold ${idx === 0 ? 'text-yellow-400' : 'text-gray-400'}`}>
                  R$ {item.valor.toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Matrículas */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Trophy className="w-5 h-5 text-purple-400" />
            <h3 className="text-lg font-semibold text-white">Matrículas Absolutas</h3>
          </div>
          <div className="space-y-3">
            {rankings.matriculas.map((item, idx) => (
              <div key={item.nome} className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full ${getMedalBg(idx)} flex items-center justify-center`}>
                  <span className={`font-bold ${getMedalColor(idx)}`}>{idx + 1}</span>
                </div>
                <div className="flex-1">
                  <span className="text-white">{item.nome}</span>
                </div>
                <span className={`font-bold ${idx === 0 ? 'text-purple-400' : 'text-gray-400'}`}>
                  {item.valor}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Radar Chart */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
        <h3 className="text-xl font-semibold text-white mb-6 text-center">
          Visão 360° de Performance
        </h3>
        
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData}>
              <PolarGrid stroke="#334155" />
              <PolarAngleAxis 
                dataKey="metric" 
                tick={{ fill: '#94a3b8', fontSize: 12 }}
              />
              <PolarRadiusAxis 
                angle={30} 
                domain={[0, 100]} 
                tick={{ fill: '#64748b', fontSize: 10 }}
              />
              <Tooltip 
                content={<ChartTooltip suffix="%" />}
              />
              <Radar
                name="Campo Grande"
                dataKey="Campo Grande"
                stroke="#06b6d4"
                fill="#06b6d4"
                fillOpacity={0.2}
              />
              <Radar
                name="Recreio"
                dataKey="Recreio"
                stroke="#a855f7"
                fill="#a855f7"
                fillOpacity={0.2}
              />
              <Radar
                name="Barra"
                dataKey="Barra"
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.2}
              />
              <Legend 
                wrapperStyle={{ paddingTop: 20 }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Tabela Resumo */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-gray-400 font-medium py-2 px-3">Métrica</th>
                <th className="text-center text-emerald-400 font-medium py-2 px-3">Barra</th>
                <th className="text-center text-cyan-400 font-medium py-2 px-3">Campo Grande</th>
                <th className="text-center text-purple-400 font-medium py-2 px-3">Recreio</th>
                <th className="text-center text-yellow-400 font-medium py-2 px-3">Melhor</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-700/50">
                <td className="py-2 px-3 text-gray-300">Conversão Total</td>
                <td className="text-center text-white py-2 px-3">{kpisBarra.taxaConversaoTotal.toFixed(1)}%</td>
                <td className="text-center text-white py-2 px-3">{kpisCG.taxaConversaoTotal.toFixed(1)}%</td>
                <td className="text-center text-white py-2 px-3">{kpisRec.taxaConversaoTotal.toFixed(1)}%</td>
                <td className="text-center py-2 px-3">
                  <span className="bg-emerald-500/20 text-emerald-500 px-2 py-1 rounded text-xs">{melhorConversaoNome}</span>
                </td>
              </tr>
              <tr className="border-b border-slate-700/50">
                <td className="py-2 px-3 text-gray-300">Lead→Exp</td>
                <td className="text-center text-white py-2 px-3">{kpisBarra.taxaLeadExp.toFixed(1)}%</td>
                <td className="text-center text-white py-2 px-3">{kpisCG.taxaLeadExp.toFixed(1)}%</td>
                <td className="text-center text-white py-2 px-3">{kpisRec.taxaLeadExp.toFixed(1)}%</td>
                <td className="text-center py-2 px-3">
                  <span className="bg-emerald-500/20 text-emerald-500 px-2 py-1 rounded text-xs">{melhorLeadExp}</span>
                </td>
              </tr>
              <tr className="border-b border-slate-700/50">
                <td className="py-2 px-3 text-gray-300">Exp→Mat</td>
                <td className="text-center text-white py-2 px-3">{kpisBarra.taxaExpMat.toFixed(1)}%</td>
                <td className="text-center text-white py-2 px-3">{kpisCG.taxaExpMat.toFixed(1)}%</td>
                <td className="text-center text-white py-2 px-3">{kpisRec.taxaExpMat.toFixed(1)}%</td>
                <td className="text-center py-2 px-3">
                  <span className="bg-emerald-500/20 text-emerald-500 px-2 py-1 rounded text-xs">{melhorExpMat}</span>
                </td>
              </tr>
              <tr className="border-b border-slate-700/50">
                <td className="py-2 px-3 text-gray-300">Ticket Médio</td>
                <td className="text-center text-white py-2 px-3">R$ {kpisBarra.ticketMedioParcelas.toFixed(0)}</td>
                <td className="text-center text-white py-2 px-3">R$ {kpisCG.ticketMedioParcelas.toFixed(0)}</td>
                <td className="text-center text-white py-2 px-3">R$ {kpisRec.ticketMedioParcelas.toFixed(0)}</td>
                <td className="text-center py-2 px-3">
                  <span className="bg-emerald-500/20 text-emerald-500 px-2 py-1 rounded text-xs">{melhorTicket}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default ComercialRanking;
