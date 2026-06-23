import { useEffect, useState } from 'react';
import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { useOutletContext } from 'react-router-dom';
import { 
  Users, 
  UserPlus, 
  UserMinus, 
  TrendingUp, 
  DollarSign, 
  Percent,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Calendar,
  Ticket,
  Target,
  Award,
  Phone,
  GraduationCap,
  RefreshCw,
  Lock
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatCurrency } from '@/lib/utils';
import { EvolutionChart } from '@/components/ui/EvolutionChart';
import { FunnelChart } from '@/components/ui/FunnelChart';
import { CompetenciaFilter } from '@/components/ui/CompetenciaFilter';
import { TipoCompetencia, CompetenciaFiltro, CompetenciaRange } from '@/hooks/useCompetenciaFiltro';
import { useMetasKPI } from '@/hooks/useMetasKPI';
import { KPICard } from '@/components/ui/KPICard';
import { ModalDetalheKPI, BadgeUnidade, BadgeTipo, ValorParcela, TextoCurso } from './ModalDetalheKPI';
import { fetchKPIsAlunosCanonicos, type FonteKPIAlunos } from '@/hooks/useKPIsAlunosCanonicos';
import {
  fetchComercialOperacionalResumoV2,
  fetchExperimentaisDiagnosticoComercialV2,
  useComercialOperacionalResumoV2,
} from '@/hooks/useComercialOperacionalResumoV2';
import { ehMatriculaComercialCanonica } from '@/lib/comercialMatriculasCanonicas';
import { filtrarRetencaoCanonica } from '@/lib/atividadesExtras';


interface OutletContextType {
  filtroAtivo: string | null;
  competencia: {
    filtro: CompetenciaFiltro;
    range: CompetenciaRange;
    anosDisponiveis: number[];
    setTipo: (tipo: TipoCompetencia) => void;
    setAno: (ano: number) => void;
    setMes: (mes: number) => void;
    setTrimestre: (trimestre: 1 | 2 | 3 | 4) => void;
    setSemestre: (semestre: 1 | 2) => void;
    setDataInicio: (data: Date | undefined) => void;
    setDataFim: (data: Date | undefined) => void;
  };
}

interface DadosGestao {
  alunos_ativos: number;
  alunos_pagantes: number;
  matriculas_mes: number;
  evasoes_mes: number;
  ticket_medio: number;
}

interface DadosComercial {
  leads_mes: number;
  experimentais_realizadas: number;
  experimentais_status_operacional?: number;
  taxa_conversao: number;
  taxa_exp_mat_liberada?: boolean;
  denominador_exp_mat?: number;
  conversoes_exp_mat?: number;
  pendencias_exp_mat?: number;
  ticket_passaporte: number;
}

interface DadosProfessores {
  total_professores: number;
  media_alunos_professor: number;
  taxa_renovacao: number;
  media_alunos_turma: number;
}

interface Alerta {
  tipo_alerta: string;
  severidade: 'critico' | 'atencao' | 'informativo';
  unidade_id: string;
  unidade_nome: string;
  quantidade: number;
  descricao: string;
  detalhe: string;
  valor_atual: number | null;
  valor_meta: number | null;
  data_referencia: string;
}

interface ResumoUnidade {
  unidade: string;
  unidade_id: string;
  alunos_ativos: number;
  alunos_pagantes: number;
  ticket_medio: number;
  faturamento_previsto: number;
  tempo_medio: number;
}

interface FonteKPIAlunosState {
  fonte: FonteKPIAlunos;
  label: string;
  alertas: string[];
}

