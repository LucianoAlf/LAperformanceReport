import { useState, useEffect } from 'react';
import { Phone, Calendar, UserPlus, Percent, DollarSign, TrendingUp, Archive, XCircle, Music, Clock } from 'lucide-react';
import { KPICard } from '@/components/ui/KPICard';
import { FunnelChart } from '@/components/ui/FunnelChart';
import { DistributionChart } from '@/components/ui/DistributionChart';
import { BarChartHorizontal } from '@/components/ui/BarChartHorizontal';
import { RankingTable } from '@/components/ui/RankingTable';
import { formatCurrency } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

interface TabComercialProps {
  ano: number;
  mes: number;
  unidade: string;
}

interface LeadDiario {
  id: number;
  data: string;
  tipo: string;
  quantidade: number;
  unidade_id: string;
  canal_origem_id: number;
  curso_id: number;
  professor_experimental_id: number;
  observacoes: string;
  arquivado?: boolean;
  motivo_arquivamento_id?: number;
}

interface CanalOrigem {
  id: number;
  nome: string;
}

interface Professor {
  id: number;
  nome: string;
}

export function TabComercial({ ano, mes, unidade }: TabComercialProps) {
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<LeadDiario[]>([]);
  const [canais, setCanais] = useState<CanalOrigem[]>([]);
  const [professores, setProfessores] = useState<Professor[]>([]);
  const [totais, setTotais] = useState({
    leads: 0,
    leadsArquivados: 0,
    experimentaisAgendadas: 0,
    experimentaisRealizadas: 0,
    taxaShowUp: 0,
    matriculas: 0,
    taxaConversao: 0,
    faturamentoNovo: 0,
    ticketMedioNovos: 0,
    passaportes: 0,
    faturamentoPassaportes: 0,
  });
  const [leadsPorCanal, setLeadsPorCanal] = useState<{name: string; value: number}[]>([]);
  const [matriculasPorProfessor, setMatriculasPorProfessor] = useState<{id: number; nome: string; valor: number}[]>([]);

  useEffect(() => {
    async function fetchDados() {
      setLoading(true);
      try {
        // Buscar leads do mês
        const startDate = `${ano}-${String(mes).padStart(2, '0')}-01`;
        const endDate = `${ano}-${String(mes).padStart(2, '0')}-31`;

        let query = supabase
          .from('leads')
          .select('*')
          .gte('data_contato', startDate)
          .lte('data_contato', endDate);

        // Filtrar por unidade se não for consolidado
        if (unidade !== 'todos') {
          const unidadeMap: Record<string, string> = {
            'cg': 'cg',
            'rec': 'rec',
            'bar': 'bar',
          };
          query = query.eq('unidade_id', unidadeMap[unidade] || unidade);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Buscar canais e professores para lookup
        const [canaisRes, professoresRes] = await Promise.all([
          supabase.from('canais_origem').select('id, nome'),
          supabase.from('professores').select('id, nome'),
        ]);

        if (canaisRes.data) setCanais(canaisRes.data);
        if (professoresRes.data) setProfessores(professoresRes.data);

        if (data) {
          setDados(data);

          // Calcular totais por tipo
          const leads = data.filter(d => ['novo','agendado'].includes(d.status)).reduce((acc, d) => acc + (d.quantidade || 1), 0);
          const leadsArquivados = data.filter(d => ['novo','agendado'].includes(d.status) && d.arquivado).reduce((acc, d) => acc + (d.quantidade || 1), 0);
          const experimentaisAgendadas = data.filter(d => d.status === 'experimental_agendada').reduce((acc, d) => acc + (d.quantidade || 1), 0);
          const experimentaisRealizadas = data.filter(d => ['experimental_realizada','compareceu'].includes(d.status)).reduce((acc, d) => acc + (d.quantidade || 1), 0);
          const taxaShowUp = experimentaisAgendadas > 0 ? (experimentaisRealizadas / experimentaisAgendadas) * 100 : 0;
          const matriculas = data.filter(d => ['matriculado','convertido'].includes(d.status)).reduce((acc, d) => acc + (d.quantidade || 1), 0);
          const taxaConversao = experimentaisRealizadas > 0 ? (matriculas / experimentaisRealizadas) * 100 : 0;

          // Buscar valor médio das matrículas para calcular faturamento novo
          const { data: alunosData } = await supabase
            .from('alunos')
            .select('valor_parcela, tipo_matricula_id')
            .gte('data_matricula', startDate)
            .lte('data_matricula', endDate);

          const faturamentoNovo = alunosData?.reduce((acc, a) => acc + (a.valor_parcela || 0), 0) || 0;
          const ticketMedioNovos = alunosData && alunosData.length > 0 ? faturamentoNovo / alunosData.length : 0;

          // Leads por canal
          const leadsPorCanalMap = new Map<number, number>();
          data.filter(d => ['novo','agendado'].includes(d.status)).forEach(d => {
            const canalId = d.canal_origem_id || 0;
            leadsPorCanalMap.set(canalId, (leadsPorCanalMap.get(canalId) || 0) + (d.quantidade || 1));
          });
          const leadsPorCanalData = Array.from(leadsPorCanalMap.entries()).map(([id, value]) => ({
            name: canaisRes.data?.find(c => c.id === id)?.nome || 'Outros',
            value,
          }));
          setLeadsPorCanal(leadsPorCanalData);

          // Matrículas por professor
          const matriculasPorProfMap = new Map<number, number>();
          data.filter(d => ['matriculado','convertido'].includes(d.status)).forEach(d => {
            const profId = d.professor_experimental_id || 0;
            matriculasPorProfMap.set(profId, (matriculasPorProfMap.get(profId) || 0) + (d.quantidade || 1));
          });
          const matriculasPorProfData = Array.from(matriculasPorProfMap.entries())
            .map(([id, valor]) => ({
              id,
              nome: professoresRes.data?.find(p => p.id === id)?.nome || 'N/A',
              valor,
            }))
            .sort((a, b) => b.valor - a.valor);
          setMatriculasPorProfessor(matriculasPorProfData);

          setTotais({
            leads,
            leadsArquivados,
            experimentaisAgendadas,
            experimentaisRealizadas,
            taxaShowUp,
            matriculas,
            taxaConversao,
            faturamentoNovo,
            ticketMedioNovos,
            passaportes: 0, // TODO: implementar quando tiver tipo passaporte
            faturamentoPassaportes: 0,
          });
        }
      } catch (err) {
        console.error('Erro ao carregar dados comerciais:', err);
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

  // Preparar dados para o funil
  const funnelSteps = [
    { label: 'Leads', value: totais.leads, color: '#06b6d4' },
    { label: 'Experimentais', value: totais.experimentaisRealizadas, color: '#f59e0b' },
    { label: 'Matrículas', value: totais.matriculas, color: '#10b981' },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards - Linha 1 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard
          icon={Phone}
          label="Leads (Mês)"
          value={totais.leads}
          variant="cyan"
        />
        <KPICard
          icon={Archive}
          label="Leads Arquivados"
          value={totais.leadsArquivados}
          variant="default"
        />
        <KPICard
          icon={Calendar}
          label="Exp. Agendadas"
          value={totais.experimentaisAgendadas}
          variant="amber"
        />
        <KPICard
          icon={Calendar}
          label="Exp. Realizadas"
          value={totais.experimentaisRealizadas}
          variant="amber"
        />
        <KPICard
          icon={Percent}
          label="Taxa Show-up"
          value={`${totais.taxaShowUp.toFixed(1)}%`}
          variant="violet"
        />
        <KPICard
          icon={UserPlus}
          label="Matrículas"
          value={totais.matriculas}
          variant="emerald"
        />
      </div>

      {/* KPI Cards - Linha 2 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <KPICard
          icon={Percent}
          label="Taxa Conversão"
          value={`${totais.taxaConversao.toFixed(1)}%`}
          subvalue="Exp → Matrícula"
          variant="violet"
        />
        <KPICard
          icon={DollarSign}
          label="Faturamento Novo"
          value={formatCurrency(totais.faturamentoNovo)}
          variant="emerald"
        />
        <KPICard
          icon={DollarSign}
          label="Ticket Médio Novos"
          value={formatCurrency(totais.ticketMedioNovos)}
          variant="cyan"
        />
        <KPICard
          icon={Music}
          label="Passaportes"
          value={totais.passaportes}
          subvalue={formatCurrency(totais.faturamentoPassaportes)}
          variant="amber"
        />
      </div>

      {/* Funil de Conversão */}
      <FunnelChart
        steps={funnelSteps}
        title="Funil de Conversão"
      />

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DistributionChart
          data={leadsPorCanal}
          title="Leads por Canal de Origem"
        />
        <BarChartHorizontal
          data={leadsPorCanal}
          title="Volume de Leads por Canal"
        />
      </div>

      {/* Ranking de Matriculadores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RankingTable
          data={matriculasPorProfessor}
          title="🏆 Ranking Matriculadores"
          valorLabel="Matrículas"
          variant="emerald"
          valorFormatter={(v) => `${v} matrículas`}
        />

        {/* Tabela de Registros Recentes */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-700/50">
            <h3 className="text-lg font-bold text-white">Últimos Registros</h3>
          </div>
          <div className="overflow-x-auto max-h-80">
            <table className="w-full">
              <thead className="sticky top-0 bg-slate-800">
                <tr className="border-b border-slate-700/50 text-xs text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4 text-left">Data</th>
                  <th className="py-3 px-4 text-left">Tipo</th>
                  <th className="py-3 px-4 text-right">Qtd</th>
                </tr>
              </thead>
              <tbody>
                {dados.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-slate-500">
                      Nenhum registro encontrado
                    </td>
                  </tr>
                ) : (
                  dados.slice(0, 10).map((d) => (
                    <tr key={d.id} className="border-b border-slate-700/30 hover:bg-slate-800/30">
                      <td className="py-2 px-4 text-slate-300 text-sm">
                        {new Date(d.data_contato).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-2 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          ['novo','agendado'].includes(d.status) ? 'bg-cyan-500/20 text-cyan-400' :
                          d.status === 'experimental_realizada' ? 'bg-amber-500/20 text-amber-400' :
                          d.status === 'experimental_agendada' ? 'bg-amber-500/10 text-amber-300' :
                          ['matriculado','convertido'].includes(d.status) ? 'bg-emerald-500/20 text-emerald-400' :
                          'bg-slate-500/20 text-slate-400'
                        }`}>
                          {['novo','agendado'].includes(d.status) ? 'Lead' :
                           d.status === 'experimental_realizada' ? 'Exp. Realizada' :
                           d.status === 'experimental_agendada' ? 'Exp. Agendada' :
                           ['matriculado','convertido'].includes(d.status) ? 'Matrícula' :
                           d.status}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-right text-slate-300">{d.quantidade || 1}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TabComercial;
