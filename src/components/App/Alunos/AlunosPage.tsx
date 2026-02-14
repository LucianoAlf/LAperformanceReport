import { useState, useEffect, useMemo } from 'react';
import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { ptBR } from 'date-fns/locale';
import { 
  Users, DollarSign, BarChart3, Clock, Layers, AlertTriangle,
  Plus, Search, RotateCcw, Edit2, Trash2, Check, X, History,
  Calendar, Upload
} from 'lucide-react';
import { KPICard } from '@/components/ui/KPICard';
import { PageTabs, type PageTab } from '@/components/ui/page-tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TabelaAlunos } from './TabelaAlunos';
import { GestaoTurmas } from './GestaoTurmas';
import { DistribuicaoAlunos } from './DistribuicaoAlunos';
import { ImportarAlunos } from './ImportarAlunos';
import { ModalNovoAluno } from './ModalNovoAluno';
import { ModalNovaTurma } from './ModalNovaTurma';
import { ModalAdicionarAlunoTurma } from './ModalAdicionarAlunoTurma';
import { AlertaTurma } from './AlertaTurma';
import { GradeHoraria } from '../Turmas/GradeHoraria';
import { ToastContainer } from '@/components/ui/toast';
import { useToast } from '@/hooks/useToast';
import { PageTour, TourHelpButton } from '@/components/Onboarding';
import { alunosTourSteps } from '@/components/Onboarding/tours';

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
  modalidade?: string;
  dia_aula: string | null;
  horario_aula: string | null;
  sala_nome?: string;
  valor_parcela: number | null;
  tempo_permanencia_meses: number | null;
  status: string;
  status_pagamento?: string;
  dia_vencimento?: number;
  tipo_matricula_id: number | null;
  tipo_matricula_nome?: string;
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
  // Campos calculados para agrupamento
  cursos_ids?: number[]; // IDs de todos os cursos do aluno
  outros_cursos?: Aluno[]; // Outros registros do mesmo aluno (segundo curso)
  valor_total?: number; // Soma de todos os valores de parcela
  // Health Score - percepção do professor
  health_score?: 'verde' | 'amarelo' | 'vermelho' | null;
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
  totalPagantes: number;
  totalBolsistas: number;
  mediaAlunosTurma: number;
  ticketMedio: number;
  ltvMedio: number;
  totalTurmas: number;
  turmasSozinhos: number;
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
}

type TabAtiva = 'lista' | 'turmas' | 'grade' | 'distribuicao' | 'importar';