export function DashboardPage() {
  useSetPageTitle({
    titulo: 'Dashboard',
    subtitulo: 'Visão consolidada de gestão, comercial e professores',
    icone: BarChart3,
    iconeCor: 'text-cyan-400',
    iconeWrapperCor: 'bg-cyan-500/20',
  });

  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [dadosGestao, setDadosGestao] = useState<DadosGestao | null>(null);
  const [fonteKpisAlunos, setFonteKpisAlunos] = useState<FonteKPIAlunosState | null>(null);
  const [dadosComercial, setDadosComercial] = useState<DadosComercial | null>(null);
  const [dadosProfessores, setDadosProfessores] = useState<DadosProfessores | null>(null);
  const [evolucaoAlunos, setEvolucaoAlunos] = useState<{ mes: string; valor: number }[]>([]);
  const [funilComercial, setFunilComercial] = useState<{ etapa: string; valor: number; cor: string }[]>([]);
  const [resumoUnidades, setResumoUnidades] = useState<ResumoUnidade[]>([]);
  const [modalMatriculas, setModalMatriculas] = useState(false);
  const [modalEvasoes, setModalEvasoes] = useState(false);
  const [dadosModalMatriculas, setDadosModalMatriculas] = useState<any[]>([]);
  const [dadosModalEvasoes, setDadosModalEvasoes] = useState<any[]>([]);
  const [modalExperimentais, setModalExperimentais] = useState(false);
  const [dadosModalExperimentais, setDadosModalExperimentais] = useState<any[]>([]);
  const [modalConversao, setModalConversao] = useState(false);
  const [dadosModalConversao, setDadosModalConversao] = useState<any[]>([]);
  const [carregandoModal, setCarregandoModal] = useState(false);

  // Pegar filtros do contexto
  const context = useOutletContext<OutletContextType>();
  const filtroAtivo = context?.filtroAtivo ?? null;
  const competencia = context?.competencia;
  const ano = competencia?.filtro?.ano || new Date().getFullYear();
  // IMPORTANTE: usar mesInicio e mesFim do RANGE, não do filtro
  // O filtro.mes é o mês selecionado no dropdown, mas o range calcula o período correto
  const mesInicio = competencia?.range?.mesInicio || competencia?.filtro?.mes || new Date().getMonth() + 1;
  const mesFim = competencia?.range?.mesFim || mesInicio;
  const mes = mesInicio; // Para compatibilidade com código existente
  const unidade = filtroAtivo || 'todos';
  const labelPeriodo = { todos: 'Todos', diario: 'Dia', mensal: 'Mês', trimestral: 'Trim', semestral: 'Sem', anual: 'Ano', personalizado: 'Período' }[competencia?.filtro?.tipo || 'mensal'] || 'Mês';
  
  // Buscar metas do período
  const unidadeIdParaMetas = unidade === 'todos' ? null : unidade;
  const { metas } = useMetasKPI(unidadeIdParaMetas, ano, mes);
  
  // Funções de controle do filtro de competência
  const anosDisponiveis = competencia?.anosDisponiveis || [2023, 2024, 2025, 2026];
  const setTipo = competencia?.setTipo;
  const setAno = competencia?.setAno;
  const setMes = competencia?.setMes;
  const setTrimestre = competencia?.setTrimestre;
  const setSemestre = competencia?.setSemestre;
  const setDataInicio = competencia?.setDataInicio;
  const setDataFim = competencia?.setDataFim;
  const {
    leadsEntrantes: leadsComercialV2,
    loading: loadingLeadsComercialV2,
    error: errorLeadsComercialV2,
  } = useComercialOperacionalResumoV2({
    unidadeId: unidade,
    ano,
    mesInicio,
    mesFim,
  });

  // Fetch matrículas do período para o modal
  const fetchMatriculas = async () => {
    setCarregandoModal(true);
    try {
      const dataInicio = `${ano}-${String(mesInicio).padStart(2, '0')}-01`;
      const dataFimStr = mesFim === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mesFim + 1).padStart(2, '0')}-01`;
      let query = supabase
        .from('alunos')
        .select(`
          nome, data_matricula, valor_parcela,
          unidades:unidade_id!inner(nome),
          cursos:curso_id!left(nome, is_projeto_banda),
          tipos_matricula:tipo_matricula_id!left(codigo)
        `)
        .not('data_matricula', 'is', null)
        .or('is_segundo_curso.is.null,is_segundo_curso.eq.false')
        .gte('data_matricula', dataInicio)
        .lt('data_matricula', dataFimStr)
        .order('data_matricula', { ascending: false });

      if (unidade !== 'todos') {
        query = query.eq('unidade_id', unidade);
      }

      const { data } = await query;
      const filtrados = (data || []).filter((a: any) => {
        const codigo = a.tipos_matricula?.codigo;
        if (codigo === 'BOLSISTA_INT' || codigo === 'BOLSISTA_PARC') return false;
        if (a.cursos?.is_projeto_banda) return false;
        if (a.cursos?.nome?.toLowerCase().includes('canto coral')) return false;
        return true;
      });
      setDadosModalMatriculas(filtrados.map((a: any) => ({
        nome: a.nome,
        unidade: a.unidades?.nome || '—',
        data_matricula: a.data_matricula ? new Date(a.data_matricula + 'T12:00:00').toLocaleDateString('pt-BR') : '—',
        curso: a.cursos?.nome || '—',
        valor: a.valor_parcela ? `R$ ${Number(a.valor_parcela).toLocaleString('pt-BR')}` : '—',
        _valor_raw: a.valor_parcela ? Number(a.valor_parcela) : 0,
      })));
    } finally {
      setCarregandoModal(false);
    }
  };

  // Fetch evasões do período para o modal
  const fetchEvasoes = async () => {
    setCarregandoModal(true);
    try {
      const dataInicio = `${ano}-${String(mesInicio).padStart(2, '0')}-01`;
      const dataFimStr = mesFim === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mesFim + 1).padStart(2, '0')}-01`;
      let query = supabase
        .from('movimentacoes_admin')
        .select(`
          aluno_nome, data, motivo, tipo, curso_id,
          unidades:unidade_id!inner(nome),
          cursos:curso_id!left(nome, is_projeto_banda)
        `)
        .in('tipo', ['evasao', 'nao_renovacao'])
        .gte('data', dataInicio)
        .lt('data', dataFimStr)
        .order('data', { ascending: false });

      if (unidade !== 'todos') {
        query = query.eq('unidade_id', unidade);
      }

      const { data } = await query;
      setDadosModalEvasoes(filtrarRetencaoCanonica(data || []).map((m: any) => ({
        nome: m.aluno_nome || '—',
        unidade: m.unidades?.nome || '—',
        data_evasao: m.data ? new Date(m.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—',
        tipo: m.tipo === 'evasao' ? 'Evasão' : 'Não Renovação',
        _tipo_raw: m.tipo,
        motivo: m.motivo || '—',
      })));
    } finally {
      setCarregandoModal(false);
    }
  };

  // Lista operacional para o modal; o KPI canônico usa a camada v2 de presença.
  const fetchExperimentais = async () => {
    setCarregandoModal(true);
    try {
      const dataInicio = `${ano}-${String(mesInicio).padStart(2, '0')}-01`;
      const dataFimStr = mesFim === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mesFim + 1).padStart(2, '0')}-01`;
      let query = supabase
        .from('leads')
        .select(`
          nome, telefone, data_contato, status, quantidade,
          unidades:unidade_id!inner(nome),
          cursos:curso_interesse_id!left(nome),
          canais_origem:canal_origem_id!left(nome)
        `)
        .in('status', ['experimental_realizada', 'compareceu', 'visita_escola'])
        .gte('data_contato', dataInicio)
        .lt('data_contato', dataFimStr)
        .order('data_contato', { ascending: false });

      if (unidade !== 'todos') {
        query = query.eq('unidade_id', unidade);
      }

      const { data } = await query;
      setDadosModalExperimentais((data || []).map((l: any) => ({
        nome: l.nome || '—',
        unidade: l.unidades?.nome || '—',
        data: l.data_contato ? new Date(l.data_contato + 'T12:00:00').toLocaleDateString('pt-BR') : '—',
        curso: l.cursos?.nome || '—',
        canal: l.canais_origem?.nome || '—',
        status: l.status === 'visita_escola' ? 'Visita' : 'Realizada',
        _status_raw: l.status,
      })));
    } finally {
      setCarregandoModal(false);
    }
  };

  // Detalhe da Taxa de Conversão: leads que fizeram experimental no período,
  // classificados em "Matriculou" / "Não matriculou".
  // Espelha a fórmula: denominador = experimental_realizada=true; numerador = desses, status matriculado/convertido.
  const fetchConversao = async () => {
    setCarregandoModal(true);
    try {
      const dataInicio = `${ano}-${String(mesInicio).padStart(2, '0')}-01`;
      const dataFimStr = mesFim === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mesFim + 1).padStart(2, '0')}-01`;
      let query = supabase
        .from('leads')
        .select(`
          id, nome, telefone, data_contato, data_experimental, data_conversao, status, quantidade,
          experimental_realizada, faltou_experimental,
          unidades:unidade_id!inner(nome),
          cursos:curso_interesse_id!left(nome),
          canais_origem:canal_origem_id!left(nome)
        `)
        .eq('experimental_realizada', true)
        .gte('data_contato', dataInicio)
        .lt('data_contato', dataFimStr)
        .order('data_experimental', { ascending: false, nullsFirst: false });

      if (unidade !== 'todos') {
        query = query.eq('unidade_id', unidade);
      }

      const { data } = await query;
      setDadosModalConversao((data || []).map((l: any) => {
        const matriculou = ['matriculado', 'convertido'].includes(l.status || '');
        return {
          nome: l.nome || '—',
          unidade: l.unidades?.nome || '—',
          data_exp: l.data_experimental ? new Date(l.data_experimental + 'T12:00:00').toLocaleDateString('pt-BR') : '—',
          data_matr: l.data_conversao ? new Date(l.data_conversao + 'T12:00:00').toLocaleDateString('pt-BR') : '—',
          curso: l.cursos?.nome || '—',
          canal: l.canais_origem?.nome || '—',
          resultado: matriculou ? 'Matriculou' : 'Não matriculou',
          _matriculou: matriculou,
        };
      }));
    } finally {
      setCarregandoModal(false);
    }
  };

  useEffect(() => {
    async function fetchDados() {
      try {
        // Buscar alertas inteligentes da nova view
        let alertasQuery = supabase
          .from('vw_alertas_inteligentes')
          .select('*');
        
        // Filtrar por unidade se não for consolidado
        if (unidade !== 'todos') {
          alertasQuery = alertasQuery.eq('unidade_id', unidade);
        }
        
        const { data: alertasData } = await alertasQuery.limit(10);

        if (alertasData) {
          setAlertas(alertasData as Alerta[]);
        }

        // ===== DADOS DE GESTÃO =====
        const kpisAlunos = await fetchKPIsAlunosCanonicos({
          unidadeId: unidade,
          ano,
          mes: mesInicio,
          mesFim,
        });

        setFonteKpisAlunos({
          fonte: kpisAlunos.fonte,
          label: kpisAlunos.fonteLabel,
          alertas: kpisAlunos.alertasFonte,
        });

        if (kpisAlunos.fonte !== 'indisponivel') {
          setDadosGestao({
            alunos_ativos: Math.round(kpisAlunos.alunosAtivos),
            alunos_pagantes: Math.round(kpisAlunos.alunosPagantes),
            matriculas_mes: kpisAlunos.novasMatriculas,
            evasoes_mes: kpisAlunos.evasoes,
            ticket_medio: kpisAlunos.ticketMedio,
          });
        } else {
          setDadosGestao(null);
          if (!isPeriodoAtual) {
            setResumoUnidades([]);
          }
        }

        // ===== DADOS COMERCIAIS =====
        // Fonte canônica v2. Não usar snapshots legados como fallback silencioso.
        setDadosComercial(null);
        setFunilComercial([]);

        try {
          const startDateComercial = `${ano}-${String(mesInicio).padStart(2, '0')}-01`;
          const endDateComercial = `${ano}-${String(mesFim).padStart(2, '0')}-${new Date(ano, mesFim, 0).getDate()}`;

          const [resumoComercialV2, diagnosticoExperimentaisV2] = await Promise.all([
            fetchComercialOperacionalResumoV2({
              unidadeId: unidade,
              ano,
              mesInicio,
              mesFim,
            }),
            fetchExperimentaisDiagnosticoComercialV2({
              unidadeId: unidade,
              ano,
              mesInicio,
              mesFim,
            }),
          ]);

          let passaporteQueryV2 = supabase
            .from('alunos')
            .select(`
              valor_passaporte,
              valor_parcela,
              is_segundo_curso,
              status,
              cursos:curso_id!left(nome, is_projeto_banda),
              tipos_matricula:tipo_matricula_id!left(codigo, conta_como_pagante, entra_ticket_medio)
            `)
            .gte('data_matricula', startDateComercial)
            .lte('data_matricula', endDateComercial)
            .gt('valor_passaporte', 0);

          if (unidade !== 'todos') {
            passaporteQueryV2 = passaporteQueryV2.eq('unidade_id', unidade);
          }

          const { data: passaporteV2Data } = await passaporteQueryV2;
          const passaportesCanonicos = (passaporteV2Data || []).filter(ehMatriculaComercialCanonica);
          const ticketPassaporteV2 =
            passaportesCanonicos.length > 0
              ? passaportesCanonicos.reduce((sum: number, a: any) => sum + Number(a.valor_passaporte), 0) /
                passaportesCanonicos.length
              : 0;

          const matriculasCanonicas =
            kpisAlunos.fonte !== 'indisponivel' ? kpisAlunos.novasMatriculas : 0;

          setDadosComercial({
            leads_mes: resumoComercialV2.leadsEntrantes,
            experimentais_realizadas: diagnosticoExperimentaisV2.realizadasPresencaConfirmada,
            experimentais_status_operacional: diagnosticoExperimentaisV2.realizadasStatusOperacional,
            taxa_conversao: diagnosticoExperimentaisV2.taxaExpMatLiberada
              ? diagnosticoExperimentaisV2.taxaExpMatCanonica || 0
              : 0,
            taxa_exp_mat_liberada: diagnosticoExperimentaisV2.taxaExpMatLiberada,
            denominador_exp_mat: diagnosticoExperimentaisV2.denominadorTaxaExpMat,
            conversoes_exp_mat: diagnosticoExperimentaisV2.conversoesExpMatCanonicas,
            pendencias_exp_mat: diagnosticoExperimentaisV2.pendenciasTaxaExpMat,
            ticket_passaporte: Math.round(ticketPassaporteV2),
          });

          setFunilComercial([
            { etapa: 'Leads', valor: resumoComercialV2.leadsEntrantes, cor: '#3b82f6' },
            {
              etapa: 'Presença confirmada',
              valor: diagnosticoExperimentaisV2.realizadasPresencaConfirmada,
              cor: '#8b5cf6',
            },
            { etapa: 'Matrículas', valor: matriculasCanonicas, cor: '#10b981' },
          ]);
        } catch (err) {
          console.error('Erro ao aplicar camada comercial v2 no Dashboard:', err);
        }

        // ===== DADOS DE PROFESSORES =====
        // MESMA LÓGICA da página ProfessoresPage.tsx:
        // 1. Buscar professores ativos
        // 2. Buscar relacionamentos professor-unidade
        // 3. Buscar turmas (implícitas e explícitas) para calcular total_alunos e total_turmas
        // 4. Filtrar por unidade e calcular KPIs
        
        // Buscar dados de professores em PARALELO (5 queries → 1 roundtrip)
        const startDate = `${ano}-${String(mesInicio).padStart(2, '0')}-01`;
        const ultimoDia = new Date(ano, mesFim, 0).getDate();
        const endDate = `${ano}-${String(mesFim).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
        // Buscar renovações e não renovações de movimentacoes_admin (fonte de verdade)
        let renovacoesQuery = supabase
          .from('movimentacoes_admin')
          .select('tipo, unidade_id, curso_id, cursos:curso_id!left(nome, is_projeto_banda)')
          .in('tipo', ['renovacao', 'nao_renovacao'])
          .gte('data', startDate)
          .lte('data', endDate);
        if (unidade !== 'todos') {
          renovacoesQuery = renovacoesQuery.eq('unidade_id', unidade);
        }

        const [profsR, profUnidR, turmasR, perfR, renovR] = await Promise.all([
          supabase.from('professores').select('id, nome, ativo').eq('ativo', true),
          supabase.from('professores_unidades').select('professor_id, unidade_id'),
          supabase.from('vw_turmas_implicitas').select('professor_id, total_alunos, unidade_id'),
          supabase.from('professores_performance').select('*').eq('ano', ano),
          renovacoesQuery,
        ]);

        const professoresData = profsR.data;
        const profUnidadesData = profUnidR.data;
        const turmasImplicitas = turmasR.data;
        const performanceData = perfR.data;
        const renovacoesData = renovR.data;

        // Calcular KPIs
        let totalProfs = 0;
        let mediaAlunosProf = 0;
        let taxaRenovacao = 0;
        let mediaAlunosTurma = 0;

        if (professoresData && professoresData.length > 0) {
          // Mapear unidades por professor
          const unidadesPorProfessor = new Map<number, string[]>();
          if (profUnidadesData) {
            profUnidadesData.forEach((pu: any) => {
              const lista = unidadesPorProfessor.get(pu.professor_id) || [];
              lista.push(pu.unidade_id);
              unidadesPorProfessor.set(pu.professor_id, lista);
            });
          }

          // Filtrar turmas por unidade ANTES de calcular
          const turmasFiltradas = unidade !== 'todos' 
            ? turmasImplicitas?.filter((t: any) => t.unidade_id === unidade) 
            : turmasImplicitas;

          // Calcular turmas e alunos por professor (das turmas implícitas FILTRADAS)
          const turmasPorProfessor = new Map<number, number>();
          const alunosPorProfessor = new Map<number, number>();
          turmasFiltradas?.forEach((t: any) => {
            const profId = t.professor_id;
            turmasPorProfessor.set(profId, (turmasPorProfessor.get(profId) || 0) + 1);
            alunosPorProfessor.set(profId, (alunosPorProfessor.get(profId) || 0) + (t.total_alunos || 0));
          });

          // Filtrar professores por unidade (MESMA LÓGICA da página Professores)
          let professoreFiltrados = professoresData;
          if (unidade !== 'todos') {
            professoreFiltrados = professoresData.filter((p: any) => {
              const unidadesProf = unidadesPorProfessor.get(p.id) || [];
              return unidadesProf.includes(unidade);
            });
          }
          
          // Total de professores ativos
          totalProfs = professoreFiltrados.length;
          
          // Total de alunos e turmas dos professores filtrados
          let totalAlunos = 0;
          let totalTurmas = 0;
          professoreFiltrados.forEach((p: any) => {
            totalAlunos += alunosPorProfessor.get(p.id) || 0;
            totalTurmas += turmasPorProfessor.get(p.id) || 0;
          });
          
          mediaAlunosProf = totalProfs > 0 ? Math.round((totalAlunos / totalProfs) * 10) / 10 : 0;
          mediaAlunosTurma = totalTurmas > 0 ? Math.round((totalAlunos / totalTurmas) * 10) / 10 : 0;
        }

        // Taxa de renovação: usar movimentacoes_admin (fonte de verdade)
        if (renovacoesData && renovacoesData.length > 0) {
          const renovacoesCanonicas = filtrarRetencaoCanonica(renovacoesData);
          const totalRenovacoes = renovacoesCanonicas.filter((r: any) => r.tipo === 'renovacao').length;
          const totalContratos = renovacoesCanonicas.length; // renovacao + nao_renovacao sem atividades extras
          taxaRenovacao = totalContratos > 0 ? (totalRenovacoes / totalContratos) * 100 : 0;
        } else if (performanceData && performanceData.length > 0) {
          // Fallback: professores_performance (dados históricos)
          let perfFiltrada = performanceData;
          if (unidade !== 'todos') {
            const unidadeNome = unidade === '2ec861f6-023f-4d7b-9927-3960ad8c2a92' ? 'Campo Grande' 
              : unidade === '95553e96-971b-4590-a6eb-0201d013c14d' ? 'Recreio'
              : unidade === '368d47f5-2d88-4475-bc14-ba084a9a348e' ? 'Barra' : null;
            if (unidadeNome) {
              perfFiltrada = performanceData.filter((p: any) => p.unidade === unidadeNome);
            }
          }
          const renovacoes = perfFiltrada.reduce((acc: number, p: any) => acc + (p.renovacoes || 0), 0);
          const contratosVencer = perfFiltrada.reduce((acc: number, p: any) => acc + (p.contratos_vencer || 0), 0);
          taxaRenovacao = contratosVencer > 0 ? (renovacoes / contratosVencer) * 100 : 0;
        }

        setDadosProfessores({
          total_professores: totalProfs,
          media_alunos_professor: mediaAlunosProf,
          taxa_renovacao: taxaRenovacao,
          media_alunos_turma: mediaAlunosTurma
        });

        // ===== EVOLUÇÃO DE ALUNOS ATIVOS (12 meses) =====
        // Histórico vem de dados_mensais; mês corrente vem da fonte canônica viva.
        // IMPORTANTE: Filtrar por unidade se não for consolidado
        const hojeAno = new Date().getFullYear();
        const hojeMes = new Date().getMonth() + 1;

        let evolucaoQuery = supabase
          .from('dados_mensais')
          .select('ano, mes, alunos_ativos, unidade_id')
          .gte('ano', ano - 1)
          .order('ano', { ascending: true })
          .order('mes', { ascending: true });

        if (unidade !== 'todos') {
          evolucaoQuery = evolucaoQuery.eq('unidade_id', unidade);
        }

        const { data: evolucaoData } = await evolucaoQuery;
        const ativosAtual = kpisAlunos.fonte !== 'indisponivel'
          ? Math.round(kpisAlunos.alunosAtivos)
          : 0;

        if (evolucaoData) {
          const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
          // Excluir mês corrente do histórico — será sobrescrito pelo valor em tempo real
          const dadosHistoricos = evolucaoData.filter(
            (d: any) => !(d.ano === hojeAno && d.mes === hojeMes)
          );

          const agrupado = dadosHistoricos.reduce((acc: Record<string, number>, d: any) => {
            const key = `${mesesNomes[d.mes - 1]}/${String(d.ano).slice(-2)}`;
            acc[key] = (acc[key] || 0) + (d.alunos_ativos || 0);
            return acc;
          }, {});

          const keyAtual = `${mesesNomes[hojeMes - 1]}/${String(hojeAno).slice(-2)}`;
          agrupado[keyAtual] = ativosAtual;

          const evolucao = Object.entries(agrupado)
            .slice(-12)
            .map(([mes, valor]) => ({ mes, valor: valor as number }));

          setEvolucaoAlunos(evolucao);
        }

        // ===== RESUMO POR UNIDADE (do período selecionado) =====
        // Usar isPeriodoAtual já calculado acima para decidir fonte de dados
        // IMPORTANTE: Filtrar por unidade se não for consolidado

        if (isPeriodoAtual) {
          // Para período atual, usar fonte canônica viva (dados em tempo real)
          const resumo: ResumoUnidade[] = kpisAlunos.porUnidade.map(row => ({
            unidade: row.unidade_nome,
            unidade_id: row.unidade_id,
            alunos_ativos: Math.round(row.alunosAtivos),
            alunos_pagantes: Math.round(row.alunosPagantes),
            ticket_medio: row.ticketMedio,
            faturamento_previsto: row.faturamentoPrevisto,
            tempo_medio: row.tempoPermanencia,
          }));
          setResumoUnidades(resumo);
        } else {
          // Para períodos históricos, usar dados_mensais
          // Filtrar unidades se não for consolidado
          let unidadesQuery = supabase
            .from('unidades')
            .select('id, nome')
            .eq('ativo', true);
          
          if (unidade !== 'todos') {
            unidadesQuery = unidadesQuery.eq('id', unidade);
          }
          
          const { data: unidadesData } = await unidadesQuery;

          if (unidadesData) {
            // Filtrar dados_mensais por unidade se não for consolidado
            let dadosMensaisQuery = supabase
              .from('dados_mensais')
              .select('*')
              .eq('ano', ano)
              .gte('mes', mes)
              .lte('mes', mesFim);
            
            if (unidade !== 'todos') {
              dadosMensaisQuery = dadosMensaisQuery.eq('unidade_id', unidade);
            }
            
            const { data: dadosMensaisUnidades } = await dadosMensaisQuery;

            if (dadosMensaisUnidades && dadosMensaisUnidades.length > 0) {
              const resumo: ResumoUnidade[] = unidadesData.map((u: any) => {
                const dadosUnidade = dadosMensaisUnidades.filter((d: any) => d.unidade_id === u.id);
                const alunosAtivos = dadosUnidade.reduce((acc: number, d: any) => acc + (d.alunos_ativos || 0), 0);
                const alunosPagantes = dadosUnidade.reduce((acc: number, d: any) => acc + (d.alunos_pagantes || 0), 0);
                const faturamento = dadosUnidade.reduce((acc: number, d: any) => acc + parseFloat(d.faturamento_estimado || 0), 0);
                const ticketMedio = alunosPagantes > 0 ? faturamento / alunosPagantes : 0;

                return {
                  unidade: u.nome,
                  unidade_id: u.id,
                  alunos_ativos: alunosAtivos,
                  alunos_pagantes: alunosPagantes,
                  ticket_medio: ticketMedio,
                  faturamento_previsto: faturamento,
                  tempo_medio: 0
                };
              });
              setResumoUnidades(resumo);
            } else {
              setResumoUnidades([]);
            }
          }
        }

      } catch (error) {
        console.error('Erro ao buscar dados:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchDados();
  }, [ano, mesInicio, mesFim, unidade]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ===== FILTRO DE COMPETÊNCIA ===== */}
      {competencia?.filtro && setTipo && setAno && setMes && setTrimestre && setSemestre && (
        <div className="flex justify-end">
          <CompetenciaFilter
            filtro={competencia.filtro}
            range={competencia.range}
            anosDisponiveis={anosDisponiveis}
            onTipoChange={setTipo}
            onAnoChange={setAno}
            onMesChange={setMes}
            onTrimestreChange={setTrimestre}
            onSemestreChange={setSemestre}
            onDataInicioChange={setDataInicio}
            onDataFimChange={setDataFim}
          />
        </div>
      )}

      {/* ===== LINHA 1: GESTÃO ===== */}
      <div data-tour="secao-gestao">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-5 h-5 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Gestão</h3>
        </div>
        {fonteKpisAlunos && (
          <div className={`mb-3 inline-flex max-w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium ${
            fonteKpisAlunos.fonte === 'dados_mensais'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : fonteKpisAlunos.fonte === 'vivo'
                ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
          }`}>
            <BarChart3 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              KPIs de alunos: {fonteKpisAlunos.label}
              {fonteKpisAlunos.alertas[0] ? ` · ${fonteKpisAlunos.alertas[0]}` : ''}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            dataTour="card-alunos"
            icon={Users}
            label="Pagantes"
            tooltip="Total de alunos ativos com tipo de matrícula pagante (exclui bolsistas integrais). Não conta segundo curso."
            value={dadosGestao?.alunos_pagantes ?? '--'}
            target={metas.alunos_pagantes}
            format="number"
            variant="cyan"
          />
          <KPICard
            dataTour="card-matriculas"
            icon={UserPlus}
            label={`Matrículas (${labelPeriodo})`}
            tooltip="Novos alunos que pagaram passaporte no período. Não inclui segundo curso, banda, coral ou bolsistas. Clique para ver a lista."
            value={dadosGestao?.matriculas_mes ?? '--'}
            target={metas.matriculas}
            format="number"
            subvalue={!dadosGestao ? 'Aguardando dados' : undefined}
            variant="emerald"
            onClick={() => { fetchMatriculas(); setModalMatriculas(true); }}
          />
          <KPICard
            dataTour="card-evasoes"
            icon={UserMinus}
            label={`Evasões (${labelPeriodo})`}
            tooltip="Alunos que cancelaram ou não renovaram no período. Conta evasões e não-renovações (deduplicado por aluno/mês). Clique para ver a lista."
            value={dadosGestao?.evasoes_mes ?? '--'}
            subvalue={!dadosGestao ? 'Aguardando dados' : undefined}
            variant="rose"
            inverterCor={true}
            onClick={() => { fetchEvasoes(); setModalEvasoes(true); }}
          />
          <KPICard
            dataTour="card-ticket"
            icon={DollarSign}
            label="Ticket Médio Parcelas"
            tooltip="Média do valor total pago por aluno (soma parcelas de todos os cursos). Média ponderada pelo número de pagantes de cada unidade."
            value={dadosGestao?.ticket_medio ?? '--'}
            target={metas.ticket_medio}
            format="currency"
            variant="amber"
          />
        </div>
      </div>

      {/* ===== LINHA 2: COMERCIAL ===== */}
      <div data-tour="secao-comercial">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-5 h-5 text-violet-400" />
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Comercial</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            icon={Phone}
            label={`Leads (${labelPeriodo})`}
            tooltip="Total de novos leads (contatos) recebidos no período. Inclui leads novos e agendados."
            value={loadingLeadsComercialV2 ? '--' : leadsComercialV2 ?? '--'}
            target={metas.leads}
            format="number"
            subvalue={
              errorLeadsComercialV2
                ? 'Erro na fonte v2'
                : loadingLeadsComercialV2
                  ? 'Aguardando fonte v2'
                  : 'Fonte v2'
            }
            variant="cyan"
          />
          <KPICard
            icon={Calendar}
            label="Experimentais com Presença"
            tooltip="Presença experimental confirmada pela camada v2: aluno vinculado + presença individual + aula Emusys experimental. Clique para ver a lista operacional."
            value={dadosComercial?.experimentais_realizadas ?? '--'}
            target={metas.experimentais}
            format="number"
            subvalue={
              !dadosComercial
                ? 'Aguardando dados'
                : `Status operacional: ${dadosComercial.experimentais_status_operacional ?? 0}`
            }
            variant="violet"
            onClick={() => { fetchExperimentais(); setModalExperimentais(true); }}
          />
          <KPICard
            icon={dadosComercial?.taxa_exp_mat_liberada ? Percent : Lock}
            label="Taxa Exp→Mat"
            tooltip={
              dadosComercial?.taxa_exp_mat_liberada
                ? 'KPI canônico: matrículas originadas de experimentais confirmadas dividido por experimentais realizadas confirmadas.'
                : 'KPI bloqueado: aguarda regra canônica de vínculo lead → aluno → presença experimental individual.'
            }
            value={dadosComercial?.taxa_exp_mat_liberada ? dadosComercial.taxa_conversao : 'Bloqueada'}
            format={dadosComercial?.taxa_exp_mat_liberada ? 'percent' : undefined}
            subvalue={
              dadosComercial?.taxa_exp_mat_liberada
                ? `${dadosComercial.conversoes_exp_mat ?? 0}/${dadosComercial.denominador_exp_mat ?? 0} confirmadas`
                : `${dadosComercial?.pendencias_exp_mat ?? 0} pendência(s)`
            }
            variant={dadosComercial?.taxa_exp_mat_liberada ? 'emerald' : 'amber'}
          />
          <KPICard
            icon={Ticket}
            label="Ticket Médio Passaporte"
            tooltip="Valor médio do passaporte (taxa de matrícula) pago pelos novos alunos no período."
            value={dadosComercial?.ticket_passaporte ?? '--'}
            format="currency"
            subvalue={!dadosComercial ? 'Aguardando dados' : undefined}
            variant="amber"
          />
        </div>
      </div>

      {/* ===== LINHA 3: PROFESSORES ===== */}
      <div data-tour="secao-professores">
        <div className="flex items-center gap-2 mb-3">
          <Award className="w-5 h-5 text-amber-400" />
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Professores</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            icon={Users}
            label="Total Professores"
            tooltip="Quantidade de professores ativos vinculados às unidades."
            value={dadosProfessores?.total_professores ?? '--'}
            format="number"
            subvalue={dadosProfessores ? 'ativos' : 'Aguardando dados'}
            variant="cyan"
          />
          <KPICard
            icon={GraduationCap}
            label="Média Alunos/Professor"
            tooltip="Total de alunos ativos dividido pelo total de professores ativos."
            value={dadosProfessores?.media_alunos_professor ?? '--'}
            format="number"
            subvalue={!dadosProfessores ? 'Aguardando dados' : undefined}
            variant="violet"
          />
          <KPICard
            icon={RefreshCw}
            label="Taxa Renovação"
            tooltip="Percentual de contratos que foram renovados em relação ao total de contratos vencidos no período."
            value={dadosProfessores?.taxa_renovacao ?? '--'}
            target={metas.taxa_renovacao}
            format="percent"
            subvalue={!dadosProfessores ? 'Aguardando dados' : undefined}
            variant="emerald"
          />
          <KPICard
            icon={Target}
            label="Média Alunos/Turma"
            tooltip="Total de alunos ativos dividido pelo total de turmas ativas. Indicador de eficiência operacional."
            value={dadosProfessores?.media_alunos_turma ?? '--'}
            format="number"
            subvalue={dadosProfessores?.media_alunos_turma ? 'Pilar financeiro' : 'Aguardando Emusys'}
            variant="rose"
          />
        </div>
      </div>

      {/* Alertas Inteligentes */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            Alertas Inteligentes
          </h3>
          <div className="flex items-center gap-3">
            {alertas.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  {alertas.filter(a => a.severidade === 'critico').length} críticos
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  {alertas.filter(a => a.severidade === 'atencao').length} atenção
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  {alertas.filter(a => a.severidade === 'informativo').length} info
                </span>
              </div>
            )}
          </div>
        </div>
        
        {alertas.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {alertas.map((alerta, idx) => {
              const severidadeConfig = {
                critico: { bg: 'bg-red-500/10', border: 'border-red-500/30', dot: 'bg-red-500', text: 'text-red-400' },
                atencao: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', dot: 'bg-amber-500', text: 'text-amber-400' },
                informativo: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', dot: 'bg-blue-500', text: 'text-blue-400' }
              };
              const config = severidadeConfig[alerta.severidade] || severidadeConfig.informativo;
              
              const tipoIcone: Record<string, string> = {
                'CONTRATO_VENCENDO': '📋',
                'RENOVACOES_PENDENTES': '🔄',
                'CONVERSAO_BAIXA': '📉',
                'INADIMPLENCIA_ALTA': '💰',
                'TICKET_CAINDO': '🎫',
                'PROFESSOR_TURMA_BAIXA': '👨‍🏫',
                'CHURN_ALTO': '📤',
                'META_EM_RISCO': '🎯'
              };
              
              return (
                <div 
                  key={idx}
                  className={`flex flex-col gap-2 p-4 ${config.bg} rounded-xl border ${config.border} hover:scale-[1.02] transition-transform cursor-pointer`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{tipoIcone[alerta.tipo_alerta] || '⚠️'}</span>
                      <div className={`w-2 h-2 rounded-full ${config.dot}`} />
                    </div>
                    {alerta.quantidade > 1 && (
                      <span className={`text-xs font-bold ${config.text} bg-slate-900/50 px-2 py-0.5 rounded-full`}>
                        {alerta.quantidade}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{alerta.descricao}</p>
                    <p className={`text-xs ${config.text} mt-1`}>{alerta.detalhe}</p>
                    {unidade === 'todos' && (
                      <p className="text-xs text-gray-500 mt-1">{alerta.unidade_nome}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-3">✅</div>
            <p className="font-medium text-white">Tudo sob controle!</p>
            <p className="text-sm">Nenhum alerta ativo no momento</p>
          </div>
        )}
      </div>

      {/* ===== GRÁFICOS ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Evolução de Alunos */}
        <div data-tour="grafico-evolucao" className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            Evolução de Alunos Ativos (12 meses)
          </h3>
          {evolucaoAlunos.length > 0 ? (
            <EvolutionChart
              data={evolucaoAlunos.map(e => ({ name: e.mes, alunos: e.valor }))}
              lines={[{ dataKey: 'alunos', color: '#06b6d4', name: 'Alunos Ativos' }]}
            />
          ) : (
            <div className="flex items-center justify-center h-48 text-slate-500">
              <p>Dados de evolução não disponíveis</p>
            </div>
          )}
        </div>

        {/* Funil Comercial */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-violet-400" />
            Funil Comercial (Mês)
          </h3>
          {funilComercial.length > 0 ? (
            <FunnelChart
              steps={funilComercial.map(f => ({ label: f.etapa, value: f.valor, color: f.cor }))}
            />
          ) : (
            <div className="flex items-center justify-center h-48 text-slate-500">
              <p>Dados comerciais não disponíveis para este período</p>
            </div>
          )}
        </div>
      </div>

      {/* Resumo por Unidade */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Resumo por Unidade
        </h3>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-400 text-sm border-b border-slate-700">
                <th className="pb-3">Unidade</th>
                <th className="pb-3 text-right">Alunos Ativos</th>
                <th className="pb-3 text-right">Pagantes</th>
                <th className="pb-3 text-right">Ticket Médio</th>
                <th className="pb-3 text-right">Faturamento Previsto</th>
              </tr>
            </thead>
            <tbody>
              {resumoUnidades.length > 0 ? resumoUnidades.map((d) => (
                <tr key={d.unidade_id} className="border-b border-slate-700/50">
                  <td className="py-3 text-white font-medium">{d.unidade}</td>
                  <td className="py-3 text-right text-gray-300">{d.alunos_ativos}</td>
                  <td className="py-3 text-right text-gray-300">{d.alunos_pagantes}</td>
                  <td className="py-3 text-right text-gray-300">
                    {formatCurrency(d.ticket_medio)}
                  </td>
                  <td className="py-3 text-right text-emerald-400 font-medium">
                    {formatCurrency(d.faturamento_previsto)}
                  </td>
                </tr>
              )) : (
                <tr className="border-b border-slate-700/50">
                  <td className="py-4 text-slate-400" colSpan={5}>
                    Sem fonte canonica disponivel para o periodo selecionado.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900/50">
                <td className="py-3 text-white font-bold">TOTAL</td>
                <td className="py-3 text-right text-white font-bold">
                  {resumoUnidades.length > 0 
                    ? resumoUnidades.reduce((acc, d) => acc + d.alunos_ativos, 0)
                    : 0}
                </td>
                <td className="py-3 text-right text-white font-bold">
                  {resumoUnidades.length > 0 
                    ? resumoUnidades.reduce((acc, d) => acc + d.alunos_pagantes, 0)
                    : 0}
                </td>
                <td className="py-3 text-right text-white font-bold">
                  {resumoUnidades.length > 0 
                    ? formatCurrency(
                        resumoUnidades.reduce((acc, d) => acc + d.alunos_pagantes, 0) > 0
                          ? resumoUnidades.reduce((acc, d) => acc + d.faturamento_previsto, 0) / resumoUnidades.reduce((acc, d) => acc + d.alunos_pagantes, 0)
                          : 0
                      )
                    : formatCurrency(0)}
                </td>
                <td className="py-3 text-right text-emerald-400 font-bold">
                  {resumoUnidades.length > 0 
                    ? formatCurrency(resumoUnidades.reduce((acc, d) => acc + d.faturamento_previsto, 0))
                    : formatCurrency(0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>


      {/* Modal Matrículas */}
      <ModalDetalheKPI
        open={modalMatriculas}
        onClose={() => setModalMatriculas(false)}
        titulo={`Matrículas (${labelPeriodo})`}
        descricao={`Alunos que se matricularam no período — ${unidade === 'todos' ? 'Consolidado' : 'Unidade selecionada'}`}
        dados={dadosModalMatriculas}
        colunas={[
          { key: 'nome', label: 'Aluno' },
          { key: 'unidade', label: 'Unidade', render: (v: string) => <BadgeUnidade nome={v} /> },
          { key: 'data_matricula', label: 'Data Matrícula' },
          { key: 'curso', label: 'Curso', render: (v: string) => <TextoCurso nome={v} /> },
          { key: 'valor', label: 'Valor Parcela', render: (v: string) => <ValorParcela valor={v} /> },
        ]}
        carregando={carregandoModal}
        resumo={(() => {
          const total = dadosModalMatriculas.length;
          const comValor = dadosModalMatriculas.filter(d => d._valor_raw > 0);
          const somaValor = comValor.reduce((s, d) => s + d._valor_raw, 0);
          const ticketMedio = comValor.length > 0 ? somaValor / comValor.length : 0;
          const cursos = new Set(dadosModalMatriculas.map(d => d.curso).filter(c => c !== '—'));
          return [
            { label: 'Total', valor: total, icone: <UserPlus size={14} />, cor: 'text-sky-400', destaque: true },
            { label: 'Faturamento', valor: `R$ ${somaValor.toLocaleString('pt-BR')}`, icone: <DollarSign size={14} />, cor: 'text-emerald-400' },
            { label: 'Ticket Médio', valor: ticketMedio > 0 ? `R$ ${ticketMedio.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : '—', icone: <TrendingUp size={14} />, cor: 'text-amber-400' },
            { label: 'Cursos', valor: cursos.size, icone: <GraduationCap size={14} />, cor: 'text-violet-400' },
          ];
        })()}
        distribuicao={unidade === 'todos' ? {
          titulo: 'Por Unidade',
          dados: (() => {
            const contagem: Record<string, number> = {};
            dadosModalMatriculas.forEach(d => { contagem[d.unidade] = (contagem[d.unidade] || 0) + 1; });
            const cores: Record<string, string> = { 'Recreio': 'bg-violet-500/70', 'Barra': 'bg-amber-500/70', 'Campo Grande': 'bg-emerald-500/70' };
            return Object.entries(contagem)
              .sort((a, b) => b[1] - a[1])
              .map(([label, valor]) => ({ label, valor, cor: cores[label] || 'bg-slate-500/70' }));
          })(),
        } : undefined}
      />

      {/* Modal Evasões */}
      <ModalDetalheKPI
        open={modalEvasoes}
        onClose={() => setModalEvasoes(false)}
        titulo={`Evasões (${labelPeriodo})`}
        descricao={`Alunos que saíram no período — ${unidade === 'todos' ? 'Consolidado' : 'Unidade selecionada'}`}
        dados={dadosModalEvasoes}
        colunas={[
          { key: 'nome', label: 'Aluno' },
          { key: 'unidade', label: 'Unidade', render: (v: string) => <BadgeUnidade nome={v} /> },
          { key: 'data_evasao', label: 'Data' },
          { key: 'tipo', label: 'Tipo', render: (_v: string, row: any) => <BadgeTipo tipo={row.tipo} variante={row._tipo_raw === 'evasao' ? 'evasao' : 'nao_renovacao'} /> },
          { key: 'motivo', label: 'Motivo' },
        ]}
        carregando={carregandoModal}
        resumo={(() => {
          const total = dadosModalEvasoes.length;
          const evasoes = dadosModalEvasoes.filter(d => d._tipo_raw === 'evasao').length;
          const naoRenov = dadosModalEvasoes.filter(d => d._tipo_raw === 'nao_renovacao').length;
          const motivoMap: Record<string, number> = {};
          dadosModalEvasoes.forEach(d => { if (d.motivo !== '—') motivoMap[d.motivo] = (motivoMap[d.motivo] || 0) + 1; });
          const topMotivo = Object.entries(motivoMap).sort((a, b) => b[1] - a[1])[0];
          return [
            { label: 'Total Saídas', valor: total, icone: <UserMinus size={14} />, cor: 'text-red-400', destaque: true },
            { label: 'Evasões', valor: evasoes, icone: <AlertTriangle size={14} />, cor: 'text-red-400' },
            { label: 'Não Renovações', valor: naoRenov, icone: <RefreshCw size={14} />, cor: 'text-orange-400' },
            { label: 'Top Motivo', valor: topMotivo ? `${topMotivo[0]} (${topMotivo[1]})` : '—', cor: 'text-slate-300' },
          ];
        })()}
        distribuicao={unidade === 'todos' ? {
          titulo: 'Por Unidade',
          dados: (() => {
            const contagem: Record<string, number> = {};
            dadosModalEvasoes.forEach(d => { contagem[d.unidade] = (contagem[d.unidade] || 0) + 1; });
            const cores: Record<string, string> = { 'Recreio': 'bg-violet-500/70', 'Barra': 'bg-amber-500/70', 'Campo Grande': 'bg-emerald-500/70' };
            return Object.entries(contagem)
              .sort((a, b) => b[1] - a[1])
              .map(([label, valor]) => ({ label, valor, cor: cores[label] || 'bg-slate-500/70' }));
          })(),
        } : undefined}
      />

      {/* Modal Experimentais */}
      <ModalDetalheKPI
        open={modalExperimentais}
        onClose={() => setModalExperimentais(false)}
        titulo={`Experimentais Operacionais (${labelPeriodo})`}
        descricao={`Lista operacional/diagnóstica por status do funil. O card usa presença confirmada v2 — ${unidade === 'todos' ? 'Consolidado' : 'Unidade selecionada'}`}
        dados={dadosModalExperimentais}
        colunas={[
          { key: 'nome', label: 'Aluno' },
          { key: 'unidade', label: 'Unidade', render: (v: string) => <BadgeUnidade nome={v} /> },
          { key: 'data', label: 'Data' },
          { key: 'curso', label: 'Curso', render: (v: string) => <TextoCurso nome={v} /> },
          { key: 'canal', label: 'Canal' },
          { key: 'status', label: 'Tipo', render: (v: string, row: any) => <BadgeTipo tipo={v} variante={row._status_raw === 'visita_escola' ? 'nao_renovacao' : 'evasao'} /> },
        ]}
        carregando={carregandoModal}
        resumo={(() => {
          const total = dadosModalExperimentais.length;
          const realizadas = dadosModalExperimentais.filter(d => d._status_raw !== 'visita_escola').length;
          const visitas = dadosModalExperimentais.filter(d => d._status_raw === 'visita_escola').length;
          const cursos = new Set(dadosModalExperimentais.map(d => d.curso).filter(c => c !== '—'));
          return [
            { label: 'Total', valor: total, icone: <Calendar size={14} />, cor: 'text-sky-400', destaque: true },
            { label: 'Operacionais', valor: realizadas, icone: <GraduationCap size={14} />, cor: 'text-emerald-400' },
            { label: 'Visitas', valor: visitas, icone: <Users size={14} />, cor: 'text-amber-400' },
            { label: 'Cursos', valor: cursos.size, icone: <Target size={14} />, cor: 'text-violet-400' },
          ];
        })()}
        distribuicao={unidade === 'todos' ? {
          titulo: 'Por Unidade',
          dados: (() => {
            const contagem: Record<string, number> = {};
            dadosModalExperimentais.forEach(d => { contagem[d.unidade] = (contagem[d.unidade] || 0) + 1; });
            const cores: Record<string, string> = { 'Recreio': 'bg-violet-500/70', 'Barra': 'bg-amber-500/70', 'Campo Grande': 'bg-emerald-500/70' };
            return Object.entries(contagem)
              .sort((a, b) => b[1] - a[1])
              .map(([label, valor]) => ({ label, valor, cor: cores[label] || 'bg-slate-500/70' }));
          })(),
        } : undefined}
      />

      {/* Modal Taxa Conversão - v2 */}
      <ModalDetalheKPI
        open={modalConversao}
        onClose={() => setModalConversao(false)}
        titulo={
          dadosComercial?.taxa_exp_mat_liberada
            ? `Taxa Exp → Mat oficial (${labelPeriodo})`
            : `Taxa Exp → Mat bloqueada (${labelPeriodo})`
        }
        descricao={
          dadosComercial?.taxa_exp_mat_liberada
            ? `KPI canônico pela conciliação Emusys v2: conversões confirmadas / experimentais realizadas confirmadas.`
            : `Diagnóstico: não usar como KPI oficial até fechar vínculo lead → aluno → presença experimental individual.`
        }
        dados={dadosModalConversao}
        colunas={[
          { key: 'nome', label: 'Aluno' },
          { key: 'unidade', label: 'Unidade', render: (v: string) => <BadgeUnidade nome={v} /> },
          { key: 'data_exp', label: 'Data Exp.' },
          { key: 'data_matr', label: 'Data Matrícula' },
          { key: 'curso', label: 'Curso', render: (v: string) => <TextoCurso nome={v} /> },
          { key: 'canal', label: 'Canal' },
          { key: 'resultado', label: 'Resultado', render: (v: string, row: any) => (
            <BadgeTipo tipo={v} variante={row._matriculou ? 'nao_renovacao' : 'evasao'} />
          ) },
        ]}
        carregando={carregandoModal}
        resumo={(() => {
          const total = dadosModalConversao.length;
          const matriculou = dadosModalConversao.filter(d => d._matriculou).length;
          const naoMatriculou = total - matriculou;
          const taxaLiberada = dadosComercial?.taxa_exp_mat_liberada === true;
          return [
            {
              label: taxaLiberada ? 'Denominador v2' : 'Exp. diagnóstico',
              valor: taxaLiberada ? dadosComercial?.denominador_exp_mat ?? 0 : total,
              icone: <Calendar size={14} />,
              cor: 'text-sky-400',
              destaque: true,
            },
            {
              label: taxaLiberada ? 'Conversões confirmadas' : 'Matricularam',
              valor: taxaLiberada ? dadosComercial?.conversoes_exp_mat ?? 0 : matriculou,
              icone: <GraduationCap size={14} />,
              cor: 'text-emerald-400',
            },
            {
              label: taxaLiberada ? 'Pendências' : 'Não Matricularam',
              valor: taxaLiberada ? dadosComercial?.pendencias_exp_mat ?? 0 : naoMatriculou,
              icone: <Users size={14} />,
              cor: taxaLiberada ? 'text-slate-300' : 'text-amber-400',
            },
            {
              label: 'Taxa oficial',
              valor: taxaLiberada ? `${(dadosComercial?.taxa_conversao ?? 0).toFixed(1)}%` : 'Bloqueada',
              icone: <Percent size={14} />,
              cor: taxaLiberada ? 'text-emerald-400' : 'text-yellow-300',
            },
          ];
        })()}
        distribuicao={unidade === 'todos' ? {
          titulo: 'Por Unidade',
          dados: (() => {
            const contagem: Record<string, number> = {};
            dadosModalConversao.forEach(d => { contagem[d.unidade] = (contagem[d.unidade] || 0) + 1; });
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


export default DashboardPage;
