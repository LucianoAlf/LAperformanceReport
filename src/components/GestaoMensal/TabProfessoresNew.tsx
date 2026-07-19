import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BarChart3,
  Clock,
  DollarSign,
  HeartPulse,
  Percent,
  Target,
  Trophy,
  UserCheck,
  UserMinus,
  Users,
} from 'lucide-react';
import { KPICard } from '@/components/ui/KPICard';
import { RankingTableCollapsible } from '@/components/ui/RankingTableCollapsible';
import { cn, formatCurrency } from '@/lib/utils';
import {
  buscarKpisProfessoresCanonicos,
  calcularTotaisKpisProfessoresCanonicos,
  consolidarKpisProfessoresCanonicos,
  type KPIProfessorCanonico,
} from '@/lib/professoresKpisCanonicos';
import { useHealthScoreProfessorV3Performance } from '@/hooks/useHealthScoreProfessorV3Performance';
import {
  isHealthScoreV3SnapshotRankable,
} from '@/lib/healthScoreProfessorV3Performance';
import {
  getHealthScoreV3Period,
  type HealthScoreV3Periodicidade,
} from '@/lib/healthScoreProfessorV3Periodos';

interface TabProfessoresProps {
  ano: number;
  mes: number;
  mesFim?: number;
  unidade: string;
}

type SubTabId = 'visao_geral' | 'conversao' | 'retencao';

const subTabs = [
  { id: 'visao_geral' as const, label: 'Visão Geral', icon: Users },
  { id: 'conversao' as const, label: 'Exp->Mat', icon: Target },
  { id: 'retencao' as const, label: 'Retenção', icon: UserCheck },
];

interface ProfessorKPI {
  id: number;
  nome: string;
  carteira_alunos: number;
  media_alunos_turma: number;
  ticket_medio: number;
  experimentais: number;
  matriculas: number;
  taxa_conversao: number;
  renovacoes: number;
  nao_renovacoes: number;
  taxa_renovacao: number;
  evasoes: number;
  taxa_cancelamento: number;
  mrr_perdido: number;
  nps: number;
  media_presenca: number;
}

interface DadosProfessores {
  total_professores: number;
  carteira_media: number;
  alunos_total: number;
  media_alunos_turma_geral: number;
  experimentais_total: number;
  matriculas_total: number;
  taxa_conversao_geral: number;
  renovacoes_total: number;
  nao_renovacoes_total: number;
  taxa_renovacao_geral: number;
  evasoes_total: number;
  mrr_perdido_total: number;
  nps_medio: number;
  presenca_media: number;
  ticket_medio_geral: number;
  professores: ProfessorKPI[];
}

function montarDados(linhas: KPIProfessorCanonico[]): DadosProfessores {
  const professores = consolidarKpisProfessoresCanonicos(linhas);
  const totais = calcularTotaisKpisProfessoresCanonicos(linhas);
  const carteiraTotal = professores.reduce((soma, p) => soma + p.carteira_alunos, 0);
  const mediaPonderada = (campo: 'ticket_medio' | 'media_presenca' | 'nps_medio') =>
    carteiraTotal > 0
      ? professores.reduce((soma, p) => soma + p[campo] * p.carteira_alunos, 0) / carteiraTotal
      : 0;

  return {
    total_professores: professores.length,
    carteira_media: professores.length > 0 ? carteiraTotal / professores.length : 0,
    alunos_total: carteiraTotal,
    media_alunos_turma_geral: totais.mediaAlunosTurma,
    experimentais_total: totais.experimentais,
    matriculas_total: totais.matriculasPosExp,
    taxa_conversao_geral: totais.taxaConversao,
    renovacoes_total: totais.renovacoes,
    nao_renovacoes_total: totais.naoRenovacoes,
    taxa_renovacao_geral: totais.taxaRenovacao,
    evasoes_total: totais.evasoes,
    mrr_perdido_total: totais.mrrPerdido,
    nps_medio: mediaPonderada('nps_medio'),
    presenca_media: mediaPonderada('media_presenca'),
    ticket_medio_geral: mediaPonderada('ticket_medio'),
    professores: professores.map((p) => ({
      id: p.professor_id,
      nome: p.professor_nome,
      carteira_alunos: p.carteira_alunos,
      media_alunos_turma: p.media_alunos_turma,
      ticket_medio: p.ticket_medio,
      experimentais: p.experimentais,
      matriculas: p.matriculas_pos_exp,
      taxa_conversao: p.taxa_conversao,
      renovacoes: p.renovacoes,
      nao_renovacoes: p.nao_renovacoes,
      taxa_renovacao: p.taxa_renovacao,
      evasoes: p.evasoes,
      taxa_cancelamento: p.taxa_cancelamento,
      mrr_perdido: p.mrr_perdido,
      nps: p.nps_medio,
      media_presenca: p.media_presenca,
    })),
  };
}

