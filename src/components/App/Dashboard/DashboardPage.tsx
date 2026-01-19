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
  const mes = competencia?.filtro?.mes || new Date().getMonth() + 1;
  const mesFim = competencia?.range?.mesFim || mes;
  const unidade = filtroAtivo || 'todos';
  
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
        // USAR MESMA FONTE da aba Gestão (TabGestao.tsx): vw_kpis_gestao_mensal
        // Esta view tem dados em TEMPO REAL, não depende de fechamento mensal
        let gestaoQuery = supabase
          .from('vw_kpis_gestao_mensal')
          .select('*');
        
        if (unidade !== 'todos') {
          gestaoQuery = gestaoQuery.eq('unidade_id', unidade);
        }

        const { data: gestaoData } = await gestaoQuery;
        
        if (gestaoData && gestaoData.length > 0) {
          // Consolidar dados de todas as unidades
          const consolidado = gestaoData.reduce((acc: any, d: any) => ({
            total_alunos_ativos: acc.total_alunos_ativos + (d.total_alunos_ativos || 0),
            total_alunos_pagantes: acc.total_alunos_pagantes + (d.total_alunos_pagantes || 0),
            novas_matriculas: acc.novas_matriculas + (d.novas_matriculas || 0),
            evasoes: acc.evasoes + (d.evasoes || 0),
            ticket_medio_sum: acc.ticket_medio_sum + (Number(d.ticket_medio) || 0),
            count: acc.count + 1
          }), { total_alunos_ativos: 0, total_alunos_pagantes: 0, novas_matriculas: 0, evasoes: 0, ticket_medio_sum: 0, count: 0 });

          setDadosGestao({
            alunos_ativos: consolidado.total_alunos_pagantes,
            matriculas_mes: consolidado.novas_matriculas,
            evasoes_mes: consolidado.evasoes,
            ticket_medio: consolidado.count > 0 ? consolidado.ticket_medio_sum / consolidado.count : 0
          });
        }

        // ===== DADOS COMERCIAIS =====
        // USAR MESMA FONTE da aba Comercial (TabComercialNew.tsx): vw_kpis_comercial_historico
        // Esta view tem dados consolidados por mês/ano
        // Para mês atual, pode não ter dados ainda - usar dados_comerciais como fallback
        
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;
        const isHistorico = ano < currentYear || (ano === currentYear && mes < currentMonth);

        let comercialData: any[] = [];
        
        if (isHistorico) {
          // Período histórico: usar vw_kpis_comercial_historico
          let comercialQuery = supabase
            .from('vw_kpis_comercial_historico')
            .select('*')
            .eq('ano', ano)
            .eq('mes', mes);

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
  }, [ano, mes, mesFim, unidade]);

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
            iconColor="text-cyan-400"
            iconBg="bg-cyan-500/20"
            value={dadosGestao?.alunos_ativos?.toLocaleString('pt-BR') || totais.alunosAtivos.toLocaleString('pt-BR')}
            label="Alunos Ativos"
          />
          <KPICard
            icon={UserPlus}
            iconColor="text-emerald-400"
            iconBg="bg-emerald-500/20"
            value={dadosGestao?.matriculas_mes?.toString() || '--'}
            label="Matrículas (Mês)"
            sublabel={!dadosGestao ? 'Aguardando dados' : undefined}
          />
          <KPICard
            icon={UserMinus}
            iconColor="text-rose-400"
            iconBg="bg-rose-500/20"
            value={dadosGestao?.evasoes_mes?.toString() || '--'}
            label="Evasões (Mês)"
            sublabel={!dadosGestao ? 'Aguardando dados' : undefined}
          />
          <KPICard
            icon={DollarSign}
            iconColor="text-yellow-400"
            iconBg="bg-yellow-500/20"
            value={dadosGestao ? formatCurrency(dadosGestao.ticket_medio) : `R$ ${ticketMedioGeral.toFixed(0)}`}
            label="Ticket Médio Parcelas"
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
            iconColor="text-blue-400"
            iconBg="bg-blue-500/20"
            value={dadosComercial?.leads_mes?.toLocaleString('pt-BR') || '--'}
            label="Leads (Mês)"
            sublabel={!dadosComercial ? 'Aguardando dados' : undefined}
          />
          <KPICard
            icon={Calendar}
            iconColor="text-violet-400"
            iconBg="bg-violet-500/20"
            value={dadosComercial?.experimentais_realizadas?.toString() || '--'}
            label="Experimentais Realizadas"
            sublabel={!dadosComercial ? 'Aguardando dados' : undefined}
          />
          <KPICard
            icon={Percent}
            iconColor="text-emerald-400"
            iconBg="bg-emerald-500/20"
            value={dadosComercial ? `${dadosComercial.taxa_conversao.toFixed(1)}%` : '--'}
            label="Taxa Conversão"
            sublabel={!dadosComercial ? 'Aguardando dados' : undefined}
          />
          <KPICard
            icon={Ticket}
            iconColor="text-amber-400"
            iconBg="bg-amber-500/20"
            value={dadosComercial ? formatCurrency(dadosComercial.ticket_passaporte) : '--'}
            label="Ticket Médio Passaporte"
            sublabel={!dadosComercial ? 'Aguardando dados' : undefined}
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
            iconColor="text-cyan-400"
            iconBg="bg-cyan-500/20"
            value={dadosProfessores?.total_professores?.toString() || '--'}
            label="Total Professores"
            sublabel={dadosProfessores ? 'ativos' : 'Aguardando dados'}
          />
          <KPICard
            icon={GraduationCap}
            iconColor="text-violet-400"
            iconBg="bg-violet-500/20"
            value={dadosProfessores ? dadosProfessores.media_alunos_professor.toFixed(1) : '--'}
            label="Média Alunos/Professor"
            sublabel={!dadosProfessores ? 'Aguardando dados' : undefined}
          />
          <KPICard
            icon={RefreshCw}
            iconColor="text-emerald-400"
            iconBg="bg-emerald-500/20"
            value={dadosProfessores ? `${dadosProfessores.taxa_renovacao.toFixed(1)}%` : '--'}
            label="Taxa Renovação"
            sublabel={!dadosProfessores ? 'Aguardando dados' : undefined}
          />
          <KPICard
            icon={Target}
            iconColor="text-rose-400"
            iconBg="bg-rose-500/20"
            value={dadosProfessores ? dadosProfessores.media_alunos_turma.toFixed(1) : '--'}
            label="Média Alunos/Turma"
            sublabel={dadosProfessores?.media_alunos_turma ? 'Pilar financeiro' : 'Aguardando Emusys'}
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

// Componente KPI Card
function KPICard({ 
  icon: Icon, 
  iconColor, 
  iconBg, 
  value, 
  label, 
  sublabel,
  trend, 
  trendValue 
}: {
  icon: any;
  iconColor: string;
  iconBg: string;
  value: string;
  label: string;
  sublabel?: string;
  trend?: 'up' | 'down';
  trendValue?: string;
}) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5 hover:border-cyan-500/30 transition-all">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        {trend && trendValue && (
          <div className={`flex items-center gap-1 text-xs font-medium ${
            trend === 'up' ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {trendValue}
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-sm text-gray-400">{label}</div>
      {sublabel && <div className="text-xs text-gray-500 mt-1">{sublabel}</div>}
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
