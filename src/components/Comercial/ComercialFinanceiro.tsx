import { useComercialData } from '../../hooks/useComercialData';
import { UnidadeComercial } from '../../types/comercial';
import { DollarSign, CreditCard, Wallet, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { ChartTooltip } from './ChartTooltip';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

interface Props {
  ano: number;
  unidade: UnidadeComercial;
  onAnoChange: (ano: number) => void;
  onUnidadeChange: (unidade: UnidadeComercial) => void;
}

export function ComercialFinanceiro({ ano, unidade, onAnoChange, onUnidadeChange }: Props) {
  const { kpis, loading } = useComercialData(ano, unidade);
  const { kpis: kpisCG, dadosMensais: dadosCG } = useComercialData(ano, 'Campo Grande');
  const { kpis: kpisRec, dadosMensais: dadosRec } = useComercialData(ano, 'Recreio');
  const { kpis: kpisBarra, dadosMensais: dadosBarra } = useComercialData(ano, 'Barra');

  if (loading || !kpis || !kpisCG || !kpisRec || !kpisBarra) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-cyan"></div>
      </div>
    );
  }

  // Dados para gráfico de evolução do ticket
  const ticketData = MESES.map((mes, idx) => {
    const mesNum = idx + 1;
    const cgMes = dadosCG?.find(d => d.mes === mesNum);
    const recMes = dadosRec?.find(d => d.mes === mesNum);
    const barraMes = dadosBarra?.find(d => d.mes === mesNum);

    return {
      mes,
      'Campo Grande': cgMes?.ticketMedioParcelas || null,
      'Recreio': recMes?.ticketMedioParcelas || null,
      'Barra': barraMes?.ticketMedioParcelas || null,
    };
  });

  // Dados para gráfico de faturamento passaporte
  const passaporteData = [
    { unidade: 'C. Grande', faturamento: kpisCG.faturamentoPassaporte, ticket: kpisCG.ticketMedioPassaporte },
    { unidade: 'Recreio', faturamento: kpisRec.faturamentoPassaporte, ticket: kpisRec.ticketMedioPassaporte },
    { unidade: 'Barra', faturamento: kpisBarra.faturamentoPassaporte, ticket: kpisBarra.ticketMedioPassaporte },
  ];

  return (
    <div className="p-8 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <span className="inline-block bg-accent-cyan/20 text-accent-cyan text-sm font-medium px-3 py-1 rounded-full mb-4">
          💰 Financeiro
        </span>
        <h1 className="text-4xl font-bold text-white mb-2">
          Ticket Médio e <span className="text-accent-cyan">Passaporte</span>
        </h1>
        <p className="text-gray-400">
          Análise financeira das novas matrículas
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-4 mb-8">
        <div className="flex gap-2 items-center">
          <span className="text-gray-400 text-sm">Unidade:</span>
          {(['Consolidado', 'Campo Grande', 'Recreio', 'Barra'] as UnidadeComercial[]).map((u) => (
            <button
              key={u}
              onClick={() => onUnidadeChange(u)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                unidade === u
                  ? 'bg-accent-cyan text-slate-900'
                  : 'bg-slate-800 text-gray-400 hover:bg-slate-700'
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-yellow-500/20 rounded-xl">
              <DollarSign className="w-6 h-6 text-yellow-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">
            R$ {kpis.ticketMedioParcelas.toFixed(0)}
          </div>
          <div className="text-sm text-gray-400">Ticket Médio Parcelas</div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-purple-500/20 rounded-xl">
              <CreditCard className="w-6 h-6 text-purple-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">
            R$ {kpis.ticketMedioPassaporte.toFixed(0)}
          </div>
          <div className="text-sm text-gray-400">Ticket Médio Passaporte</div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-accent-cyan/20 rounded-xl">
              <Wallet className="w-6 h-6 text-accent-cyan" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">
            R$ {(kpis.faturamentoPassaporte / 1000).toFixed(0)}k
          </div>
          <div className="text-sm text-gray-400">Faturamento Passaporte</div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-emerald-500/20 rounded-xl">
              <TrendingUp className="w-6 h-6 text-emerald-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">
            ~{kpis.ticketMedioPassaporte > 0 ? Math.round(kpis.faturamentoPassaporte / kpis.ticketMedioPassaporte) : 0}
          </div>
          <div className="text-sm text-gray-400">Passaportes Vendidos</div>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Evolução do Ticket */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">
            Evolução do Ticket Médio Parcelas
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ticketData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="mes" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" domain={[300, 500]} />
                <Tooltip 
                  content={<ChartTooltip valueFormatter={(value: number) => `R$ ${value.toFixed(0)}`} />}
                />
                <Legend />
                <Line type="monotone" dataKey="Campo Grande" stroke="#06b6d4" strokeWidth={2} dot={{ fill: '#06b6d4' }} connectNulls />
                <Line type="monotone" dataKey="Recreio" stroke="#a855f7" strokeWidth={2} dot={{ fill: '#a855f7' }} connectNulls />
                <Line type="monotone" dataKey="Barra" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Faturamento Passaporte */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">
            Faturamento Passaporte por Unidade
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={passaporteData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="unidade" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip 
                  content={<ChartTooltip valueFormatter={(value: number) => `R$ ${value.toLocaleString('pt-BR')}`} />}
                />
                <Bar dataKey="faturamento" fill="#00d4ff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tabela Comparativa */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-6">Comparativo por Unidade</h3>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-gray-400 text-sm font-medium py-3 px-4">Unidade</th>
                <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Ticket Parcelas</th>
                <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Ticket Passaporte</th>
                <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Fat. Passaporte</th>
                <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Passaportes</th>
              </tr>
            </thead>
            <tbody>
              {[
                { nome: 'Campo Grande', cor: 'cyan', kpis: kpisCG },
                { nome: 'Recreio', cor: 'purple', kpis: kpisRec },
                { nome: 'Barra', cor: 'emerald', kpis: kpisBarra },
              ].map((u) => (
                <tr key={u.nome} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                  <td className={`py-4 px-4 text-${u.cor}-400 font-medium`}>{u.nome}</td>
                  <td className="text-right text-white py-4 px-4">R$ {u.kpis.ticketMedioParcelas.toFixed(0)}</td>
                  <td className="text-right text-white py-4 px-4">R$ {u.kpis.ticketMedioPassaporte.toFixed(0)}</td>
                  <td className="text-right text-white py-4 px-4">R$ {u.kpis.faturamentoPassaporte.toLocaleString('pt-BR')}</td>
                  <td className="text-right text-white py-4 px-4">~{u.kpis.ticketMedioPassaporte > 0 ? Math.round(u.kpis.faturamentoPassaporte / u.kpis.ticketMedioPassaporte) : 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default ComercialFinanceiro;
