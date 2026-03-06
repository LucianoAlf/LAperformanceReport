'use client';

import React, { useState, useEffect } from 'react';
import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/useToast';
import { 
  Users, DollarSign, BookOpen, GraduationCap, UserPlus,
  FileText, Calendar, Plus, Pause, RefreshCw, XCircle, AlertTriangle, LogOut,
  Zap, BarChart3, CheckCircle, DoorOpen, PauseCircle, Search
} from 'lucide-react';
import { PageTour, TourHelpButton } from '@/components/Onboarding';
import { administrativoTourSteps } from '@/components/Onboarding/tours';
import { supabase } from '@/lib/supabase';
import { KPICard } from '@/components/ui/KPICard';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { PageTabs, type PageTab } from '@/components/ui/page-tabs';
import { PageFilterBar } from '@/components/ui/page-filter-bar';
import { CompetenciaFilter } from '@/components/ui/CompetenciaFilter';
import { useCompetenciaFiltro } from '@/hooks/useCompetenciaFiltro';
import { QuickInputCard } from './QuickInputCard';
import { TabelaRenovacoes } from './TabelaRenovacoes';
import { TabelaAvisosPrevios } from './TabelaAvisosPrevios';
import { TabelaEvasoes } from './TabelaEvasoes';
import { ModalRenovacao } from './ModalRenovacao';
import { ModalNaoRenovacao } from './ModalNaoRenovacao';
import { ModalAvisoPrevio } from './ModalAvisoPrevio';
import { ModalEvasao } from './ModalEvasao';
import { ModalTrancamento } from './ModalTrancamento';
import { ModalRelatorio } from './ModalRelatorio';
import { TabelaNaoRenovacoes } from './TabelaNaoRenovacoes';
import { TabelaTrancamentos } from './TabelaTrancamentos';
import { TabelaAlunosNovos } from './TabelaAlunosNovos';
import { ModalConfirmacao } from '@/components/ui/ModalConfirmacao';
import { AlertasRetencao } from './AlertasRetencao';
import { PlanoAcaoRetencao } from './PlanoAcaoRetencao';
import { TabProgramaFideliza } from './TabProgramaFideliza';
import { TabLojinha } from '../Lojinha';
import { PainelFarmer } from './PainelFarmer';
import { Trophy, ShoppingBag, ClipboardList, MessageSquare } from 'lucide-react';
import { CaixaEntradaTab } from './CaixaEntrada';

import type { UnidadeId } from '@/components/ui/UnidadeFilter';

// Tipos
export interface MovimentacaoAdmin {
  id?: number;
  unidade_id?: string | null;
  tipo: 'renovacao' | 'nao_renovacao' | 'aviso_previo' | 'evasao' | 'trancamento';
  data: string;
  aluno_nome: string;
  professor_id?: number | null;
  professor_nome?: string;
  valor_parcela_anterior?: number | null;
  valor_parcela_novo?: number | null;
  forma_pagamento_id?: number | null;
  forma_pagamento_nome?: string;
  agente_comercial?: string | null;
  curso_id?: number | null;
  curso_nome?: string;
  motivo?: string | null;
  mes_saida?: string | null;
  tipo_evasao?: string | null;
  tempo_permanencia_meses?: number | null;
  valor_parcela_evasao?: number | null;
  previsao_retorno?: string | null;
  observacoes?: string | null;
  created_at?: string;
  unidades?: { codigo: string };
  alunos?: { classificacao: string };
}

export interface ResumoMes {
  alunos_ativos: number;
  alunos_pagantes: number;
  alunos_nao_pagantes: number;
  alunos_trancados: number;
  bolsistas_integrais: number;
  bolsistas_parciais: number;
  alunos_novos: number;
  matriculas_ativas: number;
  matriculas_banda: number;
  matriculas_2_curso: number;
  renovacoes_previstas: number;
  renovacoes_realizadas: number;
  renovacoes_pendentes: number;
  nao_renovacoes: number;
  avisos_previos: number;
  evasoes_total: number;
  evasoes_interrompido: number;
  evasoes_nao_renovou: number;
  ticket_medio: number;
  faturamento: number;
  churn_rate: number;
  ltv_meses: number;
  mrr_perdido: number;
  novos_segundo_curso: number;
  novos_bolsistas: number;
}

type TabId = 'renovacoes' | 'nao_renovacoes' | 'avisos' | 'cancelamentos' | 'trancamentos' | 'alunos_novos';

const tabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'renovacoes', label: 'Renovações', icon: CheckCircle },
  { id: 'nao_renovacoes', label: 'Não Renovação', icon: XCircle },
  { id: 'avisos', label: 'Avisos Prévios', icon: AlertTriangle },
  { id: 'cancelamentos', label: 'Cancelamentos', icon: DoorOpen },
  { id: 'trancamentos', label: 'Trancamentos', icon: PauseCircle },
  { id: 'alunos_novos', label: 'Alunos Novos', icon: UserPlus },
];