const alunosTabs: PageTab<TabAtiva>[] = [
  { id: 'lista', label: 'Lista de Alunos', shortLabel: 'Lista', icon: Users },
  { id: 'turmas', label: 'Gestão de Turmas', shortLabel: 'Turmas', icon: Calendar },
  { id: 'grade', label: 'Grade Horária', shortLabel: 'Grade', icon: Clock },
  { id: 'distribuicao', label: 'Distribuição', shortLabel: 'Distrib.', icon: BarChart3 },
  { id: 'importar', label: 'Importar Alunos', shortLabel: 'Importar', icon: Upload, disabled: true, disabledTitle: 'Em breve — funcionalidade em desenvolvimento' },
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
  
  // Estados principais
  const [tabAtiva, setTabAtiva] = useState<TabAtiva>('lista');
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [kpis, setKpis] = useState<KPIsAlunos>({
    totalAtivos: 0,
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
    status_pagamento: ''
  });
  
  // Estados de opções para selects
  const [professores, setProfessores] = useState<{id: number, nome: string}[]>([]);
  const [cursos, setCursos] = useState<{id: number, nome: string}[]>([]);
  const [tiposMatricula, setTiposMatricula] = useState<{id: number, nome: string}[]>([]);
  const [salas, setSalas] = useState<{id: number, nome: string, capacidade_maxima: number}[]>([]);
  const [horarios, setHorarios] = useState<{id: number, nome: string, hora_inicio: string}[]>([]);
  
  // Estados de UI
  const [loading, setLoading] = useState(true);
  const [modalNovoAluno, setModalNovoAluno] = useState(false);

  // Calcular alunos sem lançamento de pagamento (após dia 15)
  const alertaPagamentos = useMemo(() => {
    const hoje = new Date();
    const diaAtual = hoje.getDate();
    const mostrarAlerta = diaAtual >= 15;
    
    const alunosSemLancamento = alunos.filter(a => 
      a.status === 'Ativo' && 
      (!a.status_pagamento || a.status_pagamento === '-' || a.status_pagamento === null)
    );
    
    return {
      mostrar: mostrarAlerta && alunosSemLancamento.length > 0,
      quantidade: alunosSemLancamento.length,
      diaAtual
    };
  }, [alunos]);
  const [modalNovaTurma, setModalNovaTurma] = useState(false);
  const [turmaParaEditar, setTurmaParaEditar] = useState<Turma | null>(null);
  const [turmaParaAdicionarAluno, setTurmaParaAdicionarAluno] = useState<Turma | null>(null);
  const [alertaTurma, setAlertaTurma] = useState<{show: boolean, aluno?: Aluno, turmaExistente?: Turma} | null>(null);
  const [turmaDetalheAbrir, setTurmaDetalheAbrir] = useState<Turma | null>(null);
  
  // Carregar dados iniciais
  useEffect(() => {
    carregarDados();
  }, [unidadeAtual]);

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
    await Promise.all([
      carregarAlunos(),
      carregarTurmas(),
      carregarOpcoes(),
      carregarKPIs()
    ]);
    setLoading(false);
  }

  async function carregarAlunos() {
    // Query principal dos alunos
    let query = supabase
      .from('alunos')
      .select(`
        id, nome, classificacao, idade_atual, professor_atual_id, curso_id, modalidade,
        dia_aula, horario_aula, valor_parcela, tempo_permanencia_meses,
        status, status_pagamento, dia_vencimento, tipo_matricula_id, unidade_id, data_matricula,
        is_segundo_curso, data_nascimento,
        professores:professor_atual_id(nome),
        cursos:curso_id(nome),
        tipos_matricula:tipo_matricula_id(nome),
        unidades:unidade_id(codigo)
      `)
      .order('nome');
    
    // Query de turmas implícitas (para enriquecer dados)
    let turmasQuery = supabase
      .from('vw_turmas_implicitas')
      .select('id, unidade_id, professor_id, dia_semana, horario_inicio, total_alunos, nomes_alunos');

    // Filtrar por unidade apenas se não for consolidado
    if (unidadeAtual && unidadeAtual !== 'todos') {
      query = query.eq('unidade_id', unidadeAtual);
      turmasQuery = turmasQuery.eq('unidade_id', unidadeAtual);
    }
    
    // Disparar alunos + turmas em paralelo
    const [alunosResult, turmasResult] = await Promise.all([
      query,
      turmasQuery,
    ]);

    const { data, error } = alunosResult;

    if (!error && data) {
      const turmasMap = new Map(turmasResult.data?.map(t => [
        `${t.unidade_id}-${t.professor_id}-${t.dia_semana}-${t.horario_inicio}`,
        t
      ]) || []);

      // Buscar anotações PENDENTES em paralelo (agora que temos os IDs)
      const alunoIds = data.map((a: any) => a.id);
      const { data: anotacoesData } = await supabase
        .from('anotacoes_alunos')
        .select('aluno_id, texto, categoria, created_at')
        .in('aluno_id', alunoIds)
        .eq('resolvido', false)
        .order('created_at', { ascending: false });
      
      // Criar mapa de anotações PENDENTES por aluno (contagem + últimas anotações)
      const anotacoesMap = new Map<number, { total: number; ultimas: { texto: string; categoria: string }[] }>();
      anotacoesData?.forEach(a => {
        const atual = anotacoesMap.get(a.aluno_id) || { total: 0, ultimas: [] };
        atual.total += 1;
        if (atual.ultimas.length < 3) {
          atual.ultimas.push({ texto: a.texto, categoria: a.categoria });
        }
        anotacoesMap.set(a.aluno_id, atual);
      });

      const alunosFormatados = data.map((a: any) => {
        const turmaKey = `${a.unidade_id}-${a.professor_atual_id}-${a.dia_aula}-${a.horario_aula}`;
        const turmaInfo = turmasMap.get(turmaKey);
        
        return {
          ...a,
          professor_nome: a.professores?.nome || '',
          curso_nome: a.cursos?.nome || '',
          tipo_matricula_nome: a.tipos_matricula?.nome || '',
          unidade_codigo: a.unidades?.codigo || '',
          total_alunos_turma: turmaInfo?.total_alunos || 1,
          turma_id: turmaInfo?.id,
          nomes_alunos_turma: turmaInfo?.nomes_alunos || [],
          total_anotacoes: anotacoesMap.get(a.id)?.total || 0,
          ultimas_anotacoes: anotacoesMap.get(a.id)?.ultimas || []
        };
      });

      // Agrupar alunos com mesmo nome e data_nascimento (segundo curso)
      // Chave: nome + data_nascimento + unidade_id
      const alunosAgrupados = new Map<string, Aluno[]>();
      alunosFormatados.forEach((aluno: Aluno) => {
        const chave = `${aluno.nome?.toLowerCase().trim()}-${aluno.data_nascimento || ''}-${aluno.unidade_id}`;
        const grupo = alunosAgrupados.get(chave) || [];
        grupo.push(aluno);
        alunosAgrupados.set(chave, grupo);
      });

      // Processar grupos: aluno principal + outros_cursos
      const alunosComSegundoCurso: Aluno[] = [];
      alunosAgrupados.forEach((grupo) => {
        if (grupo.length === 1) {
          // Aluno sem segundo curso
          alunosComSegundoCurso.push(grupo[0]);
        } else {
          // Aluno com múltiplos cursos - ordenar por is_segundo_curso (principal primeiro)
          const ordenado = grupo.sort((a, b) => {
            if (a.is_segundo_curso && !b.is_segundo_curso) return 1;
            if (!a.is_segundo_curso && b.is_segundo_curso) return -1;
            return 0;
          });
          
          const principal = ordenado[0];
          const outrosCursos = ordenado.slice(1);
          
          // Calcular valor total (soma de todos os cursos)
          const valorTotal = grupo.reduce((acc, a) => acc + (a.valor_parcela || 0), 0);
          
          alunosComSegundoCurso.push({
            ...principal,
            outros_cursos: outrosCursos,
            valor_total: valorTotal,
            cursos_ids: grupo.map(a => a.curso_id).filter(Boolean) as number[],
          });
        }
      });

      // Ordenar por nome
      alunosComSegundoCurso.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
      
      setAlunos(alunosComSegundoCurso);
    }
  }

  async function carregarTurmas() {
    // Carregar turmas implícitas + explícitas em PARALELO
    let queryImplicitas = supabase
      .from('vw_turmas_implicitas')
      .select('*');
    
    let queryExplicitas = supabase
      .from('turmas_explicitas')
      .select(`
        id, tipo, nome, professor_id, curso_id, dia_semana, horario_inicio,
        sala_id, unidade_id, capacidade_maxima,
        professores!inner(nome), cursos(nome), salas(nome), unidades!inner(nome)
      `)
      .eq('ativo', true);
    
    if (unidadeAtual && unidadeAtual !== 'todos') {
      queryImplicitas = queryImplicitas.eq('unidade_id', unidadeAtual);
      queryExplicitas = queryExplicitas.eq('unidade_id', unidadeAtual);
    }
    
    // Disparar ambas em paralelo
    const [implicitasResult, explicitasResult] = await Promise.all([
      queryImplicitas,
      queryExplicitas,
    ]);

    const turmasImplicitas = implicitasResult.data;
    const turmasExplicitasRaw = explicitasResult.data;

    // Buscar TODOS os alunos de turmas explícitas em UMA ÚNICA query (elimina N+1)
    const turmasExplicitas: Turma[] = [];
    if (turmasExplicitasRaw && turmasExplicitasRaw.length > 0) {
      const turmaIds = turmasExplicitasRaw.map(t => t.id);
      const { data: todosAlunosTurmas } = await supabase
        .from('turmas_alunos')
        .select('turma_id, aluno_id, alunos!inner(nome)')
        .in('turma_id', turmaIds);

      // Agrupar alunos por turma_id
      const alunosPorTurma = new Map<number, { aluno_id: number; nome: string }[]>();
      todosAlunosTurmas?.forEach((at: any) => {
        const lista = alunosPorTurma.get(at.turma_id) || [];
        lista.push({ aluno_id: at.aluno_id, nome: at.alunos.nome });
        alunosPorTurma.set(at.turma_id, lista);
      });

      for (const turma of turmasExplicitasRaw) {
        const alunosDaTurma = alunosPorTurma.get(turma.id) || [];
        turmasExplicitas.push({
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

    // Marcar turmas implícitas (agora já trazem sala_id/sala_nome/turma_explicita_id da view)
    const turmasImplicitasMarcadas = (turmasImplicitas || []).map(t => ({
      ...t,
      tipo: 'implicita' as const,
    }));

    // IDs de turmas explícitas já vinculadas via view implícita (evitar duplicação)
    const idsExplicitasJaVinculadas = new Set(
      turmasImplicitasMarcadas
        .filter(t => t.turma_explicita_id)
        .map(t => t.turma_explicita_id)
    );

    // Filtrar turmas explícitas que NÃO já aparecem nas implícitas (ex: bandas sem alunos implícitos)
    const turmasExplicitasFiltradas = turmasExplicitas.filter(
      t => !idsExplicitasJaVinculadas.has(t.turma_explicita_id)
    );

    // Combinar turmas implícitas e explícitas (sem duplicação)
    const todasTurmas = [...turmasImplicitasMarcadas, ...turmasExplicitasFiltradas];
    setTurmas(todasTurmas);
  }

  async function carregarOpcoes() {
    // Preparar query de professores (condicional por unidade)
    const profsPromise = (async () => {
      if (unidadeAtual && unidadeAtual !== 'todos') {
        const { data: profUnidades } = await supabase
          .from('professores_unidades')
          .select('professor_id')
          .eq('unidade_id', unidadeAtual);
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
    const [profs, cursosResult, tiposResult, salasResult, horariosResult] = await Promise.all([
      profsPromise,
      supabase.from('cursos').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('tipos_matricula').select('id, nome').eq('ativo', true).order('id'),
      supabase.from('salas').select('id, nome, capacidade_maxima')
        .eq('unidade_id', unidadeAtual).eq('ativo', true).order('nome'),
      supabase.from('horarios').select('id, nome, hora_inicio').eq('ativo', true).order('hora_inicio'),
    ]);

    setProfessores(profs);
    if (cursosResult.data) setCursos(cursosResult.data);
    if (tiposResult.data) setTiposMatricula(tiposResult.data);
    if (salasResult.data) setSalas(salasResult.data);
    if (horariosResult.data) setHorarios(horariosResult.data);
  }

  async function carregarKPIs() {
    // Preparar queries (aplicar filtro de unidade a cada uma)
    let qAtivos = supabase.from('alunos')
      .select('*', { count: 'exact', head: true })
      .in('status', ['ativo', 'trancado'])
      .or('is_segundo_curso.is.null,is_segundo_curso.eq.false');

    let qPagantes = supabase.from('alunos')
      .select('id, tipos_matricula!inner(conta_como_pagante)')
      .in('status', ['ativo', 'trancado'])
      .eq('tipos_matricula.conta_como_pagante', true)
      .or('is_segundo_curso.is.null,is_segundo_curso.eq.false');

    let qBolsistas = supabase.from('alunos')
      .select('id, tipos_matricula!inner(codigo)')
      .in('status', ['ativo', 'trancado'])
      .in('tipos_matricula.codigo', ['BOLSISTA_INT', 'BOLSISTA_PARC'])
      .or('is_segundo_curso.is.null,is_segundo_curso.eq.false');

    let qTicket = supabase.from('alunos')
      .select('nome, data_nascimento, unidade_id, valor_parcela, tipos_matricula!inner(entra_ticket_medio)')
      .eq('status', 'ativo')
      .eq('tipos_matricula.entra_ticket_medio', true)
      .not('valor_parcela', 'is', null)
      .neq('status_pagamento', 'sem_parcela');

    let qTurmas = supabase.from('vw_turmas_implicitas').select('total_alunos');

    if (unidadeAtual && unidadeAtual !== 'todos') {
      qAtivos = qAtivos.eq('unidade_id', unidadeAtual);
      qPagantes = qPagantes.eq('unidade_id', unidadeAtual);
      qBolsistas = qBolsistas.eq('unidade_id', unidadeAtual);
      qTicket = qTicket.eq('unidade_id', unidadeAtual);
      qTurmas = qTurmas.eq('unidade_id', unidadeAtual);
    }

    // Disparar TODAS as 6 queries em PARALELO (de ~6 roundtrips para 1)
    const [ativosR, pagantesR, bolsistasR, ticketR, permR, turmasR] = await Promise.all([
      qAtivos,
      qPagantes,
      qBolsistas,
      qTicket,
      supabase.rpc('get_tempo_permanencia', {
        p_unidade_id: unidadeAtual && unidadeAtual !== 'todos' ? unidadeAtual : null,
      }),
      qTurmas,
    ]);

    const totalAtivos = ativosR.count || 0;
    const totalPagantes = pagantesR.data?.length || 0;
    const totalBolsistas = bolsistasR.data?.length || 0;

    // Ticket médio — agrupar por aluno único e somar valores
    const alunosUnicos = new Map<string, number>();
    ticketR.data?.forEach((a: any) => {
      const chave = `${a.nome?.toLowerCase().trim()}-${a.data_nascimento || ''}-${a.unidade_id}`;
      const valorAtual = alunosUnicos.get(chave) || 0;
      alunosUnicos.set(chave, valorAtual + (a.valor_parcela || 0));
    });
    const valoresUnicos = Array.from(alunosUnicos.values());
    const ticketMedio = valoresUnicos.length > 0
      ? valoresUnicos.reduce((sum, v) => sum + v, 0) / valoresUnicos.length
      : 0;

    // LTV médio — baseado em evasões (regra: ≥4 meses, excluir bolsistas/banda/2º curso)
    let ltvMedio = 0;
    if (permR.data && permR.data.length > 0) {
      const comDados = permR.data.filter((p: any) => Number(p.tempo_permanencia_medio) > 0);
      if (comDados.length > 0) {
        ltvMedio = comDados.reduce((sum: number, p: any) => sum + Number(p.tempo_permanencia_medio), 0) / comDados.length;
      }
    }

    // Turmas
    const turmasData = turmasR.data;
    const totalTurmas = turmasData?.length || 0;
    const mediaAlunosTurma = turmasData && turmasData.length > 0
      ? turmasData.reduce((sum, t) => sum + (t.total_alunos || 0), 0) / turmasData.length
      : 0;
    const turmasSozinhos = turmasData?.filter(t => t.total_alunos === 1).length || 0;

    setKpis({
      totalAtivos,
      totalPagantes,
      totalBolsistas,
      mediaAlunosTurma: Math.round(mediaAlunosTurma * 100) / 100,
      ticketMedio: Math.round(ticketMedio),
      ltvMedio: Math.round(ltvMedio * 10) / 10,
      totalTurmas,
      turmasSozinhos
    });
  }

  // Filtrar alunos
  const alunosFiltrados = useMemo(() => {
    let resultado = [...alunos];

    if (filtros.nome) {
      const termo = filtros.nome.toLowerCase();
      resultado = resultado.filter(a => a.nome.toLowerCase().includes(termo));
    }
    if (filtros.professor_id) {
      resultado = resultado.filter(a => a.professor_atual_id === parseInt(filtros.professor_id));
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
      resultado = resultado.filter(a => a.tipo_matricula_id === parseInt(filtros.tipo_matricula_id));
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
      resultado = resultado.filter(a => (a.status_pagamento || 'em_dia') === filtros.status_pagamento);
    }

    return resultado;
  }, [alunos, filtros, turmas]);

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
      status_pagamento: ''
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
    const [salasDisponiveis, setSalasDisponiveis] = useState<{id: number, nome: string, capacidade_maxima: number}[]>([]);
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
              <span className={`px-2 py-0.5 rounded text-xs ${
                turmaDetalheAbrir.total_alunos === 1
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
                      <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-sm font-bold">
                        {nome.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium">{nome}</p>
                      </div>
                    </div>
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
      {/* Header actions */}
      <div className="flex items-center justify-end gap-4">
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
              {alertaPagamentos.quantidade} aluno{alertaPagamentos.quantidade > 1 ? 's' : ''} sem lançamento
            </span>
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <section data-tour="alunos-kpis" className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <KPICard
          title="Alunos Ativos"
          value={kpis.totalAtivos}
          subvalue="na unidade"
          icon={Users}
          variant="emerald"
        />
        <KPICard
          title="Pagantes"
          value={kpis.totalPagantes}
          subvalue={`${kpis.totalBolsistas} bolsistas`}
          icon={DollarSign}
          variant="amber"
        />
        <KPICard
          title="Média/Turma"
          value={kpis.mediaAlunosTurma.toFixed(2)}
          subvalue="alunos/turma"
          icon={BarChart3}
          variant="cyan"
        />
        <KPICard
          title="Ticket Médio"
          value={`R$ ${kpis.ticketMedio}`}
          subvalue="mensal"
          icon={DollarSign}
          variant="green"
        />
        <KPICard
          title="T. Permanência"
          value={kpis.ltvMedio}
          subvalue="meses"
          icon={Clock}
          variant="green"
        />
        <KPICard
          title="Turmas"
          value={kpis.totalTurmas}
          subvalue="ativas"
          icon={Layers}
          variant="cyan"
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
      <section className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
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
            onNovoAluno={() => setModalNovoAluno(true)}
            onRecarregar={carregarDados}
            verificarTurmaAoSalvar={verificarTurmaAoSalvar}
            onAbrirModalTurma={handleAbrirModalTurma}
          />
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

      {/* Modal Nova Turma/Banda */}
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
          turmasExistentes={turmas}
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

      {/* Tour e Botão de Ajuda */}
      <PageTour tourName="alunos" steps={alunosTourSteps} />
      <TourHelpButton tourName="alunos" />
    </div>
  );
}

