import { useState } from 'react';
import { useComercialData } from '../../hooks/useComercialData';
import { TrendingUp, TrendingDown, AlertTriangle, Calendar } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ChartTooltip } from './ChartTooltip';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function ComercialSazonalidade() {
  const [metrica, setMetrica] = useState<'leads' | 'matriculas'>('matriculas');
  
  const { dadosMensais: dadosCG } = useComercialData(2025, 'Campo Grande');
  const { dadosMensais: dadosRec } = useComercialData(2025, 'Recreio');
  const { dadosMensais: dadosBarra } = useComercialData(2025, 'Barra');

  if (!dadosCG || !dadosRec || !dadosBarra) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  // Organizar dados por mês - usar mesAbrev para mapear corretamente
  const dadosPorMes = MESES.map((mes) => {
    const cgMes = dadosCG?.find(d => d.mesAbrev === mes);
    const recMes = dadosRec?.find(d => d.mesAbrev === mes);
    const barraMes = dadosBarra?.find(d => d.mesAbrev === mes);

    return {
      mes,
      cg_leads: cgMes?.leads || 0,
      cg_mat: cgMes?.matriculas || 0,
      rec_leads: recMes?.leads || 0,
      rec_mat: recMes?.matriculas || 0,
      barra_leads: barraMes?.leads || 0,
      barra_mat: barraMes?.matriculas || 0,
      total_leads: (cgMes?.leads || 0) + (recMes?.leads || 0) + (barraMes?.leads || 0),
      total_mat: (cgMes?.matriculas || 0) + (recMes?.matriculas || 0) + (barraMes?.matriculas || 0),
    };
  });

  // Dados para o gráfico de linha
  const chartData = dadosPorMes.map(d => ({
    mes: d.mes,
    Leads: d.total_leads,
    Matrículas: d.total_mat,
  }));

  // Função para cor do heatmap - Matrículas (verde = melhor)
  const getColorMatriculas = (valor: number) => {
    if (valor >= 30) return 'bg-accent-green/80 text-white';
    if (valor >= 20) return 'bg-accent-green/40 text-accent-green';
    if (valor >= 10) return 'bg-yellow-500/30 text-yellow-400';
    return 'bg-pink-500/20 text-pink-400';
  };

  // Função para cor do heatmap - Matrículas TOTAL (escala 3x)
  const getColorMatriculasTotal = (valor: number) => {
    if (valor >= 90) return 'bg-accent-green/80 text-white';
    if (valor >= 60) return 'bg-accent-green/40 text-accent-green';
    if (valor >= 30) return 'bg-yellow-500/30 text-yellow-400';
    return 'bg-pink-500/20 text-pink-400';
  };

  // Função para cor do heatmap - Leads (verde = melhor)
  const getColorLeads = (valor: number) => {
    if (valor >= 400) return 'bg-accent-green/80 text-white';
    if (valor >= 250) return 'bg-accent-green/40 text-accent-green';
    if (valor >= 150) return 'bg-yellow-500/30 text-yellow-400';
    return 'bg-pink-500/20 text-pink-400';
  };

  // Função para cor do heatmap - Leads TOTAL (escala 3x)
  const getColorLeadsTotal = (valor: number) => {
    if (valor >= 1200) return 'bg-accent-green/80 text-white';
    if (valor >= 750) return 'bg-accent-green/40 text-accent-green';
    if (valor >= 450) return 'bg-yellow-500/30 text-yellow-400';
    return 'bg-pink-500/20 text-pink-400';
  };

  const getHeatmapColor = metrica === 'matriculas' ? getColorMatriculas : getColorLeads;
  const getHeatmapColorTotal = metrica === 'matriculas' ? getColorMatriculasTotal : getColorLeadsTotal;

  // Encontrar melhores e piores meses - ordenar por matrículas
  const mesesOrdenados = [...dadosPorMes].sort((a, b) => b.total_mat - a.total_mat);
  const melhoresMeses = mesesOrdenados.slice(0, 3);
  const pioresMeses = [...dadosPorMes].sort((a, b) => a.total_mat - b.total_mat).slice(0, 3);


  return (
    <div className="p-8 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 text-sm font-medium px-3 py-1 rounded-full mb-4">
          <Calendar className="w-4 h-4" /> Sazonalidade
        </span>
        <h1 className="text-4xl lg:text-5xl font-grotesk font-bold text-white mb-2">
          Padrões <span className="text-emerald-400">Identificados</span>
        </h1>
        <p className="text-gray-400">
          Meses críticos e oportunidades de captação
        </p>
      </div>

      {/* Cards de Meses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Meses de Ouro */}
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-500/20 rounded-lg">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-emerald-400">Meses de Ouro (Captação)</h3>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            {melhoresMeses.map((m, idx) => (
              <div key={m.mes} className="text-center">
                <div className="text-3xl font-grotesk font-bold text-white">{m.mes.toUpperCase()}</div>
                <div className="text-emerald-400 font-semibold">{m.total_mat} mat.</div>
                {idx === 0 && <div className="text-yellow-400 text-xs mt-1">⭐ Melhor</div>}
              </div>
            ))}
          </div>
          
          <div className="mt-4 text-sm text-gray-400">
            <strong>Janeiro</strong> e <strong>Agosto</strong> concentram as melhores oportunidades
            (volta às aulas e resoluções de ano novo)
          </div>
        </div>

        {/* Meses Críticos */}
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <TrendingDown className="w-5 h-5 text-red-400" />
            </div>
            <h3 className="text-lg font-semibold text-red-400">Meses Críticos</h3>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            {pioresMeses.map((m, idx) => (
              <div key={m.mes} className="text-center">
                <div className="text-3xl font-grotesk font-bold text-white">{m.mes.toUpperCase()}</div>
                <div className="text-red-400 font-semibold">{m.total_mat} mat.</div>
                {idx === 0 && <div className="text-red-400 text-xs mt-1 flex items-center justify-center gap-1"><AlertTriangle className="w-3 h-3" /> Pior</div>}
              </div>
            ))}
          </div>
          
          <div className="mt-4 text-sm text-gray-400">
            <strong>Dezembro</strong> foco em renovações, não captação.
            <strong> Outubro</strong> pré-férias com queda natural.
          </div>
        </div>
      </div>

      {/* Gráfico de Linha */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 mb-8">
        <h3 className="text-lg font-semibold text-white mb-6">
          Evolução Mensal: Leads vs Matrículas
        </h3>
        
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="mes" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip 
                content={<ChartTooltip />}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="Leads" 
                stroke="#3b82f6" 
                strokeWidth={2}
                dot={{ fill: '#3b82f6' }}
              />
              <Line 
                type="monotone" 
                dataKey="Matrículas" 
                stroke="#00d4ff" 
                strokeWidth={2}
                dot={{ fill: '#00d4ff' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Heatmap */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-white">
            Heatmap de {metrica === 'leads' ? 'Leads' : 'Matrículas'} 2025
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setMetrica('leads')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                metrica === 'leads'
                  ? 'bg-emerald-500 text-slate-900'
                  : 'bg-slate-700 text-gray-400 hover:bg-slate-600'
              }`}
            >
              Leads
            </button>
            <button
              onClick={() => setMetrica('matriculas')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                metrica === 'matriculas'
                  ? 'bg-emerald-500 text-slate-900'
                  : 'bg-slate-700 text-gray-400 hover:bg-slate-600'
              }`}
            >
              Matrículas
            </button>
          </div>
        </div>
        
        {/* Heatmap Grid - Estilo Gestão */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="grid grid-cols-[120px_repeat(12,1fr)] gap-2">
            {/* Header - Meses */}
            <div />
            {MESES.map(mes => (
              <div key={mes} className="text-center text-xs font-bold text-slate-500 py-2">{mes}</div>
            ))}
            
            {/* Campo Grande */}
            <div className="flex items-center text-sm font-bold text-slate-300">Campo Grande</div>
            {dadosPorMes.map((d, idx) => {
              const valor = metrica === 'leads' ? d.cg_leads : d.cg_mat;
              return (
                <div 
                  key={idx} 
                  className={`aspect-square flex items-center justify-center rounded-lg text-xs font-black transition-transform hover:scale-110 cursor-default ${getHeatmapColor(valor)}`}
                >
                  {valor}
                </div>
              );
            })}
            
            {/* Recreio */}
            <div className="flex items-center text-sm font-bold text-slate-300">Recreio</div>
            {dadosPorMes.map((d, idx) => {
              const valor = metrica === 'leads' ? d.rec_leads : d.rec_mat;
              return (
                <div 
                  key={idx} 
                  className={`aspect-square flex items-center justify-center rounded-lg text-xs font-black transition-transform hover:scale-110 cursor-default ${getHeatmapColor(valor)}`}
                >
                  {valor}
                </div>
              );
            })}
            
            {/* Barra */}
            <div className="flex items-center text-sm font-bold text-slate-300">Barra</div>
            {dadosPorMes.map((d, idx) => {
              const valor = metrica === 'leads' ? d.barra_leads : d.barra_mat;
              return (
                <div 
                  key={idx} 
                  className={`aspect-square flex items-center justify-center rounded-lg text-xs font-black transition-transform hover:scale-110 cursor-default ${getHeatmapColor(valor)}`}
                >
                  {valor}
                </div>
              );
            })}
            
            {/* Linha TOTAL */}
            <div className="flex items-center text-sm font-black text-emerald-400">TOTAL</div>
            {dadosPorMes.map((d, idx) => {
              const valor = metrica === 'leads' ? d.total_leads : d.total_mat;
              return (
                <div 
                  key={idx} 
                  className={`aspect-square flex items-center justify-center rounded-lg text-xs font-black transition-transform hover:scale-110 cursor-default border-2 border-emerald-500/50 ${getHeatmapColorTotal(valor)}`}
                >
                  {valor}
                </div>
              );
            })}
          </div>
          
          {/* Legenda */}
          <div className="mt-8 space-y-3">
            <div className="flex gap-6 justify-center text-xs font-bold text-slate-500 uppercase tracking-widest">
              {metrica === 'matriculas' ? (
                <>
                  <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-pink-500/20" /> Baixo (&lt;10)</div>
                  <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-yellow-500/30" /> Médio (10-19)</div>
                  <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-accent-green/40" /> Alto (20-29)</div>
                  <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-accent-green/80" /> Excelente (≥30)</div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-pink-500/20" /> Baixo (&lt;150)</div>
                  <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-yellow-500/30" /> Médio (150-249)</div>
                  <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-accent-green/40" /> Alto (250-399)</div>
                  <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-accent-green/80" /> Excelente (≥400)</div>
                </>
              )}
            </div>
            <div className="text-center text-xs text-slate-600 italic">
              {metrica === 'matriculas' 
                ? 'Linha TOTAL usa escala 3x: Baixo (<30) | Médio (30-59) | Alto (60-89) | Excelente (≥90)'
                : 'Linha TOTAL usa escala 3x: Baixo (<450) | Médio (450-749) | Alto (750-1199) | Excelente (≥1200)'
              }
            </div>
          </div>
        </div>
      </div>

      {/* Insight */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5" />
          <div>
            <div className="text-amber-400 font-medium mb-1">Insight de Timing</div>
            <p className="text-gray-300 text-sm">
              O pico de <strong>Leads</strong> é em Fevereiro e Novembro.
              O pico de <strong>Matrículas</strong> é em Janeiro e Agosto.
              <br />
              <span className="text-gray-400">
                Existe um delay de ~1 mês entre geração de lead e matrícula.
                Ação: Intensificar captação em Dezembro e Abril para colher em Janeiro e Maio.
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ComercialSazonalidade;
