import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  X, Target, Calendar, CheckCircle2, Clock, AlertTriangle,
  TrendingUp, TrendingDown, Sparkles, Loader2, Users, BarChart3, Brain, Heart, FileText, Copy, Check, Music, User, DollarSign
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';

interface AlunoSucesso {
  id: number;
  nome: string;
  unidade_id: string;
  unidade_codigo: string;
  professor_atual_id: number | null;
  professor_nome: string | null;
  curso_id: number | null;
  curso_nome: string | null;
  tempo_permanencia_meses: number | null;
  status_pagamento: string | null;
  valor_parcela: number | null;
  percentual_presenca: number | null;
  data_matricula: string | null;
  dia_aula: string | null;
  horario_aula: string | null;
  modalidade: string | null;
  status: string;
  fase_jornada: string;
  health_score_numerico: number | null;
  health_status: string | null;
  ultimo_feedback: string | null;
  total_acoes: number;
  metas_ativas: number;
}

interface Meta {
  id: string;
  titulo: string;
  descricao: string | null;
  data_inicio: string;
  data_fim: string | null;
  status: string;
}

interface Acao {
  id: string;
  titulo: string;
  descricao: string | null;
  data_agendada: string;
  status: string;
  responsavel: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  aluno: AlunoSucesso | null;
  competencia: string;
}