function dataFinal(ano: number, mes: number) {
  return `${ano}-${String(mes).padStart(2, '0')}-${String(new Date(ano, mes, 0).getDate()).padStart(2, '0')}`;
}

export function TabProfessoresNew({ ano, mes, mesFim, unidade }: TabProfessoresProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('visao_geral');
  const [healthPeriodicity, setHealthPeriodicity] = useState<HealthScoreV3Periodicidade>(
    mesFim && mesFim !== mes ? 'ciclo' : 'mensal',
  );
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<DadosProfessores | null>(null);
  const mesFinal = mesFim || mes;
  const healthReferenceMonth = mes;
  const healthPeriod = useMemo(
    () => getHealthScoreV3Period(ano, healthReferenceMonth, healthPeriodicity),
    [ano, healthPeriodicity, healthReferenceMonth],
  );
  const {
    snapshots: healthSnapshots,
    loading: healthLoading,
    error: healthError,
  } = useHealthScoreProfessorV3Performance({
    competencia: `${ano}-${String(healthReferenceMonth).padStart(2, '0')}`,
    unidadeId: unidade === 'todos' ? null : unidade,
    periodicidade: healthPeriodicity,
  });

  useEffect(() => {
    setHealthPeriodicity(mesFim && mesFim !== mes ? 'ciclo' : 'mensal');
  }, [mes, mesFim]);

  useEffect(() => {
    let ativo = true;

    async function fetchDados() {
      setLoading(true);
      try {
        const linhas = await buscarKpisProfessoresCanonicos({
          ano,
          mes,
          unidadeId: unidade,
          dataInicio: `${ano}-${String(mes).padStart(2, '0')}-01`,
          dataFim: dataFinal(ano, mesFinal),
        });
        if (ativo) setDados(montarDados(linhas));
      } catch (error) {
        console.error('Erro ao carregar KPIs canônicos de professores:', error);
        if (ativo) setDados(null);
      } finally {
        if (ativo) setLoading(false);
      }
    }

    fetchDados();
    return () => { ativo = false; };
  }, [ano, mes, mesFinal, unidade]);

  if (loading || healthLoading) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-violet-500" /></div>;
  }

  if (!dados) {
    return <div className="py-12 text-center text-slate-400">Não foi possível carregar os dados canônicos do período.</div>;
  }

  const visibleHealthSnapshots = healthSnapshots.filter(
    (snapshot) => snapshot.scoreExibivel && snapshot.score !== null,
  );
  const averageHealthScore = visibleHealthSnapshots.length > 0
    ? visibleHealthSnapshots.reduce((total, snapshot) => total + Number(snapshot.score), 0)
      / visibleHealthSnapshots.length
    : null;
  const averageCoverage = visibleHealthSnapshots.length > 0
    ? visibleHealthSnapshots.reduce((total, snapshot) => total + Number(snapshot.cobertura || 0), 0)
      / visibleHealthSnapshots.length
    : null;
  const rankingHabilitado = healthSnapshots.some(isHealthScoreV3SnapshotRankable);
  const professorNameById = new Map(dados.professores.map((professor) => [professor.id, professor.nome]));
  const rankingHealthScore = healthSnapshots
    .filter(isHealthScoreV3SnapshotRankable)
    .sort((a, b) => Number(b.score) - Number(a.score))
    .map((snapshot) => ({
      id: snapshot.professorId,
      nome: professorNameById.get(snapshot.professorId) || `Professor ${snapshot.professorId}`,
      valor: Number(snapshot.score),
      subvalor: `${Number(snapshot.cobertura || 0).toFixed(0)}% de cobertura`,
    }));

  const rankingMatriculadores = [...dados.professores]
    .filter((p) => p.matriculas > 0)
    .sort((a, b) => b.matriculas - a.matriculas)
    .map((p) => ({ id: p.id, nome: p.nome, valor: p.matriculas, subvalor: `${p.experimentais} experimentais` }));
  const rankingConversao = [...dados.professores]
    .filter((p) => p.experimentais > 0)
    .sort((a, b) => b.taxa_conversao - a.taxa_conversao)
    .map((p) => ({ id: p.id, nome: p.nome, valor: p.taxa_conversao, subvalor: `${p.matriculas}/${p.experimentais}` }));
  const rankingRenovadores = [...dados.professores]
    .filter((p) => p.renovacoes + p.nao_renovacoes > 0)
    .sort((a, b) => b.taxa_renovacao - a.taxa_renovacao || b.renovacoes - a.renovacoes)
    .map((p) => ({ id: p.id, nome: p.nome, valor: p.renovacoes, subvalor: `${p.taxa_renovacao.toFixed(1)}%` }));
  const rankingChurn = [...dados.professores]
    .sort((a, b) => a.evasoes - b.evasoes || a.mrr_perdido - b.mrr_perdido)
    .map((p) => ({ id: p.id, nome: p.nome, valor: p.evasoes, subvalor: formatCurrency(p.mrr_perdido) }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex flex-wrap gap-1 rounded-lg bg-slate-800/50 p-1">
          {subTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={cn(
                'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all',
                activeSubTab === tab.id ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
              )}
            >
              <tab.icon size={16} />{tab.label}
            </button>
          ))}
        </div>
        <div className="inline-flex w-fit rounded-lg border border-slate-700 bg-slate-900 p-1" aria-label="Recorte do Health Score V3">
          {(['mensal', 'ciclo'] as const).map((periodicity) => (
            <button
              key={periodicity}
              type="button"
              onClick={() => setHealthPeriodicity(periodicity)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                healthPeriodicity === periodicity
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-400 hover:text-white',
              )}
            >
              {periodicity === 'mensal' ? 'Mensal' : 'Ciclo fixo'}
            </button>
          ))}
        </div>
      </div>

      {healthError ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Health Score V3 indisponível: {healthError}
        </div>
      ) : (
        <div className="grid gap-4 rounded-lg border border-violet-500/25 bg-violet-500/5 p-4 md:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(120px,180px))] md:items-center">
          <div className="flex items-start gap-3">
            <HeartPulse className="mt-0.5 h-5 w-5 text-violet-300" />
            <div>
              <p className="text-sm font-semibold text-white">
                {rankingHabilitado ? 'Health Score V3 oficial' : 'Health Score parcial'}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {healthPeriod.label}. Rankings e premiações só são liberados no fechamento oficial.
              </p>
            </div>
          </div>
          <div>
            <p className="text-xl font-bold text-white">{averageHealthScore === null ? 'Sem base' : averageHealthScore.toFixed(1)}</p>
            <p className="text-[11px] uppercase text-slate-500">Média exibível</p>
          </div>
          <div>
            <p className="text-xl font-bold text-cyan-300">{visibleHealthSnapshots.length}/{healthSnapshots.length}</p>
            <p className="text-[11px] uppercase text-slate-500">Professores com score</p>
          </div>
          <div>
            <p className="text-xl font-bold text-emerald-300">{averageCoverage === null ? 'Sem base' : `${averageCoverage.toFixed(0)}%`}</p>
            <p className="text-[11px] uppercase text-slate-500">Cobertura média</p>
          </div>
        </div>
      )}

      {activeSubTab === 'visao_geral' && (
        <div className="space-y-6">
          <div className="inline-flex max-w-full items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200">
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Fonte canônica por competência</span>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <KPICard icon={Users} label="Total Professores" value={dados.total_professores} variant="violet" />
            <KPICard icon={Users} label="Total Alunos" value={dados.alunos_total} variant="cyan" />
            <KPICard icon={Target} label="Média de Alunos" value={dados.carteira_media.toFixed(1)} variant="emerald" />
            <KPICard
              icon={Users}
              label="Média Alunos/Turma"
              value={dados.media_alunos_turma_geral.toFixed(1)}
              variant="cyan"
              tooltip="Ocupações distintas em turmas regulares divididas pelas turmas regulares. Projetos e bandas não entram nesta média."
            />
            <KPICard icon={DollarSign} label="Ticket Médio" value={dados.ticket_medio_geral} format="currency" variant="amber" />
            <KPICard icon={Clock} label="Presença Média" value={`${dados.presenca_media.toFixed(1)}%`} variant="emerald" />
          </div>
          {rankingHabilitado ? (
            <RankingTableCollapsible
              data={rankingHealthScore}
              title="Ranking Oficial - Health Score V3"
              valorLabel="Score"
              topCount={3}
              variant="gold"
              valorFormatter={(value) => Number(value).toFixed(1)}
            />
          ) : (
            <div className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-5 text-sm text-slate-400">
              Rankings reservados para o fechamento oficial do ciclo {healthPeriod.label}.
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'conversao' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KPICard icon={Trophy} label="Experimentais" value={dados.experimentais_total} variant="cyan" />
            <KPICard icon={UserCheck} label="Matrículas pós-exp" value={dados.matriculas_total} variant="emerald" />
            <KPICard icon={Percent} label="Taxa Exp → Mat" value={`${dados.taxa_conversao_geral.toFixed(1)}%`} variant="emerald" />
            <KPICard icon={Award} label="Professor destaque" value={rankingHabilitado ? rankingMatriculadores[0]?.nome.split(' ')[0] || '-' : 'Reservado'} variant="amber" />
          </div>
          {rankingHabilitado ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <RankingTableCollapsible data={rankingMatriculadores} title="Ranking Matriculadores" valorLabel="Matrículas" topCount={3} variant="emerald" />
              <RankingTableCollapsible data={rankingConversao} title="Ranking Exp → Mat" valorLabel="Taxa" topCount={3} variant="gold" valorFormatter={(v) => `${Number(v).toFixed(1)}%`} />
            </div>
          ) : (
            <div className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-5 text-sm text-slate-400">
              Comparações individuais ficam visíveis na Performance; ranking e premiação aguardam o ciclo oficial.
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'retencao' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KPICard icon={UserCheck} label="Renovações" value={dados.renovacoes_total} subvalue={`${dados.taxa_renovacao_geral.toFixed(1)}%`} variant="emerald" />
            <KPICard icon={UserMinus} label="Não Renovações" value={dados.nao_renovacoes_total} variant="amber" />
            <KPICard icon={UserMinus} label="Evasões" value={dados.evasoes_total} variant="rose" />
            <KPICard icon={DollarSign} label="MRR Perdido" value={formatCurrency(dados.mrr_perdido_total)} variant="rose" />
          </div>
          {rankingHabilitado ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <RankingTableCollapsible data={rankingRenovadores} title="Ranking Renovadores" valorLabel="Renovações" topCount={3} variant="emerald" />
              <RankingTableCollapsible data={rankingChurn} title="Menor Churn" valorLabel="Evasões" topCount={3} variant="cyan" />
            </div>
          ) : (
            <div className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-5 text-sm text-slate-400">
              Rankings de retenção permanecem bloqueados enquanto o Health Score está parcial.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TabProfessoresNew;
