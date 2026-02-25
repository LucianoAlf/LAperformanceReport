import { useState, useEffect } from 'react';
import { Users, Trophy, TrendingUp, TrendingDown, Percent, Star, DollarSign, UserCheck, UserMinus, Target, Award, Clock, BarChart3 } from 'lucide-react';
import { KPICard } from '@/components/ui/KPICard';
import { RankingTable } from '@/components/ui/RankingTable';
import { RankingTableCollapsible } from '@/components/ui/RankingTableCollapsible';
import { BarChartHorizontal } from '@/components/ui/BarChartHorizontal';
import { formatCurrency, getMesNomeCurto } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface TabProfessoresProps {
  ano: number;
  mes: number;
  mesFim?: number; // Para filtros de período (trimestre, semestre, anual)
  unidade: string;
}

type SubTabId = 'visao_geral' | 'conversao' | 'retencao';

const subTabs = [
  { id: 'visao_geral' as const, label: 'Visão Geral', icon: Users },
  { id: 'conversao' as const, label: 'Conversão', icon: Target },
  { id: 'retencao' as const, label: 'Retenção', icon: UserCheck },
];

interface ProfessorKPI {
  id: number;
  nome: string;
  unidade_nome: string;
  
  // Carteira
  carteira_alunos: number;
  media_alunos_turma: number;
  ticket_medio: number;
  
  // Conversão
  experimentais: number;
  matriculas: number;
  taxa_conversao: number;
  
  // Retenção
  renovacoes: number;
  nao_renovacoes: number;
  taxa_renovacao: number;
  evasoes: number;
  taxa_cancelamento: number;
  mrr_perdido: number;
  
  // Qualidade
  nps: number;
  media_presenca: number;
  taxa_faltas: number;
}

interface DadosProfessores {
  total_professores: number;
  carteira_media: number;
  alunos_total: number;
  media_alunos_turma_geral: number;
  
  // Conversão
  experimentais_total: number;
  matriculas_total: number;
  taxa_conversao_geral: number;
  ranking_matriculadores: { id: number; nome: string; valor: number; subvalor?: string }[];
  ranking_conversao: { id: number; nome: string; valor: number; subvalor?: string }[];
  
  // Retenção
  renovacoes_total: number;
  nao_renovacoes_total: number;
  taxa_renovacao_geral: number;
  evasoes_total: number;
  mrr_perdido_total: number;
  ranking_renovadores: { id: number; nome: string; valor: number; subvalor?: string }[];
  ranking_churn: { id: number; nome: string; valor: number; subvalor?: string }[];
  
  // Qualidade
  nps_medio: number;
  presenca_media: number;
  ticket_medio_geral: number;
  ranking_nps: { id: number; nome: string; valor: number; subvalor?: string }[];
  
  professores: ProfessorKPI[];
}

// Interface para dados comparativos de professores
interface DadosComparativoProfessores {
  total_professores: number;
  alunos_total: number;
  carteira_media: number;
  experimentais_total: number;
  matriculas_total: number;
  taxa_conversao_geral: number;
  ticket_medio_geral: number;
  label: string;
}