export function AdministrativoPage() {
  useSetPageTitle({
    titulo: 'Administrativo',
    subtitulo: 'Gestão de Renovações, Avisos e Cancelamentos',
    icone: FileText,
    iconeCor: 'text-violet-400',
    iconeWrapperCor: 'bg-violet-500/20',
  });

  const { isAdmin, unidadeId } = useAuth();
  const context = useOutletContext<{ filtroAtivo: string | null; unidadeSelecionada: string | null }>();
  
  // Para usuários de unidade: usar unidadeId direto do auth (mais confiável que contexto)
  // Para admin: usar filtroAtivo do contexto, fallback para 'todos'
  const unidade = isAdmin 
    ? (context?.filtroAtivo ?? 'todos')
    : unidadeId; // pode ser null inicialmente, mas evita fallback para 'todos'
  
  // Hook de filtro de competência (período)
  const competenciaFiltro = useCompetenciaFiltro();
  
  // Estado
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('renovacoes');
  const [mainTab, setMainTab] = useState<'lancamentos' | 'fideliza' | 'lojinha' | 'farmer' | 'caixa_entrada'>('lancamentos');
  
  // Dados
  const [resumo, setResumo] = useState<ResumoMes | null>(null);
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoAdmin[]>([]);
  const [professores, setProfessores] = useState<{ id: number; nome: string }[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<{ id: number; nome: string; sigla: string }[]>([]);
  const [cursos, setCursos] = useState<{ id: number; nome: string }[]>([]);
  const [alunosNovos, setAlunosNovos] = useState<any[]>([]);
  
  // Modais
  const [modalRenovacao, setModalRenovacao] = useState(false);
  const [modalNaoRenovacao, setModalNaoRenovacao] = useState(false);
  const [modalAvisoPrevio, setModalAvisoPrevio] = useState(false);
  const [modalEvasao, setModalEvasao] = useState(false);
  const [modalTrancamento, setModalTrancamento] = useState(false);
  const [modalRelatorio, setModalRelatorio] = useState(false);
  const [editingItem, setEditingItem] = useState<MovimentacaoAdmin | null>(null);
  const [modalConfirmacao, setModalConfirmacao] = useState(false);
  const [itemParaDestrancar, setItemParaDestrancar] = useState<MovimentacaoAdmin | null>(null);
  const [destrancando, setDestrancando] = useState(false);
  const [modalConfirmacaoExcluir, setModalConfirmacaoExcluir] = useState(false);
  const [itemParaExcluir, setItemParaExcluir] = useState<{ id: number; nome: string } | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const { success: toastSuccess, info: toastInfo, error: toastError } = useToast();

  // Extrair ano e mês do filtro de competência
  const ano = competenciaFiltro.filtro.ano;
  const mes = competenciaFiltro.filtro.mes;
  const { startDate, endDate } = competenciaFiltro.range;
  
  // Competência formatada para os modais (YYYY-MM)
  const competencia = `${ano}-${String(mes).padStart(2, '0')}`;

  // Carregar dados - executa quando unidade ou período mudar
  useEffect(() => {
    loadData();
  }, [startDate, endDate, unidade]);

  async function loadData() {
    // Aguardar auth carregar para usuários de unidade
    if (!isAdmin && !unidadeId) {
      return; // Ainda carregando, não executar queries
    }
    
    setLoading(true);
    try {
      // Usar range de datas do filtro de competência
      const { startDate: start, endDate: end } = competenciaFiltro.range;

      // Carregar movimentações + avisos retroativos + professores + formas pgto em PARALELO
      let query = supabase
        .from('movimentacoes_admin')
        .select('*, unidades(codigo)')
        .gte('data', startDate)
        .lte('data', endDate)
        .order('data', { ascending: false });

      const mesSaidaStart = `${ano}-${String(mes).padStart(2, '0')}-01`;
      const mesSaidaEnd = `${ano}-${String(mes).padStart(2, '0')}-28`;
      let queryAvisos = supabase
        .from('movimentacoes_admin')
        .select('*, unidades(codigo)')
        .eq('tipo', 'aviso_previo')
        .gte('mes_saida', mesSaidaStart)
        .lte('mes_saida', mesSaidaEnd)
        .lt('data', startDate)
        .order('data', { ascending: false });

      if (unidade !== 'todos') {
        query = query.eq('unidade_id', unidade);
        queryAvisos = queryAvisos.eq('unidade_id', unidade);
      }

      // 5 queries em paralelo — inclui view de retenção para KPIs consistentes com Analytics
      let retencaoQuery = supabase
        .from('vw_kpis_retencao_mensal')
        .select('*')
        .eq('ano', ano)
        .eq('mes', mes);
      if (unidade !== 'todos') {
        retencaoQuery = retencaoQuery.eq('unidade_id', unidade);
      }

      const [movResult, avisosResult, profsResult, fpResult, cursosResult, retencaoResult] = await Promise.all([
        query,
        queryAvisos,
        supabase.from('professores').select('id, nome').eq('ativo', true).order('nome'),
        supabase.from('formas_pagamento').select('id, nome, sigla').order('nome'),
        supabase.from('cursos').select('id, nome').order('nome'),
        retencaoQuery,
      ]);

      const { data: movData, error: movError } = movResult;
      if (movError) throw movError;
      const { data: avisosRetroativos } = avisosResult;
      const profData = profsResult.data;
      const fpData = fpResult.data;
      const cursosData = cursosResult.data;
      const retencaoData = retencaoResult.data;

      // Combinar resultados sem duplicatas
      const idsJaPresentes = new Set((movData || []).map(m => m.id));
      const movCombinado = [
        ...(movData || []),
        ...(avisosRetroativos || []).filter(a => !idsJaPresentes.has(a.id)),
      ];

      // Buscar classificação dos alunos (depende dos IDs das movimentações)
      const alunosIds = movCombinado.filter(m => m.aluno_id).map(m => m.aluno_id) || [];
      let alunosMap = new Map();
      
      if (alunosIds.length > 0) {
        const { data: alunosData } = await supabase
          .from('alunos')
          .select('id, classificacao, tipo_matricula_id, is_segundo_curso')
          .in('id', alunosIds);
        
        alunosMap = new Map(alunosData?.map(a => [a.id, a]) || []);
      }

      // Enriquecer movimentações com classificação dos alunos e nome do curso
      const cursosMap = new Map((cursosData || []).map(c => [c.id, c.nome]));
      const movDataComAlunos = movCombinado.map(m => ({
        ...m,
        alunos: m.aluno_id ? alunosMap.get(m.aluno_id) : null,
        curso_nome: m.curso_id ? cursosMap.get(m.curso_id) || null : null,
      }));

      // Verificar se é período atual ou histórico
      const hoje = new Date();
      const anoAtual = hoje.getFullYear();
      const mesAtual = hoje.getMonth() + 1;
      const isPeriodoAtual = ano === anoAtual && mes === mesAtual;

      let kpisData: any[] = [];

      if (isPeriodoAtual) {
        // PERÍODO ATUAL: usar view em tempo real
        let kpisQuery = supabase
          .from('vw_kpis_gestao_mensal')
          .select('*')
          .eq('ano', ano)
          .eq('mes', mes);

        if (unidade !== 'todos') {
          kpisQuery = kpisQuery.eq('unidade_id', unidade);
        }

        const { data } = await kpisQuery;
        kpisData = data || [];

        // FALLBACK: view pode retornar vazio para unidades sem leads no mês
        // (a view usa leads para calcular ano/mes, então unidades sem leads ficam invisíveis)
        if (kpisData.length === 0 && unidade !== 'todos') {
          let alunosQuery = supabase
            .from('alunos')
            .select('id, status, tipo_matricula_id, is_segundo_curso, valor_parcela, tipos_matricula(codigo, conta_como_pagante)')
            .in('status', ['ativo', 'trancado'])
            .eq('unidade_id', unidade);

          const { data: alunosData } = await alunosQuery;

          if (alunosData && alunosData.length > 0) {
            const totalAtivos = alunosData.filter((a: any) => !a.is_segundo_curso).length;
            const pagantes = alunosData.filter((a: any) =>
              (a.tipos_matricula as any)?.conta_como_pagante && !a.is_segundo_curso
            );
            const totalPagantes = pagantes.length;
            const bolsistasInt = alunosData.filter((a: any) =>
              (a.tipos_matricula as any)?.codigo === 'BOLSISTA_INT' && !a.is_segundo_curso
            ).length;
            const bolsistasParciais = alunosData.filter((a: any) =>
              (a.tipos_matricula as any)?.codigo === 'BOLSISTA_PARC' && !a.is_segundo_curso
            ).length;
            const ticketMedio = pagantes.length > 0
              ? pagantes.reduce((sum: number, a: any) => sum + (Number(a.valor_parcela) || 0), 0) / pagantes.length
              : 0;
            const faturamento = pagantes.reduce((sum: number, a: any) => sum + (Number(a.valor_parcela) || 0), 0);

            kpisData = [{
              unidade_id: unidade,
              total_alunos_ativos: totalAtivos,
              total_alunos_pagantes: totalPagantes,
              total_bolsistas_integrais: bolsistasInt,
              total_bolsistas_parciais: bolsistasParciais,
              ticket_medio: Math.round(ticketMedio),
              faturamento_previsto: faturamento,
              churn_rate: 0,
              tempo_permanencia_medio: 0,
            }];
          }
        }
      } else {
        // PERÍODO HISTÓRICO: tentar dados_mensais primeiro, senão calcular das tabelas base
        let historicoQuery = supabase
          .from('dados_mensais')
          .select('*')
          .eq('ano', ano)
          .eq('mes', mes);

        if (unidade !== 'todos') {
          historicoQuery = historicoQuery.eq('unidade_id', unidade);
        }

        const { data } = await historicoQuery;
        if (data && data.length > 0) {
          // Transformar dados históricos para o formato esperado
          kpisData = data.map((d: any) => ({
            unidade_id: d.unidade_id,
            total_alunos_ativos: d.alunos_ativos || d.alunos_pagantes || 0,
            total_alunos_pagantes: d.alunos_pagantes || 0,
            total_bolsistas_integrais: 0,
            total_bolsistas_parciais: 0,
            ticket_medio: Number(d.ticket_medio) || 0,
            faturamento_previsto: Number(d.faturamento_estimado) || 0,
            churn_rate: Number(d.churn_rate) || 0,
            tempo_permanencia_medio: Number(d.tempo_permanencia) || 0,
            // Snapshot de matrículas do dados_mensais (campos novos)
            _matriculas_ativas: d.matriculas_ativas,
            _matriculas_banda: d.matriculas_banda,
            _matriculas_2_curso: d.matriculas_2_curso,
          }));
        } else {
          // FALLBACK: calcular KPIs diretamente das tabelas base
          // Buscar alunos ativos/pagantes/bolsistas do período
          let alunosQuery = supabase
            .from('alunos')
            .select('id, status, tipo_matricula_id, is_segundo_curso, valor_parcela, tipos_matricula(codigo, conta_como_pagante)')
            .in('status', ['ativo', 'trancado']);

          if (unidade !== 'todos') {
            alunosQuery = alunosQuery.eq('unidade_id', unidade);
          }

          const { data: alunosData } = await alunosQuery;
          
          if (alunosData && alunosData.length > 0) {
            const totalAtivos = alunosData.filter((a: any) => !a.is_segundo_curso).length;
            const pagantes = alunosData.filter((a: any) => 
              (a.tipos_matricula as any)?.conta_como_pagante && !a.is_segundo_curso
            );
            const totalPagantes = pagantes.length;
            const bolsistasInt = alunosData.filter((a: any) => 
              (a.tipos_matricula as any)?.codigo === 'BOLSISTA_INT' && !a.is_segundo_curso
            ).length;
            const bolsistasParciais = alunosData.filter((a: any) => 
              (a.tipos_matricula as any)?.codigo === 'BOLSISTA_PARC' && !a.is_segundo_curso
            ).length;
            const ticketMedio = pagantes.length > 0 
              ? pagantes.reduce((sum: number, a: any) => sum + (Number(a.valor_parcela) || 0), 0) / pagantes.length 
              : 0;
            const faturamento = pagantes.reduce((sum: number, a: any) => sum + (Number(a.valor_parcela) || 0), 0);

            kpisData = [{
              unidade_id: unidade !== 'todos' ? unidade : null,
              total_alunos_ativos: totalAtivos,
              total_alunos_pagantes: totalPagantes,
              total_bolsistas_integrais: bolsistasInt,
              total_bolsistas_parciais: bolsistasParciais,
              ticket_medio: Math.round(ticketMedio),
              faturamento_previsto: faturamento,
              churn_rate: 0,
              tempo_permanencia_medio: 0,
            }];
          }
        }
      }

      // Buscar matrículas ativas, banda e 2º curso
      // Para período histórico com snapshot disponível, usar dados do dados_mensais
      const snapshotMatriculas = !isPeriodoAtual && kpisData?.length > 0 && kpisData[0]._matriculas_ativas != null;

      let matriculasAtivas = 0;
      let matriculasBanda = 0;
      let matriculas2Curso = 0;

      if (snapshotMatriculas) {
        // Usar snapshot histórico do dados_mensais
        matriculasAtivas = kpisData.reduce((acc: number, k: any) => acc + (k._matriculas_ativas || 0), 0);
        matriculasBanda = kpisData.reduce((acc: number, k: any) => acc + (k._matriculas_banda || 0), 0);
        matriculas2Curso = kpisData.reduce((acc: number, k: any) => acc + (k._matriculas_2_curso || 0), 0);
      } else {
        // Query ao vivo (período atual ou sem snapshot)
        let matriculasQuery = supabase
          .from('alunos')
          .select('id, is_segundo_curso, curso_id, cursos(nome)')
          .in('status', ['ativo', 'aviso_previo']);

        if (unidade !== 'todos') {
          matriculasQuery = matriculasQuery.eq('unidade_id', unidade);
        }

        const { data: matriculasData } = await matriculasQuery;

        matriculasAtivas = matriculasData?.length || 0;
        matriculasBanda = matriculasData?.filter((m: any) =>
          m.cursos?.nome?.toLowerCase().includes('banda')
        ).length || 0;
        matriculas2Curso = matriculasData?.filter((m: any) => m.is_segundo_curso).length || 0;
      }

      // Consolidar KPIs
      const kpis = kpisData?.reduce((acc, k) => ({
        alunos_ativos: (acc.alunos_ativos || 0) + (k.total_alunos_ativos || 0),
        alunos_pagantes: (acc.alunos_pagantes || 0) + (k.total_alunos_pagantes || 0),
        alunos_nao_pagantes: (acc.alunos_nao_pagantes || 0) + ((k.total_alunos_ativos || 0) - (k.total_alunos_pagantes || 0)),
        bolsistas_integrais: (acc.bolsistas_integrais || 0) + (k.total_bolsistas_integrais || 0),
        bolsistas_parciais: (acc.bolsistas_parciais || 0) + (k.total_bolsistas_parciais || 0),
        matriculas_banda: matriculasBanda,
        matriculas_2_curso: matriculas2Curso,
        ticket_medio: k.ticket_medio || acc.ticket_medio || 0,
        faturamento: (acc.faturamento || 0) + (Number(k.faturamento_previsto) || 0),
        churn_rate: k.churn_rate || acc.churn_rate || 0,
        ltv_meses: Number(k.tempo_permanencia_medio) || acc.ltv_meses || 0,
      }), {} as any) || {};

      // Contar movimentações por tipo
      const renovacoes = movDataComAlunos?.filter(m => m.tipo === 'renovacao') || [];
      const naoRenovacoes = movDataComAlunos?.filter(m => m.tipo === 'nao_renovacao') || [];
      const avisosPrevios = movDataComAlunos?.filter(m => m.tipo === 'aviso_previo') || [];
      const evasoes = movDataComAlunos?.filter(m => m.tipo === 'evasao') || [];
      const trancamentos = movDataComAlunos?.filter(m => m.tipo === 'trancamento') || [];

      // Enriquecer movimentações com nomes
      const profMap = new Map(profData?.map(p => [p.id, p.nome]) || []);
      const fpMap = new Map(fpData?.map(f => [f.id, { nome: f.nome, sigla: f.sigla }]) || []);

      const movimentacoesEnriquecidas = (movDataComAlunos || []).map(m => ({
        ...m,
        professor_nome: m.professor_id ? profMap.get(m.professor_id) : undefined,
        forma_pagamento_nome: m.forma_pagamento_id ? fpMap.get(m.forma_pagamento_id)?.sigla : undefined,
      }));

      setMovimentacoes(movimentacoesEnriquecidas);
      setProfessores(profData || []);
      setFormasPagamento(fpData || []);
      setCursos(cursosData || []);

      // Buscar novos alunos do mês — apenas novos INDIVÍDUOS (excluir 2º curso e bolsistas)
      let novosAlunosQuery = supabase
        .from('alunos')
        .select('id, nome, data_matricula, unidade_id, valor_parcela, is_segundo_curso, tipo_matricula_id, agente_comercial, cursos(nome), professores:professor_atual_id(nome), tipos_matricula(codigo, conta_como_pagante), formas_pagamento:forma_pagamento_id(nome, sigla), unidades(codigo)')
        .gte('data_matricula', startDate)
        .lte('data_matricula', endDate)
        .order('data_matricula', { ascending: false });

      if (unidade !== 'todos') {
        novosAlunosQuery = novosAlunosQuery.eq('unidade_id', unidade);
      }

      const { data: novosAlunosData } = await novosAlunosQuery;
      const todosNovos = novosAlunosData || [];
      setAlunosNovos(todosNovos);
      // Filtrar: apenas novos indivíduos pagantes (sem 2º curso, sem bolsistas)
      // tipos_matricula bolsistas: BOLSISTA_INT(3), BOLSISTA_PARC(4), BANDA(5)
      const novosAlunos = todosNovos.filter(a => 
        !a.is_segundo_curso && 
        a.tipo_matricula_id && ![3, 4, 5].includes(a.tipo_matricula_id)
      );
      const novosSegundoCurso = todosNovos.filter(a => a.is_segundo_curso).length;
      const novosBolsistas = todosNovos.filter(a => 
        a.tipo_matricula_id && [3, 4, 5].includes(a.tipo_matricula_id)
      ).length;

      // Consolidar dados de retenção da view (fonte de verdade = mesma do Analytics)
      const retConsolidado = retencaoData?.reduce((acc: any, r: any) => ({
        total_evasoes: (acc.total_evasoes || 0) + (r.total_evasoes || 0),
        evasoes_interrompidas: (acc.evasoes_interrompidas || 0) + (r.evasoes_interrompidas || 0),
        nao_renovacoes: (acc.nao_renovacoes || 0) + (r.nao_renovacoes || 0),
        avisos_previos: (acc.avisos_previos || 0) + (r.avisos_previos || 0),
        mrr_perdido: (acc.mrr_perdido || 0) + (Number(r.mrr_perdido) || 0),
        renovacoes_previstas: (acc.renovacoes_previstas || 0) + (r.renovacoes_previstas || 0),
        renovacoes_realizadas: (acc.renovacoes_realizadas || 0) + (r.renovacoes_realizadas || 0),
        renovacoes_pendentes: (acc.renovacoes_pendentes || 0) + (r.renovacoes_pendentes || 0),
      }), {}) || {};

      // Montar resumo — combinar view + movimentacoes_admin para dados completos
      // A view só conta registros da tabela `renovacoes` (que só tem renovados).
      // Não renovações vêm de movimentacoes_admin, então usamos Math.max para pegar o maior.
      const naoRenovacoesCount = Math.max(retConsolidado.nao_renovacoes || 0, naoRenovacoes.length);
      const renovacoesRealizadasCount = Math.max(retConsolidado.renovacoes_realizadas || 0, renovacoes.length);
      const renovacoesPendentesCount = retConsolidado.renovacoes_pendentes || 0;

      setResumo({
        ...kpis,
        alunos_trancados: trancamentos.length,
        alunos_novos: novosAlunos.length,
        novos_segundo_curso: novosSegundoCurso,
        novos_bolsistas: novosBolsistas,
        matriculas_ativas: matriculasAtivas,
        renovacoes_previstas: renovacoesRealizadasCount + naoRenovacoesCount + renovacoesPendentesCount,
        renovacoes_realizadas: renovacoesRealizadasCount,
        renovacoes_pendentes: renovacoesPendentesCount,
        nao_renovacoes: naoRenovacoesCount,
        avisos_previos: retConsolidado.avisos_previos || avisosPrevios.length,
        evasoes_total: retConsolidado.total_evasoes || (evasoes.length + naoRenovacoes.length),
        evasoes_interrompido: retConsolidado.evasoes_interrompidas || evasoes.length,
        evasoes_nao_renovou: naoRenovacoesCount,
        mrr_perdido: retConsolidado.mrr_perdido || 0,
      });

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  }

  // Handlers para salvar
  async function handleSaveMovimentacao(data: Partial<MovimentacaoAdmin>) {
    try {
      const payload = {
        ...data,
        unidade_id: unidade === 'todos' ? null : unidade,
      };

      if (editingItem?.id) {
        const { error } = await supabase
          .from('movimentacoes_admin')
          .update(payload)
          .eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('movimentacoes_admin')
          .insert(payload);
        if (error) throw error;
      }

      // Atualizar status do aluno quando for trancamento, evasão ou não renovação
      if (data.aluno_nome && (data.tipo === 'trancamento' || data.tipo === 'evasao' || data.tipo === 'nao_renovacao')) {
        // Usar aluno_id se disponível, senão buscar pelo nome
        let alunoId = (data as any).aluno_id;
        
        if (!alunoId) {
          const { data: alunoData } = await supabase
            .from('alunos')
            .select('id')
            .eq('nome', data.aluno_nome)
            .single();
          alunoId = alunoData?.id;
        }
        
        if (alunoId) {
          // Definir status e campos baseado no tipo de movimentação
          const updateData: { status: string; data_saida?: string } = {
            status: data.tipo === 'trancamento' ? 'trancado' : 'inativo'
          };
          
          // Para evasão e não renovação, também preencher data_saida
          if (data.tipo === 'evasao' || data.tipo === 'nao_renovacao') {
            updateData.data_saida = data.data;
          }
          
          const { error: alunoError } = await supabase
            .from('alunos')
            .update(updateData)
            .eq('id', alunoId);
          
          if (alunoError) {
            console.error('Erro ao atualizar status do aluno:', alunoError);
          }
        }
      }

      // Verificar se a data está fora do range do filtro atual
      const dataMovimentacao = data.data;
      if (dataMovimentacao && (dataMovimentacao < startDate || dataMovimentacao > endDate)) {
        const isAvisoPrevio = data.tipo === 'aviso_previo';
        toastInfo(
          'Registro salvo com sucesso!',
          isAvisoPrevio
            ? `O aviso prévio foi salvo com data ${dataMovimentacao}. Ele aparecerá no mês de saída selecionado.`
            : `A data ${dataMovimentacao} está fora do mês selecionado no filtro. Mude o filtro de competência para visualizar este registro.`
        );
      }

      await loadData();
      setEditingItem(null);
      return true;
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toastError('Erro ao salvar', 'Ocorreu um erro ao salvar o registro. Tente novamente.');
      return false;
    }
  }

  function handleDeleteMovimentacao(id: number) {
    // Encontrar o item para mostrar o nome no modal
    const item = movimentacoes.find(m => m.id === id);
    setItemParaExcluir({ id, nome: item?.aluno_nome || 'este registro' });
    setModalConfirmacaoExcluir(true);
  }

  async function handleConfirmarExclusao() {
    if (!itemParaExcluir) return;

    setExcluindo(true);
    try {
      const { error } = await supabase
        .from('movimentacoes_admin')
        .delete()
        .eq('id', itemParaExcluir.id);
      if (error) throw error;
      
      setModalConfirmacaoExcluir(false);
      setItemParaExcluir(null);
      await loadData();
    } catch (error) {
      console.error('Erro ao excluir:', error);
      alert('Erro ao excluir registro. Tente novamente.');
    } finally {
      setExcluindo(false);
    }
  }

  async function handleConfirmarDestrancamento() {
    if (!itemParaDestrancar) return;

    setDestrancando(true);
    try {
      // Buscar o aluno pelo nome
      const { data: alunoData, error: alunoError } = await supabase
        .from('alunos')
        .select('id')
        .eq('nome', itemParaDestrancar.aluno_nome)
        .single();

      if (alunoError || !alunoData) {
        alert('Aluno não encontrado no sistema.');
        return;
      }

      // Atualizar status do aluno para ativo
      const { error: updateError } = await supabase
        .from('alunos')
        .update({ status: 'ativo' })
        .eq('id', alunoData.id);

      if (updateError) throw updateError;

      // Registrar o destrancamento como uma movimentação
      const { error: movError } = await supabase
        .from('movimentacoes_admin')
        .insert({
          tipo: 'destrancamento',
          data: new Date().toISOString().split('T')[0],
          aluno_nome: itemParaDestrancar.aluno_nome,
          aluno_id: alunoData.id,
          professor_id: itemParaDestrancar.professor_id,
          unidade_id: itemParaDestrancar.unidade_id,
          observacoes: `Destrancado antes da previsão de retorno (${itemParaDestrancar.previsao_retorno || 'não informada'})`
        });

      if (movError) console.warn('Erro ao registrar destrancamento:', movError);

      setModalConfirmacao(false);
      setItemParaDestrancar(null);
      await loadData();
    } catch (error) {
      console.error('Erro ao destrancar:', error);
      alert('Erro ao destrancar aluno. Tente novamente.');
    } finally {
      setDestrancando(false);
    }
  }

  function handleEdit(item: MovimentacaoAdmin) {
    setEditingItem(item);
    switch (item.tipo) {
      case 'renovacao':
        setModalRenovacao(true);
        break;
      case 'nao_renovacao':
        setModalNaoRenovacao(true);
        break;
      case 'aviso_previo':
        setModalAvisoPrevio(true);
        break;
      case 'evasao':
        setModalEvasao(true);
        break;
      case 'trancamento':
        setModalTrancamento(true);
        break;
    }
  }

  // Filtrar movimentações por tipo
  const renovacoes = movimentacoes.filter(m => m.tipo === 'renovacao');
  const avisosPrevios = movimentacoes.filter(m => m.tipo === 'aviso_previo');
  const evasoes = movimentacoes.filter(m => m.tipo === 'evasao');
  const naoRenovacoes = movimentacoes.filter(m => m.tipo === 'nao_renovacao');
  const trancamentos = movimentacoes.filter(m => m.tipo === 'trancamento');

  // Gerar opções de competência (últimos 12 meses)
  const competenciaOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Linha de filtros / ações */}
      <PageFilterBar className="gap-4">
        {mainTab === 'lancamentos' && (
          <>
            <CompetenciaFilter
              filtro={competenciaFiltro.filtro}
              range={competenciaFiltro.range}
              anosDisponiveis={competenciaFiltro.anosDisponiveis}
              onTipoChange={competenciaFiltro.setTipo}
              onAnoChange={competenciaFiltro.setAno}
              onMesChange={competenciaFiltro.setMes}
              onTrimestreChange={competenciaFiltro.setTrimestre}
              onSemestreChange={competenciaFiltro.setSemestre}
            />
            <button
              onClick={() => setModalRelatorio(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-cyan-500/20"
            >
              <FileText className="w-4 h-4" />
              Gerar Relatório WhatsApp
            </button>
          </>
        )}
      </PageFilterBar>

      {/* Tabs Principais */}
      <PageTabs
        tabs={[
          { id: 'lancamentos' as const, label: 'Lançamentos', shortLabel: 'Lanç.', icon: CheckCircle, activeGradient: 'from-purple-500 to-violet-500', activeShadow: 'shadow-purple-500/20' },
          { id: 'fideliza' as const, label: 'Programa Fideliza+ LA', shortLabel: 'Fideliza+', icon: Trophy, activeGradient: 'from-yellow-500 to-orange-500', activeShadow: 'shadow-yellow-500/20' },
          { id: 'lojinha' as const, label: 'Lojinha', shortLabel: 'Lojinha', icon: ShoppingBag, activeGradient: 'from-sky-500 to-cyan-500', activeShadow: 'shadow-sky-500/20' },
          { id: 'farmer' as const, label: 'Painel Farmer', shortLabel: 'Farmer', icon: ClipboardList, activeGradient: 'from-violet-500 to-purple-500', activeShadow: 'shadow-violet-500/20' },
          { id: 'caixa_entrada' as const, label: 'Caixa de Entrada', shortLabel: 'Caixa', icon: MessageSquare, activeGradient: 'from-emerald-500 to-teal-500', activeShadow: 'shadow-emerald-500/20' },
        ]}
        activeTab={mainTab}
        onTabChange={setMainTab}
      />

      {/* Conteúdo baseado na tab principal */}
      {mainTab === 'caixa_entrada' ? (
        <CaixaEntradaTab unidadeId={unidade} />
      ) : mainTab === 'fideliza' ? (
        <TabProgramaFideliza 
          unidadeSelecionada={unidade} 
          ano={competenciaFiltro.filtro.ano} 
        />
      ) : mainTab === 'lojinha' ? (
        <TabLojinha unidadeId={unidade} />
      ) : mainTab === 'farmer' ? (
        <PainelFarmer 
          unidadeId={unidade} 
          ano={competenciaFiltro.filtro.ano}
          mes={competenciaFiltro.filtro.mes}
        />
      ) : (
        <>
      {/* Alertas Inteligentes de Retenção */}
      <AlertasRetencao 
        unidadeId={unidade} 
        ano={ano} 
        mes={mes}
        churnRate={resumo?.alunos_pagantes
          ? ((((resumo?.evasoes_interrompido || 0) + (resumo?.evasoes_nao_renovou || 0)) / resumo.alunos_pagantes) * 100)
          : 0}
        taxaRenovacao={(() => {
          const totalVenc = (resumo?.renovacoes_realizadas || 0) + (resumo?.nao_renovacoes || 0);
          return totalVenc > 0 ? ((resumo?.renovacoes_realizadas || 0) / totalVenc) * 100 : undefined;
        })()}
        totalRenovacoes={resumo?.renovacoes_realizadas || 0}
        totalVencimentos={(resumo?.renovacoes_realizadas || 0) + (resumo?.nao_renovacoes || 0)}
        totalEvasoes={(resumo?.evasoes_interrompido || 0) + (resumo?.evasoes_nao_renovou || 0)}
        alunosAtivos={resumo?.alunos_ativos || 0}
      />

      {/* Resumo do Mês - KPIs */}
      <section className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-cyan-500/20 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-b border-cyan-500/20 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Resumo do Mês</h2>
              <p className="text-sm text-cyan-400 capitalize">{competenciaOptions.find(o => o.value === competencia)?.label}</p>
            </div>
          </div>
        </div>
        <div className="p-6">
        <div data-tour="administrativo-kpis" className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <KPICard
            icon={Users}
            label="Alunos Ativos"
            value={resumo?.alunos_ativos || 0}
            variant="cyan"
          />
          <KPICard
            icon={DollarSign}
            label="Pagantes"
            value={resumo?.alunos_pagantes || 0}
            subvalue={`${resumo?.alunos_nao_pagantes || 0} não pagantes`}
            variant="emerald"
          />
          <KPICard
            icon={BookOpen}
            label="Matrículas Ativas"
            value={resumo?.matriculas_ativas || 0}
            subvalue={`${resumo?.matriculas_banda || 0} banda | ${resumo?.matriculas_2_curso || 0} 2º curso`}
            variant="violet"
          />
          <KPICard
            icon={GraduationCap}
            label="Bolsistas"
            value={(resumo?.bolsistas_integrais || 0) + (resumo?.bolsistas_parciais || 0)}
            subvalue={`${resumo?.bolsistas_integrais || 0} integrais | ${resumo?.bolsistas_parciais || 0} parciais`}
            variant="amber"
          />
          <KPICard
            icon={Pause}
            label="Trancados"
            value={resumo?.alunos_trancados || 0}
            variant="default"
          />
          <KPICard
            icon={UserPlus}
            label="Novos no Mês"
            value={resumo?.alunos_novos || 0}
            subvalue={[
              resumo?.novos_bolsistas ? `${resumo.novos_bolsistas} bolsista${resumo.novos_bolsistas > 1 ? 's' : ''}` : '',
              resumo?.novos_segundo_curso ? `${resumo.novos_segundo_curso} 2º curso` : '',
            ].filter(Boolean).join(' | ') || 'novos alunos pagantes'}
            variant="green"
          />
        </div>
        </div>
      </section>

      {/* Quick Input */}
      <section data-tour="administrativo-lancamento" className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-violet-500/20 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-violet-500/10 to-purple-500/10 border-b border-violet-500/20 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Lançamento Rápido</h2>
              <p className="text-sm text-violet-400">Registre renovações, avisos e cancelamentos</p>
            </div>
          </div>
        </div>
        <div className="p-6">
        <p className="text-sm text-slate-400 mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Clique para adicionar um novo registro
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <QuickInputCard
            icon={RefreshCw}
            title="Renovação"
            count={resumo?.renovacoes_realizadas || 0}
            variant="emerald"
            onClick={() => { setEditingItem(null); setModalRenovacao(true); }}
          />
          <QuickInputCard
            icon={XCircle}
            title="Não Renovação"
            count={naoRenovacoes.length}
            variant="amber"
            onClick={() => { setEditingItem(null); setModalNaoRenovacao(true); }}
          />
          <QuickInputCard
            icon={AlertTriangle}
            title="Aviso Prévio"
            count={resumo?.avisos_previos || 0}
            variant="orange"
            onClick={() => { setEditingItem(null); setModalAvisoPrevio(true); }}
          />
          <QuickInputCard
            icon={PauseCircle}
            title="Trancamento"
            count={trancamentos.length}
            variant="amber"
            onClick={() => { setEditingItem(null); setModalTrancamento(true); }}
          />
          <QuickInputCard
            icon={LogOut}
            title="Cancelamento"
            count={resumo?.evasoes_interrompido || evasoes.length}
            variant="rose"
            onClick={() => { setEditingItem(null); setModalEvasao(true); }}
          />
        </div>
        </div>
      </section>

      {/* Resumo Administrativo do Mês */}
      <section className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-amber-500/20 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-b border-amber-500/20 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Resumo Administrativo</h2>
              <p className="text-sm text-amber-400 capitalize">{competenciaOptions.find(o => o.value === competencia)?.label}</p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-6">
          
          {/* INDICADORES */}
          <div data-tour="administrativo-indicadores">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>
              Indicadores
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Taxa de Renovação */}
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Taxa de Renovação</p>
                <p className="text-3xl font-bold text-emerald-400">
                  {(() => {
                    const totalVencimentos = (resumo?.renovacoes_realizadas || 0) + (resumo?.nao_renovacoes || 0);
                    if (totalVencimentos === 0) return '0.0';
                    return (((resumo?.renovacoes_realizadas || 0) / totalVencimentos) * 100).toFixed(1);
                  })()}%
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {resumo?.renovacoes_realizadas || 0} de {(resumo?.renovacoes_realizadas || 0) + (resumo?.nao_renovacoes || 0)} vencimentos
                </p>
              </div>
              
              {/* Churn Rate */}
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Churn Rate</p>
                <p className="text-3xl font-bold text-rose-400">
                  {resumo?.alunos_pagantes ? ((((resumo?.evasoes_interrompido || 0) + (resumo?.evasoes_nao_renovou || 0)) / resumo.alunos_pagantes) * 100).toFixed(1) : '0.0'}%
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {(resumo?.evasoes_interrompido || 0) + (resumo?.evasoes_nao_renovou || 0)} evasões / {resumo?.alunos_pagantes || 0} base
                </p>
              </div>
              
              {/* Tempo Médio de Permanência */}
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Tempo Médio Permanência</p>
                <p className="text-3xl font-bold text-cyan-400">
                  {resumo?.ltv_meses && resumo.ltv_meses > 0
                    ? Number(resumo.ltv_meses).toFixed(1)
                    : '-'}
                  <span className="text-lg font-normal text-slate-400"> meses</span>
                </p>
                <p className="text-xs text-slate-500 mt-1">média das evasões ≥4 meses (excl. bolsistas)</p>
              </div>
            </div>
          </div>

          {/* PRINCIPAIS MOTIVOS DE SAÍDA */}
          <div data-tour="administrativo-motivos">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
              Principais Motivos de Saída (Não Renovação + Cancelamento)
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Lista de Motivos */}
              <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30">
                {(() => {
                  const todosMotivos = [...naoRenovacoes, ...evasoes];
                  
                  if (todosMotivos.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <div className="w-12 h-12 rounded-full bg-slate-700/50 flex items-center justify-center mb-3">
                          <Search className="w-6 h-6 text-slate-500" />
                        </div>
                        <p className="text-slate-400 text-sm font-medium">Nenhuma evasão registrada</p>
                        <p className="text-slate-500 text-xs mt-1">Os motivos aparecerão aqui quando houver não renovações ou cancelamentos</p>
                      </div>
                    );
                  }
                  
                  const porMotivo = todosMotivos.reduce((acc, m) => {
                    const motivo = m.motivo || 'Não informado';
                    acc[motivo] = (acc[motivo] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>);
                  
                  const sorted = Object.entries(porMotivo).sort((a, b) => (b[1] as number) - (a[1] as number));
                  const total = todosMotivos.length;
                  
                  return (
                    <div className="space-y-3">
                      {sorted.slice(0, 7).map(([motivo, count], index) => {
                        const percent = ((count as number) / total) * 100;
                        const colors = [
                          'from-rose-500 to-pink-500',
                          'from-amber-500 to-orange-500',
                          'from-violet-500 to-purple-500',
                          'from-cyan-500 to-blue-500',
                          'from-emerald-500 to-teal-500',
                          'from-indigo-500 to-blue-500',
                          'from-slate-500 to-slate-600',
                        ];
                        return (
                          <div key={motivo}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-slate-300 truncate pr-2">{motivo}</span>
                              <span className="text-slate-400 whitespace-nowrap">{count} ({percent.toFixed(0)}%)</span>
                            </div>
                            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                              <div 
                                className={`h-full bg-gradient-to-r ${colors[index % colors.length]} rounded-full transition-all`}
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
              
              {/* Distribuição por Categoria */}
              <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30">
                <h4 className="text-sm font-medium text-white mb-4">Distribuição por Categoria</h4>
                {(() => {
                  const todosMotivos = [...naoRenovacoes, ...evasoes];
                  const total = todosMotivos.length;
                  
                  if (total === 0) {
                    return (
                      <div className="space-y-3">
                        {[
                          { icon: '💰', label: 'Financeiro', color: 'text-rose-400' },
                          { icon: '⏰', label: 'Tempo', color: 'text-amber-400' },
                          { icon: '👤', label: 'Pessoal', color: 'text-violet-400' },
                          { icon: '😞', label: 'Insatisfação', color: 'text-orange-400' },
                          { icon: '📋', label: 'Outro', color: 'text-slate-400' },
                        ].map((cat) => (
                          <div key={cat.label} className="flex items-center justify-between opacity-40">
                            <div className="flex items-center gap-2">
                              <span>{cat.icon}</span>
                              <span className={`text-sm ${cat.color}`}>{cat.label}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                                <div className="h-full bg-slate-600 rounded-full" style={{ width: '0%' }} />
                              </div>
                              <span className="text-sm text-slate-500 w-12 text-right">0%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  
                  // Categorizar motivos
                  const categorias: Record<string, { count: number; color: string; icon: string }> = {
                    'Financeiro': { count: 0, color: 'text-rose-400', icon: '💰' },
                    'Tempo': { count: 0, color: 'text-amber-400', icon: '⏰' },
                    'Pessoal': { count: 0, color: 'text-violet-400', icon: '👤' },
                    'Insatisfação': { count: 0, color: 'text-orange-400', icon: '😞' },
                    'Outro': { count: 0, color: 'text-slate-400', icon: '📋' },
                  };
                  
                  todosMotivos.forEach(m => {
                    const motivo = (m.motivo || '').toLowerCase();
                    if (motivo.includes('financ') || motivo.includes('inadimpl') || motivo.includes('acessível')) {
                      categorias['Financeiro'].count++;
                    } else if (motivo.includes('tempo') || motivo.includes('horário')) {
                      categorias['Tempo'].count++;
                    } else if (motivo.includes('mudança') || motivo.includes('saúde') || motivo.includes('familiar') || motivo.includes('pessoal')) {
                      categorias['Pessoal'].count++;
                    } else if (motivo.includes('insatisf') || motivo.includes('desânimo') || motivo.includes('desistência')) {
                      categorias['Insatisfação'].count++;
                    } else {
                      categorias['Outro'].count++;
                    }
                  });
                  
                  const sortedCategorias = Object.entries(categorias)
                    .sort((a, b) => b[1].count - a[1].count);
                  
                  return (
                    <div className="space-y-3">
                      {sortedCategorias.map(([categoria, data]) => {
                        const percent = total > 0 ? (data.count / total) * 100 : 0;
                        return (
                          <div key={categoria} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span>{data.icon}</span>
                              <span className={`text-sm ${data.color}`}>{categoria}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full ${data.color.replace('text-', 'bg-')} rounded-full`}
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                              <span className="text-sm text-slate-400 w-12 text-right">{percent.toFixed(0)}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* IMPACTO FINANCEIRO */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Impacto Financeiro
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* MRR Perdido */}
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4">
                <p className="text-xs text-rose-400 uppercase tracking-wider mb-1">MRR Perdido (Evasões)</p>
                <p className="text-3xl font-bold text-rose-400">
                  R$ {(() => {
                    // Usar MRR perdido da view de retenção (mesma fonte do Analytics)
                    const mrrView = resumo?.mrr_perdido || 0;
                    if (mrrView > 0) return Number(mrrView).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                    // Fallback: calcular das movimentações
                    const total = [...naoRenovacoes, ...evasoes].reduce((acc, m) => acc + (m.valor_parcela_evasao || 0), 0);
                    return total.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                  })()}
                </p>
                <p className="text-xs text-rose-300/70 mt-1">
                  {resumo?.evasoes_total || 0} × R$ {(() => {
                    const mrrView = resumo?.mrr_perdido || 0;
                    const totalEv = resumo?.evasoes_total || 0;
                    if (mrrView > 0 && totalEv > 0) return (mrrView / totalEv).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                    const todos = [...naoRenovacoes, ...evasoes].filter(m => m.valor_parcela_evasao);
                    if (todos.length === 0) return '0,00';
                    const media = todos.reduce((acc, m) => acc + (m.valor_parcela_evasao || 0), 0) / todos.length;
                    return media.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                  })()} ticket médio
                </p>
              </div>
              
              {/* LTV Médio */}
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
                <p className="text-xs text-emerald-400 uppercase tracking-wider mb-1">LTV Médio (Evasões)</p>
                <p className="text-3xl font-bold text-emerald-400">
                  R$ {(() => {
                    // Usar tempo de permanência global (da view) × ticket médio das evasões do mês
                    const tempoGlobal = resumo?.ltv_meses ? Number(resumo.ltv_meses) : 0;
                    const todos = [...naoRenovacoes, ...evasoes].filter(m => m.valor_parcela_evasao);
                    if (tempoGlobal === 0 || todos.length === 0) return '0,00';
                    const ticketMedio = todos.reduce((acc, m) => acc + (m.valor_parcela_evasao || 0), 0) / todos.length;
                    const ltv = tempoGlobal * ticketMedio;
                    return ltv.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                  })()}
                </p>
                <p className="text-xs text-emerald-300/70 mt-1">
                  {(() => {
                    const tempoGlobal = resumo?.ltv_meses ? Number(resumo.ltv_meses) : 0;
                    const todos = [...naoRenovacoes, ...evasoes].filter(m => m.valor_parcela_evasao);
                    if (tempoGlobal === 0 || todos.length === 0) return '- meses × R$ -';
                    const ticketMedio = todos.reduce((acc, m) => acc + (m.valor_parcela_evasao || 0), 0) / todos.length;
                    return `${tempoGlobal.toFixed(1)}m × R$ ${ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
                  })()}
                </p>
              </div>
            </div>
          </div>
          
        </div>
      </section>

      {/* Detalhamento - Tabs */}
      <section className="bg-slate-800/50 border border-emerald-500/20 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-b border-emerald-500/20 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Detalhamento do Mês</h2>
              <p className="text-sm text-emerald-400">{renovacoes.length + avisosPrevios.length + evasoes.length + naoRenovacoes.length + trancamentos.length + alunosNovos.filter(a => !a.is_segundo_curso && !(a.tipo_matricula_id && [3, 4, 5].includes(a.tipo_matricula_id))).length} movimentações</p>
            </div>
          </div>
        </div>
        <div className="p-6">

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {tabs.map(tab => {
            const count = tab.id === 'renovacoes' ? renovacoes.length
              : tab.id === 'nao_renovacoes' ? naoRenovacoes.length
              : tab.id === 'avisos' ? avisosPrevios.length
              : tab.id === 'cancelamentos' ? evasoes.length
              : tab.id === 'alunos_novos' ? alunosNovos.filter(a => !a.is_segundo_curso && !(a.tipo_matricula_id && [3, 4, 5].includes(a.tipo_matricula_id))).length
              : trancamentos.length;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2',
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white'
                    : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700/50'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Conteúdo da Tab */}
        <div className="bg-slate-900/60 rounded-xl border border-slate-700/30 overflow-hidden mt-4">
          {activeTab === 'renovacoes' && (
            <TabelaRenovacoes 
              data={renovacoes} 
              onEdit={handleEdit}
              onDelete={handleDeleteMovimentacao}
            />
          )}
          {activeTab === 'nao_renovacoes' && (
            <TabelaNaoRenovacoes 
              data={naoRenovacoes} 
              onEdit={handleEdit}
              onDelete={handleDeleteMovimentacao}
            />
          )}
          {activeTab === 'avisos' && (
            <TabelaAvisosPrevios 
              data={avisosPrevios} 
              onEdit={handleEdit}
              onDelete={handleDeleteMovimentacao}
            />
          )}
          {activeTab === 'cancelamentos' && (
            <TabelaEvasoes 
              data={evasoes} 
              onEdit={handleEdit}
              onDelete={handleDeleteMovimentacao}
            />
          )}
          {activeTab === 'trancamentos' && (
            <TabelaTrancamentos 
              data={trancamentos} 
              onEdit={handleEdit}
              onDelete={handleDeleteMovimentacao}
              onDestrancar={async (item) => {
                setItemParaDestrancar(item);
                setModalConfirmacao(true);
              }}
              professores={professores}
              onSaveInline={async (id, data) => {
                try {
                  const { error } = await supabase
                    .from('movimentacoes_admin')
                    .update(data)
                    .eq('id', id);
                  if (error) throw error;
                  await loadData();
                  return true;
                } catch (error) {
                  console.error('Erro ao salvar:', error);
                  return false;
                }
              }}
            />
          )}
          {activeTab === 'alunos_novos' && (
            <TabelaAlunosNovos data={alunosNovos} />
          )}
        </div>
        </div>
      </section>

      {/* Modais */}
      <ModalRenovacao
        open={modalRenovacao}
        onOpenChange={setModalRenovacao}
        onSave={handleSaveMovimentacao}
        editingItem={editingItem}
        formasPagamento={formasPagamento}
        cursos={cursos}
        competencia={competencia}
        unidadeId={unidade === 'todos' ? null : unidade}
      />
      <ModalNaoRenovacao
        open={modalNaoRenovacao}
        onOpenChange={setModalNaoRenovacao}
        onSave={handleSaveMovimentacao}
        editingItem={editingItem}
        professores={professores}
        competencia={competencia}
        unidadeId={unidade === 'todos' ? null : unidade}
      />
      <ModalAvisoPrevio
        open={modalAvisoPrevio}
        onOpenChange={setModalAvisoPrevio}
        onSave={handleSaveMovimentacao}
        editingItem={editingItem}
        professores={professores}
        competencia={competencia}
        unidadeId={unidade === 'todos' ? null : unidade}
      />
      <ModalEvasao
        open={modalEvasao}
        onOpenChange={setModalEvasao}
        onSave={handleSaveMovimentacao}
        editingItem={editingItem}
        professores={professores}
        competencia={competencia}
        unidadeId={unidade === 'todos' ? null : unidade}
      />
      <ModalTrancamento
        open={modalTrancamento}
        onOpenChange={setModalTrancamento}
        onSave={handleSaveMovimentacao}
        editingItem={editingItem}
        professores={professores}
        competencia={competencia}
        unidadeId={unidade === 'todos' ? null : unidade}
      />
      <ModalRelatorio
        open={modalRelatorio}
        onOpenChange={setModalRelatorio}
        resumo={resumo}
        renovacoes={renovacoes}
        naoRenovacoes={naoRenovacoes}
        avisosPrevios={avisosPrevios}
        evasoes={evasoes}
        competencia={competencia}
        unidade={unidade}
      />

      {/* Plano de Ação Inteligente - IA de Retenção */}
      <PlanoAcaoRetencao
        unidadeId={unidade}
        ano={ano}
        mes={mes}
      />

      {/* Modal de Confirmação de Destrancamento */}
      <ModalConfirmacao
        aberto={modalConfirmacao}
        onClose={() => {
          setModalConfirmacao(false);
          setItemParaDestrancar(null);
        }}
        onConfirmar={handleConfirmarDestrancamento}
        titulo="Confirmar Destrancamento"
        mensagem={`Confirma o destrancamento de ${itemParaDestrancar?.aluno_nome}?\n\nO aluno voltará ao status ATIVO e poderá fazer aulas normalmente.`}
        tipo="warning"
        textoConfirmar="Destrancar"
        textoCancelar="Cancelar"
        carregando={destrancando}
      />

      {/* Modal de Confirmação de Exclusão */}
      <ModalConfirmacao
        aberto={modalConfirmacaoExcluir}
        onClose={() => {
          setModalConfirmacaoExcluir(false);
          setItemParaExcluir(null);
        }}
        onConfirmar={handleConfirmarExclusao}
        titulo="Confirmar Exclusão"
        mensagem={`Tem certeza que deseja excluir o registro de trancamento de ${itemParaExcluir?.nome}?\n\nEsta ação não pode ser desfeita.`}
        tipo="danger"
        textoConfirmar="Excluir"
        textoCancelar="Cancelar"
        carregando={excluindo}
      />
        </>
      )}

      {/* Tour e Botão de Ajuda */}
      <PageTour tourName="administrativo" steps={administrativoTourSteps} />
      <TourHelpButton tourName="administrativo" />
    </div>
  );
}

export default AdministrativoPage;
