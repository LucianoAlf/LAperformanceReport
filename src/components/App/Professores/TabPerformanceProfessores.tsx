import { useState, useEffect, useMemo } from 'react';
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

interface ProfessorPerformance {
  id: number;
  nome: string;
  foto_url: string | null;
  especialidades: string[];
  unidades: { id: string; codigo: string; nome: string }[];
  total_alunos: number;
  total_turmas: number;
  alunos_via_turmas: number;
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
  taxa_presenca: number;
  taxa_faltas: number;
  evasoes_mes: number;
  nao_renovacoes_mes: number;
  mrr_perdido: number;
  status: 'critico' | 'atencao' | 'excelente';
  tendencia_media?: 'subindo' | 'estavel' | 'caindo';
  health_score: number;
  health_status: 'critico' | 'atencao' | 'saudavel';
  health_detalhes: { kpi: string; valor: number; scoreNormalizado: number; peso: number; contribuicao: number }[];
  fator_demanda_ponderado: number; // Fator de demanda ponderado pela composição da carteira
}

interface ConversaoProfessorCanonica {
  professor_id: number;
  professor_nome: string;
  unidade_id: string;
  unidade_nome: string;
  realizadas_emusys: number;
  faltas_emusys: number;
  canceladas_emusys: number;
  matriculas_pos_exp: number;
  taxa_exp_mat: number;
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

// Codigo do trimestre operacional baseado no mes
function getTrimestreCodigo(mes: number): 'T1' | 'T2' | 'T3' | 'NC' {
  if (mes >= 3 && mes <= 5) return 'T1';
  if (mes >= 6 && mes <= 8) return 'T2';
  if (mes >= 9 && mes <= 11) return 'T3';
  return 'NC';
}

// Mes representativo de cada trimestre (usado ao trocar trimestre no dropdown)
const TRIMESTRE_MES_REPRESENTATIVO: Record<'T1' | 'T2' | 'T3' | 'NC', number> = {
  T1: 4, // Abril
  T2: 7, // Julho
  T3: 10, // Outubro
  NC: 1, // Janeiro (Periodo Nao Considerado: Dez(ano-1) + Jan/Fev(ano))
};

// Calcula trimestre operacional (T1/T2/T3 ou Período Não Considerado) a partir de ano + mes
function getTrimestreOperacional(ano: number, mes: number): { dataInicio: string; dataFim: string; label: string } {
  if (mes >= 3 && mes <= 5) {
    return { dataInicio: `${ano}-03-01`, dataFim: `${ano}-05-31`, label: `T1 ${ano}` };
  }
  if (mes >= 6 && mes <= 8) {
    return { dataInicio: `${ano}-06-01`, dataFim: `${ano}-08-31`, label: `T2 ${ano}` };
  }
  if (mes >= 9 && mes <= 11) {
    return { dataInicio: `${ano}-09-01`, dataFim: `${ano}-11-30`, label: `T3 ${ano}` };
  }
  // Período Não Considerado: Dez(ano-1) + Jan/Fev(ano) (quando mes 1 ou 2)
  // ou Dez(ano) + Jan/Fev(ano+1) (quando mes 12)
  if (mes === 12) {
    const ultimoDiaFev = new Date(ano + 1, 2, 0).getDate();
    return {
      dataInicio: `${ano}-12-01`,
      dataFim: `${ano + 1}-02-${String(ultimoDiaFev).padStart(2, '0')}`,
      label: `Período Não Considerado ${ano + 1}`,
    };
  }
  // mes 1 ou 2
  const ultimoDiaFev = new Date(ano, 2, 0).getDate();
  return {
    dataInicio: `${ano - 1}-12-01`,
    dataFim: `${ano}-02-${String(ultimoDiaFev).padStart(2, '0')}`,
    label: `Período Não Considerado ${ano}`,
  };
}

export function TabPerformanceProfessores({ unidadeAtual, healthWeights, onPeriodoChange }: Props) {
  const toast = useToast();

  // Hook de competência (Mês/Trim/Sem/Ano)
  const competenciaFiltro = useCompetenciaFiltro();
  const ano = competenciaFiltro.filtro.ano;
  const mes = competenciaFiltro.filtro.mes;
  const competencia = `${ano}-${String(mes).padStart(2, '0')}`;

  // Modo de visualização (mensal vs trimestral) — local desta aba
  const [modoVisualizacao, setModoVisualizacao] = useState<'mensal' | 'trimestre'>('mensal');
  const trimestreInfo = useMemo(() => getTrimestreOperacional(ano, mes), [ano, mes]);
  const periodoLabel = modoVisualizacao === 'trimestre' ? trimestreInfo.label : competenciaFiltro.range.label;
  const healthScoreWeights = healthWeights ?? DEFAULT_HEALTH_WEIGHTS;

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
  }, [unidadeAtual, ano, mes, modoVisualizacao]);

  const carregarDados = async () => {
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

      const { data: professoresData, error: profError } = await query;
      if (profError) throw profError;

      // Buscar KPIs via RPC parametrizada (funciona para qualquer período)
      const rpcParams: Record<string, any> = { p_ano: anoFiltro, p_mes: mesFiltro };
      if (unidadeAtual !== 'todos') rpcParams.p_unidade_id = unidadeAtual;
      if (modoVisualizacao === 'trimestre') {
        rpcParams.p_data_inicio = trimestreInfo.dataInicio;
        rpcParams.p_data_fim = trimestreInfo.dataFim;
      }

      const { data: kpisRpc } = await supabase
        .rpc('get_kpis_professor_periodo', rpcParams);

      const kpisData: any[] = kpisRpc || [];

      const mesInicioCanonico = modoVisualizacao === 'trimestre'
        ? Number(trimestreInfo.dataInicio.slice(5, 7))
        : mesFiltro;
      const mesFimCanonico = modoVisualizacao === 'trimestre'
        ? Number(trimestreInfo.dataFim.slice(5, 7))
        : mesFiltro;
      const anoInicioCanonico = modoVisualizacao === 'trimestre'
        ? Number(trimestreInfo.dataInicio.slice(0, 4))
        : anoFiltro;
      const usaRangeCanonicoMesmoAno = anoInicioCanonico === anoFiltro;

      const { data: conversaoProfessorRpc, error: conversaoProfessorError } = await supabase
        .rpc('get_experimentais_professor_canonicos_v1', {
          p_unidade_id: unidadeAtual !== 'todos' ? unidadeAtual : null,
          p_ano: anoFiltro,
          p_mes_inicio: usaRangeCanonicoMesmoAno ? mesInicioCanonico : mesFiltro,
          p_mes_fim: usaRangeCanonicoMesmoAno ? mesFimCanonico : mesFiltro,
        });

      if (conversaoProfessorError) throw conversaoProfessorError;

      // Buscar KPIs históricos para calcular tendências (filtrado por unidade se selecionada)
      let historicoQuery = supabase
        .from('vw_kpis_professor_mensal')
        .select('professor_id, ano, mes, media_alunos_turma, unidade_id')
        .gte('ano', ano - 1)
        .order('ano', { ascending: false })
        .order('mes', { ascending: false });
      
      if (unidadeAtual !== 'todos') {
        historicoQuery = historicoQuery.eq('unidade_id', unidadeAtual);
      }
      
      const { data: kpisHistorico } = await historicoQuery;

      // Buscar fator de demanda ponderado por professor
      let fatorDemandaQuery = supabase
        .from('vw_fator_demanda_professor')
        .select('professor_id, fator_demanda_ponderado, total_alunos, unidade_id');
      
      if (unidadeAtual !== 'todos') {
        fatorDemandaQuery = fatorDemandaQuery.eq('unidade_id', unidadeAtual);
      }
      
      const { data: fatoresDemanda } = await fatorDemandaQuery;

      // Buscar relacionamentos de unidades
      const { data: unidadesRelData } = await supabase
        .from('professores_unidades')
        .select('professor_id, unidade_id, unidades:unidade_id (nome, codigo)');

      // Buscar relacionamentos de cursos
      const { data: cursosRelData } = await supabase
        .from('professores_cursos')
        .select('professor_id, curso_id, cursos:curso_id (nome)');

      // Buscar turmas da view vw_turmas_implicitas (filtrado por unidade se selecionada)
      let turmasQuery = supabase
        .from('vw_turmas_implicitas')
        .select('professor_id, total_alunos, unidade_id');
      
      if (unidadeAtual !== 'todos') {
        turmasQuery = turmasQuery.eq('unidade_id', unidadeAtual);
      }
      
      const { data: turmasImplicitas } = await turmasQuery;

      // Buscar turmas explícitas (filtrado por unidade se selecionada)
      let turmasExplicitasQuery = supabase
        .from('turmas_explicitas')
        .select('professor_id, id, unidade_id')
        .eq('ativo', true);
      
      if (unidadeAtual !== 'todos') {
        turmasExplicitasQuery = turmasExplicitasQuery.eq('unidade_id', unidadeAtual);
      }
      
      const { data: turmasExplicitas } = await turmasExplicitasQuery;

      // Buscar alunos de turmas explícitas (filtrado por unidade via turmas_explicitas)
      let alunosTurmasQuery = supabase
        .from('turmas_alunos')
        .select('turma_id, aluno_id, turmas_explicitas!inner(professor_id, unidade_id)')
        .eq('turmas_explicitas.ativo', true);
      
      if (unidadeAtual !== 'todos') {
        alunosTurmasQuery = alunosTurmasQuery.eq('turmas_explicitas.unidade_id', unidadeAtual);
      }
      
      const { data: alunosTurmasExplicitas } = await alunosTurmasQuery;

      // Criar mapa de KPIs por professor (agregar quando consolidado — professor com múltiplas unidades)
      const kpisPorProfessor = new Map<number, any>();
      kpisData?.forEach(kpi => {
        if (!kpisPorProfessor.has(kpi.professor_id)) {
          kpisPorProfessor.set(kpi.professor_id, { ...kpi, _unidades_count: 1 });
        } else {
          // Somar métricas de múltiplas unidades
          const e = kpisPorProfessor.get(kpi.professor_id);
          const prevCarteira = e.carteira_alunos || 0;
          const kpiCarteira = kpi.carteira_alunos || 0;
          // Somatórios
          e.carteira_alunos = prevCarteira + kpiCarteira;
          e.experimentais = (e.experimentais || 0) + (kpi.experimentais || 0);
          e.experimentais_agendadas = (e.experimentais_agendadas || 0) + (kpi.experimentais_agendadas || 0);
          e.experimentais_faltas = (e.experimentais_faltas || 0) + (kpi.experimentais_faltas || 0);
          e.matriculas = (e.matriculas || 0) + (kpi.matriculas || 0);
          e.matriculas_pos_exp = (e.matriculas_pos_exp || 0) + (kpi.matriculas_pos_exp || 0);
          e.matriculas_diretas = (e.matriculas_diretas || 0) + (kpi.matriculas_diretas || 0);
          e.renovacoes = (e.renovacoes || 0) + (kpi.renovacoes || 0);
          e.nao_renovacoes = (e.nao_renovacoes || 0) + (kpi.nao_renovacoes || 0);
          e.evasoes = (e.evasoes || 0) + (kpi.evasoes || 0);
          e.mrr_carteira = (Number(e.mrr_carteira) || 0) + (Number(kpi.mrr_carteira) || 0);
          e.mrr_perdido = (Number(e.mrr_perdido) || 0) + (Number(kpi.mrr_perdido) || 0);
          // Turmas: soma direta. media_alunos_turma = alunos_via_turmas / total_turmas (mesma fórmula do modal)
          e.total_turmas = (e.total_turmas || 0) + (kpi.total_turmas || 0);
          e.alunos_via_turmas = (e.alunos_via_turmas || 0) + (kpi.alunos_via_turmas || 0);
          e.media_alunos_turma = e.total_turmas > 0
            ? Math.round((e.alunos_via_turmas / e.total_turmas) * 100) / 100
            : 0;
          // Média ponderada por carteira (presença e ticket continuam ponderados — outras métricas)
          const totalCarteira = prevCarteira + kpiCarteira;
          if (totalCarteira > 0) {
            e.media_presenca = ((Number(e.media_presenca) || 0) * prevCarteira + (Number(kpi.media_presenca) || 0) * kpiCarteira) / totalCarteira;
            e.ticket_medio = ((Number(e.ticket_medio) || 0) * prevCarteira + (Number(kpi.ticket_medio) || 0) * kpiCarteira) / totalCarteira;
          }
          // Recalcular taxas
          const totalExp = e.experimentais || 0;
          e.taxa_conversao = totalExp > 0 ? ((e.matriculas_pos_exp || 0) / totalExp) * 100 : 0;
          const totalRenov = (e.renovacoes || 0) + (e.nao_renovacoes || 0);
          e.taxa_renovacao = totalRenov > 0 ? ((e.renovacoes || 0) / totalRenov) * 100 : 0;
          e.taxa_cancelamento = e.carteira_alunos > 0 ? ((e.evasoes || 0) / e.carteira_alunos) * 100 : 0;
          e._unidades_count += 1;
        }
      });

      // Criar mapa de histórico para calcular tendências
      const conversaoCanonicaPorProfessor = new Map<number, ConversaoProfessorCanonica>();
      (conversaoProfessorRpc || []).forEach((row: any) => {
        const professorId = Number(row.professor_id);
        if (!professorId) return;

        const atual = conversaoCanonicaPorProfessor.get(professorId) || {
          professor_id: professorId,
          professor_nome: row.professor_nome || '',
          unidade_id: row.unidade_id || '',
          unidade_nome: row.unidade_nome || '',
          realizadas_emusys: 0,
          faltas_emusys: 0,
          canceladas_emusys: 0,
          matriculas_pos_exp: 0,
          taxa_exp_mat: 0,
        };

        atual.realizadas_emusys += Number(row.realizadas_emusys) || 0;
        atual.faltas_emusys += Number(row.faltas_emusys) || 0;
        atual.canceladas_emusys += Number(row.canceladas_emusys) || 0;
        atual.matriculas_pos_exp += Number(row.matriculas_pos_exp) || 0;
        atual.taxa_exp_mat = atual.realizadas_emusys > 0
          ? (atual.matriculas_pos_exp / atual.realizadas_emusys) * 100
          : 0;

        conversaoCanonicaPorProfessor.set(professorId, atual);
      });

      const historicoMap = new Map<number, any[]>();
      kpisHistorico?.forEach(h => {
        if (!historicoMap.has(h.professor_id)) {
          historicoMap.set(h.professor_id, []);
        }
        historicoMap.get(h.professor_id)!.push(h);
      });

      // Criar mapa de fator de demanda ponderado por professor (média quando múltiplas unidades)
      const fatorDemandaMap = new Map<number, number>();
      const fatorDemandaCount = new Map<number, number>();
      fatoresDemanda?.forEach(f => {
        const val = Number(f.fator_demanda_ponderado) || 1.0;
        if (!fatorDemandaMap.has(f.professor_id)) {
          fatorDemandaMap.set(f.professor_id, val);
          fatorDemandaCount.set(f.professor_id, 1);
        } else {
          const count = (fatorDemandaCount.get(f.professor_id) || 1) + 1;
          const prev = fatorDemandaMap.get(f.professor_id) || 1.0;
          fatorDemandaMap.set(f.professor_id, (prev * (count - 1) + val) / count);
          fatorDemandaCount.set(f.professor_id, count);
        }
      });

      // Montar mapas de contagens
      const turmasPorProfessor = new Map<number, number>();
      const alunosPorProfessor = new Map<number, number>();
      const totalAlunosTurmasPorProfessor = new Map<number, number[]>();

      // Processar turmas implícitas
      turmasImplicitas?.forEach(t => {
        const profId = t.professor_id;
        turmasPorProfessor.set(profId, (turmasPorProfessor.get(profId) || 0) + 1);
        alunosPorProfessor.set(profId, (alunosPorProfessor.get(profId) || 0) + (t.total_alunos || 0));
        const turmasAlunos = totalAlunosTurmasPorProfessor.get(profId) || [];
        turmasAlunos.push(t.total_alunos || 0);
        totalAlunosTurmasPorProfessor.set(profId, turmasAlunos);
      });

      // Processar turmas explícitas
      const alunosPorTurmaExplicita = new Map<number, number>();
      alunosTurmasExplicitas?.forEach(a => {
        const turmaId = a.turma_id;
        alunosPorTurmaExplicita.set(turmaId, (alunosPorTurmaExplicita.get(turmaId) || 0) + 1);
      });

      turmasExplicitas?.forEach(t => {
        const profId = t.professor_id;
        const alunosTurma = alunosPorTurmaExplicita.get(t.id) || 0;
        if (alunosTurma === 0) return; // ignorar turmas sem alunos — evita média < 1.0
        turmasPorProfessor.set(profId, (turmasPorProfessor.get(profId) || 0) + 1);
        alunosPorProfessor.set(profId, (alunosPorProfessor.get(profId) || 0) + alunosTurma);
        const turmasAlunos = totalAlunosTurmasPorProfessor.get(profId) || [];
        turmasAlunos.push(alunosTurma);
        totalAlunosTurmasPorProfessor.set(profId, turmasAlunos);
      });

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
          const totalAlunos = kpis?.carteira_alunos || alunosPorProfessor.get(prof.id) || 0;

          // Turmas e alunos via carteira (fallback para vw_turmas_implicitas se RPC retornar 0)
          const turmasFallback = totalAlunosTurmasPorProfessor.get(prof.id) || [];
          const totalTurmas = kpis?.total_turmas || turmasFallback.length || 0;
          const alunosViaTurmas = kpis?.alunos_via_turmas || turmasFallback.reduce((sum, n) => sum + n, 0) || 0;

          // Media = alunos_via_turmas / total_turmas (mesma formula da coluna e do modal)
          const mediaAlunosTurma = totalTurmas > 0
            ? (kpis?.media_alunos_turma ? Number(kpis.media_alunos_turma) : alunosViaTurmas / totalTurmas)
            : 0;

          // Metricas da RPC/view. Exp->Mat vem da fonte canonica do Emusys.
          const conversaoCanonica = conversaoCanonicaPorProfessor.get(prof.id);
          const experimentaisCanonicas = conversaoCanonica?.realizadas_emusys || 0;
          const faltasExperimentaisCanonicas = conversaoCanonica?.faltas_emusys || 0;
          const canceladasExperimentaisCanonicas = conversaoCanonica?.canceladas_emusys || 0;
          const matriculasPosExpCanonicas = conversaoCanonica?.matriculas_pos_exp || 0;
          const eventosExperimentaisCanonicos = experimentaisCanonicas + faltasExperimentaisCanonicas + canceladasExperimentaisCanonicas;
          const taxaConversaoCanonica = experimentaisCanonicas > 0
            ? (matriculasPosExpCanonicas / experimentaisCanonicas) * 100
            : 0;

          const taxaPresenca = kpis?.media_presenca ? Number(kpis.media_presenca) : 0;
          const nps = kpis?.nps_medio ? Number(kpis.nps_medio) : null;
          const evasoesMes = kpis?.evasoes || 0;
          
          // Taxa de retenção = 100 - taxa de cancelamento
          const taxaRetencao = kpis?.taxa_cancelamento 
            ? 100 - Number(kpis.taxa_cancelamento) 
            : (totalAlunos > 0 ? 100 : 0);

          // Calcular tendência da média de alunos/turma baseado no histórico real
          let tendencia: 'subindo' | 'estavel' | 'caindo' = 'estavel';
          const historico = historicoMap.get(prof.id) || [];
          if (historico.length >= 2) {
            const atual = Number(historico[0]?.media_alunos_turma || 0);
            const anterior = Number(historico[1]?.media_alunos_turma || 0);
            if (atual > anterior + 0.1) tendencia = 'subindo';
            else if (atual < anterior - 0.1) tendencia = 'caindo';
          }

          // Calcular Health Score V2 usando os KPIs reais
          const healthResult = calcularHealthScore({
            mediaTurma: mediaAlunosTurma,
            retencao: taxaRetencao,
            conversao: taxaConversaoCanonica,
            presenca: taxaPresenca,
            evasoes: evasoesMes,
            taxaCrescimentoAjustada: 0, // TODO: buscar da view vw_taxa_crescimento_professor
            taxaEvasao: totalAlunos > 0 ? (evasoesMes / totalAlunos) * 100 : 0,
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

          // Obter fator de demanda ponderado do mapa
          const fatorDemandaPonderado = fatorDemandaMap.get(prof.id) || 1.0;

          return {
            id: prof.id,
            nome: prof.nome,
            foto_url: prof.foto_url,
            especialidades: cursosProf,
            unidades: unidadesProf,
            total_alunos: totalAlunos,
            total_turmas: totalTurmas,
            alunos_via_turmas: alunosViaTurmas,
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
            taxa_presenca: Math.round(taxaPresenca * 10) / 10,
            taxa_faltas: kpis?.taxa_faltas ? Math.round(Number(kpis.taxa_faltas) * 10) / 10 : 0,
            evasoes_mes: evasoesMes,
            nao_renovacoes_mes: kpis?.nao_renovacoes || 0,
            mrr_perdido: Number(kpis?.mrr_perdido) || 0,
            status,
            tendencia_media: tendencia,
            health_score: healthResult.score,
            health_status: healthResult.status,
            health_detalhes: healthResult.detalhes,
            fator_demanda_ponderado: Math.round(fatorDemandaPonderado * 100) / 100
          };
        })
        .filter(p => {
          // Filtrar por unidade se necessário
          if (unidadeAtual !== 'todos') {
            return p.unidades.some(u => u.id === unidadeAtual);
          }
          return true;
        });

      setProfessores(professoresCompletos);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados de performance');
    } finally {
      setLoading(false);
    }
  };

  // Filtrar e ordenar professores
  const professoresFiltrados = useMemo(() => {
    let resultado = [...professores];

    if (filtroStatus !== 'todos') {
      resultado = resultado.filter(p => p.status === filtroStatus);
    }

    if (filtroBusca) {
      const termo = filtroBusca.toLowerCase();
      resultado = resultado.filter(p => p.nome.toLowerCase().includes(termo));
    }

    // Ordenar por Health Score (maior para menor)
    resultado.sort((a, b) => b.health_score - a.health_score);

    return resultado;
  }, [professores, filtroStatus, filtroBusca]);

  // Calcular alertas
  const alertas = useMemo<AlertaPerformance[]>(() => {
    const criticos = professores.filter(p => p.status === 'critico');
    const atencao = professores.filter(p => p.status === 'atencao');
    const excelentes = professores.filter(p => p.status === 'excelente');

    return [
      { tipo: 'critico', quantidade: criticos.length, descricao: 'Retencao ou media critica' },
      { tipo: 'atencao', quantidade: atencao.length, descricao: 'Metricas abaixo da meta' },
      { tipo: 'excelente', quantidade: excelentes.length, descricao: 'Health Score saudavel' }
    ];
  }, [professores]);

  // Rankings
  const rankings = useMemo(() => {
    const comCarteira = professores.filter(p => p.total_alunos > 0);
    const comTurmas = professores.filter(p => p.total_turmas > 0);

    return {
      topRetencao: [...comCarteira].sort((a, b) => b.taxa_retencao - a.taxa_retencao)[0],
      topMediaTurma: [...comTurmas].sort((a, b) => b.media_alunos_turma - a.media_alunos_turma)[0]
    };
  }, [professores]);

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
      professores_criticos: professores.filter(p => p.status === 'critico').length,
      professores_atencao: professores.filter(p => p.status === 'atencao').length,
      professores_excelentes: professores.filter(p => p.status === 'excelente').length
    };
  }, [professores]);

  // Health Score médio da equipe
  const conversaoEquipe = useMemo(() => {
    const realizadas = professores.reduce((acc, p) => acc + p.experimentais, 0);
    const matriculas = professores.reduce((acc, p) => acc + p.matriculas_pos_exp, 0);
    const taxa = realizadas > 0 ? (matriculas / realizadas) * 100 : 0;
    return {
      realizadas,
      matriculas,
      taxa: Math.round(taxa * 10) / 10,
    };
  }, [professores]);

  const healthScoreEquipe = useMemo(() => {
    if (professores.length === 0) return { media: 0, status: 'atencao' as const };
    const soma = professores.reduce((acc, p) => acc + p.health_score, 0);
    const media = soma / professores.length;
    const status = media >= 70 ? 'saudavel' : media >= 40 ? 'atencao' : 'critico';
    return { media: Math.round(media * 10) / 10, status };
  }, [professores]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
          <p className="text-white font-semibold text-xl">{conversaoEquipe.taxa.toFixed(1)}%</p>
          <p className="text-emerald-300 text-xs">{conversaoEquipe.matriculas}/{conversaoEquipe.realizadas} confirmadas</p>
        </div>

        {/* Top Retenção */}
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 h-[115px] flex flex-col justify-center">
          <p className="text-xs text-slate-400 mb-1">🏆 Top Retenção</p>
          {rankings.topRetencao ? (
            <>
              <p className="text-white font-semibold text-sm truncate">{rankings.topRetencao.nome}</p>
              <p className="text-green-400 text-sm">{rankings.topRetencao.taxa_retencao.toFixed(1)}% retenção</p>
            </>
          ) : (
            <p className="text-slate-500 text-sm">-</p>
          )}
        </div>

        {/* HEALTH SCORE COM GAUGE - DESTAQUE NO CENTRO */}
        <div className={`bg-slate-900 rounded-2xl p-4 border-2 ${
          healthScoreEquipe.status === 'saudavel' 
            ? 'border-violet-500/50' 
            : healthScoreEquipe.status === 'atencao'
            ? 'border-amber-500/50'
            : 'border-rose-500/50'
        } shadow-lg row-span-1`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                healthScoreEquipe.status === 'saudavel' 
                  ? 'bg-violet-500/20' 
                  : healthScoreEquipe.status === 'atencao'
                  ? 'bg-amber-500/20'
                  : 'bg-rose-500/20'
              }`}>
                <Heart className={`w-4 h-4 ${
                  healthScoreEquipe.status === 'saudavel' 
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
              <path d="M 15 90 A 75 75 0 0 1 165 90" fill="none" stroke="url(#healthGaugeGradient)" strokeWidth="16" strokeLinecap="round"/>
              {/* Ponteiro */}
              <g style={{
                transform: `rotate(${(healthScoreEquipe.media / 100) * 180 - 90}deg)`,
                transformOrigin: '90px 90px',
                transition: 'transform 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)'
              }}>
                <path d="M 87 90 L 90 30 L 93 90 Z" fill="#94a3b8"/>
                <circle cx="90" cy="90" r="5" fill="#94a3b8"/>
                <circle cx="90" cy="90" r="2" fill="white"/>
              </g>
            </svg>
            <div className="mt-[-12px] text-center z-10">
              <span className={`text-2xl font-black tracking-tighter ${
                healthScoreEquipe.status === 'saudavel' 
                  ? 'text-violet-400' 
                  : healthScoreEquipe.status === 'atencao'
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}>
                {healthScoreEquipe.media}
              </span>
              <p className="text-[8px] font-semibold text-slate-500 uppercase tracking-widest">
                Média Geral
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
              <p className="text-green-400 text-sm">{rankings.topMediaTurma.media_alunos_turma.toFixed(1)} alunos/turma</p>
            </>
          ) : (
            <p className="text-slate-500 text-sm">-</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
        Conversao de professores usando fonte canonica Emusys + vinculo LA Report.
        Matriculas pos-exp contam matriculas/cursos gerados por experimentais confirmadas; no Health Score a contribuicao e limitada a 100.
      </div>

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
                value={getTrimestreCodigo(mes)}
                onValueChange={(v) => competenciaFiltro.setMes(TRIMESTRE_MES_REPRESENTATIVO[v as 'T1' | 'T2' | 'T3' | 'NC'])}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Trimestre" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="T1">T1 (Mar / Abr / Mai)</SelectItem>
                  <SelectItem value="T2">T2 (Jun / Jul / Ago)</SelectItem>
                  <SelectItem value="T3">T3 (Set / Out / Nov)</SelectItem>
                  <SelectItem value="NC">Não Considerado (Dez / Jan / Fev)</SelectItem>
                </SelectContent>
              </Select>
            )}

            {/* Toggle Mensal / Trimestral */}
            <Tooltip
              side="top"
              content={
                <div className="text-xs max-w-[260px]">
                  <p className="font-bold text-slate-200 mb-1">Visão Trimestral</p>
                  <p className="text-slate-400 mb-1.5">
                    Agrega 3 meses em trimestres operacionais para diluir distorções estatísticas em professores com poucas experimentais.
                  </p>
                  <ul className="text-slate-400 text-[11px] space-y-0.5">
                    <li><span className="text-violet-400 font-medium">T1:</span> Mar / Abr / Mai</li>
                    <li><span className="text-violet-400 font-medium">T2:</span> Jun / Jul / Ago</li>
                    <li><span className="text-violet-400 font-medium">T3:</span> Set / Out / Nov</li>
                    <li><span className="text-slate-500 font-medium">Não Considerado:</span> Dez / Jan / Fev</li>
                  </ul>
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
                  Trimestral
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
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">
                  <div className="flex items-center justify-center gap-1">
                    <TrendingUp className="w-3 h-3 text-amber-400" />
                    <span>Fator</span>
                  </div>
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Alunos</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Média/Turma</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Retenção</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Exp → Mat</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Presença</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Evasões</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Status</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {professoresFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-400">
                    Nenhum professor encontrado
                  </td>
                </tr>
              ) : (
                professoresFiltrados.map((professor) => (
                  <tr
                    key={professor.id}
                    className={`hover:bg-slate-700/30 transition-colors cursor-pointer ${
                      professor.status === 'critico' ? 'bg-red-500/5' : ''
                    }`}
                    onClick={() => setModalDetalhes({ open: true, professor })}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getGradientByStatus(professor.status)} flex items-center justify-center text-white font-bold text-sm`}>
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
                      <Tooltip
                        side="top"
                        content={
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
                        }
                      >
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border cursor-help ${
                          professor.health_status === 'saudavel'
                            ? 'bg-emerald-900/30 border-emerald-700 text-emerald-400'
                            : professor.health_status === 'atencao'
                            ? 'bg-amber-900/30 border-amber-700 text-amber-400'
                            : 'bg-rose-900/30 border-rose-700 text-rose-400'
                        }`}>
                          <span className="text-sm font-black">{Math.round(professor.health_score)}</span>
                        </div>
                      </Tooltip>
                    </td>
                    {/* Fator de Demanda Ponderado */}
                    <td className="text-center px-4 py-3">
                      <span className={`px-2 py-1 rounded-lg text-sm font-medium ${
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
                    </td>
                    <td className="text-center px-4 py-3 text-white">{professor.total_alunos}</td>
                    <td className="text-center px-4 py-3">
                      <Tooltip side="top" content={professor.total_turmas > 0
                        ? `${professor.alunos_via_turmas} alunos na carteira ÷ ${professor.total_turmas} turmas = ${professor.media_alunos_turma.toFixed(2)} alunos/turma · Clique para detalhes`
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
                    </td>
                    <td className="text-center px-4 py-3">
                      <Tooltip
                        side="top"
                        content={
                          <div className="text-xs min-w-[200px]">
                            <p className="font-bold text-slate-200 mb-1.5">Cálculo da Retenção</p>
                            <div className="space-y-1">
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-400">Carteira de alunos</span>
                                <span className="text-white font-medium">{professor.total_alunos}</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-400">Evasões no mês</span>
                                <span className="text-red-400 font-medium">{professor.evasoes_mes}</span>
                              </div>
                              <div className="flex justify-between gap-4 border-t border-slate-600 pt-1 mt-1">
                                <span className="text-slate-400">Taxa cancelamento</span>
                                <span className="text-white font-medium">
                                  {professor.total_alunos > 0 ? ((professor.evasoes_mes / professor.total_alunos) * 100).toFixed(1) : '0'}%
                                </span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-300 font-semibold">Retenção (100 - canc.)</span>
                                <span className="text-white font-bold">{professor.taxa_retencao.toFixed(1)}%</span>
                              </div>
                            </div>
                          </div>
                        }
                      >
                        <span
                          className={`font-medium cursor-pointer hover:underline ${getMetricaColor(professor.taxa_retencao, { critico: 70, atencao: 95 })}`}
                          onClick={(e) => { e.stopPropagation(); setModalRetencao({ open: true, professorId: professor.id, professorNome: professor.nome, taxaRetencao: professor.taxa_retencao, totalAlunos: professor.total_alunos, evasoesMes: professor.evasoes_mes }); }}
                        >
                          {professor.taxa_retencao.toFixed(0)}%
                        </span>
                      </Tooltip>
                    </td>
                    <td className="text-center px-4 py-3">
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
                    </td>
                    <td className="text-center px-4 py-3">
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
                    </td>
                    <td className="text-center px-4 py-3">
                      <Tooltip
                        side="top"
                        content={
                          <div className="text-xs min-w-[200px]">
                            <p className="font-bold text-slate-200 mb-1.5">Evasões no Mês</p>
                            <div className="space-y-1">
                              <div className="flex justify-between gap-4">
                                <span className="text-red-400">Cancelamentos</span>
                                <span className="text-white font-medium">{professor.evasoes_mes}</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-amber-400">Não renovações</span>
                                <span className="text-white font-medium">{professor.nao_renovacoes_mes}</span>
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
                          className={`font-medium cursor-pointer hover:underline ${getMetricaColor(professor.evasoes_mes, { critico: 1, atencao: 3 }, true)}`}
                          onClick={(e) => { e.stopPropagation(); setModalEvasoes({ open: true, professorId: professor.id, professorNome: professor.nome }); }}
                        >
                          {professor.evasoes_mes}
                        </span>
                      </Tooltip>
                    </td>
                    <td className="text-center px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(professor.status)}`}>
                        {professor.status === 'critico' ? 'Crítico' : professor.status === 'atencao' ? 'Atenção' : 'Excelente'}
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
          Mostrando {professoresFiltrados.length} de {professores.length} professores
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
            <p className="text-red-400">🔴 &lt;70% Crítico</p>
            <p className="text-yellow-400">🟡 70-80% Atenção</p>
            <p className="text-green-400">🟢 &gt;80% Ideal</p>
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
            media_alunos_turma: p.media_alunos_turma,
            taxa_retencao: p.taxa_retencao,
            taxa_conversao: p.taxa_conversao,
            nps: p.nps,
            taxa_presenca: p.taxa_presenca,
            evasoes_mes: p.evasoes_mes,
            status: p.status,
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
      />

      <ModalDetalhesPresenca
        open={modalPresenca.open}
        onClose={() => setModalPresenca({ open: false, professorId: null, professorNome: '' })}
        professorId={modalPresenca.professorId}
        professorNome={modalPresenca.professorNome}
        ano={parseInt(competencia.split('-')[0])}
        mes={parseInt(competencia.split('-')[1])}
        unidadeId={unidadeAtual}
        dataInicio={modoVisualizacao === 'trimestre' ? trimestreInfo.dataInicio : undefined}
        dataFim={modoVisualizacao === 'trimestre' ? trimestreInfo.dataFim : undefined}
        periodoLabel={modoVisualizacao === 'trimestre' ? trimestreInfo.label : undefined}
      />

      <ModalDetalhesEvasoes
        open={modalEvasoes.open}
        onClose={() => setModalEvasoes({ open: false, professorId: null, professorNome: '' })}
        professorId={modalEvasoes.professorId}
        professorNome={modalEvasoes.professorNome}
        ano={parseInt(competencia.split('-')[0])}
        mes={parseInt(competencia.split('-')[1])}
        unidadeId={unidadeAtual}
        dataInicio={modoVisualizacao === 'trimestre' ? trimestreInfo.dataInicio : undefined}
        dataFim={modoVisualizacao === 'trimestre' ? trimestreInfo.dataFim : undefined}
        periodoLabel={modoVisualizacao === 'trimestre' ? trimestreInfo.label : undefined}
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
        dataInicio={modoVisualizacao === 'trimestre' ? trimestreInfo.dataInicio : undefined}
        dataFim={modoVisualizacao === 'trimestre' ? trimestreInfo.dataFim : undefined}
        periodoLabel={modoVisualizacao === 'trimestre' ? trimestreInfo.label : undefined}
      />

      <ModalDetalhesConversao
        open={modalConversao.open}
        onClose={() => setModalConversao({ open: false, professorId: null, professorNome: '' })}
        professorId={modalConversao.professorId}
        professorNome={modalConversao.professorNome}
        ano={parseInt(competencia.split('-')[0])}
        mes={parseInt(competencia.split('-')[1])}
        unidadeId={unidadeAtual}
        dataInicio={modoVisualizacao === 'trimestre' ? trimestreInfo.dataInicio : undefined}
        dataFim={modoVisualizacao === 'trimestre' ? trimestreInfo.dataFim : undefined}
        periodoLabel={modoVisualizacao === 'trimestre' ? trimestreInfo.label : undefined}
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
          ? trimestreInfo.dataInicio
          : `${ano}-${String(mes).padStart(2, '0')}-01`}
        dataFim={modoVisualizacao === 'trimestre'
          ? trimestreInfo.dataFim
          : `${ano}-${String(mes).padStart(2, '0')}-${String(new Date(ano, mes, 0).getDate()).padStart(2, '0')}`}
        periodoLabel={periodoLabel}
      />

      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
    </div>
  );
}
