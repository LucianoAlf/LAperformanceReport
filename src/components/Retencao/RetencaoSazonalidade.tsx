import { Calendar, TrendingUp, TrendingDown } from 'lucide-react';
import { useEvasoesData } from '../../hooks/useEvasoesData';
import { UnidadeRetencao, MESES_ABREV } from '../../types/retencao';

interface RetencaoSazonalidadeProps {
  ano: number;
  unidade: UnidadeRetencao;
}

export function RetencaoSazonalidade({ ano, unidade }: RetencaoSazonalidadeProps) {
  const { dadosMensais, loading } = useEvasoesData(ano, unidade);

  // Calcular max para escala do heatmap
  const maxEvasoes = Math.max(...dadosMensais.map(d => d.evasoes), 1);

  // Função para cor do heatmap
  const getHeatmapColor = (valor: number) => {
    const intensidade = valor / maxEvasoes;
    if (intensidade >= 0.8) return 'bg-red-500';
    if (intensidade >= 0.6) return 'bg-orange-500';
    if (intensidade >= 0.4) return 'bg-yellow-500';
    if (intensidade >= 0.2) return 'bg-green-400';
    return 'bg-green-600';
  };

  // Identificar meses críticos e bons
  const mesesOrdenados = [...dadosMensais].sort((a, b) => b.evasoes - a.evasoes);
  const mesesCriticos = mesesOrdenados.slice(0, 3);
  const mesesBons = mesesOrdenados.slice(-3).reverse();

  // Dados por trimestre
  const trimestres = [
    { nome: 'Q1', meses: ['Jan', 'Fev', 'Mar'], dados: dadosMensais.filter(d => ['Jan', 'Fev', 'Mar'].includes(d.mesAbrev)) },
    { nome: 'Q2', meses: ['Abr', 'Mai', 'Jun'], dados: dadosMensais.filter(d => ['Abr', 'Mai', 'Jun'].includes(d.mesAbrev)) },
    { nome: 'Q3', meses: ['Jul', 'Ago', 'Set'], dados: dadosMensais.filter(d => ['Jul', 'Ago', 'Set'].includes(d.mesAbrev)) },
    { nome: 'Q4', meses: ['Out', 'Nov', 'Dez'], dados: dadosMensais.filter(d => ['Out', 'Nov', 'Dez'].includes(d.mesAbrev)) },
  ];

  return (
    <div className="min-h-screen p-8 bg-slate-950">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Sazonalidade</h2>
        <p className="text-gray-400">Padrões de evasão ao longo do ano</p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rose-500"></div>
        </div>
      )}

      {!loading && (
        <>
          {/* Heatmap Mensal */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 mb-8">
            <h3 className="text-lg font-semibold text-white mb-6">Mapa de Calor - Evasões por Mês</h3>
            <div className="grid grid-cols-12 gap-2">
              {MESES_ABREV.map((mes, index) => {
                const dados = dadosMensais.find(d => d.mesAbrev === mes);
                const evasoes = dados?.evasoes || 0;
                const cor = getHeatmapColor(evasoes);
                
                return (
                  <div key={mes} className="text-center">
                    <div className="text-gray-400 text-xs mb-2">{mes}</div>
                    <div 
                      className={`${cor} rounded-lg p-4 transition-transform hover:scale-105 cursor-pointer`}
                      title={`${mes}: ${evasoes} evasões`}
                    >
                      <div className="text-white font-bold text-lg">{evasoes}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Legenda */}
            <div className="flex items-center justify-center gap-4 mt-6">
              <span className="text-gray-400 text-sm">Menos evasões</span>
              <div className="flex gap-1">
                <div className="w-6 h-4 bg-green-600 rounded"></div>
                <div className="w-6 h-4 bg-green-400 rounded"></div>
                <div className="w-6 h-4 bg-yellow-500 rounded"></div>
                <div className="w-6 h-4 bg-orange-500 rounded"></div>
                <div className="w-6 h-4 bg-red-500 rounded"></div>
              </div>
              <span className="text-gray-400 text-sm">Mais evasões</span>
            </div>
          </div>

          {/* Grid de Insights */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Meses Críticos */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <TrendingUp className="w-6 h-6 text-red-400" />
                <h3 className="text-lg font-semibold text-white">Meses Críticos</h3>
              </div>
              <div className="space-y-3">
                {mesesCriticos.map((mes, index) => (
                  <div key={mes.mesAbrev} className="flex items-center justify-between bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                        <span className="text-red-400 font-bold">{index + 1}</span>
                      </div>
                      <span className="text-white font-medium">{mes.mesAbrev}</span>
                    </div>
                    <div className="text-red-400 font-bold">{mes.evasoes} evasões</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Meses com Menos Evasões */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <TrendingDown className="w-6 h-6 text-green-400" />
                <h3 className="text-lg font-semibold text-white">Melhores Meses</h3>
              </div>
              <div className="space-y-3">
                {mesesBons.map((mes, index) => (
                  <div key={mes.mesAbrev} className="flex items-center justify-between bg-green-500/10 border border-green-500/30 rounded-xl p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                        <span className="text-green-400 font-bold">{index + 1}</span>
                      </div>
                      <span className="text-white font-medium">{mes.mesAbrev}</span>
                    </div>
                    <div className="text-green-400 font-bold">{mes.evasoes} evasões</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Análise por Trimestre */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-white mb-6">Análise por Trimestre</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {trimestres.map((trimestre) => {
                const totalEvasoes = trimestre.dados.reduce((sum, d) => sum + d.evasoes, 0);
                const totalMRR = trimestre.dados.reduce((sum, d) => sum + d.mrrPerdido, 0);
                
                return (
                  <div key={trimestre.nome} className="bg-slate-900/50 border border-slate-700/30 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Calendar className="w-5 h-5 text-rose-400" />
                      <span className="text-white font-semibold">{trimestre.nome}</span>
                      <span className="text-gray-400 text-sm">({trimestre.meses.join(', ')})</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-400 text-sm">Evasões</span>
                        <span className="text-white font-bold">{totalEvasoes}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400 text-sm">MRR Perdido</span>
                        <span className="text-rose-400 font-semibold">
                          R$ {(totalMRR / 1000).toFixed(1)}k
                        </span>
                      </div>
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