export function TabProfessoresNew({ ano, mes, mesFim, unidade }: TabProfessoresProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('visao_geral');
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<DadosProfessores | null>(null);
  
  // Estados para comparativos históricos
  const [dadosMesAnterior, setDadosMesAnterior] = useState<DadosComparativoProfessores | null>(null);
  const [dadosAnoAnterior, setDadosAnoAnterior] = useState<DadosComparativoProfessores | null>(null);

  // Usar mesFim se fornecido, senão usar mes (para filtro mensal)
  const mesInicio = mes;
  const mesFinal = mesFim || mes;

  useEffect(() => {
    async function fetchDados() {
      setLoading(true);
      try {
        // Determinar qual view usar: mensal (atual) ou histórica
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;
        // Período atual = ano atual E é apenas o mês atual (não range)
        const isCurrentPeriod = ano === currentYear && mesInicio === currentMonth && mesFinal === currentMonth;
        
        // Usar view mensal para período atual, histórica para passado
        const viewName = isCurrentPeriod ? 'vw_kpis_professor_mensal' : 'vw_kpis_professor_historico';

        // ========== BUSCAR DADOS COMPARATIVOS (Mês Anterior e Ano Anterior) ==========
        // Usar tabela dados_mensais que tem dados históricos completos de alunos, matrículas, ticket, etc.
        // Usar tabela dados_comerciais para experimentais
        const mesAnterior = mes === 1 ? 12 : mes - 1;
        const anoMesAnterior = mes === 1 ? ano - 1 : ano;

        // Buscar dados do mês anterior de dados_mensais (alunos, ticket, matrículas)
        let mesAnteriorDadosQuery = supabase
          .from('dados_mensais')
          .select('*')
          .eq('ano', anoMesAnterior)
          .eq('mes', mesAnterior);

        if (unidade !== 'todos') {
          mesAnteriorDadosQuery = mesAnteriorDadosQuery.eq('unidade_id', unidade);
        }

        // Buscar dados do mês anterior de dados_comerciais (experimentais)
        const competenciaMesAnt = `${anoMesAnterior}-${String(mesAnterior).padStart(2, '0')}-01`;
        let mesAnteriorComercialQuery = supabase
          .from('dados_comerciais')
          .select('*')
          .eq('competencia', competenciaMesAnt);

        // Buscar dados do mesmo mês do ano anterior de dados_mensais
        let anoAnteriorDadosQuery = supabase
          .from('dados_mensais')
          .select('*')
          .eq('ano', ano - 1)
          .eq('mes', mes);

        if (unidade !== 'todos') {
          anoAnteriorDadosQuery = anoAnteriorDadosQuery.eq('unidade_id', unidade);
        }

        // Buscar dados do ano anterior de dados_comerciais (experimentais)
        const competenciaAnoAnt = `${ano - 1}-${String(mes).padStart(2, '0')}-01`;
        let anoAnteriorComercialQuery = supabase
          .from('dados_comerciais')
          .select('*')
          .eq('competencia', competenciaAnoAnt);

        // Executar queries comparativas em paralelo
        const [mesAntDadosResult, mesAntComercialResult, anoAntDadosResult, anoAntComercialResult] = await Promise.all([
          mesAnteriorDadosQuery,
          mesAnteriorComercialQuery,
          anoAnteriorDadosQuery,
          anoAnteriorComercialQuery
        ]);

        // Processar dados do mês anterior
        const dadosMesAnt = mesAntDadosResult.data || [];
        const comercialMesAnt = mesAntComercialResult.data || [];
        if (dadosMesAnt.length > 0) {
          const alunosTotal = dadosMesAnt.reduce((acc, d) => acc + (d.alunos_pagantes || 0), 0);
          const matTotal = dadosMesAnt.reduce((acc, d) => acc + (d.novas_matriculas || 0), 0);
          const ticketMedio = dadosMesAnt.length > 0 
            ? dadosMesAnt.reduce((acc, d) => acc + (Number(d.ticket_medio) || 0), 0) / dadosMesAnt.length 
            : 0;
          const expTotal = comercialMesAnt.reduce((acc, c) => acc + (c.aulas_experimentais || 0), 0);

          setDadosMesAnterior({
            total_professores: 0, // Não temos histórico mensal de professores
            alunos_total: alunosTotal,
            carteira_media: 0,
            experimentais_total: expTotal,
            matriculas_total: matTotal,
            taxa_conversao_geral: expTotal > 0 ? (matTotal / expTotal) * 100 : 0,
            ticket_medio_geral: ticketMedio,
            label: `${getMesNomeCurto(mesAnterior)}/${String(anoMesAnterior).slice(2)}`,
          });
        } else {
          setDadosMesAnterior(null);
        }

        // Processar dados do ano anterior
        const dadosAnoAnt = anoAntDadosResult.data || [];
        const comercialAnoAnt = anoAntComercialResult.data || [];
        if (dadosAnoAnt.length > 0) {
          const alunosTotal = dadosAnoAnt.reduce((acc, d) => acc + (d.alunos_pagantes || 0), 0);
          const matTotal = dadosAnoAnt.reduce((acc, d) => acc + (d.novas_matriculas || 0), 0);
          const ticketMedio = dadosAnoAnt.length > 0 
            ? dadosAnoAnt.reduce((acc, d) => acc + (Number(d.ticket_medio) || 0), 0) / dadosAnoAnt.length 
            : 0;
          const expTotal = comercialAnoAnt.reduce((acc, c) => acc + (c.aulas_experimentais || 0), 0);

          setDadosAnoAnterior({
            total_professores: 0, // Não temos histórico mensal de professores
            alunos_total: alunosTotal,
            carteira_media: 0,
            experimentais_total: expTotal,
            matriculas_total: matTotal,
            taxa_conversao_geral: expTotal > 0 ? (matTotal / expTotal) * 100 : 0,
            ticket_medio_geral: ticketMedio,
            label: `${getMesNomeCurto(mes)}/${String(ano - 1).slice(2)}`,
          });
        } else {
          setDadosAnoAnterior(null);
        }
        
        let query = supabase
          .from(viewName)
          .select('*')
          .eq('ano', ano)
          .gte('mes', mesInicio)
          .lte('mes', mesFinal);

        // Filtrar por unidade se não for consolidado
        if (unidade !== 'todos') {
          query = query.eq('unidade_id', unidade);
        }

        // Buscar nome da unidade para filtrar tabelas que usam nome em vez de ID
        let nomeUnidade = '';
        if (unidade !== 'todos') {
          const { data: unidadeData } = await supabase
            .from('unidades')
            .select('nome')
            .eq('id', unidade)
            .single();
          nomeUnidade = unidadeData?.nome || '';
        }

        // Buscar totais de experimentais/matrículas por unidade (dados do CSV - só para histórico)
        let totaisQuery = supabase
          .from('experimentais_mensal_unidade')
          .select('*')
          .eq('ano', ano)
          .gte('mes', mesInicio)
          .lte('mes', mesFinal);

        if (unidade !== 'todos') {
          totaisQuery = totaisQuery.eq('unidade_id', unidade);
        }

        // Buscar dados de performance anual (conversão e retenção)
        let performanceQuery = supabase
          .from('professores_performance')
          .select('*')
          .eq('ano', ano);
        if (unidade !== 'todos' && nomeUnidade) {
          performanceQuery = performanceQuery.eq('unidade', nomeUnidade);
        }

        // Buscar dados de qualidade (presença, ticket, carteira atual)
        // Nota: vw_kpis_professor_completo não tem unidade_id, filtro será aplicado após fetch via profIdsNaUnidade
        let qualidadeQuery = supabase
          .from('vw_kpis_professor_completo')
          .select('*');

        // Buscar dados de evasões por professor
        let evasoesQuery = supabase
          .from('vw_evasoes_professores')
          .select('*');
        if (unidade !== 'todos' && nomeUnidade) {
          evasoesQuery = evasoesQuery.eq('unidade', nomeUnidade);
        }

        // Buscar MRR Perdido do período de movimentacoes_admin (fonte única)
        const startDate = `${ano}-${String(mesInicio).padStart(2, '0')}-01`;
        const ultimoDiaMes = new Date(ano, mesFinal, 0).getDate();
        const endDate = `${ano}-${String(mesFinal).padStart(2, '0')}-${String(ultimoDiaMes).padStart(2, '0')}`;

        // Query: movimentacoes_admin - só Cancelamento e Não Renovação
        let movimentacoesQuery = supabase
          .from('movimentacoes_admin')
          .select('professor_id, unidade_id, valor_parcela_evasao, valor_parcela_anterior, tipo')
          .in('tipo', ['evasao', 'nao_renovacao'])
          .gte('data', startDate)
          .lte('data', endDate);

        if (unidade !== 'todos') {
          movimentacoesQuery = movimentacoesQuery.eq('unidade_id', unidade);
        }

        // Buscar turmas implícitas para calcular média alunos/turma (mesma fonte da página Professores)
        let turmasImplicitasQuery = supabase
          .from('vw_turmas_implicitas')
          .select('professor_id, total_alunos, unidade_id');
        if (unidade !== 'todos') {
          turmasImplicitasQuery = turmasImplicitasQuery.eq('unidade_id', unidade);
        }

        // ========== QUERIES PARA TOTAIS REAIS (fonte de verdade) ==========
        // Total Professores: via professores + professores_unidades
        const professoresReaisQuery = supabase
          .from('professores')
          .select('id, nome, ativo')
          .eq('ativo', true);

        let profUnidadesQuery = supabase
          .from('professores_unidades')
          .select('professor_id, unidade_id');
        if (unidade !== 'todos') {
          profUnidadesQuery = profUnidadesQuery.eq('unidade_id', unidade);
        }

        // Total Alunos: via tabela alunos (inclui trancados — consistente com aba Alunos e Dashboard)
        // CORREÇÃO: Incluir is_segundo_curso para cálculo correto do ticket médio
        let alunosTotalQuery = supabase
          .from('alunos')
          .select('id, professor_atual_id, unidade_id, valor_parcela, percentual_presenca, is_segundo_curso', { count: 'exact' })
          .in('status', ['ativo', 'trancado']);
        if (unidade !== 'todos') {
          alunosTotalQuery = alunosTotalQuery.eq('unidade_id', unidade);
        }

        const [professoresResult, totaisResult, performanceResult, qualidadeResult, evasoesResult, movimentacoesResult, turmasImplicitasResult, professoresReaisResult, profUnidadesResult, alunosTotalResult] = await Promise.all([
          query,
          totaisQuery,
          performanceQuery,
          qualidadeQuery,
          evasoesQuery,
          movimentacoesQuery,
          turmasImplicitasQuery,
          professoresReaisQuery,
          profUnidadesQuery,
          alunosTotalQuery
        ]);

        if (professoresResult.error) throw professoresResult.error;
        if (totaisResult.error) throw totaisResult.error;

        const professores = professoresResult.data || [];
        const totaisUnidade = totaisResult.data || [];
        const performanceData = performanceResult.data || [];
        const qualidadeDataRaw = qualidadeResult.data || [];
        const evasoesData = evasoesResult.data || [];
        const turmasImplicitas = turmasImplicitasResult.data || [];

        // ========== PROCESSAR TOTAIS REAIS (fonte de verdade) ==========
        const professoresReais = professoresReaisResult.data || [];
        const profUnidades = profUnidadesResult.data || [];
        const alunosReais = alunosTotalResult.data || [];
        const alunosTotalCount = alunosTotalResult.count || alunosReais.length;

        // Filtrar professores por unidade (via professores_unidades)
        const profIdsNaUnidade = new Set(profUnidades.map((pu: any) => pu.professor_id));

        // Filtrar qualidadeData pelos professores da unidade (view não tem unidade_id)
        const qualidadeData = unidade === 'todos'
          ? qualidadeDataRaw
          : qualidadeDataRaw.filter((q: any) => profIdsNaUnidade.has(q.professor_id));
        const professoresFiltrados = unidade === 'todos' 
          ? professoresReais 
          : professoresReais.filter((p: any) => profIdsNaUnidade.has(p.id));
        
        // Total real de professores e alunos (para KPI cards)
        const totalProfessoresReal = professoresFiltrados.length;
        const alunosTotalReal = alunosTotalCount;

        // Calcular carteira por professor a partir dos alunos reais
        const carteiraPorProfessorReal = new Map<number, { alunos: number; ticketTotal: number; presencaTotal: number }>();
        alunosReais.forEach((a: any) => {
          const profId = a.professor_atual_id;
          if (!profId) return;
          const current = carteiraPorProfessorReal.get(profId) || { alunos: 0, ticketTotal: 0, presencaTotal: 0 };
          current.alunos += 1;
          current.ticketTotal += Number(a.valor_parcela) || 0;
          current.presencaTotal += Number(a.percentual_presenca) || 0;
          carteiraPorProfessorReal.set(profId, current);
        });

        // Calcular média alunos/turma por professor (mesma lógica da página Professores)
        const turmasPorProfessor = new Map<number, number>();
        const alunosPorProfessorTurma = new Map<number, number>();
        turmasImplicitas.forEach((t: any) => {
          const profId = t.professor_id;
          turmasPorProfessor.set(profId, (turmasPorProfessor.get(profId) || 0) + 1);
          alunosPorProfessorTurma.set(profId, (alunosPorProfessorTurma.get(profId) || 0) + (t.total_alunos || 0));
        });

        // Calcular média alunos/turma por professor
        const mediaAlunosTurmaPorProfessor = new Map<number, number>();
        turmasPorProfessor.forEach((turmas, profId) => {
          const alunos = alunosPorProfessorTurma.get(profId) || 0;
          mediaAlunosTurmaPorProfessor.set(profId, turmas > 0 ? alunos / turmas : 0);
        });
        
        // Calcular totais corretos do CSV
        const experimentaisTotalCSV = totaisUnidade.reduce((acc, t) => acc + (t.total_experimentais || 0), 0);
        const matriculasTotalCSV = totaisUnidade.reduce((acc, t) => acc + (t.total_matriculas || 0), 0);

        // Mapear dados de qualidade por nome de professor
        const qualidadeMap = new Map<string, typeof qualidadeData[0]>();
        qualidadeData.forEach(q => {
          qualidadeMap.set(q.professor_nome, q);
        });

        // Mapear dados de evasões por professor/unidade
        const evasoesMap = new Map<string, typeof evasoesData[0]>();
        evasoesData.forEach(e => {
          const key = `${e.professor}-${e.unidade}`;
          evasoesMap.set(key, e);
        });

        // Processar MRR Perdido de movimentacoes_admin (fonte única)
        const movimentacoesData = movimentacoesResult.data || [];
        const mrrPerdidoPorProfessor = new Map<string, number>();
        let mrrPerdidoTotalDireto = 0;

        movimentacoesData.forEach((m: any) => {
          const parcela = Number(m.valor_parcela_evasao || m.valor_parcela_anterior) || 0;
          mrrPerdidoTotalDireto += parcela;

          if (m.professor_id) {
            const profKey = `ID_${m.professor_id}`;
            const mrrAtual = mrrPerdidoPorProfessor.get(profKey) || 0;
            mrrPerdidoPorProfessor.set(profKey, mrrAtual + parcela);
          }
        });

        // Consolidar dados de performance por professor (somando unidades)
        const performanceMap = new Map<string, {
          experimentais: number;
          matriculas: number;
          taxa_conversao: number;
          evasoes: number;
          renovacoes: number;
          contratos_vencer: number;
          taxa_renovacao: number;
        }>();

        performanceData.forEach(p => {
          const nome = p.professor;
          const existing = performanceMap.get(nome);
          
          if (existing) {
            existing.experimentais += p.experimentais || 0;
            existing.matriculas += p.matriculas || 0;
            existing.evasoes += p.evasoes || 0;
            existing.renovacoes += p.renovacoes || 0;
            existing.contratos_vencer += p.contratos_vencer || 0;
            // Recalcular taxas após somar
            existing.taxa_conversao = existing.experimentais > 0 
              ? (existing.matriculas / existing.experimentais) * 100 : 0;
            existing.taxa_renovacao = existing.contratos_vencer > 0 
              ? (existing.renovacoes / existing.contratos_vencer) * 100 : 0;
          } else {
            performanceMap.set(nome, {
              experimentais: p.experimentais || 0,
              matriculas: p.matriculas || 0,
              taxa_conversao: Number(p.taxa_conversao) || 0,
              evasoes: p.evasoes || 0,
              renovacoes: p.renovacoes || 0,
              contratos_vencer: p.contratos_vencer || 0,
              taxa_renovacao: Number(p.taxa_renovacao) || 0,
            });
          }
        });
        
        // Consolidar dados por professor único (evita duplicação quando professor atua em múltiplas unidades)
        const professoresMap = new Map<number, ProfessorKPI>();
        
        professores.forEach(p => {
          const id = p.professor_id;
          const nome = p.professor_nome;
          const existing = professoresMap.get(id);
          
          // Buscar dados de performance (só para dados históricos/anuais)
          const perf = performanceMap.get(nome.toUpperCase()) || performanceMap.get(nome);
          const qual = qualidadeMap.get(nome);
          
          if (existing) {
            // Somar valores acumuláveis
            existing.carteira_alunos += p.carteira_alunos || 0;
            existing.matriculas += p.matriculas || 0;
            existing.experimentais += p.experimentais || 0;
            existing.renovacoes += p.renovacoes || 0;
            existing.nao_renovacoes += p.nao_renovacoes || 0;
            existing.evasoes += p.evasoes || 0;
            // Usar MRR Perdido da tabela evasoes (fonte real)
            const mrrPerdidoReal = mrrPerdidoPorProfessor.get(nome.toUpperCase()) || 0;
            existing.mrr_perdido += mrrPerdidoReal;
          } else {
            // Usar média alunos/turma calculada de vw_turmas_implicitas (mesma fonte da página Professores)
            const mediaAlunosTurmaCalculada = mediaAlunosTurmaPorProfessor.get(id) || 0;
            
            professoresMap.set(id, {
              id: p.professor_id,
              nome: nome,
              unidade_nome: '',
              // Carteira - usar dados da view diretamente
              carteira_alunos: p.carteira_alunos ?? qual?.carteira_alunos ?? 0,
              media_alunos_turma: mediaAlunosTurmaCalculada > 0 ? mediaAlunosTurmaCalculada : (p.media_alunos_turma ? Number(p.media_alunos_turma) : 0),
              ticket_medio: p.ticket_medio ? Number(p.ticket_medio) : (qual?.ticket_medio ? Number(qual.ticket_medio) : 0),
              // Conversão - usar dados da view, fallback para performance anual
              experimentais: p.experimentais ?? perf?.experimentais ?? 0,
              matriculas: p.matriculas ?? perf?.matriculas ?? 0,
              taxa_conversao: p.taxa_conversao ? Number(p.taxa_conversao) : (perf?.taxa_conversao ?? 0),
              // Retenção - usar dados da view, fallback para performance anual
              renovacoes: p.renovacoes ?? perf?.renovacoes ?? 0,
              nao_renovacoes: p.nao_renovacoes ?? ((perf?.contratos_vencer ?? 0) - (perf?.renovacoes ?? 0)),
              taxa_renovacao: p.taxa_renovacao ? Number(p.taxa_renovacao) : (perf?.taxa_renovacao ?? 0),
              evasoes: p.evasoes ?? perf?.evasoes ?? 0,
              taxa_cancelamento: p.taxa_cancelamento ? Number(p.taxa_cancelamento) : 0,
              // Usar MRR Perdido da tabela evasoes (fonte real)
              mrr_perdido: mrrPerdidoPorProfessor.get(nome.toUpperCase()) || 0,
              // Qualidade - usar dados da view
              nps: p.nps_medio ? Number(p.nps_medio) : (qual?.nps_medio ? Number(qual.nps_medio) : 0),
              media_presenca: p.media_presenca ? Number(p.media_presenca) : (qual?.media_presenca ? Number(qual.media_presenca) : 0),
              taxa_faltas: p.taxa_faltas ? Number(p.taxa_faltas) : (qual?.taxa_faltas ? Number(qual.taxa_faltas) : 0),
            });
          }
        });

        // Adicionar professores que estão em performance mas não em professores (histórico)
        performanceData.forEach(p => {
          const nomeUpper = p.professor;
          const existingByName = Array.from(professoresMap.values()).find(
            prof => prof.nome.toUpperCase() === nomeUpper
          );
          
          if (!existingByName) {
            const qual = qualidadeData.find(q => q.professor_nome.toUpperCase() === nomeUpper);
            const perf = performanceMap.get(nomeUpper);
            
            if (perf) {
              const newId = Math.max(...Array.from(professoresMap.keys()), 0) + 1000 + professoresMap.size;
              // Buscar média alunos/turma calculada (pode não existir para professores só em performance)
              const mediaAlunosTurmaCalc = mediaAlunosTurmaPorProfessor.get(newId) || 0;
              
              professoresMap.set(newId, {
                id: newId,
                nome: nomeUpper,
                unidade_nome: p.unidade || '',
                carteira_alunos: qual?.carteira_alunos || 0,
                media_alunos_turma: mediaAlunosTurmaCalc > 0 ? mediaAlunosTurmaCalc : (qual?.media_alunos_turma ? Number(qual.media_alunos_turma) : 0),
                ticket_medio: qual?.ticket_medio ? Number(qual.ticket_medio) : 0,
                experimentais: perf.experimentais,
                matriculas: perf.matriculas,
                taxa_conversao: perf.taxa_conversao,
                renovacoes: perf.renovacoes,
                nao_renovacoes: perf.contratos_vencer - perf.renovacoes,
                taxa_renovacao: perf.taxa_renovacao,
                evasoes: perf.evasoes,
                taxa_cancelamento: 0,
                mrr_perdido: 0,
                nps: qual?.nps_medio ? Number(qual.nps_medio) : 0,
                media_presenca: qual?.media_presenca ? Number(qual.media_presenca) : 0,
                taxa_faltas: qual?.taxa_faltas ? Number(qual.taxa_faltas) : 0,
              });
            }
          }
        });
        
        // Converter Map para array e normalizar taxas para evitar inconsistências
        // (ex.: taxa herdada de fonte anual com base diferente do período filtrado)
        const professoresKPIs: ProfessorKPI[] = Array.from(professoresMap.values()).map((p) => {
          const taxaConversaoCalculada = p.experimentais > 0
            ? (p.matriculas / p.experimentais) * 100
            : 0;

          const totalRenovacoesProfessor = p.renovacoes + p.nao_renovacoes;
          const taxaRenovacaoCalculada = totalRenovacoesProfessor > 0
            ? (p.renovacoes / totalRenovacoesProfessor) * 100
            : 0;

          return {
            ...p,
            taxa_conversao: taxaConversaoCalculada,
            taxa_renovacao: taxaRenovacaoCalculada,
          };
        });

        // Calcular totais e médias
        // USAR TOTAIS REAIS (fonte de verdade: professores_unidades + alunos)
        // Em vez de calcular a partir da view que pode ter dados incompletos
        const totalProfessores = totalProfessoresReal;
        const alunosTotal = alunosTotalReal;
        const carteiraMedia = totalProfessores > 0 ? alunosTotal / totalProfessores : 0;
        
        // Usar totais do CSV (dados corretos)
        const experimentaisTotal = experimentaisTotalCSV;
        const matriculasTotal = matriculasTotalCSV;
        const taxaConversaoGeral = experimentaisTotal > 0 ? (matriculasTotal / experimentaisTotal) * 100 : 0;
        
        const renovacoesTotal = professoresKPIs.reduce((acc, p) => acc + p.renovacoes, 0);
        const naoRenovacoesTotal = professoresKPIs.reduce((acc, p) => acc + p.nao_renovacoes, 0);
        const totalRenovacoesPrevistas = renovacoesTotal + naoRenovacoesTotal;
        const taxaRenovacaoGeral = totalRenovacoesPrevistas > 0 ? (renovacoesTotal / totalRenovacoesPrevistas) * 100 : 0;
        
        const evasoesTotal = professoresKPIs.reduce((acc, p) => acc + p.evasoes, 0);
        // Usar MRR Perdido calculado diretamente da tabela evasoes (não depende de match de nomes)
        const mrrPerdidoTotal = mrrPerdidoTotalDireto;
        
        const profsComNPS = professoresKPIs.filter(p => p.nps > 0);
        const npsMedio = profsComNPS.length > 0 ? profsComNPS.reduce((acc, p) => acc + p.nps, 0) / profsComNPS.length : 0;
        
        const profsComPresenca = professoresKPIs.filter(p => p.media_presenca > 0);
        const presencaMedia = profsComPresenca.length > 0 ? profsComPresenca.reduce((acc, p) => acc + p.media_presenca, 0) / profsComPresenca.length : 0;
        
        // CORREÇÃO: Ticket Médio Geral = SUM(valor_parcela de TODOS pagantes) / COUNT(alunos únicos pagantes)
        // Segundo curso contribui pro faturamento mas não conta como pessoa separada no denominador
        const alunosPagantes = alunosReais.filter((a: any) => (a.valor_parcela || 0) > 0);
        const faturamentoTotal = alunosPagantes.reduce((acc: number, a: any) => acc + (Number(a.valor_parcela) || 0), 0);
        const alunosUnicosPagantes = alunosPagantes.filter((a: any) => !a.is_segundo_curso).length;
        const ticketMedioGeral = alunosUnicosPagantes > 0 ? faturamentoTotal / alunosUnicosPagantes : 0;
        
        const profsComTurma = professoresKPIs.filter(p => p.media_alunos_turma > 0);
        const mediaAlunosTurmaGeral = profsComTurma.length > 0 ? profsComTurma.reduce((acc, p) => acc + p.media_alunos_turma, 0) / profsComTurma.length : 0;

        // Rankings
        const rankingMatriculadores = professoresKPIs
          // Ranking de matriculadores = quem mais matricula
          .filter(p => p.matriculas > 0)
          .sort((a, b) => {
            if (b.matriculas !== a.matriculas) return b.matriculas - a.matriculas;
            if (b.taxa_conversao !== a.taxa_conversao) return b.taxa_conversao - a.taxa_conversao;
            return b.experimentais - a.experimentais;
          })
          .slice(0, 10)
          .map(p => ({
            id: p.id,
            nome: p.nome,
            valor: p.matriculas,
            subvalor: `${p.taxa_conversao.toFixed(0)}% conversão (${p.experimentais} exp)`
          }));

        const rankingConversao = professoresKPIs
          .filter(p => p.experimentais > 0 && p.matriculas > 0)
          .sort((a, b) => b.taxa_conversao - a.taxa_conversao)
          .map(p => ({
            id: p.id,
            nome: p.nome,
            valor: p.taxa_conversao,
            subvalor: `${p.matriculas} matrículas de ${p.experimentais} exp`
          }));

        const rankingRenovadores = professoresKPIs
          .filter(p => p.renovacoes > 0 || p.nao_renovacoes > 0)
          .sort((a, b) => b.taxa_renovacao - a.taxa_renovacao)
          .map(p => ({
            id: p.id,
            nome: p.nome,
            valor: p.renovacoes,
            subvalor: `${p.taxa_renovacao.toFixed(0)}% taxa`
          }));

        const rankingChurn = professoresKPIs
          .filter(p => p.carteira_alunos > 0)
          .sort((a, b) => a.taxa_cancelamento - b.taxa_cancelamento) // Menor é melhor
          .map(p => ({
            id: p.id,
            nome: p.nome,
            valor: p.evasoes,
            subvalor: `${p.taxa_cancelamento.toFixed(1)}% churn (${p.carteira_alunos} alunos)`
          }));

        const rankingNPS = professoresKPIs
          .filter(p => p.nps > 0)
          .sort((a, b) => b.nps - a.nps)
          .map(p => ({
            id: p.id,
            nome: p.nome,
            valor: p.nps,
            subvalor: `${p.media_presenca.toFixed(0)}% presença`
          }));

        setDados({
          total_professores: totalProfessores,
          carteira_media: carteiraMedia,
          alunos_total: alunosTotal,
          media_alunos_turma_geral: mediaAlunosTurmaGeral,
          experimentais_total: experimentaisTotal,
          matriculas_total: matriculasTotal,
          taxa_conversao_geral: taxaConversaoGeral,
          ranking_matriculadores: rankingMatriculadores,
          ranking_conversao: rankingConversao,
          renovacoes_total: renovacoesTotal,
          nao_renovacoes_total: naoRenovacoesTotal,
          taxa_renovacao_geral: taxaRenovacaoGeral,
          evasoes_total: evasoesTotal,
          mrr_perdido_total: mrrPerdidoTotal,
          ranking_renovadores: rankingRenovadores,
          ranking_churn: rankingChurn,
          nps_medio: npsMedio,
          presenca_media: presencaMedia,
          ticket_medio_geral: ticketMedioGeral,
          ranking_nps: rankingNPS,
          professores: professoresKPIs,
        });

      } catch (err) {
        console.error('Erro ao carregar dados de professores:', err);
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

  if (!dados) {
    return (
      <div className="text-center text-slate-400 py-12">
        Nenhum dado encontrado para o período selecionado.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sub-abas */}
      <div className="bg-slate-800/50 p-1 rounded-lg inline-flex gap-1 flex-wrap">
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

      {/* Sub-aba: Visão Geral */}
      {activeSubTab === 'visao_geral' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <KPICard
              icon={Users}
              label="Total Professores"
              value={dados.total_professores}
              variant="violet"
            />
            <KPICard
              icon={Users}
              label="Total Alunos"
              value={dados.alunos_total}
              variant="cyan"
              comparativoMesAnterior={dadosMesAnterior && dadosMesAnterior.alunos_total > 0 ? { valor: dadosMesAnterior.alunos_total, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={dadosAnoAnterior && dadosAnoAnterior.alunos_total > 0 ? { valor: dadosAnoAnterior.alunos_total, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={Target}
              label="Média de Alunos"
              value={dados.carteira_media.toFixed(1)}
              subvalue="alunos por professor"
              variant="emerald"
            />
            <KPICard
              icon={Users}
              label="Média Alunos/Turma"
              value={dados.media_alunos_turma_geral.toFixed(1)}
              subvalue="alunos por turma"
              variant="cyan"
            />
            <KPICard
              icon={DollarSign}
              label="Ticket Médio"
              value={dados.ticket_medio_geral}
              format="currency"
              variant="amber"
              comparativoMesAnterior={dadosMesAnterior && dadosMesAnterior.ticket_medio_geral > 0 ? { valor: dadosMesAnterior.ticket_medio_geral, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={dadosAnoAnterior && dadosAnoAnterior.ticket_medio_geral > 0 ? { valor: dadosAnoAnterior.ticket_medio_geral, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={Clock}
              label="Presença Média"
              value={`${dados.presenca_media.toFixed(1)}%`}
              subvalue={`${(100 - dados.presenca_media).toFixed(1)}% faltas`}
              variant="emerald"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <RankingTableCollapsible
              data={dados.professores
                .sort((a, b) => b.carteira_alunos - a.carteira_alunos)
                .map(p => ({
                  id: p.id,
                  nome: p.nome,
                  valor: p.carteira_alunos
                }))}
              title="Ranking - Mais Alunos"
              valorLabel="Alunos"
              topCount={3}
            />
            <RankingTableCollapsible
              data={dados.professores
                .sort((a, b) => b.ticket_medio - a.ticket_medio)
                .map(p => ({
                  id: p.id,
                  nome: p.nome,
                  valor: p.ticket_medio
                }))}
              title="Ranking - Maior Ticket Médio"
              valorLabel="Ticket"
              topCount={3}
              valorFormatter={(value) => formatCurrency(Number(value))}
            />
            {dados.professores.some(p => p.media_alunos_turma > 0) && (
              <RankingTableCollapsible
                data={dados.professores
                  .filter(p => p.media_alunos_turma > 0)
                  .sort((a, b) => b.media_alunos_turma - a.media_alunos_turma)
                  .map(p => ({
                    id: p.id,
                    nome: p.nome,
                    valor: p.media_alunos_turma,
                    subvalor: `${p.carteira_alunos} alunos`
                  }))}
                title="Ranking - Média Alunos/Turma"
                valorLabel="Média"
                topCount={3}
                variant="cyan"
                valorFormatter={(value) => Number(value).toFixed(1)}
              />
            )}
          </div>
        </div>
      )}

      {/* Sub-aba: Conversão */}
      {activeSubTab === 'conversao' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard
              icon={Trophy}
              label="Experimentais"
              value={dados.experimentais_total}
              variant="cyan"
              comparativoMesAnterior={dadosMesAnterior ? { valor: dadosMesAnterior.experimentais_total, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={dadosAnoAnterior ? { valor: dadosAnoAnterior.experimentais_total, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={UserCheck}
              label="Matrículas"
              value={dados.matriculas_total}
              variant="emerald"
              comparativoMesAnterior={dadosMesAnterior ? { valor: dadosMesAnterior.matriculas_total, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={dadosAnoAnterior ? { valor: dadosAnoAnterior.matriculas_total, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={Percent}
              label="Taxa Conversão"
              value={`${dados.taxa_conversao_geral.toFixed(1)}%`}
              variant="violet"
            />
            <KPICard
              icon={Award}
              label="Melhor Professor"
              value={dados.ranking_matriculadores[0]?.nome.split(' ')[0] || '-'}
              subvalue={dados.ranking_matriculadores[0]?.subvalor || ''}
              variant="amber"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RankingTableCollapsible
              data={dados.ranking_matriculadores}
              title="Ranking Professores Matriculadores"
              valorLabel="Matrículas"
              topCount={3}
              variant="emerald"
            />
            <RankingTableCollapsible
              data={dados.ranking_conversao}
              title="Ranking Melhor Taxa de Conversão"
              valorLabel="Taxa"
              topCount={3}
              variant="violet"
              valorFormatter={(value) => `${Number(value).toFixed(1)}%`}
            />
          </div>
        </div>
      )}

      {/* Sub-aba: Retenção */}
      {activeSubTab === 'retencao' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard
              icon={UserCheck}
              label="Renovações"
              value={dados.renovacoes_total}
              subvalue={`${dados.taxa_renovacao_geral.toFixed(1)}% taxa de renovação`}
              variant="emerald"
            />
            <KPICard
              icon={UserMinus}
              label="Não Renovações"
              value={dados.nao_renovacoes_total}
              subvalue={`${(100 - dados.taxa_renovacao_geral).toFixed(1)}% taxa de não renovação`}
              variant="amber"
            />
            <KPICard
              icon={TrendingDown}
              label="Evasões (Churn)"
              value={dados.evasoes_total}
              variant="rose"
            />
            <KPICard
              icon={DollarSign}
              label="MRR Perdido"
              value={formatCurrency(dados.mrr_perdido_total)}
              variant="rose"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RankingTableCollapsible
              data={dados.ranking_renovadores}
              title="Ranking Renovadores"
              valorLabel="Renovações"
              topCount={3}
              variant="emerald"
            />
            <RankingTableCollapsible
              data={dados.ranking_churn}
              title="Menor Churn (Melhor Retenção)"
              valorLabel="Evasões"
              topCount={3}
              variant="cyan"
            />
          </div>
        </div>
      )}

    </div>
  );
}

export default TabProfessoresNew;
