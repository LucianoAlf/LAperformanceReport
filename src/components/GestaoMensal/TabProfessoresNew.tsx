import { useState, useEffect } from 'react';
import { Users, Trophy, TrendingUp, TrendingDown, Percent, Star, DollarSign, UserCheck, UserMinus, Target, Award, Clock } from 'lucide-react';
import { KPICard } from '@/components/ui/KPICard';
import { RankingTable } from '@/components/ui/RankingTable';
import { BarChartHorizontal } from '@/components/ui/BarChartHorizontal';
import { formatCurrency } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface TabProfessoresProps {
  ano: number;
  mes: number;
  mesFim?: number; // Para filtros de período (trimestre, semestre, anual)
  unidade: string;
}

type SubTabId = 'carteira' | 'conversao' | 'retencao' | 'qualidade';

const subTabs = [
  { id: 'carteira' as const, label: 'Carteira', icon: Users },
  { id: 'conversao' as const, label: 'Conversão', icon: Target },
  { id: 'retencao' as const, label: 'Retenção', icon: UserCheck },
  { id: 'qualidade' as const, label: 'Qualidade', icon: Star },
];

interface ProfessorKPI {
  id: number;
  nome: string;
  unidade_nome: string;
  
  // Carteira
  carteira_alunos: number;
  media_alunos_turma: number;
  ticket_medio: number;
  
  // Conversão
  experimentais: number;
  matriculas: number;
  taxa_conversao: number;
  
  // Retenção
  renovacoes: number;
  nao_renovacoes: number;
  taxa_renovacao: number;
  evasoes: number;
  taxa_cancelamento: number;
  mrr_perdido: number;
  
  // Qualidade
  nps: number;
  media_presenca: number;
  taxa_faltas: number;
}

interface DadosProfessores {
  total_professores: number;
  carteira_media: number;
  alunos_total: number;
  media_alunos_turma_geral: number;
  
  // Conversão
  experimentais_total: number;
  matriculas_total: number;
  taxa_conversao_geral: number;
  ranking_matriculadores: { id: number; nome: string; valor: number; subvalor?: string }[];
  
  // Retenção
  renovacoes_total: number;
  nao_renovacoes_total: number;
  taxa_renovacao_geral: number;
  evasoes_total: number;
  mrr_perdido_total: number;
  ranking_renovadores: { id: number; nome: string; valor: number; subvalor?: string }[];
  ranking_churn: { id: number; nome: string; valor: number; subvalor?: string }[];
  
  // Qualidade
  nps_medio: number;
  presenca_media: number;
  ticket_medio_geral: number;
  ranking_nps: { id: number; nome: string; valor: number; subvalor?: string }[];
  
  professores: ProfessorKPI[];
}

