import { useState, useEffect } from 'react';
import { Users, Trophy, TrendingUp, TrendingDown, Percent, Star, DollarSign, UserCheck, UserMinus } from 'lucide-react';
import { KPICard } from '@/components/ui/KPICard';
import { RankingTable } from '@/components/ui/RankingTable';
import { BarChartHorizontal } from '@/components/ui/BarChartHorizontal';
import { formatCurrency } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

interface TabProfessoresProps {
  ano: number;
  mes: number;
  unidade: string;
}

interface ProfessorKPI {
  id: number;
  nome: string;
  unidade_id: string;
  unidade_nome: string;
  carteira_alunos: number;
  ticket_medio: number;
  media_presenca: number;
  taxa_faltas: number;
  experimentais: number;
  matriculas: number;
  taxa_conversao: number;
  evasoes: number;
  mrr_perdido: number;
  renovacoes: number;
  nao_renovacoes: number;
  taxa_renovacao: number;
  taxa_nao_renovacao: number;
  taxa_cancelamento: number;
  ranking_matriculador: number;
  ranking_renovador: number;
  ranking_churn: number;
  nps_medio: number | null;
  media_alunos_turma: number | null;
}

export function TabProfessores({ ano, mes, unidade }: TabProfessoresProps) {
  const [loading, setLoading] = useState(true);
  const [professores, setProfessores] = useState<ProfessorKPI[]>([]);
  const [totais, setTotais] = useState({
    totalProfessores: 0,
    carteiraMedia: 0,
    ticketMedioGeral: 0,
    mediaPresenca: 0,
    taxaFaltas: 0,
    taxaConversaoMedia: 0,
    taxaRenovacaoMedia: 0,
    npsGeral: 0,
    mediaAlunosTurma: 0,
  });

  useEffect(() => {
    async function fetchDados() {
      setLoading(true);
      try {
        // Buscar dados da view de KPIs de professores
        let query = supabase
          .from('vw_kpis_professor_completo')
          .select('*')
          .order('carteira_alunos', { ascending: false });

        // Filtrar por unidade se não for consolidado
        if (unidade !== 'todos') {
          query = query.eq('unidade_id', unidade);
        }

        const { data, error } = await query;

        if (error) throw error;

        if (data) {
          setProfessores(data);

          // Calcular médias
          const total = data.length;
          const carteiraMedia = total > 0 
            ? data.reduce((acc, p) => acc + (p.carteira_alunos || 0), 0) / total 
            : 0;
          const taxaConversaoMedia = 0;
          const taxaRenovacaoMedia = total > 0 
            ? data.reduce((acc, p) => acc + (Number(p.taxa_renovacao) || 0), 0) / total 
            : 0;
          const profsComNps = data.filter(p => p.nps_medio !== null);
          const npsGeral = profsComNps.length > 0 
            ? profsComNps.reduce((acc, p) => acc + (p.nps_medio || 0), 0) / profsComNps.length 
            : 0;

          const ticketMedioGeral = total > 0 
            ? data.reduce((acc, p) => acc + (Number(p.ticket_medio) || 0), 0) / total 
            : 0;
          const mediaPresenca = total > 0 
            ? data.reduce((acc, p) => acc + (Number(p.media_presenca) || 0), 0) / total 
            : 0;
          const taxaFaltas = total > 0 
            ? data.reduce((acc, p) => acc + (Number(p.taxa_faltas) || 0), 0) / total 
            : 0;
          const profsComTurma = data.filter(p => p.media_alunos_turma !== null);
          const mediaAlunosTurma = profsComTurma.length > 0 
            ? profsComTurma.reduce((acc, p) => acc + (p.media_alunos_turma || 0), 0) / profsComTurma.length 
            : 0;

          setTotais({
            totalProfessores: total,
            carteiraMedia,
            ticketMedioGeral,
            mediaPresenca,
            taxaFaltas,
            taxaConversaoMedia,
            taxaRenovacaoMedia,
            npsGeral,
            mediaAlunosTurma,
          });
        }
      } catch (err) {
        console.error('Erro ao carregar dados de professores:', err);
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

  // Preparar dados para rankings
  const rankingMatriculadores = [...professores]
    .filter(p => (p.matriculas || 0) > 0)
    .sort((a, b) => (b.matriculas || 0) - (a.matriculas || 0))
    .map(p => ({
      id: p.id,
      nome: p.nome,
      valor: p.matriculas || 0,
      subvalor: `Exp -> Mat bloqueada (diag. ${(Number(p.taxa_conversao) || 0).toFixed(0)}%)`,
    }));

  const rankingRenovadores = [...professores]
    .sort((a, b) => a.ranking_renovador - b.ranking_renovador)
    .map(p => ({ id: p.id, nome: p.nome, valor: Number(p.taxa_renovacao) || 0, subvalor: `${p.renovacoes || 0} renovações` }));

  const rankingChurn = [...professores]
    .sort((a, b) => a.ranking_churn - b.ranking_churn)
    .map(p => ({ id: p.id, nome: p.nome, valor: p.evasoes || 0, subvalor: formatCurrency(Number(p.mrr_perdido) || 0) }));

  // Dados para gráfico de carteira
  const carteiraData = professores
    .filter(p => p.carteira_alunos > 0)
    .map(p => ({ name: p.nome, value: p.carteira_alunos }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  return (
    <div className="space-y-6">
      {/* KPI Cards - Linha 1 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KPICard
          icon={Users}
          label="Professores Ativos"
          value={totais.totalProfessores}
          variant="cyan"
        />
        <KPICard
          icon={Users}
          label="Carteira Média"
          value={totais.carteiraMedia.toFixed(1)}
          subvalue="alunos/professor"
          variant="violet"
        />
        <KPICard
          icon={DollarSign}
          label="Ticket Médio"
          value={formatCurrency(totais.ticketMedioGeral)}
          variant="emerald"
        />
        <KPICard
          icon={UserCheck}
          label="Média Presença"
          value={`${totais.mediaPresenca.toFixed(1)}%`}
          variant="cyan"
        />
        <KPICard
          icon={UserMinus}
          label="Taxa Faltas"
          value={`${totais.taxaFaltas.toFixed(1)}%`}
          variant="amber"
        />
      </div>

      {/* KPI Cards - Linha 2 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KPICard
          icon={TrendingUp}
          label="Exp → Mat bloqueada"
          value="Bloqueada"
          subvalue="aguardando regra canônica"
          variant="amber"
        />
        <KPICard
          icon={TrendingUp}
          label="Taxa Renovação Média"
          value={`${totais.taxaRenovacaoMedia.toFixed(1)}%`}
          variant="emerald"
        />
        <KPICard
          icon={Users}
          label="Média Alunos/Turma"
          value={totais.mediaAlunosTurma > 0 ? totais.mediaAlunosTurma.toFixed(1) : '—'}
          variant="cyan"
        />
        <KPICard
          icon={Trophy}
          label="Total Rankings"
          value={professores.length}
          subvalue="professores avaliados"
          variant="default"
        />
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <RankingTable
          data={rankingMatriculadores}
          title="🏆 Matrículas por Professor (diagnóstico)"
          valorLabel="Matrículas"
          variant="emerald"
          maxItems={5}
        />
        <RankingTable
          data={rankingRenovadores}
          title="🏆 Top Renovadores"
          valorLabel="Renovação"
          variant="gold"
          valorFormatter={(v) => `${Number(v).toFixed(0)}%`}
          maxItems={5}
        />
        <RankingTable
          data={rankingChurn}
          title="🏆 Menor Churn"
          valorLabel="Evasões"
          variant="cyan"
          valorFormatter={(v) => `${v} evasões`}
          maxItems={5}
        />
      </div>

      {/* Gráfico de Carteira */}
      <BarChartHorizontal
        data={carteiraData}
        title="Carteira de Alunos por Professor"
        valueFormatter={(v) => `${v} alunos`}
      />

      {/* Tabela Completa */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-700/50">
          <h3 className="text-lg font-bold text-white">Performance Completa</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50 text-xs text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4 text-left">Professor</th>
                <th className="py-3 px-4 text-left">Unidade</th>
                <th className="py-3 px-4 text-right">Carteira</th>
                <th className="py-3 px-4 text-right">Ticket Médio</th>
                <th className="py-3 px-4 text-right">Exp → Mat</th>
                <th className="py-3 px-4 text-right">Renovação</th>
                <th className="py-3 px-4 text-right">Evasões</th>
              </tr>
            </thead>
            <tbody>
              {professores.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Nenhum professor encontrado
                  </td>
                </tr>
              ) : (
                professores.map((p) => (
                  <tr key={p.id} className="border-b border-slate-700/30 hover:bg-slate-800/30">
                    <td className="py-3 px-4 text-white font-medium">{p.nome}</td>
                    <td className="py-3 px-4 text-slate-400">{p.unidade_nome || '—'}</td>
                    <td className="py-3 px-4 text-right text-slate-300">{p.carteira_alunos}</td>
                    <td className="py-3 px-4 text-right text-slate-300">
                      {formatCurrency(Number(p.ticket_medio) || 0)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-yellow-300">
                        Bloq.
                        {(Number(p.taxa_conversao) || 0) > 0 && (
                          <span className="ml-1 text-[10px] text-slate-500">
                            diag. {Number(p.taxa_conversao).toFixed(0)}%
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={Number(p.taxa_renovacao) >= 80 ? 'text-emerald-400' : 'text-amber-400'}>
                        {Number(p.taxa_renovacao).toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={p.evasoes === 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {p.evasoes}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default TabProfessores;
