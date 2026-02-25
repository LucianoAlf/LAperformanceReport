import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  X, Target, Calendar, CheckCircle2, Clock, AlertTriangle,
  TrendingUp, TrendingDown, Sparkles, Loader2, Users, BarChart3, Brain, Heart, FileText, Copy, Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { JornadaProfessor } from './JornadaProfessor';
import { calcularHealthScore } from '@/hooks/useHealthScore';
import { DEFAULT_HEALTH_WEIGHTS } from './HealthScoreConfig';

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
  nps: number | null; // DEPRECATED - mantido para compatibilidade
  taxa_presenca: number;
  evasoes_mes: number;
  status: 'critico' | 'atencao' | 'excelente';
  tendencia_media?: 'subindo' | 'estavel' | 'caindo';
  health_score?: number;
  health_status?: 'critico' | 'atencao' | 'saudavel';
  fator_demanda_ponderado?: number; // V2: Fator de demanda ponderado pela carteira
}

interface Meta {
  id: string;
  tipo: string;
  valor_atual: number;
  valor_meta: number;
  data_inicio: string;
  data_fim: string | null;
  status: string;
}

interface Acao {
  id: string;
  tipo: string;
  titulo: string;
  data_agendada: string;
  status: string;
}

interface Evasao {
  aluno_nome: string;
  data: string;
  motivo: string;
  curso: string;
}

interface InsightsIA {
  resumo: string;
  pontos_fortes: string[];
  pontos_atencao: { metrica: string; valor_atual: string; meta: string; tendencia: string; impacto: string }[];
  sugestoes: { titulo: string; descricao: string; tipo: string; impacto_esperado: string; prazo_sugerido: string; prioridade: string }[];
  proximos_passos: string;
  mensagem_motivacional: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  professor: ProfessorPerformance | null;
  competencia: string;
  onNovaMeta: (professorId: number) => void;
  onNovaAcao: (professorId: number) => void;
  healthWeights?: typeof DEFAULT_HEALTH_WEIGHTS;
}

