import { useState, useEffect } from 'react';
import { Users, DollarSign, Percent, Clock, AlertTriangle, Wallet, Calendar, TrendingDown, RefreshCw, UserMinus, Filter, Info, XCircle, UserX, CheckCircle, Bell, Star, CreditCard, TrendingUp, Target, UserPlus, GraduationCap, Ticket, Music, Baby } from 'lucide-react';
import { KPICard } from '@/components/ui/KPICard';
import { DistributionChart } from '@/components/ui/DistributionChart';
import { EvolutionChart } from '@/components/ui/EvolutionChart';
import { RankingTable } from '@/components/ui/RankingTable';
import { ComparisonChart } from '@/components/ui/ComparisonChart';
import { AreaChart } from '@/components/ui/AreaChart';
import { formatCurrency, getMesNomeCurto } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useMetasKPI } from '@/hooks/useMetasKPI';

interface TabGestaoProps {
  ano: number;
  mes: number;
  mesFim?: number; // Para filtros de período (trimestre, semestre, anual)
  unidade: string;
}

type SubTabId = 'alunos' | 'financeiro' | 'retencao';

const subTabs = [
  { id: 'alunos' as const, label: 'Alunos', icon: Users },
  { id: 'financeiro' as const, label: 'Financeiro', icon: DollarSign },
  { id: 'retencao' as const, label: 'Retenção', icon: TrendingDown },
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
  
  // Retenção
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
  
  // Distribuições (gráficos)
  matriculas_por_curso: { name: string; value: number }[];
  matriculas_por_professor: { id: number; nome: string; valor: number; subvalor?: string }[];
  evasoes_por_professor: { id: number; nome: string; valor: number; subvalor?: string }[];
  evasoes_por_curso: { name: string; value: number }[];
  motivos_nao_renovacao: { name: string; value: number }[];
  motivos_cancelamento: { name: string; value: number }[];
}