export function ModalDetalhesSucessoAluno({ open, onClose, aluno, competencia }: Props) {
  const [metas, setMetas] = useState<Meta[]>([]);
  const [acoes, setAcoes] = useState<Acao[]>([]);
  const [insights, setInsights] = useState<any>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [loading, setLoading] = useState(false);
  const [relatorioTexto, setRelatorioTexto] = useState('');
  const [loadingRelatorio, setLoadingRelatorio] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // Limpar estados quando o aluno muda
  useEffect(() => {
    if (aluno) {
      setRelatorioTexto('');
      setInsights(null);
      setCopiado(false);
    }
  }, [aluno?.id]);

  useEffect(() => {
    if (open && aluno) {
      carregarDados();
    }
  }, [open, aluno]);

  const carregarDados = async () => {
    if (!aluno) return;
    setLoading(true);

    try {
      // Carregar metas do aluno
      const { data: metasData } = await supabase
        .from('aluno_metas')
        .select('*')
        .eq('aluno_id', aluno.id)
        .order('created_at', { ascending: false });

      setMetas(metasData || []);

      // Carregar ações do aluno
      const { data: acoesData } = await supabase
        .from('aluno_acoes')
        .select('*')
        .eq('aluno_id', aluno.id)
        .order('data_agendada', { ascending: false })
        .limit(10);

      setAcoes(acoesData || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const gerarInsightsIA = async () => {
    if (!aluno) return;
    setLoadingInsights(true);
    setInsights(null);

    try {
      const { data: responseIA, error: errorIA } = await supabase.functions.invoke(
        'gerar-plano-aluno',
        {
          body: {
            aluno: {
              id: aluno.id,
              nome: aluno.nome,
              curso_nome: aluno.curso_nome,
              professor_nome: aluno.professor_nome,
              unidade_nome: aluno.unidade_codigo,
              health_score_numerico: aluno.health_score_numerico || 0,
              health_status: aluno.health_status,
              percentual_presenca: aluno.percentual_presenca || 0,
              status_pagamento: aluno.status_pagamento,
              tempo_permanencia_meses: aluno.tempo_permanencia_meses || 0,
              fase_jornada: aluno.fase_jornada,
              valor_parcela: aluno.valor_parcela || 0,
              ultimo_feedback: aluno.ultimo_feedback,
              dia_aula: aluno.dia_aula,
              horario_aula: aluno.horario_aula
            },
            metas: metas,
            acoes: acoes,
            competencia: competencia
          }
        }
      );

      if (errorIA) throw errorIA;

      if (responseIA?.success && responseIA?.plano) {
        // Converter formato do plano para o formato esperado pelo componente
        const plano = responseIA.plano;
        setInsights({
          resumo: plano.analise || '',
          pontos_fortes: [],
          pontos_atencao: [],
          sugestoes: plano.acoes?.map((a: any) => ({
            titulo: a.titulo,
            descricao: a.descricao,
            tipo: a.tipo,
            prazo: a.prazo,
            responsavel: a.responsavel
          })) || [],
          proximos_passos: plano.resultado_esperado || '',
          mensagem_motivacional: '',
          prioridade: plano.prioridade
        });
      } else {
        throw new Error('Erro ao gerar plano');
      }
    } catch (error) {
      console.error('Erro ao gerar insights:', error);
      setInsights({
        resumo: 'Não foi possível gerar o plano no momento.',
        pontos_fortes: [],
        pontos_atencao: [],
        sugestoes: [],
        proximos_passos: 'Tente novamente mais tarde.',
        mensagem_motivacional: 'Continue acompanhando o progresso do aluno!'
      });
    } finally {
      setLoadingInsights(false);
    }
  };

  const gerarRelatorioIndividual = async () => {
    if (!aluno) return;
    setLoadingRelatorio(true);
    setRelatorioTexto('');

    try {
      const { data: responseIA, error: errorIA } = await supabase.functions.invoke(
        'gerar-relatorio-aluno',
        {
          body: {
            aluno: {
              id: aluno.id,
              nome: aluno.nome,
              curso_nome: aluno.curso_nome,
              professor_nome: aluno.professor_nome,
              unidade_nome: aluno.unidade_codigo,
              health_score_numerico: aluno.health_score_numerico || 0,
              health_status: aluno.health_status,
              percentual_presenca: aluno.percentual_presenca || 0,
              status_pagamento: aluno.status_pagamento,
              tempo_permanencia_meses: aluno.tempo_permanencia_meses || 0,
              fase_jornada: aluno.fase_jornada,
              valor_parcela: aluno.valor_parcela || 0,
              ultimo_feedback: aluno.ultimo_feedback,
              dia_aula: aluno.dia_aula,
              horario_aula: aluno.horario_aula
            },
            metas: metas,
            acoes: acoes,
            competencia: competencia
          }
        }
      );

      if (errorIA) throw errorIA;

      if (responseIA?.success && responseIA?.relatorio) {
        setRelatorioTexto(responseIA.relatorio);
      } else {
        throw new Error('Erro ao gerar relatório');
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
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(relatorioTexto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
        return;
      }
      
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = relatorioTexto;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      
      if (success) {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }
    } catch (error) {
      console.error('Erro ao copiar:', error);
    }
  };

  if (!aluno) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critico': return 'text-red-400 bg-red-500/20';
      case 'atencao': return 'text-yellow-400 bg-yellow-500/20';
      case 'saudavel': return 'text-green-400 bg-green-500/20';
      default: return 'text-slate-400 bg-slate-500/20';
    }
  };

  const getGradientByStatus = (status: string) => {
    switch (status) {
      case 'critico': return 'from-red-400 to-red-600';
      case 'atencao': return 'from-yellow-400 to-orange-500';
      case 'saudavel': return 'from-green-400 to-emerald-600';
      default: return 'from-slate-400 to-slate-600';
    }
  };

  const getIniciais = (nome: string) => {
    return nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  };

  const getPagamentoColor = (status: string | null) => {
    switch (status) {
      case 'em_dia': return 'text-green-400';
      case 'atrasado': return 'text-yellow-400';
      case 'inadimplente': return 'text-red-400';
      default: return 'text-slate-400';
    }
  };

  const getPagamentoLabel = (status: string | null) => {
    switch (status) {
      case 'em_dia': return 'Em dia';
      case 'atrasado': return 'Atrasado';
      case 'inadimplente': return 'Inadimplente';
      default: return 'N/A';
    }
  };

  const getFaseColor = (fase: string) => {
    switch (fase) {
      case 'onboarding': return 'text-violet-400';
      case 'consolidacao': return 'text-pink-400';
      case 'encantamento': return 'text-amber-400';
      case 'renovacao': return 'text-emerald-400';
      default: return 'text-slate-400';
    }
  };

  const getFaseLabel = (fase: string) => {
    switch (fase) {
      case 'onboarding': return 'Onboarding';
      case 'consolidacao': return 'Consolidação';
      case 'encantamento': return 'Encantamento';
      case 'renovacao': return 'Renovação';
      default: return fase;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-700">
        {/* Header */}
        <DialogHeader className="border-b border-slate-700 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${getGradientByStatus(aluno.health_status || 'atencao')} flex items-center justify-center text-white font-bold text-xl`}>
                {getIniciais(aluno.nome)}
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-white">{aluno.nome}</DialogTitle>
                <p className="text-slate-400 text-sm">
                  {aluno.curso_nome || 'Sem curso'} • {aluno.professor_nome || 'Sem professor'} • {aluno.unidade_codigo}
                </p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(aluno.health_status || 'atencao')}`}>
              {aluno.health_status === 'critico' ? '⚠️ Crítico' : aluno.health_status === 'atencao' ? '⚠️ Atenção' : '✅ Saudável'}
            </span>
          </div>
        </DialogHeader>

        {/* Métricas Atuais + Health Score com Gauge */}
        <div className="py-4 border-b border-slate-700">
          <h3 className="text-sm font-medium text-slate-400 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Métricas Atuais ({format(new Date(), 'MMM/yyyy', { locale: ptBR })})
          </h3>
          
          <div className="flex gap-4 items-center">
            {/* Health Score com Gauge - Destaque à esquerda */}
            <div className={`bg-slate-800 rounded-xl p-3 border-2 ${
              aluno.health_status === 'saudavel' 
                ? 'border-violet-500/50' 
                : aluno.health_status === 'atencao'
                ? 'border-amber-500/50'
                : 'border-rose-500/50'
            } flex flex-col items-center justify-center min-w-[130px]`}>
              <div className="flex items-center gap-1.5 mb-1">
                <Heart className={`w-3 h-3 ${
                  aluno.health_status === 'saudavel' 
                    ? 'text-violet-400' 
                    : aluno.health_status === 'atencao'
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
                  <linearGradient id="modalHealthGradientAluno" x1="0%" y1="0%" x2="100%" y2="0%">
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
                <path d="M 15 90 A 75 75 0 0 1 165 90" fill="none" stroke="url(#modalHealthGradientAluno)" strokeWidth="14" strokeLinecap="round"/>
                {/* Ponteiro */}
                <g style={{
                  transform: `rotate(${(aluno.health_score_numerico || 0) / 100 * 180 - 90}deg)`,
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
                  aluno.health_status === 'saudavel' 
                    ? 'text-violet-400' 
                    : aluno.health_status === 'atencao'
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}>
                  {aluno.health_score_numerico || 0}
                </span>
                <p className="text-[7px] font-semibold text-slate-500 uppercase tracking-widest">
                  {aluno.health_status === 'saudavel' ? 'Saudável' : aluno.health_status === 'atencao' ? 'Atenção' : 'Crítico'}
                </p>
              </div>
            </div>

            {/* Métricas em Grid - 3 colunas x 2 linhas */}
            <div className="flex-1 grid grid-cols-3 gap-3">
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <p className={`text-xl font-bold ${(aluno.percentual_presenca || 0) >= 80 ? 'text-green-400' : (aluno.percentual_presenca || 0) >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {aluno.percentual_presenca ? `${aluno.percentual_presenca.toFixed(0)}%` : '—'}
                </p>
                <p className="text-xs text-slate-400">Presença</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <p className={`text-xl font-bold ${getPagamentoColor(aluno.status_pagamento)}`}>
                  {getPagamentoLabel(aluno.status_pagamento)}
                </p>
                <p className="text-xs text-slate-400">Pagamento</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-white">
                  {aluno.tempo_permanencia_meses ? `${aluno.tempo_permanencia_meses}m` : '—'}
                </p>
                <p className="text-xs text-slate-400">Tempo Casa</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <p className={`text-xl font-bold ${getFaseColor(aluno.fase_jornada)}`}>
                  {getFaseLabel(aluno.fase_jornada)}
                </p>
                <p className="text-xs text-slate-400">Fase</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-white">
                  {aluno.ultimo_feedback === 'verde' ? '💚' : aluno.ultimo_feedback === 'amarelo' ? '💛' : aluno.ultimo_feedback === 'vermelho' ? '❤️' : '—'}
                </p>
                <p className="text-xs text-slate-400">Feedback</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-white">
                  {aluno.valor_parcela ? `R$ ${aluno.valor_parcela}` : '—'}
                </p>
                <p className="text-xs text-slate-400">Parcela</p>
              </div>
            </div>
          </div>

          {/* Botão Relatório Individual */}
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
              Relatório completo com análise e sugestões
            </p>

            {/* Relatório Individual Gerado */}
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
                  className="w-full h-48 p-3 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                />
              </div>
            )}
          </div>
        </div>

        {/* Metas Ativas */}
        <div className="py-4 border-b border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <Target className="w-4 h-4" />
              Metas Ativas
            </h3>
            <Button variant="ghost" size="sm" className="text-blue-400">
              + Nova Meta
            </Button>
          </div>
          {metas.filter(m => m.status === 'ativa').length === 0 ? (
            <p className="text-slate-500 text-sm">Nenhuma meta ativa</p>
          ) : (
            <div className="space-y-3">
              {metas.filter(m => m.status === 'ativa').map((meta) => (
                <div key={meta.id} className="bg-slate-800/30 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-white font-medium">{meta.titulo}</p>
                    <span className="text-blue-400 text-xs">Ativa</span>
                  </div>
                  {meta.descricao && (
                    <p className="text-slate-400 text-xs mt-1">{meta.descricao}</p>
                  )}
                  {meta.data_fim && (
                    <p className="text-xs text-slate-500 mt-2">
                      Prazo: {format(new Date(meta.data_fim), 'dd/MM/yyyy')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Histórico de Ações */}
        <div className="py-4 border-b border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Histórico de Ações
            </h3>
            <Button variant="ghost" size="sm" className="text-blue-400">
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
                    Baseado nos dados do aluno e metas definidas
                  </p>
                </div>
              )}

              {loadingInsights && (
                <div className="text-center py-12">
                  <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4" />
                  <p className="text-slate-400">Analisando dados do aluno...</p>
                  <p className="text-slate-500 text-sm mt-1">Isso pode levar alguns segundos</p>
                </div>
              )}

              {insights && (
                <div className="space-y-4">
                  <p className="text-white font-medium">{insights.resumo}</p>

                  {insights.pontos_fortes?.length > 0 && (
                    <div>
                      <p className="text-green-400 font-medium text-sm mb-2">✅ PONTOS FORTES:</p>
                      <ul className="text-slate-300 text-sm space-y-1 ml-4">
                        {insights.pontos_fortes.map((ponto: string, idx: number) => (
                          <li key={idx}>• {ponto}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {insights.pontos_atencao?.length > 0 && (
                    <div>
                      <p className="text-yellow-400 font-medium text-sm mb-2">📌 PONTOS DE ATENÇÃO:</p>
                      <ul className="text-slate-300 text-sm space-y-1 ml-4">
                        {insights.pontos_atencao.map((ponto: any, idx: number) => (
                          <li key={idx}>• {ponto.metrica}: {ponto.valor_atual} (meta: {ponto.meta})</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {insights.sugestoes?.length > 0 && (
                    <div>
                      <p className="text-blue-400 font-medium text-sm mb-2">💡 SUGESTÕES:</p>
                      <div className="space-y-3">
                        {insights.sugestoes.map((sugestao: any, idx: number) => (
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
                    >
                      📅 Agendar Ações
                    </Button>
                    <Button
                      variant="outline"
                      className="border-slate-600 text-slate-300 hover:bg-slate-800"
                      onClick={() => setInsights(null)}
                    >
                      🔄 Regenerar
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
