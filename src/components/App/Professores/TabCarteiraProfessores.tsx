import { Fragment, useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import {
  Users, Wallet, TrendingUp, GraduationCap, Baby, School,
  ChevronDown, ChevronRight, Search, ArrowUpDown, Eye,
  Loader2, Calendar, Clock, AlertTriangle, Heart, Lock
} from 'lucide-react';
import { KPICard } from '@/components/ui/KPICard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ModalCarteiraProfessor } from './ModalCarteiraProfessor';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  buscarKpisProfessoresCanonicos,
  consolidarKpisProfessoresCanonicos,
} from '@/lib/professoresKpisCanonicos';
import {
  buscarKpisTurmasCanonicos,
  indexarKpisTurmasCanonicos,
} from '@/lib/turmasKpisCanonicos';
import type { CompetenciaRange } from '@/hooks/useCompetenciaFiltro';
import {
  chaveProfessorUnidade,
  filtrarKpisPorVinculosAtivos,
} from '@/lib/professoresKpisAgregados';
import {
  formatHealthScoreV3Coverage,
  resolveHealthScoreV3MetricDisplay,
} from '@/lib/healthScoreProfessorV3Performance';
import { fetchHealthScoreProfessorV3Performance } from '@/hooks/useHealthScoreProfessorV3Performance';
import {
  buscarCarteiraProfessorDetalheCanonica,
  type AlunoCarteiraCanonico,
} from '@/lib/carteiraProfessorDetalheCanonica';
import { montarCarteirasFallbackContratual } from '@/lib/carteiraFallbackContratual.mjs';
import {
  consultarOpcional,
  consultarSupabaseOpcional,
} from '@/lib/professoresConsultasOpcionais.mjs';

// Interface para carteira do professor
interface CarteiraProfessor {
  id: number;
  nome: string;
  foto_url: string | null;
  total_alunos: number;
  alunos_lamk: number;
  alunos_emla: number;
  // MRR e ticket seguem tipos_matricula.entra_ticket_medio (regra canonica):
  // banda, bolsista integral e bolsista parcial ficam de fora dos dois.
  mrr_total: number;
  ticket_medio: number;
  // Denominador do ticket. Necessario para agregar: media de medias nao e media,
  // e o headcount inclui quem nao entra no ticket.
  alunos_ticket: number;
  tempo_medio_meses: number;
  total_turmas: number;
  media_alunos_turma: number | null;
  cursos: string[];
  unidades: string[];
  health_score: number | null;
  health_status: 'critico' | 'atencao' | 'saudavel' | null;
  health_score_exibivel: boolean;
  health_score_estado_publicacao: 'parcial' | 'oficial' | 'sem_base' | 'indisponivel';
  health_score_cobertura: number | null;
  health_score_motivo: string | null;
  // Trancados sao exibidos a parte: nunca somam em total_alunos, mrr, ticket ou media/turma.
  total_trancados: number | null;
}

interface Props {
  unidadeAtual: UnidadeId;
  competencia: { range: CompetenciaRange };
  onPeriodoChange?: (label: string | null) => void;
}

type OrdenacaoTipo = 'alunos' | 'mrr' | 'ticket' | 'media_turma';
type OrdenacaoDirecao = 'asc' | 'desc';

