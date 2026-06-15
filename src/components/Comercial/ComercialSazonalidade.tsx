import { useState } from 'react';
import { useComercialSeriesMensaisV2, ordenarSeriesPorMetrica } from '../../hooks/useComercialSeriesMensaisV2';
import { TrendingUp, TrendingDown, AlertTriangle, Calendar } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ChartTooltip } from './ChartTooltip';

type MetricaAtual = 'leads' | 'matriculas';

function formatarInteiro(valor: number): string {
  return valor.toLocaleString('pt-BR');
}

function getHeatmapColor(valor: number, maximo: number) {
  if (maximo <= 0 || valor <= 0) return 'bg-pink-500/20 text-pink-400';

  const proporcao = valor / maximo;
  if (proporcao >= 0.75) return 'bg-accent-green/80 text-white';
  if (proporcao >= 0.5) return 'bg-accent-green/40 text-accent-green';
  if (proporcao >= 0.25) return 'bg-yellow-500/30 text-yellow-400';
  return 'bg-pink-500/20 text-pink-400';
}

export function ComercialSazonalidade() {
  const [metrica, setMetrica] = useState<MetricaAtual>('matriculas');
  const { series: dadosPorMes, loading, error } = useComercialSeriesMensaisV2(2025);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 min-h-screen">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
            <div>
              <div className="text-red-300 font-medium mb-1">Erro ao carregar sazonalidade comercial</div>
              <p className="text-gray-300 text-sm">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const chartData = dadosPorMes.map((d) => ({
    mes: d.mes,
    'Leads Entrantes': d.total_leads,
    'Matrículas Comerciais': d.total_mat,
  }));

  const mesesPorMatriculas = ordenarSeriesPorMetrica(dadosPorMes, 'matriculas');
  const melhoresMeses = mesesPorMatriculas.slice(0, 3);
  const pioresMeses = [...mesesPorMatriculas].reverse().slice(0, 3);
  const maiorLead = ordenarSeriesPorMetrica(dadosPorMes, 'leads')[0];
  const maiorMatricula = mesesPorMatriculas[0];
  const metricaLabel = metrica === 'leads' ? 'Leads Entrantes' : 'Matrículas Comerciais';

  const valoresUnidade = dadosPorMes.flatMap((d) => (
    metrica === 'leads'
      ? [d.cg_leads, d.rec_leads, d.barra_leads]
      : [d.cg_mat, d.rec_mat, d.barra_mat]
  ));
  const valoresTotais = dadosPorMes.map((d) => (metrica === 'leads' ? d.total_leads : d.total_mat));
  const maxUnidade = Math.max(...valoresUnidade, 0);
  const maxTotal = Math.max(...valoresTotais, 0);

  return (
    <div className="p-8 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 text-sm font-medium px-3 py-1 rounded-full mb-4">
          <Calendar className="w-4 h-4" /> Sazonalidade
        </span>
        <h1 className="text-4xl lg:text-5xl font-grotesk font-bold text-white mb-2">
          Padrões <span className="text-emerald-400">Calculados</span>
        </h1>
        <p className="text-gray-400">
          Série mensal comercial v2 baseada em leads entrantes e matrículas comerciais
        </p>
      </div>

      {/* Cards de Meses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-500/20 rounded-lg">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-emerald-400">Maior Matrícula Comercial</h3>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {melhoresMeses.map((m, idx) => (
              <div key={m.mes} className="text-center">
                <div className="text-3xl font-grotesk font-bold text-white">{m.mes.toUpperCase()}</div>
                <div className="text-emerald-400 font-semibold">{m.total_mat} mat.</div>
                {idx === 0 && <div className="text-yellow-400 text-xs mt-1">Maior mês</div>}
              </div>
            ))}
          </div>

          <div className="mt-4 text-sm text-gray-400">
            O maior volume de matrículas comerciais em 2025 aparece em{' '}
            <strong>{maiorMatricula?.mes || '-'}</strong>, com{' '}
            <strong>{formatarInteiro(maiorMatricula?.total_mat || 0)}</strong> matrículas comerciais.
          </div>
        </div>

        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <TrendingDown className="w-5 h-5 text-red-400" />
            </div>
            <h3 className="text-lg font-semibold text-red-400">Menor Matrícula Comercial</h3>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {pioresMeses.map((m, idx) => (
              <div key={m.mes} className="text-center">
                <div className="text-3xl font-grotesk font-bold text-white">{m.mes.toUpperCase()}</div>
                <div className="text-red-400 font-semibold">{m.total_mat} mat.</div>
                {idx === 0 && (
                  <div className="text-red-400 text-xs mt-1 flex items-center justify-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Menor mês
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 text-sm text-gray-400">
            Menor volume não define causa sozinho. Use este bloco como sinal para investigação comercial,
            sem assumir sazonalidade ou foco operacional sem validação.
          </div>
        </div>
      </div>

      {/* Gráfico de Linha */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 mb-8">
        <h3 className="text-lg font-semibold text-white mb-6">
          Evolução Mensal: Leads Entrantes vs Matrículas Comerciais
        </h3>

        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="mes" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                cursor={{ fill: '#1e293b' }}
                content={<ChartTooltip />}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="Leads Entrantes"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6' }}
              />
              <Line
                type="monotone"
                dataKey="Matrículas Comerciais"
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
            Heatmap de {metricaLabel} 2025
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
              Leads Entrantes
            </button>
            <button
              onClick={() => setMetrica('matriculas')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                metrica === 'matriculas'
                  ? 'bg-emerald-500 text-slate-900'
                  : 'bg-slate-700 text-gray-400 hover:bg-slate-600'
              }`}
            >
              Matrículas Comerciais
            </button>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="grid grid-cols-[120px_repeat(12,1fr)] gap-2">
            <div />
            {dadosPorMes.map((d) => (
              <div key={d.mes} className="text-center text-xs font-bold text-slate-500 py-2">{d.mes}</div>
            ))}

            <div className="flex items-center text-sm font-bold text-slate-300">Campo Grande</div>
            {dadosPorMes.map((d) => {
              const valor = metrica === 'leads' ? d.cg_leads : d.cg_mat;
              return (
                <div
                  key={d.mes}
                  className={`aspect-square flex items-center justify-center rounded-lg text-xs font-black transition-transform hover:scale-110 cursor-default ${getHeatmapColor(valor, maxUnidade)}`}
                >
                  {valor}
                </div>
              );
            })}

            <div className="flex items-center text-sm font-bold text-slate-300">Recreio</div>
            {dadosPorMes.map((d) => {
              const valor = metrica === 'leads' ? d.rec_leads : d.rec_mat;
              return (
                <div
                  key={d.mes}
                  className={`aspect-square flex items-center justify-center rounded-lg text-xs font-black transition-transform hover:scale-110 cursor-default ${getHeatmapColor(valor, maxUnidade)}`}
                >
                  {valor}
                </div>
              );
            })}

            <div className="flex items-center text-sm font-bold text-slate-300">Barra</div>
            {dadosPorMes.map((d) => {
              const valor = metrica === 'leads' ? d.barra_leads : d.barra_mat;
              return (
                <div
                  key={d.mes}
                  className={`aspect-square flex items-center justify-center rounded-lg text-xs font-black transition-transform hover:scale-110 cursor-default ${getHeatmapColor(valor, maxUnidade)}`}
                >
                  {valor}
                </div>
              );
            })}

            <div className="flex items-center text-sm font-black text-emerald-400">TOTAL</div>
            {dadosPorMes.map((d) => {
              const valor = metrica === 'leads' ? d.total_leads : d.total_mat;
              return (
                <div
                  key={d.mes}
                  className={`aspect-square flex items-center justify-center rounded-lg text-xs font-black transition-transform hover:scale-110 cursor-default border-2 border-emerald-500/50 ${getHeatmapColor(valor, maxTotal)}`}
                >
                  {valor}
                </div>
              );
            })}
          </div>

          <div className="mt-8 space-y-3">
            <div className="flex gap-6 justify-center text-xs font-bold text-slate-500 uppercase tracking-widest">
              <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-pink-500/20" /> Menor faixa</div>
              <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-yellow-500/30" /> Faixa intermediária</div>
              <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-accent-green/40" /> Faixa alta</div>
              <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-accent-green/80" /> Maior faixa</div>
            </div>
            <div className="text-center text-xs text-slate-600 italic">
              Escala relativa ao maior valor exibido para {metricaLabel.toLocaleLowerCase('pt-BR')}.
              A linha TOTAL usa escala própria.
            </div>
          </div>
        </div>
      </div>

      {/* Insight */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5" />
          <div>
            <div className="text-amber-400 font-medium mb-1">Leitura Calculada</div>
            <p className="text-gray-300 text-sm">
              Maior volume de <strong>Leads Entrantes</strong>: {maiorLead?.mes || '-'} ({formatarInteiro(maiorLead?.total_leads || 0)}).
              Maior volume de <strong> Matrículas Comerciais</strong>: {maiorMatricula?.mes || '-'} ({formatarInteiro(maiorMatricula?.total_mat || 0)}).
              <br />
              <span className="text-gray-400">
                Padrão calculado com base nos dados comerciais v2 de 2025. A causa de cada pico ou queda
                ainda precisa ser validada fora deste gráfico.
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ComercialSazonalidade;
