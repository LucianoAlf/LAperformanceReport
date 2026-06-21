import { BarChart3, LockKeyhole, TrendingUp, Trophy } from 'lucide-react';
import { useComercialSeriesMensaisV2 } from '../../hooks/useComercialSeriesMensaisV2';

export function ComercialRanking() {
  const { series, loading, error } = useComercialSeriesMensaisV2(2025);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-400">
        <div className="text-xl mb-2">Erro ao carregar ranking</div>
        <div className="text-sm">{error}</div>
      </div>
    );
  }

  const totais = series.reduce(
    (acc, mes) => ({
      campoGrande: acc.campoGrande + mes.cg_leads,
      recreio: acc.recreio + mes.rec_leads,
      barra: acc.barra + mes.barra_leads,
    }),
    { campoGrande: 0, recreio: 0, barra: 0 },
  );

  const rankingLeads = [
    { nome: 'Campo Grande', valor: totais.campoGrande, cor: 'text-cyan-400', barra: 'bg-cyan-500' },
    { nome: 'Recreio', valor: totais.recreio, cor: 'text-purple-400', barra: 'bg-purple-500' },
    { nome: 'Barra', valor: totais.barra, cor: 'text-emerald-400', barra: 'bg-emerald-500' },
  ].sort((a, b) => b.valor - a.valor);

  const maiorValor = Math.max(...rankingLeads.map((item) => item.valor), 1);
  const totalLeads = rankingLeads.reduce((sum, item) => sum + item.valor, 0);

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

  const metricasBloqueadas = [
    'Taxa Lead-Matricula por unidade',
    'Taxa Exp-Mat',
    'Matriculas comerciais por unidade',
    'Ticket medio por origem comercial',
    '% Kids por conversao comercial',
  ];

  return (
    <div className="p-8 min-h-screen">
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-500 text-sm font-medium px-3 py-1 rounded-full mb-4">
          <Trophy className="w-4 h-4" /> Ranking
        </span>
        <h1 className="text-4xl lg:text-5xl font-grotesk font-bold text-white mb-2">
          Ranking entre <span className="text-emerald-500">Unidades</span>
        </h1>
        <p className="text-gray-400">
          Ranking seguro com Leads Entrantes pela fonte comercial v2.
        </p>
        <p className="mt-2 text-sm text-yellow-300">
          Rankings de conversao, matriculas por unidade e Exp-Mat seguem bloqueados ate fechar regra canonica.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-semibold text-white">Volume de Leads Entrantes 2025</h3>
          </div>

          <div className="space-y-5">
            {rankingLeads.map((item, idx) => {
              const percentualDoMaior = (item.valor / maiorValor) * 100;
              const percentualDoTotal = totalLeads > 0 ? (item.valor / totalLeads) * 100 : 0;

              return (
                <div key={item.nome}>
                  <div className="flex items-center gap-4 mb-2">
                    <div className={`w-8 h-8 rounded-full ${getMedalBg(idx)} flex items-center justify-center`}>
                      <span className={`font-bold ${getMedalColor(idx)}`}>{idx + 1}</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-white font-medium">{item.nome}</span>
                        <span className={`font-bold ${item.cor}`}>
                          {item.valor.toLocaleString('pt-BR')} leads
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">{percentualDoTotal.toFixed(1)}% do total</div>
                    </div>
                  </div>
                  <div className="ml-12 h-3 bg-slate-700/70 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${item.barra}`} style={{ width: `${percentualDoMaior}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg font-semibold text-white">Total Consolidado</h3>
          </div>
          <div className="text-5xl font-grotesk font-bold text-white mb-2">
            {totalLeads.toLocaleString('pt-BR')}
          </div>
          <div className="text-sm text-gray-400">Leads Entrantes em 2025</div>
          <div className="mt-6 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4">
            <div className="text-sm text-emerald-300 font-medium mb-1">Fonte publicada</div>
            <div className="text-xs text-gray-400">RPC comercial canonica v2, serie mensal consolidada.</div>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <LockKeyhole className="w-5 h-5 text-yellow-300" />
          <h3 className="text-lg font-semibold text-white">Rankings Bloqueados</h3>
        </div>
        <p className="text-sm text-gray-400 mb-5">
          Estes rankings existiam na versao antiga, mas dependiam de snapshot ou regra ainda nao canonica. Eles nao devem ser publicados como verdade operacional.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {metricasBloqueadas.map((metrica) => (
            <div key={metrica} className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4">
              <div className="text-sm font-medium text-yellow-300">{metrica}</div>
              <div className="text-xs text-gray-500 mt-1">Aguardando regra canonica / reconciliacao.</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ComercialRanking;