export function TabCarteiraProfessores({ unidadeAtual, competencia, onPeriodoChange }: Props) {
  const [carteiras, setCarteiras] = useState<CarteiraProfessor[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [avisoEnriquecimento, setAvisoEnriquecimento] = useState<string | null>(null);
  const [filtroBusca, setFiltroBusca] = useState('');
  const [filtroCurso, setFiltroCurso] = useState('todos');
  const [cursos, setCursos] = useState<{ id: number; nome: string }[]>([]);
  
  // Ordenação
  const [ordenacao, setOrdenacao] = useState<OrdenacaoTipo>('alunos');
  const [direcao, setDirecao] = useState<OrdenacaoDirecao>('desc');
  
  // Accordion expandido
  const [expandido, setExpandido] = useState<number | null>(null);
  const [alunosExpandido, setAlunosExpandido] = useState<AlunoCarteiraCanonico[]>([]);
  const [loadingAlunos, setLoadingAlunos] = useState(false);
  
  // Modal de detalhes
  const [modalDetalhes, setModalDetalhes] = useState<{ open: boolean; professor: CarteiraProfessor | null }>({
    open: false,
    professor: null
  });
  const requisicaoAtivaRef = useRef(0);

  // A carga operacional continua viva, mas a Media/Turma respeita a competencia
  // selecionada para permanecer comparavel com Alunos, Dashboard e Analytics.
  useEffect(() => {
    onPeriodoChange?.(competencia.range.label);
    return () => { onPeriodoChange?.(null); };
  }, [competencia.range.label, onPeriodoChange]);

  useEffect(() => {
    carregarDados();
  }, [
    unidadeAtual,
    competencia.range.startDate,
    competencia.range.endDate,
  ]);

  const carregarDados = async () => {
    const requisicaoId = ++requisicaoAtivaRef.current;
    let linhasContratuaisFallback: any[] = [];
    let trancadosFallback = new Map<number, number>();
    let trancadosFallbackDisponiveis = false;
    setLoading(true);
    setErro(null);
    setAvisoEnriquecimento(null);
    try {
      // Buscar cursos para filtro
      const { data: cursosData } = await supabase
        .from('cursos')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome');
      setCursos(cursosData || []);

      // Buscar carteira agregada via RPC (evita truncamento de 1000 linhas e RLS bypass da vw_turmas_implicitas)
      // PostgREST resolve a sobrecarga pelo nome do argumento. No Consolidado,
      // enviar explicitamente null preserva a assinatura (em vez de procurar
      // uma inexistente variante sem parâmetros).
      const rpcParams = { p_unidade_id: unidadeAtual !== 'todos' ? unidadeAtual : null };
      const ano = competencia.range.ano;
      const mes = competencia.range.mesInicio;
      const competenciaHealth = `${ano}-${String(mes).padStart(2, '0')}-01`;
      const filtroPeriodo = {
        ano,
        mes,
        unidadeId: unidadeAtual,
        dataInicio: competencia.range.startDate,
        dataFim: competencia.range.endDate,
      };
      // A carteira contratual é o caminho mínimo para manter a tela útil.
      // Iniciamos todos os carregamentos juntos, mas confirmamos e guardamos
      // seu resultado antes de aguardar enriquecimentos que podem expirar.
      const carteiraPromise = supabase.rpc('get_carteira_professores', rpcParams);
      const complementaresPromise = Promise.all([
        // KPI de período é enriquecimento: se expirar, a carteira contratual
        // continua disponível e a indisponibilidade fica explícita na tela.
        consultarOpcional(buscarKpisProfessoresCanonicos(filtroPeriodo)),
        consultarOpcional(buscarKpisTurmasCanonicos(filtroPeriodo)),
        consultarSupabaseOpcional(supabase
          .from('professores')
          .select('id, nome, foto_url')
          .eq('ativo', true)),
        consultarSupabaseOpcional(supabase
          .from('professores_unidades')
          .select('professor_id, unidade_id')
          .eq('emusys_ativo', true)
          .neq('validacao_status', 'ignorado')),
        consultarSupabaseOpcional(supabase
          .from('unidades')
          .select('id, nome')),
        consultarSupabaseOpcional(supabase
          .from('professores_cursos')
          .select('professor_id, cursos:curso_id (nome)')),
        // Contagem de alunos trancados por professor - exibicao a parte, nunca soma na contagem de ativos.
        consultarSupabaseOpcional(supabase.rpc('get_contagem_trancados_professores', rpcParams)),
      ]);
      const carteiraResult = await carteiraPromise;
      if (carteiraResult.error) throw carteiraResult.error;
      linhasContratuaisFallback = carteiraResult.data || [];
      // A carteira contratual é suficiente para a operação. Publica-a antes
      // dos enriquecimentos de competência, que podem expirar de forma
      // independente e jamais devem deixar a aba vazia.
      const carteirasContratuaisIniciais = montarCarteirasFallbackContratual({
        linhasContratuais: linhasContratuaisFallback,
        trancadosDisponiveis: false,
        mediaTurmaDisponivel: false,
      }) as CarteiraProfessor[];
      if (requisicaoId !== requisicaoAtivaRef.current) return;
      setCarteiras(carteirasContratuaisIniciais.filter((carteira) => carteira.total_alunos > 0));
      setAvisoEnriquecimento('A carteira contratual está disponível. Carregando indicadores complementares da competência.');
      setLoading(false);
      const [
        kpisResultado,
        kpisTurmasResultado,
        professoresResult,
        vinculosResult,
        unidadesResult,
        cursosRelResult,
        trancadosResult,
      ] = await complementaresPromise;
      // Nenhum enriquecimento pode apagar a carteira contratual já renderizada.
      // Quando uma dessas consultas falha, usamos os dados disponíveis na RPC
      // contratual e marcamos a indisponibilidade abaixo.
      const trancadosDisponiveis = !trancadosResult.error;

      const trancadosPorProfessor = new Map<number, number>(
        trancadosDisponiveis
          ? (trancadosResult.data || []).map((row: any) => [Number(row.professor_id), Number(row.total_trancados)])
          : [],
      );
      trancadosFallback = trancadosPorProfessor;
      trancadosFallbackDisponiveis = trancadosDisponiveis;

      const professoresAtivos = new Set(
        (professoresResult.data || []).map((professor) => Number(professor.id)),
      );
      const vinculosAtivos = new Set(
        (vinculosResult.data || [])
          .map((vinculo) => chaveProfessorUnidade(
            Number(vinculo.professor_id),
            vinculo.unidade_id ? String(vinculo.unidade_id) : null,
          ))
          .filter((chave): chave is string => chave !== null),
      );
      const kpisCanonicosDisponiveis = !kpisResultado.error;
      const kpisTurmasDisponiveis = !kpisTurmasResultado.error;
      const kpisData = kpisCanonicosDisponiveis
        ? consolidarKpisProfessoresCanonicos(
          filtrarKpisPorVinculosAtivos(kpisResultado.data, professoresAtivos, vinculosAtivos),
        )
        : [];
      const kpisTurmasPorProfessor = kpisTurmasDisponiveis
        ? indexarKpisTurmasCanonicos(kpisTurmasResultado.data)
        : new Map();
      const carteirasFinanceirasPorProfessor = new Map<number, any>(
        (carteiraResult.data || []).map((row: any) => [Number(row.professor_id), row]),
      );
      const professoresPorId = new Map(
        (professoresResult.data || []).map((professor) => [Number(professor.id), professor]),
      );
      const unidadesPorId = new Map(
        (unidadesResult.data || []).map((unidade) => [String(unidade.id), unidade.nome]),
      );
      const unidadesPorProfessor = new Map<number, string[]>();
      (vinculosResult.data || [])
        .filter((vinculo) => unidadeAtual === 'todos' || String(vinculo.unidade_id) === unidadeAtual)
        .forEach((vinculo) => {
          const professorId = Number(vinculo.professor_id);
          const unidadeNome = unidadesPorId.get(String(vinculo.unidade_id));
          if (!unidadeNome) return;
          const nomes = unidadesPorProfessor.get(professorId) || [];
          if (!nomes.includes(unidadeNome)) nomes.push(unidadeNome);
          unidadesPorProfessor.set(professorId, nomes);
        });
      const cursosPorProfessor = new Map<number, string[]>();
      (cursosRelResult.data || []).forEach((vinculo: any) => {
        const professorId = Number(vinculo.professor_id);
        const cursoRelacionado = Array.isArray(vinculo.cursos) ? vinculo.cursos[0] : vinculo.cursos;
        const cursoNome = cursoRelacionado?.nome ? String(cursoRelacionado.nome) : null;
        if (!cursoNome) return;
        const nomes = cursosPorProfessor.get(professorId) || [];
        if (!nomes.includes(cursoNome)) nomes.push(cursoNome);
        cursosPorProfessor.set(professorId, nomes);
      });

      // A populacao nasce da carteira canonica quando ela respondeu. Se ela
      // estiver indisponível, a RPC contratual é uma fonte válida de fallback:
      // mostramos o que chegou e jamais substituímos a falha por "sem base".
      const carteirasCalculadas: CarteiraProfessor[] = kpisCanonicosDisponiveis ? kpisData.map((kpis) => {
        const professorId = Number(kpis.professor_id);
        const row = carteirasFinanceirasPorProfessor.get(professorId);
        const professor = professoresPorId.get(professorId);
        const totalAlunos = Number(kpis.carteira_alunos ?? 0);
        const chaveTurma = `${professorId}_${unidadeAtual === 'todos' ? 'todos' : unidadeAtual}`;
        const kpiTurma = kpisTurmasPorProfessor.get(chaveTurma);
        const mediaAlunosTurma = kpiTurma ? Number(kpiTurma.media_alunos_turma) : null;
        const mrrTotal = Number(row?.mrr_total ?? 0);

        return {
          id: professorId,
          nome: professor?.nome ?? row?.professor_nome ?? kpis.professor_nome,
          foto_url: professor?.foto_url ?? row?.foto_url ?? null,
          total_alunos: totalAlunos,
          alunos_lamk: Number(row?.alunos_lamk ?? 0),
          alunos_emla: Number(row?.alunos_emla ?? 0),
          mrr_total: mrrTotal,
          // O ticket vem pronto da RPC, que aplica tipos_matricula.entra_ticket_medio.
          // Nao recalcular aqui: dividir o MRR pelo headcount jogava banda e bolsistas
          // no denominador sem estarem no numerador, diluindo o ticket de 24 professores.
          ticket_medio: Number(row?.ticket_medio ?? 0),
          alunos_ticket: Number(row?.alunos_ticket ?? 0),
          tempo_medio_meses: Number(row?.tempo_medio_meses ?? 0),
          total_turmas: Number(kpis.total_turmas ?? row?.total_turmas ?? 0),
          media_alunos_turma: mediaAlunosTurma,
          cursos: row?.cursos?.length ? row.cursos : (cursosPorProfessor.get(professorId) || []),
          unidades: unidadesPorProfessor.get(professorId) || row?.unidades || [],
          health_score: null,
          health_status: null,
          health_score_exibivel: false,
          health_score_estado_publicacao: 'indisponivel',
          health_score_cobertura: null,
          health_score_motivo: 'Carregando Health Score V3',
          total_trancados: trancadosDisponiveis ? (trancadosPorProfessor.get(professorId) ?? 0) : null,
        };
      }) : montarCarteirasFallbackContratual({
        linhasContratuais: carteiraResult.data || [],
        trancadosPorProfessor,
        trancadosDisponiveis,
        mediaTurmaDisponivel: false,
      });

      // A Carteira canônica é utilizável imediatamente. O enriquecimento de
      // Health Score V3 é complementar e não bloqueia a página se expirar.
      const carteirasComAlunos = carteirasCalculadas.filter(c => c.total_alunos > 0);
      if (requisicaoId !== requisicaoAtivaRef.current) return;
      setCarteiras(carteirasComAlunos);
      const indisponibilidades = [
        !kpisCanonicosDisponiveis ? 'KPIs de período' : null,
        !kpisTurmasDisponiveis ? 'Média/Turma da competência' : null,
        professoresResult.error ? 'cadastro de professores' : null,
        vinculosResult.error ? 'vínculos de unidades' : null,
        unidadesResult.error ? 'unidades' : null,
        cursosRelResult.error ? 'cursos' : null,
        !trancadosDisponiveis ? 'contagem de trancados' : null,
      ].filter((item): item is string => Boolean(item));
      setAvisoEnriquecimento(indisponibilidades.length > 0
        ? `A carteira contratual está disponível. Indisponível agora: ${indisponibilidades.join(', ')}. Tente novamente em instantes.`
        : null);
      setLoading(false);

      void fetchHealthScoreProfessorV3Performance({
        competencia: competenciaHealth,
        unidadeId: unidadeAtual === 'todos' ? null : unidadeAtual,
        periodicidade: 'mensal',
      }).then((snapshots) => {
        if (requisicaoId !== requisicaoAtivaRef.current) return;
        const healthV3PorProfessor = new Map(
          snapshots
            .map((snapshot) => [snapshot.professorId, snapshot]),
        );
        setCarteiras((atuais) => atuais.map((carteira) => {
          const snapshot = healthV3PorProfessor.get(carteira.id);
          const healthScoreExibivel = Boolean(snapshot?.scoreExibivel && snapshot.score !== null);
          const healthStatus = snapshot?.classificacao === 'critico'
            || snapshot?.classificacao === 'atencao'
            || snapshot?.classificacao === 'saudavel'
            ? snapshot.classificacao
            : null;
          const permanencia = snapshot
            ? resolveHealthScoreV3MetricDisplay(snapshot, 'permanencia').value
            : null;
          return {
            ...carteira,
            tempo_medio_meses: Number(permanencia ?? carteira.tempo_medio_meses),
            health_score: healthScoreExibivel ? snapshot!.score : null,
            health_status: healthStatus,
            health_score_exibivel: healthScoreExibivel,
            health_score_estado_publicacao: snapshot?.estadoPublicacao || 'sem_base',
            health_score_cobertura: snapshot?.cobertura ?? null,
            health_score_motivo: snapshot?.motivoBloqueio || null,
          };
        }));
      }).catch((error) => {
        console.warn('Health Score V3 indisponível na Carteira', error);
      });
    } catch (error) {
      console.error('Erro ao carregar carteiras:', error);
      const fallback = montarCarteirasFallbackContratual({
        linhasContratuais: linhasContratuaisFallback,
        trancadosPorProfessor: trancadosFallback,
        trancadosDisponiveis: trancadosFallbackDisponiveis,
        mediaTurmaDisponivel: false,
      }) as CarteiraProfessor[];
      if (fallback.length > 0) {
        if (requisicaoId !== requisicaoAtivaRef.current) return;
        setCarteiras(fallback);
        setErro(null);
        setAvisoEnriquecimento('A carteira contratual está disponível. Os dados complementares de período estão indisponíveis agora; tente novamente em instantes.');
      } else {
        setCarteiras([]);
        setErro(error instanceof Error ? error.message : 'Falha ao carregar a carteira dos professores.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Carregar alunos quando expandir accordion
  const carregarAlunosProfessor = async (professorId: number) => {
    setLoadingAlunos(true);
    try {
      const detalhe = await buscarCarteiraProfessorDetalheCanonica({
        professorId,
        unidadeId: unidadeAtual,
      });

      setAlunosExpandido([...detalhe.alunos, ...detalhe.alunosTrancados]);
    } catch (error) {
      console.error('Erro ao carregar alunos:', error);
      setAlunosExpandido([]);
    } finally {
      setLoadingAlunos(false);
    }
  };

  // Toggle accordion
  const toggleExpansao = (professorId: number) => {
    if (expandido === professorId) {
      setExpandido(null);
      setAlunosExpandido([]);
    } else {
      setExpandido(professorId);
      carregarAlunosProfessor(professorId);
    }
  };

  // Filtrar e ordenar
  const carteirasFiltradas = useMemo(() => {
    let resultado = [...carteiras];

    // Filtro por busca
    if (filtroBusca) {
      const termo = filtroBusca.toLowerCase();
      resultado = resultado.filter(c => c.nome.toLowerCase().includes(termo));
    }

    // Filtro por curso
    if (filtroCurso !== 'todos') {
      resultado = resultado.filter(c => c.cursos.includes(filtroCurso));
    }

    // Ordenação
    resultado.sort((a, b) => {
      let valorA = 0, valorB = 0;
      switch (ordenacao) {
        case 'alunos': valorA = a.total_alunos; valorB = b.total_alunos; break;
        case 'mrr': valorA = a.mrr_total; valorB = b.mrr_total; break;
        case 'ticket': valorA = a.ticket_medio; valorB = b.ticket_medio; break;
        case 'media_turma': {
          if (a.media_alunos_turma === null && b.media_alunos_turma === null) return 0;
          if (a.media_alunos_turma === null) return 1;
          if (b.media_alunos_turma === null) return -1;
          valorA = a.media_alunos_turma;
          valorB = b.media_alunos_turma;
          break;
        }
      }
      return direcao === 'desc' ? valorB - valorA : valorA - valorB;
    });

    return resultado;
  }, [carteiras, filtroBusca, filtroCurso, ordenacao, direcao]);

  // KPIs consolidados da carteira operacional.
  // P0.1: nao derivar "alunos pagantes" por MRR/ticket nesta tela.
  // Carteira de professor e operacional e pode divergir dos KPIs executivos fechados.
  const kpis = useMemo(() => {
    const dados = carteirasFiltradas;
    const totalProfs = dados.length;
    const totalAlunos = dados.reduce((acc, c) => acc + c.total_alunos, 0);
    const mrrTotal = dados.reduce((acc, c) => acc + c.mrr_total, 0);
    // Ticket agregado divide o MRR pela base do ticket, nao pelo headcount: banda e
    // bolsistas contam como alunos do professor mas nao entram no ticket. Tambem nao
    // da para tirar media das medias por professor.
    const baseTicket = dados.reduce((acc, c) => acc + c.alunos_ticket, 0);
    const ticketMedio = baseTicket > 0 ? mrrTotal / baseTicket : 0;
    const mediaAlunos = totalProfs > 0 ? totalAlunos / totalProfs : 0;

    return { totalProfs, totalAlunos, mrrTotal, ticketMedio, mediaAlunos };
  }, [carteirasFiltradas]);

  // Cor do indicador de média/turma
  const getCorMediaTurma = (media: number | null) => {
    if (media === null) return 'text-slate-400';
    if (media >= 1.8) return 'text-green-400';
    if (media >= 1.5) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getIndicadorMediaTurma = (media: number | null) => {
    if (media === null) return '-';
    if (media >= 1.8) return '🟢';
    if (media >= 1.5) return '🟡';
    return '🔴';
  };

  // Iniciais do nome
  const getIniciais = (nome: string) => {
    return nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  };

  // Verificar contrato próximo do vencimento
  const contratoProximoVencer = (dataFim: string | null) => {
    if (!dataFim) return false;
    const hoje = new Date();
    const fim = new Date(dataFim);
    const diasRestantes = Math.ceil((fim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    return diasRestantes <= 30 && diasRestantes >= 0;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (erro) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
        {erro}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="inline-flex items-center gap-2 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300">
        <Users className="h-3.5 w-3.5" />
        Media/Turma canonica de {competencia.range.label}; carteira detalhada operacional
      </div>

      {avisoEnriquecimento && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {avisoEnriquecimento}
        </div>
      )}

      {/* KPIs Consolidados */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard
          icon={Users}
          label="Professores"
          value={kpis.totalProfs}
          subvalue="com alunos ativos"
          variant="violet"
        />
        <KPICard
          icon={GraduationCap}
          label="Vínculos em Carteira"
          value={kpis.totalAlunos}
          subvalue="professor-aluno canônicos"
          variant="emerald"
        />
        <KPICard
          icon={Wallet}
          label="MRR Total"
          value={kpis.mrrTotal}
          format="currency"
          subvalue="receita mensal"
          variant="cyan"
        />
        <KPICard
          icon={TrendingUp}
          label="Ticket Carteira"
          value={kpis.ticketMedio}
          format="currency"
          subvalue="MRR / carteira"
          variant="amber"
        />
        <KPICard
          icon={Users}
          label="Média/Professor"
          value={kpis.mediaAlunos.toFixed(1)}
          subvalue="alunos por prof"
          variant="rose"
        />
      </div>

      {/* Filtros e Ordenação */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        <div className="flex flex-wrap items-center gap-4">
          {/* Busca */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar professor..."
              value={filtroBusca}
              onChange={(e) => setFiltroBusca(e.target.value)}
              className="pl-10 bg-slate-900/50 border-slate-700"
            />
          </div>

          {/* Filtro por Curso */}
          <Select value={filtroCurso} onValueChange={setFiltroCurso}>
            <SelectTrigger className="w-[180px] bg-slate-900/50 border-slate-700">
              <SelectValue placeholder="Todos os cursos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os cursos</SelectItem>
              {cursos.map(c => (
                <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Ordenação */}
          <Select value={ordenacao} onValueChange={(v) => setOrdenacao(v as OrdenacaoTipo)}>
            <SelectTrigger className="w-[160px] bg-slate-900/50 border-slate-700">
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alunos">Total Alunos</SelectItem>
              <SelectItem value="mrr">MRR</SelectItem>
              <SelectItem value="ticket">Ticket Médio</SelectItem>
              <SelectItem value="media_turma">Média/Turma</SelectItem>
            </SelectContent>
          </Select>

          {/* Direção */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDirecao(d => d === 'desc' ? 'asc' : 'desc')}
            className="border-slate-700"
          >
            <ArrowUpDown className="w-4 h-4 mr-1" />
            {direcao === 'desc' ? 'Maior' : 'Menor'}
          </Button>
        </div>
      </div>

      {/* Lista de Professores (Accordion) */}
      <div data-tour="professores-carteira-tabela" className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1024px]">
            <thead className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur">
              <tr className="border-b border-slate-700">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Professor</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Alunos</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Trancados</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">MRR</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Ticket</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Média/Turma</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Health Score</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
        {carteirasFiltradas.map((carteira) => (
          <Fragment key={carteira.id}>
            <tr
              className="cursor-pointer hover:bg-slate-700/30 transition-colors"
              onClick={() => toggleExpansao(carteira.id)}
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-3 min-w-[260px]">
                  <div className="text-slate-400 shrink-0">
                    {expandido === carteira.id ? (
                      <ChevronDown className="w-5 h-5" />
                    ) : (
                      <ChevronRight className="w-5 h-5" />
                    )}
                  </div>
                  {carteira.foto_url ? (
                    <img
                      src={carteira.foto_url}
                      alt={carteira.nome}
                      className="w-10 h-10 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                      {getIniciais(carteira.nome)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p
                      className="font-medium text-white truncate cursor-pointer hover:text-violet-400 transition"
                      onClick={(e) => {
                        e.stopPropagation();
                        setModalDetalhes({ open: true, professor: carteira });
                      }}
                    >
                      {carteira.nome}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {carteira.cursos.slice(0, 3).join(', ')}
                      {carteira.cursos.length > 3 && ` +${carteira.cursos.length - 3}`}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-2 py-3 text-center align-middle">
                {/* Badge Alunos */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 whitespace-nowrap">
                  <Users className="w-3.5 h-3.5 text-violet-400" />
                  <span className="text-sm font-semibold text-white">{carteira.total_alunos}</span>
                  <span className="text-xs text-slate-400">alunos</span>
                </div>
              </td>
              <td className="px-2 py-3 text-center align-middle">
                {/* Badge Trancados - exibicao a parte, nao soma no badge de Alunos acima */}
                {carteira.total_trancados === null ? (
                  <Tooltip content="A contagem de alunos trancados está indisponível neste momento. Não foi tratada como zero.">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-500/10 border border-slate-500/20 whitespace-nowrap">
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs text-slate-300">trancados indisponível</span>
                    </div>
                  </Tooltip>
                ) : carteira.total_trancados > 0 && (
                  <Tooltip content="Alunos com trancamento vigente hoje (Emusys). Nao contam em Alunos, MRR, Ticket ou Média/Turma.">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 whitespace-nowrap">
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-sm font-semibold text-amber-400">{carteira.total_trancados}</span>
                      <span className="text-xs text-slate-400">trancados</span>
                    </div>
                  </Tooltip>
                )}
                {carteira.total_trancados === 0 && <span className="text-sm text-slate-500">—</span>}
              </td>
              <td className="px-2 py-3 text-center align-middle">
                {/* Badge MRR */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 whitespace-nowrap">
                  <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-400">
                    {carteira.mrr_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                  <span className="text-xs text-slate-400">MRR</span>
                </div>
              </td>
              <td className="px-2 py-3 text-center align-middle">
                {/* Badge Ticket */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 whitespace-nowrap">
                  <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-sm font-semibold text-cyan-400">
                    {carteira.ticket_medio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                  <span className="text-xs text-slate-400">ticket</span>
                </div>
              </td>
              <td className="px-2 py-3 text-center align-middle">
                {/* Badge Média/Turma */}
                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border whitespace-nowrap ${
                  carteira.media_alunos_turma !== null && carteira.media_alunos_turma >= 1.8
                    ? 'bg-green-500/10 border-green-500/20'
                    : carteira.media_alunos_turma !== null && carteira.media_alunos_turma >= 1.5
                      ? 'bg-yellow-500/10 border-yellow-500/20'
                      : 'bg-red-500/10 border-red-500/20'
                }`}>
                  <span className="text-sm">
                    {getIndicadorMediaTurma(carteira.media_alunos_turma)}
                  </span>
                  <span className={`text-sm font-semibold ${getCorMediaTurma(carteira.media_alunos_turma)}`}>
                    {carteira.media_alunos_turma === null
                      ? 'Indisponivel'
                      : carteira.media_alunos_turma.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                  </span>
                  <span className="text-xs text-slate-400">al/turma</span>
                </div>
              </td>

              <td className="px-2 py-3 text-center align-middle">
                {/* Badge Health Score */}
                <Tooltip content={carteira.health_score_exibivel
                  ? `Health Score V3 ${carteira.health_score_estado_publicacao}: ${carteira.health_score?.toFixed(1)} (${carteira.health_status === 'saudavel' ? 'Saudável' : carteira.health_status === 'atencao' ? 'Atenção' : 'Crítico'}). Cobertura: ${formatHealthScoreV3Coverage(carteira.health_score_cobertura)}.`
                  : carteira.health_score_estado_publicacao === 'indisponivel'
                    ? `Health Score V3 indisponível. ${carteira.health_score_motivo || 'Tente novamente em instantes.'}`
                    : `Health Score V3 sem base. ${carteira.health_score_motivo || 'Snapshot canônico indisponível para o recorte.'}`}>
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border whitespace-nowrap ${
                    !carteira.health_score_exibivel
                      ? 'bg-slate-800 border-slate-600'
                      : carteira.health_status === 'saudavel'
                      ? 'bg-emerald-500/10 border-emerald-500/20' 
                      : carteira.health_status === 'atencao' 
                        ? 'bg-amber-500/10 border-amber-500/20' 
                        : 'bg-rose-500/10 border-rose-500/20'
                  }`}>
                    <Heart className={`w-3.5 h-3.5 ${
                      !carteira.health_score_exibivel ? 'text-slate-500' :
                      carteira.health_status === 'saudavel' ? 'text-emerald-400' : 
                      carteira.health_status === 'atencao' ? 'text-amber-400' : 'text-rose-400'
                    }`} />
                    <span className={`text-sm font-bold ${
                      !carteira.health_score_exibivel ? 'text-slate-400' :
                      carteira.health_status === 'saudavel' ? 'text-emerald-400' : 
                      carteira.health_status === 'atencao' ? 'text-amber-400' : 'text-rose-400'
                    }`}>
                      {carteira.health_score_exibivel && carteira.health_score !== null
                        ? Math.round(carteira.health_score)
                        : carteira.health_score_estado_publicacao === 'indisponivel'
                          ? 'Indisponível'
                          : 'Sem base'}
                    </span>
                    {carteira.health_score_exibivel
                      && carteira.health_score_estado_publicacao === 'parcial' && (
                      <span className="text-[9px] font-semibold uppercase text-violet-300">
                        Parcial
                      </span>
                    )}
                  </div>
                </Tooltip>
              </td>

              {/* Botão Ver Detalhes */}
              <td className="px-4 py-3 text-center align-middle">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setModalDetalhes({ open: true, professor: carteira });
                  }}
                  className="text-slate-400 hover:text-white"
                >
                  <Eye className="w-4 h-4" />
                </Button>
              </td>
            </tr>

            {/* Conteúdo Expandido - Tabela de Alunos */}
            {expandido === carteira.id && (
              <tr className="bg-slate-900/30">
                <td colSpan={8} className="p-0">
              <div className="border-t border-slate-700/50 p-4">
                {loadingAlunos ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
                  </div>
                ) : alunosExpandido.length === 0 ? (
                  <p className="text-center text-slate-400 py-4">Nenhum aluno encontrado</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-400 border-b border-slate-700/50">
                          <th className="pb-2 font-medium">Nome</th>
                          <th className="pb-2 font-medium">Status</th>
                          <th className="pb-2 font-medium">Escola</th>
                          <th className="pb-2 font-medium text-center">Idade</th>
                          <th className="pb-2 font-medium">Curso</th>
                          <th className="pb-2 font-medium">Dia/Horário</th>
                          <th className="pb-2 font-medium text-right">Parcela</th>
                          <th className="pb-2 font-medium text-center">Perm.</th>
                          <th className="pb-2 font-medium text-center">Fim Contrato</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alunosExpandido.map((aluno) => (
                          <tr key={aluno.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                            <td className="py-2 text-white flex items-center gap-2">
                              {aluno.health_score && (
                                <Tooltip content={
                                  aluno.health_score === 'verde' ? 'Aluno saudável' :
                                  aluno.health_score === 'amarelo' ? 'Aluno em alerta' :
                                  'Aluno em situação emergente'
                                }>
                                  <span className="text-base">
                                    {aluno.health_score === 'verde' ? '💚' :
                                     aluno.health_score === 'amarelo' ? '💛' : '❤️'}
                                  </span>
                                </Tooltip>
                              )}
                              {aluno.nome}
                            </td>
                            <td className="py-2">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                aluno.status === 'ativo'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : aluno.status === 'trancado'
                                    ? 'bg-amber-500/20 text-amber-400'
                                    : 'bg-slate-500/20 text-slate-400'
                              }`}>
                                {aluno.status === 'ativo' ? 'Ativo' : aluno.status === 'trancado' ? 'Trancado' : aluno.status}
                              </span>
                            </td>
                            <td className="py-2">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                aluno.classificacao === 'LAMK' 
                                  ? 'bg-cyan-500/20 text-cyan-400' 
                                  : 'bg-violet-500/20 text-violet-400'
                              }`}>
                                {aluno.classificacao}
                              </span>
                            </td>
                            <td className="py-2 text-center text-slate-300">
                              {aluno.idade_atual ? `${aluno.idade_atual} anos` : '-'}
                            </td>
                            <td className="py-2 text-slate-300">{aluno.curso}</td>
                            <td className="py-2 text-slate-300">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {aluno.dia_aula}
                                <Clock className="w-3 h-3 ml-2" />
                                {aluno.horario_aula}
                              </span>
                            </td>
                            <td className="py-2 text-right text-emerald-400">
                              {aluno.valor_parcela.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </td>
                            <td className="py-2 text-center text-slate-300">{aluno.tempo_permanencia_meses}m</td>
                            <td className="py-2 text-center">
                              {aluno.data_fim_contrato ? (
                                <span className={`flex items-center justify-center gap-1 ${
                                  contratoProximoVencer(aluno.data_fim_contrato) 
                                    ? 'text-yellow-400' 
                                    : 'text-slate-400'
                                }`}>
                                  {contratoProximoVencer(aluno.data_fim_contrato) && (
                                    <AlertTriangle className="w-3 h-3" />
                                  )}
                                  {new Date(aluno.data_fim_contrato).toLocaleDateString('pt-BR')}
                                </span>
                              ) : (
                                <span className="text-slate-500">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
                </td>
              </tr>
            )}
          </Fragment>
        ))}

        {carteirasFiltradas.length === 0 && (
          <tr>
            <td colSpan={8} className="text-center py-12 text-slate-400">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum professor encontrado com os filtros aplicados</p>
            </td>
          </tr>
        )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Detalhes */}
      <ModalCarteiraProfessor
        open={modalDetalhes.open}
        onClose={() => setModalDetalhes({ open: false, professor: null })}
        professor={modalDetalhes.professor}
        unidadeAtual={unidadeAtual}
      />
    </div>
  );
}
