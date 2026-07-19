import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import {
  AlertTriangle, TrendingUp, TrendingDown, Users, Target, Award,
  ChevronRight, Search, Filter, Sparkles, Calendar, CheckCircle2,
  XCircle, Clock, BarChart3, Loader2, Heart, FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/toast';
import { useCompetenciaFiltro } from '@/hooks/useCompetenciaFiltro';
import { ModalDetalhesProfessorPerformance } from './ModalDetalhesProfessorPerformance';
import { ModalNovaMeta } from './ModalNovaMeta';
import { ModalNovaAcao } from './ModalNovaAcao';
import { ModalRelatorioCoordenacao } from './ModalRelatorioCoordenacao';
import { ModalDetalhesTurmas } from './ModalDetalhesTurmas';
import { ModalDetalhesPresenca } from './ModalDetalhesPresenca';
import { ModalDetalhesEvasoes } from './ModalDetalhesEvasoes';
import { ModalDetalhesRetencao } from './ModalDetalhesRetencao';
import { ModalDetalhesConversao } from './ModalDetalhesConversao';
import { PlanoAcaoEquipe } from './PlanoAcaoEquipe';
import { calcularHealthScore } from '@/hooks/useHealthScore';
import { DEFAULT_HEALTH_WEIGHTS } from './HealthScoreConfig';
import { HealthScoreCard } from './HealthScoreCard';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';
import {
  buscarKpisProfessoresCanonicos,
  consolidarKpisProfessoresCanonicos,
} from '@/lib/professoresKpisCanonicos';
import {
  chaveProfessorUnidade,
  filtrarKpisPorVinculosAtivos,
} from '@/lib/professoresKpisAgregados';
import { useHealthScoreProfessorV3Performance } from '@/hooks/useHealthScoreProfessorV3Performance';
import {
  isHealthScoreV3SnapshotVisible,
  rankHealthScoreV3Metric,
  resolveHealthScoreV3MetricDisplay,
  serializeHealthScoreV3ForAi,
  type HealthScoreV3MetricDisplay,
  type HealthScoreV3ProfessorPerformance,
} from '@/lib/healthScoreProfessorV3Performance';
import type { HealthMetricKeyV3 } from '@/lib/healthScoreProfessorV3';
import { getHealthScoreV3Period } from '@/lib/healthScoreProfessorV3Periodos';

const HEALTH_SCORE_V3_PERFORMANCE_FLAG = import.meta.env.VITE_HEALTH_SCORE_V3_PERFORMANCE_ENABLED;
const HEALTH_SCORE_V3_PERFORMANCE_ENABLED =
  HEALTH_SCORE_V3_PERFORMANCE_FLAG !== 'false';

interface ProfessorPerformance {
  id: number;
  nome: string;
  foto_url: string | null;
  especialidades: string[];
  unidades: { id: string; codigo: string; nome: string }[];
  total_alunos: number;
  total_turmas: number;
  alunos_via_turmas: number;
  turmas_elegiveis_media: number;
  media_alunos_turma: number;
  taxa_retencao: number;
  taxa_conversao: number;
  taxa_conversao_diagnostica?: number;
  experimentais: number;
  experimentais_agendadas: number;
  experimentais_faltas: number;
  matriculas_pos_exp: number;
  matriculas_diretas: number;
  nps: number | null;
  taxa_presenca: number | null;
  taxa_faltas: number | null;
  presenca_publicavel: boolean;
  presenca_confianca: string;
  presenca_cobertura: number;
  presenca_eventos_confirmados: number;
  presenca_eventos_incertos: number;
  evasoes_validas: number;
  saidas_validas_total: number;
  saidas_score_professor: number;
  evasoes_mes: number;
  nao_renovacoes_mes: number;
  mrr_perdido: number;
  mrr_perdido_score: number;
  status: 'critico' | 'atencao' | 'excelente';
  tendencia_media?: 'subindo' | 'estavel' | 'caindo';
  health_score: number;
  health_status: 'critico' | 'atencao' | 'saudavel';
  health_score_confiavel: boolean;
  health_detalhes: { kpi: string; valor: number; scoreNormalizado: number; peso: number; contribuicao: number }[];
  fator_demanda_ponderado: number | null;
  fator_demanda_publicavel: boolean;
  fator_demanda_cobertura: number;
  fator_demanda_fonte: string;
  fator_demanda_vinculos: number;
}

interface ProfessorPerformanceRow extends ProfessorPerformance {
  healthV3: HealthScoreV3ProfessorPerformance | null;
}

const HEALTH_SCORE_V3_METRIC_LABELS: Record<HealthMetricKeyV3, string> = {
  retencao: 'Retencao atribuivel',
  permanencia: 'Permanencia com o professor',
  conversao: 'Conversao Exp -> Mat',
  media_turma: 'Media de alunos por turma',
  numero_alunos: 'Numero de alunos',
  presenca: 'Presenca dos alunos',
};

function formatHealthScoreV3MetricValue(metricKey: HealthMetricKeyV3, value: number): string {
  if (metricKey === 'numero_alunos') return Math.round(value).toLocaleString('pt-BR');
  if (metricKey === 'media_turma') return value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  if (metricKey === 'permanencia') return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} meses`;
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`;
}

function HealthScoreV3MetricCell({
  snapshot,
  metricKey,
  onOpen,
}: {
  snapshot: HealthScoreV3ProfessorPerformance | null;
  metricKey: HealthMetricKeyV3;
  onOpen: () => void;
}) {
  const display = snapshot
    ? resolveHealthScoreV3MetricDisplay(snapshot, metricKey)
    : ({ value: null, observedValue: null, state: 'sem_base', rankable: false, metric: null } satisfies HealthScoreV3MetricDisplay);
  const metric = display.metric;
  const renderedValue = display.value === null
    ? display.state === 'auditoria' ? 'Em auditoria' : 'Sem base'
    : formatHealthScoreV3MetricValue(metricKey, display.value);
  const stateLabel = display.state === 'observado'
    ? 'observado'
    : display.state === 'provisorio'
      ? 'provisorio'
      : display.state === 'auditoria'
        ? 'auditoria'
        : display.state === 'sem_base'
          ? 'sem base'
          : null;
  const stateClass = display.state === 'normal'
    ? 'text-emerald-300'
    : display.state === 'observado'
      ? 'text-cyan-300'
      : display.state === 'provisorio'
        ? 'text-amber-300'
        : 'text-slate-400';

  return (
    <Tooltip
      side="top"
      content={
        <div className="min-w-[250px] text-xs">
          <p className="mb-1.5 font-bold text-slate-200">{HEALTH_SCORE_V3_METRIC_LABELS[metricKey]}</p>
          {display.state === 'auditoria' && display.observedValue !== null && (
            <p className="mb-1 text-amber-300">
              Valor observado preservado: {formatHealthScoreV3MetricValue(metricKey, display.observedValue)}
            </p>
          )}
          <div className="space-y-1 text-slate-300">
            <p>Estado: <strong>{stateLabel || 'publicavel'}</strong></p>
            {metric?.amostra !== null && metric?.amostra !== undefined && <p>Amostra: <strong>{metric.amostra}</strong></p>}
            {metric?.numerador !== null && metric?.denominador !== null && (
              <p>Base: <strong>{metric.numerador}/{metric.denominador}</strong></p>
            )}
            {metric?.fonte && <p className="break-all">Fonte: <strong>{metric.fonte}</strong></p>}
          </div>
          {metric?.motivoSemBase && <p className="mt-1.5 text-amber-300">{metric.motivoSemBase}</p>}
        </div>
      }
    >
      <button
        type="button"
        className={cn('inline-flex flex-col items-center font-medium hover:underline', stateClass)}
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
      >
        <span>{renderedValue}</span>
        {stateLabel && display.state !== 'auditoria' && display.state !== 'sem_base' && (
          <span className="text-[9px] font-normal uppercase text-slate-500">{stateLabel}</span>
        )}
      </button>
    </Tooltip>
  );
}

function resolveHealthScoreV3Status(snapshot: HealthScoreV3ProfessorPerformance | null): ProfessorPerformance['status'] | null {
  if (!snapshot || !isHealthScoreV3SnapshotVisible(snapshot)) return null;
  if (snapshot.classificacao === 'critico') return 'critico';
  if (snapshot.classificacao === 'atencao') return 'atencao';
  if (snapshot.classificacao === 'saudavel') return 'excelente';
  return null;
}

interface AlertaPerformance {
  tipo: 'critico' | 'atencao' | 'excelente';
  quantidade: number;
  descricao: string;
}

interface Props {
  unidadeAtual: UnidadeId;
  healthWeights?: typeof DEFAULT_HEALTH_WEIGHTS;
  onPeriodoChange?: (label: string | null) => void;
}

type HealthScoreV3CycleSelector = 'MAR-MAI' | 'JUN-AGO' | 'SET-NOV' | 'DEZ-FEV';

const CICLO_MES_REPRESENTATIVO: Record<HealthScoreV3CycleSelector, number> = {
  'MAR-MAI': 3,
  'JUN-AGO': 6,
  'SET-NOV': 9,
  'DEZ-FEV': 12,
};

function getCicloSelecao(mes: number): HealthScoreV3CycleSelector {
  if (mes >= 3 && mes <= 5) return 'MAR-MAI';
  if (mes >= 6 && mes <= 8) return 'JUN-AGO';
  if (mes >= 9 && mes <= 11) return 'SET-NOV';
  return 'DEZ-FEV';
}

