import { useState, useEffect } from 'react';
import { Users, DollarSign, Percent, Clock, AlertTriangle, Wallet, Calendar } from 'lucide-react';
import { KPICard } from '@/components/ui/KPICard';
import { DistributionChart } from '@/components/ui/DistributionChart';
import { EvolutionChart } from '@/components/ui/EvolutionChart';
import { MetaProgress } from '@/components/ui/MetaProgress';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { formatCurrency, getMesNomeCurto } from '@/lib/utils';
import { useKPIsGestao } from '@/hooks/useKPIsGestao';
import { useMetas } from '@/hooks/useMetas';
import { useMetasKPI } from '@/hooks/useMetasKPI';
import { supabase } from '@/lib/supabase';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';

interface TabDashboardProps {
  ano: number;
  mes: number;
  unidade: UnidadeId;
}

interface DadosUnidade {
  unidade_id: string;
  unidade_nome: string;
  alunos_ativos: number;
  alunos_pagantes: number;
  ticket_medio: number;
  churn_rate: number;
  tempo_permanencia: number;
  inadimplencia: number;
}

interface DadosMensais {
  mes: number;
  alunos_ativos: number;
  matriculas: number;
  evasoes: number;
  faturamento: number;
}

export function TabDashboard({ ano, mes, unidade }: TabDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<DadosUnidade[]>([]);
  const [evolucao, setEvolucao] = useState<DadosMensais[]>([]);
  
  // Buscar metas do período
  const unidadeIdParaMetas = unidade === 'todos' ? null : unidade;
  const { metas } = useMetasKPI(unidadeIdParaMetas, ano, mes);
  
  const [totais, setTotais] = useState({
    alunosAtivos: 0,
    alunosPagantes: 0,
    ticketMedio: 0,
    churnRate: 0,
    tempoPermanencia: 0,
    inadimplencia: 0,
    faturamentoPrevisto: 0,
    mrr: 0,
    arr: 0,
    ltv: 0,
  });

  useEffect(() => {
    async function fetchDados() {
      setLoading(true);
      try {
        // Buscar dados da view de dashboard
        const { data, error } = await supabase
          .from('vw_dashboard_unidade')
          .select('*');

        if (error) throw error;

        if (data) {
          setDados(data);

          // Calcular totais (consolidado ou filtrado)
          const filtered = unidade === 'todos' 
            ? data 
            : data.filter(d => {
                const codigo = d.unidade_id?.toLowerCase();
                if (unidade === 'cg') return codigo === 'cg' || codigo?.includes('campo');
                if (unidade === 'rec') return codigo === 'rec' || codigo?.includes('recreio');
                if (unidade === 'bar') return codigo === 'bar' || codigo?.includes('barra');
                return true;
              });

          const totalAtivos = filtered.reduce((acc, d) => acc + (d.alunos_ativos || 0), 0);
          const totalPagantes = filtered.reduce((acc, d) => acc + (d.alunos_pagantes || 0), 0);
          const avgTicket = filtered.length > 0 
            ? filtered.reduce((acc, d) => acc + (d.ticket_medio || 0), 0) / filtered.length 
            : 0;
          const avgChurn = filtered.length > 0 
            ? filtered.reduce((acc, d) => acc + (d.churn_rate || 0), 0) / filtered.length 
            : 0;
          const avgPermanencia = filtered.length > 0 
            ? filtered.reduce((acc, d) => acc + (d.tempo_permanencia || 0), 0) / filtered.length 
            : 0;
          const avgInadimplencia = filtered.length > 0 
            ? filtered.reduce((acc, d) => acc + (d.inadimplencia || 0), 0) / filtered.length 
            : 0;

          // Calcular MRR, ARR e LTV
          const mrr = totalPagantes * avgTicket;
          const arr = mrr * 12;
          const ltv = avgTicket * avgPermanencia;

          setTotais({
            alunosAtivos: totalAtivos,
            alunosPagantes: totalPagantes,
            ticketMedio: avgTicket,
            churnRate: avgChurn,
            tempoPermanencia: avgPermanencia,
            inadimplencia: avgInadimplencia,
            faturamentoPrevisto: mrr,
            mrr,
            arr,
            ltv,
          });
        }

        // Buscar evolução mensal (últimos 6 meses)
        const { data: evolucaoData } = await supabase
          .from('dados_mensais')
          .select('mes, alunos_ativos, matriculas, evasoes, faturamento')
          .eq('ano', ano)
          .order('mes', { ascending: true });

        if (evolucaoData) {
          setEvolucao(evolucaoData);
        }
      } catch (err) {
        console.error('Erro ao carregar dashboard:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchDados();
  }, [ano, mes, unidade]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
      </div>
    );
  }

  // Preparar dados para gráficos
  const distribuicaoUnidades = dados.map(d => ({
    name: d.unidade_nome || 'N/A',
    value: d.alunos_ativos || 0,
  }));

  const evolucaoChartData = evolucao.map(e => ({
    name: getMesNomeCurto(e.mes),
    alunos: e.alunos_ativos || 0,
    matriculas: e.matriculas || 0,
    evasoes: e.evasoes || 0,
  }));

  return (
    <div className="space-y-6">
      {/* KPI Cards - Linha 1 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KPICard
          icon={Users}
          label="Alunos Ativos"
          value={totais.alunosAtivos}
          variant="cyan"
        />
        <KPICard
          icon={Users}
          label="Alunos Pagantes"
          value={totais.alunosPagantes}
          target={metas.alunos_pagantes}
          format="number"
          variant="emerald"
        />
        <KPICard
          icon={DollarSign}
          label="Ticket Médio"
          value={totais.ticketMedio}
          target={metas.ticket_medio}
          format="currency"
          variant="violet"
        />
        <KPICard
          icon={Percent}
          label="Churn Rate"
          value={totais.churnRate}
          target={metas.churn_rate}
          format="percent"
          metaInversa={true}
          inverterCor={true}
          variant="rose"
        />
        <KPICard
          icon={Clock}
          label="Permanência"
          value={totais.tempoPermanencia}
          target={metas.tempo_permanencia}
          format="number"
          subvalue="meses"
          variant="amber"
        />
      </div>

      {/* KPI Cards - Linha 2 (Financeiros) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KPICard
          icon={Wallet}
          label="MRR"
          value={formatCurrency(totais.mrr)}
          subvalue="Receita Recorrente Mensal"
          variant="emerald"
        />
        <KPICard
          icon={Calendar}
          label="ARR"
          value={formatCurrency(totais.arr)}
          subvalue="Receita Recorrente Anual"
          variant="violet"
        />
        <KPICard
          icon={DollarSign}
          label="LTV Médio"
          value={formatCurrency(totais.ltv)}
          subvalue="Lifetime Value"
          variant="cyan"
        />
        <KPICard
          icon={AlertTriangle}
          label="Inadimplência"
          value={totais.inadimplencia}
          target={metas.inadimplencia}
          format="percent"
          metaInversa={true}
          inverterCor={true}
          variant="amber"
        />
        <KPICard
          icon={DollarSign}
          label="Faturamento Prev."
          value={formatCurrency(totais.faturamentoPrevisto)}
          variant="emerald"
        />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DistributionChart
          data={distribuicaoUnidades}
          title="Distribuição de Alunos por Unidade"
        />
        <EvolutionChart
          data={evolucaoChartData}
          title="Evolução Mensal"
          lines={[
            { dataKey: 'alunos', color: '#06b6d4', name: 'Alunos' },
            { dataKey: 'matriculas', color: '#10b981', name: 'Matrículas' },
            { dataKey: 'evasoes', color: '#ef4444', name: 'Evasões' },
          ]}
        />
      </div>

      {/* Resumo por Unidade */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-700/50">
          <h3 className="text-lg font-bold text-white">Resumo por Unidade</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50 text-xs text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4 text-left">Unidade</th>
                <th className="py-3 px-4 text-right">Alunos Ativos</th>
                <th className="py-3 px-4 text-right">Pagantes</th>
                <th className="py-3 px-4 text-right">Ticket Médio</th>
                <th className="py-3 px-4 text-right">MRR</th>
                <th className="py-3 px-4 text-right">LTV</th>
                <th className="py-3 px-4 text-right">Permanência</th>
              </tr>
            </thead>
            <tbody>
              {dados.map((d) => {
                const mrrUnidade = (d.alunos_pagantes || 0) * (d.ticket_medio || 0);
                const ltvUnidade = (d.ticket_medio || 0) * (d.tempo_permanencia || 0);
                return (
                  <tr key={d.unidade_id} className="border-b border-slate-700/30 hover:bg-slate-800/30">
                    <td className="py-3 px-4 font-medium text-white">{d.unidade_nome}</td>
                    <td className="py-3 px-4 text-right text-slate-300">{d.alunos_ativos}</td>
                    <td className="py-3 px-4 text-right text-slate-300">{d.alunos_pagantes}</td>
                    <td className="py-3 px-4 text-right text-slate-300">{formatCurrency(d.ticket_medio || 0)}</td>
                    <td className="py-3 px-4 text-right text-emerald-400 font-medium">
                      {formatCurrency(mrrUnidade)}
                    </td>
                    <td className="py-3 px-4 text-right text-cyan-400">
                      {formatCurrency(ltvUnidade)}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-300">
                      {(d.tempo_permanencia || 0).toFixed(1)} meses
                    </td>
                  </tr>
                );
              })}
              {/* Linha de Total */}
              <tr className="bg-slate-900/50 font-bold">
                <td className="py-3 px-4 text-white">TOTAL</td>
                <td className="py-3 px-4 text-right text-white">{totais.alunosAtivos}</td>
                <td className="py-3 px-4 text-right text-white">{totais.alunosPagantes}</td>
                <td className="py-3 px-4 text-right text-white">{formatCurrency(totais.ticketMedio)}</td>
                <td className="py-3 px-4 text-right text-emerald-400">{formatCurrency(totais.mrr)}</td>
                <td className="py-3 px-4 text-right text-cyan-400">{formatCurrency(totais.ltv)}</td>
                <td className="py-3 px-4 text-right text-white">{totais.tempoPermanencia.toFixed(1)} meses</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default TabDashboard;
