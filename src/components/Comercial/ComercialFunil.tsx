import { AlertTriangle, LockKeyhole, Target, TrendingDown } from 'lucide-react';
import { useComercialResumoV2 } from '../../hooks/useComercialResumoV2';
import { useComercialSeriesMensaisV2 } from '../../hooks/useComercialSeriesMensaisV2';
import { UnidadeComercial } from '../../types/comercial';

interface Props {
  ano: number;
  unidade: UnidadeComercial;
  onAnoChange: (ano: number) => void;
  onUnidadeChange: (unidade: UnidadeComercial) => void;
}

export function ComercialFunil({ ano, unidade, onAnoChange, onUnidadeChange }: Props) {
  const { resumo, loading: loadingResumo, error: errorResumo } = useComercialResumoV2(ano, unidade);
  const { series, loading: loadingSeries, error: errorSeries } = useComercialSeriesMensaisV2(ano);
  const loading = loadingResumo || (unidade === 'Consolidado' && loadingSeries);
  const error = errorResumo || (unidade === 'Consolidado' ? errorSeries : null);

  const totaisUnidade = series.reduce(
    (acc, mes) => ({
      campoGrande: acc.campoGrande + mes.cg_leads,
      recreio: acc.recreio + mes.rec_leads,
      barra: acc.barra + mes.barra_leads,
    }),
    { campoGrande: 0, recreio: 0, barra: 0 },
  );

  const unidadesData = [
    { nome: 'Campo Grande', leads: totaisUnidade.campoGrande, cor: 'text-cyan-400' },
    { nome: 'Recreio', leads: totaisUnidade.recreio, cor: 'text-purple-400' },
    { nome: 'Barra', leads: totaisUnidade.barra, cor: 'text-emerald-400' },
  ];

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
        <div className="text-xl mb-2">Erro ao carregar funil</div>
        <div className="text-sm">{error}</div>
      </div>
    );
  }

  const leads = resumo?.leadsEntrantes || 0;
  const experimentaisOperacionais = resumo?.experimentaisOperacionais || 0;
  const matriculasComerciais = resumo?.matriculasComerciais || 0;
  const taxaMatriculaComercial = resumo?.taxaMatriculaComercial || 0;

  return (
    <div className="p-8 min-h-screen">
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 text-sm font-medium px-3 py-1 rounded-full mb-4">
          <Target className="w-4 h-4" /> Funil Comercial
        </span>
        <h1 className="text-4xl lg:text-5xl font-grotesk font-bold text-white mb-2">
          Jornada do <span className="text-emerald-400">Lead</span>
        </h1>
        <p className="text-gray-400">
          Leads pela fonte v2. Experimentais e matriculas aparecem como diagnostico ate a reconciliacao ficar canonica.
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

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8 mb-8">
        <h2 className="text-xl font-semibold text-white mb-8 text-center">
          Funil Diagnostico {ano}
        </h2>

        <div className="flex flex-col items-center gap-2">
          <FunnelStep
            color="from-blue-500 to-blue-600"
            width="max-w-2xl"
            rounded="rounded-t-xl"
            value={leads.toLocaleString('pt-BR')}
            label="LEADS ENTRANTES"
            detail="Fonte canonica v2"
          />

          <FunnelConnector label="Lead -> Experimental em validacao" />

          <FunnelStep
            color="from-cyan-500 to-cyan-600"
            width="max-w-xl"
            value={experimentaisOperacionais.toLocaleString('pt-BR')}
            label="EXPERIMENTAIS OPERACIONAIS"
            detail="Diagnostico; presenca/vinculo ainda em revisao"
          />

          <FunnelConnector label="Exp -> Mat BLOQUEADA" warning />

          <FunnelStep
            color="from-emerald-500 to-emerald-600"
            width="max-w-md"
            rounded="rounded-b-xl"
            value={matriculasComerciais.toLocaleString('pt-BR')}
            label="MATRICULAS COMERCIAIS"
            detail="Diagnostico; criterio atual em validacao"
          />
        </div>

        <div className="mt-8 text-center">
          <div className="inline-block bg-slate-700/50 rounded-xl px-8 py-4">
            <div className="text-sm text-gray-400 mb-1">Taxa de Matricula Comercial</div>
            <div className="text-4xl font-bold text-emerald-400">{taxaMatriculaComercial.toFixed(1)}%</div>
            <div className="text-sm text-gray-500 mt-1">Matriculas comerciais / Leads</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-yellow-500/20 rounded-lg">
              <LockKeyhole className="w-5 h-5 text-yellow-300" />
            </div>
            <h3 className="text-lg font-semibold text-yellow-300">Taxa Exp-Mat bloqueada</h3>
          </div>
          <p className="text-gray-300 text-sm">
            Nao calcular perdas ou conversao Experimental para Matricula ate haver presenca individual e vinculo lead/aluno confiaveis.
          </p>
        </div>

        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <TrendingDown className="w-5 h-5 text-red-400" />
            </div>
            <h3 className="text-lg font-semibold text-red-400">Perdas em validacao</h3>
          </div>
          <p className="text-gray-300 text-sm">
            Perdas de funil antigas dependiam de snapshot. Esta tela nao publica perda Exp-Mat nem ranking de conversao enquanto a regra estiver aberta.
          </p>
        </div>
      </div>

      {unidade === 'Consolidado' && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Leads Entrantes por Unidade</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left text-gray-400 text-sm font-medium py-3 px-4">Unidade</th>
                  <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Leads Entrantes</th>
                  <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Experimentais</th>
                  <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Matriculas</th>
                  <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Exp-Mat</th>
                </tr>
              </thead>
              <tbody>
                {unidadesData.map((row) => (
                  <tr key={row.nome} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                    <td className="py-4 px-4">
                      <span className={`${row.cor} font-medium`}>{row.nome}</span>
                    </td>
                    <td className="text-right text-white py-4 px-4">{row.leads.toLocaleString('pt-BR')}</td>
                    <td className="text-right text-yellow-300 py-4 px-4">Diagnostico</td>
                    <td className="text-right text-yellow-300 py-4 px-4">Bloqueado por unidade</td>
                    <td className="text-right text-yellow-300 py-4 px-4">Bloqueada</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5" />
              <div>
                <div className="text-amber-400 font-medium mb-1">Nota de Controle</div>
                <p className="text-gray-300 text-sm">
                  Esta tela publica apenas Leads Entrantes por unidade como dado canonico. Os demais campos ficam bloqueados ou diagnosticos ate fechamento da reconciliacao.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface FunnelStepProps {
  color: string;
  width: string;
  value: string;
  label: string;
  detail: string;
  rounded?: string;
}

function FunnelStep({ color, width, value, label, detail, rounded = '' }: FunnelStepProps) {
  return (
    <div className={`w-full ${width}`}>
      <div className={`bg-gradient-to-r ${color} ${rounded} py-6 px-8 text-center`}>
        <div className="text-3xl font-grotesk font-bold text-white">{value}</div>
        <div className="text-white/90 text-sm">{label}</div>
        <div className="text-white/70 text-xs mt-1">{detail}</div>
      </div>
    </div>
  );
}

function FunnelConnector({ label, warning = false }: { label: string; warning?: boolean }) {
  return (
    <div className="flex items-center gap-4 py-2">
      <div className="text-gray-500">↓</div>
      <div className={`${warning ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-slate-700/50'} px-4 py-1 rounded-full`}>
        <span className={warning ? 'text-yellow-300 font-semibold' : 'text-emerald-400 font-semibold'}>{label}</span>
      </div>
      <div className="text-gray-500">↓</div>
    </div>
  );
}

export default ComercialFunil;
