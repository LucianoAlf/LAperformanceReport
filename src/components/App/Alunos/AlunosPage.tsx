import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { ptBR } from 'date-fns/locale';
import {
  Users, DollarSign, BarChart3, Clock, Layers, AlertTriangle, BookOpen,
  Plus, Search, RotateCcw, Edit2, Trash2, Check, X, History,
  Calendar, Upload, Zap, RefreshCw, Lock, Unlock, Link2, GraduationCap
} from 'lucide-react';
import { useCompetenciaFiltro } from '@/hooks/useCompetenciaFiltro';
import { COMPETENCIA_FECHADA_MESSAGE, useCompetenciaMensalStatus } from '@/hooks/useCompetenciaMensalStatus';
import { CompetenciaFilter } from '@/components/ui/CompetenciaFilter';
import { PageFilterBar } from '@/components/ui/page-filter-bar';
import { KPICard } from '@/components/ui/KPICard';
import { Tooltip } from '@/components/ui/Tooltip';
import { ModalPermanenciaDetalhe } from '@/components/GestaoMensal/ModalPermanenciaDetalhe';
import { ModalDetalheKPI, BadgeUnidade, ValorParcela, TextoCurso } from '@/components/App/Dashboard/ModalDetalheKPI';
import { codigoTipoMatriculaAdministrativo } from '@/lib/administrativoTransferencias';
import { PageTabs, type PageTab } from '@/components/ui/page-tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TabelaAlunos } from './TabelaAlunos';
import { ConciliacaoMatriculas } from './ConciliacaoMatriculas';
import { GestaoTurmas } from './GestaoTurmas';
import { DistribuicaoAlunos } from './DistribuicaoAlunos';
import { ImportarAlunos } from './ImportarAlunos';
import { ModalNovoAluno } from './ModalNovoAluno';
import { ModalNovaTurma } from './ModalNovaTurma';
import { ModalAdicionarAlunoTurma } from './ModalAdicionarAlunoTurma';
import { AlertaTurma } from './AlertaTurma';
import { GradeHoraria } from '../Turmas/GradeHoraria';
import { TabAutomacao } from './Automacao/TabAutomacao';
import { TabHistoricoLTV } from './TabHistoricoLTV';
import { ToastContainer } from '@/components/ui/toast';
import { useToast } from '@/hooks/useToast';
import { isMatriculaBandaAtivaOperacional } from '@/lib/alunosFiltrosCanonicos';
import { fetchKPIsAlunosCanonicos } from '@/hooks/useKPIsAlunosCanonicos';
// Interfaces
export interface Aluno {
  id: number;
  nome: string;
  classificacao: string;
  idade_atual?: number;
  professor_atual_id: number | null;
  professor_nome?: string;
  curso_id: number | null;
  curso_nome?: string;
  curso_is_projeto_banda?: boolean;
  modalidade?: string;
  anamnese_preenchida?: boolean;
  anamnese_preenchida_em?: string | null;
  temperamento_codinome?: string | null;
  dia_aula: string | null;
  horario_aula: string | null;
  sala_nome?: string;
  valor_parcela: number | null;
  valor_cheio?: number | null;
  desconto_fixo?: number | null;
  desconto_condicional?: number | null;
  tempo_permanencia_meses: number | null;
  status: string;
  status_pagamento?: string;
  aguardando_renovacao?: boolean | null;
  dia_vencimento?: number;
  tipo_matricula_id: number | null;
  tipo_matricula_nome?: string;
  tipo_matricula_codigo?: string | null;
  tipo_aluno?: string | null;
  unidade_id: string;
  unidade_codigo?: string;
  data_matricula: string | null;
  total_alunos_turma?: number;
  turma_id?: number;
  nomes_alunos_turma?: string[];
  total_anotacoes?: number;
  ultimas_anotacoes?: { texto: string; categoria: string }[];
  // Campos para segundo curso
  is_segundo_curso?: boolean;
  data_nascimento?: string;
  telefone?: string;
  // Campos calculados para agrupamento
  cursos_ids?: number[]; // IDs de todos os cursos do aluno
  professores_ids?: number[]; // IDs de todos os professores do aluno
  outros_cursos?: Aluno[]; // Outros registros do mesmo aluno (segundo curso)
  valor_total?: number; // Soma de todos os valores de parcela
  // Health Score - percepção do professor
  health_score?: 'verde' | 'amarelo' | 'vermelho' | null;
  // Forma de pagamento
  forma_pagamento_id?: number | null;
  forma_pagamento_nome?: string | null;
  responsavel_telefone?: string | null;
  data_saida?: string | null;
  arquivado_em?: string | null;
  arquivado_por?: string | null;
  arquivado_motivo?: string | null;
  arquivado_origem?: string | null;
  arquivado_aluno_principal_id?: number | null;
  foto_url?: string | null;
  photo_url?: string | null;
  instagram?: string | null;
  emusys_matricula_id?: string | null;
  // Inadimplencia/valor ao vivo da API Emusys (nao confundir com status_pagamento/valor_parcela, que sao manuais)
  inadimplente_emusys?: boolean;
  valor_mensalidade_emusys?: number | null;
  _inadimplencia_atualizado_em?: string | null;
  anamnese_diagnosticos?: string[];
}

export interface Turma {
  id?: number;
  unidade_id: string;
  unidade_nome?: string;
  professor_id: number;
  professor_nome: string;
  curso_id?: number;
  curso_nome?: string;
  dia_semana: string;
  horario_inicio: string;
  sala_id?: number;
  sala_nome?: string;
  capacidade_maxima: number;
  total_alunos: number;
  nomes_alunos: string[];
  ids_alunos: number[];
  tipo?: 'implicita' | 'explicita';
  tipo_turma?: 'turma' | 'banda';
  nome_turma?: string;
  turma_explicita_id?: number;
}

export interface KPIsAlunos {
  totalAtivos: number;
  totalMatriculasAtivas: number;
  totalPagantes: number;
  totalBolsistas: number;
  mediaAlunosTurma: number;
  ticketMedio: number;
  ltvMedio: number;
  totalTurmas: number;
  turmasSozinhos: number;
  matriculasSegundoCurso?: number;
  matriculasBanda?: number;
  matriculasCoral?: number;
}

interface KPIsAlunosAdminOperacional {
  alunosAtivos: number;
  alunosPagantes: number;
  matriculasAtivas: number;
  matriculasBanda: number;
  matriculasSegundoCurso: number;
  matriculasCoral: number;
  bolsistasIntegrais: number;
  bolsistasParciais: number;
}

async function fetchKPIsAlunosAdminOperacional({
  unidadeId,
  ano,
  mes,
}: {
  unidadeId?: string | 'todos' | null;
  ano: number;
  mes: number;
}): Promise<KPIsAlunosAdminOperacional | null> {
  const unidadeFiltro = unidadeId && unidadeId !== 'todos' ? unidadeId : null;
  const { data, error } = await supabase.rpc('get_kpis_alunos_admin_operacional', {
    p_unidade_id: unidadeFiltro,
    p_ano: ano,
    p_mes: mes,
  });

  if (error) throw error;

  const totais = data?.totais;
  if (!totais) return null;

  return {
    alunosAtivos: Number(totais.alunos_ativos) || 0,
    alunosPagantes: Number(totais.alunos_pagantes) || 0,
    matriculasAtivas: Number(totais.matriculas_ativas) || 0,
    matriculasBanda: Number(totais.matriculas_banda) || 0,
    matriculasSegundoCurso: Number(totais.matriculas_2_curso) || 0,
    matriculasCoral: Number(totais.matriculas_coral) || 0,
    bolsistasIntegrais: Number(totais.bolsistas_integrais) || 0,
    bolsistasParciais: Number(totais.bolsistas_parciais) || 0,
  };
}

export interface Filtros {
  nome: string;
  professor_id: string;
  curso_id: string;
  dia_aula: string;
  horario_aula: string;
  status: string;
  tipo_matricula_id: string;
  classificacao: string;
  turma_size: string;
  tempo_permanencia: string;
  status_pagamento: string;
  anamnese: string;
  temperamento: string;
  diagnostico: string;
  sem_telefone: boolean;
}

type TabAtiva = 'lista' | 'turmas' | 'grade' | 'distribuicao' | 'importar' | 'automacao' | 'historico' | 'conciliacao';

const alunosTabs: PageTab<TabAtiva>[] = [
  { id: 'lista', label: 'Lista de Alunos', shortLabel: 'Lista', icon: Users },
  { id: 'turmas', label: 'Gestão de Turmas', shortLabel: 'Turmas', icon: Calendar },
  { id: 'grade', label: 'Grade Horária', shortLabel: 'Grade', icon: Clock },
  { id: 'distribuicao', label: 'Distribuição', shortLabel: 'Distrib.', icon: BarChart3 },
  { id: 'historico', label: 'Histórico LTV', shortLabel: 'LTV', icon: History },
  { id: 'importar', label: 'Importar Alunos', shortLabel: 'Importar', icon: Upload, disabled: true, disabledTitle: 'Em breve — funcionalidade em desenvolvimento' },
  { id: 'automacao', label: 'Automacao', shortLabel: 'Automacao', icon: Zap },
  { id: 'conciliacao', label: 'Conciliação Emusys', shortLabel: 'Conciliação', icon: Link2 },
];

