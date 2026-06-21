import React, { useMemo } from 'react';
import {
  BarChart3,
  LockKeyhole,
  Percent,
  Target,
  TrendingUp,
} from 'lucide-react';
import { useComercialResumoV2 } from '../../hooks/useComercialResumoV2';
import { useComercialSeriesMensaisV2 } from '../../hooks/useComercialSeriesMensaisV2';
import { UnidadeComercial } from '../../types/comercial';

interface Props {
  ano: number;
  unidade: UnidadeComercial;
  onAnoChange: (ano: number) => void;
  onUnidadeChange: (unidade: UnidadeComercial) => void;
}

export function ComercialVisaoGeral({ ano, unidade, onAnoChange, onUnidadeChange }: Props) {
  const { resumo, loading: loadingResumo, error: errorResumo } = useComercialResumoV2(ano, unidade);
  const { series, loading: loadingSeries, error: errorSeries } = useComercialSeriesMensaisV2(ano);

  const dadosPorUnidadeLeads = useMemo(() => {
    const totais = series.reduce(
      (acc, mes) => ({
        campoGrande: acc.campoGrande + mes.cg_leads,
        recreio: acc.recreio + mes.rec_leads,
        barra: acc.barra + mes.barra_leads,
      }),
      { campoGrande: 0, recreio: 0, barra: 0 },
    );

    return [
      { unidade: 'Campo Grande', leads: totais.campoGrande, color: '#10b981' },
      { unidade: 'Recreio', leads: totais.recreio, color: '#3b82f6' },
      { unidade: 'Barra', leads: totais.barra, color: '#f59e0b' },
    ];
  }, [series]);

  const totalLeadsUnidades = dadosPorUnidadeLeads.reduce((sum, row) => sum + row.leads, 0);
  const loading = loadingResumo || (unidade === 'Consolidado' && loadingSeries);
  const error = errorResumo || (unidade === 'Consolidado' ? errorSeries : null);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500" />
          <span className="text-gray-400">Carregando dados...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-400">
        <div className="text-xl mb-2">Erro ao carregar dados</div>
        <div className="text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-8 min-h-screen">
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 text-sm font-medium px-3 py-1 rounded-full mb-4">
          <BarChart3 className="w-4 h-4" /> Visao Geral
        </span>
        <h1 className="text-4xl lg:text-5xl font-grotesk font-bold text-white mb-2">
          O Ano de {ano} em <span className="text-emerald-400">Numeros</span>
        </h1>
        <p className="text-gray-400">
          Performance comercial {unidade === 'Consolidado' ? 'consolidada do Grupo LA Music' : `da unidade ${unidade}`}
        </p>
        <p className="text-xs text-yellow-300 mt-2">
          Fonte comercial v2 para leads. Matriculas comerciais aparecem apenas como diagnostico; distribuicao por unidade e taxa Exp-Mat seguem bloqueadas.
        </p>
      </div>

      <div className="flex flex-wrap gap-4 mb-8">
        <div className="flex gap-2 items-center">
          <span className="text-gray-400 text-sm">Ano:</span>
          {[2025].map((y) => (
            <button
              key={y}
              onClick={() => onAnoChange(y)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                ano === y
                  ? 'bg-emerald-500 text-white'
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
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-800 text-gray-400 hover:bg-slate-700'
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      {resumo && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <KPICard
            icon={TrendingUp}
            iconColor="text-blue-400"
            iconBg="bg-blue-500/20"
            value={resumo.leadsEntrantes.toLocaleString('pt-BR')}
            label="Leads Entrantes"
            helper="Fonte canonica v2"
          />

          <KPICard
            icon={Target}
            iconColor="text-yellow-300"
            iconBg="bg-yellow-500/20"
            value={resumo.matriculasComerciais.toLocaleString('pt-BR')}
            label="Matriculas Comerciais"
            helper="Diagnostico: criterio atual em validacao"
          />

          <KPICard
            icon={Percent}
            iconColor="text-purple-400"
            iconBg="bg-purple-500/20"
            value={`${resumo.taxaMatriculaComercial.toFixed(1)}%`}
            label="Taxa de Matricula Comercial"
            helper="Matriculas comerciais / leads"
          />

          <KPICard
            icon={LockKeyhole}
            iconColor="text-yellow-300"
            iconBg="bg-yellow-500/20"
            value="Bloqueada"
            label="Taxa Exp-Mat"
            helper="Aguardando regra canonica de presenca/vinculo"
          />
        </div>
      )}

      {unidade === 'Consolidado' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-white mb-1">Leads Entrantes por Unidade</h3>
            <p className="text-xs text-emerald-300 mb-6">
              Distribuicao anual calculada pela fonte comercial v2.
            </p>
            <div className="space-y-5">
              {dadosPorUnidadeLeads.map((item) => {
                const percentual = totalLeadsUnidades > 0 ? (item.leads / totalLeadsUnidades) * 100 : 0;

                return (
                  <div key={item.unidade}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-sm text-gray-300">{item.unidade}</span>
                      </div>
                      <span className="text-sm font-semibold text-white">
                        {item.leads.toLocaleString('pt-BR')} leads
                      </span>
                    </div>
                    <div className="h-3 bg-slate-700/70 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${percentual}%`, backgroundColor: item.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-white mb-1">Resumo Seguro por Unidade</h3>
            <p className="text-xs text-yellow-300 mb-4">
              Apenas leads por unidade estao publicados aqui. Matriculas por unidade aguardam regra canonica.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-gray-400 text-sm border-b border-slate-700">
                    <th className="pb-3">Unidade</th>
                    <th className="pb-3 text-right">Leads Entrantes</th>
                    <th className="pb-3 text-right">% do Total</th>
                    <th className="pb-3 text-right">Matriculas</th>
                  </tr>
                </thead>
                <tbody>
                  {dadosPorUnidadeLeads.map((row) => {
                    const percentual = totalLeadsUnidades > 0 ? (row.leads / totalLeadsUnidades) * 100 : 0;

                    return (
                      <tr key={row.unidade} className="border-b border-slate-700/50">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: row.color }} />
                            <span className="text-white">{row.unidade}</span>
                          </div>
                        </td>
                        <td className="py-3 text-right text-gray-300">{row.leads.toLocaleString('pt-BR')}</td>
                        <td className="py-3 text-right text-gray-300">{percentual.toFixed(1)}%</td>
                        <td className="py-3 text-right text-yellow-300">Bloqueado</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {unidade !== 'Consolidado' && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-1">Leitura por Unidade</h3>
          <p className="text-sm text-gray-400">
            Esta aba usa a fonte v2 para leads da unidade selecionada. Matriculas comerciais por unidade e taxa Exp-Mat seguem em validacao semantica.
          </p>
        </div>
      )}
    </div>
  );
}

interface KPICardProps {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  value: string;
  label: string;
  helper?: string;
}

function KPICard({ icon: Icon, iconColor, iconBg, value, label, helper }: KPICardProps) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 hover:border-slate-600/50 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 ${iconBg} rounded-xl`}>
          <Icon className={`w-6 h-6 ${iconColor}`} />
        </div>
      </div>
      <div className="text-4xl font-grotesk font-bold text-white mb-1">{value}</div>
      <div className="text-sm text-gray-400">{label}</div>
      {helper && (
        <div className="mt-2 text-xs text-gray-500">
          {helper}
        </div>
      )}
    </div>
  );
}

export default ComercialVisaoGeral;