export function TabPerformanceProfessores({ unidadeAtual, healthWeights, onPeriodoChange }: Props) {
  const toast = useToast();
  const requisicaoAtivaRef = useRef(0);

  // Hook de competência (Mês/Trim/Sem/Ano)
  const competenciaFiltro = useCompetenciaFiltro();
  const ano = competenciaFiltro.filtro.ano;
  const mes = competenciaFiltro.filtro.mes;
  const competencia = `${ano}-${String(mes).padStart(2, '0')}`;

  // Modo de visualização (mensal vs trimestral) — local desta aba
  const [modoVisualizacao, setModoVisualizacao] = useState<'mensal' | 'trimestre'>('mensal');
  const periodoV3 = useMemo(
    () => getHealthScoreV3Period(ano, mes, modoVisualizacao === 'trimestre' ? 'ciclo' : 'mensal'),
    [ano, mes, modoVisualizacao],
  );
  const periodoLabel = periodoV3.label;
  const healthScoreWeights = healthWeights ?? DEFAULT_HEALTH_WEIGHTS;
  const healthV3UnitId = unidadeAtual === 'todos' ? null : unidadeAtual;
  const {
    snapshots: healthV3Snapshots,
    loading: healthV3Loading,
    error: healthV3Error,
  } = useHealthScoreProfessorV3Performance({
    competencia,
    unidadeId: healthV3UnitId,
    periodicidade: modoVisualizacao === 'trimestre' ? 'ciclo' : 'mensal',
    enabled: HEALTH_SCORE_V3_PERFORMANCE_ENABLED,
  });

  // Sincronizar badge do header com o filtro local
  useEffect(() => {
    onPeriodoChange?.(periodoLabel);
    return () => { onPeriodoChange?.(null); };
  }, [periodoLabel]);
  
  const [professores, setProfessores] = useState<ProfessorPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [filtroBusca, setFiltroBusca] = useState('');
  
  const [modalDetalhes, setModalDetalhes] = useState<{ open: boolean; professor: ProfessorPerformance | null }>({
    open: false,
    professor: null
  });
  const [modalMeta, setModalMeta] = useState<{ open: boolean; professorId: number | null }>({
    open: false,
    professorId: null
  });
  const [modalAcao, setModalAcao] = useState<{ open: boolean; professorId: number | null }>({
    open: false,
    professorId: null
  });
  const [modalRelatorio, setModalRelatorio] = useState(false);
  const [modalTurmas, setModalTurmas] = useState<{ open: boolean; professorId: number | null; professorNome: string }>({
    open: false, professorId: null, professorNome: ''
  });
  const [modalPresenca, setModalPresenca] = useState<{ open: boolean; professorId: number | null; professorNome: string }>({
    open: false, professorId: null, professorNome: ''
  });
  const [modalEvasoes, setModalEvasoes] = useState<{ open: boolean; professorId: number | null; professorNome: string }>({
    open: false, professorId: null, professorNome: ''
  });
  const [modalRetencao, setModalRetencao] = useState<{ open: boolean; professorId: number | null; professorNome: string; taxaRetencao: number; totalAlunos: number; evasoesMes: number }>({
    open: false, professorId: null, professorNome: '', taxaRetencao: 0, totalAlunos: 0, evasoesMes: 0
  });
  const [modalConversao, setModalConversao] = useState<{ open: boolean; professorId: number | null; professorNome: string }>({
    open: false, professorId: null, professorNome: ''
  });

  useEffect(() => {
    carregarDados();
    return () => {
      requisicaoAtivaRef.current += 1;
    };
  }, [unidadeAtual, ano, mes, modoVisualizacao]);

  const carregarDados = async () => {
    const requisicaoId = ++requisicaoAtivaRef.current;
    setLoading(true);
    try {
      // Extrair ano e mês da competência (formato: YYYY-MM)
      const [anoFiltro, mesFiltro] = competencia.split('-').map(Number);

      // Buscar professores ativos
      let query = supabase
        .from('professores')
        .select('id, nome, foto_url, ativo')
        .eq('ativo', true)
        .order('nome');

      const referencia = new Date(anoFiltro, mesFiltro - 1, 1);
      const referenciaAnterior = new Date(referencia.getFullYear(), referencia.getMonth() - 1, 1);

      // Buscar relacionamentos de unidades
      const unidadesRelQuery = supabase
        .from('professores_unidades')
        .select('professor_id, unidade_id, unidades:unidade_id (nome, codigo)')
        .eq('emusys_ativo', true)
        .neq('validacao_status', 'ignorado');

      // Buscar relacionamentos de cursos
      const cursosRelQuery = supabase
        .from('professores_cursos')
        .select('professor_id, curso_id, cursos:curso_id (nome)');

      const [
        professoresResult,
        kpisAtuais,
        unidadesResult,
        cursosResult,
      ] = await Promise.all([
        query,
        buscarKpisProfessoresCanonicos({
          ano: anoFiltro,
          mes: mesFiltro,
          unidadeId: unidadeAtual,
          dataInicio: modoVisualizacao === 'trimestre' ? periodoV3.inicio : null,
          dataFim: modoVisualizacao === 'trimestre' ? periodoV3.fim : null,
        }),
        unidadesRelQuery,
        cursosRelQuery,
      ]);

      if (requisicaoId !== requisicaoAtivaRef.current) return;

      const { data: professoresData, error: profError } = professoresResult;
      if (profError) throw profError;

      const unidadesRelData = unidadesResult.data;
      const cursosRelData = cursosResult.data;
      const professoresAtivos = new Set(
        (professoresData || []).map((professor) => Number(professor.id)),
      );
      const vinculosAtivos = new Set(
        (unidadesRelData || [])
          .map((vinculo) => chaveProfessorUnidade(
            Number(vinculo.professor_id),
            vinculo.unidade_id ? String(vinculo.unidade_id) : null,
          ))
          .filter((chave): chave is string => chave !== null),
      );
      const kpisAtivos = filtrarKpisPorVinculosAtivos(
        kpisAtuais,
        professoresAtivos,
        vinculosAtivos,
      );
      const kpisData = consolidarKpisProfessoresCanonicos(kpisAtivos);

      // A consolidacao central resolve professores multiunidade sem perder o grao da competencia.
      const kpisPorProfessor = new Map(kpisData.map((kpi) => [kpi.professor_id, kpi]));

      // Montar professores com métricas
      const professoresCompletos: ProfessorPerformance[] = (professoresData || [])
        .map(prof => {
          const unidadesProf = unidadesRelData?.filter(u => u.professor_id === prof.id).map(u => ({
            id: u.unidade_id,
            codigo: (u.unidades as any)?.codigo || '',
            nome: (u.unidades as any)?.nome || ''
          })) || [];

          const cursosProf = cursosRelData?.filter(c => c.professor_id === prof.id).map(c => 
            (c.cursos as any)?.nome || ''
          ).filter(Boolean) || [];

          // Buscar KPIs reais do professor
          const kpis = kpisPorProfessor.get(prof.id);

          // Carteira de alunos (com matricula viva)
          const totalAlunos = Number(kpis?.carteira_alunos ?? 0);

          // A RPC canonica e a unica fonte para carteira, carga e media da competencia.
          const totalTurmas = Number(kpis?.total_turmas ?? 0);
          const alunosViaTurmas = Number(kpis?.alunos_via_turmas ?? 0);
          const turmasElegiveisMedia = Number(kpis?.turmas_elegiveis_media ?? 0);

          const mediaAlunosTurma = turmasElegiveisMedia > 0
            ? Number(kpis?.media_alunos_turma ?? (alunosViaTurmas / turmasElegiveisMedia))
            : 0;

          const experimentaisCanonicas = Number(kpis?.experimentais || 0);
          const faltasExperimentaisCanonicas = Number(kpis?.experimentais_faltas || 0);
          const matriculasPosExpCanonicas = Number(kpis?.matriculas_pos_exp || 0);
          const eventosExperimentaisCanonicos = Number(kpis?.experimentais_agendadas || 0);
          const taxaConversaoCanonica = Number(kpis?.taxa_conversao || 0);

          const presencaPublicavel = Boolean(kpis?.presenca_publicavel)
            && kpis?.media_presenca !== null
            && kpis?.media_presenca !== undefined;
          const taxaPresenca = presencaPublicavel ? Number(kpis?.media_presenca) : null;
          const nps = kpis?.nps_medio ? Number(kpis.nps_medio) : null;
          const evasoesValidas = Number(kpis?.evasoes_validas || 0);
          const naoRenovacoesValidas = Number(kpis?.nao_renovacoes_validas || 0);
          const saidasValidasTotal = Number(kpis?.saidas_validas_total || 0);
          const saidasScoreProfessor = Number(kpis?.saidas_score_professor || 0);
          
          // Retencao atribuivel considera somente saidas que impactam o score do professor.
          const taxaRetencao = totalAlunos > 0
            ? Number(kpis?.taxa_retencao_atribuivel ?? 100)
            : 0;

          // Calcular tendência da média de alunos/turma baseado no histórico real
          const tendencia: 'subindo' | 'estavel' | 'caindo' = 'estavel';

          // Calcular Health Score V2 usando os KPIs reais
          const healthResult = calcularHealthScore({
            mediaTurma: mediaAlunosTurma,
            retencao: taxaRetencao,
            conversao: taxaConversaoCanonica,
            // Presenca neutra impede penalizacao tecnica; o score permanece
            // bloqueado na UI enquanto a metrica nao for publicavel.
            presenca: taxaPresenca ?? 75,
            evasoes: saidasScoreProfessor,
            taxaCrescimentoAjustada: 0, // TODO: buscar da view vw_taxa_crescimento_professor
            taxaEvasao: totalAlunos > 0 ? (saidasScoreProfessor / totalAlunos) * 100 : 0,
            carteiraAlunos: totalAlunos
          }, healthScoreWeights);

          // Determinar status baseado no Health Score (V2)
          // Saudável (≥70) → excelente | Atenção (50-69) → atencao | Crítico (<50) → critico
          let status: 'critico' | 'atencao' | 'excelente' = 'excelente';
          if (healthResult.status === 'critico') {
            status = 'critico';
          } else if (healthResult.status === 'atencao') {
            status = 'atencao';
          }

          const fatorDemandaPublicavel = Boolean(kpis?.fator_demanda_publicavel)
            && kpis?.fator_demanda_ponderado !== null
            && kpis?.fator_demanda_ponderado !== undefined;
          const fatorDemandaPonderado = fatorDemandaPublicavel
            ? Number(kpis?.fator_demanda_ponderado)
            : null;

          return {
            id: prof.id,
            nome: prof.nome,
            foto_url: prof.foto_url,
            especialidades: cursosProf,
            unidades: unidadesProf,
            total_alunos: totalAlunos,
            total_turmas: totalTurmas,
            alunos_via_turmas: alunosViaTurmas,
            turmas_elegiveis_media: turmasElegiveisMedia,
            media_alunos_turma: Math.round(mediaAlunosTurma * 100) / 100,
            taxa_retencao: Math.round(taxaRetencao * 10) / 10,
            taxa_conversao: Math.round(taxaConversaoCanonica * 10) / 10,
            taxa_conversao_diagnostica: Math.round(taxaConversaoCanonica * 10) / 10,
            experimentais: experimentaisCanonicas,
            experimentais_agendadas: eventosExperimentaisCanonicos,
            experimentais_faltas: faltasExperimentaisCanonicas,
            matriculas_pos_exp: matriculasPosExpCanonicas,
            matriculas_diretas: kpis?.matriculas_diretas || 0,
            nps: nps ? Math.round(nps * 10) / 10 : null,
            taxa_presenca: taxaPresenca === null ? null : Math.round(taxaPresenca * 10) / 10,
            taxa_faltas: presencaPublicavel && kpis?.taxa_faltas !== null
              ? Math.round(Number(kpis?.taxa_faltas) * 10) / 10
              : null,
            presenca_publicavel: presencaPublicavel,
            presenca_confianca: kpis?.presenca_confianca || 'sem_base',
            presenca_cobertura: Number(kpis?.presenca_cobertura || 0),
            presenca_eventos_confirmados: Number(kpis?.presenca_eventos_confirmados || 0),
            presenca_eventos_incertos: Number(kpis?.presenca_eventos_incertos || 0),
            evasoes_validas: evasoesValidas,
            saidas_validas_total: saidasValidasTotal,
            saidas_score_professor: saidasScoreProfessor,
            // Compatibilidade: consumidores de Health usam este campo como subconjunto atribuivel.
            evasoes_mes: saidasScoreProfessor,
            nao_renovacoes_mes: naoRenovacoesValidas,
            mrr_perdido: Number(kpis?.mrr_perdido_total) || 0,
            mrr_perdido_score: Number(kpis?.mrr_perdido_score) || 0,
            status,
            tendencia_media: tendencia,
            health_score: healthResult.score,
            health_status: healthResult.status,
            health_score_confiavel: presencaPublicavel,
            health_detalhes: healthResult.detalhes,
            fator_demanda_ponderado: fatorDemandaPonderado === null
              ? null
              : Math.round(fatorDemandaPonderado * 100) / 100,
            fator_demanda_publicavel: fatorDemandaPublicavel,
            fator_demanda_cobertura: Number(kpis?.fator_demanda_cobertura || 0),
            fator_demanda_fonte: String(kpis?.fator_demanda_fonte || 'sem_base'),
            fator_demanda_vinculos: Number(kpis?.fator_demanda_vinculos || 0),
          };
        })
        .filter(p => {
          // Filtrar por unidade se necessário
          if (unidadeAtual !== 'todos') {
            return p.unidades.some(u => u.id === unidadeAtual);
          }
          // Identidades historicas permanecem no banco, mas nao compoem a
          // equipe atual quando nao existe nenhum vinculo Emusys ativo.
          return p.unidades.length > 0;
        });

      if (requisicaoId !== requisicaoAtivaRef.current) return;
      setProfessores(professoresCompletos);

      // Historical trend is complementary and must never block the current panel.
      if (modoVisualizacao !== 'trimestre') {
        void Promise.allSettled([
          buscarKpisProfessoresCanonicos({
            ano: referenciaAnterior.getFullYear(),
            mes: referenciaAnterior.getMonth() + 1,
            unidadeId: unidadeAtual,
          }),
        ]).then(([resultado]) => {
          if (requisicaoId !== requisicaoAtivaRef.current) return;
          if (resultado.status !== 'fulfilled') {
            const detalhe = resultado.reason as { code?: string; message?: string };
            console.warn('Falha ao carregar historico canonico:', JSON.stringify({
              ano: referenciaAnterior.getFullYear(),
              mes: referenciaAnterior.getMonth() + 1,
              code: detalhe?.code,
              message: detalhe?.message,
            }));
            return;
          }

          const anteriorPorProfessor = new Map(
            consolidarKpisProfessoresCanonicos(resultado.value)
              .map((kpi) => [kpi.professor_id, Number(kpi.media_alunos_turma || 0)] as const)
          );

          setProfessores((atuais) => atuais.map((professor) => {
            const anterior = anteriorPorProfessor.get(professor.id);
            if (anterior === undefined) return professor;
            const atual = professor.media_alunos_turma;
            const tendencia: 'subindo' | 'estavel' | 'caindo' = atual > anterior + 0.1
              ? 'subindo'
              : atual < anterior - 0.1
                ? 'caindo'
                : 'estavel';
            return { ...professor, tendencia_media: tendencia };
          }));
        });
      }
    } catch (error) {
      if (requisicaoId !== requisicaoAtivaRef.current) return;
      const detalhe = error as { code?: string; message?: string; details?: string; hint?: string };
      console.error('Erro ao carregar dados:', JSON.stringify({
        code: detalhe?.code,
        message: detalhe?.message,
        details: detalhe?.details,
        hint: detalhe?.hint,
      }));
      toast.error('Erro ao carregar dados de performance');
    } finally {
      if (requisicaoId === requisicaoAtivaRef.current) {
        setLoading(false);
      }
    }
  };

  const healthV3ByProfessor = useMemo(
    () => new Map(healthV3Snapshots.map((snapshot) => [snapshot.professorId, snapshot])),
    [healthV3Snapshots],
  );

  const professoresTabela = useMemo<ProfessorPerformanceRow[]>(
    () => professores.map((professor) => ({
      ...professor,
      healthV3: healthV3ByProfessor.get(professor.id) || null,
    })),
    [healthV3ByProfessor, professores],
  );

  const healthV3SnapshotsAtivos = useMemo(() => {
    const professoresAtivos = new Set(professores.map((professor) => professor.id));
    return healthV3Snapshots.filter((snapshot) => professoresAtivos.has(snapshot.professorId));
  }, [healthV3Snapshots, professores]);

  // Sob a flag V3, a tabela nunca recorre silenciosamente ao score V2.
  const professoresFiltrados = useMemo(() => {
    let resultado = [...professoresTabela];

    if (filtroStatus !== 'todos') {
      resultado = HEALTH_SCORE_V3_PERFORMANCE_ENABLED
        ? resultado.filter((professor) => resolveHealthScoreV3Status(professor.healthV3) === filtroStatus)
        : resultado.filter((professor) => professor.health_score_confiavel && professor.status === filtroStatus);
    }

    if (filtroBusca) {
      const termo = filtroBusca.toLowerCase();
      resultado = resultado.filter((professor) => professor.nome.toLowerCase().includes(termo));
    }

    resultado.sort((a, b) => {
      if (HEALTH_SCORE_V3_PERFORMANCE_ENABLED) {
        const aVisible = Boolean(a.healthV3 && isHealthScoreV3SnapshotVisible(a.healthV3));
        const bVisible = Boolean(b.healthV3 && isHealthScoreV3SnapshotVisible(b.healthV3));
        if (aVisible !== bVisible) return aVisible ? -1 : 1;
        if (aVisible && bVisible) return Number(b.healthV3?.score) - Number(a.healthV3?.score);
        return a.nome.localeCompare(b.nome, 'pt-BR');
      }

      if (a.health_score_confiavel !== b.health_score_confiavel) return a.health_score_confiavel ? -1 : 1;
      if (a.health_score_confiavel) return b.health_score - a.health_score;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });

    return resultado;
  }, [professoresTabela, filtroStatus, filtroBusca]);

  const alertas = useMemo<AlertaPerformance[]>(() => {
    if (HEALTH_SCORE_V3_PERFORMANCE_ENABLED) {
      const status = healthV3SnapshotsAtivos
        .filter(isHealthScoreV3SnapshotVisible)
        .map((snapshot) => resolveHealthScoreV3Status(snapshot));
      return [
        { tipo: 'critico', quantidade: status.filter((item) => item === 'critico').length, descricao: 'Health Score V3 critico' },
        { tipo: 'atencao', quantidade: status.filter((item) => item === 'atencao').length, descricao: 'Health Score V3 em atencao' },
        { tipo: 'excelente', quantidade: status.filter((item) => item === 'excelente').length, descricao: 'Health Score V3 saudavel' },
      ];
    }

    const avaliaveis = professores.filter(p => p.health_score_confiavel);
    const criticos = avaliaveis.filter(p => p.status === 'critico');
    const atencao = avaliaveis.filter(p => p.status === 'atencao');
    const excelentes = avaliaveis.filter(p => p.status === 'excelente');
    return [
      { tipo: 'critico', quantidade: criticos.length, descricao: 'Retencao ou media critica' },
      { tipo: 'atencao', quantidade: atencao.length, descricao: 'Metricas abaixo da meta' },
      { tipo: 'excelente', quantidade: excelentes.length, descricao: 'Health Score saudavel' },
    ];
  }, [healthV3SnapshotsAtivos, professores]);

  const rankings = useMemo(() => {
    if (HEALTH_SCORE_V3_PERFORMANCE_ENABLED) {
      const professorById = new Map(professores.map((professor) => [professor.id, professor]));
      const topRetencao = rankHealthScoreV3Metric(healthV3SnapshotsAtivos, 'retencao')[0];
      const topMediaTurma = rankHealthScoreV3Metric(healthV3SnapshotsAtivos, 'media_turma')[0];
      return {
        topRetencao: topRetencao ? {
          nome: professorById.get(topRetencao.professorId)?.nome || `Professor ${topRetencao.professorId}`,
          valor: topRetencao.value,
        } : null,
        topMediaTurma: topMediaTurma ? {
          nome: professorById.get(topMediaTurma.professorId)?.nome || `Professor ${topMediaTurma.professorId}`,
          valor: topMediaTurma.value,
        } : null,
      };
    }

    const comCarteira = professores.filter(p => p.total_alunos > 0);
    const comTurmas = professores.filter(p => p.total_turmas > 0);
    const topRetencao = [...comCarteira].sort((a, b) => b.taxa_retencao - a.taxa_retencao)[0];
    const topMediaTurma = [...comTurmas].sort((a, b) => b.media_alunos_turma - a.media_alunos_turma)[0];
    return {
      topRetencao: topRetencao ? { nome: topRetencao.nome, valor: topRetencao.taxa_retencao } : null,
      topMediaTurma: topMediaTurma ? { nome: topMediaTurma.nome, valor: topMediaTurma.media_alunos_turma } : null,
    };
  }, [healthV3SnapshotsAtivos, professores]);

  // Métricas gerais para o Plano de Ação da Equipe
  const metricasGerais = useMemo(() => {
    const totalAlunos = professores.reduce((acc, p) => acc + p.total_alunos, 0);
    const totalTurmas = professores.reduce((acc, p) => acc + p.total_turmas, 0);
    const totalEvasoes = professores.reduce((acc, p) => acc + p.evasoes_mes, 0);
    const totalExperimentais = professores.reduce((acc, p) => acc + p.experimentais, 0);
    const totalMatriculasPosExp = professores.reduce((acc, p) => acc + p.matriculas_pos_exp, 0);

    return {
      total_professores: professores.length,
      total_alunos: totalAlunos,
      media_geral_turma: totalTurmas > 0 ? totalAlunos / totalTurmas : 0,
      taxa_retencao_media: professores.length > 0 
        ? professores.reduce((acc, p) => acc + p.taxa_retencao, 0) / professores.length 
        : 0,
      taxa_conversao_media: totalExperimentais > 0 ? (totalMatriculasPosExp / totalExperimentais) * 100 : 0,
      nps_medio: 0, // DEPRECATED - mantido para compatibilidade
      total_evasoes: totalEvasoes,
      professores_criticos: professores.filter(p => p.health_score_confiavel && p.status === 'critico').length,
      professores_atencao: professores.filter(p => p.health_score_confiavel && p.status === 'atencao').length,
      professores_excelentes: professores.filter(p => p.health_score_confiavel && p.status === 'excelente').length
    };
  }, [professores]);

  // Health Score médio da equipe
  const conversaoEquipe = useMemo(() => {
    if (HEALTH_SCORE_V3_PERFORMANCE_ENABLED) {
      const metricas = healthV3SnapshotsAtivos
        .map((snapshot) => snapshot.metrics.get('conversao'))
        .filter((metrica) => metrica && Number(metrica.denominador) > 0);
      const realizadas = metricas.reduce((acc, metrica) => acc + Number(metrica?.denominador || 0), 0);
      const matriculas = metricas.reduce((acc, metrica) => acc + Number(metrica?.numerador || 0), 0);
      const taxa = realizadas > 0 ? (matriculas / realizadas) * 100 : 0;
      return { realizadas, matriculas, taxa: Math.round(taxa * 10) / 10 };
    }

    const realizadas = professores.reduce((acc, p) => acc + p.experimentais, 0);
    const matriculas = professores.reduce((acc, p) => acc + p.matriculas_pos_exp, 0);
    const taxa = realizadas > 0 ? (matriculas / realizadas) * 100 : 0;
    return {
      realizadas,
      matriculas,
      taxa: Math.round(taxa * 10) / 10,
    };
  }, [healthV3SnapshotsAtivos, professores]);

  const healthScoreEquipe = useMemo(() => {
    if (HEALTH_SCORE_V3_PERFORMANCE_ENABLED) {
      const avaliaveis = healthV3SnapshotsAtivos.filter(isHealthScoreV3SnapshotVisible);
      if (avaliaveis.length === 0) {
        return { media: 0, status: 'atencao' as const, disponivel: false };
      }
      const media = avaliaveis.reduce((acc, snapshot) => acc + Number(snapshot.score), 0) / avaliaveis.length;
      const status = media >= 70 ? 'saudavel' : media >= 50 ? 'atencao' : 'critico';
      return { media: Math.round(media * 10) / 10, status, disponivel: true };
    }

    const avaliaveis = professores.filter((professor) => professor.health_score_confiavel);
    if (avaliaveis.length === 0) {
      return { media: 0, status: 'atencao' as const, disponivel: false };
    }
    const soma = avaliaveis.reduce((acc, p) => acc + p.health_score, 0);
    const media = soma / avaliaveis.length;
    const status = media >= 70 ? 'saudavel' : media >= 40 ? 'atencao' : 'critico';
    return { media: Math.round(media * 10) / 10, status, disponivel: true };
  }, [healthV3SnapshotsAtivos, professores]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critico': return 'text-red-400 bg-red-500/20 border-red-500/30';
      case 'atencao': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      case 'excelente': return 'text-green-400 bg-green-500/20 border-green-500/30';
      default: return 'text-slate-400 bg-slate-500/20 border-slate-500/30';
    }
  };

  const getMetricaColor = (valor: number, limites: { critico: number; atencao: number }, inverso = false) => {
    if (inverso) {
      if (valor >= limites.atencao) return 'text-red-400';
      if (valor >= limites.critico) return 'text-yellow-400';
      return 'text-green-400';
    }
    if (valor < limites.critico) return 'text-red-400';
    if (valor < limites.atencao) return 'text-yellow-400';
    return 'text-green-400';
  };

  const getIniciais = (nome: string) => {
    return nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  };

  const getGradientByStatus = (status: string) => {
    switch (status) {
      case 'critico': return 'from-red-400 to-red-600';
      case 'atencao': return 'from-yellow-400 to-orange-500';
      case 'excelente': return 'from-green-400 to-emerald-600';
      default: return 'from-slate-400 to-slate-600';
    }
  };

  if (loading || (HEALTH_SCORE_V3_PERFORMANCE_ENABLED && healthV3Loading)) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {HEALTH_SCORE_V3_PERFORMANCE_ENABLED && healthV3Error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          A Performance V3 nao foi carregada. Nenhum indicador V2 foi usado como substituto: {healthV3Error}
        </div>
      )}
      {/* Alertas de Performance */}
      <div data-tour="professores-alertas" className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400" />
          <h2 className="font-semibold text-white">Alertas de Performance</h2>
          <span className="text-xs text-slate-400 ml-auto">
            Atualizado {format(new Date(), "HH:mm", { locale: ptBR })}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {alertas.map((alerta) => (
            <div
              key={alerta.tipo}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 border cursor-pointer hover:opacity-80 transition ${getStatusColor(alerta.tipo)}`}
              onClick={() => setFiltroStatus(alerta.tipo)}
            >
              <span className="text-2xl">
                {alerta.tipo === 'critico' ? '🔴' : alerta.tipo === 'atencao' ? '🟡' : '🟢'}
              </span>
              <div>
                <p className="font-medium text-sm">
                  {alerta.quantidade} professor{alerta.quantidade !== 1 ? 'es' : ''} {alerta.tipo === 'critico' ? 'crítico' : alerta.tipo === 'atencao' ? 'atenção' : 'excelente'}{alerta.quantidade !== 1 ? 's' : ''}
                </p>
                <p className="text-xs opacity-70">{alerta.descricao}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ranking Rápido + Health Score com Gauge */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        {/* Conversao Exp->Mat canonica */}
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 h-[115px] flex flex-col justify-center">
          <p className="text-xs text-emerald-300 mb-1">Exp -&gt; Matricula</p>
          <p className="text-white font-semibold text-xl">
            {conversaoEquipe.realizadas > 0 ? `${conversaoEquipe.taxa.toFixed(1)}%` : 'Sem base'}
          </p>
          <p className={cn('text-xs', conversaoEquipe.realizadas > 0 ? 'text-emerald-300' : 'text-slate-400')}>
            {conversaoEquipe.realizadas > 0
              ? `${conversaoEquipe.matriculas}/${conversaoEquipe.realizadas} confirmadas`
              : 'sem experimentais confirmadas no periodo'}
          </p>
        </div>

        {/* Top Retenção */}
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 h-[115px] flex flex-col justify-center">
          <p className="text-xs text-slate-400 mb-1">🏆 Top Retenção</p>
          {rankings.topRetencao ? (
            <>
              <p className="text-white font-semibold text-sm truncate">{rankings.topRetencao.nome}</p>
              <p className="text-green-400 text-sm">{rankings.topRetencao.valor.toFixed(1)}% retenção</p>
            </>
          ) : (
            <p className="text-slate-500 text-sm">Sem ranking publicável</p>
          )}
        </div>

        {/* HEALTH SCORE COM GAUGE - DESTAQUE NO CENTRO */}
        <div className={`bg-slate-900 rounded-2xl p-4 border-2 ${
          !healthScoreEquipe.disponivel
            ? 'border-slate-700'
            : healthScoreEquipe.status === 'saudavel'
            ? 'border-violet-500/50' 
            : healthScoreEquipe.status === 'atencao'
            ? 'border-amber-500/50'
            : 'border-rose-500/50'
        } shadow-lg row-span-1`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                !healthScoreEquipe.disponivel
                  ? 'bg-slate-800'
                  : healthScoreEquipe.status === 'saudavel'
                  ? 'bg-violet-500/20' 
                  : healthScoreEquipe.status === 'atencao'
                  ? 'bg-amber-500/20'
                  : 'bg-rose-500/20'
              }`}>
                <Heart className={`w-4 h-4 ${
                  !healthScoreEquipe.disponivel
                    ? 'text-slate-500'
                    : healthScoreEquipe.status === 'saudavel'
                    ? 'text-violet-400' 
                    : healthScoreEquipe.status === 'atencao'
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`} />
              </div>
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                Health Score
              </span>
            </div>
          </div>
          
          {/* GAUGE SVG */}
          <div className="flex flex-col items-center justify-center">
            <svg width="140" height="85" viewBox="0 0 180 110" className="overflow-visible">
              <defs>
                <linearGradient id="healthGaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#EF4444" />
                  <stop offset="45%" stopColor="#F59E0B" />
                  <stop offset="75%" stopColor="#84CC16" />
                  <stop offset="90%" stopColor="#22C55E" />
                  <stop offset="100%" stopColor="#22C55E" />
                </linearGradient>
              </defs>
              {/* Arco de Fundo */}
              <path d="M 15 90 A 75 75 0 0 1 165 90" fill="none" stroke="#1e293b" strokeWidth="16" strokeLinecap="round"/>
              {/* Arco Ativo com Gradiente */}
              {healthScoreEquipe.disponivel && (
                <path d="M 15 90 A 75 75 0 0 1 165 90" fill="none" stroke="url(#healthGaugeGradient)" strokeWidth="16" strokeLinecap="round"/>
              )}
              {/* Ponteiro */}
              {healthScoreEquipe.disponivel && (
                <g style={{
                  transform: `rotate(${(healthScoreEquipe.media / 100) * 180 - 90}deg)`,
                  transformOrigin: '90px 90px',
                  transition: 'transform 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)'
                }}>
                  <path d="M 87 90 L 90 30 L 93 90 Z" fill="#94a3b8"/>
                  <circle cx="90" cy="90" r="5" fill="#94a3b8"/>
                  <circle cx="90" cy="90" r="2" fill="white"/>
                </g>
              )}
            </svg>
            <div className="mt-[-12px] text-center z-10">
              <span className={`text-2xl font-black tracking-tighter ${
                !healthScoreEquipe.disponivel
                  ? 'text-slate-500'
                  : healthScoreEquipe.status === 'saudavel'
                  ? 'text-violet-400' 
                  : healthScoreEquipe.status === 'atencao'
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}>
                {healthScoreEquipe.disponivel ? healthScoreEquipe.media : '-'}
              </span>
              <p className="text-[8px] font-semibold text-slate-500 uppercase tracking-widest">
                {healthScoreEquipe.disponivel ? 'Média Geral' : 'Em auditoria'}
              </p>
            </div>
          </div>
        </div>

        {/* Top Média Turma */}
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 h-[115px] flex flex-col justify-center">
          <p className="text-xs text-slate-400 mb-1">🏆 Top Média Turma</p>
          {rankings.topMediaTurma ? (
            <>
              <p className="text-white font-semibold text-sm truncate">{rankings.topMediaTurma.nome}</p>
              <p className="text-green-400 text-sm">{rankings.topMediaTurma.valor.toFixed(1)} alunos/turma</p>
            </>
          ) : (
            <p className="text-slate-500 text-sm">Sem ranking publicável</p>
          )}
        </div>
      </div>

      {HEALTH_SCORE_V3_PERFORMANCE_ENABLED ? (
        <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">
          Health Score parcial visível no período selecionado. Rankings e premiações permanecem reservados ao ciclo oficial fechado.
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          Conversao de professores usando fonte canonica Emusys + vinculo LA Report.
          Matriculas pos-exp contam matriculas/cursos gerados por experimentais confirmadas; no Health Score a contribuicao e limitada a 100.
        </div>
      )}

      {/* Filtros e Relatório */}
      <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Filtros à esquerda */}
          <div className="flex items-center gap-3">
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="critico">🔴 Crítico</SelectItem>
                <SelectItem value="atencao">🟡 Atenção</SelectItem>
                <SelectItem value="excelente">🟢 Excelente</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar professor..."
                value={filtroBusca}
                onChange={(e) => setFiltroBusca(e.target.value)}
                className="pl-9 w-48"
              />
            </div>
            
            {/* Seletores de Ano e Mês */}
            <Select value={String(ano)} onValueChange={(v) => competenciaFiltro.setAno(Number(v))}>
              <SelectTrigger className="w-[100px]">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                {competenciaFiltro.anosDisponiveis.map(a => (
                  <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {modoVisualizacao === 'mensal' ? (
              <Select value={String(mes)} onValueChange={(v) => competenciaFiltro.setMes(Number(v))}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  {competenciaFiltro.MESES_CURTO.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select
                value={getCicloSelecao(mes)}
                onValueChange={(v) => competenciaFiltro.setMes(CICLO_MES_REPRESENTATIVO[v as HealthScoreV3CycleSelector])}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Trimestre" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MAR-MAI">Mar / Abr / Mai</SelectItem>
                  <SelectItem value="JUN-AGO">Jun / Jul / Ago</SelectItem>
                  <SelectItem value="SET-NOV">Set / Out / Nov</SelectItem>
                  <SelectItem value="DEZ-FEV">Dez / Jan / Fev</SelectItem>
                </SelectContent>
              </Select>
            )}

            {/* Toggle Mensal / Trimestral */}
            <Tooltip
              side="top"
              content={
                <div className="text-xs max-w-[260px]">
                    <p className="font-bold text-slate-200 mb-1">Visão por ciclo</p>
                  <p className="text-slate-400 mb-1.5">
                      Agrega os três meses do ciclo oficial sem fazer média simples de percentuais.
                  </p>
                    <p className="text-slate-400 text-[11px]">Jun-Ago, Set-Nov, Dez-Fev e Mar-Mai.</p>
                </div>
              }
            >
              <div className="bg-slate-800/50 p-1 rounded-lg inline-flex gap-1 border border-slate-700">
                <button
                  onClick={() => setModoVisualizacao('mensal')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    modoVisualizacao === 'mensal'
                      ? 'bg-violet-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  Mensal
                </button>
                <button
                  onClick={() => setModoVisualizacao('trimestre')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${
                    modoVisualizacao === 'trimestre'
                      ? 'bg-violet-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  <Calendar className="w-3 h-3" />
                  Ciclo
                </button>
              </div>
            </Tooltip>
          </div>

          {/* Botão Relatório à direita */}
          <button
            onClick={() => setModalRelatorio(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-cyan-500/20"
          >
            <FileText className="w-4 h-4" />
            Gerar Relatório Coordenação
          </button>
        </div>
      </div>

      {/* Tabela de Performance */}
      <div data-tour="professores-tabela" className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Professor</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">
                  <div className="flex items-center justify-center gap-1">
                    <Heart className="w-3 h-3 text-violet-400" />
                    <span>Health</span>
                  </div>
                </th>
                {!HEALTH_SCORE_V3_PERFORMANCE_ENABLED && (
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">
                    <div className="flex items-center justify-center gap-1">
                      <TrendingUp className="w-3 h-3 text-amber-400" />
                      <span>Fator</span>
                    </div>
                  </th>
                )}
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Alunos</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Média/Turma</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Retenção</th>
                {HEALTH_SCORE_V3_PERFORMANCE_ENABLED && (
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Permanência</th>
                )}
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Exp → Mat</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Presença</th>
                {!HEALTH_SCORE_V3_PERFORMANCE_ENABLED && (
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Saidas</th>
                )}
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Status</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {professoresFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={HEALTH_SCORE_V3_PERFORMANCE_ENABLED ? 10 : 11} className="p-8 text-center text-slate-400">
                    Nenhum professor encontrado
                  </td>
                </tr>
              ) : (
                professoresFiltrados.map((professor) => (
                  <tr
                    key={professor.id}
                    className={`hover:bg-slate-700/30 transition-colors cursor-pointer ${
                      (HEALTH_SCORE_V3_PERFORMANCE_ENABLED
                        ? resolveHealthScoreV3Status(professor.healthV3) === 'critico'
                        : professor.health_score_confiavel && professor.status === 'critico')
                        ? 'bg-red-500/5'
                        : ''
                    }`}
                    onClick={() => setModalDetalhes({ open: true, professor })}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getGradientByStatus(
                          HEALTH_SCORE_V3_PERFORMANCE_ENABLED
                            ? resolveHealthScoreV3Status(professor.healthV3) || 'em_auditoria'
                            : professor.health_score_confiavel ? professor.status : 'em_auditoria'
                        )} flex items-center justify-center text-white font-bold text-sm`}>
                          {professor.foto_url ? (
                            <img src={professor.foto_url} alt="" className="w-full h-full rounded-full object-cover" />
                          ) : (
                            getIniciais(professor.nome)
                          )}
                        </div>
                        <div>
                          <p className="text-white font-medium">{professor.nome}</p>
                          <p className="text-slate-400 text-xs">{professor.especialidades.slice(0, 2).join(', ')}</p>
                        </div>
                      </div>
                    </td>
                    {/* Health Score */}
                    <td className="text-center px-4 py-3">
                      {HEALTH_SCORE_V3_PERFORMANCE_ENABLED ? (
                        <Tooltip
                          side="top"
                          content={
                            <div className="min-w-[240px] text-xs">
                              <p className="mb-1.5 font-bold text-slate-200">Health Score V3</p>
                              <p className="text-slate-300">
                                Cobertura: <strong>{professor.healthV3?.cobertura?.toFixed(1) ?? '0'}%</strong>
                              </p>
                              <p className="text-slate-300">
                                Revisão: <strong>{professor.healthV3?.revisao ?? '-'}</strong>
                              </p>
                              {professor.healthV3?.motivoBloqueio && (
                                <p className="mt-1.5 text-amber-300">{professor.healthV3.motivoBloqueio}</p>
                              )}
                            </div>
                          }
                        >
                          <div className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 ${
                            professor.healthV3 && isHealthScoreV3SnapshotVisible(professor.healthV3)
                              ? resolveHealthScoreV3Status(professor.healthV3) === 'critico'
                                ? 'border-rose-700 bg-rose-900/30 text-rose-400'
                                : resolveHealthScoreV3Status(professor.healthV3) === 'atencao'
                                  ? 'border-amber-700 bg-amber-900/30 text-amber-400'
                                  : 'border-emerald-700 bg-emerald-900/30 text-emerald-400'
                              : 'border-slate-600 bg-slate-800 text-slate-400'
                          }`}>
                            <span className="text-sm font-black">
                              {professor.healthV3 && isHealthScoreV3SnapshotVisible(professor.healthV3)
                                ? Math.round(Number(professor.healthV3.score))
                                : 'Sem base'}
                            </span>
                          </div>
                        </Tooltip>
                      ) : (
                        <Tooltip
                        side="top"
                        content={professor.health_score_confiavel ? (
                          <div className="min-w-[260px] text-xs" onClick={(e) => e.stopPropagation()}>
                            <p className="font-bold text-slate-200 mb-2">Composição do Health Score</p>
                            <table className="w-full">
                              <thead>
                                <tr className="text-slate-400 border-b border-slate-600">
                                  <th className="text-left pb-1">KPI</th>
                                  <th className="text-right pb-1">Valor</th>
                                  <th className="text-right pb-1">Pts</th>
                                  <th className="text-right pb-1">Peso</th>
                                  <th className="text-right pb-1">Contrib.</th>
                                </tr>
                              </thead>
                              <tbody>
                                {professor.health_detalhes.map((d) => (
                                  <tr key={d.kpi} className="border-b border-slate-700/50">
                                    <td className="py-0.5 text-slate-300">{d.kpi}</td>
                                    <td className="py-0.5 text-right text-slate-400">{d.valor.toFixed(1)}</td>
                                    <td className="py-0.5 text-right text-white">{d.scoreNormalizado.toFixed(1)}</td>
                                    <td className="py-0.5 text-right text-slate-400">{Math.round(d.peso * 100)}%</td>
                                    <td className="py-0.5 text-right text-white font-medium">{d.contribuicao.toFixed(1)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="border-t border-slate-500">
                                  <td colSpan={4} className="pt-1 font-bold text-slate-200">Total</td>
                                  <td className="pt-1 text-right font-black text-white">{Math.round(professor.health_score)}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        ) : (
                          <div className="min-w-[230px] text-xs">
                            <p className="font-bold text-slate-200 mb-1.5">Health Score em auditoria</p>
                            <p className="text-slate-400">
                              O score nao e publicado enquanto a presenca nao tiver confianca alta.
                            </p>
                            <div className="mt-2 space-y-1 text-slate-300">
                              <p>Cobertura confirmada: <strong>{(professor.presenca_cobertura * 100).toFixed(1)}%</strong></p>
                              <p>Eventos confirmados: <strong>{professor.presenca_eventos_confirmados}</strong></p>
                              <p>Eventos incertos: <strong>{professor.presenca_eventos_incertos}</strong></p>
                            </div>
                          </div>
                        )}
                      >
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border cursor-help ${
                          !professor.health_score_confiavel
                            ? 'bg-slate-800 border-slate-600 text-slate-400'
                            : professor.health_status === 'saudavel'
                            ? 'bg-emerald-900/30 border-emerald-700 text-emerald-400'
                            : professor.health_status === 'atencao'
                            ? 'bg-amber-900/30 border-amber-700 text-amber-400'
                            : 'bg-rose-900/30 border-rose-700 text-rose-400'
                        }`}>
                          <span className="text-sm font-black">
                            {professor.health_score_confiavel ? Math.round(professor.health_score) : 'Em auditoria'}
                          </span>
                        </div>
                        </Tooltip>
                      )}
                    </td>
                    {!HEALTH_SCORE_V3_PERFORMANCE_ENABLED && (
                      <>{/* Fator de Demanda Ponderado */}
                      <td className="text-center px-4 py-3">
                      {professor.fator_demanda_publicavel && professor.fator_demanda_ponderado !== null ? (
                        <Tooltip
                          side="top"
                          content={`Fonte: ${professor.fator_demanda_fonte} · ${professor.fator_demanda_vinculos} vinculos · ${(professor.fator_demanda_cobertura * 100).toFixed(0)}% de cobertura`}
                        >
                          <span className={`px-2 py-1 rounded-lg text-sm font-medium cursor-help ${
                            professor.fator_demanda_ponderado <= 1.2
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : professor.fator_demanda_ponderado <= 1.8
                              ? 'bg-cyan-500/20 text-cyan-400'
                              : professor.fator_demanda_ponderado <= 2.3
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-rose-500/20 text-rose-400'
                          }`}>
                            {professor.fator_demanda_ponderado.toFixed(1)}
                          </span>
                        </Tooltip>
                      ) : (
                        <Tooltip side="top" content="Nao ha cobertura completa de pessoa e curso nesta competencia.">
                          <span className="inline-flex rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs font-medium text-slate-400 cursor-help">
                            Sem base
                          </span>
                        </Tooltip>
                      )}
                      </td></>
                    )}
                    <td className="text-center px-4 py-3 text-white">
                      {HEALTH_SCORE_V3_PERFORMANCE_ENABLED ? (
                        <HealthScoreV3MetricCell
                          snapshot={professor.healthV3}
                          metricKey="numero_alunos"
                          onOpen={() => setModalDetalhes({ open: true, professor })}
                        />
                      ) : professor.total_alunos}
                    </td>
                    <td className="text-center px-4 py-3">
                      {HEALTH_SCORE_V3_PERFORMANCE_ENABLED ? (
                        <HealthScoreV3MetricCell
                          snapshot={professor.healthV3}
                          metricKey="media_turma"
                          onOpen={() => setModalDetalhes({ open: true, professor })}
                        />
                      ) : (<>
                      <Tooltip side="top" content={professor.turmas_elegiveis_media > 0
                        ? `${professor.alunos_via_turmas} alunos regulares únicos ÷ ${professor.turmas_elegiveis_media} turmas regulares = ${professor.media_alunos_turma.toFixed(2)} alunos/turma · Carga total: ${professor.total_turmas} turmas`
                        : 'Sem turmas ativas no período · Clique para detalhes'}>
                        <span
                          className={`font-medium cursor-pointer hover:underline ${getMetricaColor(professor.media_alunos_turma, { critico: 1.3, atencao: 1.5 })}`}
                          onClick={(e) => { e.stopPropagation(); setModalTurmas({ open: true, professorId: professor.id, professorNome: professor.nome }); }}
                        >
                          {professor.media_alunos_turma.toFixed(1)}
                        </span>
                      </Tooltip>
                      {professor.tendencia_media && (
                        <span className={`ml-1 text-xs ${
                          professor.tendencia_media === 'subindo' ? 'text-green-400' :
                          professor.tendencia_media === 'caindo' ? 'text-red-400' : 'text-slate-400'
                        }`}>
                          {professor.tendencia_media === 'subindo' ? '↑' : professor.tendencia_media === 'caindo' ? '↓' : ''}
                        </span>
                      )}
                      </>)}
                    </td>
                    <td className="text-center px-4 py-3">
                      {HEALTH_SCORE_V3_PERFORMANCE_ENABLED ? (
                        <HealthScoreV3MetricCell
                          snapshot={professor.healthV3}
                          metricKey="retencao"
                          onOpen={() => setModalDetalhes({ open: true, professor })}
                        />
                      ) : (
                      <Tooltip
                        side="top"
                        content={
                          <div className="text-xs min-w-[200px]">
                            <p className="font-bold text-slate-200 mb-1.5">Retencao atribuivel</p>
                            <div className="space-y-1">
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-400">Carteira de alunos</span>
                                <span className="text-white font-medium">{professor.total_alunos}</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-400">Saidas que impactam o score</span>
                                <span className="text-red-400 font-medium">{professor.saidas_score_professor}</span>
                              </div>
                              <div className="flex justify-between gap-4 border-t border-slate-600 pt-1 mt-1">
                                <span className="text-slate-400">Taxa de impacto</span>
                                <span className="text-white font-medium">
                                  {professor.total_alunos > 0 ? ((professor.saidas_score_professor / professor.total_alunos) * 100).toFixed(1) : '0'}%
                                </span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-300 font-semibold">Retencao atribuivel</span>
                                <span className="text-white font-bold">{professor.taxa_retencao.toFixed(1)}%</span>
                              </div>
                            </div>
                          </div>
                        }
                      >
                        <span
                          className={`font-medium cursor-pointer hover:underline ${getMetricaColor(professor.taxa_retencao, { critico: 70, atencao: 95 })}`}
                          onClick={(e) => { e.stopPropagation(); setModalRetencao({ open: true, professorId: professor.id, professorNome: professor.nome, taxaRetencao: professor.taxa_retencao, totalAlunos: professor.total_alunos, evasoesMes: professor.saidas_score_professor }); }}
                        >
                          {professor.taxa_retencao.toFixed(0)}%
                        </span>
                      </Tooltip>
                      )}
                    </td>
                    {HEALTH_SCORE_V3_PERFORMANCE_ENABLED && (
                      <td className="text-center px-4 py-3">
                        <HealthScoreV3MetricCell
                          snapshot={professor.healthV3}
                          metricKey="permanencia"
                          onOpen={() => setModalDetalhes({ open: true, professor })}
                        />
                      </td>
                    )}
                    <td className="text-center px-4 py-3">
                      {HEALTH_SCORE_V3_PERFORMANCE_ENABLED ? (
                        <HealthScoreV3MetricCell
                          snapshot={professor.healthV3}
                          metricKey="conversao"
                          onOpen={() => setModalDetalhes({ open: true, professor })}
                        />
                      ) : (
                      <Tooltip
                        side="top"
                        content={
                          <div className="text-xs min-w-[220px]">
                            <p className="font-bold text-slate-200 mb-1.5">Funil de Experimentais</p>
                            <div className="space-y-1">
                              <div className="flex justify-between gap-4">
                                <span className="text-amber-400">Eventos Emusys</span>
                                <span className="text-white font-medium">{professor.experimentais_agendadas}</span>
                              </div>
                              <div className="pl-2 border-l-2 border-slate-700 space-y-0.5">
                                <div className="flex justify-between gap-4">
                                  <span className="text-emerald-400">↓ Realizadas</span>
                                  <span className="text-white font-medium">
                                    {professor.experimentais}
                                    {professor.experimentais_agendadas > 0 && (
                                      <span className="text-slate-500 text-[10px] ml-1">
                                        ({Math.round((professor.experimentais / professor.experimentais_agendadas) * 100)}%)
                                      </span>
                                    )}
                                  </span>
                                </div>
                                {professor.experimentais_faltas > 0 && (
                                  <div className="flex justify-between gap-4">
                                    <span className="text-red-400">↓ Faltas</span>
                                    <span className="text-white font-medium">{professor.experimentais_faltas}</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex justify-between gap-4 pt-1">
                                <span className="text-cyan-400">Matriculas pos-exp canonicas</span>
                                <span className="text-cyan-300 font-medium">
                                  {professor.matriculas_pos_exp}
                                  {professor.experimentais > 0 && (
                                    <span className="text-slate-500 text-[10px] ml-1">
                                      ({Math.round((professor.matriculas_pos_exp / professor.experimentais) * 100)}%)
                                    </span>
                                  )}
                                </span>
                              </div>
                              {professor.matriculas_diretas > 0 && (
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">+ Matrículas diretas</span>
                                  <span className="text-blue-400 font-medium">{professor.matriculas_diretas}</span>
                                </div>
                              )}
                              <div className="border-t border-slate-700 pt-1 flex justify-between gap-4">
                                <span className="text-slate-300">Total matrículas</span>
                                <span className="text-white font-bold">{professor.matriculas_pos_exp + professor.matriculas_diretas}</span>
                              </div>
                            </div>
                            <p className="text-emerald-300 mt-1.5 text-[10px]">Fonte canonica Emusys + vinculo LA Report</p>
                          </div>
                        }
                      >
                        <span
                          className={`font-medium ${
                            professor.experimentais > 0 ? 'text-emerald-300' : 'text-slate-500'
                          }`}
                        >
                          {professor.experimentais > 0 ? `${professor.taxa_conversao.toFixed(0)}%` : '-'}
                          {professor.experimentais > 0 && (
                            <span className="text-slate-500 text-[10px] ml-1">
                              {professor.matriculas_pos_exp}/{professor.experimentais}
                            </span>
                          )}
                          {professor.matriculas_diretas > 0 && (
                            <span className="text-blue-400/70 text-[10px] ml-0.5">+{professor.matriculas_diretas}</span>
                          )}
                        </span>
                      </Tooltip>
                      )}
                    </td>
                    <td className="text-center px-4 py-3">
                      {HEALTH_SCORE_V3_PERFORMANCE_ENABLED ? (
                        <HealthScoreV3MetricCell
                          snapshot={professor.healthV3}
                          metricKey="presenca"
                          onOpen={() => setModalDetalhes({ open: true, professor })}
                        />
                      ) : professor.presenca_publicavel && professor.taxa_presenca !== null && professor.taxa_faltas !== null ? (
                        <Tooltip
                          side="top"
                          content={
                            <div className="text-xs min-w-[180px]">
                              <p className="font-bold text-slate-200 mb-1.5">Presenca no Mes</p>
                              <div className="space-y-1">
                                <div className="flex justify-between gap-4">
                                  <span className="text-emerald-400">Presenca</span>
                                  <span className="text-white font-medium">{professor.taxa_presenca.toFixed(1)}%</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-red-400">Faltas</span>
                                  <span className="text-white font-medium">{professor.taxa_faltas.toFixed(1)}%</span>
                                </div>
                              </div>
                              <p className="text-slate-500 mt-1.5 text-[10px]">Clique para ver por aluno</p>
                            </div>
                          }
                        >
                          <span
                            className={`font-medium cursor-pointer hover:underline ${getMetricaColor(professor.taxa_presenca, { critico: 70, atencao: 80 })}`}
                            onClick={(e) => { e.stopPropagation(); setModalPresenca({ open: true, professorId: professor.id, professorNome: professor.nome }); }}
                          >
                            {professor.taxa_presenca.toFixed(0)}%
                          </span>
                        </Tooltip>
                      ) : (
                        <Tooltip
                          side="top"
                          content={
                            <div className="text-xs min-w-[220px]">
                              <p className="font-bold text-slate-200 mb-1.5">Presenca em auditoria</p>
                              <p className="text-slate-400">
                                O Emusys ainda mistura falta confirmada com chamada nao registrada neste recorte.
                              </p>
                              <div className="mt-2 space-y-1 text-slate-300">
                                <p>Cobertura confirmada: <strong>{(professor.presenca_cobertura * 100).toFixed(1)}%</strong></p>
                                <p>Confirmados: <strong>{professor.presenca_eventos_confirmados}</strong></p>
                                <p>Incertos: <strong>{professor.presenca_eventos_incertos}</strong></p>
                              </div>
                            </div>
                          }
                        >
                          <span className="inline-flex items-center rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs font-medium text-slate-400 cursor-help">
                            Em auditoria
                          </span>
                        </Tooltip>
                      )}
                    </td>
                    {!HEALTH_SCORE_V3_PERFORMANCE_ENABLED && (
                    <td className="text-center px-4 py-3">
                      <Tooltip
                        side="top"
                        content={
                          <div className="text-xs min-w-[200px]">
                            <p className="font-bold text-slate-200 mb-1.5">Saidas no periodo</p>
                            <div className="space-y-1">
                              <div className="flex justify-between gap-4">
                                <span className="text-red-400">Evasoes validas</span>
                                <span className="text-white font-medium">{professor.evasoes_validas}</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-amber-400">Não renovações</span>
                                <span className="text-white font-medium">{professor.nao_renovacoes_mes}</span>
                              </div>
                              <div className="flex justify-between gap-4 border-t border-slate-600 pt-1 mt-1">
                                <span className="text-slate-300 font-semibold">Total de saidas</span>
                                <span className="text-white font-bold">{professor.saidas_validas_total}</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-violet-300">Impactam o score</span>
                                <span className="text-violet-200 font-medium">{professor.saidas_score_professor}</span>
                              </div>
                              {professor.mrr_perdido > 0 && (
                                <div className="flex justify-between gap-4 border-t border-slate-600 pt-1 mt-1">
                                  <span className="text-slate-400">MRR perdido</span>
                                  <span className="text-red-400 font-medium">
                                    {professor.mrr_perdido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        }
                      >
                        <span
                          className={`font-medium cursor-pointer hover:underline ${getMetricaColor(professor.saidas_validas_total, { critico: 1, atencao: 3 }, true)}`}
                          onClick={(e) => { e.stopPropagation(); setModalEvasoes({ open: true, professorId: professor.id, professorNome: professor.nome }); }}
                        >
                          {professor.saidas_validas_total}
                        </span>
                      </Tooltip>
                    </td>
                    )}
                    <td className="text-center px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${
                        HEALTH_SCORE_V3_PERFORMANCE_ENABLED
                          ? getStatusColor(resolveHealthScoreV3Status(professor.healthV3) || 'sem_base')
                          : professor.health_score_confiavel
                            ? getStatusColor(professor.status)
                            : 'text-slate-400 bg-slate-500/10 border-slate-600'
                      }`}>
                        {HEALTH_SCORE_V3_PERFORMANCE_ENABLED
                          ? resolveHealthScoreV3Status(professor.healthV3) === 'critico'
                            ? 'Crítico'
                            : resolveHealthScoreV3Status(professor.healthV3) === 'atencao'
                              ? 'Atenção'
                              : resolveHealthScoreV3Status(professor.healthV3) === 'excelente'
                                ? 'Excelente'
                                : 'Sem base'
                          : professor.health_score_confiavel
                            ? (professor.status === 'critico' ? 'Crítico' : professor.status === 'atencao' ? 'Atenção' : 'Excelente')
                            : 'Em auditoria'}
                      </span>
                    </td>
                    <td className="text-center px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-blue-400 hover:text-blue-300"
                        onClick={() => setModalDetalhes({ open: true, professor })}
                      >
                        Ver
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-slate-700 text-sm text-slate-400">
          Mostrando {professoresFiltrados.length} de {professoresTabela.length} professores
        </div>
      </div>

      {/* Legenda de Métricas */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        <p className="text-xs text-slate-400 mb-3">📊 Referência de Metas</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
          <div>
            <p className="text-slate-300 font-medium">Média/Turma</p>
            <p className="text-red-400">🔴 &lt;1.3 Crítico</p>
            <p className="text-yellow-400">🟡 1.3-1.5 Atenção</p>
            <p className="text-green-400">🟢 &gt;1.5 Excelente</p>
          </div>
          <div>
            <p className="text-slate-300 font-medium">Retenção</p>
            <p className="text-red-400">🔴 &lt;70% Crítico</p>
            <p className="text-yellow-400">🟡 70-95% Regular</p>
            <p className="text-green-400">🟢 &gt;95% Excelente</p>
          </div>
          <div>
            <p className="text-slate-300 font-medium">Conversao Exp-&gt;Mat</p>
            <p className="text-green-400">&gt;40% Saudavel</p>
            <p className="text-slate-400">Fonte canonica Emusys</p>
          </div>
          <div>
            <p className="text-slate-300 font-medium">Presença</p>
            <p className="text-slate-400">Publicada apenas com confiança alta</p>
            <p className="text-slate-500">Recortes incertos ficam em auditoria</p>
          </div>
        </div>
      </div>

      {/* Plano de Ação Inteligente - Equipe */}
      {professores.length > 0 && (
        <PlanoAcaoEquipe
          professores={professores.map(p => ({
            id: p.id,
            nome: p.nome,
            total_alunos: p.total_alunos,
            total_turmas: p.total_turmas,
            alunos_via_turmas: p.alunos_via_turmas,
            turmas_elegiveis_media: p.turmas_elegiveis_media,
            media_alunos_turma: p.media_alunos_turma,
            taxa_retencao: p.taxa_retencao,
            taxa_conversao: p.taxa_conversao,
            nps: p.nps,
            taxa_presenca: p.taxa_presenca,
            presenca_publicavel: p.presenca_publicavel,
            presenca_confianca: p.presenca_confianca,
            presenca_cobertura: p.presenca_cobertura,
            presenca_eventos_confirmados: p.presenca_eventos_confirmados,
            presenca_eventos_incertos: p.presenca_eventos_incertos,
            evasoes_mes: p.evasoes_mes,
            status: p.status,
            health_score_v3: serializeHealthScoreV3ForAi(
              healthV3ByProfessor.get(p.id) || null,
            ),
            unidades: p.unidades.map(u => u.codigo)
          }))}
          metricas_gerais={metricasGerais}
          competencia={competencia}
          unidade_nome={unidadeAtual !== 'todos' ? unidadeAtual : undefined}
        />
      )}

      {/* Modais */}
      <ModalDetalhesProfessorPerformance
        open={modalDetalhes.open}
        onClose={() => setModalDetalhes({ open: false, professor: null })}
        professor={modalDetalhes.professor}
        competencia={competencia}
        onNovaMeta={(profId) => {
          setModalDetalhes({ open: false, professor: null });
          setModalMeta({ open: true, professorId: profId });
        }}
        onNovaAcao={(profId) => {
          setModalDetalhes({ open: false, professor: null });
          setModalAcao({ open: true, professorId: profId });
        }}
        healthWeights={healthWeights}
        unidadeId={unidadeAtual !== 'todos' ? unidadeAtual : null}
        unidadeNome={unidadeAtual !== 'todos' ? unidadeAtual : 'Consolidado'}
        periodicidade={modoVisualizacao === 'trimestre' ? 'ciclo' : 'mensal'}
      />

      <ModalNovaMeta
        open={modalMeta.open}
        onClose={() => setModalMeta({ open: false, professorId: null })}
        professorId={modalMeta.professorId}
        onSave={() => {
          setModalMeta({ open: false, professorId: null });
          toast.success('Meta criada!', 'A meta foi cadastrada com sucesso');
        }}
        unidadeId={unidadeAtual !== 'todos' ? unidadeAtual : null}
        professorUnidades={professores.find(p => p.id === modalMeta.professorId)?.unidades}
      />

      <ModalNovaAcao
        open={modalAcao.open}
        onClose={() => setModalAcao({ open: false, professorId: null })}
        professorId={modalAcao.professorId}
        onSave={() => {
          setModalAcao({ open: false, professorId: null });
          toast.success('Ação agendada!', 'A ação foi cadastrada com sucesso');
        }}
      />

      <ModalRelatorioCoordenacao
        open={modalRelatorio}
        onOpenChange={setModalRelatorio}
        unidadeId={unidadeAtual !== 'todos' ? unidadeAtual : null}
        unidadeNome={unidadeAtual !== 'todos' ? ({
          '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'Campo Grande',
          '95553e96-971b-4590-a6eb-0201d013c14d': 'Recreio',
          '368d47f5-2d88-4475-bc14-ba084a9a348e': 'Barra'
        }[unidadeAtual] || unidadeAtual) : 'Consolidado'}
        ano={parseInt(competencia.split('-')[0])}
        mes={parseInt(competencia.split('-')[1])}
        professores={professores}
      />

      <ModalDetalhesPresenca
        open={modalPresenca.open}
        onClose={() => setModalPresenca({ open: false, professorId: null, professorNome: '' })}
        professorId={modalPresenca.professorId}
        professorNome={modalPresenca.professorNome}
        ano={parseInt(competencia.split('-')[0])}
        mes={parseInt(competencia.split('-')[1])}
        unidadeId={unidadeAtual}
        dataInicio={modoVisualizacao === 'trimestre' ? periodoV3.inicio : undefined}
        dataFim={modoVisualizacao === 'trimestre' ? periodoV3.fim : undefined}
        periodoLabel={modoVisualizacao === 'trimestre' ? periodoV3.label : undefined}
      />

      <ModalDetalhesEvasoes
        open={modalEvasoes.open}
        onClose={() => setModalEvasoes({ open: false, professorId: null, professorNome: '' })}
        professorId={modalEvasoes.professorId}
        professorNome={modalEvasoes.professorNome}
        ano={parseInt(competencia.split('-')[0])}
        mes={parseInt(competencia.split('-')[1])}
        unidadeId={unidadeAtual}
        dataInicio={modoVisualizacao === 'trimestre' ? periodoV3.inicio : undefined}
        dataFim={modoVisualizacao === 'trimestre' ? periodoV3.fim : undefined}
        periodoLabel={modoVisualizacao === 'trimestre' ? periodoV3.label : undefined}
      />

      <ModalDetalhesRetencao
        open={modalRetencao.open}
        onClose={() => setModalRetencao({ open: false, professorId: null, professorNome: '', taxaRetencao: 0, totalAlunos: 0, evasoesMes: 0 })}
        professorId={modalRetencao.professorId}
        professorNome={modalRetencao.professorNome}
        ano={parseInt(competencia.split('-')[0])}
        mes={parseInt(competencia.split('-')[1])}
        unidadeId={unidadeAtual}
        taxaRetencao={modalRetencao.taxaRetencao}
        totalAlunos={modalRetencao.totalAlunos}
        evasoesMes={modalRetencao.evasoesMes}
        dataInicio={modoVisualizacao === 'trimestre' ? periodoV3.inicio : undefined}
        dataFim={modoVisualizacao === 'trimestre' ? periodoV3.fim : undefined}
        periodoLabel={modoVisualizacao === 'trimestre' ? periodoV3.label : undefined}
      />

      <ModalDetalhesConversao
        open={modalConversao.open}
        onClose={() => setModalConversao({ open: false, professorId: null, professorNome: '' })}
        professorId={modalConversao.professorId}
        professorNome={modalConversao.professorNome}
        ano={parseInt(competencia.split('-')[0])}
        mes={parseInt(competencia.split('-')[1])}
        unidadeId={unidadeAtual}
        dataInicio={modoVisualizacao === 'trimestre' ? periodoV3.inicio : undefined}
        dataFim={modoVisualizacao === 'trimestre' ? periodoV3.fim : undefined}
        periodoLabel={modoVisualizacao === 'trimestre' ? periodoV3.label : undefined}
      />

      <ModalDetalhesTurmas
        open={modalTurmas.open}
        onClose={() => setModalTurmas({ open: false, professorId: null, professorNome: '' })}
        professorId={modalTurmas.professorId}
        professorNome={modalTurmas.professorNome}
        unidadeId={unidadeAtual}
        unidadeNome={unidadeAtual !== 'todos' ? ({
          '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'Campo Grande',
          '95553e96-971b-4590-a6eb-0201d013c14d': 'Recreio',
          '368d47f5-2d88-4475-bc14-ba084a9a348e': 'Barra'
        }[unidadeAtual] || undefined) : undefined}
        dataInicio={modoVisualizacao === 'trimestre'
          ? periodoV3.inicio
          : `${ano}-${String(mes).padStart(2, '0')}-01`}
        dataFim={modoVisualizacao === 'trimestre'
          ? periodoV3.fim
          : `${ano}-${String(mes).padStart(2, '0')}-${String(new Date(ano, mes, 0).getDate()).padStart(2, '0')}`}
        periodoLabel={periodoLabel}
        resumoCanonico={(() => {
          const professor = professores.find((item) => item.id === modalTurmas.professorId);
          return professor ? {
            totalTurmas: professor.total_turmas,
            carteiraAlunos: professor.total_alunos,
            ocupacoesRegulares: professor.alunos_via_turmas,
            turmasRegulares: professor.turmas_elegiveis_media,
            mediaAlunosTurma: professor.media_alunos_turma,
          } : undefined;
        })()}
      />

      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
    </div>
  );
}