export function AlunosPage() {
  useSetPageTitle({
    titulo: 'Gestão de Alunos',
    subtitulo: 'Controle completo de alunos, turmas e horários',
    icone: Users,
    iconeCor: 'text-white',
    iconeWrapperCor: 'bg-gradient-to-br from-purple-500 to-pink-500',
  });

  const context = useOutletContext<{ filtroAtivo: boolean; unidadeSelecionada: UnidadeId }>();
  const unidadeAtual = context?.unidadeSelecionada || 'todos';
  const toast = useToast();

  // Filtro de competência (período)
  const {
    filtro: competenciaFiltro,
    range: competenciaRange,
    anosDisponiveis,
    setTipo: setCompetenciaTipo,
    setAno: setCompetenciaAno,
    setMes: setCompetenciaMes,
    setTrimestre: setCompetenciaTrimestre,
    setSemestre: setCompetenciaSemestre,
    setDataInicio: setCompetenciaDataInicio,
    setDataFim: setCompetenciaDataFim,
  } = useCompetenciaFiltro('todos');

  // Modal de drill-down de permanência
  const [modalPermanenciaOpen, setModalPermanenciaOpen] = useState(false);

  // Modal de drill-down de matrículas ativas
  const [modalMatriculasAtivas, setModalMatriculasAtivas] = useState(false);
  const [dadosModalMatriculasAtivas, setDadosModalMatriculasAtivas] = useState<any[]>([]);
  const [carregandoModalMatriculas, setCarregandoModalMatriculas] = useState(false);

  // Estados principais
  const [tabAtiva, setTabAtiva] = useState<TabAtiva>('lista');
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [kpis, setKpis] = useState<KPIsAlunos>({
    totalAtivos: 0,
    totalMatriculasAtivas: 0,
    totalPagantes: 0,
    totalBolsistas: 0,
    mediaAlunosTurma: 0,
    ticketMedio: 0,
    ltvMedio: 0,
    totalTurmas: 0,
    turmasSozinhos: 0
  });

  // Estados de filtros
  const [filtros, setFiltros] = useState<Filtros>({
    nome: '',
    professor_id: '',
    curso_id: '',
    dia_aula: '',
    horario_aula: '',
    status: '',
    tipo_matricula_id: '',
    classificacao: '',
    turma_size: '',
    tempo_permanencia: '',
    status_pagamento: '',
    anamnese: '',
    temperamento: '',
    diagnostico: '',
    sem_telefone: false,
  });

  // Estados de opções para selects
  const [professores, setProfessores] = useState<{ id: number, nome: string }[]>([]);
  const [cursos, setCursos] = useState<{ id: number, nome: string, is_projeto_banda?: boolean }[]>([]);
  const [tiposMatricula, setTiposMatricula] = useState<{ id: number, nome: string }[]>([]);
  const [salas, setSalas] = useState<{ id: number, nome: string, capacidade_maxima: number }[]>([]);
  const [horarios, setHorarios] = useState<{ id: number, nome: string, hora_inicio: string }[]>([]);

  // Estados de UI
  const [loading, setLoading] = useState(true);
  const [confirmRecalcular, setConfirmRecalcular] = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  const [modalNovoAluno, setModalNovoAluno] = useState(false);
  const competenciaMensal = useCompetenciaMensalStatus({
    unidadeId: unidadeAtual,
    ano: competenciaFiltro.ano,
    mes: competenciaFiltro.mes,
  });
  const recalcBloqueado = competenciaMensal.loading || competenciaMensal.bloqueiaEscrita;
  const competenciaBadgeClasses = competenciaMensal.bloqueiaEscrita
    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
    : 'bg-slate-800/70 border-slate-600 text-slate-300';

  function avisarCompetenciaBloqueada() {
    toast.error(COMPETENCIA_FECHADA_MESSAGE);
  }

  function solicitarRecalculoDadosMensais() {
    if (competenciaMensal.loading) {
      toast.info('Validando competência', 'Aguarde a confirmação do status antes de recalcular.');
      return;
    }

    if (competenciaMensal.bloqueiaEscrita) {
      avisarCompetenciaBloqueada();
      return;
    }

    setConfirmRecalcular(true);
  }

  async function confirmarRecalculoDadosMensais() {
    if (competenciaMensal.bloqueiaEscrita) {
      setConfirmRecalcular(false);
      avisarCompetenciaBloqueada();
      return;
    }

    setRecalculando(true);
    try {
      const { data, error } = await supabase.rpc('recalcular_dados_mensais', {
        p_ano: competenciaFiltro.ano, p_mes: competenciaFiltro.mes, p_unidade_id: unidadeAtual
      });
      if (error) throw error;
      toast.success('Dados recalculados!', `${data?.alunos_ativos || 0} ativos, ${data?.novas_matriculas || 0} matrículas, ${data?.evasoes || 0} evasões`);
    } catch (err: any) {
      toast.error('Erro ao recalcular', err.message);
    } finally {
      setRecalculando(false);
      setConfirmRecalcular(false);
    }
  }

  // Detalhamento do card "Matrículas Ativas" — replica a classificação da RPC
  // get_kpis_alunos_admin_operacional (pessoa + vínculos de banda/2º curso/coral)
  // para que o total do modal bata exatamente com o valor do card.
  const fetchMatriculasAtivasDetalhe = async () => {
    setCarregandoModalMatriculas(true);
    try {
      let query = supabase
        .from('alunos')
        .select(`
          id, nome, unidade_id, status, curso_id, is_segundo_curso, tipo_matricula_id, data_matricula, valor_parcela,
          unidades:unidade_id!inner(nome),
          cursos:curso_id!left(nome, is_projeto_banda),
          tipos_matricula(codigo)
        `)
        .is('arquivado_em', null)
        .in('status', ['ativo', 'trancado'])
        .order('nome');

      if (unidadeAtual && unidadeAtual !== 'todos') {
        query = query.eq('unidade_id', unidadeAtual);
      }

      const { data } = await query;

      const hoje = new Date().toISOString().slice(0, 10);
      const ultimoDiaMes = new Date(competenciaFiltro.ano, competenciaFiltro.mes, 0).toISOString().slice(0, 10);
      const dataCorte = hoje < ultimoDiaMes ? hoje : ultimoDiaMes;

      const classificados = (data || [])
        .filter((a: any) => !a.data_matricula || a.data_matricula <= dataCorte)
        .map((a: any) => {
          const cursoNome = a.cursos?.nome || '';
          const cursoBanda = a.cursos?.is_projeto_banda === true;
          const tipoCodigo = codigoTipoMatriculaAdministrativo(a);
          const isBanda = cursoBanda || tipoCodigo === 'BANDA';
          const isCoral = cursoNome.toLowerCase().includes('coral');
          const isSegundoOperacional = a.is_segundo_curso === true && tipoCodigo !== 'REGULAR';
          const entraCarteira = a.status === 'ativo' || (a.status === 'trancado' && !isBanda && !isCoral);
          const pessoaKey = `${String(a.nome || '').trim().toLowerCase()}|${a.unidade_id}`;
          return { ...a, cursoNome, isBanda, isCoral, isSegundoOperacional, entraCarteira, pessoaKey };
        });

      // Bucket "Aluno": 1 linha por pessoa entre as que entram na carteira,
      // preferindo a linha "normal" (não banda/2º curso/coral) e desempatando pelo menor id
      const porPessoa = new Map<string, any[]>();
      classificados.filter((c: any) => c.entraCarteira).forEach((c: any) => {
        const arr = porPessoa.get(c.pessoaKey) || [];
        arr.push(c);
        porPessoa.set(c.pessoaKey, arr);
      });
      const pessoaRows = Array.from(porPessoa.values()).map(arr => {
        const ordenado = [...arr].sort((x, y) => {
          const px = (!x.isBanda && !x.isSegundoOperacional && !x.isCoral) ? 0 : 1;
          const py = (!y.isBanda && !y.isSegundoOperacional && !y.isCoral) ? 0 : 1;
          if (px !== py) return px - py;
          return x.id - y.id;
        });
        return { ...ordenado[0], _bucket: 'Aluno' };
      });

      const bandaRows = classificados
        .filter((c: any) => c.status === 'ativo' && c.isBanda)
        .map((c: any) => ({ ...c, _bucket: 'Banda' }));

      const segundoRows = classificados
        .filter((c: any) => c.entraCarteira && c.isSegundoOperacional && !c.isBanda && !c.isCoral)
        .map((c: any) => ({ ...c, _bucket: '2º Curso' }));

      const coralRows = classificados
        .filter((c: any) => c.status === 'ativo' && c.isCoral)
        .map((c: any) => ({ ...c, _bucket: 'Coral' }));

      const tudo = [...pessoaRows, ...bandaRows, ...segundoRows, ...coralRows];

      setDadosModalMatriculasAtivas(tudo.map((a: any) => ({
        nome: a.nome,
        unidade: a.unidades?.nome || '—',
        data_matricula: a.data_matricula ? new Date(a.data_matricula + 'T12:00:00').toLocaleDateString('pt-BR') : '—',
        curso: a.cursoNome || '—',
        tipo: a._bucket,
        status: a.status === 'ativo' ? 'Ativo' : 'Trancado',
        valor: a.valor_parcela ? `R$ ${Number(a.valor_parcela).toLocaleString('pt-BR')}` : '—',
        _valor_raw: a.valor_parcela ? Number(a.valor_parcela) : 0,
      })));
    } finally {
      setCarregandoModalMatriculas(false);
    }
  };

  // Calcular alunos sem status financeiro canônico (após dia 15)
  const alertaPagamentos = useMemo(() => {
    const hoje = new Date();
    const diaAtual = hoje.getDate();
    const mostrarAlerta = diaAtual >= 15;

    const alunosSemLancamento = alunos.filter(a => {
      const status = String(a.status || '').toLowerCase();
      const tipoMatriculaId = Number(a.tipo_matricula_id || 0);
      return (status === 'ativo' || status === 'trancado') &&
        ![3, 4, 5].includes(tipoMatriculaId) &&
        (!a.status_pagamento || a.status_pagamento === '-' || a.status_pagamento === null);
    });

    return {
      mostrar: mostrarAlerta && alunosSemLancamento.length > 0,
      quantidade: alunosSemLancamento.length,
      diaAtual
    };
  }, [alunos]);
  const [modalNovaTurma, setModalNovaTurma] = useState(false);
  const [turmaParaEditar, setTurmaParaEditar] = useState<Turma | null>(null);
  const [turmaParaAdicionarAluno, setTurmaParaAdicionarAluno] = useState<Turma | null>(null);
  const [alertaTurma, setAlertaTurma] = useState<{ show: boolean, aluno?: Aluno, turmaExistente?: Turma } | null>(null);
  const [turmaDetalheAbrir, setTurmaDetalheAbrir] = useState<Turma | null>(null);

  // Carregar dados iniciais
  useEffect(() => {
    carregarDados();
  }, [unidadeAtual, competenciaRange.startDate, competenciaRange.endDate]);

  useEffect(() => {
    if (competenciaMensal.bloqueiaEscrita) {
      setConfirmRecalcular(false);
    }
  }, [competenciaMensal.bloqueiaEscrita]);

  // Listener para navegação de turma
  useEffect(() => {
    const handleNavegarParaTurma = (event: CustomEvent) => {
      const { professor_id, dia, horario } = event.detail;
      setTabAtiva('turmas');
      // Aplicar filtros na aba de turmas
      setTimeout(() => {
        setFiltros(prev => ({
          ...prev,
          professor_id: String(professor_id),
          dia_aula: dia,
          horario_aula: horario
        }));
      }, 100);
    };

    window.addEventListener('navegarParaTurma', handleNavegarParaTurma as EventListener);
    return () => {
      window.removeEventListener('navegarParaTurma', handleNavegarParaTurma as EventListener);
    };
  }, []);

  async function carregarDados() {
    setLoading(true);

    // ── FASE 1: disparar TUDO em paralelo ──

    // Helper: busca paginada para contornar limite 1000 rows do PostgREST
    const PAGE_SIZE = 1000;
    async function fetchAllAlunos(buildQuery: () => any): Promise<{ data: any[]; error: any }> {
      const allData: any[] = [];
      let offset = 0;
      let hasMore = true;
      let lastError: any = null;
      while (hasMore) {
        const { data, error } = await buildQuery().range(offset, offset + PAGE_SIZE - 1);
        if (error) { lastError = error; break; }
        if (data) allData.push(...data);
        hasMore = data?.length === PAGE_SIZE;
        offset += PAGE_SIZE;
      }
      return { data: allData, error: lastError };
    }

    const selectFields = `
      id, nome, classificacao, idade_atual, professor_atual_id, curso_id, modalidade,
      dia_aula, horario_aula, valor_parcela, valor_cheio, desconto_fixo, desconto_condicional, tempo_permanencia_meses,
      status, status_pagamento, aguardando_renovacao, dia_vencimento, tipo_matricula_id, tipo_aluno, unidade_id, data_matricula,
      is_segundo_curso, data_nascimento, forma_pagamento_id, telefone, whatsapp, responsavel_telefone, data_saida,
      arquivado_em, arquivado_por, arquivado_motivo, arquivado_origem, arquivado_aluno_principal_id,
      foto_url, photo_url, instagram, emusys_matricula_id,
      anamnese_preenchida, anamnese_preenchida_em, temperamento_codinome,
      professores:professor_atual_id!left(nome),
      cursos:curso_id!left(nome, is_projeto_banda),
      tipos_matricula:tipo_matricula_id!left(nome, conta_como_pagante, entra_ticket_medio, codigo),
      unidades:unidade_id!inner(codigo),
      formas_pagamento:forma_pagamento_id!left(nome)
    `;

    // Builder da query principal (reutilizado pela paginação)
    const buildMainQuery = () => {
      let q = supabase.from('alunos').select(selectFields).is('arquivado_em', null).order('nome');
      if (unidadeAtual && unidadeAtual !== 'todos') q = q.eq('unidade_id', unidadeAtual);
      if (competenciaRange.startDate) q = q.gte('data_matricula', competenciaRange.startDate);
      if (competenciaRange.endDate) q = q.lte('data_matricula', competenciaRange.endDate);
      return q;
    };

    // Builder da query de saída (alunos que saíram no período)
    const buildSaidaQuery = (competenciaRange.startDate && competenciaRange.endDate)
      ? () => {
          let q = supabase.from('alunos').select(selectFields).not('data_saida', 'is', null)
            .is('arquivado_em', null)
            .gte('data_saida', competenciaRange.startDate)
            .lte('data_saida', competenciaRange.endDate)
            .order('nome');
          if (unidadeAtual && unidadeAtual !== 'todos') q = q.eq('unidade_id', unidadeAtual);
          return q;
        }
      : null;

    // Turmas implícitas (usada por alunos + turmas + KPIs — buscar UMA VEZ)
    let qTurmasView = supabase.from('vw_turmas_implicitas').select('*');
    if (unidadeAtual && unidadeAtual !== 'todos') qTurmasView = qTurmasView.eq('unidade_id', unidadeAtual);

    // Disparar tudo em paralelo: alunos (paginado), turmas view, anotações, turmas explícitas, opções, LTV
    const [alunosR, alunosSaidaR, turmasViewR, anotacoesR, ...outrosResults] = await Promise.all([
      fetchAllAlunos(buildMainQuery),
      buildSaidaQuery ? fetchAllAlunos(buildSaidaQuery) : Promise.resolve({ data: [] as any[], error: null }),
      qTurmasView,
      // Anotações pendentes — são poucas, buscar TODAS sem .in() de 1000 IDs
      supabase.from('anotacoes_alunos')
        .select('aluno_id, texto, categoria, created_at')
        .eq('resolvido', false)
        .order('created_at', { ascending: false }),
      // Turmas explícitas
      carregarTurmasExplicitas(),
      // Opções (selects)
      carregarOpcoes(),
      // LTV — única query de KPI que não dá pra calcular no JS
      supabase.rpc('get_tempo_permanencia', {
        p_unidade_id: unidadeAtual && unidadeAtual !== 'todos' ? unidadeAtual : null,
      }),
    ]);

    const turmasViewData = turmasViewR.data || [];
    const permData = outrosResults[2]?.data;

    // ── FASE 2: processar alunos ──
    const { data: alunosRaw, error } = alunosR;

    // Mesclar alunos por data_saida (sem duplicatas)
    let alunosMesclados = alunosRaw ?? [];
    if (alunosSaidaR?.data?.length) {
      const idsExistentes = new Set(alunosMesclados.map((a: any) => a.id));
      for (const a of alunosSaidaR.data) {
        if (!idsExistentes.has(a.id)) alunosMesclados.push(a);
      }
    }

    if (!error && alunosMesclados.length > 0) {
      const alunoIds = alunosMesclados.map((registro: any) => registro.id).filter(Boolean);
      const { data: anamnesesLista } = await supabase
        .from('anamneses')
        .select('aluno_id, diagnosticos')
        .in('aluno_id', alunoIds)
        .eq('status', 'completa')
        .order('created_at', { ascending: false });

      const diagnosticosPorAluno = new Map<number, string[]>();
      anamnesesLista?.forEach((registro: any) => {
        if (diagnosticosPorAluno.has(registro.aluno_id)) return;

        let diagnosticos: string[] = [];
        if (Array.isArray(registro.diagnosticos)) {
          diagnosticos = registro.diagnosticos.map((item: any) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
              return String(item.label || item.nome || item.valor || item.value || '').trim();
            }
            return String(item).trim();
          }).filter(Boolean);
        } else if (typeof registro.diagnosticos === 'string') {
          diagnosticos = registro.diagnosticos.split(',').map((item: string) => item.trim()).filter(Boolean);
        }

        diagnosticosPorAluno.set(registro.aluno_id, diagnosticos);
      });

      const turmasMap = new Map(turmasViewData.map((t: any) => [
        `${t.unidade_id}-${t.professor_id}-${t.dia_semana}-${t.horario_inicio}`,
        t
      ]));

      // Mapa de anotações pendentes
      const anotacoesMap = new Map<number, { total: number; ultimas: { texto: string; categoria: string }[] }>();
      anotacoesR.data?.forEach(a => {
        const atual = anotacoesMap.get(a.aluno_id) || { total: 0, ultimas: [] };
        atual.total += 1;
        if (atual.ultimas.length < 3) {
          atual.ultimas.push({ texto: a.texto, categoria: a.categoria });
        }
        anotacoesMap.set(a.aluno_id, atual);
      });

      const alunosFormatados = alunosMesclados.map((a: any) => {
        const turmaKey = `${a.unidade_id}-${a.professor_atual_id}-${a.dia_aula}-${a.horario_aula}`;
        const turmaInfo = turmasMap.get(turmaKey) as any;

        return {
          ...a,
          professor_nome: a.professores?.nome || '',
          curso_nome: a.cursos?.nome || '',
          curso_is_projeto_banda: a.cursos?.is_projeto_banda || false,
          tipo_matricula_nome: a.tipos_matricula?.nome || '',
          tipo_matricula_codigo: a.tipos_matricula?.codigo || null,
          unidade_codigo: a.unidades?.codigo || '',
          forma_pagamento_nome: a.formas_pagamento?.nome || null,
          anamnese_diagnosticos: diagnosticosPorAluno.get(a.id) || [],
          total_alunos_turma: turmaInfo?.total_alunos || 1,
          turma_id: turmaInfo?.id,
          nomes_alunos_turma: turmaInfo?.nomes_alunos || [],
          total_anotacoes: anotacoesMap.get(a.id)?.total || 0,
          ultimas_anotacoes: anotacoesMap.get(a.id)?.ultimas || []
        };
      });

      // Agrupar alunos com mesmo nome e data_nascimento (segundo curso)
      const alunosAgrupados = new Map<string, Aluno[]>();
      alunosFormatados.forEach((aluno: Aluno) => {
        const chave = `${aluno.nome?.toLowerCase().trim()}-${aluno.data_nascimento || ''}-${aluno.unidade_id}`;
        const grupo = alunosAgrupados.get(chave) || [];
        grupo.push(aluno);
        alunosAgrupados.set(chave, grupo);
      });

      const alunosComSegundoCurso: Aluno[] = [];
      alunosAgrupados.forEach((grupo) => {
        if (grupo.length === 1) {
          alunosComSegundoCurso.push(grupo[0]);
        } else {
          let ordenado = grupo.sort((a, b) => {
            if (a.is_segundo_curso && !b.is_segundo_curso) return 1;
            if (!a.is_segundo_curso && b.is_segundo_curso) return -1;
            return 0;
          });

          // Regra: se principal é banda/projeto com parcela NULL/0 e existe curso pagante, promover o pagante
          const possivelPrincipal = ordenado[0];
          const parcelaNula = possivelPrincipal.valor_parcela === null || possivelPrincipal.valor_parcela === 0;
          if (possivelPrincipal.curso_is_projeto_banda && parcelaNula) {
            const idxPagante = ordenado.findIndex(
              (a, i) => i > 0 && a.valor_parcela && a.valor_parcela > 0
            );
            if (idxPagante > 0) {
              const pagante = ordenado[idxPagante];
              const banda = possivelPrincipal;
              ordenado = [
                pagante,
                ...ordenado.slice(1, idxPagante),
                banda,
                ...ordenado.slice(idxPagante + 1)
              ];
            }
          }

          const principal = ordenado[0];
          const outrosCursos = ordenado.slice(1).map(oc => {
            // Calcular turma para cada segundo curso
            const turma = turmasViewData.find((t: any) =>
              t.professor_id === oc.professor_atual_id &&
              t.dia_semana === oc.dia_aula &&
              t.horario_inicio === oc.horario_aula
            );
            return {
              ...oc,
              total_alunos_turma: turma?.total_alunos || 1
            };
          });
          const valorTotal = grupo.reduce((acc, a) => acc + (a.valor_parcela || 0), 0);
          alunosComSegundoCurso.push({
            ...principal,
            outros_cursos: outrosCursos,
            valor_total: valorTotal,
            cursos_ids: grupo.map(a => a.curso_id).filter(Boolean) as number[],
            professores_ids: grupo.map(a => a.professor_atual_id).filter(Boolean) as number[],
          });
        }
      });

      alunosComSegundoCurso.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

      // Merge com o cache de inadimplencia/valor ao vivo do Emusys (so leitura -- nao
      // altera status_pagamento/valor_parcela). Match por (unidade_id, emusys_matricula_id)
      // -- IDs do Emusys sao por unidade, nunca globais.
      const unidadesEnvolvidas = [...new Set(alunosComSegundoCurso.map(a => a.unidade_id).filter(Boolean))];
      const cacheMap = new Map<string, { inadimplente: boolean; valor_mensalidade_emusys: number | null; atualizado_em: string }>();
      if (unidadesEnvolvidas.length > 0) {
        const { data: cacheRows } = await supabase
          .from('inadimplencia_emusys_cache')
          .select('unidade_id, emusys_matricula_id, inadimplente, valor_mensalidade_emusys, atualizado_em')
          .in('unidade_id', unidadesEnvolvidas);
        (cacheRows || []).forEach((row: any) => {
          cacheMap.set(`${row.unidade_id}|${row.emusys_matricula_id}`, row);
        });
      }

      const alunosComInadimplenciaEmusys = alunosComSegundoCurso.map(aluno => {
        const chavePrincipal = aluno.emusys_matricula_id ? `${aluno.unidade_id}|${aluno.emusys_matricula_id}` : null;
        const cachePrincipal = chavePrincipal ? cacheMap.get(chavePrincipal) : undefined;

        const outrosCursosComCache = aluno.outros_cursos?.map(oc => {
          const chaveOc = oc.emusys_matricula_id ? `${oc.unidade_id}|${oc.emusys_matricula_id}` : null;
          const cacheOc = chaveOc ? cacheMap.get(chaveOc) : undefined;
          return {
            ...oc,
            inadimplente_emusys: cacheOc?.inadimplente,
            valor_mensalidade_emusys: cacheOc?.valor_mensalidade_emusys ?? undefined,
          };
        });

        return {
          ...aluno,
          inadimplente_emusys: cachePrincipal?.inadimplente,
          valor_mensalidade_emusys: cachePrincipal?.valor_mensalidade_emusys ?? undefined,
          _inadimplencia_atualizado_em: cachePrincipal?.atualizado_em ?? null,
          outros_cursos: outrosCursosComCache,
        };
      });

      setAlunos(alunosComInadimplenciaEmusys);

      // ── FASE 3: calcular KPIs no JS (elimina 5 queries) ──
      // KPIs usam apenas alunos da query principal (por data_matricula), não os mesclados por data_saida
      const alunosParaKPIs = alunosRaw ?? [];
      // IDs de tipos: 3=BOLSISTA_INT, 4=BOLSISTA_PARC
      const ativosOperacionais = alunosParaKPIs.filter((a: any) => a.status === 'ativo');
      // Mesma régua operacional viva: pessoas distintas com matrícula ativa,
      // sem filtrar is_segundo_curso (COUNT DISTINCT nome já deduplicaela)
      const totalAtivos = new Set(
        alunosParaKPIs
          .filter((a: any) => a.status === 'ativo')
          .map((a: any) => (a.nome ?? '').toLowerCase().trim())
          .filter(Boolean)
      ).size;
      const totalMatriculasAtivas = ativosOperacionais.length; // inclui segundo curso + banda

      // Separar banda, coral e segundo curso
      const cursosCoral = ['canto coral'];

      // Banda: usar is_projeto_banda do curso
      const matriculasBanda = ativosOperacionais.filter((a: any) =>
        a.cursos?.is_projeto_banda === true
      ).length;

      const matriculasCoral = ativosOperacionais.filter((a: any) =>
        cursosCoral.some(nome => a.cursos?.nome?.toLowerCase().includes(nome))
      ).length;

      // Segundo curso = is_segundo_curso true, excluindo banda e coral
      const matriculasSegundoCurso = ativosOperacionais.filter((a: any) =>
        a.is_segundo_curso &&
        a.cursos?.is_projeto_banda !== true &&
        !cursosCoral.some(nome => a.cursos?.nome?.toLowerCase().includes(nome))
      ).length;
      // Pagantes = conta_como_pagante AND NOT is_segundo_curso AND status ativo/trancado
      // aviso_previo fica em ativosETrancados mas NÃO entra na base de pagantes (mesma régua da view)
      const pagantesRecords = ativosOperacionais.filter((a: any) =>
        a.tipos_matricula?.conta_como_pagante === true &&
        !a.is_segundo_curso
      );
      const totalPagantes = pagantesRecords.length;
      // Bolsista real = exclui projeto banda (banda tem categoria própria, mesmo marcada como bolsista)
      const totalBolsistas = ativosOperacionais.filter((a: any) => {
        const codigo = a.tipos_matricula?.codigo;
        return (codigo === 'BOLSISTA_INT' || codigo === 'BOLSISTA_PARC') && a.cursos?.is_projeto_banda !== true;
      }).length;

      // Ticket médio — TODOS os alunos pagantes (ativos + trancados)
      // Regra: soma de todas as parcelas / total de alunos pagantes
      // Aluno pagante = tipo_matricula.entra_ticket_medio === true
      // Inclui inadimplentes, em_dia, em_aberto — todos que vão pagar
      const alunosTicket = ativosOperacionais.filter((a: any) =>
        a.tipos_matricula?.entra_ticket_medio === true &&
        a.valor_parcela != null &&
        a.valor_parcela > 0
      );
      // Agrupar por aluno único (nome + data_nascimento + unidade) e somar valores de todos os cursos
      const alunosUnicosTicket = new Map<string, number>();
      alunosTicket.forEach((a: any) => {
        const chave = `${a.nome?.toLowerCase().trim()}-${a.data_nascimento || ''}-${a.unidade_id}`;
        alunosUnicosTicket.set(chave, (alunosUnicosTicket.get(chave) || 0) + (a.valor_parcela || 0));
      });
      const valoresUnicos = Array.from(alunosUnicosTicket.values());
      const ticketMedio = valoresUnicos.length > 0
        ? valoresUnicos.reduce((sum, v) => sum + v, 0) / valoresUnicos.length
        : 0;

      // LTV
      let ltvMedio = 0;
      if (permData && permData.length > 0) {
        const comDados = permData.filter((p: any) => Number(p.tempo_permanencia_medio) > 0);
        if (comDados.length > 0) {
          ltvMedio = comDados.reduce((sum: number, p: any) => sum + Number(p.tempo_permanencia_medio), 0) / comDados.length;
        }
      }

      // Turmas (da view já carregada)
      const totalTurmas = turmasViewData.length;
      const mediaAlunosTurma = totalTurmas > 0
        ? turmasViewData.reduce((sum: number, t: any) => sum + (t.total_alunos || 0), 0) / totalTurmas
        : 0;
      const turmasSozinhos = turmasViewData.filter((t: any) => t.total_alunos === 1).length;

      let kpisAdminOperacional: KPIsAlunosAdminOperacional | null = null;
      let kpisAlunosCanonicos: Awaited<ReturnType<typeof fetchKPIsAlunosCanonicos>> | null = null;
      try {
        kpisAdminOperacional = await fetchKPIsAlunosAdminOperacional({
          unidadeId: unidadeAtual,
          ano: competenciaFiltro.ano,
          mes: competenciaFiltro.mes,
        });
      } catch (err) {
        console.error('Erro ao buscar KPIs operacionais de alunos:', err);
      }
      try {
        kpisAlunosCanonicos = await fetchKPIsAlunosCanonicos({
          unidadeId: unidadeAtual,
          ano: competenciaFiltro.ano,
          mes: competenciaFiltro.mes,
        });
      } catch (err) {
        console.error('Erro ao buscar KPIs financeiros canônicos de alunos:', err);
      }

      const usarKpisAdminOperacional = !!kpisAdminOperacional;
      const kpisFinanceirosCanonicos = kpisAlunosCanonicos?.fonte !== 'indisponivel'
        ? unidadeAtual === 'todos'
          ? kpisAlunosCanonicos
          : kpisAlunosCanonicos?.porUnidade.find(row => row.unidade_id === unidadeAtual)
        : null;
      const ticketMedioCanonico = Number(kpisFinanceirosCanonicos?.ticketMedio) || 0;
      const ltvCanonico = Number(kpisFinanceirosCanonicos?.ltv) || 0;

      setKpis({
        totalAtivos: usarKpisAdminOperacional ? kpisAdminOperacional.alunosAtivos : totalAtivos,
        totalMatriculasAtivas: usarKpisAdminOperacional ? kpisAdminOperacional.matriculasAtivas : totalMatriculasAtivas,
        matriculasSegundoCurso: usarKpisAdminOperacional ? kpisAdminOperacional.matriculasSegundoCurso : matriculasSegundoCurso,
        matriculasBanda: usarKpisAdminOperacional ? kpisAdminOperacional.matriculasBanda : matriculasBanda,
        matriculasCoral: usarKpisAdminOperacional ? kpisAdminOperacional.matriculasCoral : matriculasCoral,
        totalPagantes: usarKpisAdminOperacional ? kpisAdminOperacional.alunosPagantes : totalPagantes,
        totalBolsistas: usarKpisAdminOperacional
          ? Math.round(kpisAdminOperacional.bolsistasIntegrais + kpisAdminOperacional.bolsistasParciais)
          : totalBolsistas,
        mediaAlunosTurma: Math.round(mediaAlunosTurma * 100) / 100,
        ticketMedio: Math.round(ticketMedioCanonico || ticketMedio),
        ltvMedio: Math.round((ltvCanonico || ltvMedio) * 10) / 10,
        totalTurmas,
        turmasSozinhos
      });
    }

    // ── FASE 4: processar turmas (view já carregada + explícitas já carregadas) ──
    const turmasExplicitas = outrosResults[0] as Turma[];
    const turmasImplicitasMarcadas = turmasViewData.map((t: any) => ({
      ...t,
      tipo: 'implicita' as const,
    }));
    const idsExplicitasJaVinculadas = new Set(
      turmasImplicitasMarcadas
        .filter((t: any) => t.turma_explicita_id)
        .map((t: any) => t.turma_explicita_id)
    );
    const turmasExplicitasFiltradas = turmasExplicitas.filter(
      t => !idsExplicitasJaVinculadas.has(t.turma_explicita_id)
    );
    setTurmas([...turmasImplicitasMarcadas, ...turmasExplicitasFiltradas]);

    setLoading(false);
  }

  // Busca turmas explícitas e retorna Turma[] (chamada em paralelo por carregarDados)
  async function carregarTurmasExplicitas(): Promise<Turma[]> {
    let queryExplicitas = supabase
      .from('turmas_explicitas')
      .select(`
        id, tipo, nome, professor_id, curso_id, dia_semana, horario_inicio,
        sala_id, unidade_id, capacidade_maxima,
        professores!inner(nome), cursos(nome), salas(nome), unidades!inner(nome)
      `)
      .eq('ativo', true);

    if (unidadeAtual && unidadeAtual !== 'todos') {
      queryExplicitas = queryExplicitas.eq('unidade_id', unidadeAtual);
    }

    const { data: turmasExplicitasRaw } = await queryExplicitas;

    const resultado: Turma[] = [];
    if (turmasExplicitasRaw && turmasExplicitasRaw.length > 0) {
      const turmaIds = turmasExplicitasRaw.map(t => t.id);
      const { data: todosAlunosTurmas } = await supabase
        .from('turmas_alunos')
        .select('turma_id, aluno_id, alunos!inner(nome)')
        .in('turma_id', turmaIds);

      const alunosPorTurma = new Map<number, { aluno_id: number; nome: string }[]>();
      todosAlunosTurmas?.forEach((at: any) => {
        const lista = alunosPorTurma.get(at.turma_id) || [];
        lista.push({ aluno_id: at.aluno_id, nome: at.alunos.nome });
        alunosPorTurma.set(at.turma_id, lista);
      });

      for (const turma of turmasExplicitasRaw) {
        const alunosDaTurma = alunosPorTurma.get(turma.id) || [];
        resultado.push({
          id: turma.id,
          turma_explicita_id: turma.id,
          tipo: 'explicita',
          tipo_turma: turma.tipo,
          nome_turma: turma.nome,
          unidade_id: turma.unidade_id,
          unidade_nome: (turma.unidades as any)?.nome,
          professor_id: turma.professor_id,
          professor_nome: (turma.professores as any)?.nome || '',
          curso_id: turma.curso_id,
          curso_nome: (turma.cursos as any)?.nome,
          dia_semana: turma.dia_semana,
          horario_inicio: turma.horario_inicio,
          sala_id: turma.sala_id,
          sala_nome: (turma.salas as any)?.nome,
          capacidade_maxima: turma.capacidade_maxima || 0,
          total_alunos: alunosDaTurma.length,
          nomes_alunos: alunosDaTurma.map(a => a.nome),
          ids_alunos: alunosDaTurma.map(a => a.aluno_id),
        });
      }
    }
    return resultado;
  }

  async function carregarOpcoes() {
    // Preparar query de professores (condicional por unidade)
    const profsPromise = (async () => {
      if (unidadeAtual && unidadeAtual !== 'todos') {
        const { data: profUnidades } = await supabase
          .from('professores_unidades')
          .select('professor_id')
          .eq('unidade_id', unidadeAtual)
          .eq('emusys_ativo', true)
          .neq('validacao_status', 'ignorado');
        const profIds = profUnidades?.map(pu => pu.professor_id) || [];
        if (profIds.length > 0) {
          const { data } = await supabase
            .from('professores').select('id, nome')
            .in('id', profIds).eq('ativo', true).order('nome');
          return data || [];
        }
        return [];
      }
      const { data } = await supabase
        .from('professores').select('id, nome').eq('ativo', true).order('nome');
      return data || [];
    })();

    // Disparar TODAS as queries em paralelo
    let salasQuery = supabase
      .from('salas').select('id, nome, capacidade_maxima')
      .eq('ativo', true)
      .order('nome');

    if (unidadeAtual && unidadeAtual !== 'todos') {
      salasQuery = salasQuery.eq('unidade_id', unidadeAtual);
    }

    const [profs, cursosResult, tiposResult, salasResult, horariosResult] = await Promise.all([
      profsPromise,
      supabase.from('cursos').select('id, nome, is_projeto_banda').eq('ativo', true).order('nome'),
      supabase.from('tipos_matricula').select('id, nome').eq('ativo', true).order('id'),
      salasQuery,
      supabase.from('horarios').select('id, nome, hora_inicio').eq('ativo', true).order('hora_inicio'),
    ]);

    setProfessores(profs);
    if (cursosResult.data) setCursos(cursosResult.data);
    if (tiposResult.data) setTiposMatricula(tiposResult.data);
    if (salasResult.data) setSalas(salasResult.data);
    if (horariosResult.data) setHorarios(horariosResult.data);
  }

  // Filtrar alunos
  const alunosFiltrados = useMemo(() => {
    let resultado = [...alunos];

    if (filtros.nome) {
      const termo = filtros.nome.toLowerCase();
      const termoDigits = termo.replace(/\D/g, '');
      resultado = resultado.filter(a => {
        if (a.nome.toLowerCase().includes(termo)) return true;
        // Busca por telefone (qualquer contato)
        if (termoDigits.length >= 4) {
          const tels = [a.telefone, a.whatsapp, a.responsavel_telefone].filter(Boolean);
          return tels.some(t => t!.replace(/\D/g, '').includes(termoDigits));
        }
        return false;
      });
    }
    if (filtros.professor_id) {
      const profId = parseInt(filtros.professor_id);
      resultado = resultado.filter(a =>
        a.professor_atual_id === profId ||
        (a.professores_ids && a.professores_ids.includes(profId))
      );
      // Se o professor filtrado está no segundo curso (não no principal), promover o segundo curso para a row principal
      resultado = resultado.map(a => {
        if (a.professor_atual_id === profId) return a;
        const cursoMatch = a.outros_cursos?.find(oc => oc.professor_atual_id === profId);
        if (!cursoMatch) return a;
        // Trocar: segundo curso vira principal, principal vira segundo
        const outrosCursosSemMatch = [
          ...(a.outros_cursos?.filter(oc => oc.id !== cursoMatch.id) || []),
        ];
        return {
          ...a,
          professor_atual_id: cursoMatch.professor_atual_id,
          professor_nome: cursoMatch.professor_nome,
          curso_id: cursoMatch.curso_id,
          curso_nome: cursoMatch.curso_nome,
          modalidade: cursoMatch.modalidade,
          dia_aula: cursoMatch.dia_aula,
          horario_aula: cursoMatch.horario_aula,
          valor_parcela: cursoMatch.valor_parcela,
          status_pagamento: cursoMatch.status_pagamento,
          dia_vencimento: cursoMatch.dia_vencimento,
          total_alunos_turma: cursoMatch.total_alunos_turma,
          classificacao: cursoMatch.classificacao || a.classificacao,
          forma_pagamento_id: cursoMatch.forma_pagamento_id,
          forma_pagamento_nome: cursoMatch.forma_pagamento_nome,
          outros_cursos: outrosCursosSemMatch,
        };
      });
    }
    if (filtros.curso_id) {
      const cursoIdFiltro = parseInt(filtros.curso_id);
      resultado = resultado.filter(a =>
        a.curso_id === cursoIdFiltro ||
        (a.cursos_ids && a.cursos_ids.includes(cursoIdFiltro))
      );
    }
    if (filtros.dia_aula) {
      resultado = resultado.filter(a => a.dia_aula === filtros.dia_aula);
    }
    if (filtros.horario_aula) {
      resultado = resultado.filter(a => a.horario_aula?.startsWith(filtros.horario_aula));
    }
    if (filtros.status) {
      resultado = resultado.filter(a => a.status === filtros.status);
    }
    if (filtros.tipo_matricula_id) {
      const tipoId = parseInt(filtros.tipo_matricula_id);
      if (tipoId === 2) {
        // Segundo curso: excluir banda e coral (têm filtros próprios)
        const is2CursoReal = (r: any) =>
          r.is_segundo_curso &&
          !r.cursos?.nome?.toLowerCase().includes('banda') &&
          !r.cursos?.nome?.toLowerCase().includes('coral') &&
          r.cursos?.is_projeto_banda !== true;
        resultado = resultado.filter(a => is2CursoReal(a) || a.tipo_matricula_id === 2 || a.outros_cursos?.some((oc: any) => is2CursoReal(oc)));
      } else if (tipoId === 5) {
        // Matrícula em Banda: mostrar APENAS o registro da banda (sem curso principal)
        const cursosBandaIds = cursos.filter(c => c.is_projeto_banda).map(c => c.id);
        const isBandaAtiva = (r: any) => isMatriculaBandaAtivaOperacional(r, cursosBandaIds);
        resultado = resultado
          .filter(a =>
            isBandaAtiva(a) ||
            a.outros_cursos?.some(oc => isBandaAtiva(oc))
          )
          .map(a => {
            // Se o curso principal já é banda ativa, manter (sem outros cursos não-banda)
            if (isBandaAtiva(a)) {
              return {
                ...a,
                outros_cursos: a.outros_cursos?.filter(oc => isBandaAtiva(oc)) || [],
              };
            }

            // Senão, encontrar o registro de banda em outros_cursos e "promovê-lo"
            const registroBanda = a.outros_cursos?.find(oc => isBandaAtiva(oc));
            if (!registroBanda) return a;

            // Mostrar apenas a banda (sem o curso principal, apenas outras bandas se houver)
            const outrasBandas = a.outros_cursos?.filter(oc =>
              oc.id !== registroBanda.id && isBandaAtiva(oc)
            ) || [];

            return {
              ...registroBanda,
              outros_cursos: outrasBandas,
            };
          });
      } else {
        resultado = resultado.filter(a => a.tipo_matricula_id === tipoId);
      }
    }
    if (filtros.classificacao) {
      resultado = resultado.filter(a => a.classificacao === filtros.classificacao);
    }

    // Filtro por tamanho da turma
    if (filtros.turma_size) {
      resultado = resultado.filter(a => {
        const turma = turmas.find(t =>
          t.professor_id === a.professor_atual_id &&
          t.dia_semana === a.dia_aula &&
          t.horario_inicio === a.horario_aula
        );
        const totalNaTurma = turma?.total_alunos || 1;

        if (filtros.turma_size === '1') return totalNaTurma === 1;
        if (filtros.turma_size === '2') return totalNaTurma === 2;
        if (filtros.turma_size === '3+') return totalNaTurma >= 3;
        return true;
      });
    }

    // Filtro por tempo de permanência
    if (filtros.tempo_permanencia) {
      resultado = resultado.filter(a => {
        const meses = a.tempo_permanencia_meses || 0;
        switch (filtros.tempo_permanencia) {
          case 'novo': return meses <= 1;
          case 'menos-1': return meses >= 1 && meses < 12;
          case '1-2': return meses >= 12 && meses < 24;
          case '2-3': return meses >= 24 && meses < 36;
          case '3-4': return meses >= 36 && meses < 48;
          case '4-5': return meses >= 48 && meses < 60;
          case '5+': return meses >= 60;
          default: return true;
        }
      });
    }

    // Filtro por status de pagamento
    if (filtros.status_pagamento) {
      resultado = resultado.filter(a => {
        const statusAluno = a.status_pagamento || '-'; // null/vazio = sem sync financeiro
        if (filtros.status_pagamento === 'inadimplente') {
          return statusAluno === 'inadimplente' && String(a.status || '').toLowerCase() === 'ativo';
        }
        return statusAluno === filtros.status_pagamento;
      });
    }

    if (filtros.anamnese) {
      if (filtros.anamnese === 'preenchida') {
        resultado = resultado.filter(a => a.anamnese_preenchida === true);
      }

      if (filtros.anamnese === 'nao_preenchida') {
        resultado = resultado.filter(a => a.anamnese_preenchida !== true);
      }
    }

    if (filtros.temperamento) {
      const termoTemperamento = filtros.temperamento.toLowerCase();
      resultado = resultado.filter(a =>
        (a.temperamento_codinome || '').toLowerCase().includes(termoTemperamento)
      );
    }

    if (filtros.diagnostico) {
      const diagnosticoFiltro = filtros.diagnostico.toLowerCase();
      resultado = resultado.filter(a => {
        const diagnosticos = (a as Aluno & { anamnese_diagnosticos?: string[] }).anamnese_diagnosticos || [];
        if (diagnosticoFiltro === 'nao') {
          return diagnosticos.length === 0;
        }

        return diagnosticos.some(diagnostico => diagnostico.toLowerCase().includes(diagnosticoFiltro));
      });
    }

    // Filtro sem telefone
    if (filtros.sem_telefone) {
      resultado = resultado.filter(a => !a.telefone && !a.whatsapp && !a.responsavel_telefone);
    }

    return resultado;
  }, [alunos, filtros, turmas, cursos]);

  // Adicionar contagem de alunos na turma para cada aluno
  const alunosComTurma = useMemo(() => {
    return alunosFiltrados.map(aluno => {
      const turma = turmas.find(t =>
        t.professor_id === aluno.professor_atual_id &&
        t.dia_semana === aluno.dia_aula &&
        t.horario_inicio === aluno.horario_aula
      );
      return {
        ...aluno,
        total_alunos_turma: turma?.total_alunos || 1
      };
    });
  }, [alunosFiltrados, turmas]);

  // Editar turma explícita
  function handleEditarTurma(turma: Turma) {
    setTurmaParaEditar(turma);
    setModalNovaTurma(true);
  }

  // Adicionar aluno à turma
  function handleAdicionarAlunoTurma(turma: Turma) {
    setTurmaParaAdicionarAluno(turma);
  }

  // Excluir turma explícita
  async function handleExcluirTurma(turmaId: number) {
    try {
      // Excluir relacionamentos primeiro
      await supabase
        .from('turmas_alunos')
        .delete()
        .eq('turma_id', turmaId);

      // Excluir turma
      const { error } = await supabase
        .from('turmas_explicitas')
        .delete()
        .eq('id', turmaId);

      if (error) {
        console.error('Erro ao excluir turma:', error);
        alert('Erro ao excluir turma: ' + error.message);
        return;
      }

      // Recarregar dados
      carregarDados();
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao excluir turma. Tente novamente.');
    }
  }

  // Remover aluno de uma turma
  async function handleRemoverAlunoTurma(turma: Turma, alunoId: number, alunoNome: string) {
    try {
      // 1. Remover de turmas_alunos (se turma explícita)
      if (turma.turma_explicita_id) {
        await supabase
          .from('turmas_alunos')
          .delete()
          .eq('turma_id', turma.turma_explicita_id)
          .eq('aluno_id', alunoId);
      }

      // 2. Limpar dia/horário do aluno
      await supabase
        .from('alunos')
        .update({ dia_aula: null, horario_aula: null })
        .eq('id', alunoId);

      // 3. Registrar no histórico
      if (turma.turma_explicita_id) {
        await supabase
          .from('turmas_historico')
          .insert({
            turma_id: turma.turma_explicita_id,
            aluno_id: alunoId,
            acao: 'remover',
            turma_origem_id: turma.turma_explicita_id,
            turma_destino_id: null,
            metadata: {
              turma_info: `${turma.dia_semana} ${turma.horario_inicio}`,
              aluno_nome: alunoNome,
            },
          });
      }

      carregarDados();
    } catch (error) {
      console.error('Erro ao remover aluno da turma:', error);
      alert('Erro ao remover aluno da turma. Tente novamente.');
    }
  }

  function limparFiltros() {
    setFiltros({
      nome: '',
      professor_id: '',
      curso_id: '',
      dia_aula: '',
      horario_aula: '',
      status: '',
      tipo_matricula_id: '',
      classificacao: '',
      turma_size: '',
      tempo_permanencia: '',
      status_pagamento: '',
      anamnese: '',
      temperamento: '',
      diagnostico: '',
      sem_telefone: false,
    });
  }

  // Verificar se já existe aluno na turma ao salvar
  async function verificarTurmaAoSalvar(aluno: Aluno): Promise<boolean> {
    const turmaExistente = turmas.find(t =>
      t.professor_id === aluno.professor_atual_id &&
      t.dia_semana === aluno.dia_aula &&
      t.horario_inicio === aluno.horario_aula
    );

    if (turmaExistente && turmaExistente.total_alunos > 0) {
      setAlertaTurma({
        show: true,
        aluno,
        turmaExistente
      });
      return false;
    }
    return true;
  }

  // Abrir modal de detalhes da turma
  function handleAbrirModalTurma(professor_id: number, dia: string, horario: string) {
    // Buscar a turma na lista de turmas já carregadas
    const turmaEncontrada = turmas.find(t =>
      t.professor_id === professor_id &&
      t.dia_semana === dia &&
      t.horario_inicio === horario
    );

    if (turmaEncontrada) {
      // Abrir o modal diretamente sem mudar de aba
      setTurmaDetalheAbrir(turmaEncontrada);
    } else {
      toast.addToast('Turma não encontrada', 'error');
    }
  }

  // Componente Modal de Detalhes da Turma
  function ModalDetalhesTurmaGlobal() {
    const [modoEdicaoSala, setModoEdicaoSala] = useState(false);
    const [salasDisponiveis, setSalasDisponiveis] = useState<{ id: number, nome: string, capacidade_maxima: number }[]>([]);
    const [salaIdSelecionada, setSalaIdSelecionada] = useState<number | null>(turmaDetalheAbrir?.sala_id || null);
    const [salvando, setSalvando] = useState(false);
    const [carregandoSalas, setCarregandoSalas] = useState(false);

    useEffect(() => {
      if (modoEdicaoSala && turmaDetalheAbrir) {
        carregarSalasModal();
      }
    }, [modoEdicaoSala]);

    async function carregarSalasModal() {
      if (!turmaDetalheAbrir?.unidade_id) return;

      setCarregandoSalas(true);
      try {
        const { data, error } = await supabase
          .from('salas')
          .select('id, nome, capacidade_maxima')
          .eq('unidade_id', turmaDetalheAbrir.unidade_id)
          .eq('ativo', true)
          .order('nome');

        if (error) throw error;
        setSalasDisponiveis(data || []);
        setSalaIdSelecionada(turmaDetalheAbrir.sala_id || null);
      } catch (error) {
        console.error('Erro ao carregar salas:', error);
      } finally {
        setCarregandoSalas(false);
      }
    }

    async function handleVincularSala() {
      if (!turmaDetalheAbrir || !salaIdSelecionada) return;

      setSalvando(true);
      try {
        const salaSelecionada = salasDisponiveis.find(s => s.id === salaIdSelecionada);

        // Usar turma_explicita_id da view se disponível, senão buscar por match
        let turmaExplicitaId = turmaDetalheAbrir.turma_explicita_id || null;

        if (!turmaExplicitaId) {
          const { data: turmaExistente } = await supabase
            .from('turmas_explicitas')
            .select('id')
            .eq('unidade_id', turmaDetalheAbrir.unidade_id)
            .eq('professor_id', turmaDetalheAbrir.professor_id)
            .eq('dia_semana', turmaDetalheAbrir.dia_semana)
            .eq('horario_inicio', turmaDetalheAbrir.horario_inicio)
            .maybeSingle();

          turmaExplicitaId = turmaExistente?.id || null;
        }

        if (turmaExplicitaId) {
          // Atualizar turma existente
          const { error } = await supabase
            .from('turmas_explicitas')
            .update({
              sala_id: salaIdSelecionada,
              capacidade_maxima: salaSelecionada?.capacidade_maxima || 4,
              updated_at: new Date().toISOString()
            })
            .eq('id', turmaExplicitaId);

          if (error) throw error;
        } else {
          // Criar nova turma explícita
          const { error } = await supabase
            .from('turmas_explicitas')
            .insert({
              tipo: 'turma',
              nome: `${turmaDetalheAbrir.curso_nome} - ${turmaDetalheAbrir.professor_nome}`,
              professor_id: turmaDetalheAbrir.professor_id,
              curso_id: turmaDetalheAbrir.curso_id,
              dia_semana: turmaDetalheAbrir.dia_semana,
              horario_inicio: turmaDetalheAbrir.horario_inicio,
              sala_id: salaIdSelecionada,
              unidade_id: turmaDetalheAbrir.unidade_id,
              capacidade_maxima: salaSelecionada?.capacidade_maxima || 4,
              ativo: true
            });

          if (error) throw error;
        }

        // Fechar modal e recarregar dados
        setModoEdicaoSala(false);
        setTurmaDetalheAbrir(null);
        carregarDados();
        toast.addToast('Sala vinculada com sucesso!', 'success');
      } catch (error) {
        console.error('Erro ao vincular sala:', error);
        toast.addToast('Erro ao vincular sala', 'error');
      } finally {
        setSalvando(false);
      }
    }

    if (!turmaDetalheAbrir) return null;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-lg mx-4 shadow-2xl">
          <div className="p-6 border-b border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">
                  Turma: {turmaDetalheAbrir.dia_semana} {turmaDetalheAbrir.horario_inicio?.substring(0, 5)}
                </h2>
                <p className="text-sm text-slate-400">
                  {turmaDetalheAbrir.sala_nome || 'Sala'} • {turmaDetalheAbrir.curso_nome} • {turmaDetalheAbrir.professor_nome}
                </p>
              </div>
              <button
                onClick={() => setTurmaDetalheAbrir(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
          <div className="p-6">
            {/* Seção de Sala */}
            <div className="mb-6 p-4 bg-slate-700/30 rounded-lg border border-slate-600">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-slate-300 uppercase flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  SALA
                </span>
                {!modoEdicaoSala && (
                  <button
                    onClick={() => setModoEdicaoSala(true)}
                    className="text-xs text-violet-400 hover:text-violet-300 transition"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {!modoEdicaoSala ? (
                <div className="text-slate-300">
                  {turmaDetalheAbrir.sala_nome || (
                    <span className="text-slate-500 text-sm">
                      Não vinculada <span className="text-xs">(clique para vincular)</span>
                    </span>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {carregandoSalas ? (
                    <div className="text-sm text-slate-400">Carregando salas...</div>
                  ) : (
                    <>
                      <Select
                        value={salaIdSelecionada?.toString() || ''}
                        onValueChange={(v) => setSalaIdSelecionada(parseInt(v))}
                      >
                        <SelectTrigger className="bg-slate-800 border-slate-600">
                          <SelectValue placeholder="Selecione uma sala" />
                        </SelectTrigger>
                        <SelectContent>
                          {salasDisponiveis.map(sala => (
                            <SelectItem key={sala.id} value={sala.id.toString()}>
                              {sala.nome} (cap. {sala.capacidade_maxima})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setModoEdicaoSala(false);
                            setSalaIdSelecionada(turmaDetalheAbrir.sala_id || null);
                          }}
                          disabled={salvando}
                          className="flex-1 px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors border border-slate-600 rounded-lg"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleVincularSala}
                          disabled={!salaIdSelecionada || salvando}
                          className="flex-1 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
                        >
                          {salvando ? 'Salvando...' : 'Vincular Sala'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-slate-400">Capacidade:</span>
              <span className={`px-2 py-0.5 rounded text-xs ${turmaDetalheAbrir.total_alunos === 1
                ? 'bg-red-500/30 text-red-400 animate-pulse'
                : turmaDetalheAbrir.total_alunos === 2
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-emerald-500/20 text-emerald-400'
                }`}>
                {turmaDetalheAbrir.total_alunos === 1 && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                {turmaDetalheAbrir.total_alunos}/{turmaDetalheAbrir.capacidade_maxima || 4} {turmaDetalheAbrir.total_alunos === 1 ? 'aluno' : 'alunos'}
              </span>
            </div>

            <h3 className="text-sm font-semibold text-slate-400 uppercase mb-3">Alunos na Turma</h3>
            <div className="space-y-2">
              {turmaDetalheAbrir.nomes_alunos && turmaDetalheAbrir.nomes_alunos.length > 0 ? (
                turmaDetalheAbrir.nomes_alunos.map((nome, index) => (
                  <div key={index} className="flex items-center justify-between bg-slate-700/50 rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      {(() => {
                        const alunoId = turmaDetalheAbrir.ids_alunos?.[index];
                        const foto = alunoId ? alunos.find(a => a.id === alunoId)?.foto_url : null;
                        return foto ? (
                          <img src={foto} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-sm font-bold">
                            {nome.charAt(0)}
                          </div>
                        );
                      })()}
                      <div>
                        <p className="font-medium">{nome}</p>
                      </div>
                    </div>
                    {turmaDetalheAbrir.ids_alunos?.[index] && (
                      <button
                        onClick={() => {
                          if (confirm(`Remover ${nome} desta turma?`)) {
                            handleRemoverAlunoTurma(turmaDetalheAbrir, turmaDetalheAbrir.ids_alunos[index], nome);
                            setTurmaDetalheAbrir(prev => {
                              if (!prev) return prev;
                              const novosNomes = prev.nomes_alunos.filter((_, i) => i !== index);
                              const novosIds = prev.ids_alunos.filter((_, i) => i !== index);
                              return { ...prev, nomes_alunos: novosNomes, ids_alunos: novosIds, total_alunos: novosNomes.length };
                            });
                          }
                        }}
                        className="text-slate-500 hover:text-red-400 transition p-1"
                        title="Remover da turma"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-slate-500 text-center py-4">Nenhum aluno nesta turma</p>
              )}
            </div>

            <button
              onClick={() => {
                handleAdicionarAlunoTurma(turmaDetalheAbrir);
                setTurmaDetalheAbrir(null);
              }}
              className="w-full mt-4 bg-purple-600 hover:bg-purple-500 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Adicionar Aluno à Turma
            </button>
          </div>
        </div>
      </div>
    );
  }

  const mesFormatado = format(new Date(), 'MMM/yyyy', { locale: ptBR });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtro de período */}
      <PageFilterBar>
        <div className="flex flex-wrap items-center justify-end gap-3 w-full">
          <CompetenciaFilter
            filtro={competenciaFiltro}
            range={competenciaRange}
            anosDisponiveis={anosDisponiveis}
            onTipoChange={setCompetenciaTipo}
            onAnoChange={setCompetenciaAno}
            onMesChange={setCompetenciaMes}
            onTrimestreChange={setCompetenciaTrimestre}
            onSemestreChange={setCompetenciaSemestre}
            onDataInicioChange={setCompetenciaDataInicio}
            onDataFimChange={setCompetenciaDataFim}
          />

          <div
            className={`min-h-8 px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 max-w-full ${competenciaBadgeClasses}`}
            title={competenciaMensal.tooltip}
          >
            {competenciaMensal.bloqueiaEscrita ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            <span className="min-w-0 truncate">{competenciaMensal.loading ? 'Validando competência' : competenciaMensal.badgeLabel}</span>
          </div>

          {unidadeAtual && unidadeAtual !== 'todos' ? (
            confirmRecalcular && !recalcBloqueado ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-lg">
                <span className="text-xs text-slate-300">
                  Recalcular {competenciaFiltro.mes}/{competenciaFiltro.ano}?
                </span>
                <button
                  onClick={confirmarRecalculoDadosMensais}
                  disabled={recalculando}
                  className="h-6 px-2 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-600 rounded text-xs text-white font-medium transition"
                >
                  {recalculando ? 'Recalculando...' : 'Sim'}
                </button>
                <button
                  onClick={() => setConfirmRecalcular(false)}
                  className="h-6 px-2 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-400 transition"
                >
                  Não
                </button>
              </div>
            ) : (
              <Tooltip
                side="top"
                content={
                  recalcBloqueado
                    ? COMPETENCIA_FECHADA_MESSAGE
                    : 'Recalcular snapshot de dados mensais para a unidade selecionada'
                }
              >
                <button
                  onClick={solicitarRecalculoDadosMensais}
                  className={`h-8 px-3 rounded-lg text-xs transition flex items-center gap-1.5 whitespace-nowrap ${
                    recalcBloqueado
                      ? 'bg-slate-800/70 border border-slate-700 text-slate-500 cursor-not-allowed'
                      : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                  }`}
                  aria-disabled={recalcBloqueado}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Recalcular Dados Mensais
                </button>
              </Tooltip>
            )
          ) : null}
        </div>
      </PageFilterBar>

      {/* Header actions */}
      <div className="flex flex-wrap items-center justify-end gap-4">
        {/* Badge de Alerta - Alunos sem lançamento de pagamento */}
        {alertaPagamentos.mostrar && (
          <button
            onClick={() => {
              setTabAtiva('lista');
              setFiltros(prev => ({ ...prev, status_pagamento: '-' }));
            }}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500/20 border border-orange-500/50 rounded-lg hover:bg-orange-500/30 transition-colors"
          >
            <AlertTriangle className="w-5 h-5 text-orange-400" />
            <span className="text-orange-300 font-medium">
              {alertaPagamentos.quantidade} aluno{alertaPagamentos.quantidade > 1 ? 's' : ''} com status financeiro em aberto
            </span>
          </button>
        )}
      </div>

      <div className="inline-flex max-w-full items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200">
        <BarChart3 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Dados operacionais — carteira ao vivo</span>
      </div>

      {/* KPI Cards */}
      <section data-tour="alunos-kpis" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
        <KPICard
          title="Matrículas Ativas"
          tooltip="Total de matriculas ativas incluindo primeiro curso, segundo curso, banda e coral."
          value={kpis.totalMatriculasAtivas}
          subvalue={`${kpis.matriculasSegundoCurso || 0} 2º curso | ${kpis.matriculasBanda || 0} banda | ${kpis.matriculasCoral || 0} coral`}
          icon={BookOpen}
          variant="emerald"
          onClick={() => { fetchMatriculasAtivasDetalhe(); setModalMatriculasAtivas(true); }}
        />
        <KPICard
          title="Alunos Ativos"
          tooltip="Alunos unicos ativos (sem contar segundo curso). Representa pessoas fisicas frequentando."
          value={kpis.totalAtivos}
          subvalue="na unidade"
          icon={Users}
          variant="cyan"
        />
        <KPICard
          title="Pagantes"
          tooltip="Alunos com tipo de matricula que conta como pagante (exclui bolsa total e banda gratuita)."
          value={kpis.totalPagantes}
          subvalue={`${kpis.totalBolsistas} bolsistas`}
          icon={DollarSign}
          variant="amber"
        />
        <KPICard
          title="Média/Turma"
          tooltip="Media de alunos por turma. Calculado pela divisao do total de alunos pelo numero de turmas."
          value={kpis.mediaAlunosTurma.toFixed(2)}
          subvalue="alunos/turma"
          icon={BarChart3}
          variant="cyan"
        />
        <KPICard
          title="Ticket Médio"
          tooltip="Valor medio da mensalidade. Considera apenas alunos com tipo de matricula que entra no calculo de ticket medio."
          value={`R$ ${kpis.ticketMedio}`}
          subvalue="mensal"
          icon={DollarSign}
          variant="green"
        />
        <KPICard
          title="T. Permanência"
          tooltip="Tempo medio de permanencia dos alunos ativos em meses. Clique para ver o detalhamento por faixa."
          value={kpis.ltvMedio}
          subvalue="meses · clique para detalhar"
          icon={Clock}
          variant="green"
          onClick={() => setModalPermanenciaOpen(true)}
        />
        <div className={`bg-red-900/30 border border-red-500/50 rounded-xl p-4 ${kpis.turmasSozinhos > 0 ? 'animate-pulse' : ''}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-red-400 text-xs font-medium uppercase">Sozinhos</span>
            <div className="w-8 h-8 bg-red-500/20 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-red-400">{kpis.turmasSozinhos}</p>
          <p className="text-xs text-red-300 mt-1">
            {kpis.totalTurmas > 0
              ? `${Math.round((kpis.turmasSozinhos / kpis.totalTurmas) * 100)}% das turmas com 1 aluno`
              : 'turmas com 1 aluno'
            }
          </p>
        </div>
      </section>

      {/* Abas */}
      <PageTabs
        tabs={alunosTabs}
        activeTab={tabAtiva}
        onTabChange={setTabAtiva}
        data-tour="alunos-tabs"
      />

      {/* Conteúdo das Tabs */}
      {tabAtiva === 'automacao' ? (
        <TabAutomacao unidadeAtual={unidadeAtual} />
      ) : tabAtiva === 'historico' ? (
        <TabHistoricoLTV unidadeAtual={unidadeAtual} />
      ) : (
        <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          {tabAtiva === 'lista' && (
            <TabelaAlunos
              alunos={alunosComTurma}
              todosAlunos={alunos}
              filtros={filtros}
              setFiltros={setFiltros}
              limparFiltros={limparFiltros}
              professores={professores}
              cursos={cursos}
              tiposMatricula={tiposMatricula}
              salas={salas}
              horarios={horarios}
              totalTurmas={kpis.totalTurmas}
              onNovoAluno={() => setModalNovoAluno(true)}
              onRecarregar={carregarDados}
              verificarTurmaAoSalvar={verificarTurmaAoSalvar}
              onAbrirModalTurma={handleAbrirModalTurma}
            />
          )}

          {tabAtiva === 'conciliacao' && (
            <div className="p-4">
              <ConciliacaoMatriculas unidadeId={unidadeAtual === 'todos' ? null : unidadeAtual} />
            </div>
          )}

          {tabAtiva === 'turmas' && (
            <GestaoTurmas
              turmas={turmas}
              professores={professores}
              salas={salas}
              onRecarregar={carregarDados}
              onEditarTurma={handleEditarTurma}
              onExcluirTurma={handleExcluirTurma}
              onAdicionarAlunoTurma={handleAdicionarAlunoTurma}
              onRemoverAlunoTurma={handleRemoverAlunoTurma}
              onNovaTurma={() => setModalNovaTurma(true)}
            />
          )}

          {tabAtiva === 'grade' && (
            <GradeHoraria
              unidadeId={unidadeAtual === 'todos' ? undefined : unidadeAtual}
              onEditarTurma={(turmaGrade) => {
                // Converter TurmaGrade para Turma
                const turma: Turma = {
                  id: turmaGrade.id,
                  unidade_id: turmaGrade.unidade_id,
                  unidade_nome: turmaGrade.unidade_nome,
                  professor_id: turmaGrade.professor_id,
                  professor_nome: turmaGrade.professor_nome,
                  curso_id: turmaGrade.curso_id || undefined,
                  curso_nome: turmaGrade.curso_nome,
                  dia_semana: turmaGrade.dia_semana,
                  horario_inicio: turmaGrade.horario_inicio,
                  sala_id: turmaGrade.sala_id || undefined,
                  sala_nome: turmaGrade.sala_nome,
                  capacidade_maxima: turmaGrade.capacidade_maxima,
                  total_alunos: turmaGrade.num_alunos,
                  nomes_alunos: [],
                  ids_alunos: turmaGrade.alunos || [],
                  tipo: 'explicita',
                };
                handleEditarTurma(turma);
              }}
            />
          )}

          {tabAtiva === 'distribuicao' && (
            <DistribuicaoAlunos
              alunos={alunos}
              turmas={turmas}
              professores={professores}
              cursos={cursos}
            />
          )}

          {tabAtiva === 'importar' && (
            <ImportarAlunos onRecarregar={carregarDados} />
          )}
        </section>
      )}
 
      {/* Modal Novo Aluno */}
      {modalNovoAluno && (
        <ModalNovoAluno
          onClose={() => setModalNovoAluno(false)}
          onSalvar={carregarDados}
          professores={professores}
          cursos={cursos}
          tiposMatricula={tiposMatricula}
          salas={salas}
          horarios={horarios}
          unidadeAtual={unidadeAtual}
        />
      )}

      {/* Alerta de Turma */}
      {alertaTurma?.show && (
        <AlertaTurma
          aluno={alertaTurma.aluno}
          turmaExistente={alertaTurma.turmaExistente}
          onConfirmar={() => {
            setAlertaTurma(null);
            carregarDados();
          }}
          onCancelar={() => setAlertaTurma(null)}
        />
      )}

      {/* Modal Nova Turma */}
      {modalNovaTurma && (
        <ModalNovaTurma
          onClose={() => setModalNovaTurma(false)}
          onSalvar={carregarDados}
          professores={professores}
          cursos={cursos}
          salas={salas}
          horarios={horarios}
          unidadeAtual={unidadeAtual}
          alunosDisponiveis={alunos}
        />
      )}

      {/* Modal Adicionar Aluno à Turma */}
      {turmaParaAdicionarAluno && (
        <ModalAdicionarAlunoTurma
          turma={turmaParaAdicionarAluno}
          alunosDisponiveis={alunos}
          turmasExistentes={turmas}
          onClose={() => setTurmaParaAdicionarAluno(null)}
          onSalvar={carregarDados}
          toast={toast}
        />
      )}

      {/* Modal Detalhes da Turma - Renderizado globalmente */}
      {turmaDetalheAbrir && <ModalDetalhesTurmaGlobal />}

      {/* Toast Container */}
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />

      {/* Modal de detalhamento de permanência */}
      <ModalPermanenciaDetalhe
        open={modalPermanenciaOpen}
        onOpenChange={setModalPermanenciaOpen}
        unidadeId={unidadeAtual || 'todos'}
        mediaAtual={kpis.ltvMedio}
      />

      {/* Modal Matrículas Ativas */}
      <ModalDetalheKPI
        open={modalMatriculasAtivas}
        onClose={() => setModalMatriculasAtivas(false)}
        titulo={`Matrículas Ativas (${competenciaRange.label})`}
        descricao="Cada aluno conta 1x; banda, 2º curso e coral somam como vínculos extras — o total bate com o card."
        dados={dadosModalMatriculasAtivas}
        colunas={[
          { key: 'nome', label: 'Aluno' },
          { key: 'unidade', label: 'Unidade', render: (v: string) => <BadgeUnidade nome={v} /> },
          { key: 'curso', label: 'Curso', render: (v: string) => <TextoCurso nome={v} /> },
          { key: 'tipo', label: 'Tipo', render: (v: string) => (
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full whitespace-nowrap',
              v === 'Banda' && 'bg-amber-500/20 text-amber-400',
              v === 'Coral' && 'bg-pink-500/20 text-pink-400',
              v === '2º Curso' && 'bg-violet-500/20 text-violet-400',
              v === 'Aluno' && 'bg-cyan-500/20 text-cyan-400',
            )}>{v}</span>
          )},
          { key: 'status', label: 'Status', render: (v: string) => (
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full',
              v === 'Ativo' && 'bg-emerald-500/20 text-emerald-400',
              v === 'Trancado' && 'bg-slate-500/20 text-slate-400',
            )}>{v}</span>
          )},
          { key: 'data_matricula', label: 'Data Matrícula' },
          { key: 'valor', label: 'Valor', render: (v: string) => <ValorParcela valor={v} /> },
        ]}
        carregando={carregandoModalMatriculas}
        resumo={(() => {
          const total = dadosModalMatriculasAtivas.length;
          const alunosCount = dadosModalMatriculasAtivas.filter(d => d.tipo === 'Aluno').length;
          const banda = dadosModalMatriculasAtivas.filter(d => d.tipo === 'Banda').length;
          const segundo = dadosModalMatriculasAtivas.filter(d => d.tipo === '2º Curso').length;
          const coral = dadosModalMatriculasAtivas.filter(d => d.tipo === 'Coral').length;
          return [
            { label: 'Total', valor: total, icone: <BookOpen size={14} />, cor: 'text-emerald-400', destaque: true },
            { label: 'Alunos', valor: alunosCount, icone: <Users size={14} />, cor: 'text-cyan-400', filtroKey: 'tipo', filtroValor: 'Aluno' },
            { label: 'Banda', valor: banda, icone: <Users size={14} />, cor: 'text-amber-400', filtroKey: 'tipo', filtroValor: 'Banda' },
            { label: '2º Curso', valor: segundo, icone: <GraduationCap size={14} />, cor: 'text-violet-400', filtroKey: 'tipo', filtroValor: '2º Curso' },
            { label: 'Coral', valor: coral, icone: <Users size={14} />, cor: 'text-pink-400', filtroKey: 'tipo', filtroValor: 'Coral' },
          ];
        })()}
        distribuicao={unidadeAtual === 'todos' ? {
          titulo: 'Por Unidade',
          dados: (() => {
            const contagem: Record<string, number> = {};
            dadosModalMatriculasAtivas.forEach(d => { contagem[d.unidade] = (contagem[d.unidade] || 0) + 1; });
            const cores: Record<string, string> = { 'Recreio': 'bg-violet-500/70', 'Barra': 'bg-amber-500/70', 'Campo Grande': 'bg-emerald-500/70' };
            return Object.entries(contagem)
              .sort((a, b) => b[1] - a[1])
              .map(([label, valor]) => ({ label, valor, cor: cores[label] || 'bg-slate-500/70' }));
          })(),
        } : undefined}
      />
    </div>
  );
}
