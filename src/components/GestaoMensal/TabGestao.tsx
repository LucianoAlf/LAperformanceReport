import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/useToast';
import { Users, DollarSign, Percent, Clock, AlertTriangle, Wallet, Calendar, TrendingDown, RefreshCw, UserMinus, Info, XCircle, UserX, CheckCircle, Bell, Star, CreditCard, TrendingUp, Target, UserPlus, GraduationCap, Ticket, Music, Baby, Lock, Unlock } from 'lucide-react';
import { KPICard } from '@/components/ui/KPICard';
import { DistributionChart } from '@/components/ui/DistributionChart';
import { DonutChart } from '@/components/ui/DonutChart';
import { EvolutionChart } from '@/components/ui/EvolutionChart';
import { RankingTable } from '@/components/ui/RankingTable';
import { ComparisonChart } from '@/components/ui/ComparisonChart';
import { AreaChart } from '@/components/ui/AreaChart';
import { Tooltip } from '@/components/ui/Tooltip';
import { formatCurrency, getMesNomeCurto } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useMetasKPI } from '@/hooks/useMetasKPI';
import { COMPETENCIA_FECHADA_MESSAGE, getCompetenciaAbertaAlertCopy, useCompetenciaMensalStatus } from '@/hooks/useCompetenciaMensalStatus';
import { ModalPermanenciaDetalhe } from './ModalPermanenciaDetalhe';
import { ModalDetalheKPI, BadgeUnidade, TextoCurso, ValorParcela, BadgeTipo } from '@/components/App/Dashboard/ModalDetalheKPI';

interface TabGestaoProps {
  ano: number;
  mes: number;
  mesFim?: number; // Para filtros de perÃ­odo (trimestre, semestre, anual)
  unidade: string;
}

type SubTabId = 'alunos' | 'financeiro' | 'retencao';

const subTabs = [
  { id: 'alunos' as const, label: 'Alunos', icon: Users },
  { id: 'financeiro' as const, label: 'Financeiro', icon: DollarSign },
  { id: 'retencao' as const, label: 'RetenÃ§Ã£o', icon: TrendingDown },
];

interface DadosGestao {
  // Alunos
  total_alunos_ativos: number;
  total_alunos_pagantes: number;
  total_bolsistas_integrais: number;
  total_bolsistas_parciais: number;
  total_banda: number;
  novas_matriculas: number;
  evasoes: number;
  saldo_liquido: number;
  total_la_kids: number;
  total_la_adultos: number;
  total_somente_banda_segundo: number;
  distribuicao_faixa_etaria: { name: string; value: number }[];
  
  // Financeiro
  ticket_medio: number;
  mrr: number;
  arr: number;
  faturamento_previsto: number;
  faturamento_realizado: number;
  inadimplencia: number;
  inadimplencia_pct: number;
  ltv_medio: number;
  ticket_medio_passaporte: number;
  reajuste_pct: number;
  
  // RetenÃ§Ã£o
  churn_rate: number;
  renovacoes: number;
  nao_renovacoes: number;
  renovacoes_pct: number;
  cancelamentos: number;
  cancelamento_pct: number;
  aviso_previo: number;
  mrr_perdido: number;
  
  // Indicadores
  tempo_permanencia: number;
  nps_evasoes: number;
  renovacoes_pendentes: number;
  total_evasoes: number;
  
  // DistribuiÃ§Ãµes (grÃ¡ficos)
  matriculas_por_curso: { name: string; value: number }[];
  matriculas_por_professor: { id: number; nome: string; valor: number; subvalor?: string }[];
  evasoes_por_professor: { id: number; nome: string; valor: number; subvalor?: string }[];
  evasoes_por_curso: { name: string; value: number }[];
  motivos_nao_renovacao: { name: string; value: number }[];
  motivos_cancelamento: { name: string; value: number }[];
}

