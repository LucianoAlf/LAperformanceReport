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
  RefreshCw
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

interface DashboardData {
  alunosAtivos: number;
  alunosPagantes: number;
  ticketMedio: number;
  faturamentoPrevisto: number;
  tempoMedioPermanencia: number;
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
  taxa_conversao: number;
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

export function DashboardPage() {
  useSetPageTitle({
    titulo: 'Dashboard',
    subtitulo: 'Visão consolidada de gestão, comercial e professores',
    icone: BarChart3,
    iconeCor: 'text-cyan-400',
    iconeWrapperCor: 'bg-cyan-500/20',
  });

  const [dados, setDados] = useState<DashboardData[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [dadosGestao, setDadosGestao] = useState<DadosGestao | null>(null);
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
          aluno_nome, data, motivo, tipo,
          unidades:unidade_id!inner(nome)
        `)
        .in('tipo', ['evasao', 'nao_renovacao'])
        .gte('data', dataInicio)
        .lt('data', dataFimStr)
        .order('data', { ascending: false });

      if (unidade !== 'todos') {
        query = query.eq('unidade_id', unidade);
      }

      const { data } = await query;
      setDadosModalEvasoes((data || []).map((m: any) => ({
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

  // Fetch experimentais realizadas do período para o modal
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

  useEffect(() => {
    async function fetchDados() {
      try {
        // Buscar dados do dashboard (unidades)
        // IMPORTANTE: Filtrar por unidade se não for consolidado
        let dashboardQuery = supabase
          .from('vw_dashboard_unidade')
          .select('*');
        
        if (unidade !== 'todos') {
          dashboardQuery = dashboardQuery.eq('unidade_id', unidade);
        }
        
        const { data: dashboardData } = await dashboardQuery;

        if (dashboardData) {
          setDados(dashboardData);
        }

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
        // Verificar se é período atual ou histórico
        // Período atual = ano atual E o range inclui o mês atual E é apenas 1 mês
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;
        const isPeriodoAtual = ano === currentYear && mesInicio === currentMonth && mesFim === currentMonth;
        const isHistorico = !isPeriodoAtual;

        let gestaoData: any[] = [];

        if (isPeriodoAtual) {
          // PERÍODO ATUAL: usar view em tempo real
          let gestaoQuery = supabase
            .from('vw_kpis_gestao_mensal')
            .select('*')
            .eq('ano', currentYear)
            .eq('mes', currentMonth);
          
          if (unidade !== 'todos') {
            gestaoQuery = gestaoQuery.eq('unidade_id', unidade);
          }

          const { data } = await gestaoQuery;
          gestaoData = data || [];
        } else {
          // PERÍODO HISTÓRICO: tentar dados_mensais primeiro, senão calcular das tabelas base
          let historicoQuery = supabase
            .from('dados_mensais')
            .select('*')
            .eq('ano', ano)
            .gte('mes', mesInicio)
            .lte('mes', mesFim);

          if (unidade !== 'todos') {
            historicoQuery = historicoQuery.eq('unidade_id', unidade);
          }

          const { data } = await historicoQuery;
          if (data && data.length > 0) {
            gestaoData = data.map((d: any) => ({
              total_alunos_ativos: d.alunos_pagantes || 0,
              total_alunos_pagantes: d.alunos_pagantes || 0,
              novas_matriculas: d.novas_matriculas || 0,
              evasoes: d.evasoes || 0,
              ticket_medio: Number(d.ticket_medio) || 0,
              ano: d.ano,
              mes: d.mes,
            }));
          } else {
            // FALLBACK: calcular KPIs diretamente das tabelas base
            // Buscar alunos ativos/pagantes
            let alunosQuery = supabase
              .from('alunos')
              .select('id, status, tipo_matricula_id, is_segundo_curso, valor_parcela, tipos_matricula(codigo, conta_como_pagante)')
              .in('status', ['ativo', 'trancado']);

            if (unidade !== 'todos') {
              alunosQuery = alunosQuery.eq('unidade_id', unidade);
            }

            // Buscar matrículas do período
            let matriculasQuery = supabase
              .from('alunos')
              .select('id')
              .gte('data_matricula', `${ano}-${String(mesInicio).padStart(2, '0')}-01`)
              .lt('data_matricula', `${ano}-${String(mesFim + 1).padStart(2, '0')}-01`);

            if (unidade !== 'todos') {
              matriculasQuery = matriculasQuery.eq('unidade_id', unidade);
            }

            // Buscar evasões do período via vw_kpis_retencao_mensal
            let evasoesQuery = supabase
              .from('vw_kpis_retencao_mensal')
              .select('total_evasoes')
              .eq('ano', ano)
              .gte('mes', mesInicio)
              .lte('mes', mesFim);

            if (unidade !== 'todos') {
              evasoesQuery = evasoesQuery.eq('unidade_id', unidade);
            }

            const [alunosRes, matriculasRes, evasoesRes] = await Promise.all([
              alunosQuery,
              matriculasQuery,
              evasoesQuery
            ]);

            const alunosData = alunosRes.data || [];
            const totalAtivos = alunosData.filter((a: any) => !a.is_segundo_curso).length;
            const pagantes = alunosData.filter((a: any) => 
              (a.tipos_matricula as any)?.conta_como_pagante && !a.is_segundo_curso
            );
            const totalPagantes = pagantes.length;
            const ticketMedio = pagantes.length > 0 
              ? pagantes.reduce((sum: number, a: any) => sum + (Number(a.valor_parcela) || 0), 0) / pagantes.length 
              : 0;
            const novasMatriculas = matriculasRes.data?.length || 0;
            const totalEvasoes = (evasoesRes.data || []).reduce((sum: number, e: any) => sum + (e.total_evasoes || 0), 0);

            gestaoData = [{
              total_alunos_ativos: totalAtivos,
              total_alunos_pagantes: totalPagantes,
              novas_matriculas: novasMatriculas,
              total_evasoes: totalEvasoes,
              ticket_medio: Math.round(ticketMedio),
              ano: ano,
              mes: mesInicio,
            }];
          }
        }
        
        if (gestaoData && gestaoData.length > 0) {
          // Consolidar dados - MÉDIA para alunos, SOMA para matrículas/evasões
          const consolidado = gestaoData.reduce((acc: any, d: any) => ({
            total_alunos_ativos_sum: acc.total_alunos_ativos_sum + (d.total_alunos_ativos || 0),
            total_alunos_pagantes_sum: acc.total_alunos_pagantes_sum + (d.total_alunos_pagantes || 0),
            novas_matriculas: acc.novas_matriculas + (d.novas_matriculas || 0),
            evasoes: acc.evasoes + (d.total_evasoes || d.evasoes || 0),
            ticket_medio_ponderado_sum: acc.ticket_medio_ponderado_sum + ((Number(d.ticket_medio) || 0) * (d.total_alunos_pagantes || 0)),
            count: acc.count + 1
          }), { total_alunos_ativos_sum: 0, total_alunos_pagantes_sum: 0, novas_matriculas: 0, evasoes: 0, ticket_medio_ponderado_sum: 0, count: 0 });

          // Calcular número de meses únicos para média correta
          const mesesUnicos = new Set(gestaoData.map((d: any) => `${d.ano}-${d.mes}`)).size || 1;

          setDadosGestao({
            // Alunos: usar MÉDIA (snapshot mensal) — total_alunos_ativos inclui ativo + trancado
            alunos_ativos: mesesUnicos > 0 ? Math.round(consolidado.total_alunos_ativos_sum / mesesUnicos) : 0,
            alunos_pagantes: mesesUnicos > 0 ? Math.round(consolidado.total_alunos_pagantes_sum / mesesUnicos) : 0,
            // Matrículas/Evasões: usar SOMA (eventos acumulam)
            matriculas_mes: consolidado.novas_matriculas,
            evasoes_mes: consolidado.evasoes,
            // Ticket: usar MÉDIA PONDERADA por alunos pagantes
            ticket_medio: consolidado.total_alunos_pagantes_sum > 0 ? consolidado.ticket_medio_ponderado_sum / consolidado.total_alunos_pagantes_sum : 0
          });
        } else {
          setDadosGestao(null);
        }

        // ===== DADOS COMERCIAIS =====
        // CORREÇÃO: Usar tabela leads diretamente (mesma fonte do TabComercialNew.tsx)
        // Para histórico, usar vw_kpis_comercial_historico
        // Para mês atual, buscar da tabela leads em tempo real

        if (isHistorico) {
          // Período histórico: usar vw_kpis_comercial_historico com range de meses
          let comercialQuery = supabase
            .from('vw_kpis_comercial_historico')
            .select('*')
            .eq('ano', ano)
            .gte('mes', mes)
            .lte('mes', mesFim);

          if (unidade !== 'todos') {
            comercialQuery = comercialQuery.eq('unidade_id', unidade);
          }

          const { data: comercialData } = await comercialQuery;
          
          if (comercialData && comercialData.length > 0) {
            const leads = comercialData.reduce((acc: number, d: any) => acc + (d.total_leads || 0), 0);
            const experimentais = comercialData.reduce((acc: number, d: any) => 
              acc + (d.experimentais_realizadas || d.aulas_experimentais || 0), 0);
            const matriculas = comercialData.reduce((acc: number, d: any) => 
              acc + (d.novas_matriculas || d.novas_matriculas_total || 0), 0);
            const taxaConversao = experimentais > 0 ? (matriculas / experimentais) * 100 : 0;
            const ticketPassaporte = comercialData.reduce((acc: number, d: any) =>
              acc + (Number(d.ticket_medio_passaporte) || 0), 0) / comercialData.length;

            setDadosComercial({
              leads_mes: leads,
              experimentais_realizadas: experimentais,
              taxa_conversao: taxaConversao,
              ticket_passaporte: Math.round(ticketPassaporte)
            });

            setFunilComercial([
              { etapa: 'Leads', valor: leads, cor: '#3b82f6' },
              { etapa: 'Experimentais', valor: experimentais, cor: '#8b5cf6' },
              { etapa: 'Matrículas', valor: matriculas, cor: '#10b981' }
            ]);
          } else {
            setDadosComercial(null);
            setFunilComercial([]);
          }
        } else {
          // Mês atual: buscar da tabela leads em tempo real (mesma lógica do TabComercialNew.tsx)
          const startDate = `${ano}-${String(mes).padStart(2, '0')}-01`;
          const endDate = `${ano}-${String(mes).padStart(2, '0')}-${new Date(ano, mes, 0).getDate()}`;
          
          let leadsQuery = supabase
            .from('leads')
            .select('id, status, quantidade, data_contato')
            .gte('data_contato', startDate)
            .lte('data_contato', endDate);

          if (unidade !== 'todos') {
            leadsQuery = leadsQuery.eq('unidade_id', unidade);
          }

          const { data: leadsData } = await leadsQuery;
          const leads = leadsData || [];

          // Contagens usando mesma lógica do TabComercialNew.tsx
          const totalLeads = leads.length;
          // REGRA DE NEGÓCIO: Exp/Visita = realizada + visita_escola (não inclui agendada/faltou)
          const expTotal = leads.filter((l: any) => 
            ['experimental_realizada', 'compareceu', 'visita_escola'].includes(l.status)
          ).reduce((acc: number, l: any) => acc + (l.quantidade || 1), 0);
          const novasMatriculas = leads.filter((l: any) => 
            ['matriculado', 'convertido'].includes(l.status)
          ).reduce((acc: number, l: any) => acc + (l.quantidade || 1), 0);
          const taxaConversao = expTotal > 0 ? (novasMatriculas / expTotal) * 100 : 0;

          // Buscar ticket médio passaporte dos alunos matriculados no mês
          let passaporteQuery = supabase
            .from('alunos')
            .select('valor_passaporte')
            .gte('data_matricula', startDate)
            .lte('data_matricula', endDate)
            .gt('valor_passaporte', 0);

          if (unidade !== 'todos') {
            passaporteQuery = passaporteQuery.eq('unidade_id', unidade);
          }

          const { data: passaporteData } = await passaporteQuery;
          const ticketPassaporte = passaporteData && passaporteData.length > 0
            ? passaporteData.reduce((sum: number, a: any) => sum + Number(a.valor_passaporte), 0) / passaporteData.length
            : 0;

          setDadosComercial({
            leads_mes: totalLeads,
            experimentais_realizadas: expTotal,
            taxa_conversao: taxaConversao,
            ticket_passaporte: Math.round(ticketPassaporte)
          });

          setFunilComercial([
            { etapa: 'Leads', valor: totalLeads, cor: '#3b82f6' },
            { etapa: 'Exp/Visita', valor: expTotal, cor: '#8b5cf6' },
            { etapa: 'Matrículas', valor: novasMatriculas, cor: '#10b981' }
          ]);
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
          .select('tipo, unidade_id')
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
          const totalRenovacoes = renovacoesData.filter((r: any) => r.tipo === 'renovacao').length;
          const totalContratos = renovacoesData.length; // renovacao + nao_renovacao
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

        // ===== EVOLUÇÃO DE ALUNOS (12 meses) =====
        // Histórico vem de dados_mensais; mês corrente vem de vw_dashboard_unidade (tempo real)
        // IMPORTANTE: Filtrar por unidade se não for consolidado
        const hojeAno = new Date().getFullYear();
        const hojeMes = new Date().getMonth() + 1;

        let evolucaoQuery = supabase
          .from('dados_mensais')
          .select('ano, mes, alunos_pagantes, unidade_id')
          .gte('ano', ano - 1)
          .order('ano', { ascending: true })
          .order('mes', { ascending: true });

        if (unidade !== 'todos') {
          evolucaoQuery = evolucaoQuery.eq('unidade_id', unidade);
        }

        let realtimeAtualQuery = supabase
          .from('vw_dashboard_unidade')
          .select('alunos_pagantes, unidade_id');

        if (unidade !== 'todos') {
          realtimeAtualQuery = realtimeAtualQuery.eq('unidade_id', unidade);
        }

        const [{ data: evolucaoData }, { data: realtimeAtualData }] = await Promise.all([
          evolucaoQuery,
          realtimeAtualQuery,
        ]);

        const pagantesAtual = (realtimeAtualData || []).reduce(
          (acc: number, d: any) => acc + (Number(d.alunos_pagantes) || 0),
          0
        );

        if (evolucaoData) {
          const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
          // Excluir mês corrente do histórico — será sobrescrito pelo valor em tempo real
          const dadosHistoricos = evolucaoData.filter(
            (d: any) => !(d.ano === hojeAno && d.mes === hojeMes)
          );

          const agrupado = dadosHistoricos.reduce((acc: Record<string, number>, d: any) => {
            const key = `${mesesNomes[d.mes - 1]}/${String(d.ano).slice(-2)}`;
            acc[key] = (acc[key] || 0) + (d.alunos_pagantes || 0);
            return acc;
          }, {});

          const keyAtual = `${mesesNomes[hojeMes - 1]}/${String(hojeAno).slice(-2)}`;
          agrupado[keyAtual] = pagantesAtual;

          const evolucao = Object.entries(agrupado)
            .slice(-12)
            .map(([mes, valor]) => ({ mes, valor: valor as number }));

          setEvolucaoAlunos(evolucao);
        }

        // ===== RESUMO POR UNIDADE (do período selecionado) =====
        // Usar isPeriodoAtual já calculado acima para decidir fonte de dados
        // IMPORTANTE: Filtrar por unidade se não for consolidado

        if (isPeriodoAtual) {
          // Para período atual, usar vw_dashboard_unidade (dados em tempo real)
          let resumoQuery = supabase
            .from('vw_dashboard_unidade')
            .select('*');
          
          if (unidade !== 'todos') {
            resumoQuery = resumoQuery.eq('unidade_id', unidade);
          }
          
          const { data: dashboardUnidades } = await resumoQuery;

          if (dashboardUnidades) {
            const resumo: ResumoUnidade[] = dashboardUnidades.map((d: any) => ({
              unidade: d.unidade_nome,
              unidade_id: d.unidade_id,
              alunos_ativos: d.alunos_ativos || 0,
              alunos_pagantes: d.alunos_pagantes || 0,
              ticket_medio: parseFloat(d.ticket_medio || 0),
              faturamento_previsto: parseFloat(d.mrr || 0),
              tempo_medio: parseFloat(d.tempo_permanencia || 0)
            }));
            setResumoUnidades(resumo);
          }
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
                const alunosPagantes = dadosUnidade.reduce((acc: number, d: any) => acc + (d.alunos_pagantes || 0), 0);
                const ticketTotal = dadosUnidade.reduce((acc: number, d: any) => acc + parseFloat(d.ticket_medio || 0), 0);
                const ticketMedio = dadosUnidade.length > 0 ? ticketTotal / dadosUnidade.length : 0;
                const faturamento = alunosPagantes * ticketMedio;

                return {
                  unidade: u.nome,
                  unidade_id: u.id,
                  alunos_ativos: alunosPagantes,
                  alunos_pagantes: alunosPagantes,
                  ticket_medio: ticketMedio,
                  faturamento_previsto: faturamento,
                  tempo_medio: 0
                };
              });
              setResumoUnidades(resumo);
            } else {
              // Sem dados históricos, usar dados em tempo real como fallback
              let fallbackQuery = supabase
                .from('vw_dashboard_unidade')
                .select('*');
              
              if (unidade !== 'todos') {
                fallbackQuery = fallbackQuery.eq('unidade_id', unidade);
              }
              
              const { data: dashboardUnidades } = await fallbackQuery;

              if (dashboardUnidades) {
                const resumo: ResumoUnidade[] = dashboardUnidades.map((d: any) => ({
                  unidade: d.unidade_nome,
                  unidade_id: d.unidade_id,
                  alunos_ativos: d.alunos_ativos || 0,
                  alunos_pagantes: d.alunos_pagantes || 0,
                  ticket_medio: parseFloat(d.ticket_medio || 0),
                  faturamento_previsto: parseFloat(d.mrr || 0),
                  tempo_medio: parseFloat(d.tempo_permanencia || 0)
                }));
                setResumoUnidades(resumo);
              }
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

  // Calcular totais consolidados
  const totais = dados.reduce(
    (acc, d: any) => ({
      alunosAtivos: acc.alunosAtivos + (d.alunos_ativos || 0),
      alunosPagantes: acc.alunosPagantes + (d.alunos_pagantes || 0),
      faturamentoPrevisto: acc.faturamentoPrevisto + parseFloat(d.faturamento_previsto || 0),
    }),
    { alunosAtivos: 0, alunosPagantes: 0, faturamentoPrevisto: 0 }
  );

  const ticketMedioGeral = dados.length > 0
    ? dados.reduce((sum: number, d: any) => sum + parseFloat(d.ticket_medio || 0), 0) / dados.length
    : 0;

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            dataTour="card-alunos"
            icon={Users}
            label="Pagantes"
            tooltip="Total de alunos ativos com tipo de matrícula pagante (exclui bolsistas integrais). Não conta segundo curso."
            value={dadosGestao?.alunos_pagantes || totais.alunosPagantes}
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
            value={dadosGestao?.ticket_medio ?? ticketMedioGeral}
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
            value={dadosComercial?.leads_mes ?? '--'}
            target={metas.leads}
            format="number"
            subvalue={!dadosComercial ? 'Aguardando dados' : undefined}
            variant="cyan"
          />
          <KPICard
            icon={Calendar}
            label="Experimentais Realizadas"
            tooltip="Aulas experimentais que foram efetivamente realizadas (aluno compareceu) no período. Clique para ver a lista."
            value={dadosComercial?.experimentais_realizadas ?? '--'}
            target={metas.experimentais}
            format="number"
            subvalue={!dadosComercial ? 'Aguardando dados' : undefined}
            variant="violet"
            onClick={() => { fetchExperimentais(); setModalExperimentais(true); }}
          />
          <KPICard
            icon={Percent}
            label="Taxa Conversão"
            tooltip="Percentual de experimentais realizadas que se converteram em matrículas. Fórmula: matrículas / experimentais × 100."
            value={dadosComercial?.taxa_conversao ?? '--'}
            format="percent"
            subvalue={!dadosComercial ? 'Aguardando dados' : undefined}
            variant="emerald"
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
            Evolução de Alunos (12 meses)
          </h3>
          {evolucaoAlunos.length > 0 ? (
            <EvolutionChart
              data={evolucaoAlunos.map(e => ({ name: e.mes, alunos: e.valor }))}
              lines={[{ dataKey: 'alunos', color: '#06b6d4', name: 'Alunos' }]}
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
              )) : dados.map((d: any) => (
                <tr key={d.unidade} className="border-b border-slate-700/50">
                  <td className="py-3 text-white font-medium">{d.unidade}</td>
                  <td className="py-3 text-right text-gray-300">{d.alunos_ativos}</td>
                  <td className="py-3 text-right text-gray-300">{d.alunos_pagantes}</td>
                  <td className="py-3 text-right text-gray-300">
                    R$ {parseFloat(d.ticket_medio || 0).toFixed(0)}
                  </td>
                  <td className="py-3 text-right text-emerald-400 font-medium">
                    R$ {parseFloat(d.faturamento_previsto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900/50">
                <td className="py-3 text-white font-bold">TOTAL</td>
                <td className="py-3 text-right text-white font-bold">
                  {resumoUnidades.length > 0 
                    ? resumoUnidades.reduce((acc, d) => acc + d.alunos_ativos, 0)
                    : totais.alunosAtivos}
                </td>
                <td className="py-3 text-right text-white font-bold">
                  {resumoUnidades.length > 0 
                    ? resumoUnidades.reduce((acc, d) => acc + d.alunos_pagantes, 0)
                    : totais.alunosPagantes}
                </td>
                <td className="py-3 text-right text-white font-bold">
                  {resumoUnidades.length > 0 
                    ? formatCurrency(resumoUnidades.reduce((acc, d) => acc + d.ticket_medio, 0) / resumoUnidades.length)
                    : `R$ ${ticketMedioGeral.toFixed(0)}`}
                </td>
                <td className="py-3 text-right text-emerald-400 font-bold">
                  {resumoUnidades.length > 0 
                    ? formatCurrency(resumoUnidades.reduce((acc, d) => acc + d.faturamento_previsto, 0))
                    : `R$ ${totais.faturamentoPrevisto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
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
        titulo={`Experimentais Realizadas (${labelPeriodo})`}
        descricao={`Aulas experimentais realizadas no período — ${unidade === 'todos' ? 'Consolidado' : 'Unidade selecionada'}`}
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
            { label: 'Realizadas', valor: realizadas, icone: <GraduationCap size={14} />, cor: 'text-emerald-400' },
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
    </div>
  );
}


export default DashboardPage;