export function TabGestao({ ano, mes, mesFim, unidade }: TabGestaoProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('alunos');
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<DadosGestao | null>(null);
  
  // Buscar metas do período
  const unidadeIdParaMetas = unidade === 'todos' ? null : unidade;
  const { metas } = useMetasKPI(unidadeIdParaMetas, ano, mes);
  const [dadosAnterior, setDadosAnterior] = useState<Partial<DadosGestao> | null>(null);
  const [evolucao, setEvolucao] = useState<any[]>([]);
  const [distribuicao, setDistribuicao] = useState<any[]>([]);
  const [cursoFiltro, setCursoFiltro] = useState<string>('todos');
  const [cursosDisponiveis, setCursosDisponiveis] = useState<string[]>([]);
  
  // Estados para gráficos financeiros
  const [evolucaoMRR, setEvolucaoMRR] = useState<any[]>([]);
  const [previstoRealizado, setPrevistoRealizado] = useState<any[]>([]);
  const [receitaPorUnidade, setReceitaPorUnidade] = useState<any[]>([]);
  const [evolucaoInadimplencia, setEvolucaoInadimplencia] = useState<any[]>([]);
  const [evolucaoTicketMedio, setEvolucaoTicketMedio] = useState<any[]>([]);
  const [evolucaoReajuste, setEvolucaoReajuste] = useState<any[]>([]);
  const [mediaTicketAnual, setMediaTicketAnual] = useState<number>(0);
  const [mediaReajusteAnual, setMediaReajusteAnual] = useState<number>(0);
  
  // Estados para gráficos de retenção
  const [evolucaoChurn, setEvolucaoChurn] = useState<any[]>([]);
  const [evolucaoTaxaRenovacao, setEvolucaoTaxaRenovacao] = useState<any[]>([]);

  // Estados para comparativos históricos
  const [dadosMesAnterior, setDadosMesAnterior] = useState<any | null>(null);
  const [dadosAnoAnterior, setDadosAnoAnterior] = useState<any | null>(null);
  
  // Estado para verificar se o mês está fechado (tem dados em dados_mensais)
  const [mesFechado, setMesFechado] = useState<boolean>(false);

  // Usar mesFim se fornecido, senão usar mes (para filtro mensal)
  const mesInicio = mes;
  const mesFinal = mesFim || mes;

  useEffect(() => {
    async function fetchDados() {
      setLoading(true);
      try {
        // Verificar se é período atual ou histórico
        const hoje = new Date();
        const anoAtual = hoje.getFullYear();
        const mesAtual = hoje.getMonth() + 1;
        const isPeriodoAtual = ano === anoAtual && mes === mesAtual;

        let gestaoData: any[] = [];
        let retencaoData: any[] = [];

        if (isPeriodoAtual) {
          // PERÍODO ATUAL: usar views em tempo real
          let query = supabase
            .from('vw_kpis_gestao_mensal')
            .select('*');

          if (unidade !== 'todos') {
            query = query.eq('unidade_id', unidade);
          }

          const { data, error: gestaoError } = await query;
          if (gestaoError) throw gestaoError;
          gestaoData = data || [];

          // Buscar dados de retenção
          let retencaoQuery = supabase
            .from('vw_kpis_retencao_mensal')
            .select('*');

          if (unidade !== 'todos') {
            retencaoQuery = retencaoQuery.eq('unidade_id', unidade);
          }

          const { data: retData, error: retencaoError } = await retencaoQuery;
          if (retencaoError) throw retencaoError;
          retencaoData = retData || [];
        } else {
          // PERÍODO HISTÓRICO: usar dados_mensais
          let historicoQuery = supabase
            .from('dados_mensais')
            .select('*, unidades(nome)')
            .eq('ano', ano)
            .gte('mes', mesInicio)
            .lte('mes', mesFinal);

          if (unidade !== 'todos') {
            historicoQuery = historicoQuery.eq('unidade_id', unidade);
          }

          const { data: historicoData, error: historicoError } = await historicoQuery;
          if (historicoError) throw historicoError;

          // Buscar dados de evasões detalhados da tabela evasoes
          const startDate = `${ano}-${String(mesInicio).padStart(2, '0')}-01`;
          const ultimoDia = new Date(ano, mesFinal, 0).getDate();
          const endDate = `${ano}-${String(mesFinal).padStart(2, '0')}-${ultimoDia}`;

          let evasoesQuery = supabase
            .from('evasoes')
            .select('tipo, parcela, competencia')
            .gte('competencia', startDate)
            .lte('competencia', endDate);

          const { data: evasoesHistorico } = await evasoesQuery;

          // Consolidar dados de evasões por tipo
          const cancelamentos = evasoesHistorico?.filter(e => e.tipo === 'Interrompido').length || 0;
          const naoRenovacoes = evasoesHistorico?.filter(e => e.tipo === 'Não Renovação').length || 0;
          const mrrPerdidoTotal = evasoesHistorico?.reduce((acc, e) => acc + (Number(e.parcela) || 0), 0) || 0;

          // Transformar dados históricos para o formato esperado
          if (historicoData && historicoData.length > 0) {
            gestaoData = historicoData.map((d: any) => ({
              unidade_id: d.unidade_id,
              unidade_nome: d.unidades?.nome || 'N/A',
              ano: d.ano,
              mes: d.mes,
              total_alunos_ativos: d.alunos_pagantes || 0,
              total_alunos_pagantes: d.alunos_pagantes || 0,
              total_bolsistas_integrais: 0,
              total_bolsistas_parciais: 0,
              total_banda: 0,
              ticket_medio: Number(d.ticket_medio) || 0,
              mrr: Number(d.faturamento_estimado) || 0,
              arr: (Number(d.faturamento_estimado) || 0) * 12,
              tempo_permanencia_medio: Number(d.tempo_permanencia) || 0,
              ltv_medio: 0,
              inadimplencia_pct: Number(d.inadimplencia) || 0,
              faturamento_previsto: Number(d.faturamento_estimado) || 0,
              faturamento_realizado: (Number(d.faturamento_estimado) || 0) * (1 - (Number(d.inadimplencia) || 0) / 100),
              churn_rate: Number(d.churn_rate) || 0,
              total_evasoes: d.evasoes || 0,
              novas_matriculas: d.novas_matriculas || 0,
              reajuste_pct: Number(d.reajuste_parcelas) || 0,
            }));

            // Dados de retenção do histórico
            // Usar dados da tabela evasoes que tem tipos detalhados
            retencaoData = [{
              unidade_id: unidade !== 'todos' ? unidade : null,
              total_evasoes: (cancelamentos + naoRenovacoes) || 0,
              evasoes_interrompidas: cancelamentos,
              avisos_previos: 0, // Não disponível no histórico
              mrr_perdido: mrrPerdidoTotal,
              renovacoes_realizadas: 0, // Não disponível - tabela renovacoes vazia
              nao_renovacoes: naoRenovacoes,
              renovacoes_pendentes: 0, // Não disponível no histórico
              taxa_renovacao: historicoData.length > 0 ? historicoData.reduce((acc, d) => acc + (Number(d.taxa_renovacao) || 0), 0) / historicoData.length : 0,
            }];
          }
        }

        // Buscar dados do mês anterior para comparativo (FORA do bloco condicional)
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

        // Consolidar dados do mês anterior
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
          console.log('📊 Dados Mês Anterior:', dadosMesAnteriorFinal);
          setDadosMesAnterior(dadosMesAnteriorFinal);
        } else {
          console.log('⚠️ Sem dados do mês anterior');
          setDadosMesAnterior(null);
        }

        // Buscar dados do mesmo mês do ano anterior para comparativo de sazonalidade
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
          console.log('📊 Dados Ano Anterior:', dadosAnoAnteriorFinal);
          setDadosAnoAnterior(dadosAnoAnteriorFinal);
        } else {
          console.log('⚠️ Sem dados do ano anterior');
          setDadosAnoAnterior(null);
        }

        // Consolidar dados
        // IMPORTANTE: Para períodos múltiplos (Trim/Sem/Ano):
        // - Alunos/Bolsistas/Banda: usar MÉDIA (snapshot, não acumula)
        // - Matrículas/Evasões: usar SOMA (eventos acumulam)
        // - Taxas/Percentuais: usar MÉDIA
        // - Faturamento/MRR: usar SOMA (acumula no período)
        if (gestaoData && gestaoData.length > 0) {
          const g = gestaoData.reduce((acc, item) => ({
            // SOMA para acumular
            total_alunos_ativos_sum: acc.total_alunos_ativos_sum + (item.total_alunos_ativos || 0),
            total_alunos_pagantes_sum: acc.total_alunos_pagantes_sum + (item.total_alunos_pagantes || 0),
            total_bolsistas_integrais_sum: acc.total_bolsistas_integrais_sum + (item.total_bolsistas_integrais || 0),
            total_bolsistas_parciais_sum: acc.total_bolsistas_parciais_sum + (item.total_bolsistas_parciais || 0),
            total_banda_sum: acc.total_banda_sum + (item.total_banda || 0),
            ticket_medio_sum: acc.ticket_medio_sum + (Number(item.ticket_medio) || 0),
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
            reajuste_pct_sum: acc.reajuste_pct_sum + (Number(item.reajuste_pct) || 0),
            count: acc.count + 1,
          }), {
            total_alunos_ativos_sum: 0, total_alunos_pagantes_sum: 0, total_bolsistas_integrais_sum: 0,
            total_bolsistas_parciais_sum: 0, total_banda_sum: 0, ticket_medio_sum: 0, mrr_sum: 0, arr_sum: 0,
            tempo_permanencia_medio_sum: 0, ltv_medio_sum: 0, inadimplencia_pct_sum: 0,
            faturamento_previsto: 0, faturamento_realizado: 0, churn_rate_sum: 0, total_evasoes: 0, 
            novas_matriculas: 0, reajuste_pct_sum: 0, count: 0
          });
          
          // Calcular número de meses únicos no período (para média correta)
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

          // Para período histórico, usar dados já consolidados em g
          // Para período atual, buscar de dados_mensais
          let novasMatriculas = g.novas_matriculas || 0;
          let evasoes = g.total_evasoes || 0;
          
          if (isPeriodoAtual) {
            // Buscar dados mensais para novas matrículas (suporta range de meses)
            let dadosMensaisQuery = supabase
              .from('dados_mensais')
              .select('*')
              .eq('ano', ano)
              .gte('mes', mesInicio)
              .lte('mes', mesFinal);

            const { data: dadosMensais } = await dadosMensaisQuery;

            // Verificar se o mês está fechado (tem dados em dados_mensais)
            const temDadosMes = dadosMensais && dadosMensais.length > 0 && 
              dadosMensais.some(d => d.ticket_medio !== null && d.ticket_medio > 0);
            setMesFechado(temDadosMes);

            novasMatriculas = dadosMensais?.reduce((acc, d) => acc + (d.novas_matriculas || 0), 0) || 0;
            evasoes = dadosMensais?.reduce((acc, d) => acc + (d.evasoes || 0), 0) || 0;
          } else {
            // Período histórico: já temos os dados, marcar como fechado
            setMesFechado(true);
          }

          // Buscar matrículas por curso e professor (suporta range de meses)
          const startDate = `${ano}-${String(mesInicio).padStart(2, '0')}-01`;
          const ultimoDia = new Date(ano, mesFinal, 0).getDate();
          const endDate = `${ano}-${String(mesFinal).padStart(2, '0')}-${ultimoDia}`;

          let matriculasQuery = supabase
            .from('alunos')
            .select('cursos(nome), professores:professor_experimental_id(nome), unidade_id, idade_atual')
            .gte('data_matricula', startDate)
            .lte('data_matricula', endDate);

          if (unidade !== 'todos') {
            matriculasQuery = matriculasQuery.eq('unidade_id', unidade);
          }

          const { data: matriculasData } = await matriculasQuery;

          // Buscar distribuição LA Kids vs LA (12+) dos alunos ativos
          let alunosAtivosQuery = supabase
            .from('alunos')
            .select('idade_atual, unidade_id')
            .eq('status', 'ativo');

          if (unidade !== 'todos') {
            alunosAtivosQuery = alunosAtivosQuery.eq('unidade_id', unidade);
          }

          const { data: alunosAtivosData } = await alunosAtivosQuery;

          // Calcular LA Kids (até 11 anos) vs LA (12+)
          const totalLaKids = alunosAtivosData?.filter(a => a.idade_atual !== null && a.idade_atual <= 11).length || 0;
          const totalLaAdultos = alunosAtivosData?.filter(a => a.idade_atual !== null && a.idade_atual >= 12).length || 0;

          const cursoMatMap = new Map<string, number>();
          const profMatMap = new Map<string, { id: number; count: number }>();
          matriculasData?.forEach(m => {
            const curso = (m.cursos as any)?.nome || 'Não informado';
            cursoMatMap.set(curso, (cursoMatMap.get(curso) || 0) + 1);
            const prof = (m.professores as any)?.nome || 'Sem Professor';
            const current = profMatMap.get(prof) || { id: 0, count: 0 };
            current.count += 1;
            profMatMap.set(prof, current);
          });

          // Buscar evasões por curso e professor - query simplificada
          let evasoesQuery = supabase
            .from('evasoes_v2')
            .select('curso_id, professor_id, motivo_saida_id, tipo_saida_id, unidade_id')
            .gte('data_evasao', startDate)
            .lte('data_evasao', endDate);

          if (unidade !== 'todos') {
            evasoesQuery = evasoesQuery.eq('unidade_id', unidade);
          }

          const { data: evasoesData } = await evasoesQuery;

          const cursoEvasaoMap = new Map<string, number>();
          const profEvasaoMap = new Map<string, { id: number; count: number }>();
          const motivosNaoRenovMap = new Map<string, number>();
          const motivosCancelMap = new Map<string, number>();
          evasoesData?.forEach((e: any) => {
            const curso = `Curso ${e.curso_id || 'N/A'}`;
            cursoEvasaoMap.set(curso, (cursoEvasaoMap.get(curso) || 0) + 1);
            const prof = `Professor ${e.professor_id || 'N/A'}`;
            const current = profEvasaoMap.get(prof) || { id: e.professor_id || 0, count: 0 };
            current.count += 1;
            profEvasaoMap.set(prof, current);
            const motivo = `Motivo ${e.motivo_saida_id || 'N/A'}`;
            // tipo_saida_id: 1=interrompido, 2=não renovou, 3=aviso prévio
            if (e.tipo_saida_id === 2) {
              motivosNaoRenovMap.set(motivo, (motivosNaoRenovMap.get(motivo) || 0) + 1);
            } else {
              motivosCancelMap.set(motivo, (motivosCancelMap.get(motivo) || 0) + 1);
            }
          });

          // Calcular médias para campos de snapshot (alunos, taxas)
          const mediaAlunos = mesesUnicos > 0 ? Math.round(g.total_alunos_ativos_sum / mesesUnicos) : 0;
          const mediaPagantes = mesesUnicos > 0 ? Math.round(g.total_alunos_pagantes_sum / mesesUnicos) : 0;
          const mediaBolsistasIntegrais = mesesUnicos > 0 ? Math.round(g.total_bolsistas_integrais_sum / mesesUnicos) : 0;
          const mediaBolsistasParciais = mesesUnicos > 0 ? Math.round(g.total_bolsistas_parciais_sum / mesesUnicos) : 0;
          const mediaBanda = mesesUnicos > 0 ? Math.round(g.total_banda_sum / mesesUnicos) : 0;

          setDados({
            // Alunos - usar MÉDIA do período (snapshot mensal, não acumula)
            total_alunos_ativos: mediaAlunos,
            total_alunos_pagantes: mediaPagantes,
            total_bolsistas_integrais: mediaBolsistasIntegrais,
            total_bolsistas_parciais: mediaBolsistasParciais,
            total_banda: mediaBanda,
            // Matrículas/Evasões - usar SOMA (eventos acumulam no período)
            novas_matriculas: novasMatriculas,
            evasoes: evasoes,
            saldo_liquido: novasMatriculas - evasoes,
            total_la_kids: totalLaKids,
            total_la_adultos: totalLaAdultos,
            distribuicao_faixa_etaria: [
              { name: 'LA Music Kids (até 11)', value: totalLaKids },
              { name: 'LA Music School (12+)', value: totalLaAdultos },
            ],
            
            // Financeiro - ticket/taxas = MÉDIA, faturamento = SOMA
            ticket_medio: g.count > 0 ? g.ticket_medio_sum / g.count : 0,
            mrr: mesesUnicos > 0 ? g.mrr_sum / mesesUnicos : 0, // MRR médio do período
            arr: mesesUnicos > 0 ? (g.mrr_sum / mesesUnicos) * 12 : 0, // ARR baseado no MRR médio
            faturamento_previsto: g.faturamento_previsto, // SOMA do período
            faturamento_realizado: g.faturamento_realizado, // SOMA do período
            inadimplencia: g.faturamento_previsto - g.faturamento_realizado,
            inadimplencia_pct: g.count > 0 ? g.inadimplencia_pct_sum / g.count : 0,
            ltv_medio: g.count > 0 ? g.ltv_medio_sum / g.count : 0,
            ticket_medio_passaporte: 0, // TODO: buscar de outra fonte
            reajuste_pct: g.count > 0 ? g.reajuste_pct_sum / g.count : 0,
            
            // Retenção - taxas = MÉDIA
            churn_rate: g.count > 0 ? g.churn_rate_sum / g.count : 0,
            renovacoes: r.renovacoes_realizadas,
            nao_renovacoes: r.nao_renovacoes,
            renovacoes_pct: r.count > 0 ? r.taxa_renovacao / r.count : 0,
            cancelamentos: r.evasoes_interrompidas,
            cancelamento_pct: mediaAlunos > 0 ? (r.evasoes_interrompidas / mediaAlunos) * 100 : 0,
            aviso_previo: r.avisos_previos,
            mrr_perdido: r.mrr_perdido,
            
            // Indicadores - usar MÉDIA
            tempo_permanencia: g.count > 0 ? g.tempo_permanencia_medio_sum / g.count : 0,
            nps_evasoes: 0, // TODO: buscar de outra fonte
            renovacoes_pendentes: r.renovacoes_pendentes,
            total_evasoes: r.total_evasoes,
            
            // Distribuições (gráficos)
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

          // Distribuição por unidade
          setDistribuicao(gestaoData.map(item => ({
            name: item.unidade_nome || 'N/A',
            value: item.total_alunos_ativos || 0,
          })));

          // Extrair lista de cursos disponíveis (usando IDs por enquanto)
          const todosCursos = new Set<string>();
          matriculasData?.forEach((m: any) => {
            const curso = (m.cursos as any)?.nome || (m.curso_id ? `Curso ${m.curso_id}` : null);
            if (curso) todosCursos.add(curso);
          });
          evasoesData?.forEach((e: any) => {
            const curso = e.curso_id ? `Curso ${e.curso_id}` : null;
            if (curso) todosCursos.add(curso);
          });
          setCursosDisponiveis(Array.from(todosCursos).sort());
        }

        // Buscar evolução mensal (últimos 12 meses até o mês selecionado)
        let evolucaoQuery = supabase
          .from('dados_mensais')
          .select('ano, mes, alunos_pagantes, novas_matriculas, evasoes, unidade_id')
          .gte('ano', 2023)
          .order('ano', { ascending: true })
          .order('mes', { ascending: true });

        // Aplicar filtro de unidade se não for consolidado
        if (unidade !== 'todos') {
          evolucaoQuery = evolucaoQuery.eq('unidade_id', unidade);
        }

        const { data: evolucaoData } = await evolucaoQuery;

        if (evolucaoData) {
          // Chave do mês atual selecionado para filtrar
          const mesAtualKeyEvolucao = `${ano}-${String(mes).padStart(2, '0')}`;
          
          // Agrupar por ano-mês e filtrar até o mês selecionado
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

          // Pegar últimos 12 meses
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

        // Buscar dados históricos para gráficos financeiros e retenção (tabela dados_mensais - histórico completo 2023-2026)
        let financeiroQuery = supabase
          .from('dados_mensais')
          .select('mes, ano, ticket_medio, faturamento_estimado, inadimplencia, reajuste_parcelas, churn_rate, taxa_renovacao, unidade_id')
          .gte('ano', 2023)
          .order('ano', { ascending: true })
          .order('mes', { ascending: true });

        // Aplicar filtro de unidade se não for consolidado
        if (unidade !== 'todos') {
          financeiroQuery = financeiroQuery.eq('unidade_id', unidade);
        }

        const { data: financeiroData } = await financeiroQuery;
        
        console.log('🔍 Dados financeiros brutos:', financeiroData?.length, 'registros');
        console.log('🔍 Primeiros 3 registros:', financeiroData?.slice(0, 3));

        // Buscar nomes das unidades para o gráfico de receita por unidade
        const { data: unidadesData } = await supabase.from('unidades').select('id, nome');
        const unidadeNomeMap = new Map<string, string>();
        unidadesData?.forEach((u: any) => unidadeNomeMap.set(u.id, u.nome));

        if (financeiroData) {
          // Chave do mês atual selecionado para filtrar gráficos
          const mesAtualKey = `${ano}-${String(mes).padStart(2, '0')}`;
          
          // 1. Evolução do MRR (últimos 12 meses até o mês selecionado) - usando faturamento_estimado
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

          // 2. Previsto vs Realizado (últimos 6 meses até o mês selecionado)
          // Previsto = faturamento_estimado (MRR)
          // Realizado = faturamento_estimado - inadimplência
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
          console.log('📊 Previsto vs Realizado:', faturamentoArray);
          setPrevistoRealizado(faturamentoArray);

          // 3. Receita por Unidade (mês mais recente com dados)
          if (unidade === 'todos') {
            // Pegar o mês mais recente disponível
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

          // 4. Evolução da Inadimplência (últimos 12 meses até o mês selecionado)
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

          // 5. Evolução do Ticket Médio (últimos 12 meses até o mês selecionado)
          const ticketPorMes = new Map<string, { total: number; count: number }>();
          financeiroData.forEach((item: any) => {
            const key = `${item.ano}-${String(item.mes).padStart(2, '0')}`;
            // Incluir apenas dados até o mês selecionado
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

          // Pegar o ticket médio atual (último mês)
          if (ticketArray.length > 0) {
            const ticketAtual = ticketArray[ticketArray.length - 1].ticket;
            setMediaTicketAnual(ticketAtual);
          }

          // 6. Evolução do Reajuste Médio (últimos 12 meses até o mês selecionado)
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

          // Calcular média anual do reajuste (excluindo meses sem reajuste)
          if (reajusteArray.length > 0) {
            const mesesComReajuste = reajusteArray.filter(item => item.reajuste > 0);
            if (mesesComReajuste.length > 0) {
              const somaReajuste = mesesComReajuste.reduce((acc, item) => acc + item.reajuste, 0);
              setMediaReajusteAnual(somaReajuste / mesesComReajuste.length);
            } else {
              setMediaReajusteAnual(0);
            }
          }

          // 7. Evolução do Churn Rate (últimos 12 meses até o mês selecionado)
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
          
          console.log('📊 Churn - Total entries:', churnPorMes.size);
          console.log('📊 Churn - Keys:', Array.from(churnPorMes.keys()).sort());
          console.log('📊 Evolução Churn Rate:', churnArray);
          setEvolucaoChurn(churnArray);

          // 8. Evolução da Taxa de Renovação (últimos 12 meses até o mês selecionado)
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
          
          console.log('📊 Renovação - Total entries:', renovacaoPorMes.size);
          console.log('📊 Renovação - Keys:', Array.from(renovacaoPorMes.keys()).sort());
          console.log('📊 Evolução Taxa Renovação:', renovacaoArray);
          setEvolucaoTaxaRenovacao(renovacaoArray);
        }

      } catch (err) {
        console.error('Erro ao carregar dados de gestão:', err);
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

  // Função helper para calcular variação percentual
  const calcularVariacao = (atual: number, anterior: number): { valor: number; texto: string } => {
    if (anterior === 0) {
      if (atual === 0) return { valor: 0, texto: '—' };
      return { valor: 100, texto: '+100%' };
    }
    const variacao = ((atual - anterior) / anterior) * 100;
    const sinal = variacao >= 0 ? '+' : '';
    return { valor: variacao, texto: `${sinal}${variacao.toFixed(0)}%` };
  };

  // Calcular variações do mês anterior
  const variacaoMatriculas = dadosAnterior ? calcularVariacao(dados?.novas_matriculas || 0, dadosAnterior.novas_matriculas || 0) : null;
  const variacaoEvasoes = dadosAnterior ? calcularVariacao(dados?.evasoes || 0, dadosAnterior.evasoes || 0) : null;

  // Filtrar dados por curso selecionado
  const dadosFiltrados = cursoFiltro === 'todos' ? dados : dados ? {
    ...dados,
    matriculas_por_curso: dados.matriculas_por_curso.filter(c => c.name === cursoFiltro),
    evasoes_por_curso: dados.evasoes_por_curso.filter(c => c.name === cursoFiltro),
    novas_matriculas: dados.matriculas_por_curso.find(c => c.name === cursoFiltro)?.value || 0,
    evasoes: dados.evasoes_por_curso.find(c => c.name === cursoFiltro)?.value || 0,
  } : null;

  if (!dados) {
    return (
      <div className="text-center text-slate-400 py-12">
        Nenhum dado encontrado para o período selecionado.
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
        <div className="bg-slate-800/50 p-1 rounded-lg inline-flex gap-1">
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

        {/* Filtro de Curso - apenas na sub-aba Alunos */}
        {activeSubTab === 'alunos' && cursosDisponiveis.length > 0 && (
          <div className="flex items-center gap-2 bg-slate-800/50 rounded-lg px-3 py-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={cursoFiltro}
              onChange={(e) => setCursoFiltro(e.target.value)}
              className="bg-transparent text-sm text-white border-none outline-none cursor-pointer"
            >
              <option value="todos" className="bg-slate-900">Todos os Cursos</option>
              {cursosDisponiveis.map((curso) => (
                <option key={curso} value={curso} className="bg-slate-900">
                  {curso}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Conteúdo da Sub-aba */}
      {activeSubTab === 'alunos' && (
        <div className="space-y-6">
          {/* Aviso se o mês não está fechado */}
          {!mesFechado && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <p className="text-amber-200 text-sm">
                <strong>Mês não fechado:</strong> Os dados de {getMesNomeCurto(mes)}/{ano} ainda não foram populados. 
                Novas Matrículas, Evasões e Saldo Líquido mostram dados do mês atual em andamento.
              </p>
            </div>
          )}
          {/* Linha 1: KPIs principais */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KPICard
              icon={Users}
              label="Total Alunos Ativos"
              value={dados.total_alunos_ativos}
              variant="cyan"
            />
            <KPICard
              icon={DollarSign}
              label="Alunos Pagantes"
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
              value={dados.total_la_kids}
              subvalue={`${dados.total_alunos_ativos > 0 ? ((dados.total_la_kids / dados.total_alunos_ativos) * 100).toFixed(0) : 0}% do total`}
              variant="rose"
            />
            <KPICard
              icon={GraduationCap}
              label="LA Music School"
              value={dados.total_la_adultos}
              subvalue={`${dados.total_alunos_ativos > 0 ? ((dados.total_la_adultos / dados.total_alunos_ativos) * 100).toFixed(0) : 0}% do total`}
              variant="violet"
            />
            <KPICard
              icon={Music}
              label="Banda"
              value={dados.total_banda}
              variant="violet"
            />
          </div>

          {/* Linha 2: Movimentação e bolsistas */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KPICard
              icon={UserPlus}
              label="Novas Matrículas"
              value={mesFechado ? (cursoFiltro === 'todos' ? dados.novas_matriculas : dadosFiltrados?.novas_matriculas || 0) : '—'}
              variant="green"
              comparativoMesAnterior={mesFechado && dadosMesAnterior ? { valor: dadosMesAnterior.novas_matriculas, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={mesFechado && dadosAnoAnterior ? { valor: dadosAnoAnterior.novas_matriculas, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={UserMinus}
              label="Evasões"
              value={mesFechado ? (cursoFiltro === 'todos' ? dados.evasoes : dadosFiltrados?.evasoes || 0) : '—'}
              variant="rose"
              inverterCor={true}
              comparativoMesAnterior={mesFechado && dadosMesAnterior ? { valor: dadosMesAnterior.evasoes, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={mesFechado && dadosAnoAnterior ? { valor: dadosAnoAnterior.evasoes, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={RefreshCw}
              label="Saldo Líquido"
              value={mesFechado ? dados.saldo_liquido : '—'}
              variant={dados.saldo_liquido >= 0 ? 'emerald' : 'rose'}
              comparativoMesAnterior={mesFechado && dadosMesAnterior ? { valor: dadosMesAnterior.novas_matriculas - dadosMesAnterior.evasoes, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={mesFechado && dadosAnoAnterior ? { valor: dadosAnoAnterior.novas_matriculas - dadosAnoAnterior.evasoes, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={GraduationCap}
              label="Bolsistas Integrais"
              value={dados.total_bolsistas_integrais}
              variant="amber"
            />
            <KPICard
              icon={Ticket}
              label="Bolsistas Parciais"
              value={dados.total_bolsistas_parciais}
              variant="amber"
            />
          </div>

          {/* Gráficos - Linha 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Distribuição por Unidade - apenas para Consolidado */}
            {unidade === 'todos' && (
              <DistributionChart
                data={distribuicao}
                title="Distribuição por Unidade"
              />
            )}
            {evolucao.length > 0 ? (
              <EvolutionChart
                data={evolucao}
                title="Evolução Mensal"
                lines={[
                  { dataKey: 'alunos', color: '#06b6d4', name: 'Alunos' },
                  { dataKey: 'matriculas', color: '#10b981', name: 'Matrículas' },
                  { dataKey: 'evasoes', color: '#ef4444', name: 'Evasões' },
                ]}
                className={unidade !== 'todos' ? 'lg:col-span-2' : ''}
              />
            ) : (
              <div className={unidade !== 'todos' ? 'lg:col-span-2' : ''}>
                <EstadoVazio
                  titulo="Sem dados de evolução"
                  mensagem={`Não há dados de movimentação registrados para ${ano}. Selecione um período anterior para visualizar o histórico.`}
                />
              </div>
            )}
          </div>

          {/* Gráficos - Linha 2: Matrículas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {(cursoFiltro === 'todos' ? dados.matriculas_por_curso : dadosFiltrados?.matriculas_por_curso || []).length > 0 ? (
              <DistributionChart
                data={cursoFiltro === 'todos' ? dados.matriculas_por_curso : dadosFiltrados?.matriculas_por_curso || []}
                title={cursoFiltro === 'todos' ? "Novas Matrículas por Curso" : `Matrículas - ${cursoFiltro}`}
              />
            ) : (
              <EstadoVazio
                titulo="Sem matrículas no período"
                mensagem={`Nenhuma matrícula registrada em ${getMesNomeCurto(mes)}/${ano}${cursoFiltro !== 'todos' ? ` para ${cursoFiltro}` : ''}. Isso pode indicar período de baixa ou dados ainda não lançados.`}
              />
            )}
            {dados.matriculas_por_professor.length > 0 ? (
              <RankingTable
                data={dados.matriculas_por_professor.slice(0, 10)}
                title="🎯 Professores Matriculadores"
                valorLabel="Matrículas"
              />
            ) : (
              <EstadoVazio
                titulo="Sem ranking de professores matriculadores"
                mensagem={`Nenhuma matrícula com professor vinculado em ${getMesNomeCurto(mes)}/${ano}.`}
              />
            )}
          </div>

          {/* Gráficos - Linha 3: Evasões */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {(cursoFiltro === 'todos' ? dados.evasoes_por_curso : dadosFiltrados?.evasoes_por_curso || []).length > 0 ? (
              <DistributionChart
                data={cursoFiltro === 'todos' ? dados.evasoes_por_curso : dadosFiltrados?.evasoes_por_curso || []}
                title={cursoFiltro === 'todos' ? "Evasões por Curso" : `Evasões - ${cursoFiltro}`}
              />
            ) : (
              <EstadoVazio
                titulo="Sem evasões no período"
                mensagem={`Nenhuma evasão registrada em ${getMesNomeCurto(mes)}/${ano}${cursoFiltro !== 'todos' ? ` para ${cursoFiltro}` : ''}. Ótima notícia! 🎉`}
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
                title="⚠️ Evasões por Professor"
                valorLabel="Evasões"
              />
            ) : (
              <EstadoVazio
                titulo="Sem ranking de evasões"
                mensagem={`Nenhuma evasão com professor vinculado em ${getMesNomeCurto(mes)}/${ano}. Excelente! 🎉`}
              />
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'financeiro' && (
        <div className="space-y-6">
          {/* Aviso se o mês não está fechado */}
          {!mesFechado && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <p className="text-amber-200 text-sm">
                <strong>Mês não fechado:</strong> Os dados de {getMesNomeCurto(mes)}/{ano} ainda não foram populados. 
                Os KPIs abaixo mostram valores em tempo real dos alunos ativos, não o fechamento do mês.
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <KPICard
              icon={CreditCard}
              label="Ticket Médio"
              value={mesFechado ? dados.ticket_medio : '—'}
              target={metas.ticket_medio}
              format={mesFechado ? "currency" : "number"}
              variant="violet"
              comparativoMesAnterior={mesFechado && dadosMesAnterior ? { valor: dadosMesAnterior.ticket_medio, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={mesFechado && dadosAnoAnterior ? { valor: dadosAnoAnterior.ticket_medio, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={Wallet}
              label="MRR"
              value={mesFechado ? dados.mrr : '—'}
              format={mesFechado ? "currency" : "number"}
              variant="emerald"
              comparativoMesAnterior={mesFechado && dadosMesAnterior ? { valor: dadosMesAnterior.faturamento_estimado, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={mesFechado && dadosAnoAnterior ? { valor: dadosAnoAnterior.faturamento_estimado, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={Calendar}
              label="ARR"
              value={mesFechado ? formatCurrency(dados.arr) : '—'}
              subvalue="Receita Recorrente Anual"
              variant="cyan"
            />
            <KPICard
              icon={TrendingUp}
              label="LTV Médio"
              value={mesFechado ? formatCurrency(dados.ltv_medio) : '—'}
              subvalue="Lifetime Value"
              variant="violet"
            />
            <KPICard
              icon={Target}
              label="Faturamento Previsto"
              value={mesFechado ? formatCurrency(dados.faturamento_previsto) : '—'}
              variant="cyan"
            />
            <KPICard
              icon={CheckCircle}
              label="Faturamento Realizado"
              value={mesFechado ? formatCurrency(dados.faturamento_realizado) : '—'}
              variant="emerald"
            />
            <KPICard
              icon={AlertTriangle}
              label="Inadimplência %"
              value={mesFechado ? dados.inadimplencia_pct : '—'}
              target={metas.inadimplencia}
              format={mesFechado ? "percent" : "number"}
              metaInversa={true}
              variant="amber"
              inverterCor={true}
              comparativoMesAnterior={mesFechado && dadosMesAnterior ? { valor: dadosMesAnterior.inadimplencia, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={mesFechado && dadosAnoAnterior ? { valor: dadosAnoAnterior.inadimplencia, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={Percent}
              label="Reajuste Médio"
              value={mesFechado ? `${dados.reajuste_pct.toFixed(1)}%` : '—'}
              variant="cyan"
            />
          </div>

          {/* Gráficos Financeiros */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 1. Evolução do MRR */}
            {evolucaoMRR.length > 0 ? (
              <EvolutionChart
                data={evolucaoMRR}
                title="📈 Evolução do MRR"
                lines={[
                  { dataKey: 'mrr', color: '#10b981', name: 'MRR' }
                ]}
                yAxisFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
              />
            ) : (
              <EstadoVazio
                titulo="Sem dados de MRR"
                mensagem="Não há dados históricos de MRR para exibir a evolução."
              />
            )}

            {/* 2. Previsto vs Realizado */}
            {previstoRealizado.length > 0 ? (
              <ComparisonChart
                data={previstoRealizado}
                title="💰 Previsto vs Realizado"
                bars={[
                  { dataKey: 'previsto', name: 'Previsto', color: '#8b5cf6' },
                  { dataKey: 'realizado', name: 'Realizado', color: '#10b981' }
                ]}
                formatValue={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
              />
            ) : (
              <EstadoVazio
                titulo="Sem dados de faturamento"
                mensagem="Não há dados históricos de faturamento previsto e realizado."
              />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 3. Receita por Unidade - apenas para Consolidado */}
            {unidade === 'todos' && receitaPorUnidade.length > 0 ? (
              <DistributionChart
                data={receitaPorUnidade}
                title="🏢 Receita por Unidade (MRR)"
              />
            ) : unidade === 'todos' ? (
              <EstadoVazio
                titulo="Sem dados de receita por unidade"
                mensagem="Não há dados de MRR por unidade para o período selecionado."
              />
            ) : null}

            {/* 4. Evolução da Inadimplência */}
            {evolucaoInadimplencia.length > 0 ? (
              <AreaChart
                data={evolucaoInadimplencia}
                title="⚠️ Evolução da Inadimplência"
                dataKey="inadimplencia"
                name="Inadimplência"
                color="#f59e0b"
                formatValue={(value) => `${value.toFixed(1)}%`}
                className={unidade !== 'todos' ? 'lg:col-span-2' : ''}
                showAverage={true}
                averageLabel="Média"
              />
            ) : (
              <EstadoVazio
                titulo="Sem dados de inadimplência"
                mensagem="Não há dados históricos de inadimplência para exibir a evolução."
              />
            )}
          </div>

          {/* Gráficos Financeiros - Linha 3: Ticket Médio e Reajuste */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 5. Evolução do Ticket Médio */}
            {evolucaoTicketMedio.length > 0 ? (
              <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">💰 Evolução do Ticket Médio</h3>
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
                    { dataKey: 'ticket', color: '#8b5cf6', name: 'Ticket Médio' }
                  ]}
                  yAxisFormatter={(value) => `R$ ${value.toFixed(0)}`}
                />
              </div>
            ) : (
              <EstadoVazio
                titulo="Sem dados de ticket médio"
                mensagem="Não há dados históricos de ticket médio para exibir a evolução."
              />
            )}

            {/* 6. Evolução do Reajuste Médio */}
            {evolucaoReajuste.length > 0 ? (
              <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">📊 Reajustes Aplicados</h3>
                  {mediaReajusteAnual > 0 && (
                    <span className="text-sm text-slate-400">
                      Média: <span className="text-cyan-400 font-bold">{mediaReajusteAnual.toFixed(1)}%</span>
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
                mensagem="Não há dados históricos de reajuste para exibir a evolução."
              />
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'retencao' && (
        <div className="space-y-6">
          {/* Aviso se o mês não está fechado */}
          {!mesFechado && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <p className="text-amber-200 text-sm">
                <strong>Mês não fechado:</strong> Os dados de {getMesNomeCurto(mes)}/{ano} ainda não foram populados. 
                Os KPIs de retenção mostram dados em tempo real, não o fechamento do mês.
              </p>
            </div>
          )}
          {/* Linha 1: Evasões (fluxo: tipos → total → taxa → impacto) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KPICard
              icon={XCircle}
              label="Cancelamentos"
              value={mesFechado ? dados.cancelamentos : '—'}
              subvalue={mesFechado ? `${dados.cancelamento_pct.toFixed(1)}%` : ''}
              variant="rose"
              inverterCor={true}
            />
            <KPICard
              icon={UserX}
              label="Não Renovações"
              value={mesFechado ? dados.nao_renovacoes : '—'}
              variant="amber"
              inverterCor={true}
            />
            <KPICard
              icon={TrendingDown}
              label="Total Evasões"
              value={mesFechado ? dados.total_evasoes : '—'}
              subvalue="Cancelamentos + Não Renovações"
              variant="rose"
              inverterCor={true}
            />
            <KPICard
              icon={Percent}
              label="Churn Rate"
              value={mesFechado ? dados.churn_rate : '—'}
              target={metas.churn_rate}
              format={mesFechado ? "percent" : "number"}
              metaInversa={true}
              variant="rose"
              inverterCor={true}
              comparativoMesAnterior={mesFechado && dadosMesAnterior ? { valor: dadosMesAnterior.churn_rate, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={mesFechado && dadosAnoAnterior ? { valor: dadosAnoAnterior.churn_rate, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={DollarSign}
              label="MRR Perdido"
              value={mesFechado ? formatCurrency(dados.mrr_perdido) : '—'}
              variant="rose"
            />
          </div>

          {/* Linha 2: Retenção (fluxo: renovações → taxa → prevenção → qualidade) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KPICard
              icon={CheckCircle}
              label="Renovações"
              value={mesFechado ? dados.renovacoes : '—'}
              variant="emerald"
            />
            <KPICard
              icon={RefreshCw}
              label="Taxa Renovação"
              value={mesFechado ? dados.renovacoes_pct : '—'}
              target={metas.taxa_renovacao}
              format={mesFechado ? "percent" : "number"}
              variant="emerald"
              comparativoMesAnterior={mesFechado && dadosMesAnterior ? { valor: dadosMesAnterior.taxa_renovacao, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={mesFechado && dadosAnoAnterior ? { valor: dadosAnoAnterior.taxa_renovacao, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={Bell}
              label="Aviso Prévio"
              value={mesFechado ? dados.aviso_previo : '—'}
              variant="amber"
            />
            <KPICard
              icon={Calendar}
              label="Tempo Permanência"
              value={dados.tempo_permanencia}
              subvalue="Meses (média)"
              variant="cyan"
              comparativoMesAnterior={dadosMesAnterior ? { valor: dadosMesAnterior.tempo_permanencia, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={dadosAnoAnterior ? { valor: dadosAnoAnterior.tempo_permanencia, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={Star}
              label="NPS Evasões"
              value={dados.nps_evasoes.toFixed(1)}
              subvalue="Nota média das evasões"
              variant="amber"
            />
          </div>

          {/* Gráficos de Evolução */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Evolução do Churn Rate */}
            {evolucaoChurn.length > 0 ? (
              <AreaChart
                data={evolucaoChurn}
                title="📉 Evolução do Churn Rate"
                dataKey="churn"
                name="Churn Rate"
                color="#ef4444"
                formatValue={(value) => `${value.toFixed(2)}%`}
                showAverage={true}
                averageLabel="Média"
              />
            ) : (
              <EstadoVazio
                titulo="Sem dados de churn"
                mensagem="Não há dados históricos de churn rate para exibir a evolução."
              />
            )}

            {/* Evolução da Taxa de Renovação */}
            {evolucaoTaxaRenovacao.length > 0 ? (
              <AreaChart
                data={evolucaoTaxaRenovacao}
                title="📈 Evolução da Taxa de Renovação"
                dataKey="renovacao"
                name="Taxa Renovação"
                color="#10b981"
                formatValue={(value) => `${value.toFixed(1)}%`}
                showAverage={true}
                averageLabel="Média"
              />
            ) : (
              <EstadoVazio
                titulo="Sem dados de renovação"
                mensagem="Não há dados históricos de taxa de renovação para exibir a evolução."
              />
            )}
          </div>

          {/* Gráfico de Evasões vs Matrículas */}
          <div className="grid grid-cols-1 gap-6">
            {evolucao.length > 0 ? (
              <EvolutionChart
                data={evolucao}
                title="📊 Evolução: Matrículas vs Evasões"
                lines={[
                  { dataKey: 'matriculas', color: '#10b981', name: 'Matrículas' },
                  { dataKey: 'evasoes', color: '#ef4444', name: 'Evasões' },
                ]}
              />
            ) : (
              <EstadoVazio
                titulo="Sem dados de evasões"
                mensagem="Não há dados históricos de evasões para exibir a evolução."
              />
            )}
          </div>

          {/* Gráficos de Motivos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DistributionChart
              data={dados.motivos_nao_renovacao}
              title="Motivos de Não Renovação"
            />
            <DistributionChart
              data={dados.motivos_cancelamento}
              title="Motivos de Cancelamento"
            />
          </div>
        </div>
      )}

    </div>
  );
}

export default TabGestao;
