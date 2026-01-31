import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import {
  AlertTriangle, TrendingUp, TrendingDown, Users, Target, Award,
  ChevronRight, Search, Filter, Sparkles, Calendar, CheckCircle2,
  XCircle, Clock, BarChart3, Loader2, Heart, FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/toast';
import { useCompetenciaFiltro } from '@/hooks/useCompetenciaFiltro';
import { ModalDetalhesProfessorPerformance } from './ModalDetalhesProfessorPerformance';
import { ModalNovaMeta } from './ModalNovaMeta';
import { ModalNovaAcao } from './ModalNovaAcao';
import { ModalRelatorioCoordenacao } from './ModalRelatorioCoordenacao';
import { PlanoAcaoEquipe } from './PlanoAcaoEquipe';
import { calcularHealthScore } from '@/hooks/useHealthScore';
import { HealthScoreCard } from './HealthScoreCard';

interface ProfessorPerformance {
  id: number;
  nome: string;
  foto_url: string | null;
  especialidades: string[];
  unidades: { id: string; codigo: string; nome: string }[];
  total_alunos: number;
  total_turmas: number;
  media_alunos_turma: number;
  taxa_retencao: number;
  taxa_conversao: number;
  nps: number | null;
  taxa_presenca: number;
  evasoes_mes: number;
  status: 'critico' | 'atencao' | 'excelente';
  tendencia_media?: 'subindo' | 'estavel' | 'caindo';
  health_score: number;
  health_status: 'critico' | 'atencao' | 'saudavel';
  fator_demanda_ponderado: number; // Fator de demanda ponderado pela composição da carteira
}

interface AlertaPerformance {
  tipo: 'critico' | 'atencao' | 'excelente';
  quantidade: number;
  descricao: string;
}

interface Props {
  unidadeAtual: UnidadeId;
}

export function TabPerformanceProfessores({ unidadeAtual }: Props) {
  const toast = useToast();
  
  // Hook de competência (Mês/Trim/Sem/Ano)
  const competenciaFiltro = useCompetenciaFiltro();
  const ano = competenciaFiltro.filtro.ano;
  const mes = competenciaFiltro.filtro.mes;
  const competencia = `${ano}-${String(mes).padStart(2, '0')}`;
  
  const [professores, setProfessores] = useState<ProfessorPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [filtroBusca, setFiltroBusca] = useState('');
  
  const [modalDetalhes, setModalDetalhes] = useState<{ open: boolean; professor: ProfessorPerformance | null }>({
    open: false,
    professor: null
  });
  const [modalMeta, setModalMeta] = useState<{ open: boolean; professorId: number | null }>({
    open: false,
    professorId: null
  });
  const [modalAcao, setModalAcao] = useState<{ open: boolean; professorId: number | null }>({
    open: false,
    professorId: null
  });
  const [modalRelatorio, setModalRelatorio] = useState(false);

  useEffect(() => {
    carregarDados();
  }, [unidadeAtual, ano, mes]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      // Extrair ano e mês da competência (formato: YYYY-MM)
      const [anoFiltro, mesFiltro] = competencia.split('-').map(Number);

      // Buscar professores ativos
      let query = supabase
        .from('professores')
        .select('id, nome, foto_url, ativo')
        .eq('ativo', true)
        .order('nome');

      const { data: professoresData, error: profError } = await query;
      if (profError) throw profError;

      // Verificar se é período atual ou histórico
      const hoje = new Date();
      const anoAtual = hoje.getFullYear();
      const mesAtual = hoje.getMonth() + 1;
      const isPeriodoAtual = anoFiltro === anoAtual && mesFiltro === mesAtual;

      let kpisData: any[] = [];

      if (isPeriodoAtual) {
        // PERÍODO ATUAL: usar view em tempo real
        let kpisQuery = supabase
          .from('vw_kpis_professor_mensal')
          .select('*');
        
        if (unidadeAtual !== 'todos') {
          kpisQuery = kpisQuery.eq('unidade_id', unidadeAtual);
        }
        
        const { data } = await kpisQuery;
        kpisData = data || [];
      } else {
        // PERÍODO HISTÓRICO: usar experimentais_professor_mensal + dados calculados
        let historicoQuery = supabase
          .from('experimentais_professor_mensal')
          .select('*')
          .eq('ano', anoFiltro)
          .eq('mes', mesFiltro);

        if (unidadeAtual !== 'todos') {
          historicoQuery = historicoQuery.eq('unidade_id', unidadeAtual);
        }

        const { data: historicoData } = await historicoQuery;
        
        if (historicoData && historicoData.length > 0) {
          // Transformar dados históricos para o formato esperado
          kpisData = historicoData.map((d: any) => ({
            professor_id: d.professor_id,
            unidade_id: d.unidade_id,
            ano: d.ano,
            mes: d.mes,
            experimentais: d.experimentais || 0,
            matriculas: d.matriculas || 0,
            taxa_conversao: d.experimentais > 0 ? ((d.matriculas || 0) / d.experimentais) * 100 : 0,
            // Campos que não temos no histórico - usar valores padrão
            carteira_alunos: 0,
            ticket_medio: 0,
            media_presenca: 0,
            taxa_faltas: 0,
            mrr_carteira: 0,
            media_alunos_turma: 0,
            renovacoes: 0,
            nao_renovacoes: 0,
            taxa_renovacao: 0,
            evasoes: 0,
            mrr_perdido: 0,
          }));
        }
      }

      // Buscar KPIs históricos para calcular tendências (filtrado por unidade se selecionada)
      let historicoQuery = supabase
        .from('vw_kpis_professor_mensal')
        .select('professor_id, ano, mes, media_alunos_turma, unidade_id')
        .gte('ano', ano - 1)
        .order('ano', { ascending: false })
        .order('mes', { ascending: false });
      
      if (unidadeAtual !== 'todos') {
        historicoQuery = historicoQuery.eq('unidade_id', unidadeAtual);
      }
      
      const { data: kpisHistorico } = await historicoQuery;

      // Buscar fator de demanda ponderado por professor
      let fatorDemandaQuery = supabase
        .from('vw_fator_demanda_professor')
        .select('professor_id, fator_demanda_ponderado, total_alunos, unidade_id');
      
      if (unidadeAtual !== 'todos') {
        fatorDemandaQuery = fatorDemandaQuery.eq('unidade_id', unidadeAtual);
      }
      
      const { data: fatoresDemanda } = await fatorDemandaQuery;

      // Buscar relacionamentos de unidades
      const { data: unidadesRelData } = await supabase
        .from('professores_unidades')
        .select('professor_id, unidade_id, unidades:unidade_id (nome, codigo)');

      // Buscar relacionamentos de cursos
      const { data: cursosRelData } = await supabase
        .from('professores_cursos')
        .select('professor_id, curso_id, cursos:curso_id (nome)');

      // Buscar turmas da view vw_turmas_implicitas (filtrado por unidade se selecionada)
      let turmasQuery = supabase
        .from('vw_turmas_implicitas')
        .select('professor_id, total_alunos, unidade_id');
      
      if (unidadeAtual !== 'todos') {
        turmasQuery = turmasQuery.eq('unidade_id', unidadeAtual);
      }
      
      const { data: turmasImplicitas } = await turmasQuery;

      // Buscar turmas explícitas (filtrado por unidade se selecionada)
      let turmasExplicitasQuery = supabase
        .from('turmas_explicitas')
        .select('professor_id, id, unidade_id')
        .eq('ativo', true);
      
      if (unidadeAtual !== 'todos') {
        turmasExplicitasQuery = turmasExplicitasQuery.eq('unidade_id', unidadeAtual);
      }
      
      const { data: turmasExplicitas } = await turmasExplicitasQuery;

      // Buscar alunos de turmas explícitas (filtrado por unidade via turmas_explicitas)
      let alunosTurmasQuery = supabase
        .from('turmas_alunos')
        .select('turma_id, aluno_id, turmas_explicitas!inner(professor_id, unidade_id)')
        .eq('turmas_explicitas.ativo', true);
      
      if (unidadeAtual !== 'todos') {
        alunosTurmasQuery = alunosTurmasQuery.eq('turmas_explicitas.unidade_id', unidadeAtual);
      }
      
      const { data: alunosTurmasExplicitas } = await alunosTurmasQuery;

      // Criar mapa de KPIs por professor
      const kpisPorProfessor = new Map<number, any>();
      kpisData?.forEach(kpi => {
        if (!kpisPorProfessor.has(kpi.professor_id)) {
          kpisPorProfessor.set(kpi.professor_id, kpi);
        }
      });

      // Criar mapa de histórico para calcular tendências
      const historicoMap = new Map<number, any[]>();
      kpisHistorico?.forEach(h => {
        if (!historicoMap.has(h.professor_id)) {
          historicoMap.set(h.professor_id, []);
        }
        historicoMap.get(h.professor_id)!.push(h);
      });

      // Criar mapa de fator de demanda ponderado por professor
      const fatorDemandaMap = new Map<number, number>();
      fatoresDemanda?.forEach(f => {
        if (!fatorDemandaMap.has(f.professor_id)) {
          fatorDemandaMap.set(f.professor_id, Number(f.fator_demanda_ponderado) || 1.0);
        }
      });

      // Montar mapas de contagens
      const turmasPorProfessor = new Map<number, number>();
      const alunosPorProfessor = new Map<number, number>();
      const totalAlunosTurmasPorProfessor = new Map<number, number[]>();

      // Processar turmas implícitas
      turmasImplicitas?.forEach(t => {
        const profId = t.professor_id;
        turmasPorProfessor.set(profId, (turmasPorProfessor.get(profId) || 0) + 1);
        alunosPorProfessor.set(profId, (alunosPorProfessor.get(profId) || 0) + (t.total_alunos || 0));
        const turmasAlunos = totalAlunosTurmasPorProfessor.get(profId) || [];
        turmasAlunos.push(t.total_alunos || 0);
        totalAlunosTurmasPorProfessor.set(profId, turmasAlunos);
      });

      // Processar turmas explícitas
      const alunosPorTurmaExplicita = new Map<number, number>();
      alunosTurmasExplicitas?.forEach(a => {
        const turmaId = a.turma_id;
        alunosPorTurmaExplicita.set(turmaId, (alunosPorTurmaExplicita.get(turmaId) || 0) + 1);
      });

      turmasExplicitas?.forEach(t => {
        const profId = t.professor_id;
        const alunosTurma = alunosPorTurmaExplicita.get(t.id) || 0;
        turmasPorProfessor.set(profId, (turmasPorProfessor.get(profId) || 0) + 1);
        alunosPorProfessor.set(profId, (alunosPorProfessor.get(profId) || 0) + alunosTurma);
        const turmasAlunos = totalAlunosTurmasPorProfessor.get(profId) || [];
        turmasAlunos.push(alunosTurma);
        totalAlunosTurmasPorProfessor.set(profId, turmasAlunos);
      });

      // Montar professores com métricas
      const professoresCompletos: ProfessorPerformance[] = (professoresData || [])
        .map(prof => {
          const unidadesProf = unidadesRelData?.filter(u => u.professor_id === prof.id).map(u => ({
            id: u.unidade_id,
            codigo: (u.unidades as any)?.codigo || '',
            nome: (u.unidades as any)?.nome || ''
          })) || [];

          const cursosProf = cursosRelData?.filter(c => c.professor_id === prof.id).map(c => 
            (c.cursos as any)?.nome || ''
          ).filter(Boolean) || [];

          // Buscar KPIs reais do professor
          const kpis = kpisPorProfessor.get(prof.id);
          
          // Usar dados reais ou fallback para contagem manual
          const totalTurmas = turmasPorProfessor.get(prof.id) || 0;
          const totalAlunos = kpis?.carteira_alunos || alunosPorProfessor.get(prof.id) || 0;
          
          // Média de alunos por turma: usar da view se disponível, senão calcular
          let mediaAlunosTurma = 0;
          if (kpis?.media_alunos_turma && Number(kpis.media_alunos_turma) > 0) {
            mediaAlunosTurma = Number(kpis.media_alunos_turma);
          } else {
            const turmasAlunos = totalAlunosTurmasPorProfessor.get(prof.id) || [];
            mediaAlunosTurma = turmasAlunos.length > 0 
              ? turmasAlunos.reduce((sum, n) => sum + n, 0) / turmasAlunos.length 
              : 0;
          }

          // Métricas REAIS da view vw_kpis_professor_mensal
          const taxaPresenca = kpis?.media_presenca ? Number(kpis.media_presenca) : 0;
          const taxaConversao = kpis?.taxa_conversao ? Number(kpis.taxa_conversao) : 0;
          const nps = kpis?.nps_medio ? Number(kpis.nps_medio) : null;
          const evasoesMes = kpis?.evasoes || 0;
          
          // Taxa de retenção = 100 - taxa de cancelamento
          const taxaRetencao = kpis?.taxa_cancelamento 
            ? 100 - Number(kpis.taxa_cancelamento) 
            : (totalAlunos > 0 ? 100 : 0);

          // Calcular tendência da média de alunos/turma baseado no histórico real
          let tendencia: 'subindo' | 'estavel' | 'caindo' = 'estavel';
          const historico = historicoMap.get(prof.id) || [];
          if (historico.length >= 2) {
            const atual = Number(historico[0]?.media_alunos_turma || 0);
            const anterior = Number(historico[1]?.media_alunos_turma || 0);
            if (atual > anterior + 0.1) tendencia = 'subindo';
            else if (atual < anterior - 0.1) tendencia = 'caindo';
          }

          // Calcular Health Score V2 usando os KPIs reais
          const healthResult = calcularHealthScore({
            mediaTurma: mediaAlunosTurma,
            retencao: taxaRetencao,
            conversao: taxaConversao,
            presenca: taxaPresenca,
            evasoes: evasoesMes,
            taxaCrescimentoAjustada: 0, // TODO: buscar da view vw_taxa_crescimento_professor
            taxaEvasao: totalAlunos > 0 ? (evasoesMes / totalAlunos) * 100 : 0,
            carteiraAlunos: totalAlunos
          });

          // Determinar status baseado no Health Score
          let status: 'critico' | 'atencao' | 'excelente' = 'excelente';
          if (healthResult.status === 'critico' || taxaRetencao < 70 || mediaAlunosTurma < 1.3 || evasoesMes >= 3) {
            status = 'critico';
          } else if (healthResult.status === 'atencao' || taxaRetencao < 95 || mediaAlunosTurma < 1.5 || evasoesMes >= 1 || taxaPresenca < 80) {
            status = 'atencao';
          }

          // Obter fator de demanda ponderado do mapa
          const fatorDemandaPonderado = fatorDemandaMap.get(prof.id) || 1.0;

          return {
            id: prof.id,
            nome: prof.nome,
            foto_url: prof.foto_url,
            especialidades: cursosProf,
            unidades: unidadesProf,
            total_alunos: totalAlunos,
            total_turmas: totalTurmas,
            media_alunos_turma: Math.round(mediaAlunosTurma * 100) / 100,
            taxa_retencao: Math.round(taxaRetencao * 10) / 10,
            taxa_conversao: Math.round(taxaConversao * 10) / 10,
            nps: nps ? Math.round(nps * 10) / 10 : null,
            taxa_presenca: Math.round(taxaPresenca * 10) / 10,
            evasoes_mes: evasoesMes,
            status,
            tendencia_media: tendencia,
            health_score: healthResult.score,
            health_status: healthResult.status,
            fator_demanda_ponderado: Math.round(fatorDemandaPonderado * 100) / 100
          };
        })
        .filter(p => {
          // Filtrar por unidade se necessário
          if (unidadeAtual !== 'todos') {
            return p.unidades.some(u => u.id === unidadeAtual);
          }
          return true;
        });

      setProfessores(professoresCompletos);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados de performance');
    } finally {
      setLoading(false);
    }
  };

  // Filtrar e ordenar professores
  const professoresFiltrados = useMemo(() => {
    let resultado = [...professores];

    if (filtroStatus !== 'todos') {
      resultado = resultado.filter(p => p.status === filtroStatus);
    }

    if (filtroBusca) {
      const termo = filtroBusca.toLowerCase();
      resultado = resultado.filter(p => p.nome.toLowerCase().includes(termo));
    }

    // Ordenar por Health Score (maior para menor)
    resultado.sort((a, b) => b.health_score - a.health_score);

    return resultado;
  }, [professores, filtroStatus, filtroBusca]);

  // Calcular alertas
  const alertas = useMemo<AlertaPerformance[]>(() => {
    const criticos = professores.filter(p => p.status === 'critico');
    const atencao = professores.filter(p => p.status === 'atencao');
    const excelentes = professores.filter(p => p.status === 'excelente');

    return [
      { tipo: 'critico', quantidade: criticos.length, descricao: 'Retenção ou média crítica' },
      { tipo: 'atencao', quantidade: atencao.length, descricao: 'Métricas abaixo da meta' },
      { tipo: 'excelente', quantidade: excelentes.length, descricao: 'Todas metas atingidas' }
    ];
  }, [professores]);

  // Rankings
  const rankings = useMemo(() => {
    const comConversao = professores.filter(p => p.total_alunos > 0);
    const comTurmas = professores.filter(p => p.total_turmas > 0);

    return {
      topConversao: [...comConversao].sort((a, b) => b.taxa_conversao - a.taxa_conversao)[0],
      topRetencao: [...comConversao].sort((a, b) => b.taxa_retencao - a.taxa_retencao)[0],
      topMediaTurma: [...comTurmas].sort((a, b) => b.media_alunos_turma - a.media_alunos_turma)[0]
    };
  }, [professores]);

  // Métricas gerais para o Plano de Ação da Equipe
  const metricasGerais = useMemo(() => {
    const totalAlunos = professores.reduce((acc, p) => acc + p.total_alunos, 0);
    const totalTurmas = professores.reduce((acc, p) => acc + p.total_turmas, 0);
    const totalEvasoes = professores.reduce((acc, p) => acc + p.evasoes_mes, 0);

    return {
      total_professores: professores.length,
      total_alunos: totalAlunos,
      media_geral_turma: totalTurmas > 0 ? totalAlunos / totalTurmas : 0,
      taxa_retencao_media: professores.length > 0 
        ? professores.reduce((acc, p) => acc + p.taxa_retencao, 0) / professores.length 
        : 0,
      taxa_conversao_media: professores.length > 0 
        ? professores.reduce((acc, p) => acc + p.taxa_conversao, 0) / professores.length 
        : 0,
      nps_medio: 0, // DEPRECATED - mantido para compatibilidade
      total_evasoes: totalEvasoes,
      professores_criticos: professores.filter(p => p.status === 'critico').length,
      professores_atencao: professores.filter(p => p.status === 'atencao').length,
      professores_excelentes: professores.filter(p => p.status === 'excelente').length
    };
  }, [professores]);

  // Health Score médio da equipe
  const healthScoreEquipe = useMemo(() => {
    if (professores.length === 0) return { media: 0, status: 'atencao' as const };
    const soma = professores.reduce((acc, p) => acc + p.health_score, 0);
    const media = soma / professores.length;
    const status = media >= 70 ? 'saudavel' : media >= 40 ? 'atencao' : 'critico';
    return { media: Math.round(media * 10) / 10, status };
  }, [professores]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critico': return 'text-red-400 bg-red-500/20 border-red-500/30';
      case 'atencao': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      case 'excelente': return 'text-green-400 bg-green-500/20 border-green-500/30';
      default: return 'text-slate-400 bg-slate-500/20 border-slate-500/30';
    }
  };

  const getMetricaColor = (valor: number, limites: { critico: number; atencao: number }, inverso = false) => {
    if (inverso) {
      if (valor >= limites.atencao) return 'text-red-400';
      if (valor >= limites.critico) return 'text-yellow-400';
      return 'text-green-400';
    }
    if (valor < limites.critico) return 'text-red-400';
    if (valor < limites.atencao) return 'text-yellow-400';
    return 'text-green-400';
  };

  const getIniciais = (nome: string) => {
    return nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  };

  const getGradientByStatus = (status: string) => {
    switch (status) {
      case 'critico': return 'from-red-400 to-red-600';
      case 'atencao': return 'from-yellow-400 to-orange-500';
      case 'excelente': return 'from-green-400 to-emerald-600';
      default: return 'from-slate-400 to-slate-600';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Alertas de Performance */}
      <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400" />
          <h2 className="font-semibold text-white">Alertas de Performance</h2>
          <span className="text-xs text-slate-400 ml-auto">
            Atualizado {format(new Date(), "HH:mm", { locale: ptBR })}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {alertas.map((alerta) => (
            <div
              key={alerta.tipo}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 border cursor-pointer hover:opacity-80 transition ${getStatusColor(alerta.tipo)}`}
              onClick={() => setFiltroStatus(alerta.tipo)}
            >
              <span className="text-2xl">
                {alerta.tipo === 'critico' ? '🔴' : alerta.tipo === 'atencao' ? '🟡' : '🟢'}
              </span>
              <div>
                <p className="font-medium text-sm">
                  {alerta.quantidade} professor{alerta.quantidade !== 1 ? 'es' : ''} {alerta.tipo === 'critico' ? 'crítico' : alerta.tipo === 'atencao' ? 'atenção' : 'excelente'}{alerta.quantidade !== 1 ? 's' : ''}
                </p>
                <p className="text-xs opacity-70">{alerta.descricao}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ranking Rápido + Health Score com Gauge */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        {/* Top Conversão */}
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 h-[115px] flex flex-col justify-center">
          <p className="text-xs text-slate-400 mb-1">🏆 Top Conversão</p>
          {rankings.topConversao ? (
            <>
              <p className="text-white font-semibold text-sm truncate">{rankings.topConversao.nome}</p>
              <p className="text-green-400 text-sm">{rankings.topConversao.taxa_conversao.toFixed(1)}% conversão</p>
            </>
          ) : (
            <p className="text-slate-500 text-sm">-</p>
          )}
        </div>

        {/* Top Retenção */}
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 h-[115px] flex flex-col justify-center">
          <p className="text-xs text-slate-400 mb-1">🏆 Top Retenção</p>
          {rankings.topRetencao ? (
            <>
              <p className="text-white font-semibold text-sm truncate">{rankings.topRetencao.nome}</p>
              <p className="text-green-400 text-sm">{rankings.topRetencao.taxa_retencao.toFixed(1)}% retenção</p>
            </>
          ) : (
            <p className="text-slate-500 text-sm">-</p>
          )}
        </div>

        {/* HEALTH SCORE COM GAUGE - DESTAQUE NO CENTRO */}
        <div className={`bg-slate-900 rounded-2xl p-4 border-2 ${
          healthScoreEquipe.status === 'saudavel' 
            ? 'border-violet-500/50' 
            : healthScoreEquipe.status === 'atencao'
            ? 'border-amber-500/50'
            : 'border-rose-500/50'
        } shadow-lg row-span-1`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                healthScoreEquipe.status === 'saudavel' 
                  ? 'bg-violet-500/20' 
                  : healthScoreEquipe.status === 'atencao'
                  ? 'bg-amber-500/20'
                  : 'bg-rose-500/20'
              }`}>
                <Heart className={`w-4 h-4 ${
                  healthScoreEquipe.status === 'saudavel' 
                    ? 'text-violet-400' 
                    : healthScoreEquipe.status === 'atencao'
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`} />
              </div>
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                Health Score
              </span>
            </div>
          </div>
          
          {/* GAUGE SVG */}
          <div className="flex flex-col items-center justify-center">
            <svg width="140" height="85" viewBox="0 0 180 110" className="overflow-visible">
              <defs>
                <linearGradient id="healthGaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#EF4444" />
                  <stop offset="45%" stopColor="#F59E0B" />
                  <stop offset="75%" stopColor="#84CC16" />
                  <stop offset="90%" stopColor="#22C55E" />
                  <stop offset="100%" stopColor="#22C55E" />
                </linearGradient>
              </defs>
              {/* Arco de Fundo */}
              <path d="M 15 90 A 75 75 0 0 1 165 90" fill="none" stroke="#1e293b" strokeWidth="16" strokeLinecap="round"/>
              {/* Arco Ativo com Gradiente */}
              <path d="M 15 90 A 75 75 0 0 1 165 90" fill="none" stroke="url(#healthGaugeGradient)" strokeWidth="16" strokeLinecap="round"/>
              {/* Ponteiro */}
              <g style={{
                transform: `rotate(${(healthScoreEquipe.media / 100) * 180 - 90}deg)`,
                transformOrigin: '90px 90px',
                transition: 'transform 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)'
              }}>
                <path d="M 87 90 L 90 30 L 93 90 Z" fill="#94a3b8"/>
                <circle cx="90" cy="90" r="5" fill="#94a3b8"/>
                <circle cx="90" cy="90" r="2" fill="white"/>
              </g>
            </svg>
            <div className="mt-[-12px] text-center z-10">
              <span className={`text-2xl font-black tracking-tighter ${
                healthScoreEquipe.status === 'saudavel' 
                  ? 'text-violet-400' 
                  : healthScoreEquipe.status === 'atencao'
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}>
                {healthScoreEquipe.media}
              </span>
              <p className="text-[8px] font-semibold text-slate-500 uppercase tracking-widest">
                Média Geral
              </p>
            </div>
          </div>
        </div>

        {/* Top Média Turma */}
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 h-[115px] flex flex-col justify-center">
          <p className="text-xs text-slate-400 mb-1">🏆 Top Média Turma</p>
          {rankings.topMediaTurma ? (
            <>
              <p className="text-white font-semibold text-sm truncate">{rankings.topMediaTurma.nome}</p>
              <p className="text-green-400 text-sm">{rankings.topMediaTurma.media_alunos_turma.toFixed(1)} alunos/turma</p>
            </>
          ) : (
            <p className="text-slate-500 text-sm">-</p>
          )}
        </div>
      </div>

      {/* Filtros e Relatório */}
      <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Filtros à esquerda */}
          <div className="flex items-center gap-3">
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="critico">🔴 Crítico</SelectItem>
                <SelectItem value="atencao">🟡 Atenção</SelectItem>
                <SelectItem value="excelente">🟢 Excelente</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar professor..."
                value={filtroBusca}
                onChange={(e) => setFiltroBusca(e.target.value)}
                className="pl-9 w-48"
              />
            </div>
            
            {/* Seletores de Ano e Mês */}
            <Select value={String(ano)} onValueChange={(v) => competenciaFiltro.setAno(Number(v))}>
              <SelectTrigger className="w-[100px]">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                {competenciaFiltro.anosDisponiveis.map(a => (
                  <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={String(mes)} onValueChange={(v) => competenciaFiltro.setMes(Number(v))}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent>
                {competenciaFiltro.MESES_CURTO.map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Botão Relatório à direita */}
          <button
            onClick={() => setModalRelatorio(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-cyan-500/20"
          >
            <FileText className="w-4 h-4" />
            Gerar Relatório Coordenação
          </button>
        </div>
      </div>

      {/* Tabela de Performance */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Professor</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">
                  <div className="flex items-center justify-center gap-1">
                    <Heart className="w-3 h-3 text-violet-400" />
                    <span>Health</span>
                  </div>
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">
                  <div className="flex items-center justify-center gap-1">
                    <TrendingUp className="w-3 h-3 text-amber-400" />
                    <span>Fator</span>
                  </div>
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Alunos</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Média/Turma</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Retenção</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Conversão</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Presença</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Evasões</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Status</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {professoresFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-400">
                    Nenhum professor encontrado
                  </td>
                </tr>
              ) : (
                professoresFiltrados.map((professor) => (
                  <tr
                    key={professor.id}
                    className={`hover:bg-slate-700/30 transition-colors cursor-pointer ${
                      professor.status === 'critico' ? 'bg-red-500/5' : ''
                    }`}
                    onClick={() => setModalDetalhes({ open: true, professor })}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getGradientByStatus(professor.status)} flex items-center justify-center text-white font-bold text-sm`}>
                          {professor.foto_url ? (
                            <img src={professor.foto_url} alt="" className="w-full h-full rounded-full object-cover" />
                          ) : (
                            getIniciais(professor.nome)
                          )}
                        </div>
                        <div>
                          <p className="text-white font-medium">{professor.nome}</p>
                          <p className="text-slate-400 text-xs">{professor.especialidades.slice(0, 2).join(', ')}</p>
                        </div>
                      </div>
                    </td>
                    {/* Health Score */}
                    <td className="text-center px-4 py-3">
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border ${
                        professor.health_status === 'saudavel' 
                          ? 'bg-emerald-900/30 border-emerald-700 text-emerald-400' 
                          : professor.health_status === 'atencao'
                          ? 'bg-amber-900/30 border-amber-700 text-amber-400'
                          : 'bg-rose-900/30 border-rose-700 text-rose-400'
                      }`}>
                        <span className="text-sm font-black">{Math.round(professor.health_score)}</span>
                      </div>
                    </td>
                    {/* Fator de Demanda Ponderado */}
                    <td className="text-center px-4 py-3">
                      <span className={`px-2 py-1 rounded-lg text-sm font-medium ${
                        professor.fator_demanda_ponderado <= 1.2 
                          ? 'bg-emerald-500/20 text-emerald-400' 
                          : professor.fator_demanda_ponderado <= 1.8
                          ? 'bg-cyan-500/20 text-cyan-400'
                          : professor.fator_demanda_ponderado <= 2.3
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-rose-500/20 text-rose-400'
                      }`}>
                        {professor.fator_demanda_ponderado.toFixed(1)}
                      </span>
                    </td>
                    <td className="text-center px-4 py-3 text-white">{professor.total_alunos}</td>
                    <td className="text-center px-4 py-3">
                      <span className={`font-medium ${getMetricaColor(professor.media_alunos_turma, { critico: 1.3, atencao: 1.5 })}`}>
                        {professor.media_alunos_turma.toFixed(1)}
                      </span>
                      {professor.tendencia_media && (
                        <span className={`ml-1 text-xs ${
                          professor.tendencia_media === 'subindo' ? 'text-green-400' : 
                          professor.tendencia_media === 'caindo' ? 'text-red-400' : 'text-slate-400'
                        }`}>
                          {professor.tendencia_media === 'subindo' ? '↑' : professor.tendencia_media === 'caindo' ? '↓' : ''}
                        </span>
                      )}
                    </td>
                    <td className="text-center px-4 py-3">
                      <span className={`font-medium ${getMetricaColor(professor.taxa_retencao, { critico: 70, atencao: 95 })}`}>
                        {professor.taxa_retencao.toFixed(0)}%
                      </span>
                    </td>
                    <td className="text-center px-4 py-3">
                      <span className={`font-medium ${getMetricaColor(professor.taxa_conversao, { critico: 70, atencao: 90 })}`}>
                        {professor.taxa_conversao.toFixed(0)}%
                      </span>
                    </td>
                    <td className="text-center px-4 py-3">
                      <span className={`font-medium ${getMetricaColor(professor.taxa_presenca, { critico: 70, atencao: 80 })}`}>
                        {professor.taxa_presenca.toFixed(0)}%
                      </span>
                    </td>
                    <td className="text-center px-4 py-3">
                      <span className={`font-medium ${getMetricaColor(professor.evasoes_mes, { critico: 1, atencao: 3 }, true)}`}>
                        {professor.evasoes_mes}
                      </span>
                    </td>
                    <td className="text-center px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(professor.status)}`}>
                        {professor.status === 'critico' ? 'Crítico' : professor.status === 'atencao' ? 'Atenção' : 'Excelente'}
                      </span>
                    </td>
                    <td className="text-center px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-blue-400 hover:text-blue-300"
                        onClick={() => setModalDetalhes({ open: true, professor })}
                      >
                        Ver
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-slate-700 text-sm text-slate-400">
          Mostrando {professoresFiltrados.length} de {professores.length} professores
        </div>
      </div>

      {/* Legenda de Métricas */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        <p className="text-xs text-slate-400 mb-3">📊 Referência de Metas</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
          <div>
            <p className="text-slate-300 font-medium">Média/Turma</p>
            <p className="text-red-400">🔴 &lt;1.3 Crítico</p>
            <p className="text-yellow-400">🟡 1.3-1.5 Atenção</p>
            <p className="text-green-400">🟢 &gt;1.5 Excelente</p>
          </div>
          <div>
            <p className="text-slate-300 font-medium">Retenção</p>
            <p className="text-red-400">🔴 &lt;70% Crítico</p>
            <p className="text-yellow-400">🟡 70-95% Regular</p>
            <p className="text-green-400">🟢 &gt;95% Excelente</p>
          </div>
          <div>
            <p className="text-slate-300 font-medium">Conversão</p>
            <p className="text-red-400">🔴 &lt;70% Ruim</p>
            <p className="text-yellow-400">🟡 70-90% Bom</p>
            <p className="text-green-400">🟢 &gt;90% Mestre</p>
          </div>
          <div>
            <p className="text-slate-300 font-medium">Presença</p>
            <p className="text-red-400">🔴 &lt;70% Crítico</p>
            <p className="text-yellow-400">🟡 70-80% Atenção</p>
            <p className="text-green-400">🟢 &gt;80% Ideal</p>
          </div>
        </div>
      </div>

      {/* Plano de Ação Inteligente - Equipe */}
      {professores.length > 0 && (
        <PlanoAcaoEquipe
          professores={professores.map(p => ({
            id: p.id,
            nome: p.nome,
            total_alunos: p.total_alunos,
            total_turmas: p.total_turmas,
            media_alunos_turma: p.media_alunos_turma,
            taxa_retencao: p.taxa_retencao,
            taxa_conversao: p.taxa_conversao,
            nps: p.nps,
            taxa_presenca: p.taxa_presenca,
            evasoes_mes: p.evasoes_mes,
            status: p.status,
            unidades: p.unidades.map(u => u.codigo)
          }))}
          metricas_gerais={metricasGerais}
          competencia={competencia}
          unidade_nome={unidadeAtual !== 'todos' ? unidadeAtual : undefined}
        />
      )}

      {/* Modais */}
      <ModalDetalhesProfessorPerformance
        open={modalDetalhes.open}
        onClose={() => setModalDetalhes({ open: false, professor: null })}
        professor={modalDetalhes.professor}
        competencia={competencia}
        onNovaMeta={(profId) => {
          setModalDetalhes({ open: false, professor: null });
          setModalMeta({ open: true, professorId: profId });
        }}
        onNovaAcao={(profId) => {
          setModalDetalhes({ open: false, professor: null });
          setModalAcao({ open: true, professorId: profId });
        }}
      />

      <ModalNovaMeta
        open={modalMeta.open}
        onClose={() => setModalMeta({ open: false, professorId: null })}
        professorId={modalMeta.professorId}
        onSave={() => {
          setModalMeta({ open: false, professorId: null });
          toast.success('Meta criada!', 'A meta foi cadastrada com sucesso');
        }}
      />

      <ModalNovaAcao
        open={modalAcao.open}
        onClose={() => setModalAcao({ open: false, professorId: null })}
        professorId={modalAcao.professorId}
        onSave={() => {
          setModalAcao({ open: false, professorId: null });
          toast.success('Ação agendada!', 'A ação foi cadastrada com sucesso');
        }}
      />

      <ModalRelatorioCoordenacao
        open={modalRelatorio}
        onOpenChange={setModalRelatorio}
        unidadeId={unidadeAtual !== 'todos' ? unidadeAtual : null}
        unidadeNome={unidadeAtual !== 'todos' ? ({
          '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'Campo Grande',
          '95553e96-971b-4590-a6eb-0201d013c14d': 'Recreio',
          '368d47f5-2d88-4475-bc14-ba084a9a348e': 'Barra'
        }[unidadeAtual] || unidadeAtual) : 'Consolidado'}
        ano={parseInt(competencia.split('-')[0])}
        mes={parseInt(competencia.split('-')[1])}
      />

      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
    </div>
  );
}