export function TabProfessoresNew({ ano, mes, mesFim, unidade }: TabProfessoresProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('carteira');
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<DadosProfessores | null>(null);

  // Usar mesFim se fornecido, senão usar mes (para filtro mensal)
  const mesInicio = mes;
  const mesFinal = mesFim || mes;

  useEffect(() => {
    async function fetchDados() {
      setLoading(true);
      try {
        // Buscar dados da view otimizada com todos os 23 KPIs (suporta range de meses)
        let query = supabase
          .from('vw_kpis_professor_mensal')
          .select('*')
          .eq('ano', ano)
          .gte('mes', mesInicio)
          .lte('mes', mesFinal);

        // Filtrar por unidade se não for consolidado
        if (unidade !== 'todos') {
          query = query.eq('unidade_id', unidade);
        }

        const { data: professoresData, error: professoresError } = await query;

        if (professoresError) throw professoresError;

        const professores = professoresData || [];
        
        // Mapear para o formato esperado com todos os KPIs
        const professoresKPIs: ProfessorKPI[] = professores.map(p => ({
          id: p.professor_id,
          nome: p.professor_nome,
          unidade_nome: '',
          // Carteira
          carteira_alunos: p.carteira_alunos || 0,
          media_alunos_turma: Number(p.media_alunos_turma) || 0,
          ticket_medio: Number(p.ticket_medio) || 0,
          // Conversão
          experimentais: p.experimentais || 0,
          matriculas: p.matriculas || 0,
          taxa_conversao: Number(p.taxa_conversao) || 0,
          // Retenção
          renovacoes: p.renovacoes || 0,
          nao_renovacoes: p.nao_renovacoes || 0,
          taxa_renovacao: Number(p.taxa_renovacao) || 0,
          evasoes: p.evasoes || 0,
          taxa_cancelamento: Number(p.taxa_cancelamento) || 0,
          mrr_perdido: Number(p.mrr_perdido) || 0,
          // Qualidade
          nps: Number(p.nps_medio) || 0,
          media_presenca: Number(p.media_presenca) || 0,
          taxa_faltas: Number(p.taxa_faltas) || 0,
        }));

        // Calcular totais e médias
        const totalProfessores = professoresKPIs.filter(p => p.carteira_alunos > 0).length;
        const alunosTotal = professoresKPIs.reduce((acc, p) => acc + p.carteira_alunos, 0);
        const carteiraMedia = totalProfessores > 0 ? alunosTotal / totalProfessores : 0;
        
        const experimentaisTotal = professoresKPIs.reduce((acc, p) => acc + p.experimentais, 0);
        const matriculasTotal = professoresKPIs.reduce((acc, p) => acc + p.matriculas, 0);
        const taxaConversaoGeral = experimentaisTotal > 0 ? (matriculasTotal / experimentaisTotal) * 100 : 0;
        
        const renovacoesTotal = professoresKPIs.reduce((acc, p) => acc + p.renovacoes, 0);
        const naoRenovacoesTotal = professoresKPIs.reduce((acc, p) => acc + p.nao_renovacoes, 0);
        const totalRenovacoesPrevistas = renovacoesTotal + naoRenovacoesTotal;
        const taxaRenovacaoGeral = totalRenovacoesPrevistas > 0 ? (renovacoesTotal / totalRenovacoesPrevistas) * 100 : 0;
        
        const evasoesTotal = professoresKPIs.reduce((acc, p) => acc + p.evasoes, 0);
        const mrrPerdidoTotal = professoresKPIs.reduce((acc, p) => acc + p.mrr_perdido, 0);
        
        const profsComNPS = professoresKPIs.filter(p => p.nps > 0);
        const npsMedio = profsComNPS.length > 0 ? profsComNPS.reduce((acc, p) => acc + p.nps, 0) / profsComNPS.length : 0;
        
        const profsComPresenca = professoresKPIs.filter(p => p.media_presenca > 0);
        const presencaMedia = profsComPresenca.length > 0 ? profsComPresenca.reduce((acc, p) => acc + p.media_presenca, 0) / profsComPresenca.length : 0;
        
        const profsComTicket = professoresKPIs.filter(p => p.ticket_medio > 0);
        const ticketMedioGeral = profsComTicket.length > 0 ? profsComTicket.reduce((acc, p) => acc + p.ticket_medio, 0) / profsComTicket.length : 0;
        
        const profsComTurma = professoresKPIs.filter(p => p.media_alunos_turma > 0);
        const mediaAlunosTurmaGeral = profsComTurma.length > 0 ? profsComTurma.reduce((acc, p) => acc + p.media_alunos_turma, 0) / profsComTurma.length : 0;

        // Rankings
        const rankingMatriculadores = professoresKPIs
          .filter(p => p.experimentais > 0 || p.matriculas > 0)
          .sort((a, b) => b.taxa_conversao - a.taxa_conversao)
          .slice(0, 10)
          .map(p => ({
            id: p.id,
            nome: p.nome,
            valor: p.matriculas,
            subvalor: `${p.taxa_conversao.toFixed(0)}% conversão (${p.experimentais} exp)`
          }));

        const rankingRenovadores = professoresKPIs
          .filter(p => p.renovacoes > 0 || p.nao_renovacoes > 0)
          .sort((a, b) => b.taxa_renovacao - a.taxa_renovacao)
          .slice(0, 10)
          .map(p => ({
            id: p.id,
            nome: p.nome,
            valor: p.renovacoes,
            subvalor: `${p.taxa_renovacao.toFixed(0)}% taxa`
          }));

        const rankingChurn = professoresKPIs
          .filter(p => p.carteira_alunos > 0)
          .sort((a, b) => a.taxa_cancelamento - b.taxa_cancelamento) // Menor é melhor
          .slice(0, 10)
          .map(p => ({
            id: p.id,
            nome: p.nome,
            valor: p.evasoes,
            subvalor: `${p.taxa_cancelamento.toFixed(1)}% churn (${p.carteira_alunos} alunos)`
          }));

        const rankingNPS = professoresKPIs
          .filter(p => p.nps > 0)
          .sort((a, b) => b.nps - a.nps)
          .slice(0, 10)
          .map(p => ({
            id: p.id,
            nome: p.nome,
            valor: p.nps,
            subvalor: `${p.media_presenca.toFixed(0)}% presença`
          }));

        setDados({
          total_professores: totalProfessores,
          carteira_media: carteiraMedia,
          alunos_total: alunosTotal,
          media_alunos_turma_geral: mediaAlunosTurmaGeral,
          experimentais_total: experimentaisTotal,
          matriculas_total: matriculasTotal,
          taxa_conversao_geral: taxaConversaoGeral,
          ranking_matriculadores: rankingMatriculadores,
          renovacoes_total: renovacoesTotal,
          nao_renovacoes_total: naoRenovacoesTotal,
          taxa_renovacao_geral: taxaRenovacaoGeral,
          evasoes_total: evasoesTotal,
          mrr_perdido_total: mrrPerdidoTotal,
          ranking_renovadores: rankingRenovadores,
          ranking_churn: rankingChurn,
          nps_medio: npsMedio,
          presenca_media: presencaMedia,
          ticket_medio_geral: ticketMedioGeral,
          ranking_nps: rankingNPS,
          professores: professoresKPIs,
        });

      } catch (err) {
        console.error('Erro ao carregar dados de professores:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchDados();
  }, [ano, mesInicio, mesFinal, unidade]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
      </div>
    );
  }

  if (!dados) {
    return (
      <div className="text-center text-slate-400 py-12">
        Nenhum dado encontrado para o período selecionado.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sub-abas */}
      <div className="bg-slate-800/50 p-1 rounded-lg inline-flex gap-1 flex-wrap">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
              activeSubTab === tab.id
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            )}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sub-aba: Carteira */}
      {activeSubTab === 'carteira' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KPICard
              icon={Users}
              label="Total Professores"
              value={dados.total_professores}
              variant="violet"
            />
            <KPICard
              icon={Users}
              label="Total Alunos"
              value={dados.alunos_total}
              variant="cyan"
            />
            <KPICard
              icon={Target}
              label="Carteira Média"
              value={dados.carteira_media.toFixed(1)}
              subvalue="alunos por professor"
              variant="emerald"
            />
            <KPICard
              icon={Users}
              label="Média Alunos/Turma"
              value={dados.media_alunos_turma_geral.toFixed(1)}
              subvalue="alunos por turma"
              variant="cyan"
            />
            <KPICard
              icon={DollarSign}
              label="Ticket Médio"
              value={formatCurrency(dados.ticket_medio_geral)}
              variant="amber"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <BarChartHorizontal
              data={dados.professores
                .sort((a, b) => b.carteira_alunos - a.carteira_alunos)
                .slice(0, 10)
                .map(p => ({
                  name: p.nome,
                  value: p.carteira_alunos,
                  color: '#8b5cf6'
                }))}
              title="Top 10 - Maior Carteira"
            />
            <BarChartHorizontal
              data={dados.professores
                .sort((a, b) => b.ticket_medio - a.ticket_medio)
                .slice(0, 10)
                .map(p => ({
                  name: p.nome,
                  value: p.ticket_medio,
                  color: '#f59e0b'
                }))}
              title="Top 10 - Maior Ticket Médio"
            />
          </div>
        </div>
      )}

      {/* Sub-aba: Conversão */}
      {activeSubTab === 'conversao' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard
              icon={Trophy}
              label="Experimentais"
              value={dados.experimentais_total}
              variant="cyan"
            />
            <KPICard
              icon={UserCheck}
              label="Matrículas"
              value={dados.matriculas_total}
              variant="emerald"
            />
            <KPICard
              icon={Percent}
              label="Taxa Conversão"
              value={`${dados.taxa_conversao_geral.toFixed(1)}%`}
              variant="violet"
            />
            <KPICard
              icon={Award}
              label="Melhor Professor"
              value={dados.ranking_matriculadores[0]?.nome.split(' ')[0] || '-'}
              subvalue={dados.ranking_matriculadores[0]?.subvalor || ''}
              variant="amber"
            />
          </div>

          <RankingTable
            data={dados.ranking_matriculadores}
            title="🏆 Ranking Matriculadores"
            valorLabel="Matrículas"
          />
        </div>
      )}

      {/* Sub-aba: Retenção */}
      {activeSubTab === 'retencao' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <KPICard
              icon={UserCheck}
              label="Renovações"
              value={dados.renovacoes_total}
              variant="emerald"
            />
            <KPICard
              icon={UserMinus}
              label="Não Renovações"
              value={dados.nao_renovacoes_total}
              variant="amber"
            />
            <KPICard
              icon={Percent}
              label="Taxa Renovação"
              value={`${dados.taxa_renovacao_geral.toFixed(1)}%`}
              variant="emerald"
            />
            <KPICard
              icon={Percent}
              label="Taxa Não Renovação"
              value={`${(100 - dados.taxa_renovacao_geral).toFixed(1)}%`}
              variant="amber"
            />
            <KPICard
              icon={TrendingDown}
              label="Evasões (Churn)"
              value={dados.evasoes_total}
              variant="rose"
            />
            <KPICard
              icon={DollarSign}
              label="MRR Perdido"
              value={formatCurrency(dados.mrr_perdido_total)}
              variant="rose"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RankingTable
              data={dados.ranking_renovadores}
              title="🏆 Ranking Renovadores"
              valorLabel="Renovações"
            />
            <RankingTable
              data={dados.ranking_churn}
              title="🛡️ Menor Churn (Melhor Retenção)"
              valorLabel="Evasões"
            />
          </div>
        </div>
      )}

      {/* Sub-aba: Qualidade */}
      {activeSubTab === 'qualidade' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KPICard
              icon={Star}
              label="NPS Médio"
              value={dados.nps_medio.toFixed(1)}
              subvalue="Nota média dos professores"
              variant="amber"
            />
            <KPICard
              icon={Clock}
              label="Presença Média"
              value={`${dados.presenca_media.toFixed(1)}%`}
              variant="emerald"
            />
            <KPICard
              icon={TrendingDown}
              label="Taxa Faltas"
              value={`${(100 - dados.presenca_media).toFixed(1)}%`}
              variant="rose"
            />
            <KPICard
              icon={Users}
              label="Média Alunos/Turma"
              value={dados.media_alunos_turma_geral.toFixed(1)}
              subvalue="média geral"
              variant="cyan"
            />
            <KPICard
              icon={DollarSign}
              label="Ticket Médio"
              value={formatCurrency(dados.ticket_medio_geral)}
              variant="violet"
            />
          </div>

          {dados.ranking_nps.length > 0 ? (
            <RankingTable
              data={dados.ranking_nps}
              title="⭐ Ranking NPS"
              valorLabel="Nota"
            />
          ) : (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 text-center">
              <p className="text-slate-400">Dados de NPS não disponíveis</p>
              <p className="text-sm text-slate-500 mt-2">Configure pesquisas de NPS para visualizar este ranking</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TabProfessoresNew;
