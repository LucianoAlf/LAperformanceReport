import { useComercialData } from '../../hooks/useComercialData';
import { UnidadeComercial } from '../../types/comercial';
import { TrendingDown, Lightbulb, AlertTriangle, Target } from 'lucide-react';

interface Props {
  ano: number;
  unidade: UnidadeComercial;
  onAnoChange: (ano: number) => void;
  onUnidadeChange: (unidade: UnidadeComercial) => void;
}

export function ComercialFunil({ ano, unidade, onAnoChange, onUnidadeChange }: Props) {
  const { kpis, loading } = useComercialData(ano, unidade);
  const { kpis: kpisCG } = useComercialData(ano, 'Campo Grande');
  const { kpis: kpisRec } = useComercialData(ano, 'Recreio');
  const { kpis: kpisBarra } = useComercialData(ano, 'Barra');

  if (loading || !kpis || !kpisCG || !kpisRec || !kpisBarra) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  const perdasLeadExp = kpis.totalLeads - kpis.aulasExperimentais;
  const taxaPerdasLeadExp = ((perdasLeadExp / kpis.totalLeads) * 100).toFixed(1);

  const unidadesData = [
    { nome: 'Campo Grande', kpis: kpisCG, cor: 'cyan' },
    { nome: 'Recreio', kpis: kpisRec, cor: 'purple' },
    { nome: 'Barra', kpis: kpisBarra, cor: 'emerald' },
  ];

  const melhorTaxaLeadMatricula = Math.max(
    kpisCG.taxaConversaoTotal,
    kpisRec.taxaConversaoTotal,
    kpisBarra.taxaConversaoTotal
  );

  return (
    <div className="p-8 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 text-sm font-medium px-3 py-1 rounded-full mb-4">
          <Target className="w-4 h-4" /> Funil Lead → Matrícula
        </span>
        <h1 className="text-4xl lg:text-5xl font-grotesk font-bold text-white mb-2">
          Jornada do <span className="text-emerald-400">Lead à Matrícula</span>
        </h1>
        <p className="text-gray-400">
          Lead → Experimental e Lead → Matrícula; Exp → Mat segue bloqueada
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-4 mb-8">
        <div className="flex gap-2 items-center">
          <span className="text-gray-400 text-sm">Ano:</span>
          {[2025].map((y) => (
            <button
              key={y}
              onClick={() => onAnoChange(y)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                ano === y
                  ? 'bg-emerald-500 text-slate-900'
                  : 'bg-slate-800 text-gray-400 hover:bg-slate-700'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-gray-400 text-sm">Unidade:</span>
          {(['Consolidado', 'Campo Grande', 'Recreio', 'Barra'] as UnidadeComercial[]).map((u) => (
            <button
              key={u}
              onClick={() => onUnidadeChange(u)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                unidade === u
                  ? 'bg-emerald-500 text-slate-900'
                  : 'bg-slate-800 text-gray-400 hover:bg-slate-700'
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      {/* Funil Visual */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8 mb-8">
        <h2 className="text-xl font-semibold text-white mb-8 text-center">
          Funil Lead → Matrícula {ano}
        </h2>
        
        <div className="flex flex-col items-center gap-2">
          {/* Leads */}
          <div className="w-full max-w-2xl">
            <div 
              className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-t-xl py-6 px-8 text-center"
            >
              <div className="text-3xl font-grotesk font-bold text-white">
                {kpis.totalLeads.toLocaleString('pt-BR')}
              </div>
              <div className="text-blue-100 text-sm">LEADS GERADOS</div>
            </div>
          </div>

          {/* Seta + Taxa */}
          <div className="flex items-center gap-4 py-2">
            <div className="text-gray-500">↓</div>
            <div className="bg-slate-700/50 px-4 py-1 rounded-full">
              <span className="text-emerald-400 font-semibold">{kpis.taxaLeadExp.toFixed(1)}%</span>
              <span className="text-gray-400 text-sm ml-2">converteram</span>
            </div>
            <div className="text-gray-500">↓</div>
          </div>

          {/* Experimentais */}
          <div className="w-full max-w-xl">
            <div 
              className="bg-gradient-to-r from-cyan-500 to-cyan-600 py-6 px-8 text-center"
            >
              <div className="text-3xl font-grotesk font-bold text-white">
                {kpis.aulasExperimentais.toLocaleString('pt-BR')}
              </div>
              <div className="text-cyan-100 text-sm">AULAS EXPERIMENTAIS</div>
            </div>
          </div>

          {/* Seta + Taxa */}
          <div className="flex items-center gap-4 py-2">
            <div className="text-gray-500">↓</div>
            <div className="bg-yellow-500/10 border border-yellow-500/30 px-4 py-1 rounded-full">
              <span className="text-yellow-300 font-semibold">BLOQUEADA</span>
              <span className="text-gray-400 text-sm ml-2">aguarda presença/vínculo</span>
            </div>
            <div className="text-gray-500">↓</div>
          </div>

          {/* Matrículas */}
          <div className="w-full max-w-md">
            <div 
              className="bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-b-xl py-6 px-8 text-center"
            >
              <div className="text-3xl font-grotesk font-bold text-white">
                {kpis.novasMatriculas.toLocaleString('pt-BR')}
              </div>
              <div className="text-emerald-100 text-sm">NOVAS MATRÍCULAS</div>
            </div>
          </div>
        </div>

        {/* Taxa Total */}
        <div className="mt-8 text-center">
          <div className="inline-block bg-slate-700/50 rounded-xl px-8 py-4">
            <div className="text-sm text-gray-400 mb-1">Taxa Lead → Matrícula</div>
            <div className="text-4xl font-bold text-emerald-400">
              {kpis.taxaConversaoTotal.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-500 mt-1">Lead → Matrícula</div>
          </div>
        </div>
      </div>

      {/* Cards de Análise */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Perdas no Funil */}
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <TrendingDown className="w-5 h-5 text-red-400" />
            </div>
            <h3 className="text-lg font-semibold text-red-400">Perdas no Funil</h3>
          </div>
          
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Lead → Experimental</span>
                <span className="text-red-400 font-medium">{perdasLeadExp.toLocaleString('pt-BR')} perdidos</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-red-500 rounded-full"
                  style={{ width: `${taxaPerdasLeadExp}%` }}
                />
              </div>
              <div className="text-xs text-gray-500 mt-1">{taxaPerdasLeadExp}% dos leads não agendaram experimental</div>
            </div>
            
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Experimental → Matrícula</span>
                <span className="text-yellow-300 font-medium">BLOQUEADA</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">Não calcular perdas Exp→Mat até presença individual + vínculo canônico.</div>
            </div>
          </div>
        </div>

        {/* Oportunidade */}
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-500/20 rounded-lg">
              <Lightbulb className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-emerald-400">Oportunidade</h3>
          </div>
          
          <div className="space-y-4">
            <p className="text-gray-300 text-sm">
              Se aumentar a taxa <strong>Lead → Experimental</strong> de {kpis.taxaLeadExp.toFixed(1)}% para <strong>15%</strong>:
            </p>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-xl font-bold text-emerald-400">
                  +{Math.round(kpis.totalLeads * 0.15 - kpis.aulasExperimentais)}
                </div>
                <div className="text-xs text-gray-500">experimentais</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-xl font-bold text-yellow-300">Bloqueado</div>
                <div className="text-xs text-gray-500">matrículas</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-xl font-bold text-yellow-300">Bloqueado</div>
                <div className="text-xs text-gray-500">faturamento/ano</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Comparativo por Unidade */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-6">Comparativo por Unidade</h3>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-gray-400 text-sm font-medium py-3 px-4">Unidade</th>
                <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Leads</th>
                <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Experimentais</th>
                <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Matrículas</th>
                <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Lead→Exp</th>
                <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Exp→Mat</th>
                <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Lead→Mat</th>
              </tr>
            </thead>
            <tbody>
              {unidadesData.map((u) => (
                <tr key={u.nome} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                  <td className="py-4 px-4">
                    <span className={`text-${u.cor}-400 font-medium`}>{u.nome}</span>
                  </td>
                  <td className="text-right text-white py-4 px-4">
                    {u.kpis.totalLeads.toLocaleString('pt-BR')}
                  </td>
                  <td className="text-right text-white py-4 px-4">
                    {u.kpis.aulasExperimentais.toLocaleString('pt-BR')}
                  </td>
                  <td className="text-right text-white py-4 px-4">
                    {u.kpis.novasMatriculas.toLocaleString('pt-BR')}
                  </td>
                  <td className="text-right py-4 px-4">
                    <span className={u.kpis.taxaLeadExp >= 15 ? 'text-emerald-400' : u.kpis.taxaLeadExp >= 10 ? 'text-yellow-400' : 'text-red-400'}>
                      {u.kpis.taxaLeadExp.toFixed(1)}%
                    </span>
                  </td>
                  <td className="text-right py-4 px-4">
                    <span className="text-yellow-300">Bloqueada</span>
                  </td>
                  <td className="text-right py-4 px-4">
                    <span className={`font-bold ${u.kpis.taxaConversaoTotal === melhorTaxaLeadMatricula ? 'text-emerald-400' : 'text-white'}`}>
                      {u.kpis.taxaConversaoTotal.toFixed(1)}%
                      {u.kpis.taxaConversaoTotal === melhorTaxaLeadMatricula && ' 🏆'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Insight */}
        <div className="mt-6 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5" />
            <div>
              <div className="text-amber-400 font-medium mb-1">Nota de Controle</div>
              <p className="text-gray-300 text-sm">
                A comparação acima usa apenas taxas seguras: <strong>Lead → Experimental</strong> e <strong>Lead → Matrícula</strong>.
                A taxa <strong>Experimental → Matrícula</strong> permanece bloqueada até fechar presença individual + vínculo canônico.
                <br />
                <span className="text-gray-400">Ação: usar este bloco para leitura de funil sem publicar Exp→Mat como KPI oficial.</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ComercialFunil;