export function ModalDetalhesProfessorPerformance({ open, onClose, professor, competencia, onNovaMeta, onNovaAcao, healthWeights }: Props) {
  const [metas, setMetas] = useState<Meta[]>([]);
  const [acoes, setAcoes] = useState<Acao[]>([]);
  const [evasoes, setEvasoes] = useState<Evasao[]>([]);
  const [insights, setInsights] = useState<InsightsIA | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [loading, setLoading] = useState(false);
  const [relatorioTexto, setRelatorioTexto] = useState('');
  const [loadingRelatorio, setLoadingRelatorio] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // Limpar estados quando o professor muda para evitar dados de outro professor
  useEffect(() => {
    if (professor) {
      setRelatorioTexto('');
      setInsights(null);
      setCopiado(false);
    }
  }, [professor?.id]);

  useEffect(() => {
    if (open && professor) {
      carregarDados();
    }
  }, [open, professor]);

  const carregarDados = async () => {
    if (!professor) return;
    setLoading(true);

    try {
      // Carregar metas do professor
      const { data: metasData } = await supabase
        .from('professor_metas')
        .select('*')
        .eq('professor_id', professor.id)
        .order('created_at', { ascending: false });

      setMetas(metasData || []);

      // Carregar ações do professor
      const { data: acoesData } = await supabase
        .from('professor_acoes')
        .select('*')
        .eq('professor_id', professor.id)
        .order('data_agendada', { ascending: false })
        .limit(10);

      setAcoes(acoesData || []);

      // Carregar evasões recentes
      const inicioMes = `${competencia}-01`;
      const { data: evasoesData } = await supabase
        .from('movimentacoes_admin')
        .select('aluno_nome, data, motivo, cursos(nome)')
        .eq('professor_id', professor.id)
        .in('tipo', ['evasao', 'cancelamento'])
        .gte('data', inicioMes)
        .limit(5);

      const evasoesFormatadas: Evasao[] = (evasoesData || []).map((e: any) => ({
        aluno_nome: e.aluno_nome || 'Aluno',
        data: e.data,
        motivo: e.motivo || 'Não informado',
        curso: e.cursos?.nome || ''
      }));

      setEvasoes(evasoesFormatadas);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const gerarInsightsIA = async () => {
    if (!professor) return;
    setLoadingInsights(true);
    setInsights(null);

    // Calcular Health Score V2 para enviar à IA
    const healthScoreAtual = calcularHealthScore({
      mediaTurma: professor.media_alunos_turma,
      retencao: professor.taxa_retencao,
      conversao: professor.taxa_conversao,
      presenca: professor.taxa_presenca,
      evasoes: professor.evasoes_mes,
      taxaCrescimentoAjustada: 0, // TODO: buscar da view quando disponível
      taxaEvasao: professor.total_alunos > 0 ? (professor.evasoes_mes / professor.total_alunos) * 100 : 0,
      carteiraAlunos: professor.total_alunos
    }, healthWeights);

    const payload = {
      professor: {
        id: professor.id,
        nome: professor.nome,
        especialidades: professor.especialidades,
        unidades: professor.unidades.map(u => u.codigo),
        data_admissao: '2020-01-01',
        tipo_contrato: 'PJ'
      },
      metricas_atuais: {
        total_alunos: professor.total_alunos,
        total_turmas: professor.total_turmas,
        media_alunos_turma: professor.media_alunos_turma,
        taxa_retencao: professor.taxa_retencao,
        taxa_conversao: professor.taxa_conversao,
        taxa_presenca: professor.taxa_presenca,
        evasoes_mes: professor.evasoes_mes,
        fator_demanda_ponderado: professor.fator_demanda_ponderado || 1.0
      },
      health_score: {
        score: healthScoreAtual.score,
        status: healthScoreAtual.status,
        detalhes: healthScoreAtual.detalhes
      },
      historico: [],
      evasoes_recentes: evasoes.map(e => ({
        aluno_nome: e.aluno_nome,
        data: e.data,
        motivo: e.motivo,
        curso: e.curso
      })),
      metas_ativas: metas.filter(m => m.status === 'em_andamento').map(m => ({
        id: m.id,
        tipo: m.tipo,
        valor_atual: m.valor_atual,
        valor_meta: m.valor_meta,
        prazo: m.data_fim || 'Contínua',
        status: m.status
      })),
      acoes_recentes: acoes.slice(0, 5).map(a => ({
        tipo: a.tipo,
        titulo: a.titulo,
        data: format(new Date(a.data_agendada), 'dd/MM/yyyy'),
        status: a.status
      })),
      alunos_solo: [],
      competencia
    };

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-insights-professor`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Erro HTTP:', response.status, response.statusText);
        console.error('📄 Resposta:', errorText);
        throw new Error(`Erro ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log('✅ Insights gerados com sucesso:', data);
      setInsights(data);
    } catch (error) {
      console.error('❌ Erro ao gerar insights:', error);
      console.error('📦 Payload enviado:', JSON.stringify(payload, null, 2));
      setInsights({
        resumo: 'Não foi possível gerar insights no momento. Tente novamente.',
        pontos_fortes: [],
        pontos_atencao: [],
        sugestoes: [],
        proximos_passos: 'Verifique a conexão e tente novamente.',
        mensagem_motivacional: 'Continue focado no desenvolvimento contínuo!'
      });
    } finally {
      setLoadingInsights(false);
    }
  };

  const gerarRelatorioIndividual = async () => {
    if (!professor) return;
    setLoadingRelatorio(true);
    setRelatorioTexto('');

    try {
      // Usar Health Score já calculado do professor (para consistência com o modal)
      const healthScoreAtual = professor.health_score !== undefined && professor.health_status
        ? { score: professor.health_score, status: professor.health_status }
        : calcularHealthScore({
            mediaTurma: professor.media_alunos_turma,
            retencao: professor.taxa_retencao,
            conversao: professor.taxa_conversao,
            presenca: professor.taxa_presenca,
            evasoes: professor.evasoes_mes,
            taxaCrescimentoAjustada: 0,
            taxaEvasao: professor.total_alunos > 0 ? (professor.evasoes_mes / professor.total_alunos) * 100 : 0,
            carteiraAlunos: professor.total_alunos
          }, healthWeights);

      const { data: responseIA, error: errorIA } = await supabase.functions.invoke(
        'gemini-relatorio-professor-individual',
        {
          body: {
            professor: {
              id: professor.id,
              nome: professor.nome,
              especialidades: professor.especialidades,
              total_alunos: professor.total_alunos,
              total_turmas: professor.total_turmas,
              media_alunos_turma: professor.media_alunos_turma,
              taxa_retencao: professor.taxa_retencao,
              taxa_conversao: professor.taxa_conversao,
              taxa_presenca: professor.taxa_presenca,
              evasoes_mes: professor.evasoes_mes,
              health_score: healthScoreAtual.score,
              health_status: healthScoreAtual.status,
              fator_demanda_ponderado: professor.fator_demanda_ponderado || 1.0
            },
            metas: metas,
            acoes: acoes,
            evasoes_recentes: evasoes,
            competencia: competencia,
            unidade_nome: professor.unidades?.[0]?.nome
          }
        }
      );

      if (errorIA) throw errorIA;

      if (responseIA?.success && responseIA?.relatorio) {
        setRelatorioTexto(responseIA.relatorio);
      } else {
        throw new Error(responseIA?.error || 'Erro ao gerar relatório');
      }
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      setRelatorioTexto('Erro ao gerar relatório. Tente novamente.');
    } finally {
      setLoadingRelatorio(false);
    }
  };

  const copiarRelatorio = async () => {
    if (!relatorioTexto) return;

    try {
      // Tentar Clipboard API primeiro (método moderno)
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(relatorioTexto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
        return;
      }
      
      // Fallback: execCommand com textarea
      const textarea = document.createElement('textarea');
      textarea.value = relatorioTexto;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      textarea.setAttribute('readonly', '');
      document.body.appendChild(textarea);
      
      textarea.focus();
      textarea.select();
      
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      
      if (success) {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      } else {
        throw new Error('execCommand falhou');
      }
    } catch (error) {
      console.error('Erro ao copiar:', error);
      // Fallback final: selecionar o texto do textarea visível
      const textareaEl = document.querySelector('textarea[value="' + CSS.escape(relatorioTexto.substring(0, 50)) + '"], textarea');
      if (textareaEl) {
        (textareaEl as HTMLTextAreaElement).select();
        alert('Texto selecionado. Use Ctrl+C para copiar.');
      }
    }
  };

  // Usar Health Score já calculado na lista (para evitar divergências por arredondamento)
  const healthScore = useMemo(() => {
    if (!professor) return { score: 0, status: 'critico' as const, detalhes: [] };
    
    // Se o professor já tem health_score calculado, usar esse valor
    if (professor.health_score !== undefined && professor.health_status) {
      return {
        score: professor.health_score,
        status: professor.health_status,
        detalhes: []
      };
    }
    
    // Fallback: calcular se não tiver (V2)
    return calcularHealthScore({
      mediaTurma: professor.media_alunos_turma,
      retencao: professor.taxa_retencao,
      conversao: professor.taxa_conversao,
      presenca: professor.taxa_presenca,
      evasoes: professor.evasoes_mes,
      taxaCrescimentoAjustada: 0,
      taxaEvasao: professor.total_alunos > 0 ? (professor.evasoes_mes / professor.total_alunos) * 100 : 0,
      carteiraAlunos: professor.total_alunos
    }, healthWeights);
  }, [professor, healthWeights]);

  if (!professor) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critico': return 'text-red-400 bg-red-500/20';
      case 'atencao': return 'text-yellow-400 bg-yellow-500/20';
      case 'excelente': return 'text-green-400 bg-green-500/20';
      default: return 'text-slate-400 bg-slate-500/20';
    }
  };

  const getGradientByStatus = (status: string) => {
    switch (status) {
      case 'critico': return 'from-red-400 to-red-600';
      case 'atencao': return 'from-yellow-400 to-orange-500';
      case 'excelente': return 'from-green-400 to-emerald-600';
      default: return 'from-slate-400 to-slate-600';
    }
  };

  const getIniciais = (nome: string) => {
    return nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  };

  const getMetricaColor = (valor: number, limites: { critico: number; atencao: number }) => {
    if (valor < limites.critico) return 'text-red-400';
    if (valor < limites.atencao) return 'text-yellow-400';
    return 'text-green-400';
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-700">
        {/* Header */}
        <DialogHeader className="border-b border-slate-700 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${getGradientByStatus(professor.status)} flex items-center justify-center text-white font-bold text-xl`}>
                {professor.foto_url ? (
                  <img src={professor.foto_url} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  getIniciais(professor.nome)
                )}
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-white">{professor.nome}</DialogTitle>
                <p className="text-slate-400 text-sm">
                  {professor.especialidades.join(', ')} • {professor.unidades.map(u => u.codigo).join(' | ')}
                </p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(professor.status)}`}>
              {professor.status === 'critico' ? '⚠️ Crítico' : professor.status === 'atencao' ? '⚠️ Atenção' : '✅ Excelente'}
            </span>
          </div>
        </DialogHeader>

        {/* Métricas Atuais + Health Score com Gauge */}
        <div className="py-4 border-b border-slate-700">
          <h3 className="text-sm font-medium text-slate-400 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Métricas Atuais ({format(new Date(competencia + '-01'), 'MMM/yyyy', { locale: ptBR })})
          </h3>
          
          <div className="flex gap-4 items-center">
            {/* Health Score com Gauge - Destaque à esquerda, proporcionalmente maior */}
            <div className={`bg-slate-800 rounded-xl p-3 border-2 ${
              healthScore.status === 'saudavel' 
                ? 'border-violet-500/50' 
                : healthScore.status === 'atencao'
                ? 'border-amber-500/50'
                : 'border-rose-500/50'
            } flex flex-col items-center justify-center min-w-[130px]`}>
              <div className="flex items-center gap-1.5 mb-1">
                <Heart className={`w-3 h-3 ${
                  healthScore.status === 'saudavel' 
                    ? 'text-violet-400' 
                    : healthScore.status === 'atencao'
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`} />
                <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">
                  Health Score
                </span>
              </div>
              
              {/* GAUGE SVG - menor */}
              <svg width="95" height="60" viewBox="0 0 180 110" className="overflow-visible">
                <defs>
                  <linearGradient id="modalHealthGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#EF4444" />
                    <stop offset="45%" stopColor="#F59E0B" />
                    <stop offset="75%" stopColor="#84CC16" />
                    <stop offset="90%" stopColor="#22C55E" />
                    <stop offset="100%" stopColor="#22C55E" />
                  </linearGradient>
                </defs>
                {/* Arco de Fundo */}
                <path d="M 15 90 A 75 75 0 0 1 165 90" fill="none" stroke="#1e293b" strokeWidth="14" strokeLinecap="round"/>
                {/* Arco Ativo com Gradiente */}
                <path d="M 15 90 A 75 75 0 0 1 165 90" fill="none" stroke="url(#modalHealthGradient)" strokeWidth="14" strokeLinecap="round"/>
                {/* Ponteiro */}
                <g style={{
                  transform: `rotate(${(healthScore.score / 100) * 180 - 90}deg)`,
                  transformOrigin: '90px 90px',
                  transition: 'transform 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)'
                }}>
                  <path d="M 87 90 L 90 30 L 93 90 Z" fill="#94a3b8"/>
                  <circle cx="90" cy="90" r="5" fill="#94a3b8"/>
                  <circle cx="90" cy="90" r="2" fill="white"/>
                </g>
              </svg>
              
              <div className="mt-[-8px] text-center z-10">
                <span className={`text-xl font-black tracking-tighter ${
                  healthScore.status === 'saudavel' 
                    ? 'text-violet-400' 
                    : healthScore.status === 'atencao'
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}>
                  {Math.round(healthScore.score)}
                </span>
                <p className="text-[7px] font-semibold text-slate-500 uppercase tracking-widest">
                  {healthScore.status === 'saudavel' ? 'Saudável' : healthScore.status === 'atencao' ? 'Atenção' : 'Crítico'}
                </p>
              </div>
            </div>

            {/* Métricas em Grid - Cards alinhados no meio */}
            <div className="flex-1 grid grid-cols-2 md:grid-cols-6 gap-3">
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-white">{professor.total_alunos}</p>
                <p className="text-xs text-slate-400">Alunos</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-white">{professor.total_turmas}</p>
                <p className="text-xs text-slate-400">Turmas</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <p className={`text-xl font-bold ${getMetricaColor(professor.media_alunos_turma, { critico: 1.3, atencao: 1.5 })}`}>
                  {professor.media_alunos_turma.toFixed(1)}
                </p>
                <p className="text-xs text-slate-400">Média/Turma</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <p className={`text-xl font-bold ${getMetricaColor(professor.taxa_retencao, { critico: 70, atencao: 95 })}`}>
                  {professor.taxa_retencao.toFixed(0)}%
                </p>
                <p className="text-xs text-slate-400">Retenção</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <p className={`text-xl font-bold ${getMetricaColor(professor.taxa_conversao, { critico: 70, atencao: 90 })}`}>
                  {professor.taxa_conversao.toFixed(0)}%
                </p>
                <p className="text-xs text-slate-400">Conversão</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <p className={`text-xl font-bold ${
                  (professor.fator_demanda_ponderado || 1.0) <= 1.2 
                    ? 'text-emerald-400' 
                    : (professor.fator_demanda_ponderado || 1.0) <= 1.8
                    ? 'text-cyan-400'
                    : (professor.fator_demanda_ponderado || 1.0) <= 2.3
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}>
                  {(professor.fator_demanda_ponderado || 1.0).toFixed(1)}
                </p>
                <p className="text-xs text-slate-400">Fator Demanda</p>
              </div>
            </div>
          </div>

          {/* Botão Relatório Individual - Logo após as métricas */}
          <div className="mt-4">
            <Button
              onClick={gerarRelatorioIndividual}
              disabled={loadingRelatorio}
              className="w-full bg-teal-600 text-white hover:bg-teal-700 transition-colors"
            >
              {loadingRelatorio ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Gerando Relatório...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 mr-2" />
                  Gerar Relatório Individual
                </>
              )}
            </Button>
            <p className="text-xs text-slate-500 mt-1.5 text-center">
              Relatório completo com análise de performance e sugestões
            </p>

            {/* Relatório Individual Gerado - Logo abaixo do botão */}
            {relatorioTexto && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-teal-400" />
                    Relatório Individual
                  </h4>
                  <Button
                    size="sm"
                    onClick={copiarRelatorio}
                    className={copiado ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-teal-600 hover:bg-teal-700'}
                  >
                    {copiado ? (
                      <>
                        <Check className="w-4 h-4 mr-1" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-1" />
                        Copiar
                      </>
                    )}
                  </Button>
                </div>
                <textarea
                  value={relatorioTexto}
                  onChange={(e) => setRelatorioTexto(e.target.value)}
                  className="w-full h-64 p-3 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                />
              </div>
            )}
          </div>
        </div>

        {/* Jornada do Professor (Timeline) */}
        {metas.filter(m => m.status === 'em_andamento').length > 0 && (
          <div className="py-4 border-b border-slate-700">
            <JornadaProfessor
              professorId={professor.id}
              professorNome={professor.nome}
              metaAtiva={metas.find(m => m.status === 'em_andamento')}
              acoes={acoes}
            />
          </div>
        )}

        {/* Metas Ativas */}
        <div className="py-4 border-b border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <Target className="w-4 h-4" />
              Metas Ativas
            </h3>
            <Button variant="ghost" size="sm" className="text-blue-400" onClick={() => onNovaMeta(professor.id)}>
              + Nova Meta
            </Button>
          </div>
          {metas.filter(m => m.status === 'em_andamento').length === 0 ? (
            <p className="text-slate-500 text-sm">Nenhuma meta ativa</p>
          ) : (
            <div className="space-y-3">
              {metas.filter(m => m.status === 'em_andamento').map((meta) => {
                const progresso = meta.valor_meta > 0 ? (meta.valor_atual / meta.valor_meta) * 100 : 0;
                return (
                  <div key={meta.id} className="bg-slate-800/30 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-white font-medium">
                        {meta.tipo.replace('_', ' ')}: {meta.valor_atual} → {meta.valor_meta}
                      </p>
                      <span className="text-yellow-400 text-xs">Em andamento</span>
                    </div>
                    {meta.data_fim && (
                      <p className="text-xs text-slate-400 mb-2">
                        Prazo: {format(new Date(meta.data_fim), 'dd/MM/yyyy')}
                      </p>
                    )}
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(progresso, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Evasões Recentes */}
        {evasoes.length > 0 && (
          <div className="py-4 border-b border-slate-700">
            <h3 className="text-sm font-medium text-slate-400 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              Evasões Recentes
            </h3>
            <div className="space-y-2">
              {evasoes.map((evasao, idx) => (
                <div key={idx} className="flex items-center justify-between bg-red-500/10 rounded-lg px-4 py-2">
                  <div>
                    <p className="text-white text-sm">{evasao.aluno_nome}</p>
                    <p className="text-slate-400 text-xs">
                      {format(new Date(evasao.data), 'dd/MM/yyyy')} • {evasao.motivo}
                    </p>
                  </div>
                  <span className="text-red-400 text-xs">{evasao.curso}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Histórico de Ações */}
        <div className="py-4 border-b border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Histórico de Ações
            </h3>
            <Button variant="ghost" size="sm" className="text-blue-400" onClick={() => onNovaAcao(professor.id)}>
              + Nova Ação
            </Button>
          </div>
          {acoes.length === 0 ? (
            <p className="text-slate-500 text-sm">Nenhuma ação registrada</p>
          ) : (
            <div className="space-y-2">
              {acoes.slice(0, 5).map((acao) => (
                <div key={acao.id} className="flex items-center gap-3">
                  <span className={acao.status === 'concluida' ? 'text-green-400' : acao.status === 'pendente' ? 'text-blue-400' : 'text-slate-400'}>
                    {acao.status === 'concluida' ? '✅' : acao.status === 'pendente' ? '⏳' : '❌'}
                  </span>
                  <p className="text-white text-sm">
                    {format(new Date(acao.data_agendada), 'dd/MM')} - {acao.titulo}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Plano de Ação IA */}
        <div className="py-4">
          <div className="bg-slate-900/50 rounded-2xl border border-slate-700/50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                  <Brain className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    Plano de Ação Inteligente <Sparkles className="w-4 h-4 text-yellow-400" />
                  </h3>
                  <p className="text-sm text-slate-400">Análise estratégica personalizada com IA</p>
                </div>
              </div>
              {!insights && (
                <Button
                  onClick={gerarInsightsIA}
                  disabled={loadingInsights}
                  className="bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:opacity-90 px-6"
                >
                  {loadingInsights ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Gerar Plano
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Conteúdo */}
            <div className="p-6">
              {!insights && !loadingInsights && (
                <div className="text-center py-12">
                  <div className="w-20 h-20 rounded-full bg-slate-800/50 flex items-center justify-center mx-auto mb-4">
                    <Brain className="w-10 h-10 text-purple-400" />
                  </div>
                  <p className="text-slate-400 mb-2">
                    Clique em "Gerar Plano" para receber sugestões personalizadas
                  </p>
                  <p className="text-slate-500 text-sm">
                    Baseado nos seus dados e metas definidas
                  </p>
                </div>
              )}

              {loadingInsights && (
                <div className="text-center py-12">
                  <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4" />
                  <p className="text-slate-400">Analisando dados do professor...</p>
                  <p className="text-slate-500 text-sm mt-1">Isso pode levar alguns segundos</p>
                </div>
              )}

              {insights && (
                <div className="space-y-4">
                  <p className="text-white font-medium">{insights.resumo}</p>

                  {insights.pontos_fortes.length > 0 && (
                    <div>
                      <p className="text-green-400 font-medium text-sm mb-2">✅ PONTOS FORTES:</p>
                      <ul className="text-slate-300 text-sm space-y-1 ml-4">
                        {insights.pontos_fortes.map((ponto, idx) => (
                          <li key={idx}>• {ponto}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {insights.pontos_atencao.length > 0 && (
                    <div>
                      <p className="text-yellow-400 font-medium text-sm mb-2">📌 PONTOS DE ATENÇÃO:</p>
                      <ul className="text-slate-300 text-sm space-y-1 ml-4">
                        {insights.pontos_atencao.map((ponto, idx) => (
                          <li key={idx}>• {ponto.metrica}: {ponto.valor_atual} (meta: {ponto.meta})</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {insights.sugestoes.length > 0 && (
                    <div>
                      <p className="text-blue-400 font-medium text-sm mb-2">💡 SUGESTÕES:</p>
                      <div className="space-y-3">
                        {insights.sugestoes.map((sugestao, idx) => (
                          <div key={idx} className="bg-slate-800/50 rounded-lg p-3">
                            <p className="text-white text-sm font-medium">{idx + 1}. {sugestao.titulo}</p>
                            <p className="text-slate-400 text-xs">{sugestao.descricao}</p>
                            <p className="text-green-400 text-xs">→ {sugestao.impacto_esperado}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {insights.mensagem_motivacional && (
                    <div className="mt-4 p-3 bg-purple-500/10 rounded-lg border border-purple-500/30">
                      <p className="text-purple-300 text-sm italic">💜 {insights.mensagem_motivacional}</p>
                    </div>
                  )}

                  <div className="flex gap-3 mt-4">
                    <Button
                      className="bg-blue-500 text-white hover:bg-blue-600"
                      onClick={() => onNovaAcao(professor.id)}
                    >
                      📅 Agendar Ações
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
