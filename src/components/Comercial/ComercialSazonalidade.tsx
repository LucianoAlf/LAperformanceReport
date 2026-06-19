import { useComercialSeriesMensaisV2, ordenarSeriesPorLeads } from '../../hooks/useComercialSeriesMensaisV2';
import { AlertTriangle, Calendar, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ChartTooltip } from './ChartTooltip';

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
  }));

  const mesesPorLeads = ordenarSeriesPorLeads(dadosPorMes);
  const maiorLead = mesesPorLeads[0];
  const menorLead = [...mesesPorLeads].reverse()[0];
  const totalLeads = dadosPorMes.reduce((total, mes) => total + mes.total_leads, 0);

  const valoresUnidade = dadosPorMes.flatMap((d) => [d.cg_leads, d.rec_leads, d.barra_leads]);
  const valoresTotais = dadosPorMes.map((d) => d.total_leads);
  const maxUnidade = Math.max(...valoresUnidade, 0);
  const maxTotal = Math.max(...valoresTotais, 0);

  return (
    <div className="p-8 min-h-screen">
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 text-sm font-medium px-3 py-1 rounded-full mb-4">
          <Calendar className="w-4 h-4" /> Sazonalidade
        </span>
        <h1 className="text-4xl lg:text-5xl font-grotesk font-bold text-white mb-2">
          Padrões <span className="text-emerald-400">Calculados</span>
        </h1>
        <p className="text-gray-400">
          Série mensal comercial v2 com foco em leads entrantes.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-500/20 rounded-lg">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-emerald-400">Leads Entrantes</h3>
          </div>
          <div className="text-4xl font-grotesk font-bold text-white">{formatarInteiro(totalLeads)}</div>
          <p className="mt-3 text-sm text-gray-400">
            Total consolidado de 2025 pela fonte canônica v2.
          </p>
        </div>

        <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Calendar className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-blue-400">Maior Mês de Leads</h3>
          </div>
          <div className="text-4xl font-grotesk font-bold text-white">{maiorLead?.mes?.toUpperCase() || '-'}</div>
          <p className="mt-3 text-sm text-gray-400">
            {formatarInteiro(maiorLead?.total_leads || 0)} leads entrantes no maior mês.
          </p>
        </div>
      </div>

      <div className="mb-8 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        Matrículas comerciais por unidade aguardam regra canônica.
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 mb-8">
        <h3 className="text-lg font-semibold text-white mb-6">
          Evolução Mensal: Leads Entrantes
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
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 mb-8">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-semibold text-white">
              Heatmap de Leads Entrantes 2025
            </h3>
            <p className="text-sm text-gray-400 mt-1">
              Distribuição mensal de leads por unidade pela fonte canônica v2.
            </p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="grid grid-cols-[120px_repeat(12,1fr)] gap-2">
            <div />
            {dadosPorMes.map((d) => (
              <div key={d.mes} className="text-center text-xs font-bold text-slate-500 py-2">{d.mes}</div>
            ))}

            <div className="flex items-center text-sm font-bold text-slate-300">Campo Grande</div>
            {dadosPorMes.map((d) => (
              <div
                key={d.mes}
                className={`aspect-square flex items-center justify-center rounded-lg text-xs font-black transition-transform hover:scale-110 cursor-default ${getHeatmapColor(d.cg_leads, maxUnidade)}`}
              >
                {d.cg_leads}
              </div>
            ))}

            <div className="flex items-center text-sm font-bold text-slate-300">Recreio</div>
            {dadosPorMes.map((d) => (
              <div
                key={d.mes}
                className={`aspect-square flex items-center justify-center rounded-lg text-xs font-black transition-transform hover:scale-110 cursor-default ${getHeatmapColor(d.rec_leads, maxUnidade)}`}
              >
                {d.rec_leads}
              </div>
            ))}

            <div className="flex items-center text-sm font-bold text-slate-300">Barra</div>
            {dadosPorMes.map((d) => (
              <div
                key={d.mes}
                className={`aspect-square flex items-center justify-center rounded-lg text-xs font-black transition-transform hover:scale-110 cursor-default ${getHeatmapColor(d.barra_leads, maxUnidade)}`}
              >
                {d.barra_leads}
              </div>
            ))}

            <div className="flex items-center text-sm font-black text-emerald-400">TOTAL</div>
            {dadosPorMes.map((d) => (
              <div
                key={d.mes}
                className={`aspect-square flex items-center justify-center rounded-lg text-xs font-black transition-transform hover:scale-110 cursor-default border-2 border-emerald-500/50 ${getHeatmapColor(d.total_leads, maxTotal)}`}
              >
                {d.total_leads}
              </div>
            ))}
          </div>

          <div className="mt-8 space-y-3">
            <div className="flex gap-6 justify-center text-xs font-bold text-slate-500 uppercase tracking-widest">
              <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-pink-500/20" /> Menor faixa</div>
              <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-yellow-500/30" /> Faixa intermediária</div>
              <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-accent-green/40" /> Faixa alta</div>
              <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-accent-green/80" /> Maior faixa</div>
            </div>
            <div className="text-center text-xs text-slate-600 italic">
              Escala relativa ao maior valor exibido para leads entrantes. A linha TOTAL usa escala própria.
            </div>
          </div>
        </div>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5" />
          <div>
            <div className="text-amber-400 font-medium mb-1">Leitura Calculada</div>
            <p className="text-gray-300 text-sm">
              Maior volume de <strong>Leads Entrantes</strong>: {maiorLead?.mes || '-'} ({formatarInteiro(maiorLead?.total_leads || 0)}).
              Menor volume de <strong> Leads Entrantes</strong>: {menorLead?.mes || '-'} ({formatarInteiro(menorLead?.total_leads || 0)}).
              <br />
              <span className="text-gray-400">
                Padrao calculado com base nos dados comerciais v2 de 2025. Matriculas comerciais por unidade aguardam
                regra canonica e nao sao publicadas nesta tela.
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ComercialSazonalidade;