export function TabGestao({ ano, mes, mesFim, unidade }: TabGestaoProps) {
  const toast = useToast();
  const [confirmRecalcularAnalytics, setConfirmRecalcularAnalytics] = useState(false);
  const [recalculandoAnalytics, setRecalculandoAnalytics] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('alunos');
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<DadosGestao | null>(null);
  
  // Buscar metas do perÃ­odo
  const unidadeIdParaMetas = unidade === 'todos' ? null : unidade;
  const { metas } = useMetasKPI(unidadeIdParaMetas, ano, mes);
  const [dadosAnterior, setDadosAnterior] = useState<Partial<DadosGestao> | null>(null);
  const [evolucao, setEvolucao] = useState<any[]>([]);
  const [distribuicao, setDistribuicao] = useState<any[]>([]);
  
  // Estados para grÃ¡ficos financeiros
  const [evolucaoMRR, setEvolucaoMRR] = useState<any[]>([]);
  const [previstoRealizado, setPrevistoRealizado] = useState<any[]>([]);
  const [receitaPorUnidade, setReceitaPorUnidade] = useState<any[]>([]);
  const [evolucaoInadimplencia, setEvolucaoInadimplencia] = useState<any[]>([]);
  const [evolucaoTicketMedio, setEvolucaoTicketMedio] = useState<any[]>([]);
  const [evolucaoReajuste, setEvolucaoReajuste] = useState<any[]>([]);
  const [mediaTicketAnual, setMediaTicketAnual] = useState<number>(0);
  const [mediaReajusteAnual, setMediaReajusteAnual] = useState<number>(0);
  
  // Estados para grÃ¡ficos de retenÃ§Ã£o
  const [evolucaoChurn, setEvolucaoChurn] = useState<any[]>([]);
  const [evolucaoTaxaRenovacao, setEvolucaoTaxaRenovacao] = useState<any[]>([]);

  // Estados para comparativos histÃ³ricos
  const [dadosMesAnterior, setDadosMesAnterior] = useState<any | null>(null);
  const [dadosAnoAnterior, setDadosAnoAnterior] = useState<any | null>(null);

  // Modal de drill-down de permanÃªncia
  const [modalPermanenciaOpen, setModalPermanenciaOpen] = useState(false);
  
  const competenciaMensal = useCompetenciaMensalStatus({
    unidadeId: unidade,
    ano,
    mes,
  });
  const mesFechado = competenciaMensal.bloqueiaEscrita;
  const recalcBloqueadoAnalytics = competenciaMensal.loading || competenciaMensal.bloqueiaEscrita;
  const alertaCompetenciaAberta = getCompetenciaAbertaAlertCopy(ano, mes);
  const competenciaBadgeClasses = competenciaMensal.bloqueiaEscrita
    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
    : 'bg-slate-800/70 border-slate-600 text-slate-300';

  function avisarCompetenciaBloqueada() {
    toast.error(COMPETENCIA_FECHADA_MESSAGE);
  }

  function solicitarRecalculoAnalytics() {
    if (competenciaMensal.loading) {
      toast.info('Validando competÃªncia', 'Aguarde a confirmaÃ§Ã£o do status antes de recalcular.');
      return;
    }

    if (competenciaMensal.bloqueiaEscrita) {
      avisarCompetenciaBloqueada();
      return;
    }

    setConfirmRecalcularAnalytics(true);
  }

  async function confirmarRecalculoAnalytics() {
    if (competenciaMensal.bloqueiaEscrita) {
      setConfirmRecalcularAnalytics(false);
      avisarCompetenciaBloqueada();
      return;
    }

    setRecalculandoAnalytics(true);
    try {
      const { data, error } = await supabase.rpc('recalcular_dados_mensais', {
        p_ano: ano, p_mes: mes, p_unidade_id: unidade
      });
      if (error) throw error;
      toast.success('Dados recalculados!', `${data?.alunos_ativos || 0} ativos, ${data?.novas_matriculas || 0} matrÃ­culas, ${data?.evasoes || 0} evasÃµes`);
      window.location.reload();
    } catch (err: any) {
      toast.error('Erro ao recalcular', err.message);
    } finally {
      setRecalculandoAnalytics(false);
      setConfirmRecalcularAnalytics(false);
    }
  }

  // Estados dos modais de detalhamento
  const [modalAberto, setModalAberto] = useState<'matriculas' | 'evasoes' | 'banda' | 'bolsista_int' | 'bolsista_parc' | null>(null);
  const [dadosModal, setDadosModal] = useState<any[]>([]);
  const [carregandoModal, setCarregandoModal] = useState(false);

  // Usar mesFim se fornecido, senÃ£o usar mes (para filtro mensal)
  const mesInicio = mes;
  const mesFinal = mesFim || mes;

  // Fetch para modais de detalhamento
  const fetchModalAlunos = async (tipo: 'matriculas' | 'banda' | 'bolsista_int' | 'bolsista_parc') => {
    setCarregandoModal(true);
    try {
      const dataInicio = `${ano}-${String(mesInicio).padStart(2, '0')}-01`;
      const dataFimStr = mesFinal === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mesFinal + 1).padStart(2, '0')}-01`;

      if (tipo === 'matriculas') {
        let query = supabase
          .from('alunos')
          .select('nome, data_matricula, valor_parcela, unidades:unidade_id!inner(nome), cursos:curso_id!left(nome, is_projeto_banda), tipos_matricula:tipo_matricula_id!left(codigo)')
          .not('data_matricula', 'is', null)
          .or('is_segundo_curso.is.null,is_segundo_curso.eq.false')
          .gte('data_matricula', dataInicio)
          .lt('data_matricula', dataFimStr)
          .order('data_matricula', { ascending: false });
        if (unidade !== 'todos') query = query.eq('unidade_id', unidade);
        const { data } = await query;
        const filtrados = (data || []).filter((a: any) => {
          const codigo = a.tipos_matricula?.codigo;
          if (codigo === 'BOLSISTA_INT' || codigo === 'BOLSISTA_PARC') return false;
          if (a.cursos?.is_projeto_banda) return false;
          if (a.cursos?.nome?.toLowerCase().includes('canto coral')) return false;
          return true;
        });
        setDadosModal(filtrados.map((a: any) => ({
          nome: a.nome, unidade: a.unidades?.nome || 'â€”',
          data_matricula: a.data_matricula ? new Date(a.data_matricula + 'T12:00:00').toLocaleDateString('pt-BR') : 'â€”',
          curso: a.cursos?.nome || 'â€”',
          valor: a.valor_parcela ? `R$ ${Number(a.valor_parcela).toLocaleString('pt-BR')}` : 'â€”',
        })));
      } else if (tipo === 'banda') {
        let query = supabase
          .from('alunos')
          .select('nome, data_matricula, valor_parcela, dia_aula, horario_aula, unidades:unidade_id!inner(nome), cursos:curso_id!inner(nome, is_projeto_banda), professores:professor_atual_id!left(nome)')
          .in('status', ['ativo', 'trancado'])
          .eq('cursos.is_projeto_banda', true)
          .order('nome');
        if (unidade !== 'todos') query = query.eq('unidade_id', unidade);
        const { data } = await query;
        setDadosModal((data || []).map((a: any) => ({
          nome: a.nome, unidade: a.unidades?.nome || 'â€”',
          curso: a.cursos?.nome || 'â€”', professor: a.professores?.nome || 'â€”',
          dia: a.dia_aula || 'â€”', horario: a.horario_aula || 'â€”',
        })));
      } else {
        // bolsista_int ou bolsista_parc
        const codigoBolsista = tipo === 'bolsista_int' ? 'BOLSISTA_INT' : 'BOLSISTA_PARC';
        let query = supabase
          .from('alunos')
          .select('nome, data_matricula, valor_parcela, unidades:unidade_id!inner(nome), cursos:curso_id!left(nome), tipos_matricula:tipo_matricula_id!inner(codigo), professores:professor_atual_id!left(nome)')
          .in('status', ['ativo', 'trancado'])
          .eq('tipos_matricula.codigo', codigoBolsista)
          .or('is_segundo_curso.is.null,is_segundo_curso.eq.false')
          .order('nome');
        if (unidade !== 'todos') query = query.eq('unidade_id', unidade);
        const { data } = await query;
        setDadosModal((data || []).map((a: any) => ({
          nome: a.nome, unidade: a.unidades?.nome || 'â€”',
          curso: a.cursos?.nome || 'â€”', professor: a.professores?.nome || 'â€”',
          valor: a.valor_parcela ? `R$ ${Number(a.valor_parcela).toLocaleString('pt-BR')}` : 'R$ 0',
        })));
      }
    } finally {
      setCarregandoModal(false);
    }
  };

  const fetchModalEvasoes = async () => {
    setCarregandoModal(true);
    try {
      const dataInicio = `${ano}-${String(mesInicio).padStart(2, '0')}-01`;
      const dataFimStr = mesFinal === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mesFinal + 1).padStart(2, '0')}-01`;
      let query = supabase
        .from('movimentacoes_admin')
        .select('aluno_nome, data, motivo, tipo, unidades:unidade_id!inner(nome)')
        .in('tipo', ['evasao', 'nao_renovacao'])
        .gte('data', dataInicio)
        .lt('data', dataFimStr)
        .order('data', { ascending: false });
      if (unidade !== 'todos') query = query.eq('unidade_id', unidade);
      const { data } = await query;
      setDadosModal((data || []).map((m: any) => ({
        nome: m.aluno_nome || 'â€”', unidade: m.unidades?.nome || 'â€”',
        data_evasao: m.data ? new Date(m.data + 'T12:00:00').toLocaleDateString('pt-BR') : 'â€”',
        tipo: m.tipo === 'evasao' ? 'EvasÃ£o' : 'NÃ£o RenovaÃ§Ã£o', _tipo_raw: m.tipo,
        motivo: m.motivo || 'â€”',
      })));
    } finally {
      setCarregandoModal(false);
    }
  };

  useEffect(() => {
    if (competenciaMensal.bloqueiaEscrita) {
      setConfirmRecalcularAnalytics(false);
    }
  }, [competenciaMensal.bloqueiaEscrita]);

  useEffect(() => {
    async function fetchDados() {
      setLoading(true);
      try {
        // Verificar se Ã© perÃ­odo atual ou histÃ³rico
        const hoje = new Date();
        const anoAtual = hoje.getFullYear();
        const mesAtual = hoje.getMonth() + 1;

        const isPeriodoAtual = ano === anoAtual && mes === mesAtual;
        console.log('[DEBUG Reajuste] ano=', ano, 'mes=', mes, 'anoAtual=', anoAtual, 'mesAtual=', mesAtual, 'competenciaStatus=', competenciaMensal.status, 'isPeriodoAtual=', isPeriodoAtual);

        let gestaoData: any[] = [];
        let retencaoData: any[] = [];

        if (isPeriodoAtual) {
          // PERÃODO ATUAL: usar views em tempo real, filtrar por ano/mÃªs atual
          let query = supabase
            .from('vw_kpis_gestao_mensal')
            .select('*')
            .eq('ano', anoAtual)
            .eq('mes', mesAtual);

          if (unidade !== 'todos') {
            query = query.eq('unidade_id', unidade);
          }

          const { data, error: gestaoError } = await query;
          if (gestaoError) throw gestaoError;
          gestaoData = data || [];

          // Buscar dados de retenÃ§Ã£o (filtrar por ano e range de meses)
          let retencaoQuery = supabase
            .from('vw_kpis_retencao_mensal')
            .select('*')
            .eq('ano', ano)
            .gte('mes', mesInicio)
            .lte('mes', mesFinal);

          if (unidade !== 'todos') {
            retencaoQuery = retencaoQuery.eq('unidade_id', unidade);
          }

          const { data: retData, error: retencaoError } = await retencaoQuery;
          if (retencaoError) throw retencaoError;
          retencaoData = retData || [];
        } else {
          // PERÃODO HISTÃ“RICO: usar dados_mensais + vw_kpis_gestao_mensal como fallback para reajuste
          let historicoQuery = supabase
            .from('dados_mensais')
            .select('*, unidades(nome)')
            .eq('ano', ano)
            .gte('mes', mesInicio)
            .lte('mes', mesFinal);

          if (unidade !== 'todos') {
            historicoQuery = historicoQuery.eq('unidade_id', unidade);
          }

          // Buscar view em paralelo para ter reajuste_medio real como fallback
          let viewQuery = supabase
            .from('vw_kpis_gestao_mensal')
            .select('unidade_id, ano, mes, reajuste_medio')
            .eq('ano', ano)
            .gte('mes', mesInicio)
            .lte('mes', mesFinal);

          if (unidade !== 'todos') {
            viewQuery = viewQuery.eq('unidade_id', unidade);
          }

          const [{ data: historicoData, error: historicoError }, { data: viewData }] = await Promise.all([
            historicoQuery,
            viewQuery,
          ]);
          if (historicoError) throw historicoError;

          // Mapa de reajuste_medio real da view por (unidade_id, ano, mes)
          const reajusteViewMap = new Map<string, number>();
          (viewData || []).forEach((v: any) => {
            const key = `${v.unidade_id}-${v.ano}-${v.mes}`;
            const val = Number(v.reajuste_medio);
            if (val > 0) reajusteViewMap.set(key, val);
          });
          console.log('[DEBUG Reajuste] viewData=', viewData);
          console.log('[DEBUG Reajuste] reajusteViewMap=', Array.from(reajusteViewMap.entries()));
          console.log('[DEBUG Reajuste] historicoData reajuste_parcelas=', historicoData?.map((d: any) => ({ uid: d.unidade_id, rp: d.reajuste_parcelas })));

          // Buscar dados de evasÃµes detalhados de movimentacoes_admin
          const startDate = `${ano}-${String(mesInicio).padStart(2, '0')}-01`;
          const ultimoDia = new Date(ano, mesFinal, 0).getDate();
          const endDate = `${ano}-${String(mesFinal).padStart(2, '0')}-${ultimoDia}`;

          let evasoesQuery = supabase
            .from('movimentacoes_admin')
            .select('tipo, valor_parcela_evasao, valor_parcela_anterior, data, unidade_id')
            .in('tipo', ['evasao', 'nao_renovacao', 'aviso_previo'])
            .gte('data', startDate)
            .lte('data', endDate);

          if (unidade !== 'todos') {
            evasoesQuery = evasoesQuery.eq('unidade_id', unidade);
          }

          const { data: evasoesHistorico } = await evasoesQuery;

          // Consolidar dados de evasÃµes por tipo
          const cancelamentos = evasoesHistorico?.filter(e => e.tipo === 'evasao').length || 0;
          const naoRenovacoes = evasoesHistorico?.filter(e => e.tipo === 'nao_renovacao').length || 0;
          const mrrPerdidoTotal = evasoesHistorico?.reduce((acc, e) => acc + (Number(e.valor_parcela_evasao || e.valor_parcela_anterior) || 0), 0) || 0;

          // Transformar dados histÃ³ricos para o formato esperado
          if (historicoData && historicoData.length > 0) {
            gestaoData = historicoData.map((d: any) => ({
              unidade_id: d.unidade_id,
              unidade_nome: d.unidades?.nome || 'N/A',
              ano: d.ano,
              mes: d.mes,
              total_alunos_ativos: d.alunos_ativos || 0,
              total_alunos_pagantes: d.alunos_pagantes || 0,
              total_bolsistas_integrais: d.bolsistas_integrais || 0,
              total_bolsistas_parciais: d.bolsistas_parciais || 0,
              total_banda: d.matriculas_banda || 0,
              ticket_medio: Number(d.ticket_medio) || 0,
              mrr: Number(d.faturamento_estimado) || 0,
              arr: (Number(d.faturamento_estimado) || 0) * 12,
              tempo_permanencia_medio: Number(d.tempo_permanencia) || 0,
              ltv_medio: (Number(d.ticket_medio) || 0) * (Number(d.tempo_permanencia) || 0),
              inadimplencia_pct: Number(d.inadimplencia) || 0,
              faturamento_previsto: Number(d.faturamento_estimado) || 0,
              faturamento_realizado: (Number(d.faturamento_estimado) || 0) * (1 - (Number(d.inadimplencia) || 0) / 100),
              churn_rate: Number(d.churn_rate) || 0,
              total_evasoes: d.evasoes || 0,
              novas_matriculas: d.novas_matriculas || 0,
              reajuste_pct: Number(reajusteViewMap.get(`${d.unidade_id}-${d.ano}-${d.mes}`) ?? d.reajuste_parcelas) || 0,
            }));

            // Dados de retenÃ§Ã£o do histÃ³rico
            // Usar dados da tabela evasoes que tem tipos detalhados
            retencaoData = [{
              unidade_id: unidade !== 'todos' ? unidade : null,
              total_evasoes: (cancelamentos + naoRenovacoes) || 0,
              evasoes_interrompidas: cancelamentos,
              avisos_previos: 0, // NÃ£o disponÃ­vel no histÃ³rico
              mrr_perdido: mrrPerdidoTotal,
              renovacoes_realizadas: 0, // NÃ£o disponÃ­vel - tabela renovacoes vazia
              nao_renovacoes: naoRenovacoes,
              renovacoes_pendentes: 0, // NÃ£o disponÃ­vel no histÃ³rico
              taxa_renovacao: historicoData.length > 0 ? historicoData.reduce((acc, d) => acc + (Number(d.taxa_renovacao) || 0), 0) / historicoData.length : 0,
            }];
          } else {
            // Sem snapshot historico: nao recalcular silenciosamente a partir de alunos.
            gestaoData = [];
            retencaoData = [];
            console.warn('Competencia sem snapshot em dados_mensais. KPIs historicos indisponiveis ate fechamento formal.');

            if (false) {
            // FALLBACK: dados_mensais nÃ£o tem dados, calcular das tabelas base
            // Buscar alunos ativos/pagantes
            let alunosQuery = supabase
              .from('alunos')
              .select('id, status, tipo_matricula_id, is_segundo_curso, valor_parcela, tipos_matricula(codigo, conta_como_pagante)')
              .in('status', ['ativo', 'trancado']);

            if (unidade !== 'todos') {
              alunosQuery = alunosQuery.eq('unidade_id', unidade);
            }

            // Buscar matrÃ­culas do perÃ­odo
            let matriculasQuery = supabase
              .from('alunos')
              .select('id')
              .gte('data_matricula', startDate)
              .lte('data_matricula', endDate);

            if (unidade !== 'todos') {
              matriculasQuery = matriculasQuery.eq('unidade_id', unidade);
            }

            // Buscar renovaÃ§Ãµes do perÃ­odo
            let renovacoesQuery = supabase
              .from('renovacoes')
              .select('id, status, percentual_reajuste')
              .gte('data_renovacao', startDate)
              .lte('data_renovacao', endDate);

            if (unidade !== 'todos') {
              renovacoesQuery = renovacoesQuery.eq('unidade_id', unidade);
            }

            const [alunosRes, matriculasRes, renovacoesRes] = await Promise.all([
              alunosQuery,
              matriculasQuery,
              renovacoesQuery
            ]);

            const alunosData = alunosRes.data || [];
            // Pessoa-level: alunos ativos (qualquer registro ativo/trancado = 1 pessoa)
            const nomesAtivos = new Set(alunosData.map((a: any) => a.nome));
            const totalAtivos = nomesAtivos.size;

            // Pessoa-level: pagantes (conta_como_pagante + valor_parcela > 0)
            // NÃ£o usa is_segundo_curso porque banda/projeto pode estar marcado como segundo
            // curso na UI (Ãºnica opÃ§Ã£o disponÃ­vel para "outro curso").
            const pagantesRecords = alunosData.filter((a: any) =>
              (a.tipos_matricula as any)?.conta_como_pagante && (a.valor_parcela || 0) > 0
            );
            const nomesPagantes = new Set(pagantesRecords.map((a: any) => a.nome));
            const totalPagantes = nomesPagantes.size;
            const faturamento = pagantesRecords.reduce((sum: number, a: any) => sum + (Number(a.valor_parcela) || 0), 0);
            const ticketMedio = totalPagantes > 0 ? faturamento / totalPagantes : 0;
            const novasMatriculas = matriculasRes.data?.length || 0;
            const totalEvasoes = (evasoesHistorico?.length || 0);
            
            const renovacoesData = renovacoesRes.data || [];
            const renovacoesRealizadas = renovacoesData.filter((r: any) => r.status === 'renovado').length;
            const taxaRenovacao = renovacoesData.length > 0 ? (renovacoesRealizadas / renovacoesData.length) * 100 : 0;
            const reajusteRenovados = renovacoesData.filter((r: any) => r.status === 'renovado' && r.percentual_reajuste != null);
            const reajusteMedioFallback = reajusteRenovados.length > 0
              ? reajusteRenovados.reduce((sum: number, r: any) => sum + Number(r.percentual_reajuste), 0) / reajusteRenovados.length
              : 0;

            gestaoData = [{
              unidade_id: unidade !== 'todos' ? unidade : null,
              unidade_nome: 'N/A',
              ano: ano,
              mes: mesInicio,
              total_alunos_ativos: totalAtivos,
              total_alunos_pagantes: totalPagantes,
              total_bolsistas_integrais: 0,
              total_bolsistas_parciais: 0,
              total_banda: 0,
              ticket_medio: Math.round(ticketMedio),
              mrr: faturamento,
              arr: faturamento * 12,
              tempo_permanencia_medio: 0,
              ltv_medio: 0,
              inadimplencia_pct: 0,
              faturamento_previsto: faturamento,
              faturamento_realizado: faturamento,
              churn_rate: totalPagantes > 0 ? (totalEvasoes / totalPagantes) * 100 : 0,
              total_evasoes: totalEvasoes,
              novas_matriculas: novasMatriculas,
              reajuste_pct: Math.round(reajusteMedioFallback * 100) / 100,
            }];

            retencaoData = [{
              unidade_id: unidade !== 'todos' ? unidade : null,
              total_evasoes: totalEvasoes,
              evasoes_interrompidas: cancelamentos,
              avisos_previos: 0,
              mrr_perdido: mrrPerdidoTotal,
              renovacoes_realizadas: renovacoesRealizadas,
              nao_renovacoes: naoRenovacoes,
              renovacoes_pendentes: 0,
              taxa_renovacao: taxaRenovacao,
            }];
            }
          }
        }

        // Buscar dados do mÃªs anterior para comparativo (FORA do bloco condicional)
        const mesAnterior = mes === 1 ? 12 : mes - 1;
        const anoMesAnterior = mes === 1 ? ano - 1 : ano;
        
        let dadosMesAnteriorQuery = supabase
          .from('dados_mensais')
          .select('*')
          .eq('ano', anoMesAnterior)
          .eq('mes', mesAnterior);

        if (unidade !== 'todos') {
          dadosMesAnteriorQuery = dadosMesAnteriorQuery.eq('unidade_id', unidade);
        }

        const { data: dadosMesAnteriorData } = await dadosMesAnteriorQuery;

        // Consolidar dados do mÃªs anterior
        if (dadosMesAnteriorData && dadosMesAnteriorData.length > 0) {
          const consolidadoMesAnterior = dadosMesAnteriorData.reduce((acc, d) => ({
            alunos_pagantes: acc.alunos_pagantes + (d.alunos_pagantes || 0),
            novas_matriculas: acc.novas_matriculas + (d.novas_matriculas || 0),
            evasoes: acc.evasoes + (d.evasoes || 0),
            ticket_medio: acc.ticket_medio + (Number(d.ticket_medio) || 0),
            faturamento_estimado: acc.faturamento_estimado + (Number(d.faturamento_estimado) || 0),
            churn_rate: acc.churn_rate + (Number(d.churn_rate) || 0),
            taxa_renovacao: acc.taxa_renovacao + (Number(d.taxa_renovacao) || 0),
            tempo_permanencia: acc.tempo_permanencia + (Number(d.tempo_permanencia) || 0),
            inadimplencia: acc.inadimplencia + (Number(d.inadimplencia) || 0),
            count: acc.count + 1,
          }), {
            alunos_pagantes: 0, novas_matriculas: 0, evasoes: 0, ticket_medio: 0,
            faturamento_estimado: 0, churn_rate: 0, taxa_renovacao: 0, tempo_permanencia: 0,
            inadimplencia: 0, count: 0
          });
          
          const dadosMesAnteriorFinal = {
            ...consolidadoMesAnterior,
            ticket_medio: consolidadoMesAnterior.count > 0 ? consolidadoMesAnterior.ticket_medio / consolidadoMesAnterior.count : 0,
            churn_rate: consolidadoMesAnterior.count > 0 ? consolidadoMesAnterior.churn_rate / consolidadoMesAnterior.count : 0,
            taxa_renovacao: consolidadoMesAnterior.count > 0 ? consolidadoMesAnterior.taxa_renovacao / consolidadoMesAnterior.count : 0,
            tempo_permanencia: consolidadoMesAnterior.count > 0 ? consolidadoMesAnterior.tempo_permanencia / consolidadoMesAnterior.count : 0,
            inadimplencia: consolidadoMesAnterior.count > 0 ? consolidadoMesAnterior.inadimplencia / consolidadoMesAnterior.count : 0,
            label: `${getMesNomeCurto(mesAnterior)}/${String(anoMesAnterior).slice(2)}`,
          };
          console.log('ðŸ“Š Dados MÃªs Anterior:', dadosMesAnteriorFinal);
          setDadosMesAnterior(dadosMesAnteriorFinal);
        } else {
          console.log('âš ï¸ Sem dados do mÃªs anterior');
          setDadosMesAnterior(null);
        }

        // Buscar dados do mesmo mÃªs do ano anterior para comparativo de sazonalidade
        let dadosAnoAnteriorQuery = supabase
          .from('dados_mensais')
          .select('*')
          .eq('ano', ano - 1)
          .eq('mes', mes);

        if (unidade !== 'todos') {
          dadosAnoAnteriorQuery = dadosAnoAnteriorQuery.eq('unidade_id', unidade);
        }

        const { data: dadosAnoAnteriorData } = await dadosAnoAnteriorQuery;

        // Consolidar dados do ano anterior
        if (dadosAnoAnteriorData && dadosAnoAnteriorData.length > 0) {
          const consolidadoAnoAnterior = dadosAnoAnteriorData.reduce((acc, d) => ({
            alunos_pagantes: acc.alunos_pagantes + (d.alunos_pagantes || 0),
            novas_matriculas: acc.novas_matriculas + (d.novas_matriculas || 0),
            evasoes: acc.evasoes + (d.evasoes || 0),
            ticket_medio: acc.ticket_medio + (Number(d.ticket_medio) || 0),
            faturamento_estimado: acc.faturamento_estimado + (Number(d.faturamento_estimado) || 0),
            churn_rate: acc.churn_rate + (Number(d.churn_rate) || 0),
            taxa_renovacao: acc.taxa_renovacao + (Number(d.taxa_renovacao) || 0),
            tempo_permanencia: acc.tempo_permanencia + (Number(d.tempo_permanencia) || 0),
            inadimplencia: acc.inadimplencia + (Number(d.inadimplencia) || 0),
            count: acc.count + 1,
          }), {
            alunos_pagantes: 0, novas_matriculas: 0, evasoes: 0, ticket_medio: 0,
            faturamento_estimado: 0, churn_rate: 0, taxa_renovacao: 0, tempo_permanencia: 0,
            inadimplencia: 0, count: 0
          });
          
          const dadosAnoAnteriorFinal = {
            ...consolidadoAnoAnterior,
            ticket_medio: consolidadoAnoAnterior.count > 0 ? consolidadoAnoAnterior.ticket_medio / consolidadoAnoAnterior.count : 0,
            churn_rate: consolidadoAnoAnterior.count > 0 ? consolidadoAnoAnterior.churn_rate / consolidadoAnoAnterior.count : 0,
            taxa_renovacao: consolidadoAnoAnterior.count > 0 ? consolidadoAnoAnterior.taxa_renovacao / consolidadoAnoAnterior.count : 0,
            tempo_permanencia: consolidadoAnoAnterior.count > 0 ? consolidadoAnoAnterior.tempo_permanencia / consolidadoAnoAnterior.count : 0,
            inadimplencia: consolidadoAnoAnterior.count > 0 ? consolidadoAnoAnterior.inadimplencia / consolidadoAnoAnterior.count : 0,
            label: `${getMesNomeCurto(mes)}/${String(ano - 1).slice(2)}`,
          };
          console.log('ðŸ“Š Dados Ano Anterior:', dadosAnoAnteriorFinal);
          setDadosAnoAnterior(dadosAnoAnteriorFinal);
        } else {
          console.log('âš ï¸ Sem dados do ano anterior');
          setDadosAnoAnterior(null);
        }

        // Consolidar dados
        // IMPORTANTE: Para perÃ­odos mÃºltiplos (Trim/Sem/Ano):
        // - Alunos/Bolsistas/Banda: usar MÃ‰DIA (snapshot, nÃ£o acumula)
        // - MatrÃ­culas/EvasÃµes: usar SOMA (eventos acumulam)
        // - Taxas/Percentuais: usar MÃ‰DIA
        // - Faturamento/MRR: usar SOMA (acumula no perÃ­odo)
        if (gestaoData && gestaoData.length > 0) {
          const g = gestaoData.reduce((acc, item) => ({
            // SOMA para acumular
            total_alunos_ativos_sum: acc.total_alunos_ativos_sum + (item.total_alunos_ativos || 0),
            total_alunos_pagantes_sum: acc.total_alunos_pagantes_sum + (item.total_alunos_pagantes || 0),
            total_bolsistas_integrais_sum: acc.total_bolsistas_integrais_sum + (item.total_bolsistas_integrais || 0),
            total_bolsistas_parciais_sum: acc.total_bolsistas_parciais_sum + (item.total_bolsistas_parciais || 0),
            total_banda_sum: acc.total_banda_sum + (item.total_banda || 0),
            ticket_medio_sum: acc.ticket_medio_sum + ((Number(item.ticket_medio) || 0) * (item.total_alunos_pagantes || 0)),
            mrr_sum: acc.mrr_sum + (Number(item.mrr) || 0),
            arr_sum: acc.arr_sum + (Number(item.arr) || 0),
            tempo_permanencia_medio_sum: acc.tempo_permanencia_medio_sum + (Number(item.tempo_permanencia_medio) || 0),
            ltv_medio_sum: acc.ltv_medio_sum + (Number(item.ltv_medio) || 0),
            inadimplencia_pct_sum: acc.inadimplencia_pct_sum + (Number(item.inadimplencia_pct) || 0),
            faturamento_previsto: acc.faturamento_previsto + (Number(item.faturamento_previsto) || 0),
            faturamento_realizado: acc.faturamento_realizado + (Number(item.faturamento_realizado) || 0),
            churn_rate_sum: acc.churn_rate_sum + (Number(item.churn_rate) || 0),
            total_evasoes: acc.total_evasoes + (item.total_evasoes || 0),
            novas_matriculas: acc.novas_matriculas + (item.novas_matriculas || 0),
            reajuste_pct_sum: acc.reajuste_pct_sum + (Number(item.reajuste_medio || item.reajuste_pct) || 0),
            count: acc.count + 1,
          }), {
            total_alunos_ativos_sum: 0, total_alunos_pagantes_sum: 0, total_bolsistas_integrais_sum: 0,
            total_bolsistas_parciais_sum: 0, total_banda_sum: 0, ticket_medio_sum: 0, mrr_sum: 0, arr_sum: 0,
            tempo_permanencia_medio_sum: 0, ltv_medio_sum: 0, inadimplencia_pct_sum: 0,
            faturamento_previsto: 0, faturamento_realizado: 0, churn_rate_sum: 0, total_evasoes: 0, 
            novas_matriculas: 0, reajuste_pct_sum: 0, count: 0
          });
          
          // Calcular nÃºmero de meses Ãºnicos no perÃ­odo (para mÃ©dia correta)
          const mesesUnicos = new Set(gestaoData.map((d: any) => `${d.ano}-${d.mes}`)).size || 1;

          const r = retencaoData?.reduce((acc, item) => ({
            total_evasoes: acc.total_evasoes + (item.total_evasoes || 0),
            evasoes_interrompidas: acc.evasoes_interrompidas + (item.evasoes_interrompidas || 0),
            avisos_previos: acc.avisos_previos + (item.avisos_previos || 0),
            mrr_perdido: acc.mrr_perdido + (Number(item.mrr_perdido) || 0),
            renovacoes_realizadas: acc.renovacoes_realizadas + (item.renovacoes_realizadas || 0),
            nao_renovacoes: acc.nao_renovacoes + (item.nao_renovacoes || 0),
            renovacoes_pendentes: acc.renovacoes_pendentes + (item.renovacoes_pendentes || 0),
            taxa_renovacao: acc.taxa_renovacao + (Number(item.taxa_renovacao) || 0),
            count: acc.count + 1,
          }), {
            total_evasoes: 0, evasoes_interrompidas: 0, avisos_previos: 0, mrr_perdido: 0,
            renovacoes_realizadas: 0, nao_renovacoes: 0, renovacoes_pendentes: 0, taxa_renovacao: 0, count: 0
          }) || { total_evasoes: 0, evasoes_interrompidas: 0, avisos_previos: 0, mrr_perdido: 0,
            renovacoes_realizadas: 0, nao_renovacoes: 0, renovacoes_pendentes: 0, taxa_renovacao: 0, count: 1 };

          // Usar dados consolidados da view (perÃ­odo atual) ou dados_mensais (histÃ³rico)
          let novasMatriculas = g.novas_matriculas || 0;
          let evasoes = g.total_evasoes || 0;
          
          if (isPeriodoAtual) {
            // novasMatriculas e evasoes ja vem da view vw_kpis_gestao_mensal (fonte unificada)
          }

          // Buscar matrÃ­culas via tabela ALUNOS (mesma fonte do card e da view)
          const startDate = `${ano}-${String(mesInicio).padStart(2, '0')}-01`;
          const ultimoDia = new Date(ano, mesFinal, 0).getDate();
          const endDate = `${ano}-${String(mesFinal).padStart(2, '0')}-${ultimoDia}`;

          let alunosMatQuery = supabase
            .from('alunos')
            .select(`
              id, nome,
              cursos:curso_id!left(nome, is_projeto_banda),
              professores:professor_atual_id!left(id, nome),
              tipos_matricula:tipo_matricula_id!left(codigo)
            `)
            .not('data_matricula', 'is', null)
            .or('is_segundo_curso.is.null,is_segundo_curso.eq.false')
            .gte('data_matricula', startDate)
            .lte('data_matricula', endDate);

          if (unidade !== 'todos') {
            alunosMatQuery = alunosMatQuery.eq('unidade_id', unidade);
          }

          const { data: alunosMatRaw } = await alunosMatQuery;
          // Filtrar passaporte only (sem banda, coral, bolsista)
          const leadsMatData = (alunosMatRaw || []).filter((a: any) => {
            const codigo = a.tipos_matricula?.codigo;
            if (codigo === 'BOLSISTA_INT' || codigo === 'BOLSISTA_PARC') return false;
            if (a.cursos?.is_projeto_banda) return false;
            if (a.cursos?.nome?.toLowerCase().includes('canto coral')) return false;
            return true;
          });

          // Buscar distribuiÃ§Ã£o LA Kids vs LA (12+) dos alunos ativos
          // CORREÃ‡ÃƒO: buscar TODAS as matrÃ­culas ativas (incluindo banda/2Âº curso),
          // depois agrupar por pessoa e verificar se tem pelo menos uma matrÃ­cula regular
          // Isso evita excluir pessoas que tÃªm banda/2Âº curso + curso regular
          // CORREÃ‡ÃƒO: mÃªs corrente usa CURRENT_DATE como corte, nÃ£o fim do mÃªs
          const dataCorte = isPeriodoAtual
            ? new Date().toISOString().split('T')[0]
            : endDate;

          let alunosAtivosQuery = supabase
            .from('alunos')
            .select('nome, idade_atual, data_matricula, data_saida, is_segundo_curso, cursos:curso_id!left(is_projeto_banda)')
            .in('status', ['ativo', 'trancado']);

          if (unidade !== 'todos') {
            alunosAtivosQuery = alunosAtivosQuery.eq('unidade_id', unidade);
          }

          const { data: alunosAtivosData } = await alunosAtivosQuery;

          // Agrupar matrÃ­culas por pessoa (nome)
          // Para cada pessoa, verificar se tem PELO MENOS UMA matrÃ­cula regular
          // (nÃ£o banda, nÃ£o 2Âº curso, dentro do perÃ­odo)
          const pessoasMap = new Map<string, {
            idade: number | null;
            temRegular: boolean;
            temAtivo: boolean;
            matriculas: any[];
          }>();

          (alunosAtivosData || []).forEach((a: any) => {
            // Filtro de perÃ­odo
            if (a.data_matricula > dataCorte) return;
            if (a.data_saida && a.data_saida <= dataCorte) return;

            const isBanda = a.cursos?.is_projeto_banda === true;
            const isSegundoCurso = a.is_segundo_curso === true;
            const isRegular = !isBanda && !isSegundoCurso;

            const pessoa = pessoasMap.get(a.nome) || {
              idade: a.idade_atual,
              temRegular: false,
              temAtivo: false,
              matriculas: [],
            };

            if (isRegular) pessoa.temRegular = true;
            pessoa.temAtivo = true;
            pessoa.matriculas.push({ isBanda, isSegundoCurso, isRegular });
            pessoasMap.set(a.nome, pessoa);
          });

          // Calcular Kids/School:
          // Kids/School: qualquer pessoa com matrÃ­cula ativa (regular, 2o ou banda)
          // is_segundo_curso Ã© promovido automaticamente para classificaÃ§Ã£o
          const pessoasComClassificacao = Array.from(pessoasMap.values()).filter(p => p.temRegular || p.temAtivo);
          const totalLaKids = pessoasComClassificacao.filter(p => p.idade !== null && p.idade <= 11).length;
          const totalLaAdultos = pessoasComClassificacao.filter(p => p.idade !== null && p.idade >= 12).length;
          // Total de matrÃ­culas de banda (para card Banda)
          const totalBanda = (alunosAtivosData || []).filter((a: any) =>
            a.cursos?.is_projeto_banda === true
          ).length;

          // MatrÃ­culas por Curso e Professor (via tabela alunos â€” mesma fonte do card)
          const cursoMatMap = new Map<string, number>();
          const profMatMap = new Map<string, { id: number; count: number }>();
          leadsMatData?.forEach((a: any) => {
            const curso = a.cursos?.nome || 'NÃ£o informado';
            cursoMatMap.set(curso, (cursoMatMap.get(curso) || 0) + 1);
            const prof = a.professores?.nome || 'Sem Professor';
            const profId = a.professores?.id || 0;
            const current = profMatMap.get(prof) || { id: profId, count: 0 };
            current.count += 1;
            profMatMap.set(prof, current);
          });

          // Buscar evasÃµes com JOIN para curso (via aluno) e professor
          // REGRA DE NEGÃ“CIO: EvasÃµes = Cancelamentos + NÃ£o RenovaÃ§Ãµes
          // Aviso PrÃ©vio NÃƒO conta como evasÃ£o (aluno ainda estÃ¡ ativo)
          let evasoesQuery = supabase
            .from('movimentacoes_admin')
            .select(`
              id, aluno_id, professor_id, motivo_saida_id, tipo, unidade_id,
              motivos_saida!left(nome)
            `)
            .gte('data', startDate)
            .lte('data', endDate)
            .in('tipo', ['evasao', 'nao_renovacao']); // Apenas cancelamentos e nÃ£o renovaÃ§Ãµes

          if (unidade !== 'todos') {
            evasoesQuery = evasoesQuery.eq('unidade_id', unidade);
          }

          const { data: evasoesData } = await evasoesQuery;

          // Buscar nomes de alunos (curso) e professores para as evasÃµes
          const alunoIds = [...new Set((evasoesData || []).map((e: any) => e.aluno_id).filter(Boolean))];
          const profIds = [...new Set((evasoesData || []).map((e: any) => e.professor_id).filter(Boolean))];

          const [alunosRes, profsRes] = await Promise.all([
            alunoIds.length > 0
              ? supabase.from('alunos').select('id, curso_id, cursos!left(nome)').in('id', alunoIds)
              : { data: [] },
            profIds.length > 0
              ? supabase.from('professores').select('id, nome').in('id', profIds)
              : { data: [] },
          ]);

          const alunoMap = new Map((alunosRes.data || []).map((a: any) => [a.id, a]));
          const profMap = new Map((profsRes.data || []).map((p: any) => [p.id, p]));

          const cursoEvasaoMap = new Map<string, number>();
          const profEvasaoMap = new Map<string, { id: number; count: number }>();
          const motivosNaoRenovMap = new Map<string, number>();
          const motivosCancelMap = new Map<string, number>();
          evasoesData?.forEach((e: any) => {
            // Curso via aluno
            const aluno = alunoMap.get(e.aluno_id);
            const cursoNome = aluno?.cursos?.nome || 'NÃ£o informado';
            cursoEvasaoMap.set(cursoNome, (cursoEvasaoMap.get(cursoNome) || 0) + 1);
            // Professor
            const prof = profMap.get(e.professor_id);
            const profNome = prof?.nome || 'Sem Professor';
            const current = profEvasaoMap.get(profNome) || { id: e.professor_id || 0, count: 0 };
            current.count += 1;
            profEvasaoMap.set(profNome, current);
            const motivo = e.motivos_saida?.nome || 'NÃ£o informado';
            // tipo: 'nao_renovacao' = nÃ£o renovou, 'evasao' = cancelamento
            if (e.tipo === 'nao_renovacao') {
              motivosNaoRenovMap.set(motivo, (motivosNaoRenovMap.get(motivo) || 0) + 1);
            } else {
              motivosCancelMap.set(motivo, (motivosCancelMap.get(motivo) || 0) + 1);
            }
          });

          // Calcular mÃ©dias para campos de snapshot (alunos, taxas)
          const mediaAlunos = mesesUnicos > 0 ? Math.round(g.total_alunos_ativos_sum / mesesUnicos) : 0;
          const mediaPagantes = mesesUnicos > 0 ? Math.round(g.total_alunos_pagantes_sum / mesesUnicos) : 0;
          const mediaBolsistasIntegrais = mesesUnicos > 0 ? Math.round(g.total_bolsistas_integrais_sum / mesesUnicos) : 0;
          const mediaBolsistasParciais = mesesUnicos > 0 ? Math.round(g.total_bolsistas_parciais_sum / mesesUnicos) : 0;
          const mediaBanda = mesesUnicos > 0 ? Math.round(g.total_banda_sum / mesesUnicos) : 0;

          setDados({
            // Alunos - usar MÃ‰DIA do perÃ­odo (snapshot mensal, nÃ£o acumula)
            total_alunos_ativos: mediaAlunos,
            total_alunos_pagantes: mediaPagantes,
            total_bolsistas_integrais: mediaBolsistasIntegrais,
            total_bolsistas_parciais: mediaBolsistasParciais,
            total_banda: mediaBanda,
            // MatrÃ­culas/EvasÃµes - usar SOMA (eventos acumulam no perÃ­odo)
            novas_matriculas: novasMatriculas,
            evasoes: evasoes,
            saldo_liquido: novasMatriculas - evasoes,
            total_la_kids: totalLaKids,
            total_la_adultos: totalLaAdultos,
            total_somente_banda_segundo: totalBanda,
            distribuicao_faixa_etaria: [
              { name: 'LA Music Kids (atÃ© 11)', value: totalLaKids },
              { name: 'LA Music School (12+)', value: totalLaAdultos },
            ],
            
            // Financeiro - ticket/taxas = MÃ‰DIA, faturamento = SOMA
            ticket_medio: g.total_alunos_pagantes_sum > 0 ? g.ticket_medio_sum / g.total_alunos_pagantes_sum : 0,
            mrr: mesesUnicos > 0 ? g.mrr_sum / mesesUnicos : 0, // MRR mÃ©dio do perÃ­odo
            arr: mesesUnicos > 0 ? (g.mrr_sum / mesesUnicos) * 12 : 0, // ARR baseado no MRR mÃ©dio
            faturamento_previsto: g.faturamento_previsto, // SOMA do perÃ­odo
            faturamento_realizado: g.faturamento_realizado, // SOMA do perÃ­odo
            inadimplencia: g.faturamento_previsto - g.faturamento_realizado,
            inadimplencia_pct: g.count > 0 ? g.inadimplencia_pct_sum / g.count : 0,
            ltv_medio: g.count > 0 ? g.ltv_medio_sum / g.count : 0,
            ticket_medio_passaporte: 0, // TODO: buscar de outra fonte
            reajuste_pct: g.count > 0 ? g.reajuste_pct_sum / g.count : 0,
            
            // RetenÃ§Ã£o - taxas = MÃ‰DIA
            churn_rate: g.count > 0 ? g.churn_rate_sum / g.count : 0,
            renovacoes: r.renovacoes_realizadas,
            nao_renovacoes: r.nao_renovacoes,
            renovacoes_pct: (r.renovacoes_realizadas + r.nao_renovacoes) > 0
              ? (r.renovacoes_realizadas / (r.renovacoes_realizadas + r.nao_renovacoes)) * 100
              : 0,
            cancelamentos: r.evasoes_interrompidas,
            cancelamento_pct: mediaAlunos > 0 ? (r.evasoes_interrompidas / mediaAlunos) * 100 : 0,
            aviso_previo: r.avisos_previos,
            mrr_perdido: r.mrr_perdido,
            
            // Indicadores - usar MÃ‰DIA
            tempo_permanencia: g.count > 0 ? g.tempo_permanencia_medio_sum / g.count : 0,
            nps_evasoes: 0, // TODO: buscar de outra fonte
            renovacoes_pendentes: r.renovacoes_pendentes,
            total_evasoes: r.evasoes_interrompidas + r.nao_renovacoes,
            
            // DistribuiÃ§Ãµes (grÃ¡ficos)
            matriculas_por_curso: Array.from(cursoMatMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
            matriculas_por_professor: Array.from(profMatMap.entries()).map(([nome, data]) => ({
              id: data.id,
              nome,
              valor: data.count,
            })).sort((a, b) => b.valor - a.valor),
            evasoes_por_professor: Array.from(profEvasaoMap.entries()).map(([nome, data]) => ({
              id: data.id,
              nome,
              valor: data.count,
            })).sort((a, b) => b.valor - a.valor),
            evasoes_por_curso: Array.from(cursoEvasaoMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
            motivos_nao_renovacao: Array.from(motivosNaoRenovMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
            motivos_cancelamento: Array.from(motivosCancelMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
          });

          // DistribuiÃ§Ã£o por unidade
          setDistribuicao(gestaoData.map(item => ({
            name: item.unidade_nome || 'N/A',
            value: item.total_alunos_ativos || 0,
          })));
        } else {
          setDados(null);
          setDistribuicao([]);
        }

        // Buscar evoluÃ§Ã£o mensal (Ãºltimos 12 meses atÃ© o mÃªs selecionado)
        let evolucaoQuery = supabase
          .from('dados_mensais')
          .select('ano, mes, alunos_pagantes, novas_matriculas, evasoes, unidade_id')
          .gte('ano', 2023)
          .order('ano', { ascending: true })
          .order('mes', { ascending: true });

        // Aplicar filtro de unidade se nÃ£o for consolidado
        if (unidade !== 'todos') {
          evolucaoQuery = evolucaoQuery.eq('unidade_id', unidade);
        }

        const { data: evolucaoData } = await evolucaoQuery;

        if (evolucaoData) {
          // Chave do mÃªs atual selecionado para filtrar
          const mesAtualKeyEvolucao = `${ano}-${String(mes).padStart(2, '0')}`;
          
          // Agrupar por ano-mÃªs e filtrar atÃ© o mÃªs selecionado
          const porMes = new Map<string, { alunos: number; matriculas: number; evasoes: number }>();
          evolucaoData.forEach((item: any) => {
            const key = `${item.ano}-${String(item.mes).padStart(2, '0')}`;
            if (key <= mesAtualKeyEvolucao) {
              const atual = porMes.get(key) || { alunos: 0, matriculas: 0, evasoes: 0 };
              atual.alunos += item.alunos_pagantes || 0;
              atual.matriculas += item.novas_matriculas || 0;
              atual.evasoes += item.evasoes || 0;
              porMes.set(key, atual);
            }
          });

          // Pegar Ãºltimos 12 meses
          const evolucaoArray = Array.from(porMes.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .slice(-12)
            .map(([key, valores]) => {
              const [anoStr, mesStr] = key.split('-');
              return {
                name: `${getMesNomeCurto(parseInt(mesStr))}/${anoStr.slice(2)}`,
                alunos: valores.alunos,
                matriculas: valores.matriculas,
                evasoes: valores.evasoes,
              };
            });
          setEvolucao(evolucaoArray);
        }

        // Buscar dados histÃ³ricos para grÃ¡ficos financeiros e retenÃ§Ã£o (tabela dados_mensais - histÃ³rico completo 2023-2026)
        let financeiroQuery = supabase
          .from('dados_mensais')
          .select('mes, ano, ticket_medio, faturamento_estimado, inadimplencia, reajuste_parcelas, churn_rate, taxa_renovacao, unidade_id')
          .gte('ano', 2023)
          .order('ano', { ascending: true })
          .order('mes', { ascending: true });

        // Aplicar filtro de unidade se nÃ£o for consolidado
        if (unidade !== 'todos') {
          financeiroQuery = financeiroQuery.eq('unidade_id', unidade);
        }

        const { data: financeiroData } = await financeiroQuery;

        console.log('ðŸ” Dados financeiros brutos:', financeiroData?.length, 'registros');
        console.log('ðŸ” Primeiros 3 registros:', financeiroData?.slice(0, 3));

        // Buscar dados em tempo real do mÃªs atual para complementar dados_mensais
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;

        let gestaoAtualQuery = supabase
          .from('vw_kpis_gestao_mensal')
          .select('unidade_id, inadimplencia_pct, churn_rate, ticket_medio, faturamento_previsto, faturamento_realizado')
          .eq('ano', currentYear)
          .eq('mes', currentMonth);

        if (unidade !== 'todos') {
          gestaoAtualQuery = gestaoAtualQuery.eq('unidade_id', unidade);
        }

        const { data: gestaoAtualData } = await gestaoAtualQuery;

        // Substituir dados do mÃªs atual em financeiroData com valores em tempo real
        if (financeiroData && gestaoAtualData && gestaoAtualData.length > 0) {
          gestaoAtualData.forEach((gestao: any) => {
            const idx = financeiroData.findIndex((f: any) =>
              f.ano === currentYear && f.mes === currentMonth && f.unidade_id === gestao.unidade_id
            );
            if (idx >= 0) {
              financeiroData[idx].inadimplencia = Number(gestao.inadimplencia_pct) || 0;
              financeiroData[idx].churn_rate = Number(gestao.churn_rate) || 0;
              financeiroData[idx].ticket_medio = Number(gestao.ticket_medio) || 0;
              financeiroData[idx].faturamento_estimado = Number(gestao.faturamento_previsto) || 0;
            }
          });
        }

        // Buscar nomes das unidades para o grÃ¡fico de receita por unidade
        const { data: unidadesData } = await supabase.from('unidades').select('id, nome');
        const unidadeNomeMap = new Map<string, string>();
        unidadesData?.forEach((u: any) => unidadeNomeMap.set(u.id, u.nome));

        if (financeiroData) {
          // Chave do mÃªs atual selecionado para filtrar grÃ¡ficos
          const mesAtualKey = `${ano}-${String(mes).padStart(2, '0')}`;
          
          // 1. EvoluÃ§Ã£o do MRR (Ãºltimos 12 meses atÃ© o mÃªs selecionado) - usando faturamento_estimado
          const mrrPorMes = new Map<string, number>();
          financeiroData.forEach((item: any) => {
            const key = `${item.ano}-${String(item.mes).padStart(2, '0')}`;
            if (key <= mesAtualKey) {
              const atual = mrrPorMes.get(key) || 0;
              mrrPorMes.set(key, atual + (Number(item.faturamento_estimado) || 0));
            }
          });
          
          const mrrArray = Array.from(mrrPorMes.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .slice(-12)
            .map(([key, mrr]) => {
              const [anoKey, mesKey] = key.split('-');
              return {
                name: `${getMesNomeCurto(parseInt(mesKey))}/${anoKey.slice(2)}`,
                mrr: mrr,
              };
            });
          setEvolucaoMRR(mrrArray);

          // 2. Previsto vs Realizado (Ãºltimos 6 meses atÃ© o mÃªs selecionado)
          // Previsto = faturamento_estimado (MRR)
          // Realizado = faturamento_estimado - inadimplÃªncia
          const previstoRealizadoPorMes = new Map<string, { previsto: number; inadimplencia: number; count: number }>();
          financeiroData.forEach((item: any) => {
            const key = `${item.ano}-${String(item.mes).padStart(2, '0')}`;
            if (key <= mesAtualKey) {
              const atual = previstoRealizadoPorMes.get(key) || { previsto: 0, inadimplencia: 0, count: 0 };
              atual.previsto += Number(item.faturamento_estimado) || 0;
              atual.inadimplencia += Number(item.inadimplencia) || 0;
              atual.count += 1;
              previstoRealizadoPorMes.set(key, atual);
            }
          });

          const faturamentoArray = Array.from(previstoRealizadoPorMes.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .slice(-6)
            .map(([key, valores]) => {
              const [anoKey, mesKey] = key.split('-');
              const inadimplenciaMedia = valores.count > 0 ? valores.inadimplencia / valores.count : 0;
              const previsto = valores.previsto;
              const realizado = previsto - (previsto * inadimplenciaMedia / 100);
              return {
                name: `${getMesNomeCurto(parseInt(mesKey))}/${anoKey.slice(2)}`,
                previsto,
                realizado,
              };
            });
          console.log('ðŸ“Š Previsto vs Realizado:', faturamentoArray);
          setPrevistoRealizado(faturamentoArray);

          // 3. Receita por Unidade (mÃªs mais recente com dados)
          if (unidade === 'todos') {
            // Pegar o mÃªs mais recente disponÃ­vel
            const mesesDisponiveis = Array.from(new Set(financeiroData.map((item: any) => `${item.ano}-${item.mes}`)));
            const mesRecente = mesesDisponiveis.sort().pop();
            const [anoRecente, mesRecenteNum] = mesRecente ? mesRecente.split('-').map(Number) : [ano, mes];

            const receitaPorUnidadeMap = new Map<string, number>();
            financeiroData
              .filter((item: any) => item.ano === anoRecente && item.mes === mesRecenteNum)
              .forEach((item: any) => {
                const nomeUnidade = unidadeNomeMap.get(item.unidade_id) || 'N/A';
                const mrrAtual = receitaPorUnidadeMap.get(nomeUnidade) || 0;
                receitaPorUnidadeMap.set(nomeUnidade, mrrAtual + (Number(item.faturamento_estimado) || 0));
              });
            
            const receitaArray = Array.from(receitaPorUnidadeMap.entries())
              .map(([name, value]) => ({ name, value }))
              .sort((a, b) => b.value - a.value);
            setReceitaPorUnidade(receitaArray);
          } else {
            setReceitaPorUnidade([]);
          }

          // 4. EvoluÃ§Ã£o da InadimplÃªncia (Ãºltimos 12 meses atÃ© o mÃªs selecionado)
          const inadimplenciaPorMes = new Map<string, { total: number; count: number }>();
          financeiroData.forEach((item: any) => {
            const key = `${item.ano}-${String(item.mes).padStart(2, '0')}`;
            if (key <= mesAtualKey) {
              const atual = inadimplenciaPorMes.get(key) || { total: 0, count: 0 };
              atual.total += Number(item.inadimplencia) || 0;
              atual.count += 1;
              inadimplenciaPorMes.set(key, atual);
            }
          });

          const inadimplenciaArray = Array.from(inadimplenciaPorMes.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .slice(-12)
            .map(([key, valores]) => {
              const [anoKey, mesKey] = key.split('-');
              return {
                name: `${getMesNomeCurto(parseInt(mesKey))}/${anoKey.slice(2)}`,
                inadimplencia: valores.count > 0 ? valores.total / valores.count : 0,
              };
            });
          setEvolucaoInadimplencia(inadimplenciaArray);

          // 5. EvoluÃ§Ã£o do Ticket MÃ©dio (Ãºltimos 12 meses atÃ© o mÃªs selecionado)
          const ticketPorMes = new Map<string, { total: number; count: number }>();
          financeiroData.forEach((item: any) => {
            const key = `${item.ano}-${String(item.mes).padStart(2, '0')}`;
            // Incluir apenas dados atÃ© o mÃªs selecionado
            if (key <= mesAtualKey) {
              const atual = ticketPorMes.get(key) || { total: 0, count: 0 };
              atual.total += Number(item.ticket_medio) || 0;
              atual.count += 1;
              ticketPorMes.set(key, atual);
            }
          });

          const ticketArray = Array.from(ticketPorMes.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .slice(-12)
            .map(([key, valores]) => {
              const [anoStr, mesStr] = key.split('-');
              return {
                name: `${getMesNomeCurto(parseInt(mesStr))}/${anoStr.slice(2)}`,
                ticket: valores.count > 0 ? valores.total / valores.count : 0,
              };
            });
          setEvolucaoTicketMedio(ticketArray);

          // Pegar o ticket mÃ©dio atual (Ãºltimo mÃªs)
          if (ticketArray.length > 0) {
            const ticketAtual = ticketArray[ticketArray.length - 1].ticket;
            setMediaTicketAnual(ticketAtual);
          }

          // 6. EvoluÃ§Ã£o do Reajuste MÃ©dio (Ãºltimos 12 meses atÃ© o mÃªs selecionado)
          const reajustePorMes = new Map<string, { total: number; count: number }>();
          financeiroData.forEach((item: any) => {
            const key = `${item.ano}-${String(item.mes).padStart(2, '0')}`;
            if (key <= mesAtualKey) {
              const atual = reajustePorMes.get(key) || { total: 0, count: 0 };
              atual.total += Number(item.reajuste_parcelas) || 0;
              atual.count += 1;
              reajustePorMes.set(key, atual);
            }
          });

          const reajusteArray = Array.from(reajustePorMes.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .slice(-12)
            .map(([key, valores]) => {
              const [anoStr, mesStr] = key.split('-');
              return {
                name: `${getMesNomeCurto(parseInt(mesStr))}/${anoStr.slice(2)}`,
                reajuste: valores.count > 0 ? valores.total / valores.count : 0,
              };
            });
          setEvolucaoReajuste(reajusteArray);

          // Calcular mÃ©dia anual do reajuste (excluindo meses sem reajuste)
          if (reajusteArray.length > 0) {
            const mesesComReajuste = reajusteArray.filter(item => item.reajuste > 0);
            if (mesesComReajuste.length > 0) {
              const somaReajuste = mesesComReajuste.reduce((acc, item) => acc + item.reajuste, 0);
              setMediaReajusteAnual(somaReajuste / mesesComReajuste.length);
            } else {
              setMediaReajusteAnual(0);
            }
          }

          // 7. EvoluÃ§Ã£o do Churn Rate (Ãºltimos 12 meses atÃ© o mÃªs selecionado)
          const churnPorMes = new Map<string, { total: number; count: number }>();
          financeiroData.forEach((item: any) => {
            const key = `${item.ano}-${String(item.mes).padStart(2, '0')}`;
            const churnValue = Number(item.churn_rate);
            if (key <= mesAtualKey && !isNaN(churnValue)) {
              const atual = churnPorMes.get(key) || { total: 0, count: 0 };
              atual.total += churnValue;
              atual.count += 1;
              churnPorMes.set(key, atual);
            }
          });

          const churnArray = Array.from(churnPorMes.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .slice(-12)
            .map(([key, valores]) => {
              const [anoStr, mesStr] = key.split('-');
              return {
                name: `${getMesNomeCurto(parseInt(mesStr))}/${anoStr.slice(2)}`,
                churn: valores.count > 0 ? valores.total / valores.count : 0,
              };
            });
          
          console.log('ðŸ“Š Churn - Total entries:', churnPorMes.size);
          console.log('ðŸ“Š Churn - Keys:', Array.from(churnPorMes.keys()).sort());
          console.log('ðŸ“Š EvoluÃ§Ã£o Churn Rate:', churnArray);
          setEvolucaoChurn(churnArray);

          // 8. EvoluÃ§Ã£o da Taxa de RenovaÃ§Ã£o (Ãºltimos 12 meses atÃ© o mÃªs selecionado)
          const renovacaoPorMes = new Map<string, { total: number; count: number }>();
          financeiroData.forEach((item: any) => {
            const key = `${item.ano}-${String(item.mes).padStart(2, '0')}`;
            const renovacaoValue = Number(item.taxa_renovacao);
            if (key <= mesAtualKey && !isNaN(renovacaoValue)) {
              const atual = renovacaoPorMes.get(key) || { total: 0, count: 0 };
              atual.total += renovacaoValue;
              atual.count += 1;
              renovacaoPorMes.set(key, atual);
            }
          });

          const renovacaoArray = Array.from(renovacaoPorMes.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .slice(-12)
            .map(([key, valores]) => {
              const [anoStr, mesStr] = key.split('-');
              return {
                name: `${getMesNomeCurto(parseInt(mesStr))}/${anoStr.slice(2)}`,
                renovacao: valores.count > 0 ? valores.total / valores.count : 0,
              };
            });
          
          console.log('ðŸ“Š RenovaÃ§Ã£o - Total entries:', renovacaoPorMes.size);
          console.log('ðŸ“Š RenovaÃ§Ã£o - Keys:', Array.from(renovacaoPorMes.keys()).sort());
          console.log('ðŸ“Š EvoluÃ§Ã£o Taxa RenovaÃ§Ã£o:', renovacaoArray);
          setEvolucaoTaxaRenovacao(renovacaoArray);
        }

      } catch (err) {
        console.error('Erro ao carregar dados de gestÃ£o:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchDados();
  }, [ano, mesInicio, mesFinal, unidade]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
      </div>
    );
  }

  // FunÃ§Ã£o helper para calcular variaÃ§Ã£o percentual
  const calcularVariacao = (atual: number, anterior: number): { valor: number; texto: string } => {
    if (anterior === 0) {
      if (atual === 0) return { valor: 0, texto: 'â€”' };
      return { valor: 100, texto: '+100%' };
    }
    const variacao = ((atual - anterior) / anterior) * 100;
    const sinal = variacao >= 0 ? '+' : '';
    return { valor: variacao, texto: `${sinal}${variacao.toFixed(0)}%` };
  };

  // Calcular variaÃ§Ãµes do mÃªs anterior
  const variacaoMatriculas = dadosAnterior ? calcularVariacao(dados?.novas_matriculas || 0, dadosAnterior.novas_matriculas || 0) : null;
  const variacaoEvasoes = dadosAnterior ? calcularVariacao(dados?.evasoes || 0, dadosAnterior.evasoes || 0) : null;

  if (!dados) {
    return (
      <div className="text-center text-slate-400 py-12">
        Nenhum dado encontrado para o perÃ­odo selecionado.
      </div>
    );
  }

  // Componente de estado vazio informativo
  const EstadoVazio = ({ titulo, mensagem }: { titulo: string; mensagem: string }) => (
    <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-8 text-center">
      <Info className="w-12 h-12 text-slate-500 mx-auto mb-3" />
      <h4 className="text-slate-300 font-medium mb-2">{titulo}</h4>
      <p className="text-slate-500 text-sm">{mensagem}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Sub-abas */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div data-tour="analytics-sub-abas" className="bg-slate-800/50 p-1 rounded-lg inline-flex gap-1">
          {subTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
                activeSubTab === tab.id
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              )}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>
        <div
          className={`min-h-9 px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 max-w-full ${competenciaBadgeClasses}`}
          title={competenciaMensal.tooltip}
        >
          {competenciaMensal.bloqueiaEscrita ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          <span className="min-w-0 truncate">{competenciaMensal.loading ? 'Validando competÃªncia' : competenciaMensal.badgeLabel}</span>
        </div>
      </div>

      {/* ConteÃºdo da Sub-aba */}
      {activeSubTab === 'alunos' && (
        <div className="space-y-6">
          {/* Aviso se o mÃªs nÃ£o estÃ¡ fechado + botÃ£o recalcular */}
          <div className="flex items-center justify-between gap-3">
            {!mesFechado && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3 flex-1">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <p className="text-amber-200 text-sm">
                  <strong>{alertaCompetenciaAberta.titulo}:</strong> {alertaCompetenciaAberta.descricao}
                </p>
              </div>
            )}
            {unidade && unidade !== 'todos' && (
              confirmRecalcularAnalytics && !recalcBloqueadoAnalytics ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-xl shrink-0">
                  <span className="text-xs text-slate-300">
                    Recalcular {getMesNomeCurto(mes)}/{ano}?
                  </span>
                  <button
                    onClick={confirmarRecalculoAnalytics}
                    disabled={recalculandoAnalytics}
                    className="h-6 px-2 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-600 rounded text-xs text-white font-medium transition"
                  >
                    {recalculandoAnalytics ? 'Recalculando...' : 'Sim'}
                  </button>
                  <button
                    onClick={() => setConfirmRecalcularAnalytics(false)}
                    className="h-6 px-2 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-400 transition"
                  >
                    NÃ£o
                  </button>
                </div>
              ) : (
                <Tooltip
                  side="top"
                  content={
                    recalcBloqueadoAnalytics
                      ? COMPETENCIA_FECHADA_MESSAGE
                      : 'Recalcular snapshot de dados mensais para a unidade selecionada'
                  }
                >
                  <button
                    onClick={solicitarRecalculoAnalytics}
                    className={`h-9 px-4 rounded-xl text-xs transition flex items-center gap-2 whitespace-nowrap shrink-0 ${
                      recalcBloqueadoAnalytics
                        ? 'bg-slate-800/70 border border-slate-700 text-slate-500 cursor-not-allowed'
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                    }`}
                    aria-disabled={recalcBloqueadoAnalytics}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Recalcular
                  </button>
                </Tooltip>
              )
            )}
          </div>
          {/* Linha 1: KPIs principais */}
          <div data-tour="analytics-kpis" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KPICard
              icon={Users}
              label="Total Alunos Ativos"
              tooltip="Total de pessoas com status ativo/trancado. Inclui matrÃ­culas regulares, banda e 2Âº curso."
              value={dados.total_alunos_ativos}
              variant="cyan"
            />
            <KPICard
              icon={DollarSign}
              label="Alunos Pagantes"
              tooltip="Alunos ativos com tipo de matrÃ­cula pagante (exclui bolsistas integrais e segundo curso)."
              value={dados.total_alunos_pagantes}
              target={metas.alunos_pagantes}
              format="number"
              variant="emerald"
              comparativoMesAnterior={dadosMesAnterior ? { valor: dadosMesAnterior.alunos_pagantes, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={dadosAnoAnterior ? { valor: dadosAnoAnterior.alunos_pagantes, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={Baby}
              label="LA Music Kids"
              tooltip="Alunos com classificaÃ§Ã£o LAMK (atÃ© 12 anos)."
              value={dados.total_la_kids}
              subvalue={`${(dados.total_la_kids + dados.total_la_adultos) > 0 ? ((dados.total_la_kids / (dados.total_la_kids + dados.total_la_adultos)) * 100).toFixed(0) : 0}% do classificÃ¡vel`}
              variant="rose"
            />
            <KPICard
              icon={GraduationCap}
              label="LA Music School"
              tooltip="Alunos com classificaÃ§Ã£o EMLA (acima de 12 anos)."
              value={dados.total_la_adultos}
              subvalue={`${(dados.total_la_kids + dados.total_la_adultos) > 0 ? ((dados.total_la_adultos / (dados.total_la_kids + dados.total_la_adultos)) * 100).toFixed(0) : 0}% do classificÃ¡vel`}
              variant="violet"
            />
            <KPICard
              icon={Music}
              label="Banda"
              tooltip="Total de matrÃ­culas em projetos de banda (Minha Banda, GarageBand, Power Kids, etc.)."
              value={dados.total_banda}
              variant="amber"
            />
          </div>

          {/* Linha 2: MovimentaÃ§Ã£o e bolsistas */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KPICard
              icon={UserPlus}
              label="Novas MatrÃ­culas"
              tooltip="Novos alunos passaporte no perÃ­odo. Exclui segundo curso, banda, coral e bolsistas. Clique para ver a lista."
              value={dados.novas_matriculas}
              variant="green"
              onClick={() => { fetchModalAlunos('matriculas'); setModalAberto('matriculas'); }}
              comparativoMesAnterior={dadosMesAnterior ? { valor: dadosMesAnterior.novas_matriculas, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={dadosAnoAnterior ? { valor: dadosAnoAnterior.novas_matriculas, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={UserMinus}
              label="EvasÃµes"
              tooltip="Cancelamentos e nÃ£o-renovaÃ§Ãµes no perÃ­odo. Deduplicado por aluno/mÃªs. Clique para ver a lista."
              value={dados.evasoes}
              variant="rose"
              inverterCor={true}
              onClick={() => { fetchModalEvasoes(); setModalAberto('evasoes'); }}
              comparativoMesAnterior={dadosMesAnterior ? { valor: dadosMesAnterior.evasoes, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={dadosAnoAnterior ? { valor: dadosAnoAnterior.evasoes, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={RefreshCw}
              label="Saldo LÃ­quido"
              tooltip="DiferenÃ§a entre novas matrÃ­culas e evasÃµes no perÃ­odo. Positivo = crescimento."
              value={dados.saldo_liquido}
              variant={dados.saldo_liquido >= 0 ? 'emerald' : 'rose'}
              comparativoMesAnterior={dadosMesAnterior ? { valor: dadosMesAnterior.novas_matriculas - dadosMesAnterior.evasoes, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={dadosAnoAnterior ? { valor: dadosAnoAnterior.novas_matriculas - dadosAnoAnterior.evasoes, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={GraduationCap}
              label="Bolsistas Integrais"
              tooltip="Alunos com tipo de matrÃ­cula bolsista integral (100% de desconto). Clique para ver a lista."
              value={dados.total_bolsistas_integrais}
              variant="amber"
              onClick={() => { fetchModalAlunos('bolsista_int'); setModalAberto('bolsista_int'); }}
            />
            <KPICard
              icon={Ticket}
              label="Bolsistas Parciais"
              tooltip="Alunos com tipo de matrÃ­cula bolsista parcial (desconto parcial na mensalidade). Clique para ver a lista."
              value={dados.total_bolsistas_parciais}
              variant="amber"
              onClick={() => { fetchModalAlunos('bolsista_parc'); setModalAberto('bolsista_parc'); }}
            />
          </div>

          {/* GrÃ¡ficos - Linha 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* DistribuiÃ§Ã£o por Unidade - apenas para Consolidado */}
            {unidade === 'todos' && (
              <DistributionChart
                data={distribuicao}
                title="DistribuiÃ§Ã£o por Unidade"
              />
            )}
            {evolucao.length > 0 ? (
              <div data-tour="analytics-grafico" className={unidade !== 'todos' ? 'lg:col-span-2' : ''}>
              <EvolutionChart
                data={evolucao}
                title="EvoluÃ§Ã£o Mensal"
                lines={[
                  { dataKey: 'alunos', color: '#06b6d4', name: 'Alunos' },
                  { dataKey: 'matriculas', color: '#10b981', name: 'MatrÃ­culas' },
                  { dataKey: 'evasoes', color: '#ef4444', name: 'EvasÃµes' },
                ]}
              />
              </div>
            ) : (
              <div className={unidade !== 'todos' ? 'lg:col-span-2' : ''}>
                <EstadoVazio
                  titulo="Sem dados de evoluÃ§Ã£o"
                  mensagem={`NÃ£o hÃ¡ dados de movimentaÃ§Ã£o registrados para ${ano}. Selecione um perÃ­odo anterior para visualizar o histÃ³rico.`}
                />
              </div>
            )}
          </div>

          {/* GrÃ¡ficos - Linha 2: MatrÃ­culas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {dados.matriculas_por_curso.length > 0 ? (
              <DistributionChart
                data={dados.matriculas_por_curso}
                title="Novas MatrÃ­culas por Curso"
              />
            ) : (
              <EstadoVazio
                titulo="Sem matrÃ­culas no perÃ­odo"
                mensagem={`Nenhuma matrÃ­cula registrada em ${getMesNomeCurto(mes)}/${ano}. Isso pode indicar perÃ­odo de baixa ou dados ainda nÃ£o lanÃ§ados.`}
              />
            )}
            {dados.matriculas_por_professor.length > 0 ? (
              <RankingTable
                data={dados.matriculas_por_professor.slice(0, 10)}
                title="ðŸŽ¯ Professores Matriculadores"
                valorLabel="MatrÃ­culas"
              />
            ) : (
              <EstadoVazio
                titulo="Sem ranking de professores matriculadores"
                mensagem={`Nenhuma matrÃ­cula com professor vinculado em ${getMesNomeCurto(mes)}/${ano}.`}
              />
            )}
          </div>

          {/* GrÃ¡ficos - Linha 3: EvasÃµes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {dados.evasoes_por_curso.length > 0 ? (
              <DistributionChart
                data={dados.evasoes_por_curso}
                title="EvasÃµes por Curso"
                footer={(
                  <>
                    <span className="font-medium text-white">{dados.evasoes}</span> evasÃµes no perÃ­odo
                    {dados.evasoes_por_curso.some(c => c.name === 'NÃ£o informado') && (
                      <span className="ml-2 text-yellow-400">â€¢ {dados.evasoes_por_curso.find(c => c.name === 'NÃ£o informado')?.value || 0} sem curso vinculado</span>
                    )}
                  </>
                )}
              />
            ) : (
              <EstadoVazio
                titulo="Sem evasÃµes no perÃ­odo"
                mensagem={`Nenhuma evasÃ£o registrada em ${getMesNomeCurto(mes)}/${ano}. Ã“tima notÃ­cia! ðŸŽ‰`}
              />
            )}
            {dados.evasoes_por_professor.length > 0 ? (
              <RankingTable
                data={dados.evasoes_por_professor.slice(0, 10).map(prof => ({
                  ...prof,
                  subvalor: dados.total_alunos_ativos > 0 
                    ? `${((prof.valor / dados.total_alunos_ativos) * 100).toFixed(1)}% da base`
                    : undefined
                }))}
                title="âš ï¸ EvasÃµes por Professor"
                valorLabel="EvasÃµes"
              />
            ) : (
              <EstadoVazio
                titulo="Sem ranking de evasÃµes"
                mensagem={`Nenhuma evasÃ£o com professor vinculado em ${getMesNomeCurto(mes)}/${ano}. Excelente! ðŸŽ‰`}
              />
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'financeiro' && (
        <div className="space-y-6">
          {/* Aviso se o mÃªs nÃ£o estÃ¡ fechado */}
          {!mesFechado && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <p className="text-amber-200 text-sm">
                <strong>{alertaCompetenciaAberta.titulo}:</strong> {alertaCompetenciaAberta.descricao}
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <KPICard
              icon={CreditCard}
              label="Ticket MÃ©dio"
              tooltip="Valor mÃ©dio da mensalidade dos alunos pagantes. Calculado: faturamento / total de pagantes."
              value={dados.ticket_medio}
              target={metas.ticket_medio}
              format="currency"
              variant="violet"
              comparativoMesAnterior={dadosMesAnterior ? { valor: dadosMesAnterior.ticket_medio, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={dadosAnoAnterior ? { valor: dadosAnoAnterior.ticket_medio, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={Wallet}
              label="MRR"
              tooltip="Monthly Recurring Revenue. Receita mensal recorrente: soma das mensalidades de todos os alunos pagantes."
              value={dados.mrr}
              format="currency"
              variant="emerald"
              comparativoMesAnterior={dadosMesAnterior ? { valor: dadosMesAnterior.faturamento_estimado, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={dadosAnoAnterior ? { valor: dadosAnoAnterior.faturamento_estimado, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={Calendar}
              label="ARR"
              tooltip="Annual Recurring Revenue. Receita anual projetada: MRR x 12 meses."
              value={formatCurrency(dados.arr)}
              subvalue="Receita Recorrente Anual"
              variant="cyan"
            />
            <KPICard
              icon={TrendingUp}
              label="LTV MÃ©dio"
              tooltip="Lifetime Value. Receita total gerada por um aluno durante sua permanencia. Calculado: ticket medio x tempo medio de permanencia."
              value={formatCurrency(dados.ltv_medio)}
              subvalue="Lifetime Value"
              variant="violet"
            />
            <KPICard
              icon={Target}
              label="Faturamento Previsto"
              tooltip="Receita esperada no mes com base nas mensalidades ativas. Equivale ao MRR."
              value={formatCurrency(dados.faturamento_previsto)}
              variant="cyan"
            />
            <KPICard
              icon={CheckCircle}
              label="Faturamento Realizado"
              tooltip="Receita efetivamente recebida no mes. Diferenca com o previsto indica inadimplencia."
              value={formatCurrency(dados.faturamento_realizado)}
              variant="emerald"
            />
            <KPICard
              icon={AlertTriangle}
              label="InadimplÃªncia %"
              tooltip="Percentual de alunos que nao pagaram no mes. Calculado: (previsto - realizado) / previsto x 100."
              value={dados.inadimplencia_pct}
              target={metas.inadimplencia}
              format="percent"
              metaInversa={true}
              variant="amber"
              inverterCor={true}
              comparativoMesAnterior={dadosMesAnterior ? { valor: dadosMesAnterior.inadimplencia, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={dadosAnoAnterior ? { valor: dadosAnoAnterior.inadimplencia, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={Percent}
              label="Reajuste MÃ©dio"
              tooltip="Percentual medio de aumento aplicado nas renovacoes do mes. Indica o poder de precificacao."
              value={`${dados.reajuste_pct.toFixed(1)}%`}
              variant="cyan"
            />
          </div>

          {/* GrÃ¡ficos Financeiros */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 1. EvoluÃ§Ã£o do MRR */}
            {evolucaoMRR.length > 0 ? (
              <EvolutionChart
                data={evolucaoMRR}
                title="ðŸ“ˆ EvoluÃ§Ã£o do MRR"
                lines={[
                  { dataKey: 'mrr', color: '#10b981', name: 'MRR' }
                ]}
                yAxisFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
              />
            ) : (
              <EstadoVazio
                titulo="Sem dados de MRR"
                mensagem="NÃ£o hÃ¡ dados histÃ³ricos de MRR para exibir a evoluÃ§Ã£o."
              />
            )}

            {/* 2. Previsto vs Realizado */}
            {previstoRealizado.length > 0 ? (
              <ComparisonChart
                data={previstoRealizado}
                title="ðŸ’° Previsto vs Realizado"
                bars={[
                  { dataKey: 'previsto', name: 'Previsto', color: '#8b5cf6' },
                  { dataKey: 'realizado', name: 'Realizado', color: '#10b981' }
                ]}
                formatValue={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
              />
            ) : (
              <EstadoVazio
                titulo="Sem dados de faturamento"
                mensagem="NÃ£o hÃ¡ dados histÃ³ricos de faturamento previsto e realizado."
              />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 3. Receita por Unidade - apenas para Consolidado */}
            {unidade === 'todos' && receitaPorUnidade.length > 0 ? (
              <DistributionChart
                data={receitaPorUnidade}
                title="ðŸ¢ Receita por Unidade (MRR)"
              />
            ) : unidade === 'todos' ? (
              <EstadoVazio
                titulo="Sem dados de receita por unidade"
                mensagem="NÃ£o hÃ¡ dados de MRR por unidade para o perÃ­odo selecionado."
              />
            ) : null}

            {/* 4. EvoluÃ§Ã£o da InadimplÃªncia */}
            {evolucaoInadimplencia.length > 0 ? (
              <AreaChart
                data={evolucaoInadimplencia}
                title="âš ï¸ EvoluÃ§Ã£o da InadimplÃªncia"
                dataKey="inadimplencia"
                name="InadimplÃªncia"
                color="#f59e0b"
                formatValue={(value) => `${value.toFixed(1)}%`}
                className={unidade !== 'todos' ? 'lg:col-span-2' : ''}
                showAverage={true}
                averageLabel="MÃ©dia"
              />
            ) : (
              <EstadoVazio
                titulo="Sem dados de inadimplÃªncia"
                mensagem="NÃ£o hÃ¡ dados histÃ³ricos de inadimplÃªncia para exibir a evoluÃ§Ã£o."
              />
            )}
          </div>

          {/* GrÃ¡ficos Financeiros - Linha 3: Ticket MÃ©dio e Reajuste */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 5. EvoluÃ§Ã£o do Ticket MÃ©dio */}
            {evolucaoTicketMedio.length > 0 ? (
              <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">ðŸ’° EvoluÃ§Ã£o do Ticket MÃ©dio</h3>
                  {mediaTicketAnual > 0 && (
                    <span className="text-sm text-slate-400">
                      Atual: <span className="text-emerald-400 font-bold">{formatCurrency(mediaTicketAnual)}</span>
                    </span>
                  )}
                </div>
                <EvolutionChart
                  data={evolucaoTicketMedio}
                  title=""
                  lines={[
                    { dataKey: 'ticket', color: '#8b5cf6', name: 'Ticket MÃ©dio' }
                  ]}
                  yAxisFormatter={(value) => `R$ ${value.toFixed(0)}`}
                />
              </div>
            ) : (
              <EstadoVazio
                titulo="Sem dados de ticket mÃ©dio"
                mensagem="NÃ£o hÃ¡ dados histÃ³ricos de ticket mÃ©dio para exibir a evoluÃ§Ã£o."
              />
            )}

            {/* 6. EvoluÃ§Ã£o do Reajuste MÃ©dio */}
            {evolucaoReajuste.length > 0 ? (
              <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">ðŸ“Š Reajustes Aplicados</h3>
                  {mediaReajusteAnual > 0 && (
                    <span className="text-sm text-slate-400">
                      MÃ©dia: <span className="text-cyan-400 font-bold">{mediaReajusteAnual.toFixed(1)}%</span>
                    </span>
                  )}
                </div>
                <ComparisonChart
                  data={evolucaoReajuste}
                  title=""
                  bars={[
                    { dataKey: 'reajuste', name: 'Reajuste %', color: '#06b6d4' }
                  ]}
                  formatValue={(value) => `${value.toFixed(1)}%`}
                />
              </div>
            ) : (
              <EstadoVazio
                titulo="Sem dados de reajuste"
                mensagem="NÃ£o hÃ¡ dados histÃ³ricos de reajuste para exibir a evoluÃ§Ã£o."
              />
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'retencao' && (
        <div className="space-y-6">
          {/* Aviso se o mÃªs nÃ£o estÃ¡ fechado */}
          {!mesFechado && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <p className="text-amber-200 text-sm">
                <strong>{alertaCompetenciaAberta.titulo}:</strong> {alertaCompetenciaAberta.descricao}
              </p>
            </div>
          )}
          {/* Linha 1: EvasÃµes (fluxo: tipos â†’ total â†’ taxa â†’ impacto) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KPICard
              icon={XCircle}
              label="Cancelamentos"
              tooltip="Alunos que cancelaram a matrÃ­cula no perÃ­odo (finalizaÃ§Ãµes via Emusys)."
              value={dados.cancelamentos}
              subvalue={`${dados.cancelamento_pct.toFixed(1)}%`}
              variant="rose"
              inverterCor={true}
            />
            <KPICard
              icon={UserX}
              label="NÃ£o RenovaÃ§Ãµes"
              tooltip="Alunos cujo contrato venceu e nÃ£o renovaram no perÃ­odo."
              value={dados.nao_renovacoes}
              variant="amber"
              inverterCor={true}
            />
            <KPICard
              icon={TrendingDown}
              label="Total EvasÃµes"
              tooltip="Soma de cancelamentos + nÃ£o renovaÃ§Ãµes no perÃ­odo."
              value={dados.total_evasoes}
              subvalue="Cancelamentos + NÃ£o RenovaÃ§Ãµes"
              variant="rose"
              inverterCor={true}
            />
            <KPICard
              icon={Percent}
              label="Churn Rate"
              tooltip="Taxa de perda de alunos. Calculado: evasÃµes / pagantes do mÃªs anterior Ã— 100."
              value={dados.churn_rate}
              target={metas.churn_rate}
              format="percent"
              metaInversa={true}
              variant="rose"
              inverterCor={true}
              comparativoMesAnterior={dadosMesAnterior ? { valor: dadosMesAnterior.churn_rate, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={dadosAnoAnterior ? { valor: dadosAnoAnterior.churn_rate, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={DollarSign}
              label="MRR Perdido"
              tooltip="Receita mensal perdida com as evasÃµes do perÃ­odo. Soma das parcelas dos alunos que saÃ­ram."
              value={formatCurrency(dados.mrr_perdido)}
              variant="rose"
            />
          </div>

          {/* Linha 2: RetenÃ§Ã£o (fluxo: renovaÃ§Ãµes â†’ taxa â†’ prevenÃ§Ã£o â†’ qualidade) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KPICard
              icon={CheckCircle}
              label="RenovaÃ§Ãµes"
              tooltip="Contratos que foram renovados no perÃ­odo."
              value={dados.renovacoes}
              variant="emerald"
            />
            <KPICard
              icon={RefreshCw}
              label="Taxa RenovaÃ§Ã£o"
              tooltip="Percentual de contratos renovados sobre o total de contratos vencidos no perÃ­odo."
              value={dados.renovacoes_pct}
              target={metas.taxa_renovacao}
              format="percent"
              variant="emerald"
              comparativoMesAnterior={dadosMesAnterior ? { valor: dadosMesAnterior.taxa_renovacao, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={dadosAnoAnterior ? { valor: dadosAnoAnterior.taxa_renovacao, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={Bell}
              label="Aviso PrÃ©vio"
              tooltip="Alunos que sinalizaram intenÃ§Ã£o de cancelar mas ainda nÃ£o efetivaram."
              value={dados.aviso_previo}
              variant="amber"
            />
            <KPICard
              icon={Calendar}
              label="Tempo PermanÃªncia"
              tooltip="Tempo mÃ©dio (em meses) que os alunos permanecem na escola antes de sair."
              value={dados.tempo_permanencia}
              subvalue="Meses (mÃ©dia) Â· clique para detalhar"
              variant="cyan"
              comparativoMesAnterior={dadosMesAnterior ? { valor: dadosMesAnterior.tempo_permanencia, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={dadosAnoAnterior ? { valor: dadosAnoAnterior.tempo_permanencia, label: dadosAnoAnterior.label } : undefined}
              onClick={() => setModalPermanenciaOpen(true)}
            />
            <KPICard
              icon={Star}
              label="NPS EvasÃµes"
              value={dados.nps_evasoes.toFixed(1)}
              subvalue="Nota mÃ©dia das evasÃµes"
              variant="amber"
            />
          </div>

          {/* GrÃ¡ficos de EvoluÃ§Ã£o */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* EvoluÃ§Ã£o do Churn Rate */}
            {evolucaoChurn.length > 0 ? (
              <AreaChart
                data={evolucaoChurn}
                title="ðŸ“‰ EvoluÃ§Ã£o do Churn Rate"
                dataKey="churn"
                name="Churn Rate"
                color="#ef4444"
                formatValue={(value) => `${value.toFixed(2)}%`}
                showAverage={true}
                averageLabel="MÃ©dia"
              />
            ) : (
              <EstadoVazio
                titulo="Sem dados de churn"
                mensagem="NÃ£o hÃ¡ dados histÃ³ricos de churn rate para exibir a evoluÃ§Ã£o."
              />
            )}

            {/* EvoluÃ§Ã£o da Taxa de RenovaÃ§Ã£o */}
            {evolucaoTaxaRenovacao.length > 0 ? (
              <AreaChart
                data={evolucaoTaxaRenovacao}
                title="ðŸ“ˆ EvoluÃ§Ã£o da Taxa de RenovaÃ§Ã£o"
                dataKey="renovacao"
                name="Taxa RenovaÃ§Ã£o"
                color="#10b981"
                formatValue={(value) => `${value.toFixed(1)}%`}
                showAverage={true}
                averageLabel="MÃ©dia"
              />
            ) : (
              <EstadoVazio
                titulo="Sem dados de renovaÃ§Ã£o"
                mensagem="NÃ£o hÃ¡ dados histÃ³ricos de taxa de renovaÃ§Ã£o para exibir a evoluÃ§Ã£o."
              />
            )}
          </div>

          {/* GrÃ¡fico de EvasÃµes vs MatrÃ­culas */}
          <div className="grid grid-cols-1 gap-6">
            {evolucao.length > 0 ? (
              <EvolutionChart
                data={evolucao}
                title="ðŸ“Š EvoluÃ§Ã£o: MatrÃ­culas vs EvasÃµes"
                lines={[
                  { dataKey: 'matriculas', color: '#10b981', name: 'MatrÃ­culas' },
                  { dataKey: 'evasoes', color: '#ef4444', name: 'EvasÃµes' },
                ]}
              />
            ) : (
              <EstadoVazio
                titulo="Sem dados de evasÃµes"
                mensagem="NÃ£o hÃ¡ dados histÃ³ricos de evasÃµes para exibir a evoluÃ§Ã£o."
              />
            )}
          </div>

          {/* GrÃ¡ficos de Motivos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DonutChart
              data={dados.motivos_nao_renovacao}
              title="Motivos de NÃ£o RenovaÃ§Ã£o"
              centerLabel="SaÃ­das"
            />
            <DonutChart
              data={dados.motivos_cancelamento}
              title="Motivos de Cancelamento"
              centerLabel="SaÃ­das"
            />
          </div>
        </div>
      )}

      {/* Modal de detalhamento de permanÃªncia */}
      <ModalPermanenciaDetalhe
        open={modalPermanenciaOpen}
        onOpenChange={setModalPermanenciaOpen}
        unidadeId={unidade}
        mediaAtual={dados?.tempo_permanencia || 0}
      />

      {/* Modal MatrÃ­culas */}
      <ModalDetalheKPI
        open={modalAberto === 'matriculas'}
        onClose={() => setModalAberto(null)}
        titulo="Novas MatrÃ­culas"
        descricao={`Alunos passaporte que se matricularam no perÃ­odo â€” ${unidade === 'todos' ? 'Consolidado' : 'Unidade selecionada'}`}
        dados={dadosModal}
        colunas={[
          { key: 'nome', label: 'Aluno' },
          { key: 'unidade', label: 'Unidade', render: (v: string) => <BadgeUnidade nome={v} /> },
          { key: 'data_matricula', label: 'Data MatrÃ­cula' },
          { key: 'curso', label: 'Curso', render: (v: string) => <TextoCurso nome={v} /> },
          { key: 'valor', label: 'Valor Parcela', render: (v: string) => <ValorParcela valor={v} /> },
        ]}
        carregando={carregandoModal}
      />

      {/* Modal EvasÃµes */}
      <ModalDetalheKPI
        open={modalAberto === 'evasoes'}
        onClose={() => setModalAberto(null)}
        titulo="EvasÃµes"
        descricao={`Alunos que saÃ­ram no perÃ­odo â€” ${unidade === 'todos' ? 'Consolidado' : 'Unidade selecionada'}`}
        dados={dadosModal}
        colunas={[
          { key: 'nome', label: 'Aluno' },
          { key: 'unidade', label: 'Unidade', render: (v: string) => <BadgeUnidade nome={v} /> },
          { key: 'data_evasao', label: 'Data' },
          { key: 'tipo', label: 'Tipo', render: (_v: string, row: any) => <BadgeTipo tipo={row.tipo} variante={row._tipo_raw === 'evasao' ? 'evasao' : 'nao_renovacao'} /> },
          { key: 'motivo', label: 'Motivo' },
        ]}
        carregando={carregandoModal}
      />

      {/* Modal Banda */}
      <ModalDetalheKPI
        open={modalAberto === 'banda'}
        onClose={() => setModalAberto(null)}
        titulo="Alunos de Banda"
        descricao={`Alunos em projetos de banda â€” ${unidade === 'todos' ? 'Consolidado' : 'Unidade selecionada'}`}
        dados={dadosModal}
        colunas={[
          { key: 'nome', label: 'Aluno' },
          { key: 'unidade', label: 'Unidade', render: (v: string) => <BadgeUnidade nome={v} /> },
          { key: 'curso', label: 'Projeto', render: (v: string) => <TextoCurso nome={v} /> },
          { key: 'professor', label: 'Professor' },
          { key: 'dia', label: 'Dia' },
          { key: 'horario', label: 'HorÃ¡rio' },
        ]}
        carregando={carregandoModal}
      />

      {/* Modal Bolsistas Integrais */}
      <ModalDetalheKPI
        open={modalAberto === 'bolsista_int'}
        onClose={() => setModalAberto(null)}
        titulo="Bolsistas Integrais"
        descricao={`Alunos com bolsa integral â€” ${unidade === 'todos' ? 'Consolidado' : 'Unidade selecionada'}`}
        dados={dadosModal}
        colunas={[
          { key: 'nome', label: 'Aluno' },
          { key: 'unidade', label: 'Unidade', render: (v: string) => <BadgeUnidade nome={v} /> },
          { key: 'curso', label: 'Curso', render: (v: string) => <TextoCurso nome={v} /> },
          { key: 'professor', label: 'Professor' },
        ]}
        carregando={carregandoModal}
      />

      {/* Modal Bolsistas Parciais */}
      <ModalDetalheKPI
        open={modalAberto === 'bolsista_parc'}
        onClose={() => setModalAberto(null)}
        titulo="Bolsistas Parciais"
        descricao={`Alunos com bolsa parcial â€” ${unidade === 'todos' ? 'Consolidado' : 'Unidade selecionada'}`}
        dados={dadosModal}
        colunas={[
          { key: 'nome', label: 'Aluno' },
          { key: 'unidade', label: 'Unidade', render: (v: string) => <BadgeUnidade nome={v} /> },
          { key: 'curso', label: 'Curso', render: (v: string) => <TextoCurso nome={v} /> },
          { key: 'professor', label: 'Professor' },
          { key: 'valor', label: 'Valor Parcela', render: (v: string) => <ValorParcela valor={v} /> },
        ]}
        carregando={carregandoModal}
      />
    </div>
  );
}

export default TabGestao;
