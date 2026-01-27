import { useEffect, useState } from 'react';
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
  Phone,
  GraduationCap,
  RefreshCw,
  FileText,
  BarChart3,
  Calendar,
  Ticket,
  Target,
  Award
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatCurrency } from '@/lib/utils';
import { EvolutionChart } from '@/components/ui/EvolutionChart';
import { FunnelChart } from '@/components/ui/FunnelChart';
import { CompetenciaFilter } from '@/components/ui/CompetenciaFilter';
import { TipoCompetencia, CompetenciaFiltro, CompetenciaRange } from '@/hooks/useCompetenciaFiltro';
import { useMetasKPI } from '@/hooks/useMetasKPI';
import { KPICard } from '@/components/ui/KPICard';

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
  tipo: string;
  unidade: string;
  descricao: string;
  valor: number;
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
  const [dados, setDados] = useState<DashboardData[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [dadosGestao, setDadosGestao] = useState<DadosGestao | null>(null);
  const [dadosComercial, setDadosComercial] = useState<DadosComercial | null>(null);
  const [dadosProfessores, setDadosProfessores] = useState<DadosProfessores | null>(null);
  const [evolucaoAlunos, setEvolucaoAlunos] = useState<{ mes: string; valor: number }[]>([]);
  const [funilComercial, setFunilComercial] = useState<{ etapa: string; valor: number; cor: string }[]>([]);
  const [resumoUnidades, setResumoUnidades] = useState<ResumoUnidade[]>([]);

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

  useEffect(() => {
    async function fetchDados() {
      try {
        // Buscar dados do dashboard (unidades)
        const { data: dashboardData } = await supabase
          .from('vw_dashboard_unidade')
          .select('*');

        if (dashboardData) {
          setDados(dashboardData);
        }

        // Buscar alertas
        const { data: alertasData } = await supabase
          .from('vw_alertas')
          .select('*')
          .limit(5);

        if (alertasData) {
          setAlertas(alertasData);
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
            .select('*');
          
          if (unidade !== 'todos') {
            gestaoQuery = gestaoQuery.eq('unidade_id', unidade);
          }

          const { data } = await gestaoQuery;
          gestaoData = data || [];
        } else {
          // PERÍODO HISTÓRICO: usar dados_mensais com range de meses
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
          }
        }
        
        if (gestaoData && gestaoData.length > 0) {
          // Consolidar dados - MÉDIA para alunos, SOMA para matrículas/evasões
          const consolidado = gestaoData.reduce((acc: any, d: any) => ({
            total_alunos_ativos_sum: acc.total_alunos_ativos_sum + (d.total_alunos_ativos || 0),
            total_alunos_pagantes_sum: acc.total_alunos_pagantes_sum + (d.total_alunos_pagantes || 0),
            novas_matriculas: acc.novas_matriculas + (d.novas_matriculas || 0),
            evasoes: acc.evasoes + (d.evasoes || 0),
            ticket_medio_sum: acc.ticket_medio_sum + (Number(d.ticket_medio) || 0),
            count: acc.count + 1
          }), { total_alunos_ativos_sum: 0, total_alunos_pagantes_sum: 0, novas_matriculas: 0, evasoes: 0, ticket_medio_sum: 0, count: 0 });

          // Calcular número de meses únicos para média correta
          const mesesUnicos = new Set(gestaoData.map((d: any) => `${d.ano}-${d.mes}`)).size || 1;

          setDadosGestao({
            // Alunos: usar MÉDIA (snapshot mensal)
            alunos_ativos: mesesUnicos > 0 ? Math.round(consolidado.total_alunos_pagantes_sum / mesesUnicos) : 0,
            // Matrículas/Evasões: usar SOMA (eventos acumulam)
            matriculas_mes: consolidado.novas_matriculas,
            evasoes_mes: consolidado.evasoes,
            // Ticket: usar MÉDIA
            ticket_medio: consolidado.count > 0 ? consolidado.ticket_medio_sum / consolidado.count : 0
          });
        } else {
          setDadosGestao(null);
        }

        // ===== DADOS COMERCIAIS =====
        // USAR MESMA FONTE da aba Comercial (TabComercialNew.tsx): vw_kpis_comercial_historico
        // Esta view tem dados consolidados por mês/ano
        // Para mês atual, pode não ter dados ainda - usar dados_comerciais como fallback

        let comercialData: any[] = [];
        
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

          const { data } = await comercialQuery;
          comercialData = data || [];
        } else {
          // Mês atual: usar dados_comerciais (se existir) ou deixar vazio
          const competenciaStr = `${ano}-${String(mes).padStart(2, '0')}-01`;
          let comercialQuery = supabase
            .from('dados_comerciais')
            .select('*')
            .eq('competencia', competenciaStr);

          const { data } = await comercialQuery;
          
          if (data && data.length > 0) {
            const unidadeMap: Record<string, string> = {
              '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'Campo Grande',
              '95553e96-971b-4590-a6eb-0201d013c14d': 'Recreio',
              '368d47f5-2d88-4475-bc14-ba084a9a348e': 'Barra'
            };
            comercialData = unidade !== 'todos' 
              ? data.filter((d: any) => d.unidade === unidadeMap[unidade])
              : data;
          }
        }

        if (comercialData.length > 0) {
          // Campos diferentes dependendo da fonte
          const leads = comercialData.reduce((acc: number, d: any) => acc + (d.total_leads || 0), 0);
          const experimentais = comercialData.reduce((acc: number, d: any) => 
            acc + (d.experimentais_realizadas || d.aulas_experimentais || 0), 0);
          const matriculas = comercialData.reduce((acc: number, d: any) => 
            acc + (d.novas_matriculas || d.novas_matriculas_total || 0), 0);
          const taxaConversao = experimentais > 0 ? (matriculas / experimentais) * 100 : 0;
          const ticketPassaporteTotal = comercialData.reduce((acc: number, d: any) => 
            acc + parseFloat(d.ticket_medio_passaporte || 0), 0);
          const ticketPassaporte = comercialData.length > 0 ? ticketPassaporteTotal / comercialData.length : 0;

          setDadosComercial({
            leads_mes: leads,
            experimentais_realizadas: experimentais,
            taxa_conversao: taxaConversao,
            ticket_passaporte: ticketPassaporte
          });

          // Funil comercial
          setFunilComercial([
            { etapa: 'Leads', valor: leads, cor: '#3b82f6' },
            { etapa: 'Experimentais', valor: experimentais, cor: '#8b5cf6' },
            { etapa: 'Matrículas', valor: matriculas, cor: '#10b981' }
          ]);
        } else {
          // Sem dados comerciais para o período
          setDadosComercial(null);
          setFunilComercial([]);
        }

        // ===== DADOS DE PROFESSORES =====
        // Usar MESMAS fontes da aba Professores (TabProfessoresNew.tsx):
        // 1. vw_kpis_professor_completo - carteira atual, ticket, média alunos/turma
        // 2. professores_performance - renovações, conversão (filtrado por ano)
        
        // Buscar dados de qualidade/carteira atual
        const { data: qualidadeData } = await supabase
          .from('vw_kpis_professor_completo')
          .select('*');

        // Buscar dados de performance (renovações, conversão)
        const { data: performanceData } = await supabase
          .from('professores_performance')
          .select('*')
          .eq('ano', ano);

        // Calcular KPIs
        let totalProfs = 0;
        let mediaAlunosProf = 0;
        let taxaRenovacao = 0;
        let mediaAlunosTurma = 0;

        if (qualidadeData && qualidadeData.length > 0) {
          // Filtrar por unidade se necessário
          const qualidadeFiltrada = unidade !== 'todos' 
            ? qualidadeData.filter((q: any) => q.unidade_id === unidade)
            : qualidadeData;
          
          // Total de professores com carteira > 0
          const profsComCarteira = qualidadeFiltrada.filter((q: any) => (q.carteira_alunos || 0) > 0);
          totalProfs = profsComCarteira.length;
          
          // Total de alunos e média
          const totalAlunos = profsComCarteira.reduce((acc: number, q: any) => acc + (q.carteira_alunos || 0), 0);
          mediaAlunosProf = totalProfs > 0 ? totalAlunos / totalProfs : 0;
          
          // Média alunos por turma
          const profsComTurma = qualidadeFiltrada.filter((q: any) => (q.media_alunos_turma || 0) > 0);
          mediaAlunosTurma = profsComTurma.length > 0 
            ? profsComTurma.reduce((acc: number, q: any) => acc + Number(q.media_alunos_turma || 0), 0) / profsComTurma.length 
            : 0;
        }

        // Taxa de renovação vem de professores_performance (mesma lógica da aba Professores)
        if (performanceData && performanceData.length > 0) {
          const renovacoes = performanceData.reduce((acc: number, p: any) => acc + (p.renovacoes || 0), 0);
          const contratosVencer = performanceData.reduce((acc: number, p: any) => acc + (p.contratos_vencer || 0), 0);
          taxaRenovacao = contratosVencer > 0 ? (renovacoes / contratosVencer) * 100 : 0;
        }

        setDadosProfessores({
          total_professores: totalProfs,
          media_alunos_professor: mediaAlunosProf,
          taxa_renovacao: taxaRenovacao,
          media_alunos_turma: mediaAlunosTurma
        });

        // ===== EVOLUÇÃO DE ALUNOS (12 meses) =====
        const { data: evolucaoData } = await supabase
          .from('dados_mensais')
          .select('ano, mes, alunos_pagantes')
          .gte('ano', ano - 1)
          .order('ano', { ascending: true })
          .order('mes', { ascending: true });

        if (evolucaoData) {
          const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
          const agrupado = evolucaoData.reduce((acc: Record<string, number>, d: any) => {
            const key = `${mesesNomes[d.mes - 1]}/${String(d.ano).slice(-2)}`;
            acc[key] = (acc[key] || 0) + (d.alunos_pagantes || 0);
            return acc;
          }, {});

          const evolucao = Object.entries(agrupado)
            .slice(-12)
            .map(([mes, valor]) => ({ mes, valor: valor as number }));

          setEvolucaoAlunos(evolucao);
        }

        // ===== RESUMO POR UNIDADE (do período selecionado) =====
        const { data: unidadesData } = await supabase
          .from('unidades')
          .select('id, nome')
          .eq('ativo', true);

        if (unidadesData) {
          // Buscar dados_mensais para cada unidade no período
          const { data: dadosMensaisUnidades } = await supabase
            .from('dados_mensais')
            .select('*')
            .eq('ano', ano)
            .gte('mes', mes)
            .lte('mes', mesFim);

          if (dadosMensaisUnidades) {
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
                tempo_medio: 0 // TODO: calcular tempo médio
              };
            });

            setResumoUnidades(resumo);
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
          />
        </div>
      )}

      {/* ===== LINHA 1: GESTÃO ===== */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-5 h-5 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Gestão</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            icon={Users}
            label="Alunos Ativos"
            value={dadosGestao?.alunos_ativos || totais.alunosAtivos}
            target={metas.alunos_pagantes}
            format="number"
            variant="cyan"
          />
          <KPICard
            icon={UserPlus}
            label="Matrículas (Mês)"
            value={dadosGestao?.matriculas_mes ?? '--'}
            target={metas.matriculas}
            format="number"
            subvalue={!dadosGestao ? 'Aguardando dados' : undefined}
            variant="emerald"
          />
          <KPICard
            icon={UserMinus}
            label="Evasões (Mês)"
            value={dadosGestao?.evasoes_mes ?? '--'}
            subvalue={!dadosGestao ? 'Aguardando dados' : undefined}
            variant="rose"
            inverterCor={true}
          />
          <KPICard
            icon={DollarSign}
            label="Ticket Médio Parcelas"
            value={dadosGestao?.ticket_medio ?? ticketMedioGeral}
            target={metas.ticket_medio}
            format="currency"
            variant="amber"
          />
        </div>
      </div>

      {/* ===== LINHA 2: COMERCIAL ===== */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-5 h-5 text-violet-400" />
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Comercial</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            icon={Phone}
            label="Leads (Mês)"
            value={dadosComercial?.leads_mes ?? '--'}
            target={metas.leads}
            format="number"
            subvalue={!dadosComercial ? 'Aguardando dados' : undefined}
            variant="cyan"
          />
          <KPICard
            icon={Calendar}
            label="Experimentais Realizadas"
            value={dadosComercial?.experimentais_realizadas ?? '--'}
            target={metas.experimentais}
            format="number"
            subvalue={!dadosComercial ? 'Aguardando dados' : undefined}
            variant="violet"
          />
          <KPICard
            icon={Percent}
            label="Taxa Conversão"
            value={dadosComercial?.taxa_conversao ?? '--'}
            format="percent"
            subvalue={!dadosComercial ? 'Aguardando dados' : undefined}
            variant="emerald"
          />
          <KPICard
            icon={Ticket}
            label="Ticket Médio Passaporte"
            value={dadosComercial?.ticket_passaporte ?? '--'}
            format="currency"
            subvalue={!dadosComercial ? 'Aguardando dados' : undefined}
            variant="amber"
          />
        </div>
      </div>

      {/* ===== LINHA 3: PROFESSORES ===== */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Award className="w-5 h-5 text-amber-400" />
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Professores</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            icon={Users}
            label="Total Professores"
            value={dadosProfessores?.total_professores ?? '--'}
            format="number"
            subvalue={dadosProfessores ? 'ativos' : 'Aguardando dados'}
            variant="cyan"
          />
          <KPICard
            icon={GraduationCap}
            label="Média Alunos/Professor"
            value={dadosProfessores?.media_alunos_professor ?? '--'}
            format="number"
            subvalue={!dadosProfessores ? 'Aguardando dados' : undefined}
            variant="violet"
          />
          <KPICard
            icon={RefreshCw}
            label="Taxa Renovação"
            value={dadosProfessores?.taxa_renovacao ?? '--'}
            target={metas.taxa_renovacao}
            format="percent"
            subvalue={!dadosProfessores ? 'Aguardando dados' : undefined}
            variant="emerald"
          />
          <KPICard
            icon={Target}
            label="Média Alunos/Turma"
            value={dadosProfessores?.media_alunos_turma ?? '--'}
            format="number"
            subvalue={dadosProfessores?.media_alunos_turma ? 'Pilar financeiro' : 'Aguardando Emusys'}
            variant="rose"
          />
        </div>
      </div>

      {/* Alertas e Ações Rápidas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alertas */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Alertas Ativos
            </h3>
            <span className="text-xs text-gray-500">Últimos 30 dias</span>
          </div>
          
          {alertas.length > 0 ? (
            <div className="space-y-3">
              {alertas.map((alerta, idx) => (
                <div 
                  key={idx}
                  className="flex items-start gap-3 p-3 bg-slate-900/50 rounded-xl border border-slate-700/30"
                >
                  <div className="w-2 h-2 mt-2 rounded-full bg-amber-400" />
                  <div>
                    <p className="text-sm text-white">{alerta.descricao}</p>
                    <p className="text-xs text-gray-500">{alerta.unidade}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum alerta ativo</p>
            </div>
          )}
        </div>

        {/* Ações Rápidas */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Ações Rápidas
          </h3>
          
          <div className="grid grid-cols-2 gap-3">
            <ActionButton
              icon={Phone}
              label="Novo Lead"
              href="/app/entrada/lead"
              color="from-blue-500 to-cyan-500"
            />
            <ActionButton
              icon={GraduationCap}
              label="Nova Matrícula"
              href="/app/entrada/matricula"
              color="from-emerald-500 to-green-500"
            />
            <ActionButton
              icon={UserMinus}
              label="Registrar Evasão"
              href="/app/entrada/evasao"
              color="from-rose-500 to-red-500"
            />
            <ActionButton
              icon={RefreshCw}
              label="Renovação"
              href="/app/entrada/renovacao"
              color="from-purple-500 to-violet-500"
            />
            <ActionButton
              icon={FileText}
              label="Relatório Diário"
              href="/app/relatorios/diario"
              color="from-amber-500 to-orange-500"
              className="col-span-2"
            />
          </div>
        </div>
      </div>

      {/* ===== GRÁFICOS ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Evolução de Alunos */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
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
    </div>
  );
}


// Componente Action Button
function ActionButton({ 
  icon: Icon, 
  label, 
  href, 
  color,
  className = ''
}: {
  icon: any;
  label: string;
  href: string;
  color: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={`flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r ${color} text-white font-medium hover:opacity-90 transition-opacity ${className}`}
    >
      <Icon className="w-5 h-5" />
      <span>{label}</span>
    </a>
  );
}

export default DashboardPage;
