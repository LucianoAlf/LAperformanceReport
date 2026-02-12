import { useState, useEffect, useMemo } from 'react';
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

export function AlunosPage() {
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
    let query = supabase
      .from('alunos')
      .select(`
        id, nome, classificacao, idade_atual, professor_atual_id, curso_id, 
        dia_aula, horario_aula, valor_parcela, tempo_permanencia_meses,
        status, status_pagamento, dia_vencimento, tipo_matricula_id, unidade_id, data_matricula,
        is_segundo_curso, data_nascimento,
        professores:professor_atual_id(nome),
        cursos:curso_id(nome),
        tipos_matricula:tipo_matricula_id(nome),
        unidades:unidade_id(codigo)
      `)
      .order('nome');
    
    // Filtrar por unidade apenas se não for consolidado
    if (unidadeAtual && unidadeAtual !== 'todos') {
      query = query.eq('unidade_id', unidadeAtual);
    }
    
    const { data, error } = await query;

    if (!error && data) {
      // Buscar informações de turmas
      const turmasQuery = supabase
        .from('vw_turmas_implicitas')
        .select('*');
      
      const { data: turmasData } = await turmasQuery;
      const turmasMap = new Map(turmasData?.map(t => [
        `${t.unidade_id}-${t.professor_id}-${t.dia_semana}-${t.horario_inicio}`,
        t
      ]) || []);

      // Buscar apenas anotações PENDENTES por aluno (resolvido = false)
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
    // Carregar turmas implícitas
    let queryImplicitas = supabase
      .from('vw_turmas_implicitas')
      .select('*');
    
    if (unidadeAtual && unidadeAtual !== 'todos') {
      queryImplicitas = queryImplicitas.eq('unidade_id', unidadeAtual);
    }
    
    const { data: turmasImplicitas } = await queryImplicitas;

    // Carregar turmas explícitas
    let queryExplicitas = supabase
      .from('turmas_explicitas')
      .select(`
        id,
        tipo,
        nome,
        professor_id,
        curso_id,
        dia_semana,
        horario_inicio,
        sala_id,
        unidade_id,
        capacidade_maxima,
        professores!inner(nome),
        cursos(nome),
        salas(nome),
        unidades!inner(nome)
      `)
      .eq('ativo', true);
    
    if (unidadeAtual && unidadeAtual !== 'todos') {
      queryExplicitas = queryExplicitas.eq('unidade_id', unidadeAtual);
    }
    
    const { data: turmasExplicitasRaw } = await queryExplicitas;

    // Buscar alunos de cada turma explícita
    const turmasExplicitas: Turma[] = [];
    if (turmasExplicitasRaw) {
      for (const turma of turmasExplicitasRaw) {
        const { data: alunosTurma } = await supabase
          .from('turmas_alunos')
          .select('aluno_id, alunos!inner(nome)')
          .eq('turma_id', turma.id);

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
          total_alunos: alunosTurma?.length || 0,
          nomes_alunos: alunosTurma?.map((a: any) => a.alunos.nome) || [],
          ids_alunos: alunosTurma?.map((a: any) => a.aluno_id) || [],
        });
      }
    }

    // Marcar turmas implícitas
    const turmasImplicitasMarcadas = (turmasImplicitas || []).map(t => ({
      ...t,
      tipo: 'implicita' as const,
    }));

    // Combinar turmas implícitas e explícitas
    const todasTurmas = [...turmasImplicitasMarcadas, ...turmasExplicitas];
    setTurmas(todasTurmas);
  }

  async function carregarOpcoes() {
    // Carregar professores
    // Como a tabela professores não tem unidade_id, precisamos filtrar pelos professores que têm alunos na unidade
    let profs: {id: number, nome: string}[] = [];
    
    if (unidadeAtual && unidadeAtual !== 'todos') {
      // Buscar professores que têm alunos ativos na unidade
      const { data: professoresUnidade } = await supabase
        .from('alunos')
        .select('professor_atual_id, professores!professor_atual_id(id, nome)')
        .eq('unidade_id', unidadeAtual)
        .in('status', ['ativo', 'trancado'])
        .not('professor_atual_id', 'is', null);
      
      if (professoresUnidade) {
        // Extrair professores únicos
        const professoresMap = new Map<number, {id: number, nome: string}>();
        professoresUnidade.forEach(a => {
          const prof = a.professores as any;
          if (prof && prof.id && prof.nome) {
            professoresMap.set(prof.id, { id: prof.id, nome: prof.nome });
          }
        });
        profs = Array.from(professoresMap.values()).sort((a, b) => a.nome.localeCompare(b.nome));
      }
    } else {
      // Consolidado: buscar todos os professores ativos
      const { data: todosProfs } = await supabase
        .from('professores')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome');
      
      if (todosProfs) profs = todosProfs;
    }
    
    setProfessores(profs);

    // Carregar cursos
    const { data: cursosData } = await supabase
      .from('cursos')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome');
    if (cursosData) setCursos(cursosData);

    // Carregar tipos de matrícula
    const { data: tipos } = await supabase
      .from('tipos_matricula')
      .select('id, nome')
      .eq('ativo', true)
      .order('id');
    if (tipos) setTiposMatricula(tipos);

    // Carregar salas
    const { data: salasData } = await supabase
      .from('salas')
      .select('id, nome, capacidade_maxima')
      .eq('unidade_id', unidadeAtual)
      .eq('ativo', true)
      .order('nome');
    if (salasData) setSalas(salasData);

    // Carregar horários
    const { data: horariosData } = await supabase
      .from('horarios')
      .select('id, nome, hora_inicio')
      .eq('ativo', true)
      .order('hora_inicio');
    if (horariosData) setHorarios(horariosData);
  }

  async function carregarKPIs() {
    // Total de alunos ativos (inclui trancados, pois continuam pagando)
    let queryAtivos = supabase
      .from('alunos')
      .select('*', { count: 'exact', head: true })
      .in('status', ['ativo', 'trancado']);
    
    if (unidadeAtual && unidadeAtual !== 'todos') {
      queryAtivos = queryAtivos.eq('unidade_id', unidadeAtual);
    }
    
    const { count: totalAtivos } = await queryAtivos;

    // Alunos pagantes (tipos que contam como pagante, inclui trancados)
    let queryPagantes = supabase
      .from('alunos')
      .select('id, tipos_matricula!inner(conta_como_pagante)')
      .in('status', ['ativo', 'trancado'])
      .eq('tipos_matricula.conta_como_pagante', true);
    
    if (unidadeAtual && unidadeAtual !== 'todos') {
      queryPagantes = queryPagantes.eq('unidade_id', unidadeAtual);
    }
    
    const { data: pagantesData } = await queryPagantes;
    const totalPagantes = pagantesData?.length || 0;

    // Bolsistas (inclui trancados)
    let queryBolsistas = supabase
      .from('alunos')
      .select('id, tipos_matricula!inner(codigo)')
      .in('status', ['ativo', 'trancado'])
      .in('tipos_matricula.codigo', ['BOLSISTA_INT', 'BOLSISTA_PARC']);
    
    if (unidadeAtual && unidadeAtual !== 'todos') {
      queryBolsistas = queryBolsistas.eq('unidade_id', unidadeAtual);
    }
    
    const { data: bolsistasData } = await queryBolsistas;
    const totalBolsistas = bolsistasData?.length || 0;

    // Ticket médio (só pagantes) - IMPORTANTE: soma valores de alunos com múltiplos cursos
    // Aluno com 2 cursos (R$400 + R$300) = ticket de R$700, não R$350
    let queryTicket = supabase
      .from('alunos')
      .select('nome, data_nascimento, unidade_id, valor_parcela, tipos_matricula!inner(entra_ticket_medio)')
      .eq('status', 'ativo')
      .eq('tipos_matricula.entra_ticket_medio', true)
      .not('valor_parcela', 'is', null);
    
    if (unidadeAtual && unidadeAtual !== 'todos') {
      queryTicket = queryTicket.eq('unidade_id', unidadeAtual);
    }
    
    const { data: ticketData } = await queryTicket;
    
    // Agrupar por aluno único (nome + data_nascimento + unidade) e somar valores
    const alunosUnicos = new Map<string, number>();
    ticketData?.forEach((a: any) => {
      const chave = `${a.nome?.toLowerCase().trim()}-${a.data_nascimento || ''}-${a.unidade_id}`;
      const valorAtual = alunosUnicos.get(chave) || 0;
      alunosUnicos.set(chave, valorAtual + (a.valor_parcela || 0));
    });
    
    // Ticket médio = soma dos tickets de cada aluno único / número de alunos únicos
    const valoresUnicos = Array.from(alunosUnicos.values());
    const ticketMedio = valoresUnicos.length > 0
      ? valoresUnicos.reduce((sum, v) => sum + v, 0) / valoresUnicos.length
      : 0;

    // LTV médio
    let queryLtv = supabase
      .from('alunos')
      .select('tempo_permanencia_meses')
      .eq('status', 'ativo')
      .not('tempo_permanencia_meses', 'is', null);
    
    if (unidadeAtual && unidadeAtual !== 'todos') {
      queryLtv = queryLtv.eq('unidade_id', unidadeAtual);
    }
    
    const { data: ltvData } = await queryLtv;
    
    const ltvMedio = ltvData && ltvData.length > 0
      ? ltvData.reduce((sum, a) => sum + (a.tempo_permanencia_meses || 0), 0) / ltvData.length
      : 0;

    // Turmas e média de alunos por turma
    let queryTurmas = supabase
      .from('vw_turmas_implicitas')
      .select('total_alunos');
    
    if (unidadeAtual && unidadeAtual !== 'todos') {
      queryTurmas = queryTurmas.eq('unidade_id', unidadeAtual);
    }
    
    const { data: turmasData } = await queryTurmas;
    
    const totalTurmas = turmasData?.length || 0;
    const mediaAlunosTurma = turmasData && turmasData.length > 0
      ? turmasData.reduce((sum, t) => sum + (t.total_alunos || 0), 0) / turmasData.length
      : 0;
    
    // Turmas com apenas 1 aluno (sozinhos)
    const turmasSozinhos = turmasData?.filter(t => t.total_alunos === 1).length || 0;

    setKpis({
      totalAtivos: totalAtivos || 0,
      totalPagantes,
      totalBolsistas,
      mediaAlunosTurma: Math.round(mediaAlunosTurma * 100) / 100,
      ticketMedio: Math.round(ticketMedio),
      ltvMedio: Math.round(ltvMedio),
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
      resultado = resultado.filter(a => a.curso_id === parseInt(filtros.curso_id));
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
        
        // Verificar se já existe turma explícita
        const { data: turmaExistente } = await supabase
          .from('turmas_explicitas')
          .select('id')
          .eq('unidade_id', turmaDetalheAbrir.unidade_id)
          .eq('professor_id', turmaDetalheAbrir.professor_id)
          .eq('dia_semana', turmaDetalheAbrir.dia_semana)
          .eq('horario_inicio', turmaDetalheAbrir.horario_inicio)
          .maybeSingle();

        if (turmaExistente) {
          // Atualizar turma existente
          const { error } = await supabase
            .from('turmas_explicitas')
            .update({
              sala_id: salaIdSelecionada,
              capacidade_maxima: salaSelecionada?.capacidade_maxima || 4,
              updated_at: new Date().toISOString()
            })
            .eq('id', turmaExistente.id);

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
      {/* Header */}
      <header className="flex items-center gap-4">
        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
          <Users className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">Gestão de Alunos</h1>
          <p className="text-sm text-slate-400">Controle completo de alunos, turmas e horários</p>
        </div>
        
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
      </header>

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

      {/* Tabs e Conteúdo */}
      <section className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        {/* Tabs + Novo Aluno */}
        <div className="flex items-center justify-between border-b border-slate-700">
          {/* Tabs de navegação */}
          <div data-tour="alunos-tabs" className="flex items-center gap-2 pb-1">
            <button
              onClick={() => setTabAtiva('lista')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition ${
                tabAtiva === 'lista'
                  ? 'bg-slate-800 text-white border-b-2 border-purple-500'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Users className="w-4 h-4" /> Lista de Alunos
            </button>
            <button
              onClick={() => setTabAtiva('turmas')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition ${
                tabAtiva === 'turmas'
                  ? 'bg-slate-800 text-white border-b-2 border-purple-500'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Calendar className="w-4 h-4" /> Gestão de Turmas
            </button>
            <button
              onClick={() => setTabAtiva('grade')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition ${
                tabAtiva === 'grade'
                  ? 'bg-slate-800 text-white border-b-2 border-purple-500'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Clock className="w-4 h-4" /> Grade Horária
            </button>
            <button
              onClick={() => setTabAtiva('distribuicao')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition ${
                tabAtiva === 'distribuicao'
                  ? 'bg-slate-800 text-white border-b-2 border-purple-500'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <BarChart3 className="w-4 h-4" /> Distribuição
            </button>
            <button
              disabled
              title="Em breve — funcionalidade em desenvolvimento"
              className="flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium text-slate-600 cursor-not-allowed opacity-50"
            >
              <Upload className="w-4 h-4" /> Importar Alunos
            </button>
          </div>

        </div>

        {/* Conteúdo das Tabs */}
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

